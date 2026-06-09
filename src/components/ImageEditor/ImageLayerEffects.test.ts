import { beforeEach, describe, expect, it } from 'vitest';
import type { ImageLayer, LayerBitmap } from '../../types/imageEditor';
import {
  createDefaultLayerEffect,
  renderLayerWithEffects,
} from './ImageLayerEffects';

class FakeContext {
  imageData: ImageData;
  globalAlpha = 1;
  globalCompositeOperation = 'source-over';
  fillStyle = '#000000';
  private stack: Array<{ alpha: number; composite: string; fillStyle: string }> = [];

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
        this.imageData.data[targetOffset + 3] = source.data[sourceOffset + 3];
      }
    }
  }

  save() {
    this.stack.push({
      alpha: this.globalAlpha,
      composite: this.globalCompositeOperation,
      fillStyle: this.fillStyle,
    });
  }

  restore() {
    const next = this.stack.pop();
    if (!next) return;
    this.globalAlpha = next.alpha;
    this.globalCompositeOperation = next.composite;
    this.fillStyle = next.fillStyle;
  }

  clearRect() {
    this.imageData.data.fill(0);
  }

  fillRect() {}
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

function makeLayer(overrides?: Partial<ImageLayer>): ImageLayer {
  const bitmap = new OffscreenCanvas(3, 3) as LayerBitmap;
  const imageData = makeImageData(3, 3);
  setPixel(imageData, 1, 1, [20, 40, 60, 255]);
  bitmap.getContext('2d')?.putImageData(imageData, 0, 0);
  return {
    id: 'layer-1',
    name: 'Layer',
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
    ...overrides,
  };
}

describe('ImageLayerEffects', () => {
  beforeEach(() => {
    installCanvasStub();
  });

  it('creates enabled default layer effects with useful Photoshop-style settings', () => {
    expect(createDefaultLayerEffect('stroke')).toMatchObject({
      kind: 'stroke',
      enabled: true,
      size: 4,
      color: '#ffffff',
    });
    expect(createDefaultLayerEffect('dropShadow')).toMatchObject({
      kind: 'dropShadow',
      enabled: true,
      distance: 12,
      size: 12,
    });
  });

  it('applies color overlay to visible layer pixels', () => {
    const layer = makeLayer({
      effects: [{
        id: 'overlay',
        kind: 'colorOverlay',
        enabled: true,
        color: '#ff0000',
        opacity: 1,
      }],
    });

    const rendered = renderLayerWithEffects(layer);
    const imageData = rendered?.bitmap.getContext('2d')?.getImageData(0, 0, rendered.bitmap.width, rendered.bitmap.height);

    expect(rendered?.offsetX).toBe(0);
    expect(rendered?.offsetY).toBe(0);
    expect(imageData ? getPixel(imageData, 1, 1) : null).toEqual([255, 0, 0, 255]);
  });

  it('draws outside stroke pixels around opaque layer content', () => {
    const layer = makeLayer({
      effects: [{
        id: 'stroke',
        kind: 'stroke',
        enabled: true,
        color: '#00ff00',
        opacity: 1,
        size: 1,
        position: 'outside',
      }],
    });

    const rendered = renderLayerWithEffects(layer);
    const imageData = rendered?.bitmap.getContext('2d')?.getImageData(0, 0, rendered.bitmap.width, rendered.bitmap.height);

    expect(rendered?.offsetX).toBe(-1);
    expect(rendered?.offsetY).toBe(-1);
    expect(imageData ? getPixel(imageData, 2, 1) : null).toEqual([0, 255, 0, 255]);
    expect(imageData ? getPixel(imageData, 2, 2) : null).toEqual([20, 40, 60, 255]);
  });

  it('places drop shadow pixels behind the source content', () => {
    const layer = makeLayer({
      effects: [{
        id: 'shadow',
        kind: 'dropShadow',
        enabled: true,
        color: '#0000ff',
        opacity: 1,
        angle: 0,
        distance: 1,
        size: 0,
      }],
    });

    const rendered = renderLayerWithEffects(layer);
    const imageData = rendered?.bitmap.getContext('2d')?.getImageData(0, 0, rendered.bitmap.width, rendered.bitmap.height);

    expect(rendered?.offsetX).toBe(0);
    expect(rendered?.offsetY).toBe(0);
    expect(imageData ? getPixel(imageData, 2, 1) : null).toEqual([0, 0, 255, 255]);
    expect(imageData ? getPixel(imageData, 1, 1) : null).toEqual([20, 40, 60, 255]);
  });

  it('ignores disabled effects', () => {
    const layer = makeLayer({
      effects: [{
        id: 'disabled-overlay',
        kind: 'colorOverlay',
        enabled: false,
        color: '#ff0000',
        opacity: 1,
      }],
    });

    const rendered = renderLayerWithEffects(layer);
    const imageData = rendered?.bitmap.getContext('2d')?.getImageData(0, 0, rendered.bitmap.width, rendered.bitmap.height);

    expect(imageData ? getPixel(imageData, 1, 1) : null).toEqual([20, 40, 60, 255]);
  });
});
