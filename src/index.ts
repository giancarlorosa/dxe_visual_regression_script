/**
 * Visual Regression Testing Library
 * Main exports for programmatic usage
 */

// Types
export * from './types';

// Configuration
export { loadConfig, configExists, createDefaultConfig, getConfigPath } from './config/loader';

// Services
export { ApiService } from './services/api';
export { ScreenshotService } from './services/screenshot';
export { ComparisonService } from './services/comparison';

// Commands (for programmatic usage)
export { testConnection } from './commands/test-connection';
export { generateBaseline } from './commands/generate-baseline';
export { runTests } from './commands/run-tests';
