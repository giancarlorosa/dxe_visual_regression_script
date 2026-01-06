/**
 * Visual Regression Testing Types
 * Types matching the API payload schema from the Drupal module
 */

// ============================================================================
// API Payload Types (from /api/vrt/pages endpoint)
// ============================================================================

export interface Meta {
  generated_at: string;
  last_regenerated_at: string | null;
  generated_by: string;
  scenario_count: number;
  viewport_count: number;
  is_regenerating: boolean;
  token_required: boolean;
  notes: string[];
}

export interface Viewport {
  machine_name: string;
  label: string;
  width: number;
  height: number;
  device_scale_factor: number;
  full_page: boolean;
}

export type InteractionType = 'click' | 'type' | 'mouseover' | 'wait';

export interface Interaction {
  type: InteractionType;
  selector: string;
  value: string | null;
  wait_ms: number | null;
}

export type ScenarioMode = 'static' | 'interactive';

export interface Scenario {
  id: string;
  title: string;
  url: string;
  mode: ScenarioMode;
  wait_time_ms: number;
  wait_time_seconds: number;
  viewport_keys: string[];
  source: string;
  source_reference: string;
  content_type: string;
  interactions: Interaction[];
}

export interface ApiPayload {
  meta: Meta;
  viewports: Viewport[];
  scenarios: Scenario[];
}

export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface ComparisonConfig {
  threshold: number;
  maxDiffPixels: number;
  maxDiffPixelRatio: number;
}

export interface PlaywrightConfig {
  headless: boolean;
  timeout: number;
  navigationTimeout: number;
  screenshotTimeout: number;
  workers: number;
}

export interface RetryConfig {
  maxRetries: number;
  retryDelay: number;
}

export interface VrtConfig {
  endpoint: string;
  baselineDomain: string | null;
  testDomain: string | null;
  token: string;
  insecure: boolean;
  outputDir: string;
  baselineDir: string;
  diffDir: string;
  comparison: ComparisonConfig;
  playwright: PlaywrightConfig;
  retries: RetryConfig;
}

// ============================================================================
// CLI Types
// ============================================================================

export interface FilterOptions {
  scenarios?: string[];
  viewports?: string[];
}

export interface TestResult {
  scenarioId: string;
  scenarioTitle: string;
  scenarioUrl: string;
  baselineUrl?: string;
  viewport: string;
  passed: boolean;
  diffPixels?: number;
  diffPercentage?: number;
  error?: string;
  warning?: string;
  screenshotPath?: string;
  baselinePath?: string;
  diffPath?: string;
}

export interface ReportTestResult {
  name: string;
  url: string;
  baselineUrl?: string;
  status: 'passed' | 'failed';
  baseline?: string;
  current?: string;
  diff?: string;
  diffPixels?: number;
  diffPercentage?: number;
  warning?: string;
}

export interface TestRunSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  results: TestResult[];
}

// ============================================================================
// Connection Test Types
// ============================================================================

export interface ConnectionTestResult {
  success: boolean;
  endpoint: string;
  statusCode?: number;
  scenarioCount?: number;
  viewportCount?: number;
  isRegenerating?: boolean;
  tokenRequired?: boolean;
  error?: string;
  responseTime?: number;
}
