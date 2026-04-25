import { describe, expect, it } from 'vitest';
import {
  FALLBACK_MODEL_OPTIONS,
  getConfiguredProviders,
  getVideoDurationOptions,
  mapAspectRatioToImageDimensions,
} from './providerCatalog';

describe('FALLBACK_MODEL_OPTIONS', () => {
  it('keeps current Hugging Face image, video, and audio choices available', () => {
    expect(FALLBACK_MODEL_OPTIONS.image.huggingface.map((option) => option.value)).toEqual(
      expect.arrayContaining([
        'black-forest-labs/FLUX.1-dev',
        'Qwen/Qwen-Image',
        'Tongyi-MAI/Z-Image-Turbo',
        'black-forest-labs/FLUX.1-Kontext-dev',
      ]),
    );
    expect(FALLBACK_MODEL_OPTIONS.video.huggingface.map((option) => option.value)).toEqual(
      expect.arrayContaining([
        'Lightricks/LTX-2.3',
        'Wan-AI/Wan2.2-T2V-A14B',
      ]),
    );
    expect(FALLBACK_MODEL_OPTIONS.audio.huggingface.map((option) => option.value)).toEqual(
      expect.arrayContaining([
        'hexgrad/Kokoro-82M',
        'ResembleAI/chatterbox',
        'coqui/XTTS-v2',
      ]),
    );
  });
});

describe('getConfiguredProviders', () => {
  it('exposes providers without browser keys when backend proxy mode is enabled', () => {
    expect(
      getConfiguredProviders(
        'image',
        { gemini: '', openai: '', huggingface: '', elevenlabs: '' },
        { backendProxyEnabled: true, backendProxyBaseUrl: 'http://127.0.0.1:8787' },
      ),
    ).toEqual(['gemini', 'openai', 'huggingface']);
  });
});

describe('getVideoDurationOptions', () => {
  it('locks Gemini interpolation flows to 8 seconds', () => {
    expect(getVideoDurationOptions(true)).toEqual([{ value: '8', label: '8 seconds' }]);
  });

  it('keeps the standard duration set for non-interpolation flows', () => {
    expect(getVideoDurationOptions(false)).toEqual([
      { value: '4', label: '4 seconds' },
      { value: '6', label: '6 seconds' },
      { value: '8', label: '8 seconds' },
    ]);
  });
});

describe('mapAspectRatioToImageDimensions', () => {
  it('maps landscape images to a wider output', () => {
    expect(mapAspectRatioToImageDimensions('16:9')).toEqual({ width: 1536, height: 1024 });
  });

  it('maps portrait images to a taller output', () => {
    expect(mapAspectRatioToImageDimensions('9:16')).toEqual({ width: 1024, height: 1536 });
  });

  it('keeps square images square', () => {
    expect(mapAspectRatioToImageDimensions('1:1')).toEqual({ width: 1024, height: 1024 });
  });
});
