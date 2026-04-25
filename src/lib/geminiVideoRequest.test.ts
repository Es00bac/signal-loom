import { describe, expect, it } from 'vitest';
import { buildGeminiVideoRequest } from './geminiVideoRequest';

describe('buildGeminiVideoRequest', () => {
  it('builds the minimal documented REST shape for plain text-to-video', () => {
    const request = buildGeminiVideoRequest(
      {
        prompt: 'looping bear prompt',
      },
      {
        aspectRatio: '16:9',
        durationSeconds: 4,
        videoResolution: '720p',
      },
    );

    expect(request.instances[0].prompt).toBe('looping bear prompt');
    expect(request.parameters?.durationSeconds).toBe(4);
    expect(request.parameters?.resolution).toBe('720p');
  });

  it('serializes negative prompts and batch counts when supplied', () => {
    const request = buildGeminiVideoRequest(
      {
        prompt: 'cinematic city flythrough',
      },
      {
        aspectRatio: '16:9',
        durationSeconds: 6,
        videoResolution: '720p',
        negativePrompt: 'blur, low detail',
        sampleCount: 3,
      },
    );

    expect(request.parameters?.negativePrompt).toBe('blur, low detail');
    expect(request.parameters?.sampleCount).toBe(3);
  });

  it('maps interpolation inputs onto REST image and lastFrame fields', () => {
    const request = buildGeminiVideoRequest(
      {
        prompt: 'looping bear prompt',
        startImage: {
          mimeType: 'image/png',
          imageBytes: 'AAA',
        },
        endImage: {
          mimeType: 'image/png',
          imageBytes: 'BBB',
        },
      },
      {
        aspectRatio: '16:9',
        durationSeconds: 8,
        videoResolution: '1080p',
      },
    );

    expect(request.instances[0].image).toEqual({
      mimeType: 'image/png',
      bytesBase64Encoded: 'AAA',
    });
    expect(request.instances[0].lastFrame).toEqual({
      mimeType: 'image/png',
      bytesBase64Encoded: 'BBB',
    });
  });

  it('maps reference-image guidance to the REST referenceImages shape', () => {
    const request = buildGeminiVideoRequest(
      {
        prompt: 'stylized cyberpunk portrait walk',
        referenceImages: [
          {
            image: {
              mimeType: 'image/png',
              imageBytes: 'AAA',
            },
            referenceType: 'asset',
          },
          {
            image: {
              mimeType: 'image/png',
              imageBytes: 'BBB',
            },
            referenceType: 'style',
          },
        ],
      },
      {
        aspectRatio: '9:16',
        durationSeconds: 8,
        videoResolution: '720p',
        seed: 42,
      },
    );

    expect(request.instances[0].referenceImages).toEqual([
      {
        image: {
          mimeType: 'image/png',
          bytesBase64Encoded: 'AAA',
        },
        referenceType: 'asset',
      },
      {
        image: {
          mimeType: 'image/png',
          bytesBase64Encoded: 'BBB',
        },
        referenceType: 'style',
      },
    ]);
    expect(request.parameters?.seed).toBe(42);
  });

  it('maps video extension to the documented REST video field', () => {
    const request = buildGeminiVideoRequest(
      {
        prompt: 'extend the scene with a slow camera pullback',
        extensionVideo: {
          mimeType: 'video/mp4',
          videoBytes: 'CCC',
        },
      },
      {
        aspectRatio: '16:9',
        durationSeconds: 8,
        videoResolution: '720p',
      },
    );

    expect(request.instances[0].video).toEqual({
      encodedVideo: 'CCC',
      encoding: 'video/mp4',
    });
  });
});
