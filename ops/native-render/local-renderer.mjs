import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';

const HOST = process.env.SIGNAL_LOOM_NATIVE_RENDER_HOST || '127.0.0.1';
const PORT = Number.parseInt(process.env.SIGNAL_LOOM_NATIVE_RENDER_PORT || '41736', 10);
const VAAPI_DEVICE = '/dev/dri/renderD128';

const health = await probeCapabilities();

const server = http.createServer(async (request, response) => {
  setCorsHeaders(response);

  if (request.method === 'OPTIONS') {
    response.writeHead(204);
    response.end();
    return;
  }

  try {
    if (request.method === 'GET' && request.url === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(health));
      return;
    }

    if (request.method === 'POST' && request.url === '/render') {
      const payload = await readJson(request);
      const result = await executeRenderJob(payload);
      response.writeHead(200, {
        'Content-Type': 'video/mp4',
        'X-Signal-Loom-Renderer': payload.backend,
      });
      response.end(result);
      return;
    }

    response.writeHead(404, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: 'Not found.' }));
  } catch (error) {
    response.writeHead(500, { 'Content-Type': 'application/json' });
    response.end(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Signal Loom native render service listening on http://${HOST}:${PORT}`);
});

async function probeCapabilities() {
  const availableBackends = ['cpu'];
  const ffmpegVersion = await readFfmpegVersion();

  if (await probeVaapiBackend()) {
    availableBackends.push('amd-vaapi');
  }

  return {
    ok: true,
    ffmpegVersion,
    availableBackends,
    recommendedBackend: availableBackends.includes('amd-vaapi') ? 'amd-vaapi' : 'cpu',
    cpuThreads: os.cpus().length,
  };
}

async function readFfmpegVersion() {
  try {
    const output = await runProcess('ffmpeg', ['-hide_banner', '-version'], undefined);
    return output.stdout.split('\n')[0]?.trim() || 'ffmpeg';
  } catch {
    return 'ffmpeg';
  }
}

async function probeVaapiBackend() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'signal-loom-vaapi-probe-'));

  try {
    const outputPath = path.join(tempDir, 'probe.mp4');
    await runProcess(
      'ffmpeg',
      [
        '-hide_banner',
        '-y',
        '-f',
        'lavfi',
        '-i',
        'color=c=black:s=1280x720:r=30:d=0.2',
        '-vf',
        'format=nv12,hwupload',
        '-vaapi_device',
        VAAPI_DEVICE,
        '-c:v',
        'h264_vaapi',
        outputPath,
      ],
      tempDir,
    );
    return true;
  } catch {
    return false;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function executeRenderJob(payload) {
  validateRenderPayload(payload);
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'signal-loom-render-'));

  try {
    for (const input of payload.inputs) {
      const fileName = sanitizeFileName(input.name);
      await writeFile(path.join(tempDir, fileName), Buffer.from(input.base64, 'base64'));
    }

    const outputName = sanitizeFileName(payload.outputName);
    await runProcess('ffmpeg', ['-hide_banner', '-y', ...payload.command], tempDir);
    return await readFile(path.join(tempDir, outputName));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function validateRenderPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Render payload is missing.');
  }

  if (!Array.isArray(payload.command) || payload.command.length === 0) {
    throw new Error('Render command is missing.');
  }

  if (!Array.isArray(payload.inputs)) {
    throw new Error('Render inputs are missing.');
  }

  if (typeof payload.outputName !== 'string' || !payload.outputName.trim()) {
    throw new Error('Render output name is missing.');
  }

  if (payload.backend === 'amd-vaapi' && !health.availableBackends.includes('amd-vaapi')) {
    throw new Error('AMD VAAPI rendering was requested, but this machine does not currently support it.');
  }
}

async function readJson(request) {
  const chunks = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    totalBytes += chunk.length;

    if (totalBytes > 1024 * 1024 * 1024) {
      throw new Error('Render request body exceeded the 1GB safety limit.');
    }

    chunks.push(chunk);
  }

  const rawBody = Buffer.concat(chunks).toString('utf8');

  if (!rawBody.trim()) {
    throw new Error('Render request body is empty.');
  }

  return JSON.parse(rawBody);
}

function sanitizeFileName(value) {
  const safeName = path.basename(value).replace(/[^a-zA-Z0-9._-]/g, '_');

  if (!safeName) {
    throw new Error(`Invalid render input or output name: ${value}`);
  }

  return safeName;
}

function setCorsHeaders(response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
}

function runProcess(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr, code });
        return;
      }

      reject(new Error(stderr.trim() || `${command} exited with code ${code}`));
    });
  });
}
