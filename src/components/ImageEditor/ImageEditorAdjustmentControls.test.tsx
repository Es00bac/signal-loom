import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { AdjustmentLayerKind } from '../../types/imageEditor';
import {
  adjustmentLayerLabel,
  defaultAdjustmentSettings,
  serializeAdjustmentLayerPreset,
} from './ImageAdjustmentLayer';
import { AdjustmentLayerControls } from './ImageEditorAdjustmentControls';
import { buildImageHistogram } from './ImageHistogram';

const ADJUSTMENT_LAYER_KINDS: AdjustmentLayerKind[] = [
  'brightnessContrast',
  'hueSaturation',
  'blackWhite',
  'invert',
  'exposure',
  'temperatureTint',
  'levels',
  'curves',
];

function makeImageData(width: number, height: number, data: number[]): ImageData {
  return {
    width,
    height,
    data: new Uint8ClampedArray(data),
  } as ImageData;
}

describe('ImageEditorAdjustmentControls', () => {
  it('renders every default adjustment kind while keeping defaults preset-serializable', () => {
    for (const kind of ADJUSTMENT_LAYER_KINDS) {
      const adjustment = defaultAdjustmentSettings(kind);
      const html = renderToStaticMarkup(
        <AdjustmentLayerControls
          adjustment={adjustment}
          onChange={vi.fn()}
        />,
      );

      expect(html.replace(/&amp;/g, '&')).toContain(`Reset ${adjustmentLayerLabel(kind)}`);
      expect(serializeAdjustmentLayerPreset(`${kind} preset`, adjustment)).toMatchObject({
        version: 1,
        kind,
      });
    }
  });

  it('renders histogram-aware Levels controls with channel-specific clipping readouts', () => {
    const histogram = buildImageHistogram(makeImageData(3, 1, [
      0, 0, 0, 255,
      128, 64, 32, 255,
      255, 255, 255, 255,
    ]));

    const html = renderToStaticMarkup(
      <AdjustmentLayerControls
        adjustment={{
          kind: 'levels',
          channel: 'red',
          inputBlack: 0,
          inputWhite: 255,
          gamma: 1,
          outputBlack: 0,
          outputWhite: 255,
        }}
        histogram={histogram}
        onChange={vi.fn()}
      />,
    );

    expect(html).toContain('Levels Histogram');
    expect(html).toContain('Document Red adjustment histogram');
    expect(html).toContain('Shadow Clip');
    expect(html).toContain('Highlight Clip');
  });

  it('renders histogram-aware Curves controls using luminance for RGB channel edits', () => {
    const histogram = buildImageHistogram(makeImageData(2, 1, [
      0, 0, 0, 255,
      255, 255, 255, 255,
    ]));

    const html = renderToStaticMarkup(
      <AdjustmentLayerControls
        adjustment={{
          kind: 'curves',
          channel: 'rgb',
          points: [{ input: 0, output: 0 }, { input: 255, output: 255 }],
          shadows: 0,
          midtones: 0,
          highlights: 0,
        }}
        histogram={histogram}
        onChange={vi.fn()}
      />,
    );

    expect(html).toContain('Curves Histogram');
    expect(html).toContain('Document Lum adjustment histogram');
  });

  it('renders histogram readiness guidance when Levels preview data is unavailable', () => {
    const html = renderToStaticMarkup(
      <AdjustmentLayerControls
        adjustment={{
          kind: 'levels',
          channel: 'rgb',
          inputBlack: 0,
          inputWhite: 255,
          gamma: 1,
          outputBlack: 0,
          outputWhite: 255,
        }}
        histogram={null}
        onChange={vi.fn()}
      />,
    );

    expect(html).toContain('Histogram preview pending');
    expect(html).toContain('Render lower visible layers to inspect Levels or Curves clipping before applying changes.');
  });
});
