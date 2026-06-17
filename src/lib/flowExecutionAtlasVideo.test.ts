import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeNodeRequest } from './flowExecution';
import { buildEmptyModelCatalog, DEFAULT_EXECUTION_CONFIG, DEFAULT_MODELS, DEFAULT_PROVIDER_SETTINGS, getModelOptions } from './providerCatalog';
import type { AppNode, RuntimeSettingsSnapshot } from '../types/flow';

const settings: RuntimeSettingsSnapshot = {
  apiKeys: { gemini: '', openai: '', huggingface: '', elevenlabs: '', atlas: 'atlas-key' },
  defaultModels: DEFAULT_MODELS,
  providerSettings: DEFAULT_PROVIDER_SETTINGS,
};

function videoNode(modelId: string, data: AppNode['data'] = {}): AppNode {
  return {
    id: 'video-1',
    type: 'videoGen',
    position: { x: 0, y: 0 },
    data: { provider: 'atlas', modelId, ...data },
  } as AppNode;
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Atlas Cloud video generation', () => {
  it('lists the live Atlas video model slugs in the catalog', () => {
    const values = getModelOptions('video', 'atlas', buildEmptyModelCatalog()).map((option) => option.value);
    expect(values).toContain('google/veo3.1/text-to-video');
    expect(values).toContain('alibaba/wan-2.7/image-to-video');
    expect(values).toContain('bytedance/seedance-2.0/text-to-video');
  });

  it('submits a generateVideo request, polls the prediction, and returns the video URL', async () => {
    // URL-branching mock (order-independent): dataUrlToFile/result-download also call fetch.
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/model/generateVideo')) return jsonResponse({ data: { id: 'pred-vid-1' } });
      // poll — nested { outputs: { outputs: [url] } } shape (exercises the extractor)
      if (url.includes('/model/prediction/')) return jsonResponse({ data: { outputs: { outputs: ['https://static.atlascloud.ai/media/videos/out.mp4'] } } });
      throw new TypeError('Failed to fetch'); // result download is CORS-blocked -> URL fallback
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeNodeRequest(
      videoNode('google/veo3.1/text-to-video'),
      {
        prompt: 'a fox in a raincoat, cinematic',
        config: { ...DEFAULT_EXECUTION_CONFIG, durationSeconds: 8, videoResolution: '720p', aspectRatio: '16:9' },
      },
      settings,
    );

    expect(result.resultType).toBe('video');
    expect(result.result).toBe('https://static.atlascloud.ai/media/videos/out.mp4');

    const createCall = fetchMock.mock.calls.find((call) => String(call[0]).includes('/model/generateVideo'))!;
    const body = JSON.parse((createCall[1] as RequestInit).body as string);
    expect(body).toMatchObject({
      model: 'google/veo3.1/text-to-video',
      prompt: 'a fox in a raincoat, cinematic',
      duration: 8,
      resolution: '720p',
      aspect_ratio: '16:9',
    });
  });

  it('uploads a start frame for image-to-video models', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith('data:')) return new Response(new Blob(['START'], { type: 'image/png' }));
      if (url.includes('/model/uploadMedia')) return jsonResponse({ data: { download_url: 'https://atlas.upload/start.png' } });
      if (url.includes('/model/generateVideo')) return jsonResponse({ data: { outputs: ['https://static.atlascloud.ai/media/videos/i2v.mp4'] } });
      throw new TypeError('Failed to fetch');
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeNodeRequest(
      videoNode('google/veo3.1/image-to-video'),
      {
        prompt: 'pan across the scene',
        startImageInput: 'data:image/png;base64,U1RBUlQ=',
        config: { ...DEFAULT_EXECUTION_CONFIG, durationSeconds: 5, videoResolution: '720p', aspectRatio: '16:9' },
      },
      settings,
    );

    expect(result.resultType).toBe('video');
    expect(result.result).toBe('https://static.atlascloud.ai/media/videos/i2v.mp4');
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/model/uploadMedia'))).toBe(true);
    const createCall = fetchMock.mock.calls.find((call) => String(call[0]).includes('/model/generateVideo'))!;
    const createBody = JSON.parse((createCall[1] as RequestInit).body as string);
    expect(createBody.image).toBe('https://atlas.upload/start.png');
  });
});
