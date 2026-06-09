import { beforeEach, describe, expect, it } from 'vitest';
import type { ImageDocument, ImageLayer, LayerBitmap } from '../../types/imageEditor';
import {
  resizeImageCanvas,
  resizeImageDocumentPixels,
  scaleImageDocumentToPercent,
} from './ImageDocumentGeometry';

class FakeContext {
  drawImageCalls: unknown[][] = [];

  drawImage(...args: unknown[]) {
    this.drawImageCalls.push(args);
  }

  save() {}
  restore() {}
  clearRect() {}
}

class FakeOffscreenCanvas {
  width: number;
  height: number;
  context = new FakeContext();

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

function makeLayer(overrides?: Partial<ImageLayer>): ImageLayer {
  return {
    id: 'layer-1',
    name: 'Layer 1',
    type: 'image',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    x: 10,
    y: 5,
    bitmap: new OffscreenCanvas(20, 10) as LayerBitmap,
    bitmapVersion: 0,
    mask: new OffscreenCanvas(20, 10) as LayerBitmap,
    ...overrides,
  };
}

function makeDoc(overrides?: Partial<ImageDocument>): ImageDocument {
  return {
    id: 'doc-1',
    title: 'Document',
    width: 100,
    height: 50,
    layers: [makeLayer()],
    activeLayerId: 'layer-1',
    hasSelection: false,
    selectionVersion: 0,
    viewport: { zoom: 1, panX: 0, panY: 0 },
    dirty: false,
    ...overrides,
  };
}

describe('ImageDocumentGeometry', () => {
  beforeEach(() => {
    installCanvasStub();
  });

  it('resizes image pixels by scaling document dimensions, layer positions, bitmaps, and masks', () => {
    const next = resizeImageDocumentPixels(makeDoc(), 200, 100);
    const layer = next.layers[0];

    expect(next.width).toBe(200);
    expect(next.height).toBe(100);
    expect(next.dirty).toBe(true);
    expect(layer.x).toBe(20);
    expect(layer.y).toBe(10);
    expect(layer.bitmap?.width).toBe(40);
    expect(layer.bitmap?.height).toBe(20);
    expect(layer.mask?.width).toBe(40);
    expect(layer.mask?.height).toBe(20);
    expect(layer.bitmapVersion).toBe(1);

    const bitmapCanvas = layer.bitmap as unknown as FakeOffscreenCanvas;
    expect(bitmapCanvas.context.drawImageCalls.at(-1)).toEqual([
      expect.objectContaining({ width: 20, height: 10 }),
      0,
      0,
      40,
      20,
    ]);
  });

  it('resizes the canvas without resampling pixels and offsets layers from the selected anchor', () => {
    const source = makeDoc();
    const next = resizeImageCanvas(source, 140, 90, 'center');
    const layer = next.layers[0];

    expect(next.width).toBe(140);
    expect(next.height).toBe(90);
    expect(layer.x).toBe(30);
    expect(layer.y).toBe(25);
    expect(layer.bitmap).toBe(source.layers[0].bitmap);
    expect(layer.mask).toBe(source.layers[0].mask);
    expect(layer.bitmapVersion).toBe(0);
    expect(next.dirty).toBe(true);
  });

  it('builds percent-based upscale dimensions with integer pixel bounds', () => {
    expect(scaleImageDocumentToPercent(makeDoc(), 200)).toMatchObject({
      width: 200,
      height: 100,
    });

    expect(scaleImageDocumentToPercent(makeDoc({ width: 333, height: 222 }), 150)).toMatchObject({
      width: 500,
      height: 333,
    });
  });
});
