# Alternative Visual Regression Tools Comparison

## Research Date

January 2025

## Overview

This document compares alternative visual regression testing tools to evaluate whether migrating from Playwright would solve the dimension mismatch problem causing ~100 false failures out of 440 tests.

---

## BackstopJS Analysis

### Would BackstopJS Solve Our Problem?

**Short Answer: NO.** BackstopJS suffers from the **same fundamental issues** as Playwright.

### Technical Comparison

| Aspect | BackstopJS | Playwright |
|--------|------------|------------|
| **Comparison Library** | Resemble.js | Pixelmatch |
| **Dimension Handling** | `requireSameDimensions: false` option | Strict (fails on any mismatch) |
| **Browser Automation** | Puppeteer (same Chromium engine) | Puppeteer/Playwright |
| **Open Issues** | 500+ on GitHub | Similar issues documented |

### BackstopJS Issues (from GitHub)

#### Dimension Mismatch Problems
- **Issue #1156**: ~395 of 1100 tests failed after version upgrade in Docker environment
- **Issue #1303**: Random left/top pixel shifts despite correct dimensions
- **Issue #968**: Resize events fire unexpectedly before capture

#### `requireSameDimensions: false` Limitations
- When set to `false`, compares only the overlapping area
- **Problem**: May miss regressions at page edges
- **Problem**: Still reports "size: isDifferent" in logs (issue #1145)
- **Problem**: Percentage calculations round to 2 decimals - on large images (1024x23046), even obvious changes may round to 0.00%

#### Resemble.js Limitations
- **Critical**: Skips pixels on images > 1200px for performance optimization
- Large full-page screenshots may miss subtle changes
- Less accurate for our use case (440 tests, many full-page)

### BackstopJS Configuration Example

```javascript
// backstop.json
{
  "viewports": [
    { "label": "desktop", "width": 1920, "height": 1080 }
  ],
  "scenarios": [
    {
      "label": "Homepage",
      "url": "https://example.com",
      "misMatchThreshold": 0.1,
      "requireSameDimensions": false  // Allows dimension differences
    }
  ],
  "engine": "puppeteer"
}
```

### Verdict

```
MIGRATE TO BACKSTOPJS: NOT RECOMMENDED

Reasons:
- Same root causes (browser rendering variability)
- Same environment issues (Docker/local differences)
- Resemble.js less accurate on large images
- Would still have false positives
- Would lose Playwright's superior API and ecosystem
```

---

## Lost Pixel Analysis

### Why Lost Pixel Reduced False Errors

Lost Pixel uses **ODiff** instead of Pixelmatch/Resemble.js. ODiff has a critical feature:

```javascript
// ODiff can explicitly handle dimension mismatches
const result = await compare(baseline, current, diff, {
  failOnLayoutDiff: false  // Don't fail on dimension differences!
});

// Returns:
// { match: true } - images are visually the same
// { match: false, reason: "layout-diff" } - dimensions differ
// { match: false, reason: "pixel-diff", diffPercentage: 0.5 } - pixel differences
```

### Lost Pixel Strengths

| Feature | Benefit |
|---------|---------|
| **ODiff Engine** | 6-7x faster than Pixelmatch, handles dimension mismatches |
| **YIQ Color Space** | Better perceptual comparison (matches human vision) |
| **Anti-aliasing Detection** | Reduces false positives from font rendering |
| **Layout Diff Mode** | Can ignore dimension mismatches or report separately |
| **Region Masking** | Ignore dynamic content areas |
| **GitHub Actions** | First-class CI integration |

### Lost Pixel Limitations

**Missing Reporting Features** (compared to Playwright):
- No interactive slider comparison (drag to compare)
- No side-by-side view in browser
- No diff overlay toggle
- Basic before/after static images only
- No test trace integration
- No video/screenshot timeline

### Lost Pixel Configuration

```typescript
// lostpixel.config.ts
export const config = {
  pageShots: {
    pages: [
      { path: '/', name: 'homepage' },
      { path: '/about', name: 'about' },
    ],
    baseUrl: 'http://localhost:3000',
    breakpoints: [1920, 1280, 768, 375],
  },

  // Key settings for dimension tolerance
  threshold: 0.01,  // 1% pixel difference allowed

  // Wait for stability
  waitBeforeScreenshot: 500,
  waitForFirstRequest: 1000,
  waitForLastRequest: 1000,

  // Mask dynamic elements
  mask: [
    { selector: '.timestamp' },
    { selector: '.ads' },
  ],

  generateOnly: false,
  failOnDifference: true,
};
```

### Verdict

```
MIGRATE TO LOST PIXEL: POSSIBLE WITH CAVEATS

Pros:
- ODiff handles dimension mismatches gracefully
- Faster comparison engine
- Good CI integration

Cons:
- Must build custom report UI (~20-30 hours)
- Loses Playwright's interactive HTML report
- Additional infrastructure to maintain
```

---

## Enterprise/Cloud Solutions

| Tool | Approach | Dimension Handling | Cost | Notes |
|------|----------|-------------------|------|-------|
| **Chromatic** | Storybook-focused | Automatic normalization | $$$ | Fast, no flakes, Figma integration |
| **Percy** | AI visual diffs | AI-powered tolerance | $$$ | BrowserStack-owned, high-speed rendering |
| **Applitools** | Visual AI | Intelligent comparison | $$$$ | Most accurate, multi-platform |
| **Argos CI** | GitHub-native | CI-focused | Freemium | Simpler, less AI maturity |

### When to Consider Enterprise Solutions

- Large team with many visual tests
- Need AI-powered false positive reduction
- Budget available for SaaS tools
- Prefer managed infrastructure

---

## Open Source Alternatives

| Tool | Comparison Engine | Dimension Handling | Reporting | Active Development |
|------|-------------------|-------------------|-----------|-------------------|
| **Lost Pixel** | ODiff | Handles gracefully | Basic | Yes |
| **reg-suit** | Plugin-based | Configurable | Good HTML | Yes |
| **Loki** | Looks-Same | Configurable | Basic | Moderate |
| **BackstopJS** | Resemble.js | `requireSameDimensions` | Good HTML | Moderate |

### reg-suit Overview

Worth investigating as an alternative:
- Pluggable screenshot capture (can use Playwright!)
- Pluggable storage (S3, GCS, local)
- Good HTML reporting
- Configurable comparison thresholds

```bash
npm install reg-suit reg-keygen-git-hash-plugin reg-notify-github-plugin reg-publish-s3-plugin
```

---

## Comparison Summary

| Option | Solves Dimension Problem? | Effort | Preserves Playwright Report? |
|--------|--------------------------|--------|------------------------------|
| BackstopJS | NO | High | No |
| Lost Pixel | YES | Medium-High | No (need custom) |
| Chromatic | YES | Low | Different (cloud) |
| Percy | YES | Low | Different (cloud) |
| Applitools | YES | Low | Different (cloud) |
| reg-suit | Configurable | Medium | Different (HTML) |

---

## Recommendation

**Do NOT migrate to BackstopJS** - it has the same fundamental problems.

**Consider Lost Pixel or ODiff integration** if willing to:
1. Build custom report UI, OR
2. Accept simpler reporting

**Consider enterprise solutions** if:
1. Budget allows
2. Need AI-powered accuracy
3. Prefer managed infrastructure

---

## References

- [BackstopJS GitHub](https://github.com/garris/BackstopJS)
- [Lost Pixel Documentation](https://docs.lost-pixel.com)
- [ODiff GitHub](https://github.com/dmtrKovalenko/odiff)
- [Chromatic](https://www.chromatic.com)
- [Percy](https://percy.io)
- [Applitools](https://applitools.com)
- [reg-suit](https://reg-viz.github.io/reg-suit/)

### GitHub Issues Referenced

- BackstopJS #1156: Docker environment failures
- BackstopJS #1303: Random pixel shifts
- BackstopJS #968: Unexpected resize events
- BackstopJS #1145: requireSameDimensions issues
