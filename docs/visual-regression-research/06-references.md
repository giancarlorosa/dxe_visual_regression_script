# References and Sources

## Key GitHub Issues

### Playwright Issues

| Issue | Title | Key Finding |
|-------|-------|-------------|
| [#20366](https://github.com/microsoft/playwright/issues/20366) | Same test different heights in different runs | Docker vs local produces different heights |
| [#18827](https://github.com/microsoft/playwright/issues/18827) | Pixel-level height differences | Reports 208px vs 207px, 444px vs 445px variations |
| [#18406](https://github.com/microsoft/playwright/issues/18406) | CSS height:100% breaks fullPage | `height: 100%` breaks `window.scrollTo()` |
| [#13873](https://github.com/microsoft/playwright/issues/13873) | Architecture differences (M1 vs Intel) | Different CPUs produce different screenshots |
| [#620](https://github.com/microsoft/playwright/issues/620) | Full page screenshot issues | Early discussion of fullPage limitations |
| [#12962](https://github.com/microsoft/playwright/issues/12962) | Full page with scrollable non-body elements | fullPage doesn't work with custom scroll containers |
| [#19861](https://github.com/microsoft/playwright/issues/19861) | Lazy-loaded content handling | Solutions for waiting for lazy content |

### Pixelmatch Issues

| Issue | Title | Key Finding |
|-------|-------|-------------|
| [#25](https://github.com/mapbox/pixelmatch/issues/25) | Handling different-sized images | Workaround using PNG.bitblt to resize |

### Chromium Issues

| Issue | Title | Key Finding |
|-------|-------|-------------|
| [331796402](https://issues.chromium.org/issues/331796402) | Full-page screenshot triggers window resize | Screenshot causes 1px resize event |

## Official Documentation

### Playwright

- [Screenshots](https://playwright.dev/docs/screenshots) - Official screenshot API
- [Visual Testing](https://playwright.dev/docs/test-snapshots) - toHaveScreenshot documentation
- [Configuration](https://playwright.dev/docs/test-configuration) - expect options
- [Actionability](https://playwright.dev/docs/actionability) - Wait mechanisms

### Pixelmatch

- [GitHub Repository](https://github.com/mapbox/pixelmatch) - Library documentation
- Key limitation: "Note: image dimensions must be equal"

## Community Articles

### Visual Regression Testing

| Source | URL | Topic |
|--------|-----|-------|
| BrowserStack | [Visual Regression Guide](https://www.browserstack.com/guide/visual-regression-testing-using-playwright) | Best practices |
| LambdaTest | [Playwright VRT](https://www.lambdatest.com/learning-hub/playwright-visual-regression-testing) | Implementation guide |
| Argos CI | [Screenshot Stabilization](https://argos-ci.com/blog/screenshot-stabilization) | Stabilization techniques |
| CSS-Tricks | [Automated VRT](https://css-tricks.com/automated-visual-regression-testing-with-playwright/) | Tutorial |

### Technical Deep Dives

| Source | URL | Topic |
|--------|-----|-------|
| John Resig | [Sub-pixel Problems](https://johnresig.com/blog/sub-pixel-problems-in-css/) | CSS sub-pixel rendering |
| Coding Horror | [Font Rendering](https://blog.codinghorror.com/font-rendering-respecting-the-pixel-grid/) | Platform font differences |
| Chen Hui Jing | [Subpixel Rendering](https://chenhuijing.com/blog/about-subpixel-rendering-in-browsers/) | Browser rendering differences |

## Alternative Tools Comparison

| Tool | Dimension Handling | Approach |
|------|-------------------|----------|
| **BackstopJS** | `requireSameDimensions: false` | Allow mismatch, compare overlap |
| **Argos CI** | Automatic normalization | Cloud-based stabilization |
| **Percy** | Standardized rendering | Cloud infrastructure |
| **Applitools** | Visual AI | Intelligent comparison |
| **Chromatic** | Storybook integration | Component-level testing |

## Research Queries Used

### Perplexity Deep Research
```
Playwright visual regression testing screenshot size mismatch 1-2 pixel height
difference between baseline and test screenshots causing false positives. Problem
occurs with full page screenshots where rendered page height varies slightly
between runs. Looking for solutions to handle image dimension differences in
visual comparison tools like pixelmatch.
```

### Key Search Terms
- "Playwright fullPage screenshot height mismatch"
- "pixelmatch different dimensions"
- "visual regression test flaky dimension"
- "Playwright screenshot stabilization"
- "BackstopJS requireSameDimensions"

## Code References

### Current Project Files

| File | Lines | Relevant Code |
|------|-------|---------------|
| `src/services/comparison.ts` | 73-81 | Dimension check that fails on mismatch |
| `src/services/screenshot.ts` | 159-164 | fullPage screenshot capture |
| `src/config/loader.ts` | 17-19 | Default comparison thresholds |

### Pixelmatch Workaround (from Issue #25)

```javascript
function createResized(img, dimensions) {
  const resized = new PNG(dimensions);
  PNG.bitblt(img, resized, 0, 0, img.width, img.height);
  return resized;
}

function createDiff(img1, img2, options) {
  const diffDimensions = {
    width: Math.max(img1.width, img2.width),
    height: Math.max(img1.height, img2.height),
  };

  const resizedImg1 = createResized(img1, diffDimensions);
  const resizedImg2 = createResized(img2, diffDimensions);

  const diff = new PNG(diffDimensions);
  const numOfDiffPixels = pixelmatch(
    resizedImg1.data,
    resizedImg2.data,
    diff.data,
    diffDimensions.width,
    diffDimensions.height,
    options
  );

  return { diff, numOfDiffPixels };
}
```

## Citation Notes

Research conducted January 2025 using:
- Perplexity AI (Sonar Pro, Sonar Reasoning Pro, Deep Research)
- GitHub issue search
- Official documentation review
- Community forum analysis

All findings validated against multiple sources where possible.
