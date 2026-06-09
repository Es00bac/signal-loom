import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LayerBitmap } from '../../types/imageEditor';
import {
  decodeTiffToImageData,
  detectSourceImageFormatPolicy,
  encodeImageDataToTiff,
  isAnimatedGif,
  createSvgImageDocument,
} from './ImageFileFormats';

class FakeContext {
  drawn: unknown[] = [];
  imageData: ImageData | null = null;

  drawImage(image: unknown) {
    this.drawn.push(image);
  }

  putImageData(imageData: ImageData) {
    this.imageData = imageData;
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
}

function makeImageData(width: number, height: number, data: number[]): ImageData {
  return { width, height, data: new Uint8ClampedArray(data) } as ImageData;
}

describe('ImageFileFormats', () => {
  beforeEach(() => {
    globalThis.OffscreenCanvas = FakeOffscreenCanvas as unknown as typeof OffscreenCanvas;
    globalThis.createImageBitmap = vi.fn(async () => ({
      width: 32,
      height: 16,
      close: vi.fn(),
    })) as unknown as typeof createImageBitmap;
  });

  it('encodes and decodes uncompressed 8-bit RGBA TIFF data', () => {
    const input = makeImageData(2, 1, [255, 0, 0, 255, 0, 128, 255, 64]);
    const encoded = encodeImageDataToTiff(input);
    const decoded = decodeTiffToImageData(copyToArrayBuffer(encoded));

    expect(encoded[0]).toBe(0x49);
    expect(decoded.width).toBe(2);
    expect(decoded.height).toBe(1);
    expect([...decoded.data]).toEqual([...input.data]);
  });

  it('reports unsupported TIFF compression clearly', () => {
    const input = makeImageData(1, 1, [1, 2, 3, 4]);
    const encoded = encodeImageDataToTiff(input);
    const view = new DataView(encoded.buffer);
    const compressionEntry = 8 + 2 + 3 * 12;
    view.setUint16(compressionEntry + 8, 5, true);

    expect(() => decodeTiffToImageData(copyToArrayBuffer(encoded))).toThrow(/compressed TIFF/);
  });

  it('detects SVG, animated GIF, PSB, XCF, and EXR policies', () => {
    const psb = new Uint8Array([0x38, 0x42, 0x50, 0x53, 0, 2]);
    const gif = new Uint8Array([71, 73, 70, 56, 57, 97, 0, 0, 0, 0, 0, 0, 0, 0x2c, 0, 0x2c]);

    expect(detectSourceImageFormatPolicy({ fileName: 'icon.svg', bytes: new TextEncoder().encode('<svg />') })).toEqual({ kind: 'svg' });
    expect(detectSourceImageFormatPolicy({ fileName: 'large.psb', bytes: psb })).toMatchObject({ kind: 'psb' });
    expect(detectSourceImageFormatPolicy({ fileName: 'gimp.xcf' })).toMatchObject({ kind: 'xcf' });
    expect(detectSourceImageFormatPolicy({ fileName: 'linear.exr' })).toMatchObject({ kind: 'exr' });
    expect(isAnimatedGif(gif)).toBe(true);
    expect(detectSourceImageFormatPolicy({ fileName: 'loop.gif', bytes: gif })).toMatchObject({
      kind: 'gif',
      animated: true,
      warning: expect.stringMatching(/first frame/),
    });
  });

  it('rasterizes SVG into a document while retaining original SVG source metadata', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="16"><rect width="32" height="16" /></svg>';
    const doc = await createSvgImageDocument(svg, {
      id: 'doc-svg',
      title: 'Icon',
      sourceBinItemId: 'source-svg',
      sourceLabel: 'Icon.svg',
      sourceMimeType: 'image/svg+xml',
    });

    expect(doc.width).toBe(32);
    expect(doc.height).toBe(16);
    expect(doc.metadata).toMatchObject({ sourceFormat: 'SVG', sourceMimeType: 'image/svg+xml' });
    expect(doc.layers[0].bitmap).toMatchObject({ width: 32, height: 16 } satisfies Partial<LayerBitmap>);
    expect(doc.layers[0].metadata).toMatchObject({
      sourceFormat: 'SVG',
      originalSvgSource: svg,
      smartLinkedSourceId: 'source-svg',
    });
  });
});

function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}
