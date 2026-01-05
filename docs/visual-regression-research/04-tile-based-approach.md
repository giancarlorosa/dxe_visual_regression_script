# Tile-Based Screenshot Strategy

## Overview

Instead of capturing one variable-height full-page screenshot, split the page into multiple fixed-height viewport-sized tiles.

```
BEFORE: Page (5000px) → 1 screenshot (5000px) → Height varies by 1-2px → FAIL
AFTER:  Page (5000px) → 5 tiles (1000px each) → Fixed dimensions → PASS
```

## Why This Works

| Problem | How Tiles Solve It |
|---------|-------------------|
| Page height varies by 1-2px between runs | Each tile has **fixed, guaranteed dimensions** |
| Pixelmatch requires identical dimensions | All tiles are exactly `viewportHeight` pixels tall |
| Full-page stitching introduces race conditions | No stitching - each tile is independent |
| Dimension mismatch fails comparison | Eliminated - tiles are always same size |

## Technical Approach

### Key Insight

Viewport-only captures with explicit `clip` dimensions are **guaranteed** to have consistent dimensions:

```javascript
// This produces VARIABLE height (async measurement):
await page.screenshot({ fullPage: true });

// This produces FIXED height (explicit dimensions):
await page.screenshot({
  fullPage: false,
  clip: { x: 0, y: 0, width: 1280, height: 1080 }
});
```

### Implementation Concept

```javascript
async function captureTiledScreenshots(page, scenario, viewport) {
  const fullHeight = await page.evaluate(() => document.body.scrollHeight);
  const tileHeight = viewport.height;  // e.g., 1080px
  const tileCount = Math.ceil(fullHeight / tileHeight);
  const tiles = [];

  for (let i = 0; i < tileCount; i++) {
    const scrollY = i * tileHeight;
    await page.evaluate((y) => window.scrollTo(0, y), scrollY);
    await page.waitForTimeout(100);  // Allow render after scroll

    const tilePath = `${scenario.id}__${viewport.machine_name}__tile${i}.png`;
    await page.screenshot({
      path: tilePath,
      fullPage: false,
      clip: { x: 0, y: 0, width: viewport.width, height: tileHeight }
    });
    tiles.push(tilePath);
  }
  return tiles;
}
```

## Handling Edge Cases

### Last Tile (Partial Content)

When page height isn't evenly divisible by tile height:

**Option A: Pad to Full Height (Recommended)**
- Always capture full `tileHeight` even if page ends mid-tile
- Empty area below content will be consistent (white/background)
- Guarantees all tiles have identical dimensions

**Option B: Variable Height**
- Last tile can be shorter
- Requires tracking expected heights per tile
- More complex comparison logic

**Option C: Skip Partial**
- Only capture complete tiles
- May miss bottom content
- Simplest but potentially lossy

### Sticky Headers/Footers

- May appear in multiple tiles
- Generally acceptable - comparing against baseline with same sticky elements
- Could implement overlap margin if problematic

### Lazy-Loaded Content

```javascript
for (let i = 0; i < tileCount; i++) {
  await page.evaluate((y) => window.scrollTo(0, y), scrollY);
  await page.waitForLoadState('networkidle');  // Wait for lazy content
  await page.waitForTimeout(100);
  // Then capture
}
```

### Scroll-Triggered Animations

- Add configurable wait time between tiles
- Or disable animations via CSS during capture

## Naming Convention

```
scenario-id__viewport__tile0.png   (0-1000px)
scenario-id__viewport__tile1.png   (1000-2000px)
scenario-id__viewport__tile2.png   (2000-3000px)
scenario-id__viewport__tile3.png   (3000-4000px)
scenario-id__viewport__tile4.png   (4000-5000px)
```

## Comparison Strategy

### Individual Tile Comparison

```
FAIL Homepage @ desktop (5 tiles)
     Tile 0: PASS
     Tile 1: PASS
     Tile 2: FAIL (150 diff pixels, 0.02%)
     Tile 3: PASS
     Tile 4: PASS
     Diff image: ./diffs/homepage__desktop__tile2.png
```

**Benefits:**
- Know exactly which section failed
- Easier debugging
- Can update individual tiles

### Aggregate Reporting

- All tiles must pass for scenario to pass
- Any tile failure = scenario failure
- Simpler but less informative

## Pros and Cons

### Advantages

| Benefit | Impact |
|---------|--------|
| Eliminates dimension mismatch entirely | Solves root problem |
| Fixed dimensions = 100% reproducible | No more false failures |
| Granular diff reporting | Better debugging |
| Faster comparison | Smaller images |
| Parallelizable | Can compare tiles concurrently |

### Disadvantages

| Drawback | Mitigation |
|----------|------------|
| More files to manage (5x baseline images) | Clear naming convention |
| Tile boundary artifacts possible | Optional overlap margin |
| More complex implementation | One-time development cost |
| Need to handle partial last tile | Pad to full height |

## Configuration

```json
{
  "viewports": [
    {
      "machine_name": "desktop",
      "label": "Desktop",
      "width": 1920,
      "height": 1080,
      "full_page": true  // Enables tiling when page > viewport height
    }
  ]
}
```

**Logic:**
- `full_page: false` → Current behavior (viewport-only screenshot)
- `full_page: true` → Tiled capture if page height > viewport height

## Research Validation

From community research:
- Playwright internally uses similar tile/stitch approach for fullPage
- By doing tiling ourselves with fixed heights, we avoid the async measurement issue
- This approach is used by some commercial visual testing platforms

## Conclusion

The tile-based approach is the most promising solution because it:
1. **Guarantees** fixed dimensions (not just "tries to stabilize")
2. **Sidesteps** the Playwright async measurement entirely
3. **Improves** debugging with granular per-tile reporting
4. **Maintains** backward compatibility as opt-in feature
