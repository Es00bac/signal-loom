import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildTextLayerName,
  measureImageTextBlock,
  normalizeImageTextStyle,
  rasterizeImageTextStyle,
  updateTextLayerFromStyle,
} from './ImageTextLayer';
import {
  applyImageTextPresetToLayer,
  applyImageTextPresetToStyle,
  getImageTextEditOverlayBounds,
  imageTextLayerContainsPoint,
} from './ImageTextPresets';
import type { ImageLayer } from '../../types/imageEditor';

class FakeTextContext {
  font = '';
  fillStyle = '';
  textBaseline = '';
  fills: Array<{ text: string; x: number; y: number }> = [];

  measureText(line: string) {
    return { width: line.length * 10 };
  }

  fillText(text: string, x: number, y: number) {
    this.fills.push({ text, x, y });
  }
}

class FakeOffscreenCanvas {
  width: number;
  height: number;
  context = new FakeTextContext();

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  getContext(kind: string) {
    return kind === '2d' ? this.context : null;
  }
}

function installCanvasStub() {
  globalThis.OffscreenCanvas = FakeOffscreenCanvas as unknown as typeof OffscreenCanvas;
}

describe('ImageTextLayer', () => {
  beforeEach(() => {
    installCanvasStub();
  });

  it('normalizes configurable text settings for canvas placement', () => {
    const style = normalizeImageTextStyle({
      content: '  Signal\nLoom  ',
      fontFamily: 'Inter',
      fontSize: 64,
      fontWeight: '700',
      fontStyle: 'italic',
      letterSpacing: 2,
      boxWidth: 120,
      boxHeight: 200,
      color: '#facc15',
      lineHeight: 1.2,
      align: 'center',
      verticalAlign: 'middle',
      warp: 'arc',
    });

    expect(style).toEqual({
      content: 'Signal\nLoom',
      fontFamily: 'Inter',
      fontSize: 64,
      fontWeight: '700',
      fontStyle: 'italic',
      letterSpacing: 2,
      boxWidth: 120,
      boxHeight: 200,
      wrap: true,
      color: '#facc15',
      lineHeight: 1.2,
      align: 'center',
      verticalAlign: 'middle',
      warp: 'arc',
    });
  });

  it('measures multiline text blocks with explicit leading and alignment metadata', () => {
    const layout = measureImageTextBlock(
      normalizeImageTextStyle({
        content: 'A\nwide line',
        fontSize: 50,
        lineHeight: 1.4,
        align: 'right',
      }),
      (line) => line.length * 10,
    );

    expect(layout.lines.map((line) => line.text)).toEqual(['A', 'wide line']);
    expect(layout.width).toBe(90);
    expect(layout.lineHeightPx).toBe(70);
    expect(layout.height).toBe(140);
    expect(layout.align).toBe('right');
  });

  it('wraps text into source style box dimensions and preserves the box as raster bounds', () => {
    const layout = measureImageTextBlock(
      normalizeImageTextStyle({
        content: 'Signal Loom captions wrap',
        fontSize: 20,
        boxWidth: 90,
        boxHeight: 120,
        verticalAlign: 'bottom',
      }),
      (line) => line.length * 10,
    );

    expect(layout.lines.map((line) => line.text)).toEqual(['Signal', 'Loom', 'captions', 'wrap']);
    expect(layout.width).toBe(90);
    expect(layout.height).toBe(120);
    expect(layout.lines[0].baseline).toBeGreaterThan(20);
  });

  it('builds readable text layer names from the actual content', () => {
    expect(buildTextLayerName('  The first balloon line is long enough to trim cleanly.  ')).toBe(
      'The first balloon line is...',
    );
    expect(buildTextLayerName('\n\n')).toBe('Text');
  });

  it('rasterizes text styles into measured bitmap bounds', () => {
    const bitmap = rasterizeImageTextStyle({ content: 'Hi\nThere', fontSize: 20, lineHeight: 1.5 });

    expect(bitmap.width).toBe(50);
    expect(bitmap.height).toBe(60);
    expect((bitmap as unknown as FakeOffscreenCanvas).context.fills.map((fill) => fill.text)).toEqual(['Hi', 'There']);
  });

  it('updates retained text metadata and rerasterizes the layer bitmap', () => {
    const layer = {
      id: 'text-1',
      name: 'Old',
      type: 'text',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      x: 12,
      y: 24,
      bitmap: null,
      bitmapVersion: 3,
      mask: null,
      text: normalizeImageTextStyle({ content: 'Old', fontSize: 20 }),
      metadata: { editableText: true },
    } satisfies ImageLayer;

    const updated = updateTextLayerFromStyle(layer, { content: 'New title', color: '#ff0000' });

    expect(updated.name).toBe('New title');
    expect(updated.text?.content).toBe('New title');
    expect(updated.text?.color).toBe('#ff0000');
    expect(updated.bitmapVersion).toBe(4);
    expect(updated.x).toBe(12);
    expect(updated.y).toBe(24);
    expect(updated.metadata?.editableText).toBe(true);
    expect(updated.bitmap).not.toBe(layer.bitmap);
  });

  it('applies title and comic text presets without replacing user content', () => {
    const current = normalizeImageTextStyle({ content: 'My Cover', fontSize: 20 });
    const stylePatch = applyImageTextPresetToStyle(current, 'coverTitle');

    expect(stylePatch.content).toBe('My Cover');
    expect(stylePatch.fontWeight).toBe('900');
    expect(stylePatch.warp).toBe('arc');

    const layer = {
      id: 'text-1',
      name: 'Old',
      type: 'text',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      x: 12,
      y: 24,
      bitmap: rasterizeImageTextStyle(current),
      bitmapVersion: 3,
      mask: null,
      text: current,
      metadata: { editableText: true },
    } satisfies ImageLayer;

    const updated = applyImageTextPresetToLayer(layer, 'comicSfx');

    expect(updated.text?.content).toBe('My Cover');
    expect(updated.text?.fontWeight).toBe('900');
    expect(updated.effects?.map((effect) => effect.kind)).toEqual(['stroke', 'stroke', 'dropShadow']);
    expect(updated.bitmapVersion).toBe(4);
  });

  it('resolves in-canvas text edit bounds and hit testing for retained text layers', () => {
    const layer = {
      id: 'text-1',
      name: 'Title',
      type: 'text',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      x: 20,
      y: 30,
      bitmap: rasterizeImageTextStyle({ content: 'Edit me', fontSize: 20 }),
      bitmapVersion: 0,
      mask: null,
      text: normalizeImageTextStyle({ content: 'Edit me', fontSize: 20 }),
      metadata: { editableText: true },
    } satisfies ImageLayer;

    expect(imageTextLayerContainsPoint(layer, { x: 25, y: 35 })).toBe(true);
    expect(imageTextLayerContainsPoint(layer, { x: 5, y: 35 })).toBe(false);

    const bounds = getImageTextEditOverlayBounds(layer, { zoom: 2, panX: 10, panY: 5 });

    expect(bounds).toMatchObject({
      x: 50,
      y: 65,
      rotationDeg: 0,
    });
    expect(bounds?.width).toBeGreaterThanOrEqual(36);
    expect(bounds?.height).toBeGreaterThanOrEqual(24);
  });
});
