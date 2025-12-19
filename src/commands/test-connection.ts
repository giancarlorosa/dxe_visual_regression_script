/**
 * Test Connection Command
 * Tests connectivity to the API endpoint before running tests
 */

import chalk from 'chalk';
import ora from 'ora';
import { loadConfig } from '../config/loader';
import { ApiService } from '../services/api';

export interface TestConnectionOptions {
  config?: string;
}

export async function testConnection(options: TestConnectionOptions): Promise<void> {
  const spinner = ora('Loading configuration...').start();

  try {
    // Load configuration
    const config = loadConfig(options.config);
    spinner.succeed('Configuration loaded');

    // Display endpoint info
    console.log();
    console.log(chalk.cyan('Endpoint:'), config.endpoint);
    console.log(chalk.cyan('Token:'), config.token ? chalk.green('Configured') : chalk.yellow('Not set'));
    console.log(chalk.cyan('Insecure:'), config.insecure ? chalk.yellow('Yes (SSL verification disabled)') : 'No');
    console.log();

    // Test connection
    spinner.start('Testing connection to API endpoint...');

    const apiService = new ApiService(config);
    const result = await apiService.testConnection();

    if (result.success) {
      spinner.succeed('Connection successful!');
      console.log();
      console.log(chalk.green('  Status:'), chalk.bold('Connected'));
      console.log(chalk.green('  HTTP Status:'), result.statusCode);
      console.log(chalk.green('  Response Time:'), `${result.responseTime}ms`);
      console.log();
      console.log(chalk.cyan('  Scenarios:'), result.scenarioCount);
      console.log(chalk.cyan('  Viewports:'), result.viewportCount);
      console.log(chalk.cyan('  Token Required:'), result.tokenRequired ? 'Yes' : 'No');
      console.log(chalk.cyan('  Is Regenerating:'), result.isRegenerating ? chalk.yellow('Yes') : 'No');

      if (result.isRegenerating) {
        console.log();
        console.log(
          chalk.yellow('  Warning: Scenarios are currently being regenerated.')
        );
        console.log(
          chalk.yellow('  Wait for regeneration to complete before running tests.')
        );
      }

      console.log();
      console.log(chalk.green.bold('Ready to run visual regression tests!'));
    } else {
      spinner.fail('Connection failed');
      console.log();
      console.log(chalk.red('  Status:'), chalk.bold('Failed'));

      if (result.statusCode) {
        console.log(chalk.red('  HTTP Status:'), result.statusCode);
      }

      if (result.responseTime) {
        console.log(chalk.red('  Response Time:'), `${result.responseTime}ms`);
      }

      console.log(chalk.red('  Error:'), result.error);
      console.log();

      // Provide helpful suggestions
      if (result.statusCode === 401) {
        console.log(chalk.yellow('Suggestions:'));
        console.log(chalk.yellow('  - Check if the bearer token is correct'));
        console.log(chalk.yellow('  - Verify the token has not been rotated'));
        console.log(chalk.yellow('  - Ensure VRT_TOKEN environment variable is set'));
      } else if (result.error?.includes('Connection refused')) {
        console.log(chalk.yellow('Suggestions:'));
        console.log(chalk.yellow('  - Verify the endpoint URL is correct'));
        console.log(chalk.yellow('  - Check if the server is running'));
        console.log(chalk.yellow('  - Ensure the server is accessible from this machine'));
      } else if (result.error?.includes('timeout')) {
        console.log(chalk.yellow('Suggestions:'));
        console.log(chalk.yellow('  - Increase the timeout in configuration'));
        console.log(chalk.yellow('  - Check network connectivity'));
        console.log(chalk.yellow('  - Verify the server is not overloaded'));
      } else if (result.error?.includes('DNS')) {
        console.log(chalk.yellow('Suggestions:'));
        console.log(chalk.yellow('  - Verify the endpoint URL is correct'));
        console.log(chalk.yellow('  - Check DNS resolution'));
        console.log(chalk.yellow('  - Try using the IP address instead'));
      }

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
