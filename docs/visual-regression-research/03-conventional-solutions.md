# Conventional Solutions from Community Research

This document summarizes solutions found in community discussions, GitHub issues, and documentation.

## Solution 1: Image Normalization Before Comparison

**Approach:** Resize both images to common dimensions before pixelmatch comparison.

```javascript
function createResized(img, dimensions) {
  const resized = new PNG(dimensions);
  PNG.bitblt(img, resized, 0, 0, img.width, img.height);
  return resized;
}

function normalizeForComparison(baseline, screenshot) {
  const maxWidth = Math.max(baseline.width, screenshot.width);
  const maxHeight = Math.max(baseline.height, screenshot.height);

  const normalizedBaseline = createResized(baseline, { width: maxWidth, height: maxHeight });
  const normalizedScreenshot = createResized(screenshot, { width: maxWidth, height: maxHeight });

  return { normalizedBaseline, normalizedScreenshot };
}
```

**Pros:**
- Directly addresses dimension mismatch at comparison level
- Minimal impact on existing workflow
- Extra pixels are transparent/empty

**Cons:**
- Adds processing overhead
- Could mask genuine edge-case regressions at page bottom
- Doesn't address root cause

**Assessment:** Viable but treats symptom not cause.

---

## Solution 2: Dimension Tolerance Configuration

**Approach:** Allow configurable dimension tolerance and compare only overlapping region.

```javascript
comparison: {
  maxHeightDifference: 5,  // Allow up to 5px height difference
  maxWidthDifference: 0,   // No width tolerance
  cropToSmaller: true,     // Compare only overlapping area
}
```

**How it works:**
1. Check if dimension difference is within tolerance
2. If yes, crop both images to smaller dimensions
3. Run pixelmatch on cropped images

**Similar to:** BackstopJS `requireSameDimensions: false`

**Pros:**
- Configurable per-project
- Explicit about acceptable tolerance

**Cons:**
- May miss regressions at page edges
- Still fundamentally a workaround

---

## Solution 3: Page Height Stabilization

**Approach:** Force layout settlement before capture.

```javascript
async stabilizePageForScreenshot(page) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);

  const bodyHeight = await page.evaluate(() => document.body.scrollHeight);
  const currentViewport = page.viewportSize();
  await page.setViewportSize({
    width: currentViewport.width,
    height: bodyHeight
  });

  await page.waitForTimeout(100);
  await page.evaluate(() => window.scrollTo({ top: 0 }));
  await page.waitForTimeout(50);
}
```

**Pros:**
- Addresses root cause timing issues
- Reduces flakiness generally

**Cons:**
- Adds ~150-200ms per screenshot
- May not eliminate all variations
- Doesn't guarantee success

---

## Solution 4: Fixed Height Clipping

**Approach:** Use `clip` option to capture fixed region.

```javascript
await page.screenshot({
  path: screenshotPath,
  fullPage: true,
  clip: { x: 0, y: 0, width: 1280, height: 1730 }
});
```

**Pros:**
- Guarantees consistent dimensions
- Simple to implement

**Cons:**
- May miss content at page bottom
- Requires knowing expected height
- Not suitable for dynamic content

---

## Solution 5: Increase Tolerance Thresholds

**Playwright configuration:**
```javascript
expect: {
  toHaveScreenshot: {
    maxDiffPixels: 100,
    threshold: 0.2,
  },
}
```

**Important:** This does NOT help with dimension mismatch - only pixel color differences.

---

## Solution 6: CI-Only Baseline Capture

**Approach:** Never capture baselines locally; always use CI.

```yaml
# GitHub Action example
- name: Update baselines
  if: contains(github.event.comment.body, '/update-baselines')
  run: |
    npm run vrt:generate-baseline
    git add baselines/
    git commit -m "Update visual baselines"
    git push
```

**Pros:**
- Eliminates local/CI environment differences
- Consistent architecture

**Cons:**
- Slower development workflow
- Doesn't solve within-CI flakiness

---

## Solution 7: Element-Based Testing

**Approach:** Test specific components instead of full pages.

```javascript
await expect(page.locator('header')).toHaveScreenshot();
await expect(page.locator('.main-content')).toHaveScreenshot();
await expect(page.locator('footer')).toHaveScreenshot();
```

**Pros:**
- Component bounding boxes are more stable
- Better isolation of changes
- Smaller images = faster comparison

**Cons:**
- Requires test refactoring
- May miss layout issues between components
- More baseline images to manage

---

## How Other Tools Handle This

| Tool | Approach |
|------|----------|
| **BackstopJS** | `requireSameDimensions: false` option |
| **Argos CI** | Automatic stabilization + dimension normalization |
| **Percy** | Cloud rendering on standardized infrastructure |
| **Applitools** | Visual AI ignores cosmetic noise |
| **Playwright Native** | Fails on any dimension mismatch |

---

## Research Conclusion

All conventional solutions fall into two categories:

1. **Workarounds** - Accept dimension differences and handle them
2. **Stabilization** - Try to prevent dimension differences

Neither category provides 100% guarantee. The tile-based approach (see `04-tile-based-approach.md`) offers a third category:

3. **Architectural change** - Guarantee fixed dimensions by design
