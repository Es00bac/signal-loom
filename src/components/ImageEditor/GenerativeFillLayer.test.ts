import { beforeEach, describe, expect, it } from 'vitest';
import type { ImageDocument, LayerBitmap } from '../../types/imageEditor';
import { createMask, setRect } from './SelectionMask';
import { createGenerativeFillLayerFromBitmap } from './GenerativeFillLayer';

class FakeContext {
  drawImageCalls: unknown[][] = [];
  lastImageData: ImageData | null = null;
  globalCompositeOperation = 'source-over';
  globalAlpha = 1;
  fillStyle = '#000000';

  drawImage(...args: unknown[]) {
    this.drawImageCalls.push(args);
  }

  createImageData(width: number, height: number) {
    return {
      width,
      height,
      data: new Uint8ClampedArray(width * height * 4),
    } as ImageData;
  }

  putImageData(imageData: ImageData) {
    this.lastImageData = imageData;
  }

  save() {}
  restore() {}
  clearRect() {}
  fillRect() {}
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

  async convertToBlob() {
    return new Blob();
  }
}

function installCanvasStub() {
  globalThis.OffscreenCanvas = FakeOffscreenCanvas as unknown as typeof OffscreenCanvas;
}

function makeDoc(): ImageDocument {
  return {
    id: 'doc-1',
    title: 'doc',
    width: 100,
    height: 80,
    layers: [],
    activeLayerId: null,
    hasSelection: true,
    selectionVersion: 1,
    viewport: { zoom: 1, panX: 0, panY: 0 },
    dirty: false,
  };
}

describe('GenerativeFillLayer', () => {
  beforeEach(() => {
    installCanvasStub();
  });

  it('creates a Photoshop-style generated layer masked to the active selection', () => {
    const doc = makeDoc();
    const selection = createMask(doc.width, doc.height);
    setRect(selection, 10, 12, 4, 3, 255, false);
    const providerBitmap = new OffscreenCanvas(doc.width, doc.height) as LayerBitmap;

    const layer = createGenerativeFillLayerFromBitmap({
      doc,
      edgeFeatherPx: 0,
      resultBitmap: providerBitmap,
      selection,
      prompt: 'red scarf',
      id: 'fill-1',
    });

    expect(layer).toMatchObject({
      id: 'fill-1',
      name: 'Generative Fill: "red scarf"',
      type: 'image',
      x: 0,
      y: 0,
      bitmapVersion: 0,
    });
    expect(layer.bitmap?.width).toBe(doc.width);
    expect(layer.bitmap?.height).toBe(doc.height);
    expect(layer.mask?.width).toBe(doc.width);
    expect(layer.mask?.height).toBe(doc.height);

    const maskData = (layer.mask as unknown as FakeOffscreenCanvas).context.lastImageData;
    expect(maskData?.data[(12 * doc.width + 10) * 4 + 3]).toBe(255);
    expect(maskData?.data[0 * 4 + 3]).toBe(0);
  });

  it('places selected-area generated results back at the source document bounds', () => {
    const doc = makeDoc();
    const selection = createMask(doc.width, doc.height);
    setRect(selection, 10, 12, 4, 3, 255, false);
    const providerBitmap = new OffscreenCanvas(8, 6) as LayerBitmap;

    const layer = createGenerativeFillLayerFromBitmap({
      doc,
      edgeFeatherPx: 0,
      resultBitmap: providerBitmap,
      selection,
      placementBounds: { x: 8, y: 9, width: 12, height: 10 },
      prompt: 'replace sign text',
      id: 'fill-local',
    });

    expect(layer).toMatchObject({
      id: 'fill-local',
      x: 8,
      y: 9,
    });
    expect(layer.bitmap?.width).toBe(12);
    expect(layer.bitmap?.height).toBe(10);
    expect(layer.mask?.width).toBe(12);
    expect(layer.mask?.height).toBe(10);

    const maskData = (layer.mask as unknown as FakeOffscreenCanvas).context.lastImageData;
    expect(maskData?.data[((12 - 9) * 12 + (10 - 8)) * 4 + 3]).toBe(255);
    expect(maskData?.data[0 * 4 + 3]).toBe(0);
  });

  it('feathers generated layer masks by default to blend selected-region edits', () => {
    const doc = makeDoc();
    const selection = createMask(doc.width, doc.height);
    setRect(selection, 10, 12, 4, 3, 255, false);
    const providerBitmap = new OffscreenCanvas(12, 10) as LayerBitmap;

    const layer = createGenerativeFillLayerFromBitmap({
      doc,
      resultBitmap: providerBitmap,
      selection,
      placementBounds: { x: 8, y: 9, width: 12, height: 10 },
      prompt: 'soft blended patch',
      id: 'fill-feathered',
    });

    const maskData = (layer.mask as unknown as FakeOffscreenCanvas).context.lastImageData;
    const selectedAlpha = maskData?.data[((12 - 9) * 12 + (10 - 8)) * 4 + 3] ?? 0;
    const edgeNeighborAlpha = maskData?.data[((12 - 9) * 12 + (9 - 8)) * 4 + 3] ?? 0;

    expect(selectedAlpha).toBeGreaterThan(0);
    expect(selectedAlpha).toBeLessThan(255);
    expect(edgeNeighborAlpha).toBeGreaterThan(0);
    expect(edgeNeighborAlpha).toBeLessThan(selectedAlpha);
  });
});
