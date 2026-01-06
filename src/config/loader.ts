/**
 * Configuration Loader
 * Loads and validates the .vrtrc.json configuration file
 */

import * as fs from 'fs';
import * as path from 'path';
import { VrtConfig } from '../types';

const DEFAULT_CONFIG: VrtConfig = {
  endpoint: '',
  baselineDomain: null,
  testDomain: null,
  token: '',
  insecure: false,
  outputDir: './screenshots',
  baselineDir: './baselines',
  diffDir: './diffs',
  comparison: {
    threshold: 0.1,
    maxDiffPixels: 100,
    maxDiffPixelRatio: 0.01,
  },
  playwright: {
    headless: true,
    timeout: 30000,
    navigationTimeout: 30000,
    screenshotTimeout: 10000,
    workers: 1,
  },
  retries: {
    maxRetries: 2,
    retryDelay: 1000,
  },
};

const CONFIG_FILE_NAMES = ['.vrtrc.json', 'vrt.config.json', '.vrtrc'];

/**
 * Find the config file in the current directory or parent directories
 */
function findConfigFile(startDir: string = process.cwd()): string | null {
  let currentDir = startDir;

  while (currentDir !== path.parse(currentDir).root) {
    for (const configName of CONFIG_FILE_NAMES) {
      const configPath = path.join(currentDir, configName);
      if (fs.existsSync(configPath)) {
        return configPath;
      }
    }
    currentDir = path.dirname(currentDir);
  }

  return null;
}

/**
 * Validate the configuration object
 */
function validateConfig(config: Partial<VrtConfig>): string[] {
  const errors: string[] = [];

  if (!config.endpoint) {
    errors.push('Missing required field: endpoint');
  } else {
    try {
      new URL(config.endpoint);
    } catch {
      errors.push(`Invalid endpoint URL: ${config.endpoint}`);
    }
  }

  // Validate baselineDomain if set
  if (config.baselineDomain && config.baselineDomain.trim() !== '') {
    try {
      new URL(config.baselineDomain);
    } catch {
      errors.push(`Invalid baselineDomain URL: ${config.baselineDomain}`);
    }
  }

  // Validate testDomain if set
  if (config.testDomain && config.testDomain.trim() !== '') {
    try {
      new URL(config.testDomain);
    } catch {
      errors.push(`Invalid testDomain URL: ${config.testDomain}`);
    }
  }

  if (config.comparison) {
    if (
      config.comparison.threshold !== undefined &&
      (config.comparison.threshold < 0 || config.comparison.threshold > 1)
    ) {
      errors.push('comparison.threshold must be between 0 and 1');
    }
    if (
      config.comparison.maxDiffPixels !== undefined &&
      config.comparison.maxDiffPixels < 0
    ) {
      errors.push('comparison.maxDiffPixels must be non-negative');
    }
    if (
      config.comparison.maxDiffPixelRatio !== undefined &&
      (config.comparison.maxDiffPixelRatio < 0 ||
        config.comparison.maxDiffPixelRatio > 1)
    ) {
      errors.push('comparison.maxDiffPixelRatio must be between 0 and 1');
    }
  }

  if (config.playwright) {
    if (config.playwright.timeout !== undefined && config.playwright.timeout < 0) {
      errors.push('playwright.timeout must be non-negative');
    }
    if (
      config.playwright.navigationTimeout !== undefined &&
      config.playwright.navigationTimeout < 0
    ) {
      errors.push('playwright.navigationTimeout must be non-negative');
    }
    if (
      config.playwright.workers !== undefined &&
      (config.playwright.workers < 1 || !Number.isInteger(config.playwright.workers))
    ) {
      errors.push('playwright.workers must be a positive integer');
    }
  }

  return errors;
}

/**
 * Deep merge two objects
 */
function deepMerge(
  target: VrtConfig,
  source: Partial<VrtConfig>
): VrtConfig {
  const result: VrtConfig = {
    endpoint: source.endpoint ?? target.endpoint,
    baselineDomain: source.baselineDomain !== undefined ? source.baselineDomain : target.baselineDomain,
    testDomain: source.testDomain !== undefined ? source.testDomain : target.testDomain,
    token: source.token ?? target.token,
    insecure: source.insecure ?? target.insecure,
    outputDir: source.outputDir ?? target.outputDir,
    baselineDir: source.baselineDir ?? target.baselineDir,
    diffDir: source.diffDir ?? target.diffDir,
    comparison: {
      threshold: source.comparison?.threshold ?? target.comparison.threshold,
      maxDiffPixels: source.comparison?.maxDiffPixels ?? target.comparison.maxDiffPixels,
      maxDiffPixelRatio: source.comparison?.maxDiffPixelRatio ?? target.comparison.maxDiffPixelRatio,
    },
    playwright: {
      headless: source.playwright?.headless ?? target.playwright.headless,
      timeout: source.playwright?.timeout ?? target.playwright.timeout,
      navigationTimeout: source.playwright?.navigationTimeout ?? target.playwright.navigationTimeout,
      screenshotTimeout: source.playwright?.screenshotTimeout ?? target.playwright.screenshotTimeout,
      workers: source.playwright?.workers ?? target.playwright.workers,
    },
    retries: {
      maxRetries: source.retries?.maxRetries ?? target.retries.maxRetries,
      retryDelay: source.retries?.retryDelay ?? target.retries.retryDelay,
    },
  };

  return result;
}

/**
 * Load configuration from file and environment variables
 */
export function loadConfig(configPath?: string): VrtConfig {
  let config: Partial<VrtConfig> = {};

  // Find config file
  const resolvedPath = configPath || findConfigFile();

  if (resolvedPath) {
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Config file not found: ${resolvedPath}`);
    }

    try {
      const fileContent = fs.readFileSync(resolvedPath, 'utf-8');
      config = JSON.parse(fileContent);
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`Invalid JSON in config file: ${resolvedPath}`);
      }
      throw error;
    }
  }

  // Override with environment variables
  if (process.env.VRT_ENDPOINT) {
    config.endpoint = process.env.VRT_ENDPOINT;
  }
  if (process.env.VRT_TOKEN) {
    config.token = process.env.VRT_TOKEN;
  }
  if (process.env.VRT_OUTPUT_DIR) {
    config.outputDir = process.env.VRT_OUTPUT_DIR;
  }
  if (process.env.VRT_BASELINE_DIR) {
    config.baselineDir = process.env.VRT_BASELINE_DIR;
  }
  if (process.env.VRT_BASELINE_DOMAIN) {
    config.baselineDomain = process.env.VRT_BASELINE_DOMAIN;
  }
  if (process.env.VRT_TEST_DOMAIN) {
    config.testDomain = process.env.VRT_TEST_DOMAIN;
  }

  // Merge with defaults
  const mergedConfig = deepMerge(DEFAULT_CONFIG, config);

  // Validate
  const errors = validateConfig(mergedConfig);
  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n  - ${errors.join('\n  - ')}`);
  }

  return mergedConfig;
}

/**
 * Get the path where the config file was found (or where it should be created)
 */
export function getConfigPath(): string {
  const found = findConfigFile();
  return found || path.join(process.cwd(), '.vrtrc.json');
}

/**
 * Check if a config file exists
 */
export function configExists(): boolean {
  return findConfigFile() !== null;
}

/**
 * Create a default config file
 */
export function createDefaultConfig(targetPath?: string): string {
  const configPath = targetPath || path.join(process.cwd(), '.vrtrc.json');

  const defaultConfig = {
    endpoint: 'https://example.org/api/vrt/pages',
    baselineDomain: null,
    testDomain: null,
    token: '',
    insecure: false,
    outputDir: './screenshots',
    baselineDir: './baselines',
    diffDir: './diffs',
    comparison: {
      threshold: 0.1,
      maxDiffPixels: 100,
      maxDiffPixelRatio: 0.01,
    },
    playwright: {
      headless: true,
      timeout: 30000,
      navigationTimeout: 30000,
      screenshotTimeout: 10000,
      workers: 1,
    },
    retries: {
      maxRetries: 2,
      retryDelay: 1000,
    },
  };

  fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2) + '\n');
  return configPath;
}
