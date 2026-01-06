#!/usr/bin/env node
/**
 * Custom Report Server
 * Serves Visual Regression Test HTML report
 */

const http = require('http');
const net = require('net');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// Check for VRT report first, fall back to Playwright report
const VRT_REPORT_DIR = path.join(__dirname, 'vrt-report');
const PLAYWRIGHT_REPORT_DIR = path.join(__dirname, 'reports', 'html-report');
const REPORT_DIR = fs.existsSync(VRT_REPORT_DIR) ? VRT_REPORT_DIR : PLAYWRIGHT_REPORT_DIR;
const PORT = 9324;

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
  red: '\x1b[31m',
};

/**
 * Check if a port is already in use
 */
function isPortInUse(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(true);
      } else {
        resolve(false);
      }
    });
    server.once('listening', () => {
      server.close();
      resolve(false);
    });
    server.listen(port, '127.0.0.1');
  });
}

// Custom CSS to inject
const CUSTOM_CSS = `
<style>
  body { max-width: 1600px !important; margin: 0 auto !important; }
</style>
`;

// MIME types
const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

// Check if report exists
if (!fs.existsSync(REPORT_DIR)) {
  console.error(`${colors.red}No report found. Run tests first: npm run run-tests${colors.reset}`);
  process.exit(1);
}

/**
 * Open URL in default browser
 */
function openBrowser(url) {
  const openCommand = process.platform === 'darwin'
    ? 'open'
    : process.platform === 'win32'
      ? 'start'
      : 'xdg-open';
  exec(`${openCommand} ${url}`);
}

/**
 * Handle HTTP requests
 */
function handleRequest(req, res) {
  let filePath = path.join(REPORT_DIR, req.url === '/' ? 'index.html' : req.url);

  // Remove query strings
  filePath = filePath.split('?')[0];

  // Decode URL-encoded paths
  filePath = decodeURIComponent(filePath);

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        // Try index.html for SPA routing
        fs.readFile(path.join(REPORT_DIR, 'index.html'), (err2, content2) => {
          if (err2) {
            res.writeHead(404);
            res.end('Not found');
          } else {
            let html = content2.toString();
            // Only inject custom CSS for Playwright reports (which have </head>)
            if (html.includes('</head>') && REPORT_DIR === PLAYWRIGHT_REPORT_DIR) {
              html = html.replace('</head>', CUSTOM_CSS + '</head>');
            }
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(html);
          }
        });
      } else {
        res.writeHead(500);
        res.end('Server error');
      }
    } else {
      // Inject custom CSS into HTML files (only for Playwright reports)
      if (ext === '.html' && REPORT_DIR === PLAYWRIGHT_REPORT_DIR) {
        let html = content.toString();
        html = html.replace('</head>', CUSTOM_CSS + '</head>');
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(html);
      } else {
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
      }
    }
  });
}

/**
 * Start the server
 */
async function startServer() {
  const url = `http://localhost:${PORT}`;

  // Check if server is already running
  const portInUse = await isPortInUse(PORT);
  if (portInUse) {
    console.log();
    console.log(`  ${colors.yellow}${colors.bold}Report server is already running!${colors.reset}`);
    console.log();
    console.log(`  ${colors.cyan}View report at:${colors.reset} ${colors.green}${colors.bold}${url}${colors.reset}`);
    console.log();
    console.log(`  ${colors.magenta}Opening browser...${colors.reset}`);
    console.log();
    openBrowser(url);
    process.exit(0);
  }

  const server = http.createServer(handleRequest);

  server.listen(PORT, '127.0.0.1', () => {
    const reportType = REPORT_DIR === VRT_REPORT_DIR ? 'VRT' : 'Playwright';
    console.log();
    console.log(`  ${colors.green}${colors.bold}${reportType} Report server started!${colors.reset}`);
    console.log();
    console.log(`  ${colors.cyan}Report directory:${colors.reset} ${REPORT_DIR}`);
    console.log(`  ${colors.cyan}View report at:${colors.reset} ${colors.green}${colors.bold}${url}${colors.reset}`);
    console.log();
    console.log(`  ${colors.yellow}Press Ctrl+C to quit.${colors.reset}`);
    console.log();
    openBrowser(url);
  });

  // Handle shutdown
  process.on('SIGINT', () => {
    console.log(`\n  ${colors.magenta}Shutting down...${colors.reset}\n`);
    server.close();
    process.exit(0);
  });
}

// Start the server
startServer();
