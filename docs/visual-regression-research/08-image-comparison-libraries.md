# Image Comparison Libraries Analysis

## Research Date

January 2025

## Overview

This document analyzes image comparison libraries for visual regression testing, focusing on how each handles dimension mismatches and their suitability for our use case.

---

## Library Comparison Matrix

| Library | Dimension Handling | Performance | Accuracy | Anti-aliasing | Best For |
|---------|-------------------|-------------|----------|---------------|----------|
| **Pixelmatch** | FAILS on mismatch | Fast | Good | Yes | Exact matching |
| **ODiff** | Configurable | 6-7x faster | Excellent | Yes | Visual regression |
| **Looks-Same** | Requires same dims | Moderate | Good | Configurable | Tolerance-based |
| **Resemble.js** | Requires same dims | Slow | Moderate | Yes | Browser-based |
| **SSIM** | N/A (structural) | Slow | Perceptual | N/A | Quality metrics |

---

## Pixelmatch (Current)

### Overview
- **npm**: `pixelmatch`
- **Used by**: Playwright's `toHaveScreenshot()`, Jest-image-snapshot
- **Algorithm**: Pixel-by-pixel comparison with YIQ color difference

### Dimension Handling
```javascript
// FAILS if dimensions don't match - no workaround
const diffPixels = pixelmatch(img1, img2, diff, width, height, options);
// Throws error or produces garbage if dimensions differ
```

### Configuration
```javascript
pixelmatch(img1, img2, output, width, height, {
  threshold: 0.1,        // Color difference threshold (0-1)
  includeAA: false,      // Include anti-aliased pixels
  alpha: 0.1,            // Blending factor for unchanged pixels
  aaColor: [255, 255, 0], // Color for anti-aliased pixels
  diffColor: [255, 0, 0], // Color for different pixels
  diffColorAlt: null,     // Alternative diff color
  diffMask: false         // Output only diff pixels
});
```

### Limitations
- **Critical**: Requires identical dimensions - fails before comparison starts
- No built-in dimension tolerance
- Must manually normalize images before comparison

---

## ODiff (Recommended Alternative)

### Overview
- **npm**: `odiff-bin`
- **Used by**: Lost Pixel
- **Algorithm**: YIQ NTSC color space with SIMD optimization
- **Implementation**: Zig with SSE2/AVX2/AVX512/NEON support

### Dimension Handling
```javascript
const { compare } = require("odiff-bin");

const result = await compare("baseline.png", "current.png", "diff.png", {
  failOnLayoutDiff: false,  // KEY: Don't fail on dimension differences
  threshold: 0.05,
  antialiasing: true,
  ignoreRegions: [
    { x1: 0, y1: 0, x2: 100, y2: 50 }
  ],
  diffColor: "#ff0000",
  captureDiffLines: true
});

// Result types:
// { match: true }
// { match: false, reason: "layout-diff" }
// { match: false, reason: "pixel-diff", diffPercentage: 0.5, diffCount: 1250 }
```

### Performance Benchmarks

| Image Size | Pixelmatch | ODiff | Improvement |
|------------|------------|-------|-------------|
| Cypress.io homepage | 7.7s | 4.2s | 1.8x faster |
| 8K image | 10.6s | 1.95s | 5.4x faster |
| Standard screenshot | ~500ms | ~80ms | 6.2x faster |

### Key Features
- **failOnLayoutDiff**: Explicit control over dimension mismatch behavior
- **YIQ Color Space**: Better perceptual accuracy
- **Anti-aliasing Detection**: Built-in, reduces font rendering false positives
- **Region Ignoring**: Mask dynamic content
- **Line Tracking**: Know exactly which lines differ

### Integration Example
```typescript
import { compare } from 'odiff-bin';

async function compareImages(baselinePath: string, screenshotPath: string, diffPath: string) {
  const result = await compare(baselinePath, screenshotPath, diffPath, {
    failOnLayoutDiff: false,
    threshold: 0.001,
    antialiasing: true,
  });

  if (result.match) {
    return { passed: true, diffPixels: 0, diffPercentage: 0 };
  }

  if (result.reason === 'layout-diff') {
    // Dimensions differ - log warning but don't fail
    return {
      passed: true,
      diffPixels: 0,
      diffPercentage: 0,
      warning: 'dimension-mismatch'
    };
  }

  return {
    passed: false,
    diffPixels: result.diffCount,
    diffPercentage: result.diffPercentage,
    diffPath,
  };
}
```

---

## Looks-Same

### Overview
- **npm**: `looks-same`
- **Used by**: Gemini testing framework (Yandex)
- **Algorithm**: Delta E color difference with configurable tolerance

### Dimension Handling
```javascript
const looksSame = require('looks-same');

// Requires same dimensions - but has tolerance for color differences
looksSame('baseline.png', 'current.png', {
  tolerance: 2.3,  // Delta E threshold (2.3 = imperceptible to humans)
  antialiasingTolerance: 4,
  ignoreCaret: true,
  ignoreAntialiasing: true,
}, (error, { equal }) => {
  console.log(equal ? 'Images match' : 'Images differ');
});
```

### Features
- **Tolerance**: Delta E based (color science grounded)
- **Anti-aliasing**: Configurable tolerance
- **Clustering**: Groups nearby differences
- **Pixel Ratio**: Handles device pixel ratio variations

### Limitations
- Still requires same dimensions for core comparison
- Slower than ODiff
- Less flexible dimension handling

---

## Resemble.js

### Overview
- **npm**: `resemblejs`
- **Used by**: BackstopJS
- **Algorithm**: Canvas-based pixel comparison

### Dimension Handling
```javascript
const resemble = require('resemblejs');

resemble('baseline.png')
  .compareTo('current.png')
  .ignoreColors()
  .ignoreAntialiasing()
  .onComplete((data) => {
    console.log(data.misMatchPercentage);
    console.log(data.isSameDimensions);  // Boolean check
    console.log(data.dimensionDifference);  // { width: 0, height: 2 }
  });
```

### Features
- **misMatchPercentage**: Overall difference percentage
- **isSameDimensions**: Explicit dimension check
- **Multiple ignore modes**: Colors, antialiasing, etc.

### Limitations
- **Critical**: Skips pixels on images > 1200px for performance
- Slower than native solutions
- Less accurate on large full-page screenshots
- Requires same dimensions for meaningful comparison

---

## SSIM (Structural Similarity Index)

### Overview
- **npm**: `ssim.js`
- **Algorithm**: Structural similarity based on luminance, contrast, structure

### How It Works
```javascript
const { ssim } = require('ssim.js');

const result = ssim(imageData1, imageData2);
// Returns: { mssim: 0.98, ssim_map: [...] }
// mssim: 1.0 = identical, 0 = completely different
```

### Features
- **Perceptual**: Based on human visual perception research
- **Structural**: Considers relationships between pixels, not just values
- **Quality metric**: Originally designed for image quality assessment

### Limitations
- Gives overall score, not pixel-level differences
- Computationally expensive
- Not designed for visual regression testing
- Requires same dimensions

---

## Image Normalization Approach

If using Pixelmatch, normalize dimensions before comparison:

```typescript
import sharp from 'sharp';
import Pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

async function normalizeAndCompare(baselinePath: string, screenshotPath: string) {
  const baselineMeta = await sharp(baselinePath).metadata();
  const screenshotMeta = await sharp(screenshotPath).metadata();

  // Find max dimensions
  const maxWidth = Math.max(baselineMeta.width!, screenshotMeta.width!);
  const maxHeight = Math.max(baselineMeta.height!, screenshotMeta.height!);

  // Extend both images to same size (pad with white)
  const normalizedBaseline = await sharp(baselinePath)
    .extend({
      right: maxWidth - baselineMeta.width!,
      bottom: maxHeight - baselineMeta.height!,
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const normalizedScreenshot = await sharp(screenshotPath)
    .extend({
      right: maxWidth - screenshotMeta.width!,
      bottom: maxHeight - screenshotMeta.height!,
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    })
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Now compare with pixelmatch
  const diff = Buffer.alloc(maxWidth * maxHeight * 4);
  const diffPixels = Pixelmatch(
    normalizedBaseline.data,
    normalizedScreenshot.data,
    diff,
    maxWidth,
    maxHeight,
    { threshold: 0.1 }
  );

  return {
    diffPixels,
    diffPercentage: (diffPixels / (maxWidth * maxHeight)) * 100,
    dimensionsDiffered: baselineMeta.height !== screenshotMeta.height
  };
}
```

---

## Recommendation

### For Our Use Case (440 tests, full-page screenshots, 1-2px height variance)

**Primary Recommendation: ODiff**

```bash
npm install odiff-bin
```

Reasons:
1. Explicit `failOnLayoutDiff` option handles dimension mismatches
2. 6-7x faster than Pixelmatch
3. Better anti-aliasing detection
4. YIQ color space for perceptual accuracy
5. Can still generate diff images

**Alternative: Image Normalization with Pixelmatch**

If ODiff integration is not feasible:
1. Use Sharp to normalize dimensions before comparison
2. Keep existing Pixelmatch comparison logic
3. Log warnings when dimensions differ

---

## References

- [Pixelmatch GitHub](https://github.com/mapbox/pixelmatch)
- [ODiff GitHub](https://github.com/dmtrKovalenko/odiff)
- [Looks-Same GitHub](https://github.com/gemini-testing/looks-same)
- [Resemble.js GitHub](https://github.com/rsmbl/Resemble.js)
- [SSIM.js GitHub](https://github.com/obartra/ssim)
- [Sharp Documentation](https://sharp.pixelplumbing.com/)
