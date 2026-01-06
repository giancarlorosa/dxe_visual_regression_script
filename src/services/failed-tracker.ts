/**
 * Failed Test Tracker
 * Saves and loads failed test information for re-running
 */

import * as fs from 'fs';
import * as path from 'path';

const FAILED_FILE = '.vrt-failed.json';

export interface FailedTest {
  scenarioId: string;
  viewport: string;
}

export interface FailedTestsData {
  timestamp: string;
  tests: FailedTest[];
}

/**
 * Get the path to the failed tests file
 */
function getFailedFilePath(): string {
  return path.join(process.cwd(), FAILED_FILE);
}

/**
 * Save failed tests to file
 */
export function saveFailedTests(tests: FailedTest[]): void {
  const data: FailedTestsData = {
    timestamp: new Date().toISOString(),
    tests,
  };

  fs.writeFileSync(getFailedFilePath(), JSON.stringify(data, null, 2));
}

/**
 * Load failed tests from file
 */
export function loadFailedTests(): FailedTest[] {
  const filePath = getFailedFilePath();

  if (!fs.existsSync(filePath)) {
    return [];
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const data: FailedTestsData = JSON.parse(content);
    return data.tests || [];
  } catch {
    return [];
  }
}

/**
 * Check if there are any failed tests saved
 */
export function hasFailedTests(): boolean {
  return loadFailedTests().length > 0;
}

/**
 * Clear failed tests file
 */
export function clearFailedTests(): void {
  const filePath = getFailedFilePath();
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

/**
 * Get unique scenario IDs from failed tests
 */
export function getFailedScenarioIds(): string[] {
  const tests = loadFailedTests();
  return [...new Set(tests.map(t => t.scenarioId))];
}
