/**
 * Global Setup
 * Fetches scenarios from the API before tests run and saves them locally
 */

import * as fs from 'fs';
import * as path from 'path';
import https from 'https';
import axios from 'axios';

interface VrtConfig {
  endpoint: string;
  token: string;
  insecure: boolean;
}

async function globalSetup() {
  console.log('\n📡 Fetching scenarios from API...\n');

  // Load config
  const configPath = path.resolve(__dirname, '.vrtrc.json');
  const configData = fs.readFileSync(configPath, 'utf8');
  const config: VrtConfig = JSON.parse(configData);

  if (!config.endpoint) {
    throw new Error('No endpoint configured in .vrtrc.json');
  }

  // Create axios instance
  const httpsAgent = config.insecure
    ? new https.Agent({ rejectUnauthorized: false })
    : undefined;

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (config.token) {
    headers['Authorization'] = `Bearer ${config.token}`;
  }

  try {
    const response = await axios.get(config.endpoint, {
      headers,
      httpsAgent,
      timeout: 30000,
    });

    const payload = response.data;

    if (!payload.meta || !payload.viewports || !payload.scenarios) {
      throw new Error('Invalid payload structure from API');
    }

    // Save scenarios to a local file for tests to use
    const scenariosPath = path.resolve(__dirname, '.scenarios-cache.json');
    fs.writeFileSync(scenariosPath, JSON.stringify(payload, null, 2));

    console.log(`✅ Fetched ${payload.meta.scenario_count} scenarios with ${payload.meta.viewport_count} viewports\n`);

    if (payload.meta.is_regenerating) {
      console.log('⚠️  Warning: Scenarios are currently being regenerated\n');
    }

  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 401) {
        throw new Error('Authentication failed. Check your token in .vrtrc.json');
      }
      throw new Error(`Failed to fetch scenarios: ${error.message}`);
    }
    throw error;
  }
}

export default globalSetup;
