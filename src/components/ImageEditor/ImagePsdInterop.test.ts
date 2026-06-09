import { beforeEach, describe, expect, it } from 'vitest';
import type { Layer as PsdLayer, Psd } from 'ag-psd';
import type { ImageDocument, ImageLayer, LayerBitmap } from '../../types/imageEditor';
import {
  IMAGE_PSD_MIME_TYPE,
  SIGNAL_LOOM_PSD_METADATA_KEY,
  buildPsdDocumentFromImageDocument,
  imageDocumentToPsdBlob,
  detectPhotoshopDocumentKind,
  psdDocumentToImageDocument,
  psdArrayBufferToImageDocument,
  readSignalLoomPsdMetadata,
} from './ImagePsdInterop';

class FakeContext {
  imageData: ImageData;

  constructor(width: number, height: number) {
    this.imageData = makeImageData(width, height);
  }

  createImageData(width: number, height: number) {
    return makeImageData(width, height);
  }

  getImageData(_x?: number, _y?: number, width = this.imageData.width, height = this.imageData.height) {
    void _x;
    void _y;
    return cloneImageData({
      width,
      height,
      data: this.imageData.data.slice(0, width * height * 4),
    } as ImageData);
  }

  putImageData(imageData: ImageData) {
    this.imageData = cloneImageData(imageData);
  }

  clearRect() {
    this.imageData.data.fill(0);
  }

  drawImage(source: unknown, dx = 0, dy = 0) {
    const sourceData = (source as { context?: FakeContext }).context?.imageData;
    if (!sourceData) return;
    for (let y = 0; y < sourceData.height; y += 1) {
      for (let x = 0; x < sourceData.width; x += 1) {
        const targetX = Math.round(dx + x);
        const targetY = Math.round(dy + y);
        if (targetX < 0 || targetY < 0 || targetX >= this.imageData.width || targetY >= this.imageData.height) {
          continue;
        }
        const sourceOffset = (y * sourceData.width + x) * 4;
        const targetOffset = (targetY * this.imageData.width + targetX) * 4;
        this.imageData.data[targetOffset] = sourceData.data[sourceOffset];
        this.imageData.data[targetOffset + 1] = sourceData.data[sourceOffset + 1];
        this.imageData.data[targetOffset + 2] = sourceData.data[sourceOffset + 2];
        this.imageData.data[targetOffset + 3] = sourceData.data[sourceOffset + 3];
      }
    }
  }

  save() {}
  restore() {}
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

  async convertToBlob(options?: { type?: string }) {
    return new Blob([this.context.imageData.data], { type: options?.type ?? 'image/png' });
  }
}

function installCanvasStub() {
  globalThis.OffscreenCanvas = FakeOffscreenCanvas as unknown as typeof OffscreenCanvas;
}

function makeImageData(width: number, height: number, fill?: [number, number, number, number]): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  if (fill) {
    for (let offset = 0; offset < data.length; offset += 4) {
      data[offset] = fill[0];
      data[offset + 1] = fill[1];
      data[offset + 2] = fill[2];
      data[offset + 3] = fill[3];
    }
  }
  return { width, height, data } as ImageData;
}

function cloneImageData(imageData: ImageData): ImageData {
  return {
    width: imageData.width,
    height: imageData.height,
    data: new Uint8ClampedArray(imageData.data),
  } as ImageData;
}

function makeBitmap(width: number, height: number, fill: [number, number, number, number]): LayerBitmap {
  const bitmap = new OffscreenCanvas(width, height) as LayerBitmap;
  bitmap.getContext('2d')?.putImageData(makeImageData(width, height, fill), 0, 0);
  return bitmap;
}

function makeDoc(overrides?: Partial<ImageDocument>): ImageDocument {
  return {
    id: 'doc-psd',
    title: 'Storyboard Comp',
    width: 10,
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
    name: 'Layer',
    type: 'image',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    x: 0,
    y: 0,
    bitmap: makeBitmap(2, 2, [12, 34, 56, 255]),
    bitmapVersion: 0,
    mask: null,
    ...overrides,
  };
}

describe('ImagePsdInterop', () => {
  beforeEach(() => {
    installCanvasStub();
  });

  it('exports Signal Loom raster layers into a PSD layer stack', () => {
    const bottom = makeLayer({
      id: 'bottom',
      name: 'Background Plate',
      x: 1,
      y: 2,
      blendMode: 'multiply',
      bitmap: makeBitmap(3, 2, [255, 0, 0, 255]),
    });
    const top = makeLayer({
      id: 'top',
      name: 'Character Paint',
      visible: false,
      opacity: 0.5,
      blendMode: 'screen',
      x: 4,
      y: 1,
      bitmap: makeBitmap(2, 3, [0, 0, 255, 128]),
    });

    const psd = buildPsdDocumentFromImageDocument(makeDoc({ layers: [bottom, top] }));

    expect(psd.width).toBe(10);
    expect(psd.height).toBe(8);
    expect(psd.children?.map((layer) => layer.name)).toEqual(['Character Paint', 'Background Plate']);
    expect(psd.children?.[0]).toMatchObject({
      left: 4,
      top: 1,
      right: 6,
      bottom: 4,
      opacity: 0.5,
      hidden: true,
      blendMode: 'screen',
    });
    expect(psd.children?.[1]).toMatchObject({
      left: 1,
      top: 2,
      right: 4,
      bottom: 4,
      opacity: 1,
      hidden: false,
      blendMode: 'multiply',
    });
    expect(psd.children?.[1].imageData?.data[0]).toBe(255);
    expect(readSignalLoomPsdMetadata(psd).layers.map((layer) => layer.name)).toEqual(['Background Plate', 'Character Paint']);
  });

  it('preserves Signal Loom text, source-link, and adjustment metadata on PSD model roundtrip', () => {
    const textLayer = makeLayer({
      id: 'text',
      name: 'Caption',
      type: 'text',
      text: {
        content: 'Hello',
        fontFamily: 'Inter',
        fontSize: 24,
        fontWeight: '700',
        fontStyle: 'italic',
        letterSpacing: 1,
        boxWidth: 120,
        boxHeight: 60,
        wrap: true,
        color: '#ffffff',
        lineHeight: 1.2,
        align: 'center',
        verticalAlign: 'middle',
        warp: 'arc',
      },
      metadata: { editableText: true, smartLinkedSourceId: 'src-1', sourceLabel: 'Panel', sourceLink: { id: 'src-1', label: 'Panel', width: 2, height: 2, status: 'linked', relinkHistory: [] } },
    });
    const adjustment = makeLayer({
      id: 'adjust',
      name: 'Blue Curve',
      type: 'adjustment',
      bitmap: null,
      adjustment: { kind: 'curves', channel: 'blue', points: [{ input: 0, output: 0 }, { input: 128, output: 180 }, { input: 255, output: 255 }], shadows: 0, midtones: 0, highlights: 0 },
    });
    const psd = buildPsdDocumentFromImageDocument(makeDoc({ layers: [textLayer, adjustment] }));

    expect((psd as unknown as Record<string, unknown>)[SIGNAL_LOOM_PSD_METADATA_KEY]).toBeTruthy();
    const imported = psdDocumentToImageDocument(psd, { id: 'roundtrip', title: 'Roundtrip' });
    expect(imported.layers[0].text?.boxWidth).toBe(120);
    expect(imported.layers[0].metadata?.sourceLink?.status).toBe('linked');
    expect(readSignalLoomPsdMetadata(psd).layers[1].adjustment).toMatchObject({ kind: 'curves', channel: 'blue' });
  });

  it('detects PSB and reports a large-document unsupported message', () => {
    const psb = new Uint8Array([0x38, 0x42, 0x50, 0x53, 0, 2, 0, 0]).buffer;

    expect(detectPhotoshopDocumentKind(psb)).toBe('psb');
    expect(() => psdArrayBufferToImageDocument(psb, { id: 'psb', title: 'Large' })).toThrow(/PSB large-document/);
  });

  it('imports PSD layers back into bottom-to-top Image workspace order', () => {
    const psd: Psd = {
      width: 16,
      height: 9,
      children: [
        {
          name: 'Top Line Art',
          left: 3,
          top: 1,
          right: 5,
          bottom: 3,
          opacity: 0.75,
          hidden: true,
          blendMode: 'screen',
          imageData: makePsdImageData(2, 2, [0, 0, 0, 255]),
        },
        {
          name: 'Bottom Color',
          left: 0,
          top: 2,
          right: 4,
          bottom: 4,
          opacity: 1,
          hidden: false,
          blendMode: 'multiply',
          imageData: makePsdImageData(4, 2, [255, 32, 16, 255]),
        },
      ],
    };

    const doc = psdDocumentToImageDocument(psd, {
      id: 'imported-psd',
      title: 'Imported Board',
    });

    expect(doc).toMatchObject({
      id: 'imported-psd',
      title: 'Imported Board',
      width: 16,
      height: 9,
      activeLayerId: 'imported-psd-layer-1',
    });
    expect(doc.layers.map((layer) => layer.name)).toEqual(['Bottom Color', 'Top Line Art']);
    expect(doc.layers[0]).toMatchObject({
      id: 'imported-psd-layer-0',
      x: 0,
      y: 2,
      visible: true,
      opacity: 1,
      blendMode: 'multiply',
    });
    expect(doc.layers[1]).toMatchObject({
      id: 'imported-psd-layer-1',
      x: 3,
      y: 1,
      visible: false,
      opacity: 0.75,
      blendMode: 'screen',
    });
    expect(doc.layers[1].bitmap?.width).toBe(2);
    expect(doc.layers[1].bitmap?.height).toBe(2);
  });

  it('serializes the active document as a Photoshop PSD blob', async () => {
    const blob = await imageDocumentToPsdBlob(makeDoc({
      layers: [makeLayer({ name: 'Paint Layer' })],
    }));

    expect(blob.type).toBe(IMAGE_PSD_MIME_TYPE);
    expect(blob.size).toBeGreaterThan(100);
  });
});

function makePsdImageData(width: number, height: number, fill: [number, number, number, number]): PsdLayer['imageData'] {
  return makeImageData(width, height, fill);
}
