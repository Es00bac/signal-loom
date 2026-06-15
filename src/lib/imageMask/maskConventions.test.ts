import { describe, expect, it } from 'vitest';
import { maskEncodingForProvider } from './maskConventions';

describe('maskEncodingForProvider', () => {
  it('uses OpenAI alpha-cutout for openai', () => {
    expect(maskEncodingForProvider('openai', 'gpt-image-2')).toBe('openai-alpha-cutout');
  });
  it('uses alpha-cutout for Atlas GPT-image routes (OpenAI-compatible)', () => {
    expect(maskEncodingForProvider('atlas', 'gpt-image-2')).toBe('openai-alpha-cutout');
    expect(maskEncodingForProvider('atlas', 'openai/gpt-image-2/edit')).toBe('openai-alpha-cutout');
  });
  it('uses white-on-black for Atlas native slugs', () => {
    expect(maskEncodingForProvider('atlas', 'atlascloud/qwen-image/edit')).toBe('white-on-black');
  });
  it('uses white-on-black for stability and localOpen', () => {
    expect(maskEncodingForProvider('stability', 'stable-image-edit-inpaint')).toBe('white-on-black');
    expect(maskEncodingForProvider('localOpen', 'Qwen/Qwen-Image-Edit')).toBe('white-on-black');
  });
});
