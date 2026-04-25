import type { ProviderSettings, RenderBackendPreference } from '../types/flow';
import type { NativeRenderExecutionBackend } from './nativeRenderSupport';

interface NativeRenderHealthResponse {
  ok: boolean;
  availableBackends: NativeRenderExecutionBackend[];
  recommendedBackend: NativeRenderExecutionBackend;
}

interface NativeRenderInput {
  name: string;
  url: string;
}

interface NativeRenderRequestInput {
  name: string;
  mimeType: string;
  base64: string;
}

interface NativeRenderRequest {
  outputName: string;
  command: string[];
  backend: NativeRenderExecutionBackend;
  inputs: NativeRenderRequestInput[];
}

interface ResolvedNativeRenderTarget {
  endpoint: string;
  backend: NativeRenderExecutionBackend;
}

let cachedHealth:
  | {
      endpoint: string;
      expiresAt: number;
      health: NativeRenderHealthResponse;
    }
  | undefined;

export async function resolveNativeRenderTarget(
  providerSettings: ProviderSettings,
): Promise<ResolvedNativeRenderTarget | null> {
  const preference = providerSettings.renderBackendPreference;

  if (preference === 'browser') {
    return null;
  }

  const endpoint = normalizeEndpoint(providerSettings.localNativeRenderUrl);
  const health = await fetchNativeRendererHealth(endpoint);

  if (!health) {
    if (preference === 'auto') {
      return null;
    }

    throw new Error(
      `The local native render service is unavailable at ${endpoint}. Switch the render backend to Browser or start the Signal Loom native render service.`,
    );
  }

  const backend = resolveRequestedBackend(preference, health);

  if (!backend) {
    return null;
  }

  return {
    endpoint,
    backend,
  };
}

export async function renderViaLocalNativeFFmpeg({
  providerSettings,
  outputName,
  command,
  inputs,
}: {
  providerSettings: ProviderSettings;
  outputName: string;
  command: string[];
  inputs: NativeRenderInput[];
}): Promise<Blob | null> {
  const target = await resolveNativeRenderTarget(providerSettings);

  if (!target) {
    return null;
  }

  const response = await fetch(`${target.endpoint}/render`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      outputName,
      command,
      backend: target.backend,
      inputs: await Promise.all(inputs.map(serializeRenderInput)),
    } satisfies NativeRenderRequest),
  });

  if (!response.ok) {
    throw new Error(await extractNativeRenderError(response));
  }

  return await response.blob();
}

async function fetchNativeRendererHealth(endpoint: string): Promise<NativeRenderHealthResponse | null> {
  const now = Date.now();

  if (cachedHealth && cachedHealth.endpoint === endpoint && cachedHealth.expiresAt > now) {
    return cachedHealth.health;
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 1200);

  try {
    const response = await fetch(`${endpoint}/health`, {
      method: 'GET',
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const health = (await response.json()) as NativeRenderHealthResponse;
    cachedHealth = {
      endpoint,
      expiresAt: now + 15_000,
      health,
    };
    return health;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeout);
  }
}

function resolveRequestedBackend(
  preference: RenderBackendPreference,
  health: NativeRenderHealthResponse,
): NativeRenderExecutionBackend | null {
  if (preference === 'auto') {
    if (health.availableBackends.includes('amd-vaapi')) {
      return 'amd-vaapi';
    }

    return health.availableBackends.includes('cpu') ? 'cpu' : null;
  }

  if (preference === 'native-cpu') {
    if (health.availableBackends.includes('cpu')) {
      return 'cpu';
    }

    throw new Error('The local native render service is up, but CPU rendering is not available.');
  }

  if (preference === 'native-amd-vaapi') {
    if (health.availableBackends.includes('amd-vaapi')) {
      return 'amd-vaapi';
    }

    throw new Error(
      'AMD VAAPI rendering is not available on this machine. Switch the render backend to Auto or Native FFmpeg CPU.',
    );
  }

  return null;
}

async function serializeRenderInput(input: NativeRenderInput): Promise<NativeRenderRequestInput> {
  const response = await fetch(input.url);

  if (!response.ok) {
    throw new Error(`Unable to prepare local native render input "${input.name}".`);
  }

  const blob = await response.blob();
  const buffer = await blob.arrayBuffer();

  return {
    name: input.name,
    mimeType: blob.type || guessMimeType(input.name),
    base64: arrayBufferToBase64(buffer),
  };
}

async function extractNativeRenderError(response: Response): Promise<string> {
  const text = await response.text();

  if (!text.trim()) {
    return 'The local native render service returned an empty error response.';
  }

  try {
    const payload = JSON.parse(text) as { error?: string };
    return payload.error || text;
  } catch {
    return text;
  }
}

function normalizeEndpoint(value: string): string {
  const trimmed = value.trim();
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function guessMimeType(name: string): string {
  const lowerName = name.toLowerCase();

  if (lowerName.endsWith('.png')) {
    return 'image/png';
  }

  if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) {
    return 'image/jpeg';
  }

  if (lowerName.endsWith('.webp')) {
    return 'image/webp';
  }

  if (lowerName.endsWith('.mp4')) {
    return 'video/mp4';
  }

  if (lowerName.endsWith('.mp3')) {
    return 'audio/mpeg';
  }

  return 'application/octet-stream';
}
