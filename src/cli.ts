#!/usr/bin/env node
/**
 * Visual Regression Testing CLI
 * Main entry point for the command-line interface
 */

import { Command } from 'commander';
import { testConnection } from './commands/test-connection';
import { generateBaseline } from './commands/generate-baseline';
import { runTests } from './commands/run-tests';
import { cleanData } from './commands/clean';
import { createDefaultConfig, configExists, getConfigPath } from './config/loader';
import chalk from 'chalk';

const program = new Command();

program
  .name('vrt')
  .description('Visual Regression Testing CLI - Playwright-based screenshot comparison')
  .version('1.0.0');

// Test Connection Command
program
  .command('test-connection')
  .description('Test connectivity to the API endpoint')
  .option('-c, --config <path>', 'Path to configuration file')
  .action(testConnection);

// Generate Baseline Command
program
  .command('generate-baseline')
  .description('Capture baseline screenshots for all scenarios')
  .option('-c, --config <path>', 'Path to configuration file')
  .option(
    '-s, --scenario <ids...>',
    'Filter by scenario IDs or titles (can specify multiple)'
  )
  .option(
    '-v, --viewport <keys...>',
    'Filter by viewport keys (can specify multiple)'
  )
  .option(
    '--headed',
    'Run browser in headed mode (visible) for debugging'
  )
  .option(
    '-f, --failed',
    'Only regenerate baselines for scenarios that failed in the last test run'
  )
  .action(generateBaseline);

// Run Tests Command
program
  .command('run-tests')
  .description('Capture screenshots and compare against baselines')
  .option('-c, --config <path>', 'Path to configuration file')
  .option(
    '-s, --scenario <ids...>',
    'Filter by scenario IDs or titles (can specify multiple)'
  )
  .option(
    '-v, --viewport <keys...>',
    'Filter by viewport keys (can specify multiple)'
  )
  .option(
    '-u, --update-baseline',
    'Update baselines for passing tests'
  )
  .option(
    '--headed',
    'Run browser in headed mode (visible) for debugging'
  )
  .option(
    '-f, --failed',
    'Only run tests that failed in the last run'
  )
  .action(runTests);

// Report Command - Open Playwright HTML report
program
  .command('report')
  .description('Open Playwright HTML report with visual diff comparisons')
  .action(async () => {
    const { execSync } = await import('child_process');
    try {
      console.log(chalk.cyan('Opening Playwright HTML report...'));
      execSync('npx playwright show-report ./reports/html-report', { stdio: 'inherit' });
    } catch {
      console.log(chalk.yellow('No report found. Run tests first: npm run test'));
    }
  });

// Clean Command - Remove all generated data
program
  .command('clean')
  .description('Remove all generated data (baselines, screenshots, diffs, reports, failed tests)')
  .option('-c, --config <path>', 'Path to configuration file')
  .option('-y, --yes', 'Skip confirmation prompt')
  .action(cleanData);

// Init Command - Create default config
program
  .command('init')
  .description('Create a default configuration file')
  .option('-f, --force', 'Overwrite existing configuration')
  .action((options) => {
    if (configExists() && !options.force) {
      console.log(chalk.yellow('Configuration file already exists.'));
      console.log(chalk.yellow(`Location: ${getConfigPath()}`));
      console.log();
      console.log('Use --force to overwrite the existing configuration.');
      return;
    }

    const configPath = createDefaultConfig();
    console.log(chalk.green('Configuration file created successfully!'));
    console.log();
    console.log(`Location: ${chalk.cyan(configPath)}`);
    console.log();
    console.log('Next steps:');
    console.log('  1. Edit the configuration file with your API endpoint');
    console.log('  2. Add your bearer token (if required)');
    console.log('  3. Run: vrt test-connection');
    console.log('  4. Run: vrt generate-baseline');
    console.log('  5. Run: vrt run-tests');
  });

// List Command - List available scenarios and viewports
program
  .command('list')
  .description('List available scenarios and viewports from the API')
  .option('-c, --config <path>', 'Path to configuration file')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    const ora = (await import('ora')).default;
    const spinner = ora('Loading configuration...').start();

    try {
      const { loadConfig } = await import('./config/loader');
      const { ApiService } = await import('./services/api');

      const config = loadConfig(options.config);
      spinner.succeed('Configuration loaded');

      spinner.start('Fetching scenarios...');
      const apiService = new ApiService(config);
      const payload = await apiService.fetchScenarios();
      spinner.succeed('Scenarios fetched');

      if (options.json) {
        console.log(JSON.stringify(payload, null, 2));
        return;
      }

      console.log();
      console.log(chalk.bold('Viewports:'));
      console.log();

      for (const viewport of payload.viewports) {
        console.log(`  ${chalk.cyan(viewport.machine_name)}`);
        console.log(`    Label: ${viewport.label}`);
        console.log(`    Size: ${viewport.width}x${viewport.height}`);
        console.log(`    Scale Factor: ${viewport.device_scale_factor}`);
        console.log(`    Full Page: ${viewport.full_page}`);
        console.log();
      }

      console.log(chalk.bold('Scenarios:'));
      console.log();

      for (const scenario of payload.scenarios) {
        const mode =
          scenario.mode === 'interactive'
            ? chalk.yellow('interactive')
            : chalk.green('static');

        console.log(`  ${chalk.cyan(scenario.id)}`);
        console.log(`    Title: ${scenario.title}`);
        console.log(`    URL: ${scenario.url}`);
        console.log(`    Mode: ${mode}`);
        console.log(`    Wait: ${scenario.wait_time_ms}ms`);
        console.log(`    Viewports: ${scenario.viewport_keys.join(', ')}`);

        if (scenario.interactions.length > 0) {
          console.log(`    Interactions: ${scenario.interactions.length}`);
        }

        console.log();
      }

      console.log(chalk.bold('Summary:'));
      console.log(`  Scenarios: ${payload.meta.scenario_count}`);
      console.log(`  Viewports: ${payload.meta.viewport_count}`);
      console.log(`  Generated: ${payload.meta.generated_at}`);

      if (payload.meta.is_regenerating) {
        console.log();
        console.log(chalk.yellow('Warning: Scenarios are currently being regenerated.'));
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
  });

// Parse command line arguments
program.parse();

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
