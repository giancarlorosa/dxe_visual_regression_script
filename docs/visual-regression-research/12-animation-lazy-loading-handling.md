# Animation & Lazy Loading Handling in Visual Regression Tests

## Research Date

January 2025

## Problem Statement

Visual regression tests fail on pages with scroll-triggered animations and lazy-loaded background images. The baseline screenshots capture elements BEFORE lazy loading triggers (showing no background images), while test screenshots capture AFTER scrolling (showing loaded background images), causing false positives.

### Observed Behavior

- **Symptom**: Elements with class `hgm-lazy` appear different between baseline and test
- **Pattern**: Background images present in test screenshots but missing in baselines
- **Root cause**: Intersection Observer triggers on scroll, CSS transitions cause timing variations

### Element Analysis

Analyzed page `https://visualregression.ddev.site/flexible-layout-demo`:

```javascript
{
  totalLazyElements: 22,
  className: "hgm-section__bg hgm-lazy",
  dataAttributes: {
    "data-bg": "/sites/default/files/...",   // Background image URL
    "data-ll-status": "loaded"               // Load status tracking
  },
  transition: "opacity 0.4s linear"          // CSS transition on load
}
```

### Root Cause: Timing Gap in Screenshot Flow

```
BEFORE FIX:
┌──────────────────────────────────────────────────────────────────────────────┐
│ Page Load → Wait → Videos → Interactions → Fonts → LazyScroll → Screenshot  │
│                                                         │              │     │
│                                              Triggers   │    CSS transitions │
│                                              Observer   │    still running!  │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Three Critical Gaps:**
1. No CSS animation/transition disabling
2. No wait for transitions to complete (0.4s-0.6s)
3. `waitForAllImages()` only handles `<img>` elements, not CSS `background-image`

---

## Lazy Loading Implementation Details

### Common Lazy Loading Patterns

| Pattern | Data Attribute | Element Type | Example |
|---------|---------------|--------------|---------|
| Background images | `data-bg` | Any element | `<div class="hgm-lazy" data-bg="/path/image.jpg">` |
| Image elements | `data-src` | `<img>` | `<img class="hgm-lazy" data-src="/path/image.jpg">` |
| Alternative | `data-background-image` | Any element | Legacy pattern |

### Intersection Observer Behavior

The website uses Intersection Observer to trigger lazy loading:

1. Observer watches elements with `.hgm-lazy` class
2. When element enters viewport, callback fires
3. Callback sets `background-image` from `data-bg`
4. CSS transition `opacity 0.4s linear` animates the reveal
5. Class `hgm-lazy-loaded` is added when complete

### Why Screenshots Differ

| Phase | Baseline Generation | Test Execution |
|-------|-------------------|----------------|
| Navigation | Page loads, lazy elements hidden | Page loads, lazy elements hidden |
| Scroll behavior | May not trigger all observers | Different timing triggers different elements |
| Screenshot timing | Captures mid-transition or before load | Captures different transition state |
| Result | Missing background images | Has background images = DIFF |

---

## Solution Implemented

### Two-Part Approach

1. **Disable CSS animations/transitions** via injected stylesheet
2. **Force-load all lazy content** by directly setting attributes

### Implementation Details

#### 1. `disableAnimations()` Method

Injects CSS that immediately completes all animations:

```typescript
private async disableAnimations(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
      }
    `
  });
}
```

**Why this approach?**
- Works regardless of how the website implements animations
- More reliable than `prefers-reduced-motion` (requires CSS to respect it)
- Immediate effect, no waiting required

#### 2. `forceLazyBackgroundImages()` Method

Bypasses Intersection Observer by directly setting attributes:

```typescript
private async forceLazyBackgroundImages(page: Page): Promise<void> {
  await page.evaluate(`(() => {
    // Force load background images from data-bg attributes
    const lazyBgElements = document.querySelectorAll('[data-bg]');
    lazyBgElements.forEach(el => {
      const bgUrl = el.getAttribute('data-bg');
      if (bgUrl) {
        const fullUrl = bgUrl.startsWith('/')
          ? window.location.origin + bgUrl
          : bgUrl;
        el.style.backgroundImage = 'url("' + fullUrl + '")';
        el.style.opacity = '1';
        el.classList.add('hgm-lazy-loaded');
      }
    });

    // Force load images from data-src attributes
    const lazyImgElements = document.querySelectorAll('img[data-src]');
    lazyImgElements.forEach(img => {
      const src = img.getAttribute('data-src');
      if (src) {
        const fullSrc = src.startsWith('/')
          ? window.location.origin + src
          : src;
        img.setAttribute('src', fullSrc);
        img.style.opacity = '1';
      }
    });
  })()`);

  // Wait for background images to start loading
  await page.waitForTimeout(300);
}
```

**Why this approach?**
- Ensures ALL lazy content loads, not just visible elements
- No dependency on scroll position or Intersection Observer timing
- Sets opacity to 1 to skip CSS transition

---

## Updated Screenshot Flow

```
AFTER FIX:
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ Page Load → Wait → DisableAnim → Videos → Interactions → Fonts → ForceLoad → Scroll │
│                         │                                            │               │
│                   No transitions!                              All images            │
│                   Instant state                                loaded now            │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

### Order of Operations in `captureScreenshot()`

1. Navigate to URL (`networkidle`)
2. Wait for scenario-specific wait time
3. **`disableAnimations()`** - Inject CSS to disable all transitions
4. `stabilizeVideos()` - Freeze videos at frame 0
5. `executeInteractions()` - Run any configured interactions
6. `waitForFonts()` - Wait for web fonts
7. (If full-page):
   - **`forceLazyBackgroundImages()`** - Load all lazy content immediately
   - `triggerLazyLoading()` - Scroll to trigger any remaining observers
   - `waitForAllImages()` - Wait for standard images
   - `waitForStableHeight()` - Wait for layout stability
8. Take screenshot

---

## Alternative Approaches Considered

### Option A: `reducedMotion: 'reduce'` Context Option

```typescript
const context = await browser.newContext({
  reducedMotion: 'reduce'
});
```

**Rejected because:** Only works if website CSS uses `@media (prefers-reduced-motion)`. The HGM Mercury theme does not consistently use this media query.

### Option B: Wait for Transitions to Complete

```typescript
await this.triggerLazyLoading(page);
await page.waitForTimeout(700); // 600ms transition + buffer
```

**Rejected because:** Adds ~700ms to every full-page screenshot without guaranteed consistency.

### Option C: Scroll-Only Approach

Rely solely on `triggerLazyLoading()` to trigger all observers.

**Rejected because:** Scroll timing can vary, and transitions still cause timing-based differences.

---

## Expected Results

| Metric | Before | After |
|--------|--------|-------|
| Lazy background image tests | Inconsistent | Consistent |
| Animation-related failures | Random | Eliminated |
| Screenshot time overhead | N/A | +300-500ms |
| CSS transition artifacts | Possible | None |

---

## Files Modified

| File | Changes |
|------|---------|
| `src/services/screenshot.ts` | Added `disableAnimations()` and `forceLazyBackgroundImages()` methods, updated flow |

---

## Testing Verification

To verify the fix works:

1. Generate baselines for a page with lazy-loaded content:
   ```bash
   npx vrt generate-baseline --scenarios "flexible-layout-demo"
   ```

2. Run tests against the same page:
   ```bash
   npx vrt run-tests --scenarios "flexible-layout-demo"
   ```

3. Verify:
   - All 22 lazy elements have background images in both baseline and test
   - No diff pixels related to animation timing
   - No CSS transition artifacts visible

---

## References

### Playwright Documentation
- [addStyleTag()](https://playwright.dev/docs/api/class-page#page-add-style-tag) - Inject CSS into page
- [reducedMotion](https://playwright.dev/docs/api/class-browser#browser-new-context-option-reduced-motion) - Context option for reduced motion

### Related Issues
- Intersection Observer lazy loading patterns
- CSS `prefers-reduced-motion` media query
- Animation stabilization in visual regression testing

### Related Documentation in This Project
- [11-video-element-handling.md](./11-video-element-handling.md) - Similar approach for video stabilization
