import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeNodeRequest } from './flowExecution';
import { DEFAULT_EXECUTION_CONFIG } from './providerCatalog';
import type { AppNode, RuntimeSettingsSnapshot } from '../types/flow';

/**
 * Backend-proxy execution parity (AUD-012 follow-up): the proxy request must stay free of
 * client credentials, while node execution options — the auto-upscale request above all — keep
 * working through client-side post-processing exactly as they do on the direct provider path.
 */

const PROXY_EXECUTE_URL = 'https://proxy.example/api/flow/execute-node';

function proxySettings(overrides: Partial<RuntimeSettingsSnapshot['providerSettings']> = {}, apiKeys: Partial<RuntimeSettingsSnapshot['apiKeys']> = {}): RuntimeSettingsSnapshot {
  return {
    apiKeys: {
      gemini: '',
      openai: '',
      atlas: '',
      huggingface: '',
      elevenlabs: '',
      bfl: '',
      stability: '',
      ...apiKeys,
    },
    defaultModels: {
      text: { gemini: 'gemini-3-flash-preview', openai: 'gpt-4.1-mini', huggingface: 'Qwen/Qwen3-4B-Instruct-2507' },
      image: {
        gemini: 'gemini-3-pro-image-preview',
        openai: 'gpt-image-2',
        atlas: 'gpt-image-2',
        huggingface: 'black-forest-labs/FLUX.1-dev',
        bfl: 'flux-2-pro',
        stability: 'stable-image-core',
        localOpen: 'Qwen/Qwen-Image-Edit',
        android: 'local-dream-active',
        byteplus: 'seedream-4.5',
      },
      video: { gemini: 'veo-3.1-generate-preview', huggingface: 'Wan-AI/Wan2.2-T2V-A14B', atlas: 'google/veo3.1/text-to-video' },
      audio: { gemini: 'gemini-3.1-flash-tts-preview', elevenlabs: 'eleven_multilingual_v2', huggingface: 'hexgrad/Kokoro-82M' },
    },
    providerSettings: {
      openaiBaseUrl: '',
      elevenlabsVoiceId: '',
      renderBackendPreference: 'auto',
      exportCompositorPreference: 'stage',
      localNativeRenderUrl: 'http://127.0.0.1:41736',
      backendProxyEnabled: true,
      backendProxyBaseUrl: 'https://proxy.example',
      geminiCredentialMode: 'api-key',
      vertexAuthMode: 'gcloud-user',
      vertexProjectId: '',
      vertexLocation: 'global',
      vertexQuotaProjectId: '',
      vertexEnvironmentVariables: '',
      vertexServiceAccountJson: '',
      paperPrintUpscaleMethod: 'auto',
      paperPdfRasterPreset: 'balanced-jpeg',
      localOpenImageEndpointUrl: '',
      localOpenImageAuthHeader: '',
      localOpenImageDefaultModel: 'Qwen/Qwen-Image-Edit',
      // Keep failure tests immediate: the retry wrapper is client-side and wraps proxy calls.
      batchMaxRetries: 0,
      batchRetryBaseDelayMs: 1,
      androidLanServerEnabled: false,
      androidLanServerPin: '',
      ...overrides,
    },
  } as RuntimeSettingsSnapshot;
}

function proxiedImageNode(data: AppNode['data'] = {}): AppNode {
  return {
    id: 'image-proxy-1',
    type: 'imageGen',
    position: { x: 0, y: 0 },
    data: {
      provider: 'stability',
      modelId: 'stable-image-core',
      ...data,
    },
  } as AppNode;
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function imageResponse(body = 'PNG'): Response {
  return new Response(new Blob([body], { type: 'image/png' }), {
    status: 200,
    headers: { 'content-type': 'image/png' },
  });
}

const PROXY_IMAGE_RESULT = {
  result: 'data:image/png;base64,Q09SRQ==',
  resultType: 'image',
  statusMessage: 'Generated through backend proxy',
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('backend proxy node execution with client-side auto-upscale', () => {
  it('applies the Android accelerator upscale on the client after the proxy returns, without forwarding the token', async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL, _init?: RequestInit) => {
      void _init;
      const stringUrl = String(url);
      if (stringUrl === PROXY_EXECUTE_URL) {
        return jsonResponse(PROXY_IMAGE_RESULT);
      }
      if (stringUrl.includes('/v1/capabilities')) {
        return jsonResponse({ ok: true, models: [], upscalers: [] });
      }
      if (stringUrl.includes('/v1/upscale')) {
        return imageResponse('ANDROID');
      }
      throw new Error(`unexpected fetch: ${stringUrl}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeNodeRequest(
      proxiedImageNode({ imageAutoUpscale: true }),
      { prompt: 'castle at sunrise', config: DEFAULT_EXECUTION_CONFIG },
      proxySettings({
        paperPrintUpscaleMethod: 'auto',
        androidAcceleratorBaseUrl: 'http://192.168.1.42:8788',
        androidAcceleratorAuthToken: 'SECRET-android-pair-token',
        androidAcceleratorDefaultUpscaler: 'upscaler_realistic',
      }),
    );

    // The proxy request itself carries the node's upscale flag but no upscaler credentials.
    const proxyCall = fetchMock.mock.calls.find(([url]) => String(url) === PROXY_EXECUTE_URL);
    expect(proxyCall).toBeTruthy();
    const proxyBody = String(proxyCall?.[1]?.body);
    expect(proxyBody).toContain('"imageAutoUpscale":true');
    expect(proxyBody).not.toContain('SECRET-');
    expect(proxyBody).not.toContain('androidAcceleratorAuthToken');

    // The upscale ran on this device, against the phone, with the locally held token.
    const upscaleCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/v1/upscale'));
    expect(upscaleCall).toBeTruthy();
    expect(String(upscaleCall?.[0])).toBe('http://192.168.1.42:8788/v1/upscale');
    const upscaleHeaders = (upscaleCall?.[1]?.headers ?? {}) as Record<string, string>;
    expect(upscaleHeaders.Authorization).toBe('Bearer SECRET-android-pair-token');

    expect(result.result).toBe('data:image/png;base64,QU5EUk9JRA==');
    expect(result.statusMessage).toContain('auto-upscaled');
  });

  it('applies a non-default upscale method (stability-fast) to the proxied result with the locally held key', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:stability-upscaled');
    const fetchMock = vi.fn(async (url: RequestInfo | URL, _init?: RequestInit) => {
      void _init;
      const stringUrl = String(url);
      if (stringUrl === PROXY_EXECUTE_URL) {
        return jsonResponse(PROXY_IMAGE_RESULT);
      }
      if (stringUrl.startsWith('data:') || stringUrl.startsWith('blob:')) {
        return imageResponse('CORE');
      }
      if (stringUrl.includes('/stable-image/upscale/fast')) {
        return imageResponse('UPSCALED');
      }
      throw new Error(`unexpected fetch: ${stringUrl}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeNodeRequest(
      proxiedImageNode({ imageAutoUpscale: true }),
      { prompt: 'castle at sunrise', config: DEFAULT_EXECUTION_CONFIG },
      proxySettings({ paperPrintUpscaleMethod: 'stability-fast' }, { stability: 'SECRET-stability-key' }),
    );

    const proxyBody = String(fetchMock.mock.calls.find(([url]) => String(url) === PROXY_EXECUTE_URL)?.[1]?.body);
    expect(proxyBody).not.toContain('SECRET-');

    const upscaleCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/stable-image/upscale/fast'));
    expect(upscaleCall).toBeTruthy();

    expect(result.result).toBe('blob:stability-upscaled');
    expect(result.statusMessage).toContain('auto-upscaled');
  });

  it('fails explicitly — not silently — when the requested upscaler is unavailable in proxy mode', async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url) === PROXY_EXECUTE_URL) {
        return jsonResponse(PROXY_IMAGE_RESULT);
      }
      throw new Error(`unexpected fetch: ${String(url)}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(executeNodeRequest(
      proxiedImageNode({ imageAutoUpscale: true }),
      { prompt: 'castle at sunrise', config: DEFAULT_EXECUTION_CONFIG },
      // stability-fast explicitly selected but no Stability key is configured.
      proxySettings({ paperPrintUpscaleMethod: 'stability-fast' }),
    )).rejects.toThrow(/Stability AI key is not configured/);
  });

  it('leaves proxied non-upscale runs untouched', async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url) === PROXY_EXECUTE_URL) {
        return jsonResponse(PROXY_IMAGE_RESULT);
      }
      throw new Error(`unexpected fetch: ${String(url)}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeNodeRequest(
      proxiedImageNode(),
      { prompt: 'castle at sunrise', config: DEFAULT_EXECUTION_CONFIG },
      proxySettings({ paperPrintUpscaleMethod: 'stability-fast' }, { stability: 'stability-key' }),
    );

    expect(result.result).toBe(PROXY_IMAGE_RESULT.result);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
