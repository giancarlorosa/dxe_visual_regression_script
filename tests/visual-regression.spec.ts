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

      test(`${scenario.title} @ ${viewport.label}`, async ({ page }) => {
        // Set viewport
        await page.setViewportSize({
          width: viewport.width,
          height: viewport.height,
        });

        // Navigate to URL
        await page.goto(scenario.url, {
          waitUntil: 'networkidle',
        });

        // Wait for scenario-specific time
        if (scenario.wait_time_ms > 0) {
          await page.waitForTimeout(scenario.wait_time_ms);
        }

        // Execute interactions if interactive mode
        if (scenario.mode === 'interactive' && scenario.interactions.length > 0) {
          await executeInteractions(page, scenario.interactions);
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
