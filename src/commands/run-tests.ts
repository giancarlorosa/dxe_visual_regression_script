/**
 * Run Tests Command
 * Captures screenshots and compares them against baselines
 */

import * as path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { loadConfig } from '../config/loader';
import { ApiService } from '../services/api';
import { ScreenshotService } from '../services/screenshot';
import { ComparisonService } from '../services/comparison';
import { generateReport, cleanReport } from '../report/generator';
import { saveFailedTests, loadFailedTests, clearFailedTests, FailedTest } from '../services/failed-tracker';
import { replaceDomain } from '../utils/url';
import { Scenario, Viewport, TestResult, TestRunSummary, ReportTestResult } from '../types';

export interface RunTestsOptions {
  config?: string;
  scenario?: string[];
  viewport?: string[];
  updateBaseline?: boolean;
  headed?: boolean;
  failed?: boolean;
}

export async function runTests(options: RunTestsOptions): Promise<void> {
  const spinner = ora('Loading configuration...').start();

  try {
    // Load configuration
    const config = loadConfig(options.config);
    spinner.succeed('Configuration loaded');

    // Handle --failed flag
    let scenarioFilter = options.scenario;
    let viewportFilter = options.viewport;

    if (options.failed) {
      const failedTests = loadFailedTests();
      if (failedTests.length === 0) {
        spinner.succeed('No failed tests to re-run');
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
    console.log(chalk.cyan(`  Workers: ${config.playwright.workers}`));
    console.log(chalk.cyan(`  Baseline directory: ${config.baselineDir}`));
    console.log(chalk.cyan(`  Output directory: ${config.outputDir}`));

    if (config.testDomain) {
      console.log(chalk.magenta(`  Test domain: ${config.testDomain}`));
    }

    if (options.updateBaseline) {
      console.log(chalk.yellow(`  Mode: Update baselines on pass`));
    }

    if (options.headed) {
      console.log(chalk.yellow(`  Browser: Headed mode (visible)`));
    }

    console.log();

    // Compute baseline URLs for each scenario (using original API URL + baselineDomain)
    const baselineUrlMap = new Map<string, string>();
    for (const scenario of payload.scenarios) {
      baselineUrlMap.set(
        scenario.id,
        replaceDomain(scenario.url, config.baselineDomain)
      );
    }

    // Apply testDomain transformation if configured
    const scenariosToTest = config.testDomain
      ? payload.scenarios.map(s => ({
          ...s,
          url: replaceDomain(s.url, config.testDomain)
        }))
      : payload.scenarios;

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
    const startTime = Date.now();

    // Build task queue for parallel processing
    interface TestTask {
      scenario: Scenario;
      viewport: Viewport;
      viewportKey: string;
    }

    const tasks: TestTask[] = [];
    for (const scenario of scenariosToTest) {
      for (const viewportKey of scenario.viewport_keys) {
        const viewport = viewportMap.get(viewportKey);
        if (viewport) {
          tasks.push({ scenario, viewport, viewportKey });
        } else {
          // Handle missing viewport immediately
          results.push({
            scenarioId: scenario.id,
            scenarioTitle: scenario.title,
            scenarioUrl: scenario.url,
            baselineUrl: baselineUrlMap.get(scenario.id),
            viewport: viewportKey,
            passed: false,
            error: `Viewport not found: ${viewportKey}`,
          });
        }
      }
    }

    // Shared counters for progress tracking
    const counters = {
      completed: 0,
      passed: 0,
      failed: 0,
      taskIndex: 0,
    };

    // Helper to update spinner with optional scenario info for debugging
    const updateSpinner = (currentScenario?: Scenario, currentViewport?: Viewport) => {
      const passedText = chalk.green(`Passed: ${counters.passed}`);
      const failedText = counters.failed > 0 ? chalk.red(`Failed: ${counters.failed}`) : `Failed: ${counters.failed}`;

      let statusLine = `Testing: ${counters.completed}/${totalTests} | ${passedText} | ${failedText}`;

      // Show current scenario being processed for debugging hangs
      if (currentScenario && currentViewport) {
        statusLine += `\n  → ${currentScenario.title} @ ${currentViewport.label}`;
        statusLine += `\n  → ${currentScenario.url}`;
      }

      spinner.text = statusLine;
    };

    // Worker function that captures and compares
    const processTask = async (): Promise<void> => {
      while (true) {
        const taskIdx = counters.taskIndex++;
        if (taskIdx >= tasks.length) break;

        const task = tasks[taskIdx];
        let testResult: TestResult;

        // Update spinner to show current scenario being processed (helps debug hangs)
        updateSpinner(task.scenario, task.viewport);

        try {
          // Capture screenshot
          const screenshotPath = await screenshotService.captureWithRetry(
            task.scenario,
            task.viewport,
            config.outputDir
          );

          // Check if baseline exists
          if (!comparisonService.baselineExists(task.scenario.id, task.viewportKey)) {
            if (options.updateBaseline) {
              comparisonService.copyToBaseline(screenshotPath, task.scenario.id, task.viewportKey);
              testResult = {
                scenarioId: task.scenario.id,
                scenarioTitle: task.scenario.title,
                scenarioUrl: task.scenario.url,
                baselineUrl: baselineUrlMap.get(task.scenario.id),
                viewport: task.viewportKey,
                passed: true,
                screenshotPath,
                baselinePath: comparisonService.getBaselinePath(task.scenario.id, task.viewportKey),
              };
            } else {
              testResult = {
                scenarioId: task.scenario.id,
                scenarioTitle: task.scenario.title,
                scenarioUrl: task.scenario.url,
                baselineUrl: baselineUrlMap.get(task.scenario.id),
                viewport: task.viewportKey,
                passed: false,
                error: 'Baseline not found. Run generate-baseline first or use --update-baseline.',
                screenshotPath,
              };
            }
          } else {
            // Compare with baseline immediately after capture
            const comparisonResult = await comparisonService.compareScreenshot(
              task.scenario.id,
              task.viewportKey,
              screenshotPath
            );

            comparisonResult.scenarioTitle = task.scenario.title;
            comparisonResult.scenarioUrl = task.scenario.url;
            comparisonResult.baselineUrl = baselineUrlMap.get(task.scenario.id);

            if (options.updateBaseline && comparisonResult.passed) {
              comparisonService.copyToBaseline(screenshotPath, task.scenario.id, task.viewportKey);
            }

            testResult = comparisonResult;
          }
        } catch (error) {
          testResult = {
            scenarioId: task.scenario.id,
            scenarioTitle: task.scenario.title,
            scenarioUrl: task.scenario.url,
            baselineUrl: baselineUrlMap.get(task.scenario.id),
            viewport: task.viewportKey,
            passed: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }

        // Update counters and results
        counters.completed++;
        if (testResult.passed) {
          counters.passed++;
        } else {
          counters.failed++;
        }
        results.push(testResult);
        updateSpinner();
      }
    };

    spinner.start(`Testing: 0/${totalTests} | Passed: 0 | Failed: 0`);

    try {
      // Run workers in parallel
      const numWorkers = Math.min(config.playwright.workers, tasks.length);
      const workers: Promise<void>[] = [];
      for (let i = 0; i < numWorkers; i++) {
        workers.push(processTask());
      }
      await Promise.all(workers);

      const passedFinal = chalk.green(`Passed: ${counters.passed}`);
      const failedFinal = counters.failed > 0 ? chalk.red(`Failed: ${counters.failed}`) : `Failed: ${counters.failed}`;
      spinner.succeed(`Completed ${totalTests} tests | ${passedFinal} | ${failedFinal}`);
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

    // Save failed tests for --failed flag
    const failedTests: FailedTest[] = results
      .filter((r) => !r.passed)
      .map((r) => ({
        scenarioId: r.scenarioId,
        viewport: r.viewport,
      }));

    if (failedTests.length > 0) {
      saveFailedTests(failedTests);
    } else {
      clearFailedTests();
    }

    // Generate HTML report
    spinner.start('Generating HTML report...');
    const reportDir = path.join(process.cwd(), 'vrt-report');
    cleanReport(reportDir);

    const reportResults: ReportTestResult[] = results.map((result) => ({
      name: `${result.scenarioTitle} @ ${result.viewport}`,
      url: result.scenarioUrl,
      baselineUrl: result.baselineUrl,
      status: result.passed ? 'passed' : 'failed',
      baseline: result.baselinePath,
      current: result.screenshotPath,
      diff: result.diffPath,
      diffPixels: result.diffPixels,
      diffPercentage: result.diffPercentage,
      warning: result.warning,
    }));

    const reportResult = generateReport(reportResults, {
      outputDir: reportDir,
      title: 'Visual Regression Report',
      copyImages: true,
    });

    spinner.succeed(`Report generated: ${reportResult.reportPath}`);

    // Print results
    console.log();
    printResults(results, summary);

    // Print report location
    console.log();
    console.log(chalk.cyan('View the detailed report:'));
    console.log(chalk.cyan(`  npm run report`));
    console.log(chalk.cyan(`  or open: ${reportResult.reportPath}`));

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
      let suffix = '';
      if (result.warning === 'dimension-mismatch') {
        suffix = chalk.yellow(' (dimension mismatch ignored)');
      }
      console.log(`  ${status} ${testName}${suffix}`);
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
    console.log(chalk.cyan('  npm run vrt:update-baseline'));
  }
}
