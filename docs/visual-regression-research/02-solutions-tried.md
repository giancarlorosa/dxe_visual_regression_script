# Solutions Already Attempted

This document tracks solutions we've tried and their outcomes.

## Summary

| Solution | Status | Outcome |
|----------|--------|---------|
| Docker environment standardization | Tried | Did not solve - baselines still have 2-3px height differences |
| Page stabilization (fonts, networkidle) | Tried | Reduced but did not eliminate variations |
| Tolerance thresholds | Tried | Doesn't help - dimension mismatch fails before pixelmatch |
| Various wait strategies | Tried | Inconsistent results |

## Detailed Analysis

### 1. Docker Environment Standardization

**Approach:** Run all screenshot capture in identical Docker containers to eliminate OS/environment differences.

**Implementation:**
- Used Microsoft's official Playwright Docker images
- Standardized both local development and CI environments
- Ensured identical browser versions

**Outcome:**
- Did NOT solve the problem
- Baselines still generated with 2-3 pixel height differences
- Docker containers on different host architectures (M1 vs Intel) still produce different results

**Why it failed:**
- Docker normalizes OS-level differences but not CPU architecture floating-point behavior
- Layout race conditions still occur within the container
- Font rendering still varies based on host kernel

### 2. Page Stabilization

**Approach:** Wait for all resources and layout to settle before screenshot.

**Techniques tried:**
```javascript
await page.waitForLoadState('domcontentloaded');
await page.waitForLoadState('load');
await page.waitForLoadState('networkidle');
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(500);  // Hard wait
```

**Outcome:**
- Reduced frequency of variations
- Did NOT eliminate the 1-2px differences
- Some pages still produced inconsistent heights

**Why it failed:**
- Layout can still shift after all waits complete
- Browser's internal measurement timing is not controllable
- Some dynamic content triggers reflows after stabilization

### 3. Tolerance Thresholds

**Current Configuration:**
```json
{
  "comparison": {
    "threshold": 0.1,
    "maxDiffPixels": 100,
    "maxDiffPixelRatio": 0.01
  }
}
```

**Outcome:**
- These thresholds **never apply** because dimension mismatch causes immediate failure
- The comparison code (line 73-81 in comparison.ts) returns early before pixelmatch runs

**Why it failed:**
- Tolerance settings only affect pixel color comparison
- They cannot help when image dimensions don't match
- Pixelmatch requires exact dimensions as a prerequisite

### 4. Various Wait Strategies

**Techniques tried:**
- Scroll to bottom and back to top before capture
- Wait for specific selectors to be visible
- Wait for specific element heights to stabilize
- Multiple networkidle checks

**Outcome:**
- Marginal improvements in some cases
- No consistent solution across all test scenarios
- Increased test execution time significantly

## Lessons Learned

1. **The problem is architectural** - cannot be solved by timing adjustments alone
2. **Pixelmatch's dimension requirement is non-negotiable** - any height difference fails
3. **Docker helps but doesn't solve** - architecture differences persist
4. **Stabilization helps but doesn't eliminate** - race conditions still occur

## Conclusion

All conventional solutions address symptoms rather than root cause. The fundamental issue is:

```
fullPage: true → Async height measurement → Variable dimensions → Comparison fails
```

Need a solution that **guarantees fixed dimensions** regardless of page height variations.
