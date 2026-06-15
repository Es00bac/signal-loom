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
