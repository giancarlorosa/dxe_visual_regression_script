/**
 * Comparison Service
 * Handles image comparison using pixelmatch
 */

import * as fs from 'fs';
import * as path from 'path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { VrtConfig, TestResult } from '../types';

export interface ComparisonResult {
  passed: boolean;
  diffPixels: number;
  diffPercentage: number;
  totalPixels: number;
  diffPath?: string;
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
   * Load a PNG image from disk
   */
  private loadImage(imagePath: string): PNG {
    const buffer = fs.readFileSync(imagePath);
    return PNG.sync.read(buffer);
  }

  /**
   * Compare two images and return the result
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
      };
    }

    // Check if screenshot exists
    if (!fs.existsSync(screenshotPath)) {
      throw new Error(`Screenshot not found: ${screenshotPath}`);
    }

    // Load images
    const baseline = this.loadImage(baselinePath);
    const screenshot = this.loadImage(screenshotPath);

    // Check dimensions match
    if (baseline.width !== screenshot.width || baseline.height !== screenshot.height) {
      return {
        passed: false,
        diffPixels: -1,
        diffPercentage: 100,
        totalPixels: baseline.width * baseline.height,
        diffPath: undefined,
      };
    }

    const totalPixels = baseline.width * baseline.height;

    // Create diff image if path provided
    let diffImage: PNG | null = null;
    if (diffPath) {
      diffImage = new PNG({ width: baseline.width, height: baseline.height });
    }

    // Perform comparison
    const diffPixels = pixelmatch(
      baseline.data,
      screenshot.data,
      diffImage?.data || null,
      baseline.width,
      baseline.height,
      {
        threshold: this.config.comparison.threshold,
        includeAA: false, // Ignore anti-aliasing differences
      }
    );

    const diffPercentage = (diffPixels / totalPixels) * 100;

    // Determine if test passed based on configuration
    const passed = this.evaluatePass(diffPixels, diffPercentage, totalPixels);

    // Save diff image if provided and there are differences
    let savedDiffPath: string | undefined;
    if (diffImage && diffPath && diffPixels > 0) {
      this.ensureDirectoryExists(path.dirname(diffPath));
      fs.writeFileSync(diffPath, PNG.sync.write(diffImage));
      savedDiffPath = diffPath;
    }

    return {
      passed,
      diffPixels,
      diffPercentage,
      totalPixels,
      diffPath: savedDiffPath,
    };
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
    const diffRatio = diffPixels / totalPixels;
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
        viewport: viewportKey,
        passed: result.passed,
        diffPixels: result.diffPixels,
        diffPercentage: result.diffPercentage,
        screenshotPath,
        baselinePath,
        diffPath: result.diffPath,
      };
    } catch (error) {
      return {
        scenarioId,
        scenarioTitle: scenarioId,
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
