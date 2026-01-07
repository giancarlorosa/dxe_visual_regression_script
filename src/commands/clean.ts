/**
 * Clean Command
 * Removes all generated data (baselines, screenshots, diffs, reports, failed tests)
 * Useful when copying the test folder to a new project
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import chalk from 'chalk';
import ora from 'ora';
import { loadConfig, configExists } from '../config/loader';

export interface CleanOptions {
  config?: string;
  yes?: boolean;
}

/**
 * Remove a directory and all its contents recursively
 */
function removeDirectory(dirPath: string): number {
  if (!fs.existsSync(dirPath)) {
    return 0;
  }

  let count = 0;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      count += removeDirectory(fullPath);
    } else {
      fs.unlinkSync(fullPath);
      count++;
    }
  }

  fs.rmdirSync(dirPath);
  return count;
}

/**
 * Remove a file if it exists
 */
function removeFile(filePath: string): boolean {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
}

/**
 * Prompt user for confirmation
 */
async function confirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} (y/N): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

export async function cleanData(options: CleanOptions): Promise<void> {
  const spinner = ora('Analyzing project data...').start();

  try {
    // Try to load config for directory paths, but use defaults if not available
    let baselineDir = './baselines';
    let outputDir = './screenshots';
    let diffDir = './diffs';

    if (configExists()) {
      try {
        const config = loadConfig(options.config);
        baselineDir = config.baselineDir;
        outputDir = config.outputDir;
        diffDir = config.diffDir;
      } catch {
        // Use defaults if config loading fails
      }
    }

    // Resolve paths
    const cwd = process.cwd();
    const paths = {
      baselines: path.resolve(cwd, baselineDir),
      screenshots: path.resolve(cwd, outputDir),
      diffs: path.resolve(cwd, diffDir),
      vrtReport: path.resolve(cwd, 'vrt-report'),
      reports: path.resolve(cwd, 'reports'),
      failedTests: path.resolve(cwd, '.vrt-failed.json'),
      reportHtml: path.resolve(cwd, 'report.html'),
    };

    // Check what exists
    const existing: { name: string; path: string; type: 'dir' | 'file' }[] = [];

    if (fs.existsSync(paths.baselines)) {
      existing.push({ name: 'Baselines', path: paths.baselines, type: 'dir' });
    }
    if (fs.existsSync(paths.screenshots)) {
      existing.push({ name: 'Screenshots', path: paths.screenshots, type: 'dir' });
    }
    if (fs.existsSync(paths.diffs)) {
      existing.push({ name: 'Diffs', path: paths.diffs, type: 'dir' });
    }
    if (fs.existsSync(paths.vrtReport)) {
      existing.push({ name: 'VRT Report', path: paths.vrtReport, type: 'dir' });
    }
    if (fs.existsSync(paths.reports)) {
      existing.push({ name: 'Reports', path: paths.reports, type: 'dir' });
    }
    if (fs.existsSync(paths.failedTests)) {
      existing.push({ name: 'Failed tests tracker', path: paths.failedTests, type: 'file' });
    }
    if (fs.existsSync(paths.reportHtml)) {
      existing.push({ name: 'Report HTML', path: paths.reportHtml, type: 'file' });
    }

    spinner.stop();

    if (existing.length === 0) {
      console.log(chalk.green('Nothing to clean - no generated data found.'));
      return;
    }

    // Show what will be deleted
    console.log(chalk.cyan('The following will be deleted:'));
    console.log();
    for (const item of existing) {
      const icon = item.type === 'dir' ? '📁' : '📄';
      console.log(`  ${icon} ${chalk.yellow(item.name)}: ${item.path}`);
    }
    console.log();

    // Confirm unless --yes flag is provided
    if (!options.yes) {
      const confirmed = await confirm(chalk.red('Are you sure you want to delete all this data?'));
      if (!confirmed) {
        console.log(chalk.yellow('Clean cancelled.'));
        return;
      }
    }

    // Delete everything
    spinner.start('Cleaning data...');
    let totalFiles = 0;

    for (const item of existing) {
      if (item.type === 'dir') {
        totalFiles += removeDirectory(item.path);
      } else {
        if (removeFile(item.path)) {
          totalFiles++;
        }
      }
    }

    spinner.succeed(`Cleaned ${totalFiles} file(s) from ${existing.length} location(s)`);

    console.log();
    console.log(chalk.green('Project data has been cleaned.'));
    console.log(chalk.green('You can now run "npm run baseline" to generate fresh baselines.'));
  } catch (error) {
    spinner.fail('Error during clean');
    console.log();

    if (error instanceof Error) {
      console.log(chalk.red('Error:'), error.message);
    } else {
      console.log(chalk.red('Unknown error occurred'));
    }

    process.exit(1);
  }
}
