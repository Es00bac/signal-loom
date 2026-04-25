import { describe, expect, it } from 'vitest';
import {
  buildCssClipFilter,
  buildFFmpegClipEffectFilters,
  buildCssClipBlendMode,
  mapClipBlendModeToFFmpeg,
  buildClipEffectDescriptor,
  normalizeClipCrop,
  normalizeClipBlendMode,
} from './editorClipEffects';

describe('normalizeClipCrop', () => {
  it('clamps crop sides so the visible source area stays non-empty', () => {
    expect(normalizeClipCrop({
      cropLeftPercent: 60,
      cropRightPercent: 60,
      cropTopPercent: -5,
      cropBottomPercent: 20,
      cropPanXPercent: 150,
      cropPanYPercent: -150,
      cropRotationDeg: 720,
    })).toEqual({
      cropLeftPercent: 47,
      cropRightPercent: 48,
      cropTopPercent: 0,
      cropBottomPercent: 20,
      cropPanXPercent: 100,
      cropPanYPercent: -100,
      cropRotationDeg: 720,
    });
  });
});

describe('buildFFmpegClipEffectFilters', () => {
  it('serializes crop and enabled filters for a clip render chain', () => {
    const filters = buildFFmpegClipEffectFilters({
      cropLeftPercent: 10,
      cropRightPercent: 5,
      cropTopPercent: 0,
      cropBottomPercent: 20,
      cropPanXPercent: 0,
      cropPanYPercent: 0,
      cropRotationDeg: 0,
      filterStack: [
        { id: 'b', kind: 'brightness', amount: 12, enabled: true },
        { id: 'off', kind: 'blur', amount: 8, enabled: false },
        { id: 's', kind: 'saturation', amount: -20, enabled: true },
      ],
    });

    expect(filters).toContain("crop=w='iw*0.8500':h='ih*0.8000':x='iw*0.1000':y='ih*0.0000'");
    expect(filters).toContain('eq=brightness=0.1200');
    expect(filters).toContain('eq=saturation=0.8000');
    expect(filters).not.toContain('boxblur');
  });
});

describe('buildCssClipFilter', () => {
  it('creates a CSS filter string from the same enabled filter stack', () => {
    expect(buildCssClipFilter([
      { id: 'b', kind: 'brightness', amount: 20, enabled: true },
      { id: 'g', kind: 'grayscale', amount: 100, enabled: true },
      { id: 'off', kind: 'blur', amount: 6, enabled: false },
    ])).toBe('brightness(1.2) grayscale(1)');
  });
});

describe('clip blend modes', () => {
  it('normalizes supported blend modes and falls back to normal', () => {
    expect(normalizeClipBlendMode('screen')).toBe('screen');
    expect(normalizeClipBlendMode('color-burn')).toBe('color-burn');
    expect(normalizeClipBlendMode('unknown')).toBe('normal');
  });

  it('maps clip blend modes to CSS and FFmpeg names', () => {
    expect(buildCssClipBlendMode('color-dodge')).toBe('color-dodge');
    expect(buildCssClipBlendMode('normal')).toBe('normal');
    expect(mapClipBlendModeToFFmpeg('color-dodge')).toBe('colordodge');
    expect(mapClipBlendModeToFFmpeg('normal')).toBeUndefined();
  });
});

describe('buildClipEffectDescriptor', () => {
  it('builds one normalized descriptor for preview CSS and render filters', () => {
    const descriptor = buildClipEffectDescriptor({
      cropLeftPercent: 10,
      cropRightPercent: 5,
      cropTopPercent: 2,
      cropBottomPercent: 3,
      cropPanXPercent: 25,
      cropPanYPercent: -25,
      cropRotationDeg: 15,
      blendMode: 'overlay',
      filterStack: [
        { id: 'contrast', kind: 'contrast', amount: 20, enabled: true },
      ],
    });

    expect(descriptor.crop.cropLeftPercent).toBe(10);
    expect(descriptor.cssFilter).toBe('contrast(1.2)');
    expect(descriptor.cssBlendMode).toBe('overlay');
    expect(descriptor.ffmpegBlendMode).toBe('overlay');
    expect(descriptor.ffmpegFilters).toEqual(expect.arrayContaining([
      expect.stringContaining('crop='),
      expect.stringContaining('rotate='),
      'eq=contrast=1.2000',
    ]));
  });
});
