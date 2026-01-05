# Custom Visual Regression Report Builder

## Research Date

January 2025

## Overview

This document provides a complete implementation guide for building a custom visual regression report with slider comparison, side-by-side view, and diff overlay - replicating Playwright's native HTML report features.

**Use Case**: If adopting Lost Pixel or ODiff without Playwright's `toHaveScreenshot()`, a custom report UI is needed for effective debugging.

---

## Feature Requirements

### Must Have (Playwright Parity)
1. **Slider Comparison**: Drag to reveal baseline vs current
2. **Side-by-Side View**: View both images simultaneously
3. **Diff Overlay**: Toggle pixel difference highlighting
4. **Test Result Navigation**: List of passed/failed tests
5. **Diff Statistics**: Pixel count and percentage

### Nice to Have
1. Keyboard navigation (arrow keys for slider)
2. Zoom and pan on images
3. Filter by status (show only failures)
4. Export report as single HTML file
5. Dark mode support

---

## Effort Estimate

| Feature | Effort |
|---------|--------|
| Basic slider comparison | 4-8 hours |
| Side-by-side view | 2-4 hours |
| Diff overlay toggle | 2-3 hours |
| Test result navigation | 4-6 hours |
| Keyboard shortcuts | 2-3 hours |
| Styling/polish | 4-8 hours |
| **Total** | **18-32 hours** |

---

## Implementation

### File Structure

```
src/
├── report/
│   ├── template.html       # HTML template with embedded CSS/JS
│   ├── generator.ts        # Node.js report generator
│   └── styles.css          # Optional external styles
```

### HTML Template (template.html)

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Visual Regression Report</title>
  <style>
    :root {
      --primary: #007bff;
      --success: #28a745;
      --danger: #dc3545;
      --warning: #ffc107;
      --dark: #343a40;
      --light: #f8f9fa;
      --border: #dee2e6;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--light);
      color: var(--dark);
      line-height: 1.5;
    }

    .container {
      max-width: 1600px;
      margin: 0 auto;
      padding: 20px;
    }

    header {
      background: var(--dark);
      color: white;
      padding: 20px;
      margin-bottom: 20px;
    }

    header h1 {
      font-size: 1.5rem;
      margin-bottom: 10px;
    }

    .summary {
      display: flex;
      gap: 20px;
      flex-wrap: wrap;
    }

    .summary-item {
      background: rgba(255,255,255,0.1);
      padding: 10px 20px;
      border-radius: 4px;
    }

    .summary-item.passed { border-left: 4px solid var(--success); }
    .summary-item.failed { border-left: 4px solid var(--danger); }
    .summary-item.total { border-left: 4px solid var(--primary); }

    .filters {
      margin-bottom: 20px;
      display: flex;
      gap: 10px;
    }

    .filters button {
      padding: 8px 16px;
      border: 1px solid var(--border);
      background: white;
      cursor: pointer;
      border-radius: 4px;
      transition: all 0.2s;
    }

    .filters button:hover {
      background: var(--light);
    }

    .filters button.active {
      background: var(--primary);
      color: white;
      border-color: var(--primary);
    }

    .test-list {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .test-result {
      background: white;
      border: 1px solid var(--border);
      border-radius: 8px;
      overflow: hidden;
    }

    .test-result.passed { border-left: 4px solid var(--success); }
    .test-result.failed { border-left: 4px solid var(--danger); }

    .test-header {
      padding: 15px 20px;
      background: var(--light);
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
      cursor: pointer;
    }

    .test-header:hover {
      background: #e9ecef;
    }

    .test-title {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .status-icon {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      color: white;
    }

    .status-icon.passed { background: var(--success); }
    .status-icon.failed { background: var(--danger); }

    .test-meta {
      color: #6c757d;
      font-size: 0.875rem;
    }

    .test-body {
      padding: 20px;
      display: none;
    }

    .test-result.expanded .test-body {
      display: block;
    }

    .view-tabs {
      display: flex;
      gap: 10px;
      margin-bottom: 15px;
    }

    .view-tabs button {
      padding: 8px 16px;
      border: 1px solid var(--border);
      background: white;
      cursor: pointer;
      border-radius: 4px;
    }

    .view-tabs button.active {
      background: var(--primary);
      color: white;
      border-color: var(--primary);
    }

    /* Slider Comparison */
    .comparison-container {
      position: relative;
      width: 100%;
      background: #f0f0f0;
      border: 1px solid var(--border);
      border-radius: 4px;
      overflow: hidden;
    }

    .image-wrapper {
      position: relative;
      width: 100%;
      min-height: 400px;
    }

    .comparison-image {
      position: absolute;
      top: 0;
      left: 0;
      max-width: 100%;
      height: auto;
    }

    .comparison-image.current {
      clip-path: inset(0 0 0 50%);
    }

    .comparison-slider {
      position: absolute;
      top: 0;
      left: 50%;
      width: 4px;
      height: 100%;
      background: white;
      border: 1px solid var(--dark);
      cursor: ew-resize;
      z-index: 100;
      transform: translateX(-50%);
    }

    .comparison-slider::before {
      content: '⟷';
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: white;
      padding: 5px 10px;
      border-radius: 4px;
      border: 1px solid var(--dark);
      font-size: 14px;
    }

    .slider-label {
      position: absolute;
      bottom: 10px;
      padding: 5px 10px;
      background: rgba(0,0,0,0.7);
      color: white;
      border-radius: 4px;
      font-size: 12px;
    }

    .slider-label.left { left: 10px; }
    .slider-label.right { right: 10px; }

    /* Side by Side */
    .side-by-side {
      display: none;
      gap: 20px;
    }

    .side-by-side.active {
      display: flex;
    }

    .side-by-side .image-panel {
      flex: 1;
      text-align: center;
    }

    .side-by-side .image-panel h4 {
      margin-bottom: 10px;
      color: var(--dark);
    }

    .side-by-side img {
      max-width: 100%;
      border: 1px solid var(--border);
      border-radius: 4px;
    }

    /* Diff Only View */
    .diff-only {
      display: none;
      text-align: center;
    }

    .diff-only.active {
      display: block;
    }

    .diff-only img {
      max-width: 100%;
      border: 1px solid var(--border);
      border-radius: 4px;
    }

    /* Diff Overlay */
    .diff-overlay {
      position: absolute;
      top: 0;
      left: 0;
      max-width: 100%;
      height: auto;
      opacity: 0.7;
      mix-blend-mode: difference;
      pointer-events: none;
      display: none;
    }

    .diff-overlay.visible {
      display: block;
    }

    /* Keyboard hint */
    .keyboard-hint {
      margin-top: 10px;
      font-size: 12px;
      color: #6c757d;
    }

    .keyboard-hint kbd {
      background: var(--dark);
      color: white;
      padding: 2px 6px;
      border-radius: 3px;
      font-family: monospace;
    }
  </style>
</head>
<body>
  <header>
    <div class="container">
      <h1>Visual Regression Report</h1>
      <div class="summary" id="summary">
        <!-- Filled by JavaScript -->
      </div>
    </div>
  </header>

  <main class="container">
    <div class="filters">
      <button class="active" data-filter="all">All</button>
      <button data-filter="failed">Failed Only</button>
      <button data-filter="passed">Passed Only</button>
    </div>

    <div class="test-list" id="testList">
      <!-- Filled by JavaScript -->
    </div>
  </main>

  <script>
    // Test results data - injected by report generator
    const testResults = /* TEST_RESULTS_PLACEHOLDER */[];

    // State
    let activeFilter = 'all';
    let expandedTests = new Set();

    // Initialize
    function init() {
      renderSummary();
      renderTests();
      setupFilters();
      setupKeyboardNavigation();
    }

    function renderSummary() {
      const passed = testResults.filter(t => t.status === 'passed').length;
      const failed = testResults.filter(t => t.status === 'failed').length;
      const total = testResults.length;

      document.getElementById('summary').innerHTML = `
        <div class="summary-item total">
          <strong>${total}</strong> Total
        </div>
        <div class="summary-item passed">
          <strong>${passed}</strong> Passed
        </div>
        <div class="summary-item failed">
          <strong>${failed}</strong> Failed
        </div>
      `;
    }

    function renderTests() {
      const filtered = testResults.filter(t => {
        if (activeFilter === 'all') return true;
        return t.status === activeFilter;
      });

      const container = document.getElementById('testList');
      container.innerHTML = filtered.map((test, index) => `
        <div class="test-result ${test.status} ${expandedTests.has(index) ? 'expanded' : ''}"
             data-index="${index}">
          <div class="test-header" onclick="toggleTest(${index})">
            <div class="test-title">
              <span class="status-icon ${test.status}">
                ${test.status === 'passed' ? '✓' : '✗'}
              </span>
              <span>${test.name}</span>
            </div>
            <div class="test-meta">
              ${test.status === 'failed' ?
                `${test.diffPixels} pixels (${test.diffPercentage.toFixed(2)}%)` :
                'No differences'}
            </div>
          </div>
          <div class="test-body">
            ${test.status === 'failed' ? renderComparison(test, index) :
              '<p>No visual differences detected.</p>'}
          </div>
        </div>
      `).join('');

      // Re-setup sliders for expanded tests
      expandedTests.forEach(index => {
        setupSlider(index);
      });
    }

    function renderComparison(test, index) {
      return `
        <div class="view-tabs">
          <button class="active" onclick="showView(${index}, 'slider')">Slider</button>
          <button onclick="showView(${index}, 'side-by-side')">Side by Side</button>
          <button onclick="showView(${index}, 'diff')">Diff Only</button>
          <button onclick="toggleDiffOverlay(${index})">Toggle Overlay</button>
        </div>

        <div class="comparison-container" id="comparison-${index}">
          <div class="image-wrapper" id="slider-view-${index}">
            <img class="comparison-image baseline" src="${test.baseline}" alt="Baseline">
            <img class="comparison-image current" src="${test.current}" alt="Current">
            <img class="diff-overlay" id="overlay-${index}" src="${test.diff}" alt="Diff">
            <div class="comparison-slider" id="slider-${index}"></div>
            <span class="slider-label left">Baseline</span>
            <span class="slider-label right">Current</span>
          </div>

          <div class="side-by-side" id="side-by-side-${index}">
            <div class="image-panel">
              <h4>Baseline</h4>
              <img src="${test.baseline}" alt="Baseline">
            </div>
            <div class="image-panel">
              <h4>Current</h4>
              <img src="${test.current}" alt="Current">
            </div>
          </div>

          <div class="diff-only" id="diff-only-${index}">
            <h4>Diff Image</h4>
            <img src="${test.diff}" alt="Diff">
          </div>
        </div>

        <div class="keyboard-hint">
          <kbd>←</kbd> <kbd>→</kbd> Move slider &nbsp;|&nbsp;
          <kbd>D</kbd> Toggle diff overlay
        </div>
      `;
    }

    function toggleTest(index) {
      if (expandedTests.has(index)) {
        expandedTests.delete(index);
      } else {
        expandedTests.add(index);
        setTimeout(() => setupSlider(index), 0);
      }
      renderTests();
    }

    function setupSlider(index) {
      const slider = document.getElementById(`slider-${index}`);
      const currentImage = document.querySelector(`#slider-view-${index} .current`);
      const container = document.getElementById(`comparison-${index}`);

      if (!slider || !currentImage || !container) return;

      let isDragging = false;
      let sliderPosition = 50;

      const updateSlider = (percentage) => {
        sliderPosition = Math.max(0, Math.min(100, percentage));
        slider.style.left = `${sliderPosition}%`;
        currentImage.style.clipPath = `inset(0 0 0 ${sliderPosition}%)`;
      };

      slider.addEventListener('mousedown', (e) => {
        isDragging = true;
        e.preventDefault();
      });

      document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const rect = container.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percentage = (x / rect.width) * 100;
        updateSlider(percentage);
      });

      document.addEventListener('mouseup', () => {
        isDragging = false;
      });

      // Touch support
      slider.addEventListener('touchstart', (e) => {
        isDragging = true;
        e.preventDefault();
      });

      document.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        const rect = container.getBoundingClientRect();
        const x = e.touches[0].clientX - rect.left;
        const percentage = (x / rect.width) * 100;
        updateSlider(percentage);
      });

      document.addEventListener('touchend', () => {
        isDragging = false;
      });

      // Store updateSlider for keyboard navigation
      container.dataset.sliderPosition = sliderPosition;
      container.updateSlider = updateSlider;
    }

    function showView(index, view) {
      const sliderView = document.getElementById(`slider-view-${index}`);
      const sideBySide = document.getElementById(`side-by-side-${index}`);
      const diffOnly = document.getElementById(`diff-only-${index}`);

      sliderView.style.display = view === 'slider' ? 'block' : 'none';
      sideBySide.classList.toggle('active', view === 'side-by-side');
      diffOnly.classList.toggle('active', view === 'diff');

      // Update button states
      const buttons = sliderView.parentElement.previousElementSibling.querySelectorAll('button');
      buttons.forEach(btn => btn.classList.remove('active'));
      if (view === 'slider') buttons[0].classList.add('active');
      if (view === 'side-by-side') buttons[1].classList.add('active');
      if (view === 'diff') buttons[2].classList.add('active');
    }

    function toggleDiffOverlay(index) {
      const overlay = document.getElementById(`overlay-${index}`);
      overlay.classList.toggle('visible');
    }

    function setupFilters() {
      document.querySelectorAll('.filters button').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.filters button').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          activeFilter = btn.dataset.filter;
          renderTests();
        });
      });
    }

    function setupKeyboardNavigation() {
      document.addEventListener('keydown', (e) => {
        const expanded = Array.from(expandedTests)[0];
        if (expanded === undefined) return;

        const container = document.getElementById(`comparison-${expanded}`);
        if (!container || !container.updateSlider) return;

        if (e.key === 'ArrowLeft') {
          const pos = parseFloat(container.dataset.sliderPosition) - 5;
          container.updateSlider(pos);
          container.dataset.sliderPosition = pos;
        } else if (e.key === 'ArrowRight') {
          const pos = parseFloat(container.dataset.sliderPosition) + 5;
          container.updateSlider(pos);
          container.dataset.sliderPosition = pos;
        } else if (e.key === 'd' || e.key === 'D') {
          toggleDiffOverlay(expanded);
        }
      });
    }

    // Start
    init();
  </script>
</body>
</html>
```

### Report Generator (generator.ts)

```typescript
// src/report/generator.ts

import * as fs from 'fs';
import * as path from 'path';

interface TestResult {
  name: string;
  status: 'passed' | 'failed';
  baseline?: string;
  current?: string;
  diff?: string;
  diffPixels?: number;
  diffPercentage?: number;
}

interface ReportOptions {
  outputDir: string;
  title?: string;
  copyImages?: boolean;
}

export function generateReport(
  results: TestResult[],
  options: ReportOptions
): string {
  const { outputDir, title = 'Visual Regression Report', copyImages = true } = options;

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Read template
  const templatePath = path.join(__dirname, 'template.html');
  let template = fs.readFileSync(templatePath, 'utf-8');

  // Process results and copy images if needed
  const processedResults = results.map(result => {
    const processed = { ...result };

    if (copyImages && result.status === 'failed') {
      // Copy images to report directory
      if (result.baseline && fs.existsSync(result.baseline)) {
        const baselineFilename = `baseline_${path.basename(result.baseline)}`;
        fs.copyFileSync(result.baseline, path.join(outputDir, baselineFilename));
        processed.baseline = baselineFilename;
      }

      if (result.current && fs.existsSync(result.current)) {
        const currentFilename = `current_${path.basename(result.current)}`;
        fs.copyFileSync(result.current, path.join(outputDir, currentFilename));
        processed.current = currentFilename;
      }

      if (result.diff && fs.existsSync(result.diff)) {
        const diffFilename = `diff_${path.basename(result.diff)}`;
        fs.copyFileSync(result.diff, path.join(outputDir, diffFilename));
        processed.diff = diffFilename;
      }
    }

    return processed;
  });

  // Inject data into template
  const resultsJson = JSON.stringify(processedResults, null, 2);
  template = template.replace(
    '/* TEST_RESULTS_PLACEHOLDER */[]',
    resultsJson
  );

  // Update title
  template = template.replace(
    '<title>Visual Regression Report</title>',
    `<title>${title}</title>`
  );
  template = template.replace(
    '<h1>Visual Regression Report</h1>',
    `<h1>${title}</h1>`
  );

  // Write report
  const reportPath = path.join(outputDir, 'report.html');
  fs.writeFileSync(reportPath, template);

  console.log(`Report generated: ${reportPath}`);
  return reportPath;
}

// CLI usage
if (require.main === module) {
  const resultsPath = process.argv[2];
  const outputDir = process.argv[3] || './report';

  if (!resultsPath) {
    console.error('Usage: ts-node generator.ts <results.json> [outputDir]');
    process.exit(1);
  }

  const results = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));
  generateReport(results, { outputDir });
}
```

### Integration with Test Runner

```typescript
// In run-tests.ts, after collecting results:

import { generateReport } from './report/generator';

async function runTests() {
  // ... existing test logic ...

  const results: TestResult[] = [];

  for (const scenario of scenarios) {
    for (const viewport of viewports) {
      const result = await comparisonService.compareScreenshot(
        scenario.id,
        scenario.title,
        viewport.machine_name,
        screenshotPath
      );

      results.push({
        name: `${scenario.title} @ ${viewport.label}`,
        status: result.passed ? 'passed' : 'failed',
        baseline: baselinePath,
        current: screenshotPath,
        diff: result.diffPath,
        diffPixels: result.diffPixels,
        diffPercentage: result.diffPercentage,
      });
    }
  }

  // Generate HTML report
  generateReport(results, {
    outputDir: './reports/visual-regression',
    title: `Visual Regression Report - ${new Date().toISOString()}`,
  });

  // Print summary to console
  printResults(results);
}
```

---

## Usage

### Generate Report After Test Run

```bash
# Run tests (generates results.json)
npm run test

# Generate report
npm run generate-report
```

### View Report

```bash
# Open in browser
open ./reports/visual-regression/report.html

# Or serve with HTTP server
npx serve ./reports/visual-regression
```

---

## Features Implemented

| Feature | Status |
|---------|--------|
| Slider comparison | ✅ Complete |
| Side-by-side view | ✅ Complete |
| Diff-only view | ✅ Complete |
| Diff overlay toggle | ✅ Complete |
| Test filtering | ✅ Complete |
| Keyboard navigation | ✅ Complete |
| Touch support | ✅ Complete |
| Summary statistics | ✅ Complete |
| Self-contained HTML | ✅ Complete |

---

## References

- [Playwright HTML Reporter](https://playwright.dev/docs/test-reporters#html-reporter)
- [CSS clip-path](https://developer.mozilla.org/en-US/docs/Web/CSS/clip-path)
- [mix-blend-mode](https://developer.mozilla.org/en-US/docs/Web/CSS/mix-blend-mode)
