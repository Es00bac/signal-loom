import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_PROVIDER_SETTINGS } from './providerCatalog';
import type { NativeVertexImageRequest, NativeVertexImageResult } from './nativeApp';
import { runStabilityImageUpscale, runVertexImagenImageUpscale } from './cloudImageUpscale';

function imageResponse(body: string): Response {
  return new Response(new Blob([body], { type: 'image/png' }), {
    status: 200,
    headers: { 'content-type': 'image/png' },
  });
}

describe('runStabilityImageUpscale', () => {
  it('posts to the fast upscale endpoint and returns an object URL for the result blob', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:stability-fast');
    const fetchImpl = vi.fn(async (url: string | URL) => {
      const stringUrl = String(url);
      if (stringUrl.startsWith('data:')) {
        return imageResponse('SOURCE');
      }
      expect(stringUrl).toContain('/stable-image/upscale/fast');
      return imageResponse('UPSCALED');
    }) as unknown as typeof fetch;

    const result = await runStabilityImageUpscale({
      sourceImage: 'data:image/png;base64,c291cmNl',
      mode: 'fast',
      outputFormat: 'png',
      apiKey: 'sk-test',
      fetchImpl,
    });

    expect(result.result).toBe('blob:stability-fast');
    expect(result.mimeType).toBe('image/png');
    const upscaleCall = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
      ([callUrl]) => String(callUrl).includes('/stable-image/upscale/fast'),
    );
    expect(upscaleCall).toBeTruthy();
    const requestInit = upscaleCall?.[1] as RequestInit;
    expect((requestInit.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
    expect(requestInit.body).toBeInstanceOf(FormData);
    expect((requestInit.body as FormData).get('output_format')).toBe('png');
    createObjectURL.mockRestore();
  });

  it('sends the conservative endpoint with a repair prompt in conservative mode', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:stability-conservative');
    const fetchImpl = vi.fn(async (url: string | URL) => {
      const stringUrl = String(url);
      if (stringUrl.startsWith('data:')) {
        return imageResponse('SOURCE');
      }
      expect(stringUrl).toContain('/stable-image/upscale/conservative');
      return imageResponse('UPSCALED');
    }) as unknown as typeof fetch;

    const result = await runStabilityImageUpscale({
      sourceImage: 'data:image/png;base64,c291cmNl',
      mode: 'conservative',
      outputFormat: 'png',
      apiKey: 'sk-test',
      prompt: 'Repair faithfully for print.',
      fetchImpl,
    });

    expect(result.result).toBe('blob:stability-conservative');
    const upscaleCall = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
      ([callUrl]) => String(callUrl).includes('/stable-image/upscale/conservative'),
    );
    expect((upscaleCall?.[1] as RequestInit).body).toBeInstanceOf(FormData);
    expect(((upscaleCall?.[1] as RequestInit).body as FormData).get('prompt')).toBe('Repair faithfully for print.');
  });

  it('throws when the Stability API key is missing', async () => {
    await expect(runStabilityImageUpscale({
      sourceImage: 'data:image/png;base64,c291cmNl',
      mode: 'fast',
      outputFormat: 'png',
      apiKey: '   ',
    })).rejects.toThrow('Stability AI API key is missing. Add it in Settings.');
  });

  it('surfaces the provider error body when the upscale response is not ok', async () => {
    const fetchImpl = vi.fn(async (url: string | URL) => {
      if (String(url).startsWith('data:')) {
        return imageResponse('SOURCE');
      }
      return new Response(JSON.stringify({ errors: ['bad'], message: 'insufficient_balance' }), {
        status: 402,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    await expect(runStabilityImageUpscale({
      sourceImage: 'data:image/png;base64,c291cmNl',
      mode: 'fast',
      outputFormat: 'png',
      apiKey: 'sk-test',
      errorLabel: 'Stability upscale failed',
      fetchImpl,
    })).rejects.toThrow('insufficient_balance');
  });
});

describe('runVertexImagenImageUpscale', () => {
  it('calls the imagen upscale model with an x2 factor and returns the generated image', async () => {
    const generateVertexImage = vi.fn(async (request: NativeVertexImageRequest): Promise<NativeVertexImageResult> => {
      expect(request.modelId).toBe('imagen-4.0-upscale-preview');
      expect(request.route).toBe('imagen-predict');
      const parameters = (request.body as { parameters?: Record<string, unknown> }).parameters ?? {};
      expect((parameters as { upscaleConfig?: { upscaleFactor?: string } }).upscaleConfig?.upscaleFactor).toBe('x2');
      return { result: 'data:image/png;base64,dXBzY2FsZWQ=', mimeType: 'image/png', resultType: 'image' };
    });

    const result = await runVertexImagenImageUpscale({
      sourceImage: 'data:image/png;base64,c291cmNl',
      providerSettings: { ...DEFAULT_PROVIDER_SETTINGS, vertexProjectId: 'proj-1', vertexLocation: 'us-central1' },
      outputFormat: 'png',
      generateVertexImage,
    });

    expect(generateVertexImage).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ result: 'data:image/png;base64,dXBzY2FsZWQ=', mimeType: 'image/png' });
  });

  it('throws a configuration error when neither a Vertex project nor a generator is available', async () => {
    await expect(runVertexImagenImageUpscale({
      sourceImage: 'data:image/png;base64,c291cmNl',
      providerSettings: { ...DEFAULT_PROVIDER_SETTINGS, vertexProjectId: '', vertexLocation: '' },
      outputFormat: 'png',
      generateVertexImage: undefined,
    })).rejects.toThrow(/Vertex Imagen upscaling requires a configured project/);
  });

  it('propagates the Vertex error payload', async () => {
    const generateVertexImage = vi.fn(async (): Promise<NativeVertexImageResult> => ({ error: 'quota exceeded' }));

    await expect(runVertexImagenImageUpscale({
      sourceImage: 'data:image/png;base64,c291cmNl',
      providerSettings: { ...DEFAULT_PROVIDER_SETTINGS, vertexProjectId: 'proj-1', vertexLocation: 'us-central1' },
      outputFormat: 'png',
      generateVertexImage,
    })).rejects.toThrow('quota exceeded');
  });
});
