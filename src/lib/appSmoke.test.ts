import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeNodeRequest } from './flowExecution';
import { DEFAULT_MODELS, DEFAULT_PROVIDER_SETTINGS } from './providerCatalog';
import type { AppNode, RuntimeSettingsSnapshot } from '../types/flow';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('application smoke tests', () => {
  it('keeps node default model settings populated for every generation capability', () => {
    expect(DEFAULT_MODELS.text.gemini).toBeTruthy();
    expect(DEFAULT_MODELS.image.gemini).toBeTruthy();
    expect(DEFAULT_MODELS.video.gemini).toBeTruthy();
    expect(DEFAULT_MODELS.audio.elevenlabs).toBeTruthy();
  });

  it('keeps proxy settings persistable as primitive values', () => {
    expect(DEFAULT_PROVIDER_SETTINGS.backendProxyEnabled).toBe(false);
    expect(DEFAULT_PROVIDER_SETTINGS.backendProxyBaseUrl).toBe('');
  });

  it('can execute a tiny proxied text graph request and surface telemetry', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        result: 'proxied result',
        resultType: 'text',
        statusMessage: 'Generated through smoke proxy',
        usage: {
          source: 'actual',
          confidence: 'measured',
          provider: 'proxy',
          totalTokens: 2,
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const node = {
      id: 'text-1',
      type: 'textNode',
      position: { x: 0, y: 0 },
      data: {
        mode: 'generate',
        provider: 'gemini',
      },
    } as AppNode;
    const settings: RuntimeSettingsSnapshot = {
      apiKeys: { gemini: '', openai: '', huggingface: '', elevenlabs: '' },
      defaultModels: DEFAULT_MODELS,
      providerSettings: {
        ...DEFAULT_PROVIDER_SETTINGS,
        backendProxyEnabled: true,
        backendProxyBaseUrl: 'https://proxy.local',
      },
    };

    const result = await executeNodeRequest(
      node,
      {
        prompt: 'hello',
        config: {
          aspectRatio: '1:1',
          steps: 30,
          durationSeconds: 4,
          videoResolution: '720p',
          imageOutputFormat: 'png',
          audioOutputFormat: 'mp3_44100_128',
        },
      },
      settings,
    );

    expect(result.result).toBe('proxied result');
    expect(result.usage?.totalTokens).toBe(2);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
