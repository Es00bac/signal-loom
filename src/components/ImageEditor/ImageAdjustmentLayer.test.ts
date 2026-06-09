import { beforeEach, describe, expect, it } from 'vitest';
import type { ImageDocument, ImageLayer, LayerBitmap } from '../../types/imageEditor';
import {
  applyAdjustmentToImageData,
  adjustmentLayerLabel,
  createAdjustmentLayer,
  defaultAdjustmentSettings,
  renderImageDocumentLayersToBitmap,
} from './ImageAdjustmentLayer';

class FakeContext {
  imageData: ImageData;
  globalAlpha = 1;
  globalCompositeOperation = 'source-over';
  fillStyle = '#000000';
  private stack: Array<{ alpha: number; composite: string }> = [];

  constructor(width: number, height: number) {
    this.imageData = makeImageData(width, height);
  }

  createImageData(width: number, height: number) {
    return makeImageData(width, height);
  }

  getImageData() {
    return cloneImageData(this.imageData);
  }

  putImageData(imageData: ImageData) {
    this.imageData = cloneImageData(imageData);
  }

  drawImage(image: unknown, dx = 0, dy = 0) {
    const source = (image as { context?: FakeContext }).context?.imageData;
    if (!source) return;
    for (let y = 0; y < source.height; y += 1) {
      for (let x = 0; x < source.width; x += 1) {
        const tx = Math.round(dx + x);
        const ty = Math.round(dy + y);
        if (tx < 0 || ty < 0 || tx >= this.imageData.width || ty >= this.imageData.height) {
          continue;
        }
        const sourceOffset = (y * source.width + x) * 4;
        const targetOffset = (ty * this.imageData.width + tx) * 4;
        this.imageData.data[targetOffset] = source.data[sourceOffset];
        this.imageData.data[targetOffset + 1] = source.data[sourceOffset + 1];
        this.imageData.data[targetOffset + 2] = source.data[sourceOffset + 2];
        this.imageData.data[targetOffset + 3] = Math.round(source.data[sourceOffset + 3] * this.globalAlpha);
      }
    }
  }

  clearRect() {
    this.imageData.data.fill(0);
  }

  fillRect() {}

  save() {
    this.stack.push({
      alpha: this.globalAlpha,
      composite: this.globalCompositeOperation,
    });
  }

  restore() {
    const next = this.stack.pop();
    if (!next) return;
    this.globalAlpha = next.alpha;
    this.globalCompositeOperation = next.composite;
  }
}

class FakeOffscreenCanvas {
  width: number;
  height: number;
  context: FakeContext;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.context = new FakeContext(width, height);
  }

  getContext(kind: string) {
    return kind === '2d' ? this.context : null;
  }

  async convertToBlob() {
    return new Blob();
  }
}

function installCanvasStub() {
  globalThis.OffscreenCanvas = FakeOffscreenCanvas as unknown as typeof OffscreenCanvas;
}

function makeImageData(width: number, height: number): ImageData {
  return {
    width,
    height,
    data: new Uint8ClampedArray(width * height * 4),
  } as ImageData;
}

function cloneImageData(imageData: ImageData): ImageData {
  return {
    width: imageData.width,
    height: imageData.height,
    data: new Uint8ClampedArray(imageData.data),
  } as ImageData;
}

function setPixel(imageData: ImageData, x: number, y: number, rgba: [number, number, number, number]) {
  const offset = (y * imageData.width + x) * 4;
  imageData.data[offset] = rgba[0];
  imageData.data[offset + 1] = rgba[1];
  imageData.data[offset + 2] = rgba[2];
  imageData.data[offset + 3] = rgba[3];
}

function getPixel(imageData: ImageData, x: number, y: number): [number, number, number, number] {
  const offset = (y * imageData.width + x) * 4;
  return [
    imageData.data[offset],
    imageData.data[offset + 1],
    imageData.data[offset + 2],
    imageData.data[offset + 3],
  ];
}

function makeDoc(overrides?: Partial<ImageDocument>): ImageDocument {
  return {
    id: 'doc-1',
    title: 'doc',
    width: 2,
    height: 1,
    layers: [],
    activeLayerId: null,
    hasSelection: false,
    selectionVersion: 0,
    viewport: { zoom: 1, panX: 0, panY: 0 },
    dirty: false,
    ...overrides,
  };
}

function makeLayer(id: string, rgba: [number, number, number, number]): ImageLayer {
  const bitmap = new OffscreenCanvas(2, 1) as LayerBitmap;
  const data = makeImageData(2, 1);
  setPixel(data, 0, 0, rgba);
  setPixel(data, 1, 0, rgba);
  bitmap.getContext('2d')?.putImageData(data, 0, 0);
  return {
    id,
    name: id,
    type: 'image',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    x: 0,
    y: 0,
    bitmap,
    bitmapVersion: 0,
    mask: null,
  };
}

describe('ImageAdjustmentLayer', () => {
  beforeEach(() => {
    installCanvasStub();
  });

  it('creates document-sized non-destructive adjustment layers without pixel bitmaps', () => {
    const doc = makeDoc({ width: 640, height: 480 });

    const layer = createAdjustmentLayer(doc, 'hueSaturation', 'Color trim');

    expect(layer).toMatchObject({
      name: 'Color trim',
      type: 'adjustment',
      bitmap: null,
      x: 0,
      y: 0,
    });
    expect(layer.adjustment).toEqual(defaultAdjustmentSettings('hueSaturation'));
  });

  it('provides defaults and labels for levels and curves adjustment layers', () => {
    expect(defaultAdjustmentSettings('levels')).toEqual({
      kind: 'levels',
      channel: 'rgb',
      inputBlack: 0,
      inputWhite: 255,
      gamma: 1,
      outputBlack: 0,
      outputWhite: 255,
    });
    expect(defaultAdjustmentSettings('curves')).toEqual({
      kind: 'curves',
      channel: 'rgb',
      points: [{ input: 0, output: 0 }, { input: 255, output: 255 }],
      shadows: 0,
      midtones: 0,
      highlights: 0,
    });
    expect(adjustmentLayerLabel('levels')).toBe('Levels');
    expect(adjustmentLayerLabel('curves')).toBe('Curves');
  });

  it('applies brightness and contrast through layer opacity', () => {
    const source = makeImageData(1, 1);
    setPixel(source, 0, 0, [100, 120, 140, 255]);

    const adjusted = applyAdjustmentToImageData(source, {
      kind: 'brightnessContrast',
      brightness: 40,
      contrast: 0,
    }, { opacity: 0.5 });

    expect(getPixel(adjusted, 0, 0)).toEqual([120, 140, 160, 255]);
  });

  it('uses adjustment masks to limit destructive-looking pixel changes', () => {
    const source = makeImageData(2, 1);
    setPixel(source, 0, 0, [10, 20, 30, 255]);
    setPixel(source, 1, 0, [10, 20, 30, 255]);
    const mask = makeImageData(2, 1);
    setPixel(mask, 0, 0, [255, 255, 255, 0]);
    setPixel(mask, 1, 0, [255, 255, 255, 255]);

    const adjusted = applyAdjustmentToImageData(source, { kind: 'invert' }, { mask });

    expect(getPixel(adjusted, 0, 0)).toEqual([10, 20, 30, 255]);
    expect(getPixel(adjusted, 1, 0)).toEqual([245, 235, 225, 255]);
  });

  it('applies levels remapping non-destructively to image data', () => {
    const source = makeImageData(1, 1);
    setPixel(source, 0, 0, [128, 192, 64, 255]);

    const adjusted = applyAdjustmentToImageData(source, {
      kind: 'levels',
      channel: 'rgb',
      inputBlack: 64,
      inputWhite: 192,
      gamma: 1,
      outputBlack: 0,
      outputWhite: 255,
    });

    expect(getPixel(adjusted, 0, 0)).toEqual([128, 255, 0, 255]);
  });

  it('applies simple curves controls across tonal ranges', () => {
    const source = makeImageData(1, 1);
    setPixel(source, 0, 0, [20, 128, 235, 255]);

    const adjusted = applyAdjustmentToImageData(source, {
      kind: 'curves',
      channel: 'rgb',
      points: [{ input: 0, output: 0 }, { input: 255, output: 255 }],
      shadows: -60,
      midtones: 20,
      highlights: 60,
    });

    expect(getPixel(adjusted, 0, 0)[0]).toBeLessThan(20);
    expect(getPixel(adjusted, 0, 0)[1]).toBeGreaterThan(128);
    expect(getPixel(adjusted, 0, 0)[2]).toBeGreaterThan(235);
  });

  it('applies levels and point curves to selected color channels', () => {
    const source = makeImageData(1, 1);
    setPixel(source, 0, 0, [64, 128, 192, 255]);

    const leveled = applyAdjustmentToImageData(source, {
      kind: 'levels',
      channel: 'red',
      inputBlack: 64,
      inputWhite: 192,
      gamma: 1,
      outputBlack: 0,
      outputWhite: 255,
    });
    expect(getPixel(leveled, 0, 0)).toEqual([0, 128, 192, 255]);

    const curved = applyAdjustmentToImageData(source, {
      kind: 'curves',
      channel: 'blue',
      points: [{ input: 0, output: 0 }, { input: 192, output: 240 }, { input: 255, output: 255 }],
      shadows: 0,
      midtones: 0,
      highlights: 0,
    });
    expect(getPixel(curved, 0, 0)).toEqual([64, 128, 240, 255]);
  });

  it('renders adjustment layers over lower layers without affecting layers above them', () => {
    const lower = makeLayer('lower', [20, 40, 60, 255]);
    const adjustment = createAdjustmentLayer(makeDoc(), 'invert', 'Invert');
    const upper = makeLayer('upper', [200, 10, 20, 255]);
    upper.x = 1;
    upper.bitmap = new OffscreenCanvas(1, 1) as LayerBitmap;
    const upperData = makeImageData(1, 1);
    setPixel(upperData, 0, 0, [200, 10, 20, 255]);
    upper.bitmap.getContext('2d')?.putImageData(upperData, 0, 0);
    const doc = makeDoc({ layers: [lower, adjustment, upper] });

    const bitmap = renderImageDocumentLayersToBitmap(doc);
    const rendered = bitmap.getContext('2d')?.getImageData(0, 0, bitmap.width, bitmap.height);

    expect(rendered ? getPixel(rendered, 0, 0) : null).toEqual([235, 215, 195, 255]);
    expect(rendered ? getPixel(rendered, 1, 0) : null).toEqual([200, 10, 20, 255]);
  });
});
