import { beforeEach, describe, expect, it } from 'vitest';
import type { ImageDocument, ImageLayer, LayerBitmap } from '../../types/imageEditor';
import { createMask, setRect } from './SelectionMask';
import {
  IMAGE_EXPORT_FORMATS,
  buildImageDocumentExportLabel,
  flattenImageDocumentToBitmap,
  imageDocumentToBlob,
  imageDocumentToDataUrl,
  normalizeImageExportMimeType,
  renderSelectionMaskToBitmap,
} from './ImageDocumentExport';

class FakeContext {
  drawImageCalls: Array<{
    image: unknown;
    dx: number;
    dy: number;
    alpha: number;
    composite: string;
  }> = [];
  lastImageData: ImageData | null = null;
  globalAlpha = 1;
  globalCompositeOperation = 'source-over';
  fillStyle = '#000000';
  private stack: Array<{ alpha: number; composite: string }> = [];

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

  drawImage(image: unknown, dx = 0, dy = 0) {
    this.drawImageCalls.push({
      image,
      dx,
      dy,
      alpha: this.globalAlpha,
      composite: this.globalCompositeOperation,
    });
  }

  createImageData(width: number, height: number) {
    return {
      width,
      height,
      data: new Uint8ClampedArray(width * height * 4),
    } as ImageData;
  }

  putImageData(imageData: ImageData) {
    this.lastImageData = {
      width: imageData.width,
      height: imageData.height,
      data: new Uint8ClampedArray(imageData.data),
    } as ImageData;
  }

  clearRect() {}
  fillRect() {}

  getImageData(_x = 0, _y = 0, width = 1, height = 1) {
    void _x;
    void _y;
    return {
      width,
      height,
      data: new Uint8ClampedArray(width * height * 4),
    } as ImageData;
  }
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

  async convertToBlob(options?: { type?: string }) {
    return new Blob([`fake:${this.width}x${this.height}`], {
      type: options?.type ?? 'image/png',
    });
  }
}

function installCanvasStub() {
  globalThis.OffscreenCanvas = FakeOffscreenCanvas as unknown as typeof OffscreenCanvas;
}

function makeDoc(overrides?: Partial<ImageDocument>): ImageDocument {
  return {
    id: 'doc-1',
    title: 'Portrait',
    width: 12,
    height: 8,
    layers: [],
    activeLayerId: null,
    hasSelection: false,
    selectionVersion: 0,
    viewport: { zoom: 1, panX: 0, panY: 0 },
    dirty: false,
    ...overrides,
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
    x: 0,
    y: 0,
    bitmap: new OffscreenCanvas(3, 2) as LayerBitmap,
    bitmapVersion: 0,
    mask: null,
    ...overrides,
  };
}

describe('ImageDocumentExport', () => {
  beforeEach(() => {
    installCanvasStub();
  });

  it('flattens visible layers into a transparent document-sized bitmap', () => {
    const base = makeLayer({
      id: 'base',
      x: 1,
      y: 2,
      opacity: 0.5,
      blendMode: 'multiply',
    });
    const hidden = makeLayer({ id: 'hidden', visible: false });
    const masked = makeLayer({
      id: 'masked',
      x: 4,
      y: 5,
      mask: new OffscreenCanvas(3, 2) as LayerBitmap,
    });
    const doc = makeDoc({ layers: [base, hidden, masked] });

    const bitmap = flattenImageDocumentToBitmap(doc);

    expect(bitmap.width).toBe(12);
    expect(bitmap.height).toBe(8);
    const calls = (bitmap as unknown as FakeOffscreenCanvas).context.drawImageCalls;
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({
      image: base.bitmap,
      dx: 1,
      dy: 2,
      alpha: 0.5,
      composite: 'multiply',
    });
    expect(calls[1]).toMatchObject({
      dx: 4,
      dy: 5,
      alpha: 1,
      composite: 'source-over',
    });

    const maskedComposite = calls[1].image as FakeOffscreenCanvas;
    const maskedCalls = maskedComposite.context.drawImageCalls;
    expect(maskedCalls).toHaveLength(2);
    expect(maskedCalls[0]).toMatchObject({
      image: masked.bitmap,
      composite: 'source-over',
    });
    expect(maskedCalls[1]).toMatchObject({
      image: masked.mask,
      composite: 'destination-in',
    });
  });

  it('renders the current selection as a white alpha mask bitmap', () => {
    const mask = createMask(6, 4);
    setRect(mask, 2, 1, 2, 2, 255, false);

    const bitmap = renderSelectionMaskToBitmap(mask);

    const imageData = (bitmap as unknown as FakeOffscreenCanvas).context.lastImageData;
    expect(imageData?.data[(1 * 6 + 2) * 4]).toBe(255);
    expect(imageData?.data[(1 * 6 + 2) * 4 + 1]).toBe(255);
    expect(imageData?.data[(1 * 6 + 2) * 4 + 2]).toBe(255);
    expect(imageData?.data[(1 * 6 + 2) * 4 + 3]).toBe(255);
    expect(imageData?.data[3]).toBe(0);
  });

  it('builds duplicate-safe edited image and mask labels', () => {
    const doc = makeDoc({ title: 'Untitled' });
    const existingItems = [
      { label: 'Portrait edit' },
      { label: 'Portrait edit 2' },
      { label: 'Portrait mask' },
    ];

    expect(buildImageDocumentExportLabel({
      doc,
      sourceLabel: 'Portrait.png',
      existingItems,
      suffix: 'edit',
    })).toBe('Portrait edit 3');
    expect(buildImageDocumentExportLabel({
      doc,
      sourceLabel: 'Portrait.png',
      existingItems,
      suffix: 'mask',
    })).toBe('Portrait mask 2');
  });

  it('supports explicit visible-export image formats', async () => {
    expect(IMAGE_EXPORT_FORMATS.map((format) => format.mimeType)).toEqual([
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/avif',
      'image/bmp',
      'image/gif',
      'image/tiff',
      'image/svg+xml',
    ]);
    expect(normalizeImageExportMimeType('image/jpeg')).toBe('image/jpeg');
    expect(normalizeImageExportMimeType('image/bmp')).toBe('image/bmp');
    expect(normalizeImageExportMimeType('image/gif')).toBe('image/gif');
    expect(normalizeImageExportMimeType('image/tiff')).toBe('image/tiff');

    const dataUrl = await imageDocumentToDataUrl(makeDoc(), 'image/jpeg');

    expect(dataUrl.startsWith('data:image/jpeg;base64,')).toBe(true);
  });

  it('encodes BMP and static GIF exports without relying on browser canvas MIME support', async () => {
    const bmp = new Uint8Array(await (await imageDocumentToBlob(makeDoc({ width: 2, height: 2 }), 'image/bmp')).arrayBuffer());
    const gif = new Uint8Array(await (await imageDocumentToBlob(makeDoc({ width: 2, height: 2 }), 'image/gif')).arrayBuffer());

    expect(String.fromCharCode(...bmp.slice(0, 2))).toBe('BM');
    expect(String.fromCharCode(...gif.slice(0, 6))).toBe('GIF89a');
  });
});
