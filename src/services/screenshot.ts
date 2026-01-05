/**
 * Screenshot Service
 * Handles screenshot capture using Playwright
 */

import { chromium, Browser, Page, BrowserContext } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { VrtConfig, Scenario, Viewport, Interaction } from '../types';

export class ScreenshotService {
  private config: VrtConfig;
  private browser: Browser | null = null;
  private headless: boolean;

  constructor(config: VrtConfig, headless?: boolean) {
    this.config = config;
    this.headless = headless ?? config.playwright.headless;
  }

  /**
   * Initialize the browser
   */
  async initialize(): Promise<void> {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: this.headless,
        slowMo: this.headless ? 0 : 100, // Slow down actions when headed for visibility
      });
    }
  }

  /**
   * Close the browser
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
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
   * Generate a safe filename from scenario and viewport
   */
  generateFilename(scenarioId: string, viewportKey: string): string {
    // Sanitize the scenario ID for use in filenames
    const safeId = scenarioId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeViewport = viewportKey.replace(/[^a-zA-Z0-9_-]/g, '_');
    return `${safeId}__${safeViewport}.png`;
  }

  /**
   * Scroll through entire page to trigger lazy loading
   */
  private async triggerLazyLoading(page: Page): Promise<void> {
    await page.evaluate(`(async () => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        const distance = 300;
        const scrollDelay = 100;

        const timer = setInterval(() => {
          window.scrollBy(0, distance);
          totalHeight += distance;

          if (totalHeight >= document.body.scrollHeight) {
            clearInterval(timer);
            window.scrollTo(0, 0);
            resolve();
          }
        }, scrollDelay);
      });
    })()`);
  }

  /**
   * Wait for all images to finish loading
   */
  private async waitForAllImages(page: Page): Promise<void> {
    await page.evaluate(`(async () => {
      const images = Array.from(document.querySelectorAll('img'));
      await Promise.all(
        images.map((img) => {
          if (img.complete) return Promise.resolve();
          return new Promise((resolve) => {
            img.addEventListener('load', () => resolve());
            img.addEventListener('error', () => resolve());
          });
        })
      );
    })()`);
  }

  /**
   * Wait for page height to stabilize (no changes for multiple checks)
   */
  private async waitForStableHeight(page: Page, timeout = 5000): Promise<void> {
    let previousHeight = 0;
    let stableCount = 0;
    const requiredStableChecks = 3;
    const checkInterval = 200;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const currentHeight = await page.evaluate('document.documentElement.scrollHeight') as number;

      if (currentHeight === previousHeight) {
        stableCount++;
        if (stableCount >= requiredStableChecks) {
          break; // Height has been stable for required number of checks
        }
      } else {
        stableCount = 0;
      }

      previousHeight = currentHeight;
      await page.waitForTimeout(checkInterval);
    }
  }

  /**
   * Execute interactions on the page
   */
  private async executeInteractions(
    page: Page,
    interactions: Interaction[]
  ): Promise<void> {
    for (const interaction of interactions) {
      switch (interaction.type) {
        case 'click':
          if (interaction.selector) {
            await page.click(interaction.selector);
          }
          break;

        case 'type':
          if (interaction.selector && interaction.value !== null) {
            await page.fill(interaction.selector, interaction.value);
          }
          break;

        case 'mouseover':
          if (interaction.selector) {
            await page.hover(interaction.selector);
          }
          break;

        case 'wait':
          if (interaction.wait_ms !== null && interaction.wait_ms > 0) {
            await page.waitForTimeout(interaction.wait_ms);
          }
          break;

        default:
          console.warn(`Unknown interaction type: ${interaction.type}`);
      }

      // Wait after interaction if specified (for non-wait types)
      if (
        interaction.type !== 'wait' &&
        interaction.wait_ms !== null &&
        interaction.wait_ms > 0
      ) {
        await page.waitForTimeout(interaction.wait_ms);
      }
    }
  }

  /**
   * Capture a screenshot for a scenario and viewport
   */
  async captureScreenshot(
    scenario: Scenario,
    viewport: Viewport,
    outputDir: string
  ): Promise<string> {
    if (!this.browser) {
      throw new Error('Browser not initialized. Call initialize() first.');
    }

    this.ensureDirectoryExists(outputDir);

    // Use default height of 800 when height is 0 (full-page screenshots)
    const viewportHeight = viewport.height > 0 ? viewport.height : 800;

    const context: BrowserContext = await this.browser.newContext({
      viewport: {
        width: viewport.width,
        height: viewportHeight,
      },
      deviceScaleFactor: viewport.device_scale_factor,
    });

    const page: Page = await context.newPage();

    try {
      // Set timeouts
      page.setDefaultTimeout(this.config.playwright.timeout);
      page.setDefaultNavigationTimeout(this.config.playwright.navigationTimeout);

      // Navigate to the URL
      await page.goto(scenario.url, {
        waitUntil: 'networkidle',
        timeout: this.config.playwright.navigationTimeout,
      });

      // Wait for scenario-specific wait time
      if (scenario.wait_time_ms > 0) {
        await page.waitForTimeout(scenario.wait_time_ms);
      }

      // Execute interactions if present (both static and interactive modes)
      if (scenario.interactions.length > 0) {
        await this.executeInteractions(page, scenario.interactions);
      }

      // Handle lazy loading for full-page screenshots
      if (viewport.full_page) {
        // Scroll through page to trigger lazy loading
        await this.triggerLazyLoading(page);

        // Wait for all images to finish loading
        await this.waitForAllImages(page);

        // Wait for page height to stabilize
        await this.waitForStableHeight(page);
      }

      // Generate filename and full path
      const filename = this.generateFilename(scenario.id, viewport.machine_name);
      const screenshotPath = path.join(outputDir, filename);

      // Capture screenshot
      await page.screenshot({
        path: screenshotPath,
        fullPage: viewport.full_page,
        timeout: this.config.playwright.screenshotTimeout,
      });

      return screenshotPath;
    } finally {
      await context.close();
    }
  }

  /**
   * Capture screenshots for all scenario/viewport combinations
   */
  async captureAll(
    scenarios: Scenario[],
    viewports: Viewport[],
    outputDir: string,
    onProgress?: (current: number, total: number, scenario: Scenario, viewport: Viewport) => void
  ): Promise<Map<string, string>> {
    const results = new Map<string, string>();
    const viewportMap = new Map<string, Viewport>();

    // Build viewport lookup map
    for (const viewport of viewports) {
      viewportMap.set(viewport.machine_name, viewport);
    }

    // Calculate total count
    let total = 0;
    for (const scenario of scenarios) {
      total += scenario.viewport_keys.length;
    }

    let current = 0;

    for (const scenario of scenarios) {
      for (const viewportKey of scenario.viewport_keys) {
        const viewport = viewportMap.get(viewportKey);
        if (!viewport) {
          console.warn(`Viewport not found: ${viewportKey}`);
          continue;
        }

        current++;
        if (onProgress) {
          onProgress(current, total, scenario, viewport);
        }

        try {
          const screenshotPath = await this.captureScreenshot(
            scenario,
            viewport,
            outputDir
          );
          const key = `${scenario.id}__${viewportKey}`;
          results.set(key, screenshotPath);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error(
            `Failed to capture screenshot for ${scenario.title} @ ${viewportKey}: ${errorMessage}`
          );
        }
      }
    }

    return results;
  }

  /**
   * Capture a single screenshot with retry logic
   */
  async captureWithRetry(
    scenario: Scenario,
    viewport: Viewport,
    outputDir: string
  ): Promise<string> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.retries.maxRetries; attempt++) {
      try {
        return await this.captureScreenshot(scenario, viewport, outputDir);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');

        if (attempt < this.config.retries.maxRetries) {
          await new Promise((resolve) =>
            setTimeout(resolve, this.config.retries.retryDelay)
          );
        }
      }
    }

    throw lastError || new Error('Screenshot capture failed');
  }
}
