import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeNodeRequest } from './flowExecution';
import { DEFAULT_EXECUTION_CONFIG } from './providerCatalog';
import type { AppNode, RuntimeSettingsSnapshot } from '../types/flow';

const baseSettings: RuntimeSettingsSnapshot = {
  apiKeys: {
    gemini: '',
    openai: '',
    atlas: '',
    huggingface: '',
    elevenlabs: '',
    bfl: 'bfl-key',
    stability: 'stability-key',
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
      atlas: 'gpt-image-2',
      huggingface: 'black-forest-labs/FLUX.1-dev',
      bfl: 'flux-2-pro',
      stability: 'stable-image-core',
      localOpen: 'Qwen/Qwen-Image-Edit',
      android: 'local-dream-active',
    },
    video: {
      gemini: 'veo-3.1-generate-preview',
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
    geminiCredentialMode: 'api-key',
    vertexAuthMode: 'gcloud-user',
    vertexProjectId: '',
    vertexLocation: 'global',
    vertexQuotaProjectId: '',
    vertexEnvironmentVariables: '',
    vertexServiceAccountJson: '',
    paperPrintUpscaleMethod: 'auto',
    paperPdfRasterPreset: 'balanced-jpeg',
    localOpenImageEndpointUrl: 'http://127.0.0.1:8188/signal-loom-image-edit',
    localOpenImageAuthHeader: 'Bearer local-token',
    localOpenImageDefaultModel: 'Qwen/Qwen-Image-Edit',
    batchMaxRetries: 10,
    batchRetryBaseDelayMs: 30000,
  },
};

function createImageNode(
  provider: AppNode['data']['provider'],
  modelId: string,
  data: AppNode['data'] = {},
): AppNode {
  return {
    id: 'image-1',
    type: 'imageGen',
    position: { x: 0, y: 0 },
    data: {
      provider,
      modelId,
      ...data,
    },
  } as AppNode;
}

function imageResponse(body = 'PNG'): Response {
  return new Response(new Blob([body], { type: 'image/png' }), {
    status: 200,
    headers: { 'content-type': 'image/png' },
  });
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('executeNodeRequest advanced image providers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('submits and polls BFL FLUX.2 image edits with source and reference images', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        id: 'bfl-job',
        polling_url: 'https://api.bfl.ai/v1/get_result?id=bfl-job',
        cost: 4.5,
      }))
      .mockResolvedValueOnce(jsonResponse({
        status: 'Ready',
        result: { sample: 'data:image/png;base64,QkZM' },
      }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeNodeRequest(
      createImageNode('bfl', 'flux-2-pro', {
        imageExactColor: '#0057ff',
        imageTextEditPrompt: 'replace the sign text with OPEN LATE',
        imageSeed: 77,
      }),
      {
        prompt: 'Update the storefront.',
        editImageInput: 'data:image/png;base64,U09VUkNF',
        editReferenceImageInputs: ['data:image/png;base64,UkVG'],
        config: { ...DEFAULT_EXECUTION_CONFIG, aspectRatio: '16:9', imageOutputFormat: 'webp' },
      },
      baseSettings,
    );

    expect(result.result).toBe('data:image/png;base64,QkZM');
    expect(result.usage).toMatchObject({
      provider: 'bfl',
      modelId: 'flux-2-pro',
      costUsd: 0.045,
      imageCount: 1,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(1, 'https://api.bfl.ai/v1/flux-2-pro', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ 'x-key': 'bfl-key' }),
    }));
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body).toMatchObject({
      input_image: 'data:image/png;base64,U09VUkNF',
      input_image_2: 'data:image/png;base64,UkVG',
      width: 1376,
      height: 768,
      output_format: 'webp',
      seed: 77,
    });
    expect(body.prompt).toContain('Update the storefront.');
    expect(body.prompt).toContain('#0057ff');
    expect(body.prompt).toContain('OPEN LATE');
  });

  it('runs Stability text-to-image through the Core generation endpoint', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:stability-core');
    const fetchMock = vi.fn().mockResolvedValue(imageResponse('CORE'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeNodeRequest(
      createImageNode('stability', 'stable-image-core'),
      {
        prompt: 'storybook castle at sunrise',
        config: { ...DEFAULT_EXECUTION_CONFIG, aspectRatio: '3:2', imageOutputFormat: 'webp' },
      },
      baseSettings,
    );

    expect(result.result).toBe('blob:stability-core');
    expect(createObjectURL).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.stability.ai/v2beta/stable-image/generate/core',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer stability-key',
          Accept: 'image/*',
        }),
      }),
    );

    const body = fetchMock.mock.calls[0][1]?.body as FormData;
    expect(body.get('prompt')).toBe('storybook castle at sunrise');
    expect(body.get('aspect_ratio')).toBe('3:2');
    expect(body.get('output_format')).toBe('webp');
    expect(result.usage).toMatchObject({ provider: 'stability', costUsd: 0.03 });
  });

  it('auto-upscales generated Flow images with the configured paid upscaler and combined cost telemetry', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL')
      .mockReturnValueOnce('blob:stability-core')
      .mockReturnValueOnce('blob:stability-upscaled');
    const fetchMock = vi.fn(async (url: RequestInfo | URL, _init?: RequestInit) => {
      void _init;
      if (String(url) === 'blob:stability-core') {
        return imageResponse('CORE');
      }
      return imageResponse(String(url).includes('/stable-image/upscale/fast') ? 'UPSCALED' : 'CORE');
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeNodeRequest(
      createImageNode('stability', 'stable-image-core', {
        imageAutoUpscale: true,
      }),
      {
        prompt: 'storybook castle at sunrise',
        config: { ...DEFAULT_EXECUTION_CONFIG, aspectRatio: '3:2', imageOutputFormat: 'png' },
      },
      {
        ...baseSettings,
        providerSettings: {
          ...baseSettings.providerSettings,
          paperPrintUpscaleMethod: 'stability-fast',
        },
      },
    );

    expect(result.result).toBe('blob:stability-upscaled');
    expect(createObjectURL).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/stable-image/upscale/fast'))).toBe(true);
    expect(result.statusMessage).toContain('auto-upscaled');
    expect(result.usage).toMatchObject({
      provider: 'stability',
      modelId: 'stable-image-core',
      costUsd: 0.05,
      imageCount: 1,
    });
  });

  it('auto-upscales generated Flow images with local CPU upscaler when configured', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL')
      .mockReturnValueOnce('blob:stability-core')
      .mockReturnValueOnce('blob:stability-upscaled');
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      const stringUrl = String(url);
      if (stringUrl.startsWith('blob:')) {
        return imageResponse('CORE');
      }
      if (stringUrl.includes('/v1/upscale')) {
        return imageResponse('UPSCALED');
      }
      if (stringUrl.includes('/stable-image/generate/core')) {
        return imageResponse('CORE');
      }
      return imageResponse('CORE');
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeNodeRequest(
      createImageNode('stability', 'stable-image-core', {
        imageAutoUpscale: true,
      }),
      {
        prompt: 'storybook castle at sunrise',
        config: { ...DEFAULT_EXECUTION_CONFIG, aspectRatio: '3:2', imageOutputFormat: 'png' },
      },
      {
        ...baseSettings,
        providerSettings: {
          ...baseSettings.providerSettings,
          paperPrintUpscaleMethod: 'auto',
          localAiCpuEndpointUrl: 'http://127.0.0.1:8788',
          localAiCpuModel: 'realesrgan-4x',
        },
      },
    );

    expect(result.result).toBe('data:image/png;base64,VVBTQ0FMRUQ=');
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const upscaleCall = fetchMock.mock.calls.find(([requestUrl]) => String(requestUrl).includes('/v1/upscale'));
    expect(upscaleCall).toBeTruthy();
    expect(result.statusMessage).toContain('auto-upscaled');
    expect(result.usage).toMatchObject({
      provider: 'stability',
      modelId: 'stable-image-core',
      costUsd: 0.03,
      imageCount: 1,
    });
  });

  it('runs Stability search-and-replace edits with source image and search prompt', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:stability-edit');
    const fetchMock = vi.fn(async (url: RequestInfo | URL, _init?: RequestInit) => {
      void _init;
      if (String(url).startsWith('data:')) {
        return imageResponse('SOURCE');
      }

      return imageResponse('EDIT');
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeNodeRequest(
      createImageNode('stability', 'stable-image-edit-search-replace', {
        imageSearchPrompt: 'red mug',
      }),
      {
        prompt: 'replace it with a blue ceramic mug',
        editImageInput: 'data:image/png;base64,U09VUkNF',
        config: DEFAULT_EXECUTION_CONFIG,
      },
      baseSettings,
    );

    expect(result.result).toBe('blob:stability-edit');
    expect(createObjectURL).toHaveBeenCalled();
    const apiCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes('/stable-image/edit/search-and-replace'),
    );
    expect(apiCall).toBeTruthy();
    const body = apiCall?.[1]?.body as FormData;
    expect(body.get('prompt')).toBe('replace it with a blue ceramic mug');
    expect(body.get('search_prompt')).toBe('red mug');
    expect(body.get('image')).toBeInstanceOf(File);
    expect(result.usage).toMatchObject({ provider: 'stability', costUsd: 0.05 });
  });

  it('runs Stability erase edits with source image, erase mask, and the dedicated endpoint', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:stability-erase');
    const fetchMock = vi.fn(async (url: RequestInfo | URL, _init?: RequestInit) => {
      void _init;
      if (String(url).startsWith('data:')) {
        return imageResponse('SOURCE');
      }

      return imageResponse('EDIT');
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeNodeRequest(
      createImageNode('stability', 'stable-image-edit-erase', {
        imageOperation: 'erase',
      }),
      {
        prompt: 'remove the person from the lower-left corner',
        editImageInput: 'data:image/png;base64,U09VUkNF',
        editMaskImageInput: 'data:image/png;base64,TU9HUw==',
        config: DEFAULT_EXECUTION_CONFIG,
      },
      baseSettings,
    );

    expect(result.result).toBe('blob:stability-erase');
    expect(createObjectURL).toHaveBeenCalled();
    const apiCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes('/stable-image/edit/erase'),
    );
    expect(apiCall).toBeTruthy();
    const body = apiCall?.[1]?.body as FormData;
    expect(body.get('prompt')).toBe('remove the person from the lower-left corner');
    expect(body.get('output_format')).toBe('png');
    expect(body.get('image')).toBeInstanceOf(File);
    expect(body.get('mask')).toBeInstanceOf(File);
    expect(result.usage).toMatchObject({ provider: 'stability', costUsd: 0.05 });
  });

  it('runs Stability Fast Upscale through the upscale endpoint with exact pricing', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:stability-upscale');
    const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      void init;
      if (String(url).startsWith('data:')) {
        return imageResponse('SOURCE');
      }

      return imageResponse('UPSCALED');
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeNodeRequest(
      createImageNode('stability', 'stable-image-upscale-fast', {
        imageOperation: 'upscale',
      }),
      {
        prompt: 'Upscale faithfully for print.',
        editImageInput: 'data:image/png;base64,U09VUkNF',
        config: { ...DEFAULT_EXECUTION_CONFIG, imageOutputFormat: 'png' },
      },
      baseSettings,
    );

    expect(result.result).toBe('blob:stability-upscale');
    expect(createObjectURL).toHaveBeenCalled();
    const apiCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes('/stable-image/upscale/fast'),
    );
    expect(apiCall).toBeTruthy();
    const body = apiCall?.[1]?.body as FormData;
    expect(body.get('output_format')).toBe('png');
    expect(body.get('image')).toBeInstanceOf(File);
    expect(result.usage).toMatchObject({
      provider: 'stability',
      modelId: 'stable-image-upscale-fast',
      costUsd: 0.02,
      confidence: 'fixed',
    });
  });

  it('runs Stability Conservative Upscale with prompt and creativity controls', async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      void init;
      if (String(url).startsWith('data:')) {
        return imageResponse('SOURCE');
      }

      return imageResponse('UPSCALED');
    });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:stability-conservative-upscale');
    vi.stubGlobal('fetch', fetchMock);

    await executeNodeRequest(
      createImageNode('stability', 'stable-image-upscale-conservative', {
        imageOperation: 'upscale',
        imageCreativity: 0.2,
      }),
      {
        prompt: 'Preserve line art and readable lettering.',
        editImageInput: 'data:image/png;base64,U09VUkNF',
        config: { ...DEFAULT_EXECUTION_CONFIG, imageOutputFormat: 'webp' },
      },
      baseSettings,
    );

    const apiCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes('/stable-image/upscale/conservative'),
    );
    expect(apiCall).toBeTruthy();
    const body = apiCall?.[1]?.body as FormData;
    expect(body.get('output_format')).toBe('webp');
    expect(body.get('prompt')).toBe('Preserve line art and readable lettering.');
    expect(body.get('creativity')).toBe('0.2');
  });

  it('routes Atlas Cloud native text-to-image models through generateImage and prediction polling', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:atlas-generated');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: { id: 'atlas-job' } }))
      .mockResolvedValueOnce(jsonResponse({
        data: {
          status: 'succeeded',
          outputs: ['https://cdn.atlascloud.ai/generated.png'],
        },
      }))
      .mockResolvedValueOnce(imageResponse('ATLAS'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeNodeRequest(
      createImageNode('atlas', 'black-forest-labs/flux-schnell', {
        imageSeed: 77,
        imageGuidanceScale: 2.5,
        imageSafetyCheckerEnabled: false,
      }),
      {
        prompt: 'cinematic desert observatory at sunrise',
        config: { ...DEFAULT_EXECUTION_CONFIG, aspectRatio: '16:9', steps: 20, imageOutputFormat: 'webp' },
      },
      {
        ...baseSettings,
        apiKeys: { ...baseSettings.apiKeys, atlas: 'atlas-key' },
        providerSettings: {
          ...baseSettings.providerSettings,
          atlasBaseUrl: 'https://api.atlascloud.ai/api/v1',
        },
      },
    );

    expect(result.result).toBe('blob:atlas-generated');
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(result.usage).toMatchObject({
      provider: 'atlas',
      modelId: 'black-forest-labs/flux-schnell',
      costUsd: 0.003,
      imageCount: 1,
    });
    expect(fetchMock).toHaveBeenNthCalledWith(1, 'https://api.atlascloud.ai/api/v1/model/generateImage', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        Authorization: 'Bearer atlas-key',
        'Content-Type': 'application/json',
      }),
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://api.atlascloud.ai/api/v1/model/prediction/atlas-job', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer atlas-key' }),
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(3, 'https://cdn.atlascloud.ai/generated.png');
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body).toMatchObject({
      model: 'black-forest-labs/flux-schnell',
      prompt: 'cinematic desert observatory at sunrise',
      width: 1376,
      height: 768,
      steps: 20,
      seed: 77,
      guidance_scale: 2.5,
      output_format: 'webp',
      enable_safety_checker: false,
    });
  });

  it('downloads Atlas Cloud native remote outputs before returning the Flow image result', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:atlas-downloaded-result');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: { id: 'atlas-job' } }))
      .mockResolvedValueOnce(jsonResponse({
        data: {
          status: 'succeeded',
          outputs: ['https://cdn.atlascloud.ai/generated.png'],
        },
      }))
      .mockResolvedValueOnce(imageResponse('ATLAS'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeNodeRequest(
      createImageNode('atlas', 'black-forest-labs/flux-schnell'),
      {
        prompt: 'cyberpunk mage raising a luminous compiler sigil',
        config: { ...DEFAULT_EXECUTION_CONFIG, imageOutputFormat: 'png' },
      },
      {
        ...baseSettings,
        apiKeys: { ...baseSettings.apiKeys, atlas: 'atlas-key' },
        providerSettings: {
          ...baseSettings.providerSettings,
          atlasBaseUrl: 'https://api.atlascloud.ai/api/v1',
        },
      },
    );

    expect(result.result).toBe('blob:atlas-downloaded-result');
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(fetchMock).toHaveBeenNthCalledWith(3, 'https://cdn.atlascloud.ai/generated.png');
  });

  it('uploads source and mask images before running Atlas Cloud native edit models', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:atlas-edit');
    let uploadCount = 0;
    const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      void init;
      const stringUrl = String(url);
      if (stringUrl.includes('/model/uploadMedia')) {
        uploadCount += 1;
        return jsonResponse({
          data: {
            download_url: uploadCount === 1
              ? 'https://static.atlascloud.ai/source.png'
              : 'https://static.atlascloud.ai/mask.png',
          },
        });
      }
      if (stringUrl.includes('/model/generateImage')) {
        return jsonResponse({ data: { id: 'atlas-edit-job' } });
      }
      if (stringUrl.includes('/model/prediction/atlas-edit-job')) {
        return jsonResponse({
          data: {
            status: 'completed',
            output: 'https://cdn.atlascloud.ai/edit.png',
          },
        });
      }
      if (stringUrl === 'https://cdn.atlascloud.ai/edit.png') {
        return imageResponse('EDIT');
      }
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeNodeRequest(
      createImageNode('atlas', 'atlascloud/qwen-image/edit', {
        imageTextEditPrompt: 'replace the sign text with OPEN LATE',
        imageEditStrength: 0.65,
      }),
      {
        prompt: 'Modify the storefront without changing the person.',
        editImageInput: 'data:image/png;base64,U09VUkNF',
        editMaskImageInput: 'data:image/png;base64,TUFTSw==',
        config: { ...DEFAULT_EXECUTION_CONFIG, imageOutputFormat: 'png' },
      },
      {
        ...baseSettings,
        apiKeys: { ...baseSettings.apiKeys, atlas: 'atlas-key' },
        providerSettings: {
          ...baseSettings.providerSettings,
          atlasBaseUrl: 'https://api.atlascloud.ai/api/v1',
        },
      },
    );

    expect(result.result).toBe('blob:atlas-edit');
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(result.usage).toMatchObject({
      provider: 'atlas',
      modelId: 'atlascloud/qwen-image/edit',
      costUsd: 0.025,
      imageCount: 1,
    });
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/model/uploadMedia'))).toHaveLength(2);
    const generateCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/model/generateImage'));
    expect(generateCall).toBeTruthy();
    const body = JSON.parse(String(generateCall?.[1]?.body));
    expect(body).toMatchObject({
      model: 'atlascloud/qwen-image/edit',
      image: 'https://static.atlascloud.ai/source.png',
      mask_image: 'https://static.atlascloud.ai/mask.png',
      strength: 0.65,
      output_format: 'png',
    });
    expect(body.prompt).toContain('Modify the storefront without changing the person.');
    expect(body.prompt).toContain('OPEN LATE');
  });

  it('posts Local/Open image edits to the configured endpoint with auth and mask data', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:local-open');
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      image: 'TE9DQUw=',
      mimeType: 'image/png',
      modelUsed: 'Qwen/Qwen-Image-Edit',
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeNodeRequest(
      createImageNode('localOpen', 'Qwen/Qwen-Image-Edit'),
      {
        prompt: 'change the poster title to MIDNIGHT SHOW',
        editImageInput: 'data:image/png;base64,U09VUkNF',
        editMaskImageInput: 'data:image/png;base64,TUFTSw==',
        editReferenceImageInputs: ['data:image/png;base64,UkVG'],
        config: DEFAULT_EXECUTION_CONFIG,
      },
      baseSettings,
    );

    expect(result.result).toBe('blob:local-open');
    expect(createObjectURL).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8188/signal-loom-image-edit', expect.objectContaining({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer local-token',
      },
    }));

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body).toMatchObject({
      model: 'Qwen/Qwen-Image-Edit',
      prompt: 'change the poster title to MIDNIGHT SHOW',
      image: 'U09VUkNF',
      mask: 'TUFTSw==',
      referenceImages: ['UkVG'],
      outputFormat: 'png',
    });
    expect(result.usage).toMatchObject({
      provider: 'localOpen',
      confidence: 'unknown',
    });
  });
});
