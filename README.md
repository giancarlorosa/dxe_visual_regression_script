# Playwright Visual Regression

A visual regression testing tool using Playwright. Fetches test scenarios from an API endpoint and performs automated screenshot comparison with a built-in HTML report.

## Features

- **API-driven scenarios**: Fetch test scenarios from a configurable endpoint
- **Playwright-powered**: Uses Playwright's native test runner and visual comparison
- **Interactive scenarios**: Supports click, type, mouseover, and wait interactions
- **HTML Report**: Built-in visual diff report with side-by-side comparison
- **Configurable thresholds**: Set acceptable diff pixels and percentages
- **Self-signed SSL support**: Works with local development environments (DDEV, Lando, etc.)

## Installation

```bash
# Install dependencies
npm install

# Install Playwright browsers
npx playwright install chromium

# Build the TypeScript project
npm run build
```

## Quick Start

```bash
# 1. Copy the example config and configure your endpoint
cp .vrtrc.json.example .vrtrc.json

# 2. Edit .vrtrc.json with your API endpoint and settings

# 3. Test the connection
npm run test-connection

# 4. Generate baseline screenshots
npm run baseline

# 5. Run visual regression tests
npm run test

# 6. View the HTML report with visual diffs
npm run report
```

---

## Available Commands

### Main Commands

| Command | Description |
|---------|-------------|
| `npm run test` | Run visual regression tests |
| `npm run test:failed` | Re-run only tests that failed last time |
| `npm run test:headed` | Run tests with visible browser |
| `npm run test:update` | Run tests and update baselines for passing tests |
| `npm run baseline` | Generate baseline screenshots for all scenarios |
| `npm run baseline:failed` | Regenerate baselines only for failed scenarios |
| `npm run baseline:headed` | Generate baselines with visible browser |
| `npm run report` | **Open HTML report with visual diffs** |

### CLI Utility Commands

| Command | Description |
|---------|-------------|
| `npm run test-connection` | Test connectivity to the API endpoint |
| `npm run list` | List all available scenarios and viewports |
| `npm run init` | Create a default `.vrtrc.json` configuration file |

### Build Commands

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript to JavaScript |
| `npm run dev` | Watch mode - recompile on file changes |
| `npm run clean` | Remove the `dist/` folder |

---

## Workflow

### 1. Test Connection

Verify your API endpoint is accessible:

```bash
npm run test-connection
```

**Output example:**
```
Endpoint: https://visualregression.ddev.site/api/vrt/pages
Token: Not set
Insecure: Yes (SSL verification disabled)

✔ Connection successful!

  Status: Connected
  HTTP Status: 200
  Response Time: 66ms

  Scenarios: 12
  Viewports: 5
  Token Required: No
  Is Regenerating: No

Ready to run visual regression tests!
```

### 2. Generate Baselines

Capture baseline screenshots for all scenarios:

```bash
npm run baseline
```

This fetches scenarios from the API and captures screenshots for each scenario/viewport combination.

#### Regenerating Failed Baselines

If some scenarios fail during baseline generation (e.g., due to timeouts, network issues, or page errors), you can regenerate baselines **only for the failed scenarios** without re-running everything:

```bash
npm run baseline:failed
```

This command:
1. Identifies scenarios that failed in the previous run
2. Re-runs only those scenarios
3. Generates/updates their baseline screenshots

You can repeat this command until all baselines are successfully generated.

### 3. Run Tests

Run visual regression tests comparing current state against baselines:

```bash
npm run test
```

### 4. View Report

Open the HTML report to see visual diffs:

```bash
npm run report
```

The report provides:
- **Side-by-side comparison** of baseline vs actual screenshots
- **Visual diff highlighting** showing exactly what changed
- **Filter by status** (passed/failed)
- **Detailed test information**

### 5. Update Baselines

When UI changes are intentional, update the baselines:

```bash
npm run baseline
```

---

## Configuration

### Configuration File (`.vrtrc.json`)

```json
{
  "endpoint": "https://visualregression.ddev.site/api/vrt/pages",
  "token": "",
  "insecure": true,
  "outputDir": "./screenshots",
  "baselineDir": "./baselines",
  "diffDir": "./diffs",
  "comparison": {
    "threshold": 0.1,
    "maxDiffPixels": 100,
    "maxDiffPixelRatio": 0.01
  },
  "playwright": {
    "headless": true,
    "timeout": 30000,
    "navigationTimeout": 30000,
    "screenshotTimeout": 10000,
    "workers": 4
  },
  "retries": {
    "maxRetries": 2,
    "retryDelay": 1000
  }
}
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `endpoint` | string | *required* | API endpoint URL |
| `token` | string | `""` | Bearer token for authentication |
| `insecure` | boolean | `false` | Allow self-signed SSL certificates |
| `outputDir` | string | `./screenshots` | Directory for captured screenshots |
| `baselineDir` | string | `./baselines` | Directory for baseline images |
| `diffDir` | string | `./diffs` | Directory for diff images |

#### Comparison Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `comparison.threshold` | number | `0.1` | Pixel color threshold (0-1) |
| `comparison.maxDiffPixels` | number | `100` | Maximum differing pixels allowed |
| `comparison.maxDiffPixelRatio` | number | `0.01` | Maximum diff ratio (0-1) |

#### Playwright Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `playwright.headless` | boolean | `true` | Run browser in headless mode |
| `playwright.timeout` | number | `30000` | Default timeout in milliseconds |
| `playwright.navigationTimeout` | number | `30000` | Navigation timeout in milliseconds |
| `playwright.screenshotTimeout` | number | `10000` | Screenshot timeout in milliseconds |
| `playwright.workers` | number | `1` | Number of parallel browser workers |

### Environment Variables

Environment variables override configuration file values.

| Variable | Description |
|----------|-------------|
| `VRT_ENDPOINT` | Override endpoint URL |
| `VRT_TOKEN` | Override bearer token |
| `VRT_OUTPUT_DIR` | Override output directory |
| `VRT_BASELINE_DIR` | Override baseline directory |

---

## API Payload Schema

The tool expects the API endpoint to return a JSON payload with the following structure:

```json
{
  "meta": {
    "generated_at": "2025-12-15T10:00:00Z",
    "scenario_count": 12,
    "viewport_count": 5,
    "is_regenerating": false,
    "token_required": false
  },
  "viewports": [
    {
      "machine_name": "desktop_hd",
      "label": "Desktop HD",
      "width": 1920,
      "height": 1080,
      "device_scale_factor": 1,
      "full_page": false
    }
  ],
  "scenarios": [
    {
      "id": "homepage",
      "title": "Homepage",
      "url": "https://example.org",
      "mode": "static",
      "wait_time_ms": 1000,
      "viewport_keys": ["desktop_hd", "mobile"],
      "interactions": []
    }
  ]
}
```

### Interaction Types

Scenarios can include interactions that execute before screenshot capture:

| Type | Description | Required Fields |
|------|-------------|-----------------|
| `click` | Click on an element | `selector` |
| `type` | Type text into an input | `selector`, `value` |
| `mouseover` | Hover over an element | `selector` |
| `wait` | Pause execution | `wait_ms` |

---

## Directory Structure

```
playwright-visual-regression/
├── src/                      # TypeScript source files
│   ├── cli.ts                # CLI entry point
│   ├── index.ts              # Library exports
│   ├── types/                # TypeScript interfaces
│   ├── config/               # Configuration loader
│   ├── services/             # Core services
│   └── commands/             # CLI commands
├── tests/                    # Playwright test files
│   └── visual-regression.spec.ts
├── baselines/                # Baseline screenshots (generated)
├── reports/                  # HTML reports (generated)
│   └── html-report/
├── test-results/             # Test artifacts (generated)
├── dist/                     # Compiled JavaScript (generated)
├── .vrtrc.json               # Configuration file
├── playwright.config.ts      # Playwright configuration
├── global-setup.ts           # Fetches scenarios before tests
├── serve-report.js           # Custom report server
├── package.json
├── tsconfig.json
└── README.md
```

---

## CI/CD Integration

### GitHub Actions

```yaml
name: Visual Regression Tests

on: [push, pull_request]

jobs:
  visual-regression:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright
        run: npx playwright install chromium

      - name: Build
        run: npm run build

      - name: Run Visual Regression Tests
        env:
          VRT_ENDPOINT: ${{ secrets.VRT_ENDPOINT }}
          VRT_TOKEN: ${{ secrets.VRT_TOKEN }}
        run: npm run test

      - name: Upload Report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: reports/html-report/
```

### GitLab CI

```yaml
visual-regression:
  image: mcr.microsoft.com/playwright:v1.40.0-focal
  stage: test
  variables:
    VRT_ENDPOINT: $VRT_ENDPOINT
    VRT_TOKEN: $VRT_TOKEN
  script:
    - npm ci
    - npm run build
    - npm run test
  artifacts:
    when: always
    paths:
      - reports/html-report/
    expire_in: 1 week
```

---

## Troubleshooting

### SSL Certificate Verification Failed

**Error:** `SSL certificate verification failed`

**Solution:** Set `"insecure": true` in your `.vrtrc.json` for local development environments with self-signed certificates (DDEV, Lando, etc.).

### 401 Unauthorized

**Error:** `Authentication failed (TOKEN_MISSING)`

**Solution:**
- Add your bearer token to `.vrtrc.json`: `"token": "your-token-here"`
- Or set the environment variable: `export VRT_TOKEN=your-token-here`

### Connection Refused

**Error:** `Connection refused - is the server running?`

**Solution:**
- Verify the endpoint URL is correct
- Check if the server is running
- Ensure the server is accessible from the test runner

### No Report Found

**Error:** `No report found. Run tests first.`

**Solution:**
```bash
npm run test
npm run report
```

### Port Already in Use

**Error:** `Error: listen EADDRINUSE: address already in use`

**Solution:**
```bash
# Kill existing report server
lsof -ti:9324 | xargs kill -9

# Start report again
npm run report
```

### Flaky Tests

**Solutions:**
- Increase `wait_time_ms` in your scenarios
- Adjust `comparison.threshold` for more tolerance
- Increase `comparison.maxDiffPixels` for minor differences
- Run `npm run baseline` to refresh baselines

### Baseline Generation Partially Failed

**Error:** Some scenarios failed during `npm run baseline`

**Solution:** Regenerate baselines only for the failed scenarios:
```bash
npm run baseline:failed
```

Repeat until all baselines are successfully generated. Common causes of failures:
- Page timeouts (increase `wait_time_ms` in the scenario)
- Network issues (check connectivity to the target URLs)
- JavaScript errors on the page (check browser console)
- Element not found (verify selectors in interactions)

---

## License

MIT
