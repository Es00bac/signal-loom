import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImageLayer, LayerBitmap } from '../../types/imageEditor';
import type { SourceBinLibraryItem } from '../../store/sourceBinStore';
import {
  createImageDocumentFromFile,
  createImageDocumentFromSourceItem,
  createSourceBackedImageDocumentShell,
  loadSourceLinkedLayerBitmap,
  replaceSourceLinkedLayerBitmap,
} from './ImageSourceDocument';

class FakeContext {
  drawImage() {}
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

function imageItem(): SourceBinLibraryItem {
  return {
    id: 'cover-art',
    label: 'Cover Art',
    kind: 'image',
    mimeType: 'image/png',
    assetUrl: 'data:image/png;base64,test',
    createdAt: 1,
  };
}

describe('ImageSourceDocument', () => {
  beforeEach(() => {
    globalThis.OffscreenCanvas = FakeOffscreenCanvas as unknown as typeof OffscreenCanvas;
    globalThis.createImageBitmap = vi.fn(async () => ({
      width: 48,
      height: 27,
      close: vi.fn(),
    })) as unknown as typeof createImageBitmap;
  });

  it('creates a source-backed shell for lazy image loading fallbacks', () => {
    const doc = createSourceBackedImageDocumentShell(imageItem());

    expect(doc).toMatchObject({
      id: 'doc-cover-art',
      title: 'Cover Art',
      width: 800,
      height: 600,
      sourceBinItemId: 'cover-art',
      activeLayerId: null,
    });
    expect(doc.layers).toHaveLength(0);
  });

  it('loads source-bin image assets into an editable image layer when a bitmap is available', async () => {
    const bitmap = { width: 320, height: 180 } as LayerBitmap;
    const doc = await createImageDocumentFromSourceItem(imageItem(), {
      loadBitmap: async () => bitmap,
    });

    expect(doc).toMatchObject({
      id: 'doc-cover-art',
      title: 'Cover Art',
      width: 320,
      height: 180,
      activeLayerId: 'layer-cover-art',
      sourceBinItemId: 'cover-art',
    });
    expect(doc.layers).toHaveLength(1);
    expect(doc.layers[0]).toMatchObject({
      id: 'layer-cover-art',
      name: 'Cover Art',
      type: 'image',
      bitmap,
    });
    expect(doc.layers[0].metadata).toEqual({
      smartLinkedSourceId: 'cover-art',
      sourceLabel: 'Cover Art',
      sourceLink: {
        id: 'cover-art',
        label: 'Cover Art',
        width: 320,
        height: 180,
        status: 'linked',
        relinkHistory: [],
      },
    });
  });

  it('updates source-linked layer bitmaps while preserving transforms, masks, effects, and filters', () => {
    const replacement = { width: 640, height: 360 } as LayerBitmap;
    const mask = { width: 12, height: 12 } as LayerBitmap;
    const layer = {
      id: 'layer-cover-art',
      name: 'Panel placement',
      type: 'image',
      visible: true,
      locked: false,
      opacity: 0.75,
      blendMode: 'multiply',
      x: 25,
      y: 40,
      rotationDeg: 15,
      bitmap: { width: 320, height: 180 } as LayerBitmap,
      bitmapVersion: 2,
      mask,
      effects: [{ id: 'fx-1', kind: 'stroke', enabled: true, color: '#fff', opacity: 1, size: 4, position: 'outside' }],
      filters: [{ id: 'filter-1', kind: 'blur', enabled: true, amount: 2 }],
      metadata: { smartLinkedSourceId: 'cover-art', sourceLabel: 'Cover Art' },
    } satisfies ImageLayer;

    const updated = replaceSourceLinkedLayerBitmap(layer, { ...imageItem(), label: 'Cover Art v2' }, replacement);

    expect(updated.bitmap).toBe(replacement);
    expect(updated.bitmapVersion).toBe(3);
    expect(updated.x).toBe(25);
    expect(updated.y).toBe(40);
    expect(updated.rotationDeg).toBe(15);
    expect(updated.mask).toBe(mask);
    expect(updated.effects).toBe(layer.effects);
    expect(updated.filters).toBe(layer.filters);
    expect(updated.metadata).toEqual({
      smartLinkedSourceId: 'cover-art',
      sourceLabel: 'Cover Art v2',
      sourceLink: {
        id: 'cover-art',
        label: 'Cover Art v2',
        width: 640,
        height: 360,
        status: 'linked',
        relinkHistory: [],
      },
    });
  });

  it('records relink history when a smart layer is relinked to a new source', () => {
    const replacement = { width: 64, height: 64 } as LayerBitmap;
    const layer = {
      id: 'smart',
      name: 'Smart',
      type: 'image',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      x: 0,
      y: 0,
      bitmap: { width: 32, height: 32 } as LayerBitmap,
      bitmapVersion: 0,
      mask: null,
      metadata: { smartLinkedSourceId: 'old', sourceLabel: 'Old', sourceLink: { id: 'old', label: 'Old', width: 32, height: 32, status: 'linked', relinkHistory: [] } },
    } satisfies ImageLayer;

    const updated = replaceSourceLinkedLayerBitmap(layer, { ...imageItem(), id: 'new', label: 'New' }, replacement);

    expect(updated.metadata?.sourceLink?.status).toBe('relinked');
    expect(updated.metadata?.sourceLink?.relinkHistory).toEqual([{ sourceId: 'old', label: 'Old', at: expect.any(Number) }]);
  });

  it('loads replacement bitmaps only from image source-bin items with asset URLs', async () => {
    const bitmap = { width: 640, height: 360 } as LayerBitmap;
    await expect(loadSourceLinkedLayerBitmap(imageItem(), async () => bitmap)).resolves.toBe(bitmap);
    await expect(loadSourceLinkedLayerBitmap({ ...imageItem(), assetUrl: undefined })).rejects.toThrow(
      /image Source Bin item/,
    );
  });

  it('opens a local raster file into a single editable layer document', async () => {
    const file = new File([new Uint8Array([137, 80, 78, 71])], 'Cover Panel.png', { type: 'image/png' });

    const doc = await createImageDocumentFromFile(file, { id: 'local-cover-panel' });

    expect(doc).toMatchObject({
      id: 'local-cover-panel',
      title: 'Cover Panel',
      width: 48,
      height: 27,
      activeLayerId: 'local-cover-panel-layer-0',
      metadata: { sourceMimeType: 'image/png' },
    });
    expect(doc.layers).toHaveLength(1);
    expect(doc.layers[0]).toMatchObject({
      id: 'local-cover-panel-layer-0',
      name: 'Cover Panel.png',
      type: 'image',
      metadata: {
        sourceLabel: 'Cover Panel.png',
        sourceMimeType: 'image/png',
      },
    });
  });

  it('rejects local PSD files through the generic image opener with a dedicated-open message', async () => {
    const psd = new File([new Uint8Array([0x38, 0x42, 0x50, 0x53, 0, 1])], 'Layered.psd', {
      type: 'image/vnd.adobe.photoshop',
    });

    await expect(createImageDocumentFromFile(psd)).rejects.toThrow(/Open PSD control/);
  });
});
