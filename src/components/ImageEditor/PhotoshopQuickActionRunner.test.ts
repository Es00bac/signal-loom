import { beforeEach, describe, expect, it } from 'vitest';
import type { ImageDocument, ImageLayer, LayerBitmap } from '../../types/imageEditor';
import { useImageEditorStore } from '../../store/imageEditorStore';
import { createMask, setRect } from './SelectionMask';
import { getSelection, setSelection, clearAllSelections } from './selectionRegistry';
import { runPhotoshopQuickAction } from './PhotoshopQuickActionRunner';

class FakeContext {
  imageData: ImageData;

  constructor(width: number, height: number) {
    this.imageData = makeImageData(width, height);
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
    this.context = new FakeContext(width, height);
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
    globalThis.createImageBitmap = async () => {
      return {
        width: 10,
        height: 12,
        close() {},
      } as unknown as ImageBitmap;
    };
}

function makeDoc(layer: ImageLayer): ImageDocument {
  return {
    id: 'doc-1',
    title: 'doc',
    width: 8,
    height: 6,
    layers: [layer],
    activeLayerId: layer.id,
    hasSelection: false,
    selectionVersion: 0,
    viewport: { zoom: 1, panX: 0, panY: 0 },
    dirty: false,
  };
}

function makeLayer(): ImageLayer {
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
  };
}

function setPixel(bitmap: LayerBitmap, x: number, y: number, rgba: [number, number, number, number]) {
  const data = (bitmap as unknown as FakeOffscreenCanvas).context.imageData.data;
  data.set(rgba, (y * bitmap.width + x) * 4);
}

function rgbaAt(bitmap: LayerBitmap, x: number, y: number): number[] {
  const data = (bitmap as unknown as FakeOffscreenCanvas).context.imageData.data;
  return Array.from(data.slice((y * bitmap.width + x) * 4, (y * bitmap.width + x) * 4 + 4));
}

describe('PhotoshopQuickActionRunner', () => {
  beforeEach(() => {
    installCanvasStub();
    clearAllSelections();
    const layer = makeLayer();
    setPixel(layer.bitmap as LayerBitmap, 1, 1, [0, 255, 0, 255]);
    const doc = makeDoc(layer);
    useImageEditorStore.setState({
      documents: [doc],
      activeDocId: doc.id,
      undoStacks: {},
      redoStacks: {},
    });
  });

  it('runs selection actions against the active document and tracks history', () => {
    const ok = runPhotoshopQuickAction('selectLayerOpaquePixels');

    const state = useImageEditorStore.getState();
    expect(ok).toBe(true);
    expect(state.documents[0].hasSelection).toBe(true);
    expect(getSelection('doc-1')?.data[2 * 8 + 3]).toBe(255);
    expect(state.undoStacks['doc-1']?.[0]?.kind).toBe('selection');
  });

  it('runs layer quick actions through undoable store operations', () => {
    const selection = createMask(8, 6);
    setRect(selection, 3, 2, 1, 1, 255, false);
    setSelection('doc-1', selection);
    useImageEditorStore.getState().setHasSelection('doc-1', true);

    expect(runPhotoshopQuickAction('layerViaCopy', { createLayerId: () => 'copied-layer' })).toBe(true);
    expect(runPhotoshopQuickAction('resetLayerPosition')).toBe(true);

    const state = useImageEditorStore.getState();
    const doc = state.documents[0];
    const copiedLayer = doc.layers.find((layer) => layer.id === 'copied-layer');

    expect(doc.layers.some((layer) => layer.id === 'copied-layer')).toBe(true);
    expect(copiedLayer?.x).toBe(0);
    expect(copiedLayer?.y).toBe(0);
    expect(state.undoStacks['doc-1']?.map((op) => op.kind)).toEqual([
      'layerOp',
      'transform',
    ]);
  });

  it('runs paint and canvas quick actions through undoable store operations', () => {
    const selection = createMask(8, 6);
    setRect(selection, 3, 2, 1, 1, 255, false);
    setSelection('doc-1', selection);
    useImageEditorStore.getState().setHasSelection('doc-1', true);

    expect(runPhotoshopQuickAction('clearOutsideSelection')).toBe(true);
    expect(runPhotoshopQuickAction('resetLayerPosition')).toBe(true);
    expect(runPhotoshopQuickAction('trimCanvasToVisible')).toBe(true);

    const state = useImageEditorStore.getState();
    const doc = state.documents[0];
    const sourceLayer = doc.layers.find((layer) => layer.id === 'layer-1');

    expect(sourceLayer?.x).toBe(-1);
    expect(sourceLayer?.y).toBe(-1);
    expect(sourceLayer?.bitmap ? rgbaAt(sourceLayer.bitmap, 0, 0)[3] : 255).toBe(0);
    expect(doc.width).toBe(1);
    expect(doc.height).toBe(1);
    expect(state.undoStacks['doc-1']?.map((op) => op.kind)).toEqual([
      'paint',
      'transform',
      'docResize',
    ]);
  });

  it('runs newly added selection, ordering, and color actions from the shared runner', () => {
    expect(runPhotoshopQuickAction('selectCanvas')).toBe(true);
    expect(runPhotoshopQuickAction('duplicateLayer', { createLayerId: () => 'duplicate-layer' })).toBe(true);
    expect(runPhotoshopQuickAction('moveLayerToBack')).toBe(true);
    expect(runPhotoshopQuickAction('desaturateLayer')).toBe(true);

    const state = useImageEditorStore.getState();
    const doc = state.documents[0];

    expect(doc.hasSelection).toBe(true);
    expect(getSelection(doc.id)?.data.every((value) => value === 255)).toBe(true);
    expect(doc.layers[0].id).toBe('duplicate-layer');
    expect(state.undoStacks[doc.id]?.map((op) => op.kind)).toEqual([
      'selection',
      'layerOp',
      'layerOp',
      'paint',
    ]);
  });

  it('regenerates vector layers after a scale quick action is run', async () => {
    const fakeBitmap = new OffscreenCanvas(4, 4);
    const layer: ImageLayer = {
      id: 'vector-layer',
      name: 'Vector',
      type: 'vector',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      x: 0,
      y: 0,
      bitmap: fakeBitmap,
      bitmapVersion: 0,
      mask: null,
      metadata: {
        originalSvgSource: '<svg>circle</svg>',
      },
    };

    const doc = useImageEditorStore.getState().documents[0];
    const updatedLayers = [layer, ...doc.layers];
    useImageEditorStore.getState().setLayers(doc.id, updatedLayers, 'vector-layer');

    // Run scaleLayer50Percent
    const ok = runPhotoshopQuickAction('scaleLayer50Percent');
    expect(ok).toBe(true);

    // Let any pending promises/microtasks flush
    await new Promise((resolve) => setTimeout(resolve, 50));

    const state = useImageEditorStore.getState();
    const finalDoc = state.documents[0];
    const vectorLayer = finalDoc.layers.find((l) => l.id === 'vector-layer')!;

    // The vector layer's bitmap should have been scaled to 50% (2x2) and then regenerated
    expect(vectorLayer.bitmap).not.toBeNull();
    expect(vectorLayer.bitmap!.width).toBe(2);
    expect(vectorLayer.bitmap!.height).toBe(2);
  });
});
