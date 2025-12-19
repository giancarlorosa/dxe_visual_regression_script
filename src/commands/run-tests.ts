/**
 * Run Tests Command
 * Captures screenshots and compares them against baselines
 */

import chalk from 'chalk';
import ora from 'ora';
import { loadConfig } from '../config/loader';
import { ApiService } from '../services/api';
import { ScreenshotService } from '../services/screenshot';
import { ComparisonService } from '../services/comparison';
import { Scenario, Viewport, TestResult, TestRunSummary } from '../types';

export interface RunTestsOptions {
  config?: string;
  scenario?: string[];
  viewport?: string[];
  updateBaseline?: boolean;
  headed?: boolean;
}

export async function runTests(options: RunTestsOptions): Promise<void> {
  const spinner = ora('Loading configuration...').start();

  try {
    // Load configuration
    const config = loadConfig(options.config);
    spinner.succeed('Configuration loaded');

    // Fetch scenarios from API
    spinner.start('Fetching scenarios from API...');
    const apiService = new ApiService(config);
    const payload = await apiService.fetchFilteredScenarios(
      options.scenario,
      options.viewport
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

    // Calculate total tests
    let totalTests = 0;
    for (const scenario of payload.scenarios) {
      totalTests += scenario.viewport_keys.length;
    }

    console.log();
    console.log(chalk.cyan('Running visual regression tests:'));
    console.log(chalk.cyan(`  Scenarios: ${payload.scenarios.length}`));
    console.log(chalk.cyan(`  Viewports: ${payload.viewports.length}`));
    console.log(chalk.cyan(`  Total tests: ${totalTests}`));
    console.log(chalk.cyan(`  Baseline directory: ${config.baselineDir}`));
    console.log(chalk.cyan(`  Output directory: ${config.outputDir}`));

    if (options.updateBaseline) {
      console.log(chalk.yellow(`  Mode: Update baselines on pass`));
    }

    if (options.headed) {
      console.log(chalk.yellow(`  Browser: Headed mode (visible)`));
    }

    console.log();

    // Initialize services
    spinner.start('Initializing browser...');
    const headless = options.headed ? false : config.playwright.headless;
    const screenshotService = new ScreenshotService(config, headless);
    const comparisonService = new ComparisonService(config);
    await screenshotService.initialize();
    spinner.succeed('Browser initialized');

    // Clean up previous diffs
    comparisonService.cleanDiffs();

    const results: TestResult[] = [];
    let currentTest = 0;
    const startTime = Date.now();

    spinner.start(`Running tests: 0/${totalTests}`);

    try {
      for (const scenario of payload.scenarios) {
        for (const viewportKey of scenario.viewport_keys) {
          currentTest++;
          const viewport = viewportMap.get(viewportKey);

          if (!viewport) {
            results.push({
              scenarioId: scenario.id,
              scenarioTitle: scenario.title,
              viewport: viewportKey,
              passed: false,
              error: `Viewport not found: ${viewportKey}`,
            });
            continue;
          }

          spinner.text = `Running tests: ${currentTest}/${totalTests} - ${scenario.title} @ ${viewport.label}`;

          try {
            // Capture screenshot
            const screenshotPath = await screenshotService.captureWithRetry(
              scenario,
              viewport,
              config.outputDir
            );

            // Check if baseline exists
            if (!comparisonService.baselineExists(scenario.id, viewportKey)) {
              if (options.updateBaseline) {
                // Create baseline from current screenshot
                comparisonService.copyToBaseline(screenshotPath, scenario.id, viewportKey);
                results.push({
                  scenarioId: scenario.id,
                  scenarioTitle: scenario.title,
                  viewport: viewportKey,
                  passed: true,
                  screenshotPath,
                  baselinePath: comparisonService.getBaselinePath(scenario.id, viewportKey),
                });
              } else {
                results.push({
                  scenarioId: scenario.id,
                  scenarioTitle: scenario.title,
                  viewport: viewportKey,
                  passed: false,
                  error: 'Baseline not found. Run generate-baseline first or use --update-baseline.',
                  screenshotPath,
                });
              }
              continue;
            }

            // Compare with baseline
            const comparisonResult = await comparisonService.compareScreenshot(
              scenario.id,
              viewportKey,
              screenshotPath
            );

            comparisonResult.scenarioTitle = scenario.title;

            // Update baseline if option set and test passed
            if (options.updateBaseline && comparisonResult.passed) {
              comparisonService.copyToBaseline(screenshotPath, scenario.id, viewportKey);
            }

            results.push(comparisonResult);
          } catch (error) {
            results.push({
              scenarioId: scenario.id,
              scenarioTitle: scenario.title,
              viewport: viewportKey,
              passed: false,
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          }
        }
      }

      spinner.succeed(`Completed ${totalTests} tests`);
    } finally {
      await screenshotService.close();
    }

    const duration = Date.now() - startTime;

    // Calculate summary
    const summary: TestRunSummary = {
      total: results.length,
      passed: results.filter((r) => r.passed).length,
      failed: results.filter((r) => !r.passed).length,
      skipped: 0,
      duration,
      results,
    };

    // Print results
    console.log();
    printResults(results, summary);

    // Exit with error code if tests failed
    if (summary.failed > 0) {
      process.exit(1);
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

function printResults(results: TestResult[], summary: TestRunSummary): void {
  // Print individual test results
  console.log(chalk.bold('Test Results:'));
  console.log();

  for (const result of results) {
    const status = result.passed
      ? chalk.green('PASS')
      : chalk.red('FAIL');

    const testName = `${result.scenarioTitle} @ ${result.viewport}`;

    if (result.passed) {
      console.log(`  ${status} ${testName}`);
    } else {
      console.log(`  ${status} ${testName}`);

      if (result.error) {
        console.log(`       ${chalk.red('Error:')} ${result.error}`);
      } else if (result.diffPixels !== undefined && result.diffPixels > 0) {
        console.log(
          `       ${chalk.red('Diff:')} ${result.diffPixels} pixels (${result.diffPercentage?.toFixed(2)}%)`
        );
        if (result.diffPath) {
          console.log(`       ${chalk.red('Diff image:')} ${result.diffPath}`);
        }
      }
    }
  }

  // Print summary
  console.log();
  console.log(chalk.bold('Summary:'));
  console.log();

  const passRate = ((summary.passed / summary.total) * 100).toFixed(1);
  const durationSec = (summary.duration / 1000).toFixed(2);

  console.log(`  Total:    ${summary.total}`);
  console.log(`  ${chalk.green('Passed:')}  ${summary.passed}`);
  console.log(`  ${chalk.red('Failed:')}  ${summary.failed}`);
  console.log(`  Pass Rate: ${passRate}%`);
  console.log(`  Duration: ${durationSec}s`);
  console.log();

  if (summary.failed === 0) {
    console.log(chalk.green.bold('All tests passed!'));
  } else {
    console.log(chalk.red.bold(`${summary.failed} test(s) failed.`));
    console.log();
    console.log('To update baselines for failing tests:');
    console.log(chalk.cyan('  vrt run-tests --update-baseline'));
  }
}
