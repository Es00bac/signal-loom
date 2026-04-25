import type { ImageProvider, ImageTargetHandle } from '../types/flow';

export const IMAGE_REFERENCE_HANDLES: Array<
  Extract<ImageTargetHandle, 'image-reference-1' | 'image-reference-2' | 'image-reference-3'>
> = ['image-reference-1', 'image-reference-2', 'image-reference-3'];

export function supportsImageEditing(
  provider: ImageProvider,
  modelId: string | undefined,
): boolean {
  const normalized = (modelId ?? '').trim().toLowerCase();

  switch (provider) {
    case 'gemini':
      return normalized.includes('image');
    case 'openai':
      return normalized.startsWith('gpt-image-') || normalized === 'dall-e-2';
    case 'huggingface':
      return false;
  }
}

export function supportsImageReferenceGuidance(
  provider: ImageProvider,
  modelId: string | undefined,
): boolean {
  const normalized = (modelId ?? '').trim().toLowerCase();

  switch (provider) {
    case 'gemini':
      return normalized.includes('image');
    case 'openai':
    case 'huggingface':
      return false;
  }
}

export function isImageEditSourceHandle(
  handle: ImageTargetHandle | string | undefined,
): handle is Extract<ImageTargetHandle, 'image-edit-source'> {
  return handle === 'image-edit-source';
}

export function isImageReferenceHandle(
  handle: ImageTargetHandle | string | undefined,
): handle is (typeof IMAGE_REFERENCE_HANDLES)[number] {
  return IMAGE_REFERENCE_HANDLES.includes(handle as (typeof IMAGE_REFERENCE_HANDLES)[number]);
}

export function isImageConditioningHandle(
  handle: ImageTargetHandle | string | undefined,
): handle is ImageTargetHandle {
  return isImageEditSourceHandle(handle) || isImageReferenceHandle(handle);
}
