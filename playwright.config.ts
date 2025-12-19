import { defineConfig } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// Load VRT config
function loadVrtConfig() {
  const configPath = path.resolve(__dirname, '.vrtrc.json');
  try {
    const configData = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(configData);
  } catch (error) {
    console.error('Error reading .vrtrc.json:', error);
    return {};
  }
}

const vrtConfig = loadVrtConfig();

export default defineConfig({
  testDir: './tests',
  timeout: vrtConfig.playwright?.timeout || 30000,
  expect: {
    timeout: vrtConfig.playwright?.screenshotTimeout || 10000,
    toHaveScreenshot: {
      threshold: vrtConfig.comparison?.threshold || 0.1,
      maxDiffPixels: vrtConfig.comparison?.maxDiffPixels || 100,
      maxDiffPixelRatio: vrtConfig.comparison?.maxDiffPixelRatio || 0.01,
      animations: 'disabled',
    },
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,

  // Reporters - HTML report for visual diff viewing
  reporter: [
    ['html', { outputFolder: './reports/html-report', open: 'never' }],
    ['json', { outputFile: './reports/test-results.json' }],
    ['list'],
  ],

  // Global settings
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    ignoreHTTPSErrors: vrtConfig.insecure || false,
  },

  // Snapshot configuration
  snapshotDir: './baselines',
  snapshotPathTemplate: '{snapshotDir}/{testFilePath}/{arg}{ext}',

  // Output directories
  outputDir: './test-results',

  // Global setup to fetch scenarios from API
  globalSetup: './global-setup.ts',
});
