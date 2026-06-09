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

  it('serializes chroma key, stroke, and expanded filters for final render parity', () => {
    const filters = buildFFmpegClipEffectFilters({
      cropLeftPercent: 0,
      cropRightPercent: 0,
      cropTopPercent: 0,
      cropBottomPercent: 0,
      cropPanXPercent: 0,
      cropPanYPercent: 0,
      cropRotationDeg: 0,
      filterStack: [
        { id: 'sepia', kind: 'sepia', amount: 80, enabled: true },
        { id: 'invert', kind: 'invert', amount: 50, enabled: true },
        { id: 'hue', kind: 'hue-rotate', amount: 45, enabled: true },
      ],
      chromaKey: {
        enabled: true,
        color: '#00ff00',
        similarityPercent: 24,
        blendPercent: 8,
      },
      stroke: {
        enabled: true,
        color: '#ff00cc',
        widthPx: 6,
        opacityPercent: 75,
      },
    });

    expect(filters).toContain('chromakey=0x00ff00:0.2400:0.0800');
    expect(filters).toContain('colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131');
    expect(filters).toContain('negate=negate_alpha=0');
    expect(filters).toContain("hue=h='45.0000'");
    expect(filters).toContain('drawbox=x=0:y=0:w=iw:h=ih:color=0xff00cc@0.7500:t=6');
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

  it('creates browser preview filters for expanded clip filters', () => {
    expect(buildCssClipFilter([
      { id: 'sepia', kind: 'sepia', amount: 70, enabled: true },
      { id: 'invert', kind: 'invert', amount: 25, enabled: true },
      { id: 'hue', kind: 'hue-rotate', amount: 90, enabled: true },
    ])).toBe('sepia(0.7) invert(0.25) hue-rotate(90deg)');
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
    expect(descriptor.cssOutline).toBeUndefined();
    expect(descriptor.ffmpegBlendMode).toBe('overlay');
    expect(descriptor.ffmpegFilters).toEqual(expect.arrayContaining([
      expect.stringContaining('crop='),
      expect.stringContaining('rotate='),
      'eq=contrast=1.2000',
    ]));
  });

  it('builds one descriptor for chroma key and clip stroke controls', () => {
    const descriptor = buildClipEffectDescriptor({
      cropLeftPercent: 0,
      cropRightPercent: 0,
      cropTopPercent: 0,
      cropBottomPercent: 0,
      cropPanXPercent: 0,
      cropPanYPercent: 0,
      cropRotationDeg: 0,
      blendMode: 'normal',
      filterStack: [],
      chromaKey: {
        enabled: true,
        color: '#00ff00',
        similarityPercent: 18,
        blendPercent: 6,
      },
      stroke: {
        enabled: true,
        color: '#22d3ee',
        widthPx: 4,
        opacityPercent: 60,
      },
    });

    expect(descriptor.chromaKey).toEqual({
      enabled: true,
      color: '#00ff00',
      similarityPercent: 18,
      blendPercent: 6,
    });
    expect(descriptor.cssOutline).toEqual({
      color: '#22d3ee',
      widthPx: 4,
      opacityPercent: 60,
    });
    expect(descriptor.ffmpegFilters).toEqual(expect.arrayContaining([
      'chromakey=0x00ff00:0.1800:0.0600',
      'drawbox=x=0:y=0:w=iw:h=ih:color=0x22d3ee@0.6000:t=4',
    ]));
  });
});
