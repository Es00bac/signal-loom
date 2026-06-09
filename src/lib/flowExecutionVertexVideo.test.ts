import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeNodeRequest } from './flowExecution';
import { DEFAULT_EXECUTION_CONFIG } from './providerCatalog';
import type { AppNode, RuntimeSettingsSnapshot } from '../types/flow';

const baseSettings: RuntimeSettingsSnapshot = {
  apiKeys: {
    gemini: 'DO_NOT_USE_GEMINI_API_KEY',
    openai: '',
    atlas: '',
    huggingface: '',
    elevenlabs: '',
    bfl: '',
    stability: '',
  },
  defaultModels: {
    text: {
      gemini: 'gemini-3.5-flash',
      openai: 'gpt-4.1-mini',
      huggingface: 'Qwen/Qwen3-4B-Instruct-2507',
    },
    image: {
      gemini: 'gemini-3-pro-image-preview',
      openai: 'gpt-image-2',
      atlas: 'gpt-image-2',
      huggingface: 'black-forest-labs/FLUX.1-dev',
      bfl: 'flux-2-pro',
      stability: 'stable-image-edit-inpaint',
      localOpen: 'Qwen/Qwen-Image-Edit',
      android: 'local-dream-active',
    },
    video: {
      gemini: 'veo-3.1-generate-001',
      huggingface: 'Wan-AI/Wan2.2-T2V-A14B',
    },
    audio: {
      gemini: 'gemini-3.1-flash-tts-preview',
      elevenlabs: 'eleven_multilingual_v2',
      huggingface: 'hexgrad/Kokoro-82M',
    },
  },
  providerSettings: {
    openaiBaseUrl: '',
    elevenlabsVoiceId: '',
    renderBackendPreference: 'auto',
    localNativeRenderUrl: 'http://127.0.0.1:41736',
    backendProxyEnabled: false,
    backendProxyBaseUrl: '',
    geminiCredentialMode: 'vertex-adc',
    vertexAuthMode: 'gcloud-adc',
    vertexProjectId: 'project-38890c01-de5b-44c9-be4',
    vertexLocation: 'us-central1',
    vertexQuotaProjectId: '',
    vertexEnvironmentVariables: '',
    paperPrintUpscaleMethod: 'auto',
    paperPdfRasterPreset: 'balanced-jpeg',
    localOpenImageEndpointUrl: '',
    localOpenImageAuthHeader: '',
    localOpenImageDefaultModel: 'Qwen/Qwen-Image-Edit',
    batchMaxRetries: 0,
    batchRetryBaseDelayMs: 1,
  },
};

function createVideoNode(modelId: string): AppNode {
  return {
    id: 'video-1',
    type: 'videoGen',
    position: { x: 0, y: 0 },
    data: {
      provider: 'gemini',
      modelId,
    },
  };
}

describe('executeNodeRequest Vertex video routing', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the Electron native Vertex bridge for Veo in Vertex ADC mode', async () => {
    const generateVertexVideo = vi.fn().mockResolvedValue({
      result: 'data:video/mp4;base64,VERTEX',
      resultType: 'video',
      statusMessage: 'Generated with veo-3.1-generate-001',
      mimeType: 'video/mp4',
    });
    vi.stubGlobal('window', { signalLoomNative: { generateVertexVideo } });

    const result = await executeNodeRequest(
      createVideoNode('veo-3.1-generate-001'),
      {
        prompt: 'A cinematic establishing shot.',
        config: { ...DEFAULT_EXECUTION_CONFIG, aspectRatio: '16:9', durationSeconds: 6, videoResolution: '720p' },
      },
      baseSettings,
    );

    expect(result.result).toBe('data:video/mp4;base64,VERTEX');
    expect(generateVertexVideo).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-38890c01-de5b-44c9-be4',
      location: 'us-central1',
      modelId: 'veo-3.1-generate-001',
      route: 'veo-predict-long-running',
    }));
    expect(generateVertexVideo.mock.calls[0][0].body).toMatchObject({
      instances: [{ prompt: 'A cinematic establishing shot.' }],
      parameters: {
        aspectRatio: '16:9',
        durationSeconds: 6,
        resolution: '720p',
      },
    });
  });

  it('normalizes persisted preview/global Veo settings to the Vertex-accessible stable us-central1 route', async () => {
    const generateVertexVideo = vi.fn().mockResolvedValue({
      result: 'data:video/mp4;base64,VERTEX',
      resultType: 'video',
      statusMessage: 'Generated with veo-3.1-generate-001',
      mimeType: 'video/mp4',
    });
    vi.stubGlobal('window', { signalLoomNative: { generateVertexVideo } });

    await executeNodeRequest(
      createVideoNode('veo-3.1-generate-preview'),
      {
        prompt: 'A cinematic establishing shot.',
        config: { ...DEFAULT_EXECUTION_CONFIG, aspectRatio: '16:9', durationSeconds: 6, videoResolution: '720p' },
      },
      {
        ...baseSettings,
        providerSettings: {
          ...baseSettings.providerSettings,
          vertexLocation: 'global',
        },
      },
    );

    expect(generateVertexVideo).toHaveBeenCalledWith(expect.objectContaining({
      location: 'us-central1',
      modelId: 'veo-3.1-generate-001',
      route: 'veo-predict-long-running',
    }));
  });

  it('fails closed in Vertex mode when the Vertex video bridge is unavailable', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('window', { signalLoomNative: {} });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      executeNodeRequest(
        createVideoNode('veo-3.1-generate-001'),
        {
          prompt: 'A cinematic establishing shot.',
          config: { ...DEFAULT_EXECUTION_CONFIG, aspectRatio: '16:9', durationSeconds: 6, videoResolution: '720p' },
        },
        baseSettings,
      ),
    ).rejects.toThrow('Vertex AI video requires');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('routes Gemini Omni video through Vertex generateContent without using the Gemini API key path', async () => {
    const generateVertexVideo = vi.fn().mockResolvedValue({
      result: 'data:video/mp4;base64,OMNI',
      resultType: 'video',
      statusMessage: 'Generated with gemini-omni-flash-preview',
      mimeType: 'video/mp4',
    });
    vi.stubGlobal('window', { signalLoomNative: { generateVertexVideo } });

    await executeNodeRequest(
      createVideoNode('gemini-omni-flash'),
      {
        prompt: 'Make the character turn and wave.',
        startImageInput: 'data:image/png;base64,U1RBUlQ=',
        config: { ...DEFAULT_EXECUTION_CONFIG, aspectRatio: '16:9', durationSeconds: 8, videoResolution: '720p' },
      },
      baseSettings,
    );

    expect(generateVertexVideo).toHaveBeenCalledWith(expect.objectContaining({
      modelId: 'gemini-omni-flash-preview',
      route: 'gemini-generate-content',
      apiVersion: 'v1beta1',
    }));
    expect(generateVertexVideo.mock.calls[0][0].body).toMatchObject({
      generationConfig: {
        responseModalities: ['VIDEO'],
      },
    });
    expect(generateVertexVideo.mock.calls[0][0].body.contents[0].parts).toContainEqual({
      text: 'Make the character turn and wave.',
    });
  });
});
