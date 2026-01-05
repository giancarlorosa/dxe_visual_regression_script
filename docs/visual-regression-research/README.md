# Visual Regression Testing Research

## Problem Statement

Screenshot dimension mismatch causing **~100 false failures out of 440 tests** due to 1-2 pixel height differences between baseline and test screenshots.

## Research Date

January 2025

## Documentation Structure

### Original Research (Phase 1)

| File | Description |
|------|-------------|
| [01-problem-analysis.md](./01-problem-analysis.md) | Root cause analysis of dimension mismatch |
| [02-solutions-tried.md](./02-solutions-tried.md) | Solutions we've already attempted |
| [03-conventional-solutions.md](./03-conventional-solutions.md) | Standard solutions from community research |
| [04-tile-based-approach.md](./04-tile-based-approach.md) | Proposed tile-based screenshot strategy |
| [05-implementation-plan.md](./05-implementation-plan.md) | Detailed implementation steps |
| [06-references.md](./06-references.md) | GitHub issues, sources, and citations |

### Extended Research (Phase 2 - January 2025)

| File | Description |
|------|-------------|
| [07-alternative-tools-comparison.md](./07-alternative-tools-comparison.md) | BackstopJS, Lost Pixel, and other tool analysis |
| [08-image-comparison-libraries.md](./08-image-comparison-libraries.md) | Pixelmatch, ODiff, Looks-Same, Resemble.js comparison |
| [09-odiff-integration-guide.md](./09-odiff-integration-guide.md) | Step-by-step guide to replace Pixelmatch with ODiff |
| [10-custom-report-builder.md](./10-custom-report-builder.md) | Custom HTML report with slider comparison |

## Quick Summary

### The Problem
- Pixelmatch requires **identical dimensions** to compare images
- Playwright's `fullPage: true` measures page height asynchronously
- Height varies by 1-2px between runs due to layout race conditions
- Current code fails comparison before pixelmatch even runs

### Recommended Solution
**Tile-based screenshots**: Split full-page captures into fixed-height viewport chunks.

```
BEFORE: Page (5000px) → 1 screenshot → Height varies → FAIL
AFTER:  Page (5000px) → 5 tiles (1000px each) → Fixed dimensions → PASS
```

### Key Insight
Viewport-only captures with explicit `clip` dimensions are **guaranteed** to have consistent dimensions, unlike `fullPage: true` which relies on async height measurement.

---

## Phase 2 Findings Summary

### Alternative Tools Analysis

| Tool | Solves Problem? | Recommendation |
|------|-----------------|----------------|
| **BackstopJS** | NO | Same issues, uses Resemble.js which skips pixels on large images |
| **Lost Pixel** | YES | Uses ODiff, but loses Playwright's native report (need custom) |
| **Chromatic/Percy** | YES | Cloud-based, expensive, AI-powered |

### Image Comparison Libraries

| Library | Dimension Handling | Best For |
|---------|-------------------|----------|
| **Pixelmatch** | FAILS on mismatch | Current (problematic) |
| **ODiff** | Configurable `failOnLayoutDiff` | **RECOMMENDED** |
| **Looks-Same** | Requires same dimensions | Tolerance-based |
| **Resemble.js** | Requires same dimensions | Browser-based |

### Recommended Solutions (Priority Order)

1. **Replace Pixelmatch with ODiff** - Medium effort, high impact, preserves Playwright
2. **Image Normalization** - Low effort, pad images to same dimensions
3. **Tile-Based Approach** - High effort, guarantees fixed dimensions
4. **Adopt Lost Pixel** - Medium effort, requires custom report builder (~20-30 hours)
