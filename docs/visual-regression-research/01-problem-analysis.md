# Problem Analysis: Screenshot Dimension Mismatch

## The Core Issue

When comparing full-page screenshots in visual regression testing, we experience **1-2 pixel height differences** between baseline and test screenshots, causing approximately 100 false failures out of 440 tests (~23% false positive rate).

## Technical Root Causes

### 1. Layout Settlement Race Condition (Primary Cause)

Playwright measures page dimensions **before layout fully settles**. The pixel data and page size are captured asynchronously in a "racy manner," causing the image to scale based on incorrect dimensions.

**Evidence from GitHub Issues:**
- Issue #18827: Screenshots showing 208px vs 207px, 444px vs 445px variations
- Issue #20366: Same test producing different heights in Docker vs local

### 2. Pixelmatch Dimension Requirement

Pixelmatch **requires identical dimensions** to compare images. This is by design - the library operates on raw buffers without embedded dimension metadata.

```javascript
// From comparison.ts lines 73-81 - Current behavior
if (baseline.width !== screenshot.width || baseline.height !== screenshot.height) {
  return {
    passed: false,
    diffPixels: -1,
    diffPercentage: 100,  // Fails immediately
  };
}
```

**Key insight:** Our tolerance settings (`maxDiffPixels: 100`) never help because comparison fails before pixelmatch runs.

### 3. CSS `height: 100%` and Viewport Units

CSS styling using `height: 100%` or viewport height (`vh`) units breaks `window.scrollTo()`, which the fullPage screenshot mechanism depends on. The resulting screenshot captures only the viewport height rather than the entire scrollable content.

### 4. Window Resize During Capture

The full-page screenshot feature triggers a **window resize event** (reportedly to 1px dimensions in some cases), creating layout instability between initial measurement and final capture.

### 5. Sub-pixel Rounding Inconsistencies

CSS calculations frequently produce **fractional pixel values** that browsers round differently:
- Some browsers consistently round down
- Others round up
- Some distribute rounding across elements

These decisions accumulate through complex layouts, producing dimension variations.

### 6. Font Rendering Differences

Different platforms use fundamentally different font rendering approaches:

| Platform | Approach | Effect |
|----------|----------|--------|
| Windows (ClearType) | Snap to pixel grid | Different vertical space |
| macOS | Preserve font design | Sub-pixel positioning |
| Linux | Varies by config | Inconsistent results |

### 7. CPU Architecture Differences

M1/ARM64 vs Intel produce different floating-point results in Chromium's rendering engine, causing consistent pixel differences even within identical Docker containers.

## Why This Is Difficult to Solve

The problem exists at the **intersection of multiple factors**:

1. **Browser rendering is non-deterministic** for sub-pixel values
2. **Playwright's async measurement** can't be fully synchronized
3. **Pixelmatch's design** requires exact dimension matches
4. **Environmental factors** (OS, CPU, fonts) compound variations

No single fix addresses all causes simultaneously.

## Current Code Analysis

### comparison.ts - Dimension Check

```typescript
// Lines 73-81: Strict dimension matching
if (baseline.width !== screenshot.width || baseline.height !== screenshot.height) {
  return {
    passed: false,
    diffPixels: -1,
    diffPercentage: 100,
    totalPixels: baseline.width * baseline.height,
    diffPath: undefined,
  };
}
```

### screenshot.ts - Full Page Capture

```typescript
// Lines 159-164: Using fullPage option
await page.screenshot({
  path: screenshotPath,
  fullPage: viewport.full_page,  // This triggers async height measurement
  timeout: this.config.playwright.screenshotTimeout,
});
```

## Measurement Data

From our test runs:
- **Total tests:** 440
- **False failures:** ~100 (22.7%)
- **Typical height difference:** 1-2 pixels
- **Affected scenarios:** Primarily full-page screenshots of long pages

## Conclusion

The dimension mismatch is a **fundamental limitation** of combining:
1. Playwright's async `fullPage` screenshot
2. Pixelmatch's strict dimension requirement

Solutions must either:
- **Normalize dimensions** before comparison (handle at comparison time)
- **Guarantee fixed dimensions** during capture (handle at capture time)
- **Use different comparison approach** entirely
