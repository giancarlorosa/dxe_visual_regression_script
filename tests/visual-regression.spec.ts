/**
 * Visual Regression Tests
 * Dynamically generates tests from API scenarios
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// Types
interface Viewport {
  machine_name: string;
  label: string;
  width: number;
  height: number;
  device_scale_factor: number;
  full_page: boolean;
}

interface Interaction {
  type: 'click' | 'type' | 'mouseover' | 'wait';
  selector: string;
  value: string | null;
  wait_ms: number | null;
}

interface Scenario {
  id: string;
  title: string;
  url: string;
  mode: 'static' | 'interactive';
  wait_time_ms: number;
  viewport_keys: string[];
  interactions: Interaction[];
}

interface ApiPayload {
  meta: {
    scenario_count: number;
    viewport_count: number;
  };
  viewports: Viewport[];
  scenarios: Scenario[];
}

// Load cached scenarios
function loadScenarios(): ApiPayload {
  const scenariosPath = path.resolve(__dirname, '../.scenarios-cache.json');

  if (!fs.existsSync(scenariosPath)) {
    throw new Error(
      'Scenarios cache not found. Run the tests with global-setup enabled or run: npm run vrt:fetch'
    );
  }

  const data = fs.readFileSync(scenariosPath, 'utf8');
  return JSON.parse(data);
}

// Execute interactions on the page
async function executeInteractions(page: any, interactions: Interaction[]) {
  for (const interaction of interactions) {
    switch (interaction.type) {
      case 'click':
        if (interaction.selector) {
          // Use JavaScript click to bypass viewport restrictions
          await page.evaluate((selector) => {
            const element = document.querySelector(selector) as HTMLElement;
            if (element) {
              element.click();
            }
          }, interaction.selector);
        }
        break;

      case 'type':
        if (interaction.selector && interaction.value !== null) {
          const locator = page.locator(interaction.selector);
          await locator.scrollIntoViewIfNeeded();
          await locator.fill(interaction.value);
        }
        break;

      case 'mouseover':
        if (interaction.selector) {
          // Use JavaScript to dispatch mouseover event to bypass viewport restrictions
          await page.evaluate((selector) => {
            const element = document.querySelector(selector);
            if (element) {
              const event = new MouseEvent('mouseover', {
                view: window,
                bubbles: true,
                cancelable: true
              });
              element.dispatchEvent(event);
            }
          }, interaction.selector);
        }
        break;

      case 'wait':
        if (interaction.wait_ms !== null && interaction.wait_ms > 0) {
          console.log(`⏳ Waiting for ${interaction.wait_ms}ms...`);
          const startTime = Date.now();
          await page.waitForTimeout(interaction.wait_ms);
          const elapsed = Date.now() - startTime;
          console.log(`✅ Wait completed: ${elapsed}ms (expected: ${interaction.wait_ms}ms)`);
        }
        break;
    }

    // Wait after interaction if specified
    if (interaction.type !== 'wait' && interaction.wait_ms !== null && interaction.wait_ms > 0) {
      await page.waitForTimeout(interaction.wait_ms);
    }
  }
}

// Generate safe filename
function safeFilename(scenarioId: string, viewportKey: string): string {
  const safeId = scenarioId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeViewport = viewportKey.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${safeId}__${safeViewport}.png`;
}

// Calculate total wait time from interactions
function calculateTotalWaitTime(interactions: Interaction[], scenarioWaitMs: number): number {
  let totalWaitMs = scenarioWaitMs || 0;

  for (const interaction of interactions) {
    if (interaction.wait_ms && interaction.wait_ms > 0) {
      totalWaitMs += interaction.wait_ms;
    }
  }

  return totalWaitMs;
}

// Calculate dynamic timeout for a scenario
function calculateTestTimeout(scenario: Scenario, isFullPage: boolean): number {
  const baseTimeout = 30000; // 30 seconds base
  const waitTime = calculateTotalWaitTime(scenario.interactions, scenario.wait_time_ms);
  const lazyLoadingBuffer = isFullPage ? 15000 : 0; // 15s buffer for lazy loading when full page
  const screenshotBuffer = 15000; // 15s buffer for screenshot retries

  return baseTimeout + waitTime + lazyLoadingBuffer + screenshotBuffer;
}

// Scroll through entire page to trigger lazy loading
async function triggerLazyLoading(page: any): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      let totalHeight = 0;
      const distance = 300;
      const scrollDelay = 100;

      const timer = setInterval(() => {
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= document.body.scrollHeight) {
          clearInterval(timer);
          window.scrollTo(0, 0); // Scroll back to top
          resolve();
        }
      }, scrollDelay);
    });
  });
}

// Wait for all images to finish loading
async function waitForAllImages(page: any): Promise<void> {
  await page.evaluate(async () => {
    const images = Array.from(document.querySelectorAll('img'));
    await Promise.all(
      images.map((img) => {
        if (img.complete) return Promise.resolve();
        return new Promise<void>((resolve) => {
          img.addEventListener('load', () => resolve());
          img.addEventListener('error', () => resolve());
        });
      })
    );
  });
}

// Wait for page height to stabilize (no changes for multiple checks)
async function waitForStableHeight(page: any, timeout = 5000): Promise<void> {
  let previousHeight = 0;
  let stableCount = 0;
  const requiredStableChecks = 3;
  const checkInterval = 200;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const currentHeight = await page.evaluate(() => document.documentElement.scrollHeight);

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

// Load scenarios
const payload = loadScenarios();
const viewportMap = new Map<string, Viewport>();

for (const viewport of payload.viewports) {
  viewportMap.set(viewport.machine_name, viewport);
}

// Generate tests
test.describe('Visual Regression Tests', () => {

  for (const scenario of payload.scenarios) {
    for (const viewportKey of scenario.viewport_keys) {
      const viewport = viewportMap.get(viewportKey);

      if (!viewport) {
        console.warn(`Viewport not found: ${viewportKey}`);
        continue;
      }

      test(`${scenario.title} @ ${viewport.label}`, async ({ page }, testInfo) => {
        // Set dynamic timeout based on scenario wait times
        const dynamicTimeout = calculateTestTimeout(scenario, viewport.full_page);
        testInfo.setTimeout(dynamicTimeout);

        // Set viewport (use default height of 800 when height is 0 for full-page screenshots)
        const viewportHeight = viewport.height > 0 ? viewport.height : 800;
        await page.setViewportSize({
          width: viewport.width,
          height: viewportHeight,
        });

        // Navigate to URL
        await page.goto(scenario.url, {
          waitUntil: 'networkidle',
        });

        // Wait for scenario-specific time
        if (scenario.wait_time_ms > 0) {
          await page.waitForTimeout(scenario.wait_time_ms);
        }

        // Execute interactions if present (both static and interactive modes)
        if (scenario.interactions.length > 0) {
          await executeInteractions(page, scenario.interactions);
        }

        // Handle lazy loading for full-page screenshots
        if (viewport.full_page) {
          // Scroll through page to trigger lazy loading
          await triggerLazyLoading(page);

          // Wait for all images to finish loading
          await waitForAllImages(page);

          // Wait for page height to stabilize
          await waitForStableHeight(page);
        }

        // Check page height for full page screenshots
        const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
        const maxSafeHeight = 30000; // Safe limit below Chromium's 32767px max

        // Take screenshot with visual comparison
        const filename = safeFilename(scenario.id, viewportKey);

        await expect(page).toHaveScreenshot(filename, {
          fullPage: viewport.full_page && pageHeight <= maxSafeHeight,
          animations: 'disabled',
        });
      });
    }
  }
});
