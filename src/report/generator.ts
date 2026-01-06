/**
 * Report Generator
 * Generates HTML reports for visual regression test results
 */

import * as fs from 'fs';
import * as path from 'path';
import { ReportTestResult } from '../types';

export interface ReportOptions {
  outputDir: string;
  title?: string;
  copyImages?: boolean;
}

export interface ReportResult {
  reportPath: string;
  imagesDir: string;
  totalTests: number;
  passedTests: number;
  failedTests: number;
}

/**
 * Generate an HTML report from test results
 */
export function generateReport(
  results: ReportTestResult[],
  options: ReportOptions
): ReportResult {
  const { outputDir, title = 'Visual Regression Report', copyImages = true } = options;

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Create images subdirectory
  const imagesDir = path.join(outputDir, 'images');
  if (copyImages && !fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
  }

  // Read template
  const templatePath = path.join(__dirname, 'template.html');
  let template = fs.readFileSync(templatePath, 'utf-8');

  // Process results and copy images if needed
  const processedResults = results.map((result, index) => {
    const processed: ReportTestResult = { ...result };

    if (copyImages) {
      // Copy baseline image
      if (result.baseline && fs.existsSync(result.baseline)) {
        const baselineFilename = `baseline_${index}_${path.basename(result.baseline)}`;
        const destPath = path.join(imagesDir, baselineFilename);
        fs.copyFileSync(result.baseline, destPath);
        processed.baseline = `images/${baselineFilename}`;
      }

      // Copy current screenshot
      if (result.current && fs.existsSync(result.current)) {
        const currentFilename = `current_${index}_${path.basename(result.current)}`;
        const destPath = path.join(imagesDir, currentFilename);
        fs.copyFileSync(result.current, destPath);
        processed.current = `images/${currentFilename}`;
      }

      // Copy diff image
      if (result.diff && fs.existsSync(result.diff)) {
        const diffFilename = `diff_${index}_${path.basename(result.diff)}`;
        const destPath = path.join(imagesDir, diffFilename);
        fs.copyFileSync(result.diff, destPath);
        processed.diff = `images/${diffFilename}`;
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
    `<title>${escapeHtml(title)}</title>`
  );
  template = template.replace(
    '<h1>Visual Regression Report</h1>',
    `<h1>${escapeHtml(title)}</h1>`
  );

  // Write report
  const reportPath = path.join(outputDir, 'index.html');
  fs.writeFileSync(reportPath, template);

  // Calculate stats
  const passedTests = results.filter(r => r.status === 'passed').length;
  const failedTests = results.filter(r => r.status === 'failed').length;

  return {
    reportPath,
    imagesDir,
    totalTests: results.length,
    passedTests,
    failedTests,
  };
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Clean up old report files
 */
export function cleanReport(outputDir: string): void {
  if (fs.existsSync(outputDir)) {
    // Remove images directory
    const imagesDir = path.join(outputDir, 'images');
    if (fs.existsSync(imagesDir)) {
      const files = fs.readdirSync(imagesDir);
      for (const file of files) {
        fs.unlinkSync(path.join(imagesDir, file));
      }
      fs.rmdirSync(imagesDir);
    }

    // Remove index.html
    const indexPath = path.join(outputDir, 'index.html');
    if (fs.existsSync(indexPath)) {
      fs.unlinkSync(indexPath);
    }
  }
}
