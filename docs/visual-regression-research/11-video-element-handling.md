# Video Element Handling in Visual Regression Tests

## Research Date

January 2025

## Problem Statement

Visual regression tests consistently fail on pages containing HTML5 video elements because screenshots capture different video frames between baseline generation and test execution.

### Observed Behavior

- **Symptom**: Tests on pages with videos (e.g., `/sample-marquee`) always fail
- **Pattern**: All 3 viewports fail with the same frame difference
- **User Observation**: "Baseline always needs ~3 seconds, test always needs ~5 seconds to take screenshot"

### Root Cause

The video **never stops playing** during the screenshot capture process. While Playwright waits for network idle, fonts, images, and page stabilization, the video continues advancing through its timeline. Any difference in total elapsed time = different video frame = different pixels = test failure.

```
BASELINE RUN:
┌─────────────────────────────────────────────────────────────────┐
│ Page Load → Network Idle → Waits → Screenshot                   │
│    0s         1.5s          2.5s      3.0s                      │
│                                       └── Video at frame ~3.0s  │
└─────────────────────────────────────────────────────────────────┘

TEST RUN:
┌─────────────────────────────────────────────────────────────────┐
│ Page Load → Network Idle → Waits → Screenshot                   │
│    0s         2.0s          4.0s      5.0s                      │
│                                       └── Video at frame ~5.0s  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Video Element Analysis

### Live Inspection Results (sample-marquee page)

```javascript
{
  src: "https://visualregression.ddev.site/.../WEB-REEL_12.19v3_0.mp4",
  autoplay: true,      // Video auto-plays on load
  loop: true,          // Video loops continuously
  muted: true,         // Muted (allows autoplay in browsers)
  paused: false,       // Currently playing
  currentTime: 8.87,   // Captured at ~8.87s (varies each time)
  duration: 12,        // 12 second video
  poster: "",          // NO poster image defined
  preload: "metadata"  // Only metadata preloaded
}
```

### Why Screenshots Differ

| Factor | Impact |
|--------|--------|
| Network latency | Affects page load time |
| CPU load | Affects wait duration |
| Image CDN response | Affects `waitForAllImages()` duration |
| Browser cache state | Affects total load time |
| 100ms difference | = Different video frame |

### Current Codebase Gap

The `screenshot.ts` service has **NO video handling**:
- No video pause functionality
- No seek to specific timestamp
- No masking or hiding support
- Videos continue playing during all stabilization waits

---

## Video Types and Solutions

### Native HTML5 Videos vs YouTube Embeds

| Aspect | Native `<video>` | YouTube `<iframe>` |
|--------|-----------------|-------------------------|
| **Element type** | `<video src="file.mp4">` | `<iframe src="youtube.com/...">` |
| **Can we control it?** | YES - full JS API access | NO - cross-origin blocked |
| **Autoplay default** | Depends on attribute | NO (unless `?autoplay=1`) |
| **Solution** | Freeze at frame 0 | Mask or hide iframe |

### Cross-Origin Security Barrier (YouTube/Vimeo)

```
YOUR PAGE (visualregression.ddev.site)
┌──────────────────────────────────────────────────────────┐
│                                                          │
│   <video src="your-video.mp4">                           │
│   └── ✅ WE CAN CONTROL THIS (same origin)               │
│       • video.pause() ✅                                 │
│       • video.currentTime = 0 ✅                         │
│                                                          │
│   <iframe src="youtube.com/embed/xyz">                   │
│   ┌────────────────────────────────────────────┐         │
│   │  YOUTUBE'S DOMAIN (different origin)       │         │
│   │  ┌──────────────────────────────────┐      │         │
│   │  │  <video> (YouTube's player)      │      │         │
│   │  │  └── ❌ WE CANNOT ACCESS THIS    │      │         │
│   │  │      • video.pause() ❌ BLOCKED  │      │         │
│   │  │      • video.currentTime ❌      │      │         │
│   │  └──────────────────────────────────┘      │         │
│   └────────────────────────────────────────────┘         │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

## Industry Solutions Research

### Solution A: Pause + Seek to Fixed Timestamp (RECOMMENDED for native videos)

**How it works:** Pause all videos and seek to frame 0 immediately after page load.

**Pros:**
- Most reliable for consistency
- Video element remains visible for layout verification
- Works across all browsers
- Deterministic - always same frame

**Cons:**
- Slight complexity in waiting for `seeked` event
- Shows first frame, not "typical" viewing frame

**Implementation:**
```javascript
await page.evaluate(() => {
  const videos = document.querySelectorAll('video');
  return Promise.all(Array.from(videos).map(video => {
    return new Promise((resolve) => {
      video.pause();
      video.currentTime = 0;
      video.addEventListener('seeked', () => resolve(), { once: true });
      setTimeout(resolve, 2000); // Fallback timeout
    });
  }));
});
```

### Solution B: Mask Video Elements

**How it works:** Use Playwright's `mask` option to overlay videos with colored rectangles.

**Pros:**
- Simple implementation
- Completely eliminates variability
- Built-in Playwright feature

**Cons:**
- Cannot verify video renders correctly
- May miss video loading/error states

**Implementation:**
```javascript
await page.screenshot({
  path: screenshotPath,
  fullPage: true,
  mask: [page.locator('video')]
});
```

### Solution C: CSS Injection to Hide Videos

**How it works:** Inject CSS to hide video elements.

**Pros:**
- Simple implementation
- Works globally

**Cons:**
- `display: none` changes layout
- `visibility: hidden` leaves empty space
- Cannot verify video existence

**Implementation:**
```javascript
await page.addStyleTag({
  content: `
    video { visibility: hidden !important; }
    iframe[src*="youtube.com"],
    iframe[src*="youtu.be"],
    iframe[src*="vimeo.com"] { visibility: hidden !important; }
  `
});
```

### Solution D: Replace with Poster/Static Image

**How it works:** Set video's poster attribute or replace src.

**Pros:**
- Clean visual appearance
- Deterministic

**Cons:**
- Requires poster images to exist
- More complex implementation

---

## Recommended Implementation

### Complete Solution Matrix

| Video Type | Autoplay? | Recommended Solution |
|------------|-----------|---------------------|
| Native `<video>` | Yes/No | **Freeze at frame 0** |
| YouTube embed | No | Already static (thumbnail) |
| YouTube embed | Yes | **Mask iframe** |
| Vimeo embed | Yes/No | **Mask iframe** |

### Implementation for `screenshot.ts`

Add new method to freeze all native videos:

```typescript
/**
 * Stabilize video elements for consistent screenshots
 * Pauses all videos and seeks to the first frame (0 seconds)
 */
private async stabilizeVideos(page: Page): Promise<void> {
  await page.evaluate(() => {
    const videos = document.querySelectorAll('video');

    return Promise.all(Array.from(videos).map(video => {
      return new Promise<void>((resolve) => {
        // Already paused at start? Skip
        if (video.paused && video.currentTime === 0) {
          resolve();
          return;
        }

        // Pause immediately
        video.pause();

        // Listen for seek completion
        const onSeeked = () => {
          video.removeEventListener('seeked', onSeeked);
          resolve();
        };
        video.addEventListener('seeked', onSeeked);

        // Seek to first frame
        video.currentTime = 0;

        // Fallback timeout (2 seconds max)
        setTimeout(() => {
          video.removeEventListener('seeked', onSeeked);
          resolve();
        }, 2000);
      });
    }));
  });

  // Brief pause for rendering
  await page.waitForTimeout(100);
}
```

### Integration Point

In `captureScreenshot()` method, call after navigation:

```typescript
// Navigate to the URL
await page.goto(scenario.url, { waitUntil: 'networkidle' });

// Wait for scenario-specific wait time
if (scenario.wait_time_ms > 0) {
  await page.waitForTimeout(scenario.wait_time_ms);
}

// *** FREEZE ALL VIDEOS ***
await this.stabilizeVideos(page);

// Continue with existing waits...
await this.waitForFonts(page);
```

### For YouTube/Vimeo Iframes

Add iframe masking to screenshot call:

```typescript
// Mask third-party video iframes
const videoIframes = page.locator(
  'iframe[src*="youtube.com"], iframe[src*="youtu.be"], iframe[src*="vimeo.com"]'
);

await page.screenshot({
  path: screenshotPath,
  fullPage: viewport.full_page,
  timeout: this.config.playwright.screenshotTimeout,
  mask: [videoIframes],
});
```

---

## Expected Results After Fix

```
FIXED FLOW:
┌─────────────────────────────────────────────────────────────────────────┐
│ Page Load → FREEZE VIDEOS → Network Idle → Waits → Screenshot          │
│    0s          0.1s            1.5s         3.0s      3.5s              │
│                 │                                      │                │
│                 └── All videos paused at 0:00          └── Frame 0      │
└─────────────────────────────────────────────────────────────────────────┘

BOTH baseline AND test now capture the SAME frame (frame 0)!
```

| Metric | Before | After |
|--------|--------|-------|
| Video page tests | Always fail | Pass consistently |
| Screenshot determinism | Random frame | Frame 0 always |
| YouTube handling | N/A | Masked |

---

## References

### HTML5 Video API
- `video.pause()` - Stops playback immediately
- `video.currentTime` - Gets/sets current playback position in seconds
- `seeked` event - Fires when seek operation completes

### Playwright Documentation
- [Screenshot options](https://playwright.dev/docs/api/class-page#page-screenshot) - mask, animations
- [Locators](https://playwright.dev/docs/locators) - for targeting video elements

### Industry Approaches
- Percy: Auto-freezes autoplay videos, shows thumbnails
- BackstopJS: `hideSelectors` and `removeSelectors` config options
- Applitools: `waitBeforeCapture` for animation stabilization

---

## Files to Modify

| File | Change |
|------|--------|
| `src/services/screenshot.ts` | Add `stabilizeVideos()` method |
| `src/types/index.ts` | (Optional) Add video config types |
| `.vrtrc.json` | (Optional) Add video handling config |
