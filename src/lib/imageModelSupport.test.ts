import { describe, expect, it } from 'vitest';
import { supportsImageEditing } from './imageModelSupport';

describe('supportsImageEditing', () => {
  it('accepts the current Gemini image models for editing', () => {
    expect(supportsImageEditing('gemini', 'gemini-3.1-flash-image-preview')).toBe(true);
    expect(supportsImageEditing('gemini', 'gemini-3-pro-image-preview')).toBe(true);
    expect(supportsImageEditing('gemini', 'gemini-2.5-flash-image')).toBe(true);
  });

  it('accepts GPT Image models for editing', () => {
    expect(supportsImageEditing('openai', 'gpt-image-1')).toBe(true);
    expect(supportsImageEditing('openai', 'gpt-image-2')).toBe(true);
  });

  it('rejects providers and models without edit support in the current app', () => {
    expect(supportsImageEditing('huggingface', 'black-forest-labs/FLUX.1-dev')).toBe(false);
    expect(supportsImageEditing('gemini', 'gemini-2.5-flash')).toBe(false);
  });

  it('keeps Hugging Face image slots hidden until the runtime wires image-to-image calls', () => {
    expect(supportsImageEditing('huggingface', 'black-forest-labs/FLUX.1-Kontext-dev')).toBe(false);
    expect(supportsImageEditing('huggingface', 'Qwen/Qwen-Image-Edit')).toBe(false);
  });
});
