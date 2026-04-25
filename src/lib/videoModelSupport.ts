import type { SelectOption, VideoTargetHandle } from '../types/flow';

const GEMINI_VIDEO_MODEL_ALIASES = new Map<string, string>([
  ['veo-3.1', 'veo-3.1-generate-preview'],
  ['veo-3.1-preview', 'veo-3.1-generate-preview'],
  ['veo-3.1-fast', 'veo-3.1-fast-generate-preview'],
  ['veo-3.1-fast-preview', 'veo-3.1-fast-generate-preview'],
  ['veo-3.1-lite', 'veo-3.1-lite-generate-preview'],
  ['veo-3.1-lite-preview', 'veo-3.1-lite-generate-preview'],
  ['veo-3', 'veo-3.0-generate-001'],
  ['veo-3-preview', 'veo-3.0-generate-001'],
  ['veo-3-generate-preview', 'veo-3.0-generate-001'],
  ['veo-3-fast', 'veo-3.0-fast-generate-001'],
  ['veo-3-fast-preview', 'veo-3.0-fast-generate-001'],
  ['veo-3-fast-generate-preview', 'veo-3.0-fast-generate-001'],
]);

const GEMINI_REFERENCE_AND_EXTENSION_MODELS = new Set([
  'veo-3.1-generate-preview',
  'veo-3.1-fast-generate-preview',
]);

const GEMINI_INTERPOLATION_MODELS = new Set([
  'veo-3.1-generate-preview',
  'veo-3.1-fast-generate-preview',
]);

export function normalizeGeminiVideoModelId(modelId: string | undefined): string {
  const trimmed = (modelId ?? '').trim();

  if (!trimmed) {
    return '';
  }

  return GEMINI_VIDEO_MODEL_ALIASES.get(trimmed.toLowerCase()) ?? trimmed;
}

export function supportsGeminiImageToVideo(modelId: string | undefined): boolean {
  const normalized = normalizeGeminiVideoModelId(modelId);
  return normalized.startsWith('veo-3.');
}

export function supportsGeminiFrameConditioning(modelId: string | undefined): boolean {
  return GEMINI_INTERPOLATION_MODELS.has(normalizeGeminiVideoModelId(modelId));
}

export function supportsGeminiReferenceImages(modelId: string | undefined): boolean {
  return GEMINI_REFERENCE_AND_EXTENSION_MODELS.has(normalizeGeminiVideoModelId(modelId));
}

export function supportsGeminiVideoExtension(modelId: string | undefined): boolean {
  return GEMINI_REFERENCE_AND_EXTENSION_MODELS.has(normalizeGeminiVideoModelId(modelId));
}

export function supportsGeminiAdvancedVideoConditioning(modelId: string | undefined): boolean {
  const normalized = normalizeGeminiVideoModelId(modelId);
  return supportsGeminiFrameConditioning(normalized) || supportsGeminiReferenceImages(normalized) || supportsGeminiVideoExtension(normalized);
}

export function filterGeminiVideoModelsForConditioning(options: SelectOption[]): SelectOption[] {
  return options.filter((option) => supportsGeminiAdvancedVideoConditioning(option.value));
}

export function isExplicitVideoFrameHandle(
  handle: VideoTargetHandle | string | undefined,
): handle is Exclude<VideoTargetHandle, 'video-prompt'> {
  return handle === 'video-start-frame' || handle === 'video-end-frame';
}

export function isVideoReferenceHandle(
  handle: VideoTargetHandle | string | undefined,
): handle is Extract<VideoTargetHandle, 'video-reference-1' | 'video-reference-2' | 'video-reference-3'> {
  return handle === 'video-reference-1' || handle === 'video-reference-2' || handle === 'video-reference-3';
}

export function isVideoImageConditioningHandle(
  handle: VideoTargetHandle | string | undefined,
): handle is Exclude<VideoTargetHandle, 'video-prompt' | 'video-source-video'> {
  return isExplicitVideoFrameHandle(handle) || isVideoReferenceHandle(handle);
}

export function isVideoExtensionHandle(
  handle: VideoTargetHandle | string | undefined,
): handle is Extract<VideoTargetHandle, 'video-source-video'> {
  return handle === 'video-source-video';
}
