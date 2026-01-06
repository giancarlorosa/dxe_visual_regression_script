/**
 * Comparison Service
 * Handles image comparison using ODiff
 */

import * as fs from 'fs';
import * as path from 'path';
import { compare } from 'odiff-bin';
import { VrtConfig, TestResult } from '../types';

export interface ComparisonResult {
  passed: boolean;
  diffPixels: number;
  diffPercentage: number;
  totalPixels: number;
  diffPath?: string;
  error?: string;
  warning?: string;
}

export class ComparisonService {
  private config: VrtConfig;

  constructor(config: VrtConfig) {
    this.config = config;
  }

  /**
   * Ensure output directory exists
   */
  private ensureDirectoryExists(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  /**
   * Compare two images using ODiff and return the result
   */
  async compare(
    baselinePath: string,
    screenshotPath: string,
    diffPath?: string
  ): Promise<ComparisonResult> {
    // Check if baseline exists
    if (!fs.existsSync(baselinePath)) {
      return {
        passed: false,
        diffPixels: -1,
        diffPercentage: 100,
        totalPixels: 0,
        diffPath: undefined,
        error: 'Baseline not found',
      };
    }

    // Check if screenshot exists
    if (!fs.existsSync(screenshotPath)) {
      return {
        passed: false,
        diffPixels: -1,
        diffPercentage: 100,
        totalPixels: 0,
        diffPath: undefined,
        error: 'Screenshot not found',
      };
    }

    // Ensure diff directory exists if diffPath provided
    if (diffPath) {
      this.ensureDirectoryExists(path.dirname(diffPath));
    }

    try {
      // Use ODiff for comparison
      const result = await compare(
        baselinePath,
        screenshotPath,
        diffPath || '', // ODiff requires a diff path, use empty string if not needed
        {
          threshold: this.config.comparison.threshold,
          failOnLayoutDiff: true, // Return layout-diff reason for dimension mismatches
          antialiasing: true, // Reduce font rendering false positives
        }
      );

      // Handle matching images
      if (result.match) {
        // Clean up diff file if it was created but images match
        if (diffPath && fs.existsSync(diffPath)) {
          fs.unlinkSync(diffPath);
        }
        return {
          passed: true,
          diffPixels: 0,
          diffPercentage: 0,
          totalPixels: 0,
          diffPath: undefined,
        };
      }

      // Handle layout differences (dimension mismatch)
      if (result.reason === 'layout-diff') {
        // Clean up diff file if created
        if (diffPath && fs.existsSync(diffPath)) {
          fs.unlinkSync(diffPath);
        }
        return {
          passed: true,
          diffPixels: 0,
          diffPercentage: 0,
          totalPixels: 0,
          diffPath: undefined,
          warning: 'dimension-mismatch',
        };
      }

      // Handle file not exists error
      if (result.reason === 'file-not-exists') {
        return {
          passed: false,
          diffPixels: -1,
          diffPercentage: 100,
          totalPixels: 0,
          diffPath: undefined,
          error: `File not found: ${result.file}`,
        };
      }

      // Handle pixel differences (reason === 'pixel-diff')
      const diffPixels = result.diffCount;
      const diffPercentage = result.diffPercentage;

      // If no differences, clean up and pass
      if (diffPixels === 0) {
        if (diffPath && fs.existsSync(diffPath)) {
          fs.unlinkSync(diffPath);
        }
        return {
          passed: true,
          diffPixels: 0,
          diffPercentage: 0,
          totalPixels: 0,
          diffPath: undefined,
        };
      }

      // Calculate total pixels from diffCount and diffPercentage
      const totalPixels = diffPercentage > 0
        ? Math.round(diffPixels / (diffPercentage / 100))
        : 0;

      // Determine if test passed based on configuration thresholds
      const passed = this.evaluatePass(diffPixels, diffPercentage, totalPixels);

      return {
        passed,
        diffPixels,
        diffPercentage,
        totalPixels,
        diffPath: diffPath && fs.existsSync(diffPath) ? diffPath : undefined,
      };
    } catch (error) {
      return {
        passed: false,
        diffPixels: -1,
        diffPercentage: 100,
        totalPixels: 0,
        diffPath: undefined,
        error: error instanceof Error ? error.message : 'Unknown comparison error',
      };
    }
  }

  /**
   * Evaluate if the test should pass based on configuration thresholds
   */
  private evaluatePass(
    diffPixels: number,
    diffPercentage: number,
    totalPixels: number
  ): boolean {
    // If no differences, always pass
    if (diffPixels === 0) {
      return true;
    }

    // Check maxDiffPixels
    if (diffPixels > this.config.comparison.maxDiffPixels) {
      return false;
    }

    // Check maxDiffPixelRatio (percentage)
    const diffRatio = totalPixels > 0 ? diffPixels / totalPixels : 0;
    if (diffRatio > this.config.comparison.maxDiffPixelRatio) {
      return false;
    }

    return true;
  }

  /**
   * Compare a screenshot against its baseline
   */
  async compareScreenshot(
    scenarioId: string,
    viewportKey: string,
    screenshotPath: string
  ): Promise<TestResult> {
    // Build paths
    const filename = `${scenarioId}__${viewportKey}.png`;
    const baselinePath = path.join(this.config.baselineDir, filename);
    const diffPath = path.join(this.config.diffDir, filename);

    // Check if baseline exists
    if (!fs.existsSync(baselinePath)) {
      return {
        scenarioId,
        scenarioTitle: scenarioId,
        scenarioUrl: '',
        viewport: viewportKey,
        passed: false,
        error: 'Baseline not found. Run generate-baseline first.',
        screenshotPath,
        baselinePath,
      };
    }

    try {
      const result = await this.compare(baselinePath, screenshotPath, diffPath);

      return {
        scenarioId,
        scenarioTitle: scenarioId,
        scenarioUrl: '',
        viewport: viewportKey,
        passed: result.passed,
        diffPixels: result.diffPixels,
        diffPercentage: result.diffPercentage,
        warning: result.warning,
        screenshotPath,
        baselinePath,
        diffPath: result.diffPath,
      };
    } catch (error) {
      return {
        scenarioId,
        scenarioTitle: scenarioId,
        scenarioUrl: '',
        viewport: viewportKey,
        passed: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        screenshotPath,
        baselinePath,
      };
    }
  }

  /**
   * Check if a baseline exists for a given scenario/viewport combination
   */
  baselineExists(scenarioId: string, viewportKey: string): boolean {
    const filename = `${scenarioId}__${viewportKey}.png`;
    const baselinePath = path.join(this.config.baselineDir, filename);
    return fs.existsSync(baselinePath);
  }

  /**
   * Copy a screenshot to the baseline directory
   */
  copyToBaseline(screenshotPath: string, scenarioId: string, viewportKey: string): string {
    const filename = `${scenarioId}__${viewportKey}.png`;
    const baselinePath = path.join(this.config.baselineDir, filename);

    this.ensureDirectoryExists(this.config.baselineDir);
    fs.copyFileSync(screenshotPath, baselinePath);

    return baselinePath;
  }

  /**
   * Get baseline path for a scenario/viewport combination
   */
  getBaselinePath(scenarioId: string, viewportKey: string): string {
    const filename = `${scenarioId}__${viewportKey}.png`;
    return path.join(this.config.baselineDir, filename);
  }

  /**
   * List all existing baselines
   */
  listBaselines(): string[] {
    if (!fs.existsSync(this.config.baselineDir)) {
      return [];
    }

    return fs.readdirSync(this.config.baselineDir).filter((f) => f.endsWith('.png'));
  }

  /**
   * Clean up diff directory
   */
  cleanDiffs(): void {
    if (fs.existsSync(this.config.diffDir)) {
      const files = fs.readdirSync(this.config.diffDir);
      for (const file of files) {
        if (file.endsWith('.png')) {
          fs.unlinkSync(path.join(this.config.diffDir, file));
        }
      }
    }
  }
}
