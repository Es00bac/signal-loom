import { describe, expect, it } from 'vitest';
import {
  buildBflFlux2Request,
  buildLocalOpenImageEditRequest,
  buildStabilityEditRequest,
  buildStabilityGenerationRequest,
  buildStabilityUpscaleRequest,
} from './requestBuilders';

describe('image editor AI request builders', () => {
  it('builds BFL FLUX.2 prompt edit requests with multiple references and published cost estimates', () => {
    const request = buildBflFlux2Request({
      modelId: 'flux-2-pro',
      prompt: 'replace the mug with a blue ceramic mug',
      sourceImage: 'data:image/png;base64,SOURCE',
      referenceImages: ['data:image/png;base64,REF1', 'data:image/png;base64,REF2'],
      aspectRatio: '16:9',
      outputFormat: 'webp',
      seed: 1234,
      operation: 'image-edit',
    });

    expect(request.endpoint).toBe('https://api.bfl.ai/v1/flux-2-pro');
    expect(request.body).toMatchObject({
      prompt: 'replace the mug with a blue ceramic mug',
      input_image: 'data:image/png;base64,SOURCE',
      input_image_2: 'data:image/png;base64,REF1',
      input_image_3: 'data:image/png;base64,REF2',
      width: 1376,
      height: 768,
      output_format: 'webp',
      seed: 1234,
    });
    expect(request.estimatedCostUsd).toBe(0.045);
  });

  it('rejects BFL FLUX.2 reference counts beyond the selected model limit', () => {
    expect(() => buildBflFlux2Request({
      modelId: 'flux-2-pro',
      prompt: 'combine these references',
      referenceImages: Array.from({ length: 9 }, (_, index) => `data:image/png;base64,REF${index}`),
      operation: 'image-edit',
    })).toThrow('FLUX.2 Pro supports at most 8 reference images via API.');
  });

  it('builds Stability inpaint requests as multipart form fields', () => {
    const request = buildStabilityEditRequest({
      operation: 'mask-inpaint',
      prompt: 'replace the chair with a green velvet chair',
      searchPrompt: '',
      outputFormat: 'png',
    });

    expect(request.endpoint).toBe('https://api.stability.ai/v2beta/stable-image/edit/inpaint');
    expect(request.fields).toEqual({
      prompt: 'replace the chair with a green velvet chair',
      output_format: 'png',
    });
    expect(request.estimatedCostUsd).toBe(0.05);
  });

  it('builds Stability erase requests with the erase endpoint and shared fixed pricing', () => {
    const request = buildStabilityEditRequest({
      operation: 'erase',
      prompt: '',
      searchPrompt: '',
      outputFormat: 'jpeg',
    });

    expect(request.endpoint).toBe('https://api.stability.ai/v2beta/stable-image/edit/erase');
    expect(request.fields).toEqual({
      output_format: 'jpeg',
    });
    expect(request.estimatedCostUsd).toBe(0.05);
  });

  it('builds Stability text-to-image requests with aspect ratio and published costs', () => {
    const request = buildStabilityGenerationRequest({
      modelId: 'stable-image-core',
      prompt: 'storybook castle at sunrise',
      aspectRatio: '3:2',
      outputFormat: 'webp',
    });

    expect(request.endpoint).toBe('https://api.stability.ai/v2beta/stable-image/generate/core');
    expect(request.fields).toEqual({
      prompt: 'storybook castle at sunrise',
      aspect_ratio: '3:2',
      output_format: 'webp',
    });
    expect(request.estimatedCostUsd).toBe(0.03);
  });

  it('builds Stability Fast Upscale requests with exact low-cost pricing', () => {
    const request = buildStabilityUpscaleRequest({
      mode: 'fast',
      outputFormat: 'png',
    });

    expect(request.endpoint).toBe('https://api.stability.ai/v2beta/stable-image/upscale/fast');
    expect(request.fields).toEqual({
      output_format: 'png',
    });
    expect(request.estimatedCostUsd).toBe(0.02);
  });

  it('builds Stability Conservative Upscale requests with a faithful print prompt and published pricing', () => {
    const request = buildStabilityUpscaleRequest({
      mode: 'conservative',
      outputFormat: 'webp',
      prompt: 'preserve the cyberpunk comic panel line art and lettering',
      creativity: 0.22,
    });

    expect(request.endpoint).toBe('https://api.stability.ai/v2beta/stable-image/upscale/conservative');
    expect(request.fields).toEqual({
      output_format: 'webp',
      prompt: 'preserve the cyberpunk comic panel line art and lettering',
      creativity: 0.22,
    });
    expect(request.estimatedCostUsd).toBe(0.4);
  });

  it('builds Local/Open endpoint requests with source, mask, and reference images', () => {
    expect(buildLocalOpenImageEditRequest({
      model: 'Qwen/Qwen-Image-Edit',
      prompt: 'change the sign to OPEN LATE',
      image: 'SOURCE',
      mask: 'MASK',
      referenceImages: ['REF'],
      outputFormat: 'png',
    })).toEqual({
      model: 'Qwen/Qwen-Image-Edit',
      prompt: 'change the sign to OPEN LATE',
      image: 'SOURCE',
      mask: 'MASK',
      referenceImages: ['REF'],
      outputFormat: 'png',
    });
  });
});
