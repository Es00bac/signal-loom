import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const port = Number.parseInt(process.env.SIGNAL_LOOM_AGENT_PORT ?? '41732', 10);
const previewPort = Number.parseInt(process.env.SIGNAL_LOOM_PREVIEW_PORT ?? '4174', 10);
const previewServiceName = process.env.SIGNAL_LOOM_PREVIEW_SERVICE ?? 'signal-loom-preview.service';
const authToken = process.env.SIGNAL_LOOM_AGENT_TOKEN ?? '';

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(payload));
}

function isAuthorized(request) {
  if (!authToken) {
    return false;
  }

  const header = request.headers.authorization ?? '';
  return header === `Bearer ${authToken}`;
}

async function getServiceState() {
  let active = false;
  let state = 'inactive';
  let subState = 'dead';
  let result = 'success';

  try {
    await execFileAsync('systemctl', ['--user', 'is-active', '--quiet', previewServiceName]);
    active = true;
  } catch {
    active = false;
  }

  try {
    const { stdout } = await execFileAsync('systemctl', [
      '--user',
      'show',
      previewServiceName,
      '--property=ActiveState,SubState,Result',
      '--value',
    ]);
    const [nextState, nextSubState, nextResult] = stdout.trim().split('\n');
    state = nextState || state;
    subState = nextSubState || subState;
    result = nextResult || result;
  } catch {
    // Keep the fallback values when the unit has not been loaded yet.
  }

  let httpHealthy = false;

  try {
    const response = await fetch(`http://127.0.0.1:${previewPort}/`, {
      headers: { Accept: 'text/html,application/xhtml+xml' },
      redirect: 'manual',
      signal: AbortSignal.timeout(3500),
    });
    httpHealthy = response.ok || response.status === 304;
  } catch {
    httpHealthy = false;
  }

  return {
    serviceName: previewServiceName,
    serviceActive: active,
    serviceState: state,
    serviceSubState: subState,
    serviceResult: result,
    httpHealthy,
    previewPort,
    previewUrl: `http://127.0.0.1:${previewPort}/`,
  };
}

async function startPreviewService() {
  await execFileAsync('systemctl', ['--user', 'start', previewServiceName]);
}

const server = http.createServer(async (request, response) => {
  try {
    if (request.url === '/health' && request.method === 'GET') {
      sendJson(response, 200, { ok: true });
      return;
    }

    if (!isAuthorized(request)) {
      sendJson(response, 401, { error: 'Unauthorized' });
      return;
    }

    if (request.url === '/status' && request.method === 'GET') {
      sendJson(response, 200, await getServiceState());
      return;
    }

    if (request.url === '/start' && request.method === 'POST') {
      await startPreviewService();
      sendJson(response, 202, {
        ok: true,
        message: 'Signal Loom preview start requested.',
        status: await getServiceState(),
      });
      return;
    }

    sendJson(response, 404, { error: 'Not found' });
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : 'Unexpected local agent failure.',
    });
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Signal Loom local agent listening on 127.0.0.1:${port}`);
});
