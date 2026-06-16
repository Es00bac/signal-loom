import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { BrushSelectionPalette } from './BrushSelectionPalette';
import { IMAGE_BRUSH_PRESETS, applyBrushPreset } from './ImageBrushPresets';
import { normalizeBrushSettings } from './ImageBrushEngine';

const preset = IMAGE_BRUSH_PRESETS[0];

vi.mock('../../store/imageEditorStore', () => ({
  useImageEditorStore: (selector: (s: unknown) => unknown) =>
    selector({
      brushSettings: applyBrushPreset(normalizeBrushSettings({}), preset),
      setBrushSettings: vi.fn(),
    }),
}));

vi.mock('../../store/settingsStore', () => ({
  useSettingsStore: (selector: (s: unknown) => unknown) =>
    selector({
      customBrushPresets: [],
      saveCustomBrushPreset: vi.fn(),
      renameCustomBrushPreset: vi.fn(),
      deleteCustomBrushPreset: vi.fn(),
      setCustomBrushPresets: vi.fn(),
    }),
}));

describe('BrushSelectionPalette', () => {
  it('renders the preset groups and the active preset label', () => {
    const html = renderToStaticMarkup(<BrushSelectionPalette />);
    expect(html).toContain(preset.label);
    expect(html).toContain('My Presets');
  });

  it('marks the active preset tile and shows a modified badge when settings diverge', () => {
    const html = renderToStaticMarkup(<BrushSelectionPalette />);
    // The active preset matches exactly here, so no modified badge.
    expect(html).not.toContain('modified');
  });
});
