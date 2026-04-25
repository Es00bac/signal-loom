import { describe, expect, it } from 'vitest';
import {
  filterGeminiVideoModelsForConditioning,
  isExplicitVideoFrameHandle,
  isVideoExtensionHandle,
  isVideoImageConditioningHandle,
  isVideoReferenceHandle,
  normalizeGeminiVideoModelId,
  supportsGeminiFrameConditioning,
  supportsGeminiReferenceImages,
  supportsGeminiVideoExtension,
} from './videoModelSupport';

describe('normalizeGeminiVideoModelId', () => {
  it('maps legacy or alias Veo ids onto the current canonical ids', () => {
    expect(normalizeGeminiVideoModelId('veo-3.1')).toBe('veo-3.1-generate-preview');
    expect(normalizeGeminiVideoModelId('veo-3.1-fast')).toBe('veo-3.1-fast-generate-preview');
    expect(normalizeGeminiVideoModelId('veo-3-generate-preview')).toBe('veo-3.0-generate-001');
  });
});

describe('supportsGeminiFrameConditioning', () => {
  it('accepts current Gemini image-to-video capable Veo models', () => {
    expect(supportsGeminiFrameConditioning('veo-3.1-generate-preview')).toBe(true);
    expect(supportsGeminiFrameConditioning('veo-3.1-fast-generate-preview')).toBe(true);
    expect(supportsGeminiFrameConditioning('veo-3.1')).toBe(true);
    expect(supportsGeminiFrameConditioning('veo-3.1-fast')).toBe(true);
  });

  it('rejects unknown Gemini video models for frame-conditioned renders', () => {
    expect(supportsGeminiFrameConditioning('veo-3.1-lite-preview')).toBe(false);
    expect(supportsGeminiFrameConditioning('')).toBe(false);
  });
});

describe('supportsGeminiReferenceImages', () => {
  it('only accepts Veo 3.1 and Veo 3.1 Fast for reference images', () => {
    expect(supportsGeminiReferenceImages('veo-3.1-generate-preview')).toBe(true);
    expect(supportsGeminiReferenceImages('veo-3.1-fast-generate-preview')).toBe(true);
    expect(supportsGeminiReferenceImages('veo-3-generate-preview')).toBe(false);
  });
});

describe('supportsGeminiVideoExtension', () => {
  it('only accepts Veo 3.1 and Veo 3.1 Fast for video extension', () => {
    expect(supportsGeminiVideoExtension('veo-3.1-generate-preview')).toBe(true);
    expect(supportsGeminiVideoExtension('veo-3.1-fast-generate-preview')).toBe(true);
    expect(supportsGeminiVideoExtension('veo-3-generate-preview')).toBe(false);
  });
});

describe('filterGeminiVideoModelsForConditioning', () => {
  it('keeps only Gemini video options that support advanced conditioning', () => {
    const options = [
      { value: 'veo-3.1-lite-preview', label: 'Veo 3.1 Lite' },
      { value: 'veo-3.1-fast-generate-preview', label: 'Veo 3.1 Fast' },
      { value: 'veo-3-generate-preview', label: 'Veo 3' },
      { value: 'veo-3.1-generate-preview', label: 'Veo 3.1' },
    ];

    expect(filterGeminiVideoModelsForConditioning(options)).toEqual([
      { value: 'veo-3.1-fast-generate-preview', label: 'Veo 3.1 Fast' },
      { value: 'veo-3.1-generate-preview', label: 'Veo 3.1' },
    ]);
  });
});

describe('isExplicitVideoFrameHandle', () => {
  it('treats only the dedicated start/end frame handles as valid frame inputs', () => {
    expect(isExplicitVideoFrameHandle('video-start-frame')).toBe(true);
    expect(isExplicitVideoFrameHandle('video-end-frame')).toBe(true);
    expect(isExplicitVideoFrameHandle('video-prompt')).toBe(false);
    expect(isExplicitVideoFrameHandle('video-reference-1')).toBe(false);
    expect(isExplicitVideoFrameHandle(undefined)).toBe(false);
  });
});

describe('video handle helpers', () => {
  it('classifies reference-image and extension handles', () => {
    expect(isVideoReferenceHandle('video-reference-1')).toBe(true);
    expect(isVideoReferenceHandle('video-reference-3')).toBe(true);
    expect(isVideoReferenceHandle('video-start-frame')).toBe(false);
    expect(isVideoImageConditioningHandle('video-reference-2')).toBe(true);
    expect(isVideoImageConditioningHandle('video-start-frame')).toBe(true);
    expect(isVideoImageConditioningHandle('video-source-video')).toBe(false);
    expect(isVideoExtensionHandle('video-source-video')).toBe(true);
    expect(isVideoExtensionHandle('video-reference-1')).toBe(false);
  });
});
