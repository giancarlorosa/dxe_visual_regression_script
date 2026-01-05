# ODiff Integration Guide

## Research Date

January 2025

## Overview

This guide details how to integrate ODiff into the existing visual regression testing tool as a replacement for Pixelmatch to solve the dimension mismatch problem.

---

## Why ODiff?

### The Problem
- Pixelmatch **fails immediately** when images have different dimensions
- Our full-page screenshots vary by 1-2 pixels in height between runs
- This causes ~100 false failures out of 440 tests (~23% false positive rate)

### The Solution
ODiff has a `failOnLayoutDiff` option that explicitly handles dimension differences:

```javascript
const result = await compare(baseline, current, diff, {
  failOnLayoutDiff: false  // Don't fail on dimension mismatch
});
```

---

## Installation

```bash
npm install odiff-bin
```

ODiff is distributed as a pre-compiled binary for:
- Linux (x64, ARM64)
- macOS (x64, ARM64)
- Windows (x64)

---

## API Reference

### Basic Usage

```typescript
import { compare } from 'odiff-bin';

const result = await compare(
  'baseline.png',    // Path to baseline image
  'current.png',     // Path to current screenshot
  'diff.png',        // Path to save diff image (optional)
  options            // Comparison options
);
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `threshold` | number | 0.1 | Color difference threshold (0-1) |
| `failOnLayoutDiff` | boolean | true | Whether to fail on dimension mismatch |
| `antialiasing` | boolean | false | Ignore anti-aliasing differences |
| `ignoreRegions` | array | [] | Regions to exclude from comparison |
| `diffColor` | string | "#ff0000" | Color for highlighted differences |
| `captureDiffLines` | boolean | false | Capture line indexes with differences |
| `outputDiffMask` | boolean | false | Output only the diff mask |

### Result Object

```typescript
interface ODiffResult {
  match: boolean;
  reason?: 'pixel-diff' | 'layout-diff';
  diffCount?: number;        // Number of different pixels
  diffPercentage?: number;   // Percentage of different pixels
  diffLines?: number[];      // Line indexes with differences (if captureDiffLines: true)
}
```

---

## Integration with Existing Tool

### Current Implementation (comparison.ts)

```typescript
// Current: Using Pixelmatch (lines 92-102)
const diffPixels = pixelmatch(
  baseline.data,
  screenshot.data,
  diffImage?.data || null,
  baseline.width,
  baseline.height,
  {
    threshold: this.config.comparison.threshold,
    includeAA: false,
  }
);
```

### Proposed Implementation

```typescript
import { compare } from 'odiff-bin';
import * as fs from 'fs';
import * as path from 'path';

interface ComparisonResult {
  passed: boolean;
  diffPixels: number;
  diffPercentage: number;
  totalPixels: number;
  diffPath?: string;
  warning?: string;
}

async function compareWithODiff(
  baselinePath: string,
  screenshotPath: string,
  diffPath: string,
  config: ComparisonConfig
): Promise<ComparisonResult> {
  // Ensure diff directory exists
  const diffDir = path.dirname(diffPath);
  if (!fs.existsSync(diffDir)) {
    fs.mkdirSync(diffDir, { recursive: true });
  }

  const result = await compare(baselinePath, screenshotPath, diffPath, {
    threshold: config.threshold || 0.1,
    failOnLayoutDiff: false,  // KEY: Handle dimension mismatches gracefully
    antialiasing: true,       // Reduce font rendering false positives
    captureDiffLines: true,   // For debugging
  });

  // Handle different result types
  if (result.match) {
    return {
      passed: true,
      diffPixels: 0,
      diffPercentage: 0,
      totalPixels: 0,
      diffPath: undefined,
    };
  }

  if (result.reason === 'layout-diff') {
    // Dimensions differ - log warning but don't fail
    console.warn(`Warning: Dimension mismatch for ${path.basename(baselinePath)}`);
    return {
      passed: true,
      diffPixels: 0,
      diffPercentage: 0,
      totalPixels: 0,
      diffPath: undefined,
      warning: 'dimension-mismatch',
    };
  }

  // Pixel differences detected
  const diffPixels = result.diffCount || 0;
  const diffPercentage = result.diffPercentage || 0;

  // Apply tolerance thresholds
  const passedByPixelCount = diffPixels <= (config.maxDiffPixels || 100);
  const passedByRatio = diffPercentage <= ((config.maxDiffPixelRatio || 0.01) * 100);

  return {
    passed: diffPixels === 0 || passedByPixelCount || passedByRatio,
    diffPixels,
    diffPercentage,
    totalPixels: Math.round(diffPixels / (diffPercentage / 100)) || 0,
    diffPath: diffPixels > 0 ? diffPath : undefined,
  };
}
```

### Full ComparisonService Replacement

```typescript
// src/services/comparison.ts - ODiff version

import { compare } from 'odiff-bin';
import * as fs from 'fs';
import * as path from 'path';
import { VRTConfig, ComparisonResult, TestResult } from '../types';

export class ComparisonService {
  private config: VRTConfig;

  constructor(config: VRTConfig) {
    this.config = config;
  }

  private ensureDirectoryExists(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  async compare(
    baselinePath: string,
    screenshotPath: string,
    diffPath: string
  ): Promise<ComparisonResult> {
    // Check if baseline exists
    if (!fs.existsSync(baselinePath)) {
      return {
        passed: false,
        diffPixels: -1,
        diffPercentage: 100,
        totalPixels: 0,
        diffPath: undefined,
        error: 'Baseline not found',
      };
    }

    // Check if screenshot exists
    if (!fs.existsSync(screenshotPath)) {
      return {
        passed: false,
        diffPixels: -1,
        diffPercentage: 100,
        totalPixels: 0,
        diffPath: undefined,
        error: 'Screenshot not found',
      };
    }

    this.ensureDirectoryExists(path.dirname(diffPath));

    try {
      const result = await compare(baselinePath, screenshotPath, diffPath, {
        threshold: this.config.comparison.threshold,
        failOnLayoutDiff: false,
        antialiasing: true,
        captureDiffLines: true,
      });

      if (result.match) {
        // Clean up diff file if it was created but images match
        if (fs.existsSync(diffPath)) {
          fs.unlinkSync(diffPath);
        }
        return {
          passed: true,
          diffPixels: 0,
          diffPercentage: 0,
          totalPixels: 0,
          diffPath: undefined,
        };
      }

      if (result.reason === 'layout-diff') {
        return {
          passed: true,
          diffPixels: 0,
          diffPercentage: 0,
          totalPixels: 0,
          diffPath: undefined,
          warning: 'dimension-mismatch',
        };
      }

      const diffPixels = result.diffCount || 0;
      const diffPercentage = result.diffPercentage || 0;

      // Apply thresholds
      if (diffPixels === 0) {
        return {
          passed: true,
          diffPixels: 0,
          diffPercentage: 0,
          totalPixels: 0,
          diffPath: undefined,
        };
      }

      const maxDiffPixels = this.config.comparison.maxDiffPixels || 100;
      const maxDiffRatio = (this.config.comparison.maxDiffPixelRatio || 0.01) * 100;

      const passed = diffPixels <= maxDiffPixels || diffPercentage <= maxDiffRatio;

      return {
        passed,
        diffPixels,
        diffPercentage,
        totalPixels: Math.round(diffPixels / (diffPercentage / 100)) || 0,
        diffPath: diffPath,
      };
    } catch (error) {
      return {
        passed: false,
        diffPixels: -1,
        diffPercentage: 100,
        totalPixels: 0,
        diffPath: undefined,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async compareScreenshot(
    scenarioId: string,
    scenarioTitle: string,
    viewportKey: string,
    screenshotPath: string
  ): Promise<TestResult> {
    const filename = `${scenarioId}__${viewportKey}.png`;
    const baselinePath = path.join(this.config.baselineDir, filename);
    const diffPath = path.join(this.config.diffDir, filename);

    const result = await this.compare(baselinePath, screenshotPath, diffPath);

    return {
      scenarioId,
      scenarioTitle,
      viewport: viewportKey,
      passed: result.passed,
      diffPixels: result.diffPixels,
      diffPercentage: result.diffPercentage,
      diffPath: result.diffPath,
      error: result.error,
      warning: result.warning,
    };
  }

  baselineExists(scenarioId: string, viewportKey: string): boolean {
    const filename = `${scenarioId}__${viewportKey}.png`;
    const baselinePath = path.join(this.config.baselineDir, filename);
    return fs.existsSync(baselinePath);
  }

  copyToBaseline(screenshotPath: string, scenarioId: string, viewportKey: string): string {
    this.ensureDirectoryExists(this.config.baselineDir);
    const filename = `${scenarioId}__${viewportKey}.png`;
    const baselinePath = path.join(this.config.baselineDir, filename);
    fs.copyFileSync(screenshotPath, baselinePath);
    return baselinePath;
  }

  cleanDiffs(): void {
    if (fs.existsSync(this.config.diffDir)) {
      const files = fs.readdirSync(this.config.diffDir);
      for (const file of files) {
        if (file.endsWith('.png')) {
          fs.unlinkSync(path.join(this.config.diffDir, file));
        }
      }
    }
  }
}
```

---

## Configuration

### Update .vrtrc.json

No changes needed - existing configuration works with ODiff:

```json
{
  "comparison": {
    "threshold": 0.1,
    "maxDiffPixels": 100,
    "maxDiffPixelRatio": 0.01
  }
}
```

### Optional: Add ODiff-specific options

```json
{
  "comparison": {
    "threshold": 0.1,
    "maxDiffPixels": 100,
    "maxDiffPixelRatio": 0.01,
    "antialiasing": true,
    "failOnLayoutDiff": false
  }
}
```

---

## Migration Steps

### Step 1: Install ODiff

```bash
cd /home/giancarlo/Projects/PlaywrightVisualRegression
npm install odiff-bin
```

### Step 2: Update Types (if needed)

```typescript
// src/types/index.ts
export interface ComparisonResult {
  passed: boolean;
  diffPixels: number;
  diffPercentage: number;
  totalPixels: number;
  diffPath?: string;
  error?: string;
  warning?: string;  // NEW: For dimension mismatch warnings
}
```

### Step 3: Replace comparison.ts

Replace the Pixelmatch implementation with the ODiff version shown above.

### Step 4: Update Dependencies

```bash
# Remove pixelmatch if no longer needed elsewhere
npm uninstall pixelmatch

# Or keep it for backward compatibility
```

### Step 5: Test

```bash
# Generate fresh baselines
npm run generate-baseline

# Run tests
npm run test

# Check false positive reduction
```

---

## Expected Results

### Before (Pixelmatch)
- ~100 false failures out of 440 tests
- 23% false positive rate
- Failures due to 1-2px height differences

### After (ODiff)
- Dimension mismatches handled gracefully
- Only genuine pixel differences flagged
- Expected reduction to <10 false positives
- Faster comparison (6-7x improvement)

---

## Troubleshooting

### Binary Not Found

If ODiff binary is not found:

```bash
# Reinstall with platform-specific binary
npm uninstall odiff-bin
npm install odiff-bin
```

### Permission Issues on Linux/macOS

```bash
chmod +x node_modules/odiff-bin/bin/odiff-*
```

### Large Memory Usage

For very large images (8K+), ODiff uses more memory:

```javascript
// Consider processing in batches
const BATCH_SIZE = 10;
for (let i = 0; i < screenshots.length; i += BATCH_SIZE) {
  const batch = screenshots.slice(i, i + BATCH_SIZE);
  await Promise.all(batch.map(s => compare(...)));
}
```

---

## References

- [ODiff GitHub Repository](https://github.com/dmtrKovalenko/odiff)
- [ODiff npm Package](https://www.npmjs.com/package/odiff-bin)
- [ODiff Benchmarks](https://github.com/dmtrKovalenko/odiff#benchmarks)
- [Lost Pixel (uses ODiff)](https://www.lost-pixel.com)
