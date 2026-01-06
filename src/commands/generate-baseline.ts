/**
 * Generate Baseline Command
 * Captures baseline screenshots for all scenarios
 */

import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { loadConfig } from '../config/loader';
import { ApiService } from '../services/api';
import { ScreenshotService } from '../services/screenshot';
import { loadFailedTests, clearFailedTests } from '../services/failed-tracker';
import { replaceDomain } from '../utils/url';
import { Scenario, Viewport } from '../types';

/**
 * Clean the baseline directory by removing all files
 */
function cleanBaselineDirectory(baselineDir: string): number {
  if (!fs.existsSync(baselineDir)) {
    return 0;
  }

  const files = fs.readdirSync(baselineDir);
  let removedCount = 0;

  for (const file of files) {
    const filePath = path.join(baselineDir, file);
    const stat = fs.statSync(filePath);

    if (stat.isFile() && file.endsWith('.png')) {
      fs.unlinkSync(filePath);
      removedCount++;
    }
  }

  return removedCount;
}

export interface GenerateBaselineOptions {
  config?: string;
  scenario?: string[];
  viewport?: string[];
  headed?: boolean;
  failed?: boolean;
}

export async function generateBaseline(options: GenerateBaselineOptions): Promise<void> {
  const spinner = ora('Loading configuration...').start();

  try {
    // Load configuration
    const config = loadConfig(options.config);
    spinner.succeed('Configuration loaded');

    // Handle --failed flag
    let scenarioFilter = options.scenario;
    let viewportFilter = options.viewport;
    const isFailedMode = options.failed;

    if (isFailedMode) {
      const failedTests = loadFailedTests();
      if (failedTests.length === 0) {
        spinner.succeed('No failed tests to regenerate baselines for');
        console.log();
        console.log(chalk.green('All tests passed in the last run!'));
        return;
      }

      // Extract unique scenario IDs from failed tests
      scenarioFilter = [...new Set(failedTests.map(t => t.scenarioId))];
      spinner.succeed(`Found ${failedTests.length} failed tests from last run`);
      spinner.start('Fetching scenarios from API...');
    }

    // Fetch scenarios from API
    spinner.start('Fetching scenarios from API...');
    const apiService = new ApiService(config);
    const payload = await apiService.fetchFilteredScenarios(
      scenarioFilter,
      viewportFilter
    );
    spinner.succeed(`Fetched ${payload.meta.scenario_count} scenarios with ${payload.meta.viewport_count} viewports`);

    // Warn if regenerating
    if (payload.meta.is_regenerating) {
      console.log();
      console.log(
        chalk.yellow('Warning: Scenarios are currently being regenerated.')
      );
      console.log(
        chalk.yellow('Results may be incomplete. Consider waiting for regeneration to complete.')
      );
      console.log();
    }

    // Check if there are scenarios to process
    if (payload.scenarios.length === 0) {
      console.log();
      console.log(chalk.yellow('No scenarios to process.'));

      if (options.scenario || options.viewport) {
        console.log(chalk.yellow('Check your filter options:'));
        if (options.scenario) {
          console.log(chalk.yellow(`  --scenario: ${options.scenario.join(', ')}`));
        }
        if (options.viewport) {
          console.log(chalk.yellow(`  --viewport: ${options.viewport.join(', ')}`));
        }
      }

      return;
    }

    // Build viewport map
    const viewportMap = new Map<string, Viewport>();
    for (const viewport of payload.viewports) {
      viewportMap.set(viewport.machine_name, viewport);
    }

    // Calculate total screenshots to capture
    let totalScreenshots = 0;
    for (const scenario of payload.scenarios) {
      totalScreenshots += scenario.viewport_keys.length;
    }

    console.log();
    console.log(chalk.cyan('Generating baselines:'));
    console.log(chalk.cyan(`  Scenarios: ${payload.scenarios.length}`));
    console.log(chalk.cyan(`  Viewports: ${payload.viewports.length}`));
    console.log(chalk.cyan(`  Total screenshots: ${totalScreenshots}`));
    console.log(chalk.cyan(`  Workers: ${config.playwright.workers}`));
    console.log(chalk.cyan(`  Output directory: ${config.baselineDir}`));

    if (config.baselineDomain) {
      console.log(chalk.magenta(`  Baseline domain: ${config.baselineDomain}`));
    }

    if (options.headed) {
      console.log(chalk.yellow(`  Browser: Headed mode (visible)`));
    }

    console.log();

    // Apply baselineDomain transformation if configured
    const scenariosToCapture = config.baselineDomain
      ? payload.scenarios.map(s => ({
          ...s,
          url: replaceDomain(s.url, config.baselineDomain)
        }))
      : payload.scenarios;

    // Clean existing baselines (skip when using --failed to preserve other baselines)
    if (!isFailedMode) {
      spinner.start('Cleaning existing baselines...');
      const removedCount = cleanBaselineDirectory(config.baselineDir);
      if (removedCount > 0) {
        spinner.succeed(`Removed ${removedCount} existing baseline(s)`);
      } else {
        spinner.succeed('Baseline directory is clean');
      }
    } else {
      console.log(chalk.cyan('  (Skipping clean - only regenerating failed baselines)'));
    }

    // Initialize screenshot service
    spinner.start('Initializing browser...');
    const headless = options.headed ? false : config.playwright.headless;
    const screenshotService = new ScreenshotService(config, headless);
    await screenshotService.initialize();
    spinner.succeed('Browser initialized');

    let captured = 0;
    let failed = 0;
    const startTime = Date.now();

    // Progress callback
    const onProgress = (
      current: number,
      total: number,
      scenario: Scenario,
      viewport: Viewport
    ) => {
      spinner.text = `Capturing ${current}/${total}: ${scenario.title} @ ${viewport.label}`;
    };

    spinner.start(`Capturing 0/${totalScreenshots}...`);

    try {
      // Capture all screenshots
      const results = await screenshotService.captureAll(
        scenariosToCapture,
        payload.viewports,
        config.baselineDir,
        onProgress
      );

      captured = results.size;
      failed = totalScreenshots - captured;

      spinner.succeed(`Captured ${captured}/${totalScreenshots} screenshots`);
    } catch (error) {
      spinner.fail('Error during capture');
      throw error;
    } finally {
      await screenshotService.close();
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    // Print summary
    console.log();
    console.log(chalk.green.bold('Baseline Generation Complete'));
    console.log();
    console.log(`  ${chalk.green('Captured:')} ${captured}`);

    if (failed > 0) {
      console.log(`  ${chalk.red('Failed:')} ${failed}`);
    }

    console.log(`  ${chalk.cyan('Duration:')} ${duration}s`);
    console.log(`  ${chalk.cyan('Output:')} ${config.baselineDir}`);
    console.log();

    if (failed > 0) {
      console.log(
        chalk.yellow('Some screenshots failed to capture. Review the errors above.')
      );
      process.exit(1);
    }

    // Clear failed tests file after successful baseline generation
    if (isFailedMode) {
      clearFailedTests();
      console.log(chalk.green('Failed tests cleared. Run "npm run test" to verify.'));
    } else {
      console.log(chalk.green('Baselines are ready. Run "npm run test" to compare against them.'));
    }
  } catch (error) {
    spinner.fail('Error');
    console.log();

    if (error instanceof Error) {
      console.log(chalk.red('Error:'), error.message);
    } else {
      console.log(chalk.red('Unknown error occurred'));
    }

    process.exit(1);
  }
}
