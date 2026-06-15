import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join, normalize } from 'node:path';
import {
  DEFAULT_DASHBOARD_HOST,
  DEFAULT_DASHBOARD_PORT,
  buildDashboardModel,
  renderDashboardHtml,
} from './dashboard-lib.mjs';

const rootDir = process.cwd();
const host = process.env.SIGNAL_LOOM_DASHBOARD_HOST || DEFAULT_DASHBOARD_HOST;
const port = positivePort(process.env.SIGNAL_LOOM_DASHBOARD_PORT, DEFAULT_DASHBOARD_PORT);

const server = createServer((request, response) => {
  try {
    const url = new URL(request.url || '/', `http://${host}:${port}`);
    if (url.pathname === '/status.json') {
      writeJson(response, buildDashboardModel({ rootDir }));
      return;
    }
    if (url.pathname.startsWith('/notes/')) {
      writeNote(response, rootDir, decodeURIComponent(url.pathname.slice('/notes/'.length)));
      return;
    }
    writeHtml(response, renderDashboardHtml(buildDashboardModel({ rootDir })));
  } catch (error) {
    response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    response.end(error instanceof Error ? error.stack || error.message : String(error));
  }
});

server.listen(port, host, () => {
  console.log(`Signal Loom development dashboard listening on http://${host}:${port}`);
});

function positivePort(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(parsed) && parsed > 0 && parsed < 65536 ? parsed : fallback;
}

function writeHtml(response, html) {
  response.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(html);
}

function writeJson(response, data) {
  response.writeHead(200, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify(data, null, 2));
}

function writeNote(response, repoRoot, requestedFileName) {
  const safeFileName = normalize(requestedFileName).replace(/^(\.\.(\/|\\|$))+/, '');
  if (!safeFileName.endsWith('.md') || safeFileName.includes('/') || safeFileName.includes('\\')) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }
  const notePath = join(repoRoot, 'docs', 'notes', safeFileName);
  const content = readFileSync(notePath, 'utf8');
  response.writeHead(200, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(content);
}
