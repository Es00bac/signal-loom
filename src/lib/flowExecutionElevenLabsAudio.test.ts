import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeNodeRequest } from './flowExecution';
import { DEFAULT_EXECUTION_CONFIG } from './providerCatalog';
import type { AppNode, RuntimeSettingsSnapshot } from '../types/flow';

const settings: RuntimeSettingsSnapshot = {
  apiKeys: {
    gemini: '',
    openai: '',
    atlas: '',
    huggingface: '',
    elevenlabs: 'xi-key',
  },
  defaultModels: {
    text: {
      gemini: 'gemini-3-flash-preview',
      openai: 'gpt-4.1-mini',
      huggingface: 'Qwen/Qwen3-4B-Instruct-2507',
    },
    image: {
      gemini: 'gemini-3-pro-image-preview',
      openai: 'gpt-image-2',
      atlas: 'black-forest-labs/flux-schnell',
      huggingface: 'black-forest-labs/FLUX.1-dev',
      bfl: 'flux-2-pro',
      stability: 'stable-image-core',
      localOpen: 'Qwen/Qwen-Image-Edit',
      android: 'local-dream-active',
      byteplus: 'seedream-4.5',
    },
    video: {
      gemini: 'veo-3.1-generate-001',
      huggingface: 'Wan-AI/Wan2.2-T2V-A14B',
      atlas: 'google/veo3.1/text-to-video',
    },
    audio: {
      gemini: 'gemini-3.1-flash-tts-preview',
      elevenlabs: 'eleven_multilingual_v2',
      huggingface: 'hexgrad/Kokoro-82M',
    },
  },
  providerSettings: {
    openaiBaseUrl: '',
    elevenlabsVoiceId: 'default-voice',
    renderBackendPreference: 'auto',
    localNativeRenderUrl: 'http://127.0.0.1:41736',
    backendProxyEnabled: false,
    backendProxyBaseUrl: '',
    geminiCredentialMode: 'api-key',
    vertexAuthMode: 'gcloud-user',
    vertexProjectId: '',
    vertexLocation: 'global',
    vertexQuotaProjectId: '',
    vertexEnvironmentVariables: '',
    vertexServiceAccountJson: '',
    paperPrintUpscaleMethod: 'auto',
    paperPdfRasterPreset: 'balanced-jpeg',
    batchMaxRetries: 10,
    batchRetryBaseDelayMs: 30000,
    androidLanServerEnabled: false,
    androidLanServerPin: '',
  },
} as RuntimeSettingsSnapshot;

function createAudioNode(data: AppNode['data'] = {}): AppNode {
  return {
    id: 'audio-1',
    type: 'audioGen',
    position: { x: 0, y: 0 },
    data: {
      provider: 'elevenlabs',
      modelId: 'eleven_multilingual_v2',
      voiceId: 'voice-abc',
      ...data,
    },
  } as AppNode;
}

function audioResponse(): Response {
  return new Response(new Blob(['MP3'], { type: 'audio/mpeg' }), {
    status: 200,
    headers: { 'content-type': 'audio/mpeg' },
  });
}

describe('executeNodeRequest ElevenLabs speech', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('sends voice_settings and seed when the node sets them, clamped to documented ranges', async () => {
    const fetchMock = vi.fn().mockResolvedValue(audioResponse());
    vi.stubGlobal('fetch', fetchMock);

    await executeNodeRequest(
      createAudioNode({
        audioStability: 0.3,
        audioSimilarityBoost: 0.9,
        audioStyleExaggeration: 0.2,
        audioSpeed: 2, // documented max is 1.2 — must clamp
        audioSeed: 42.7,
      }),
      { prompt: 'Hello there', config: DEFAULT_EXECUTION_CONFIG },
      settings,
    );

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/v1/text-to-speech/voice-abc');
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.model_id).toBe('eleven_multilingual_v2');
    expect(body.seed).toBe(42);
    expect(body.voice_settings).toEqual({
      stability: 0.3,
      similarity_boost: 0.9,
      style: 0.2,
      speed: 1.2,
    });
  });

  it('omits voice_settings and seed entirely when the node leaves them blank (voice defaults win)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(audioResponse());
    vi.stubGlobal('fetch', fetchMock);

    await executeNodeRequest(
      createAudioNode(),
      { prompt: 'Hello there', config: DEFAULT_EXECUTION_CONFIG },
      settings,
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).toEqual({ text: 'Hello there', model_id: 'eleven_multilingual_v2' });
  });

  it('sends only the voice settings the user actually set', async () => {
    const fetchMock = vi.fn().mockResolvedValue(audioResponse());
    vi.stubGlobal('fetch', fetchMock);

    await executeNodeRequest(
      createAudioNode({ audioStability: 0.8 }),
      { prompt: 'Hello there', config: DEFAULT_EXECUTION_CONFIG },
      settings,
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.voice_settings).toEqual({ stability: 0.8 });
    expect(body.seed).toBeUndefined();
  });
});
