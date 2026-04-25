import http from 'node:http';
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { pipeline } from 'node:stream';

const pipelineAsync = promisify(pipeline);

const port = Number.parseInt(process.env.SIGNAL_LOOM_GATEWAY_PORT ?? '4180', 10);
const appUpstream = process.env.SIGNAL_LOOM_APP_UPSTREAM ?? 'http://127.0.0.1:41731';
const agentUpstream = process.env.SIGNAL_LOOM_AGENT_UPSTREAM ?? 'http://127.0.0.1:41732';
const agentToken = process.env.SIGNAL_LOOM_AGENT_TOKEN ?? '';
const passwordHash = process.env.SIGNAL_LOOM_LOGIN_PASSWORD_HASH ?? '';
const sessionSecret = process.env.SIGNAL_LOOM_SESSION_SECRET ?? '';
const publicOrigin = process.env.SIGNAL_LOOM_PUBLIC_ORIGIN ?? 'https://loom.opencasagent.com';
const cookieName = 'signal_loom_session';
const sessionTtlSeconds = Number.parseInt(process.env.SIGNAL_LOOM_SESSION_TTL_SECONDS ?? '43200', 10);

if (!passwordHash || !sessionSecret || !agentToken) {
  throw new Error('Signal Loom gateway is missing required secrets.');
}

function hmac(value) {
  return crypto.createHmac('sha256', sessionSecret).update(value).digest('base64url');
}

function encodeSession(payload) {
  const serialized = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${serialized}.${hmac(serialized)}`;
}

function decodeSession(value) {
  if (!value) {
    return undefined;
  }

  const [serialized, signature] = value.split('.');

  if (!serialized || !signature || hmac(serialized) !== signature) {
    return undefined;
  }

  try {
    const payload = JSON.parse(Buffer.from(serialized, 'base64url').toString('utf8'));

    if (!payload || typeof payload.exp !== 'number' || payload.exp < Date.now()) {
      return undefined;
    }

    return payload;
  } catch {
    return undefined;
  }
}

function parseCookies(request) {
  const cookieHeader = request.headers.cookie ?? '';
  const entries = cookieHeader.split(';').map((part) => part.trim()).filter(Boolean);
  const cookies = new Map();

  for (const entry of entries) {
    const separatorIndex = entry.indexOf('=');

    if (separatorIndex <= 0) {
      continue;
    }

    cookies.set(entry.slice(0, separatorIndex), decodeURIComponent(entry.slice(separatorIndex + 1)));
  }

  return cookies;
}

function isAuthenticated(request) {
  return Boolean(decodeSession(parseCookies(request).get(cookieName)));
}

function setAuthCookie(response) {
  const expiresAt = Date.now() + sessionTtlSeconds * 1000;
  const sessionValue = encodeSession({ exp: expiresAt, iat: Date.now() });
  response.setHeader(
    'Set-Cookie',
    `${cookieName}=${encodeURIComponent(sessionValue)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${sessionTtlSeconds}`,
  );
}

function clearAuthCookie(response) {
  response.setHeader(
    'Set-Cookie',
    `${cookieName}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`,
  );
}

function redirect(response, location, headers = {}) {
  response.writeHead(303, { Location: location, 'Cache-Control': 'no-store', ...headers });
  response.end();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

async function verifyPassword(password) {
  const [algorithm, saltHex, hashHex] = passwordHash.split(':');

  if (algorithm !== 'scrypt' || !saltHex || !hashHex) {
    return false;
  }

  const derived = await promisify(crypto.scrypt)(password, Buffer.from(saltHex, 'hex'), 64);
  const expected = Buffer.from(hashHex, 'hex');
  const actual = Buffer.from(derived);

  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

async function readFormBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

async function fetchAgent(path, init = {}) {
  return fetch(`${agentUpstream}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${agentToken}`,
    },
    signal: AbortSignal.timeout(4000),
  });
}

async function getAgentStatus() {
  try {
    const response = await fetchAgent('/status');

    if (!response.ok) {
      return {
        tunnelReachable: false,
        appRunning: false,
        previewPort: undefined,
        message: `Agent returned ${response.status}.`,
      };
    }

    const payload = await response.json();

    return {
      tunnelReachable: true,
      appRunning: Boolean(payload.httpHealthy),
      serviceActive: Boolean(payload.serviceActive),
      serviceState: payload.serviceState,
      serviceSubState: payload.serviceSubState,
      previewPort: payload.previewPort,
      message: payload.httpHealthy
        ? 'Remote app is online.'
        : payload.serviceActive
          ? 'Preview service is active but not healthy yet.'
          : 'Preview service is currently stopped.',
    };
  } catch {
    return {
      tunnelReachable: false,
      appRunning: false,
      previewPort: undefined,
      message: 'The local tunnel agent is unreachable from the VPS.',
    };
  }
}

async function startRemotePreview() {
  const response = await fetchAgent('/start', { method: 'POST' });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Agent returned ${response.status}.`);
  }
}

function sendHtml(response, statusCode, html, headers = {}) {
  response.writeHead(statusCode, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
    ...headers,
  });
  response.end(html);
}

function renderLoginPage({ error } = {}) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Signal Loom Remote Login</title>
    <style>
      :root { color-scheme: dark; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: radial-gradient(circle at top, #152135 0%, #090c12 48%, #03050a 100%); font-family: Inter, system-ui, sans-serif; color: #f3f4f6; }
      .card { width: min(28rem, calc(100vw - 2rem)); border-radius: 24px; border: 1px solid rgba(110, 124, 158, 0.35); background: rgba(15, 19, 27, 0.92); box-shadow: 0 24px 80px rgba(0,0,0,0.45); padding: 1.75rem; }
      h1 { margin: 0; font-size: 1.6rem; }
      p { color: #9aa4b2; line-height: 1.6; }
      input { width: 100%; box-sizing: border-box; border-radius: 14px; border: 1px solid rgba(83, 100, 132, 0.6); background: #090d14; color: #f9fafb; padding: 0.9rem 1rem; font-size: 1rem; }
      button { width: 100%; border: 0; border-radius: 14px; background: linear-gradient(135deg, #3b82f6, #06b6d4); color: white; padding: 0.95rem 1rem; font-weight: 700; cursor: pointer; }
      .error { margin-top: 1rem; border-radius: 14px; background: rgba(127, 29, 29, 0.45); border: 1px solid rgba(248, 113, 113, 0.35); padding: 0.8rem 1rem; color: #fecaca; }
      .eyebrow { font-size: 0.72rem; letter-spacing: 0.18em; text-transform: uppercase; color: #93c5fd; margin-bottom: 0.85rem; }
      label { display: block; margin: 1rem 0 0.45rem; color: #d1d5db; font-size: 0.9rem; }
    </style>
  </head>
  <body>
    <form class="card" method="post" action="/login">
      <div class="eyebrow">Signal Loom Remote Access</div>
      <h1>Secure Login</h1>
      <p>Sign in to reach the remote Signal Loom gateway at <strong>${escapeHtml(publicOrigin)}</strong>.</p>
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required />
      <div style="margin-top: 1rem;">
        <button type="submit">Unlock Signal Loom</button>
      </div>
      ${error ? `<div class="error">${escapeHtml(error)}</div>` : ''}
    </form>
  </body>
</html>`;
}

function renderControlPage(status, query) {
  const started = query.get('started');
  const error = query.get('error');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Signal Loom Remote Control</title>
    <style>
      :root { color-scheme: dark; }
      body { margin: 0; min-height: 100vh; background: radial-gradient(circle at top, #162336 0%, #090d13 48%, #020409 100%); font-family: Inter, system-ui, sans-serif; color: #f3f4f6; }
      .shell { max-width: 56rem; margin: 0 auto; padding: 2rem 1.25rem 3rem; }
      .card { border-radius: 24px; border: 1px solid rgba(110,124,158,0.28); background: rgba(15,19,27,0.92); box-shadow: 0 24px 80px rgba(0,0,0,0.42); padding: 1.5rem; }
      h1 { margin: 0; font-size: 1.9rem; }
      .eyebrow { font-size: 0.72rem; letter-spacing: 0.18em; text-transform: uppercase; color: #93c5fd; margin-bottom: 0.8rem; }
      p { color: #a4afbe; line-height: 1.65; }
      .grid { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); margin-top: 1.25rem; }
      .stat { border-radius: 18px; border: 1px solid rgba(83,100,132,0.48); background: rgba(9,13,20,0.72); padding: 1rem; }
      .label { font-size: 0.72rem; letter-spacing: 0.16em; text-transform: uppercase; color: #7dd3fc; margin-bottom: 0.55rem; }
      .value { font-size: 1.15rem; font-weight: 700; }
      .actions { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-top: 1.5rem; }
      .primary, .secondary, .danger { border: 0; border-radius: 14px; padding: 0.9rem 1.1rem; font-weight: 700; cursor: pointer; }
      .primary { background: linear-gradient(135deg, #3b82f6, #06b6d4); color: white; }
      .secondary { background: rgba(17,24,39,0.85); border: 1px solid rgba(83,100,132,0.48); color: #f9fafb; text-decoration: none; display: inline-flex; align-items: center; }
      .danger { background: rgba(127,29,29,0.45); color: #fecaca; border: 1px solid rgba(248,113,113,0.35); }
      .notice { margin-top: 1rem; border-radius: 14px; padding: 0.9rem 1rem; }
      .notice.ok { background: rgba(8,145,178,0.18); border: 1px solid rgba(34,211,238,0.24); color: #cffafe; }
      .notice.warn { background: rgba(127,29,29,0.32); border: 1px solid rgba(248,113,113,0.28); color: #fecaca; }
      form { margin: 0; }
    </style>
  </head>
  <body>
    <div class="shell">
      <div class="card">
        <div class="eyebrow">Signal Loom Remote Access</div>
        <h1>Remote Control</h1>
        <p>Use this control page to verify the reverse tunnel, start the local preview service on this workstation, and open the app once it is online.</p>
        ${started ? '<div class="notice ok">Start request sent. Give the preview service a few seconds to build and come online, then open the app.</div>' : ''}
        ${error ? `<div class="notice warn">${escapeHtml(error)}</div>` : ''}
        <div class="grid">
          <div class="stat">
            <div class="label">Tunnel</div>
            <div class="value">${status.tunnelReachable ? 'Reachable' : 'Offline'}</div>
          </div>
          <div class="stat">
            <div class="label">Preview Service</div>
            <div class="value">${escapeHtml(status.serviceState ?? 'unknown')} / ${escapeHtml(status.serviceSubState ?? 'unknown')}</div>
          </div>
          <div class="stat">
            <div class="label">Remote App</div>
            <div class="value">${status.appRunning ? 'Online' : 'Stopped'}</div>
          </div>
        </div>
        <div class="notice ${status.appRunning ? 'ok' : 'warn'}">${escapeHtml(status.message)}</div>
        <div class="actions">
          ${status.appRunning ? '<a class="primary" href="/">Open Signal Loom</a>' : ''}
          ${status.tunnelReachable ? '<form method="post" action="/start"><button class="secondary" type="submit">Start Local Service</button></form>' : ''}
          <a class="secondary" href="/control">Refresh Status</a>
          <form method="post" action="/logout"><button class="danger" type="submit">Log Out</button></form>
        </div>
      </div>
    </div>
  </body>
</html>`;
}

async function proxyToApp(request, response) {
  const upstreamBase = new URL(appUpstream);
  const requestUrl = new URL(request.url ?? '/', publicOrigin);
  const targetUrl = new URL(requestUrl.pathname + requestUrl.search, upstreamBase);
  const upstreamHeaders = { ...request.headers };
  delete upstreamHeaders.host;
  delete upstreamHeaders.cookie;
  delete upstreamHeaders['if-none-match'];
  delete upstreamHeaders['if-modified-since'];

  const upstreamRequest = http.request(targetUrl, {
    method: request.method,
    headers: {
      ...upstreamHeaders,
      host: upstreamBase.host,
      'x-forwarded-host': request.headers.host ?? '',
      'x-forwarded-proto': 'https',
    },
  });

  upstreamRequest.on('response', async (upstreamResponse) => {
    const responseHeaders = { ...upstreamResponse.headers };
    delete responseHeaders['set-cookie'];
    delete responseHeaders.etag;
    delete responseHeaders['last-modified'];
    responseHeaders['cache-control'] = 'no-store';
    responseHeaders.pragma = 'no-cache';
    responseHeaders.expires = '0';
    response.writeHead(upstreamResponse.statusCode ?? 502, responseHeaders);
    await pipelineAsync(upstreamResponse, response);
  });

  upstreamRequest.on('error', () => {
    redirect(response, '/control?error=The%20local%20Signal%20Loom%20service%20is%20not%20reachable.');
  });

  if (request.method === 'GET' || request.method === 'HEAD') {
    upstreamRequest.end();
    return;
  }

  await pipelineAsync(request, upstreamRequest);
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url ?? '/', publicOrigin);

  if (requestUrl.pathname === '/health') {
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify({ ok: true }));
    return;
  }

  if (requestUrl.pathname === '/login' && request.method === 'GET') {
    if (isAuthenticated(request)) {
      redirect(response, '/control');
      return;
    }

    sendHtml(response, 200, renderLoginPage({ error: requestUrl.searchParams.get('error') ?? undefined }));
    return;
  }

  if (requestUrl.pathname === '/login' && request.method === 'POST') {
    const form = await readFormBody(request);
    const password = form.get('password') ?? '';

    if (await verifyPassword(password)) {
      setAuthCookie(response);
      redirect(response, '/control');
      return;
    }

    sendHtml(response, 401, renderLoginPage({ error: 'Incorrect password.' }));
    return;
  }

  if (!isAuthenticated(request)) {
    redirect(response, '/login');
    return;
  }

  if (requestUrl.pathname === '/logout' && request.method === 'POST') {
    clearAuthCookie(response);
    redirect(response, '/login');
    return;
  }

  if (requestUrl.pathname === '/control' && request.method === 'GET') {
    sendHtml(response, 200, renderControlPage(await getAgentStatus(), requestUrl.searchParams));
    return;
  }

  if (requestUrl.pathname === '/start' && request.method === 'POST') {
    try {
      await startRemotePreview();
      redirect(response, '/control?started=1');
      return;
    } catch (error) {
      redirect(response, `/control?error=${encodeURIComponent(error instanceof Error ? error.message : 'Failed to start the local preview service.')}`);
      return;
    }
  }

  const status = await getAgentStatus();

  if (!status.appRunning) {
    redirect(response, '/control?error=Signal%20Loom%20is%20not%20running%20yet.');
    return;
  }

  await proxyToApp(request, response);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Signal Loom VPS gateway listening on 127.0.0.1:${port}`);
});
