import { describe, expect, it } from 'vitest';
import { buildEmptyModelCatalog } from '../lib/providerCatalog';
import { addGeminiModelRecordToCatalog, addOpenAICompatibleModelRecordToCatalog } from './catalogStore';

describe('addGeminiModelRecordToCatalog', () => {
  it('surfaces newly discovered Gemini Omni models across Signal Loom media categories', () => {
    const catalog = buildEmptyModelCatalog();

    addGeminiModelRecordToCatalog(catalog, {
      name: 'models/gemini-omni-flash-preview',
      displayName: 'Gemini Omni Flash Preview',
      description: 'Live keynote model surface before static docs are indexed.',
    });

    const expectedOption = expect.objectContaining({
      value: 'gemini-omni-flash-preview',
      label: 'Gemini Omni Flash Preview',
    });

    expect(catalog.text.gemini).toEqual([expectedOption]);
    expect(catalog.image.gemini).toEqual([expectedOption]);
    expect(catalog.video.gemini).toEqual([expectedOption]);
    expect(catalog.audio.gemini).toEqual([expectedOption]);
  });
});

describe('addOpenAICompatibleModelRecordToCatalog', () => {
  it('keeps discovered Atlas Cloud image models under the Atlas provider instead of OpenAI', () => {
    const catalog = buildEmptyModelCatalog();

    addOpenAICompatibleModelRecordToCatalog(catalog, {
      id: 'black-forest-labs/flux-schnell',
    }, 'atlas');

    expect(catalog.image.atlas).toEqual([
      expect.objectContaining({
        value: 'black-forest-labs/flux-schnell',
        label: 'black-forest-labs/flux-schnell',
      }),
    ]);
    expect(catalog.image.openai).toEqual([]);
  });

  it('maps a discovered native Atlas nano-banana slug into the atlas image catalog', () => {
    const catalog = buildEmptyModelCatalog();
    addOpenAICompatibleModelRecordToCatalog(catalog, { id: 'google/nano-banana-2/reference-to-image' }, 'atlas');
    expect(catalog.image.atlas.some((option) => option.value === 'google/nano-banana-2/reference-to-image')).toBe(true);
  });
});
