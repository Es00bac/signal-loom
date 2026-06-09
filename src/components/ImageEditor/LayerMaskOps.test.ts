import { beforeEach, describe, expect, it } from 'vitest';
import type { ImageDocument, ImageLayer, LayerBitmap } from '../../types/imageEditor';
import { createMask, setRect } from './SelectionMask';
import {
  applyLayerMaskToLayer,
  createHideAllLayerMask,
  createLayerMaskFromSelection,
  createRevealAllLayerMask,
  invertLayerMask,
} from './LayerMaskOps';

class FakeContext {
  imageData: ImageData;
  fillStyle = '#000000';
  globalAlpha = 1;
  globalCompositeOperation = 'source-over';

  constructor(canvas: FakeOffscreenCanvas) {
    this.imageData = makeImageData(canvas.width, canvas.height);
  }

  createImageData(width: number, height: number) {
    return makeImageData(width, height);
  }

  getImageData() {
    return {
      width: this.imageData.width,
      height: this.imageData.height,
      data: new Uint8ClampedArray(this.imageData.data),
    } as ImageData;
  }

  putImageData(imageData: ImageData) {
    this.imageData = {
      width: imageData.width,
      height: imageData.height,
      data: new Uint8ClampedArray(imageData.data),
    } as ImageData;
  }

  drawImage() {}
  save() {}
  restore() {}
  clearRect() {}
  fillRect() {}
}

class FakeOffscreenCanvas {
  width: number;
  height: number;
  context: FakeContext;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.context = new FakeContext(this);
  }

  getContext(kind: string) {
    return kind === '2d' ? this.context : null;
  }

  async convertToBlob() {
    return new Blob();
  }
}

function makeImageData(width: number, height: number): ImageData {
  return {
    width,
    height,
    data: new Uint8ClampedArray(width * height * 4),
  } as ImageData;
}

function installCanvasStub() {
  globalThis.OffscreenCanvas = FakeOffscreenCanvas as unknown as typeof OffscreenCanvas;
}

function makeDoc(): ImageDocument {
  return {
    id: 'doc-1',
    title: 'doc',
    width: 10,
    height: 8,
    layers: [],
    activeLayerId: 'layer-1',
    hasSelection: true,
    selectionVersion: 1,
    viewport: { zoom: 1, panX: 0, panY: 0 },
    dirty: false,
  };
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
    x: 2,
    y: 1,
    bitmap: new OffscreenCanvas(4, 3) as LayerBitmap,
    bitmapVersion: 0,
    mask: null,
    ...overrides,
  };
}

function alphaAt(bitmap: LayerBitmap, x: number, y: number): number {
  const data = (bitmap as unknown as FakeOffscreenCanvas).context.imageData.data;
  return data[(y * bitmap.width + x) * 4 + 3];
}

function setPixel(bitmap: LayerBitmap, x: number, y: number, rgba: [number, number, number, number]) {
  const data = (bitmap as unknown as FakeOffscreenCanvas).context.imageData.data;
  const offset = (y * bitmap.width + x) * 4;
  data.set(rgba, offset);
}

describe('LayerMaskOps', () => {
  beforeEach(() => {
    installCanvasStub();
  });

  it('creates a layer-local reveal mask from a document-space selection', () => {
    const doc = makeDoc();
    const layer = makeLayer();
    const selection = createMask(doc.width, doc.height);
    setRect(selection, 3, 2, 2, 1, 255, false);

    const mask = createLayerMaskFromSelection(doc, layer, selection, 'reveal-selection');

    expect(mask.width).toBe(4);
    expect(mask.height).toBe(3);
    expect(alphaAt(mask, 0, 0)).toBe(0);
    expect(alphaAt(mask, 1, 1)).toBe(255);
    expect(alphaAt(mask, 2, 1)).toBe(255);
    expect(alphaAt(mask, 3, 1)).toBe(0);
  });

  it('can create reveal-all, hide-all, and inverted masks', () => {
    const doc = makeDoc();
    const layer = makeLayer();

    const reveal = createRevealAllLayerMask(doc, layer);
    const hide = createHideAllLayerMask(doc, layer);
    const inverted = invertLayerMask(reveal);

    expect(alphaAt(reveal, 0, 0)).toBe(255);
    expect(alphaAt(hide, 0, 0)).toBe(0);
    expect(alphaAt(inverted, 0, 0)).toBe(0);
  });

  it('applies a layer mask into bitmap alpha and clears the mask', () => {
    const doc = makeDoc();
    const layer = makeLayer();
    const mask = createHideAllLayerMask(doc, layer);
    setPixel(layer.bitmap as LayerBitmap, 0, 0, [200, 100, 50, 200]);
    setPixel(mask, 0, 0, [255, 255, 255, 128]);

    const applied = applyLayerMaskToLayer({ ...layer, mask });

    expect(applied.mask).toBeNull();
    expect(applied.bitmapVersion).toBe(1);
    expect(alphaAt(applied.bitmap as LayerBitmap, 0, 0)).toBe(100);
  });
});
