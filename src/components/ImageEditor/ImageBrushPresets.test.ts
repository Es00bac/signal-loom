import { describe, expect, it } from 'vitest';
import {
  BRUSH_PRESET_GROUPS,
  IMAGE_BRUSH_PRESETS,
  applyBrushPreset,
  getBrushPreset,
} from './ImageBrushPresets';
import { DEFAULT_BRUSH_SETTINGS } from '../../types/imageEditor';

describe('ImageBrushPresets', () => {
  it('provides a broad default brush library for painting, inking, manga, and erasing', () => {
    expect(IMAGE_BRUSH_PRESETS.length).toBeGreaterThanOrEqual(16);
    expect(IMAGE_BRUSH_PRESETS.map((preset) => preset.id)).toEqual(expect.arrayContaining([
      'pencil',
      'hardRound',
      'softRound',
      'marker',
      'airbrush',
      'inker',
      'mangaInker',
      'brushPen',
      'dryBrush',
      'charcoal',
      'watercolorWash',
      'gouacheFlat',
      'screentoneDots',
      'speedLine',
      'storyboardBlue',
      'softEraser',
      'hardEraser',
    ]));
    expect(BRUSH_PRESET_GROUPS).toEqual(expect.arrayContaining([
      'Sketch',
      'Ink',
      'Paint',
      'Comic / Manga',
      'Utility',
    ]));
  });

  it('applies a preset without discarding the current color unless preset supplies one', () => {
    const current = { ...DEFAULT_BRUSH_SETTINGS, color: '#ff00ff' };

    expect(applyBrushPreset(current, getBrushPreset('marker')!)).toMatchObject({
      presetId: 'marker',
      size: 24,
      opacity: 0.7,
      hardness: 0.65,
      flow: 0.8,
      spacing: 0.14,
      roundness: 0.72,
      color: '#ff00ff',
    });
    expect(applyBrushPreset(current, getBrushPreset('storyboardBlue')!).color).toBe('#38bdf8');
  });
});
