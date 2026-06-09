import { beforeEach, describe, expect, it } from 'vitest';
import type { ImageDocument, ImageLayer, LayerBitmap } from '../../types/imageEditor';
import { imageDocumentToXcfBlob, IMAGE_XCF_MIME_TYPE } from './ImageXcfInterop';

class FakeContext {
  imageData: ImageData;

  constructor(width: number, height: number) {
    this.imageData = makeImageData(width, height, [0, 0, 0, 0]);
  }

  getImageData(_x = 0, _y = 0, width = this.imageData.width, height = this.imageData.height) {
    void _x;
    void _y;
    return makeImageData(width, height, [12, 34, 56, 255]);
  }

  createImageData(width: number, height: number) {
    return makeImageData(width, height, [0, 0, 0, 0]);
  }

  putImageData(imageData: ImageData) {
    this.imageData = imageData;
  }

  drawImage() {}
  clearRect() {}
  fillRect() {}
  save() {}
  restore() {}
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
}

function makeImageData(width: number, height: number, fill: [number, number, number, number]): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = fill[0];
    data[index + 1] = fill[1];
    data[index + 2] = fill[2];
    data[index + 3] = fill[3];
  }
  return { width, height, data } as ImageData;
}

function makeLayer(overrides?: Partial<ImageLayer>): ImageLayer {
  return {
    id: 'layer-1',
    name: 'Ink Layer',
    type: 'image',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    x: 0,
    y: 0,
    bitmap: new OffscreenCanvas(2, 2) as LayerBitmap,
    bitmapVersion: 0,
    mask: null,
    ...overrides,
  };
}

function makeDoc(overrides?: Partial<ImageDocument>): ImageDocument {
  return {
    id: 'doc-xcf',
    title: 'Storyboard',
    width: 2,
    height: 2,
    layers: [makeLayer()],
    activeLayerId: 'layer-1',
    hasSelection: false,
    selectionVersion: 0,
    viewport: { zoom: 1, panX: 0, panY: 0 },
    dirty: false,
    ...overrides,
  };
}

describe('ImageXcfInterop', () => {
  beforeEach(() => {
    globalThis.OffscreenCanvas = FakeOffscreenCanvas as unknown as typeof OffscreenCanvas;
  });

  it('serializes the active image document as a GIMP XCF blob with layer names', async () => {
    const blob = await imageDocumentToXcfBlob(makeDoc());
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const text = new TextDecoder().decode(bytes);

    expect(blob.type).toBe(IMAGE_XCF_MIME_TYPE);
    expect(text.startsWith('gimp xcf')).toBe(true);
    expect(text).toContain('Ink Layer');
  });
});
