export type MaskEncoding = 'openai-alpha-cutout' | 'white-on-black';

/** Atlas GPT-image routes go through the OpenAI-compatible client; native slugs do not. */
function isOpenAiCompatibleAtlasModel(modelId: string | undefined): boolean {
  const id = (modelId ?? '').trim().toLowerCase();
  return !id.includes('/') || id.startsWith('openai/');
}

export function maskEncodingForProvider(provider: string, modelId: string | undefined): MaskEncoding {
  if (provider === 'openai') return 'openai-alpha-cutout';
  if (provider === 'atlas') {
    return isOpenAiCompatibleAtlasModel(modelId) ? 'openai-alpha-cutout' : 'white-on-black';
  }
  // stability, localOpen, atlas-native, qwen, generic, etc.
  return 'white-on-black';
}

/** Canonical mask = RGBA where alpha > 127 means "edit here". */
export function transformMaskPixels(src: Uint8ClampedArray, encoding: MaskEncoding): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i += 4) {
    const isEdit = src[i + 3] > 127;
    if (encoding === 'openai-alpha-cutout') {
      out[i] = 0; out[i + 1] = 0; out[i + 2] = 0;
      out[i + 3] = isEdit ? 0 : 255; // OpenAI edits where the mask is transparent
    } else {
      const v = isEdit ? 255 : 0;
      out[i] = v; out[i + 1] = v; out[i + 2] = v;
      out[i + 3] = 255;
    }
  }
  return out;
}
