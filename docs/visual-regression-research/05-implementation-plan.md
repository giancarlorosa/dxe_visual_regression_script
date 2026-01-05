# Implementation Plan: Tile-Based Screenshots

## Configuration Decisions

Based on research and discussion:
- **Tile height**: Use viewport height from config (e.g., 1080px from 1920x1080)
- **Trigger**: `full_page: true` in viewport config enables tiling
- **Last tile**: Pad to full height for consistent dimensions
- **Compatibility**: Keep existing mode as fallback
- **Reporting**: Per-tile results showing which tiles failed

## Files to Modify

| File | Changes |
|------|---------|
| `src/types/index.ts` | Add `TileResult`, `TiledTestResult` interfaces |
| `src/services/screenshot.ts` | Add `captureTiledScreenshots()` method |
| `src/services/comparison.ts` | Add tile comparison methods |
| `src/commands/generate-baseline.ts` | Integrate tiled capture |
| `src/commands/run-tests.ts` | Integrate tiled comparison + reporting |

## Step-by-Step Implementation

### Step 1: Update Types

**File:** `src/types/index.ts`

```typescript
export interface TileResult {
  tileIndex: number;
  passed: boolean;
  diffPixels?: number;
  diffPercentage?: number;
  screenshotPath: string;
  baselinePath: string;
  diffPath?: string;
  error?: string;
}

export interface TiledTestResult extends TestResult {
  tiled: boolean;
  tileCount?: number;
  tiles?: TileResult[];
}
```

### Step 2: Update Screenshot Service

**File:** `src/services/screenshot.ts`

Add method:

```typescript
async captureTiledScreenshots(
  scenario: Scenario,
  viewport: Viewport,
  outputDir: string
): Promise<string[]> {
  if (!this.browser) {
    throw new Error('Browser not initialized');
  }

  this.ensureDirectoryExists(outputDir);

  const context = await this.browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.device_scale_factor,
  });

  const page = await context.newPage();
  const tiles: string[] = [];

  try {
    page.setDefaultTimeout(this.config.playwright.timeout);
    await page.goto(scenario.url, { waitUntil: 'networkidle' });

    if (scenario.wait_time_ms > 0) {
      await page.waitForTimeout(scenario.wait_time_ms);
    }

    // Execute interactions if needed
    if (scenario.mode === 'interactive' && scenario.interactions.length > 0) {
      await this.executeInteractions(page, scenario.interactions);
    }

    // Get full page height
    const fullHeight = await page.evaluate(() => document.body.scrollHeight);
    const tileHeight = viewport.height;
    const tileCount = Math.ceil(fullHeight / tileHeight);

    for (let i = 0; i < tileCount; i++) {
      const scrollY = i * tileHeight;
      await page.evaluate((y) => window.scrollTo(0, y), scrollY);
      await page.waitForTimeout(100);  // Allow render

      const filename = this.generateTileFilename(scenario.id, viewport.machine_name, i);
      const tilePath = path.join(outputDir, filename);

      await page.screenshot({
        path: tilePath,
        fullPage: false,
        clip: { x: 0, y: 0, width: viewport.width, height: tileHeight },
      });

      tiles.push(tilePath);
    }

    return tiles;
  } finally {
    await context.close();
  }
}

generateTileFilename(scenarioId: string, viewportKey: string, tileIndex: number): string {
  const safeId = scenarioId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeViewport = viewportKey.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${safeId}__${safeViewport}__tile${tileIndex}.png`;
}
```

### Step 3: Update Comparison Service

**File:** `src/services/comparison.ts`

Add methods:

```typescript
async compareTile(
  scenarioId: string,
  viewportKey: string,
  tileIndex: number,
  screenshotPath: string
): Promise<TileResult> {
  const filename = `${scenarioId}__${viewportKey}__tile${tileIndex}.png`;
  const baselinePath = path.join(this.config.baselineDir, filename);
  const diffPath = path.join(this.config.diffDir, filename);

  if (!fs.existsSync(baselinePath)) {
    return {
      tileIndex,
      passed: false,
      error: 'Baseline not found',
      screenshotPath,
      baselinePath,
    };
  }

  try {
    const result = await this.compare(baselinePath, screenshotPath, diffPath);
    return {
      tileIndex,
      passed: result.passed,
      diffPixels: result.diffPixels,
      diffPercentage: result.diffPercentage,
      screenshotPath,
      baselinePath,
      diffPath: result.diffPath,
    };
  } catch (error) {
    return {
      tileIndex,
      passed: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      screenshotPath,
      baselinePath,
    };
  }
}

async compareTiledScreenshot(
  scenarioId: string,
  scenarioTitle: string,
  viewportKey: string,
  screenshotPaths: string[]
): Promise<TiledTestResult> {
  const tiles: TileResult[] = [];

  for (let i = 0; i < screenshotPaths.length; i++) {
    const tileResult = await this.compareTile(
      scenarioId,
      viewportKey,
      i,
      screenshotPaths[i]
    );
    tiles.push(tileResult);
  }

  const allPassed = tiles.every(t => t.passed);

  return {
    scenarioId,
    scenarioTitle,
    viewport: viewportKey,
    passed: allPassed,
    tiled: true,
    tileCount: tiles.length,
    tiles,
  };
}

tiledBaselineExists(scenarioId: string, viewportKey: string): number {
  // Returns count of existing tile baselines, 0 if none
  let count = 0;
  while (true) {
    const filename = `${scenarioId}__${viewportKey}__tile${count}.png`;
    const baselinePath = path.join(this.config.baselineDir, filename);
    if (!fs.existsSync(baselinePath)) break;
    count++;
  }
  return count;
}

copyTilesToBaseline(screenshotPaths: string[], scenarioId: string, viewportKey: string): string[] {
  this.ensureDirectoryExists(this.config.baselineDir);
  const baselinePaths: string[] = [];

  for (let i = 0; i < screenshotPaths.length; i++) {
    const filename = `${scenarioId}__${viewportKey}__tile${i}.png`;
    const baselinePath = path.join(this.config.baselineDir, filename);
    fs.copyFileSync(screenshotPaths[i], baselinePath);
    baselinePaths.push(baselinePath);
  }

  return baselinePaths;
}
```

### Step 4: Update Generate Baseline Command

**File:** `src/commands/generate-baseline.ts`

Modify capture logic:

```typescript
// In the capture loop
if (viewport.full_page) {
  // Check if page needs tiling
  const pageHeight = await getPageHeight(page);  // Need page context

  if (pageHeight > viewport.height) {
    // Use tiled capture
    const tilePaths = await screenshotService.captureTiledScreenshots(
      scenario,
      viewport,
      config.baselineDir  // Save directly to baseline
    );
    // Report tile count
    console.log(`  Captured ${tilePaths.length} tiles`);
  } else {
    // Page fits in viewport, use single screenshot
    await screenshotService.captureScreenshot(scenario, viewport, config.baselineDir);
  }
} else {
  // Current behavior
  await screenshotService.captureScreenshot(scenario, viewport, config.baselineDir);
}
```

### Step 5: Update Run Tests Command

**File:** `src/commands/run-tests.ts`

Update comparison logic and result printing:

```typescript
// In test loop - check for tiled testing
if (viewport.full_page) {
  const existingTileCount = comparisonService.tiledBaselineExists(scenario.id, viewportKey);

  if (existingTileCount > 0) {
    // Tiled comparison
    const tilePaths = await screenshotService.captureTiledScreenshots(
      scenario,
      viewport,
      config.outputDir
    );

    const tiledResult = await comparisonService.compareTiledScreenshot(
      scenario.id,
      scenario.title,
      viewportKey,
      tilePaths
    );

    results.push(tiledResult);
  } else {
    // Fall back to single screenshot or report missing baseline
  }
}

// Update printResults function
function printResults(results: (TestResult | TiledTestResult)[], summary: TestRunSummary): void {
  for (const result of results) {
    const status = result.passed ? chalk.green('PASS') : chalk.red('FAIL');
    const testName = `${result.scenarioTitle} @ ${result.viewport}`;

    if ('tiled' in result && result.tiled && result.tiles) {
      console.log(`  ${status} ${testName} (${result.tileCount} tiles)`);

      for (const tile of result.tiles) {
        const tileStatus = tile.passed ? chalk.green('PASS') : chalk.red('FAIL');
        console.log(`       Tile ${tile.tileIndex}: ${tileStatus}`);

        if (!tile.passed) {
          if (tile.error) {
            console.log(`         Error: ${tile.error}`);
          } else if (tile.diffPixels !== undefined) {
            console.log(`         Diff: ${tile.diffPixels} pixels (${tile.diffPercentage?.toFixed(2)}%)`);
            if (tile.diffPath) {
              console.log(`         Diff image: ${tile.diffPath}`);
            }
          }
        }
      }
    } else {
      // Existing single-screenshot result printing
    }
  }
}
```

## Implementation Order

1. **Types** (5 min) - Add new interfaces
2. **Screenshot Service** (30 min) - Add tiled capture
3. **Comparison Service** (30 min) - Add tile comparison
4. **Generate Baseline** (20 min) - Integrate tiled capture
5. **Run Tests** (30 min) - Integrate comparison + reporting
6. **Testing** (60 min) - Verify with real scenarios

**Estimated total:** 3-4 hours

## Testing Strategy

1. Create test page with known height (e.g., 3000px)
2. Generate tiled baseline
3. Verify tile count and dimensions
4. Run comparison - should pass
5. Modify page slightly - verify correct tile fails
6. Test edge cases: short pages, exact multiples, lazy content
