import { describe, expect, it, beforeEach } from 'vitest';
import { createEmptyImageDocument, useImageEditorStore } from './imageEditorStore';
import {
  DEFAULT_BRUSH_SETTINGS,
  DEFAULT_SELECTION_TOOL_SETTINGS,
  DEFAULT_TEXT_TOOL_SETTINGS,
  type EditorOperation,
  type ImageLayer,
  type LayerBitmap,
} from '../types/imageEditor';

class FakeContext {
  drawImage() {}
}

class FakeOffscreenCanvas {
  width: number;
  height: number;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }
  getContext() {
    return new FakeContext();
  }
}

globalThis.OffscreenCanvas = FakeOffscreenCanvas as unknown as typeof OffscreenCanvas;

globalThis.createImageBitmap = async () => {
  return {
    width: 10,
    height: 12,
    close() {},
  } as unknown as ImageBitmap;
};

function makeLayer(overrides?: Partial<ImageLayer>): ImageLayer {


  return {
    id: 'layer-1',
    name: 'Background',
    type: 'image',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    x: 0,
    y: 0,
    bitmap: null,
    bitmapVersion: 0,
    mask: null,
    ...overrides,
  };
}

function resetStore() {
  useImageEditorStore.setState({
    documents: [],
    activeDocId: null,
    tool: 'move',
    brushSettings: { ...DEFAULT_BRUSH_SETTINGS },
    selectionToolSettings: { ...DEFAULT_SELECTION_TOOL_SETTINGS },
    textToolSettings: { ...DEFAULT_TEXT_TOOL_SETTINGS },
    viewportContainerSize: { width: 0, height: 0 },
    undoStacks: {},
    redoStacks: {},
  });
}

describe('imageEditorStore — documents', () => {
  beforeEach(resetStore);

  it('opens a document and makes it active', () => {
    const doc = createEmptyImageDocument({ id: 'doc-1', title: 'a.png', width: 800, height: 600 });
    useImageEditorStore.getState().openDocument(doc);
    const state = useImageEditorStore.getState();
    expect(state.documents).toHaveLength(1);
    expect(state.activeDocId).toBe('doc-1');
  });

  it('switches to existing doc instead of duplicating on re-open', () => {
    const doc = createEmptyImageDocument({ id: 'doc-1', title: 'a.png', width: 100, height: 100 });
    useImageEditorStore.getState().openDocument(doc);
    useImageEditorStore.getState().setActiveDocument('doc-1');
    useImageEditorStore.getState().openDocument(doc);
    expect(useImageEditorStore.getState().documents).toHaveLength(1);
  });

  it('closes a document and clears its history', () => {
    const doc = createEmptyImageDocument({ id: 'doc-1', title: 'a.png', width: 1, height: 1 });
    useImageEditorStore.getState().openDocument(doc);
    useImageEditorStore.getState().pushOperation({
      kind: 'selection',
      docId: 'doc-1',
      before: null,
      after: null,
    });
    useImageEditorStore.getState().closeDocument('doc-1');
    const state = useImageEditorStore.getState();
    expect(state.documents).toHaveLength(0);
    expect(state.activeDocId).toBeNull();
    expect(state.undoStacks['doc-1']).toBeUndefined();
  });

  it('closing the active doc switches to the last remaining', () => {
    const a = createEmptyImageDocument({ id: 'a', title: 'a', width: 1, height: 1 });
    const b = createEmptyImageDocument({ id: 'b', title: 'b', width: 1, height: 1 });
    useImageEditorStore.getState().openDocument(a);
    useImageEditorStore.getState().openDocument(b);
    useImageEditorStore.getState().closeDocument('b');
    expect(useImageEditorStore.getState().activeDocId).toBe('a');
  });

  it('renames a document', () => {
    const doc = createEmptyImageDocument({ id: 'doc-1', title: 'a', width: 1, height: 1 });
    useImageEditorStore.getState().openDocument(doc);
    useImageEditorStore.getState().setDocumentTitle('doc-1', 'renamed');
    expect(useImageEditorStore.getState().documents[0].title).toBe('renamed');
  });

  it('marks dirty / clean', () => {
    const doc = createEmptyImageDocument({ id: 'doc-1', title: 'a', width: 1, height: 1 });
    useImageEditorStore.getState().openDocument(doc);
    useImageEditorStore.getState().markDocumentDirty('doc-1');
    expect(useImageEditorStore.getState().documents[0].dirty).toBe(true);
    useImageEditorStore.getState().markDocumentClean('doc-1');
    expect(useImageEditorStore.getState().documents[0].dirty).toBe(false);
  });

  it('getActiveDocument returns the active doc', () => {
    const doc = createEmptyImageDocument({ id: 'doc-1', title: 'a', width: 1, height: 1 });
    useImageEditorStore.getState().openDocument(doc);
    expect(useImageEditorStore.getState().getActiveDocument()?.id).toBe('doc-1');
  });

  it('resizeDocumentPixels scales the document and records an undoable resize operation', () => {
    const doc = createEmptyImageDocument({ id: 'doc-1', title: 'a', width: 10, height: 20 });
    useImageEditorStore.getState().openDocument({
      ...doc,
      layers: [makeLayer({ id: 'l1', x: 5, y: 6 })],
      activeLayerId: 'l1',
    });

    useImageEditorStore.getState().resizeDocumentPixels('doc-1', 20, 40);

    const updated = useImageEditorStore.getState().getActiveDocument()!;
    expect(updated).toMatchObject({ width: 20, height: 40, dirty: true });
    expect(updated.layers[0]).toMatchObject({ x: 10, y: 12 });
    expect(useImageEditorStore.getState().undoStacks['doc-1'].at(-1)).toMatchObject({
      kind: 'docResize',
      before: { width: 10, height: 20 },
      after: { width: 20, height: 40 },
    });
  });

  it('resizeDocumentPixels on a vector layer triggers async high-res SVG rasterization', async () => {
    const doc = createEmptyImageDocument({ id: 'doc-vector', title: 'a', width: 10, height: 20 });
    const fakeBitmap = {
      width: 5,
      height: 6,
      getContext: () => ({
        drawImage: () => {},
      }),
    } as unknown as LayerBitmap;
    const layer = makeLayer({
      id: 'l-vector',
      type: 'vector',
      bitmap: fakeBitmap,
      metadata: {
        originalSvgSource: '<svg>vector</svg>',
      },
    });

    useImageEditorStore.getState().openDocument({
      ...doc,
      layers: [layer],
      activeLayerId: 'l-vector',
    });

    useImageEditorStore.getState().resizeDocumentPixels('doc-vector', 20, 40);

    // Let any pending promises/microtasks flush
    await new Promise((resolve) => setTimeout(resolve, 50));

    const updated = useImageEditorStore.getState().getActiveDocument()!;
    expect(updated.layers[0].type).toBe('vector');
    expect(updated.layers[0].bitmap).not.toBeNull();
    expect(updated.layers[0].bitmap!.width).toBe(10);
    expect(updated.layers[0].bitmap!.height).toBe(12);
  });


  it('resizeDocumentCanvas preserves pixels, offsets layers from the anchor, and records history', () => {
    const doc = createEmptyImageDocument({ id: 'doc-1', title: 'a', width: 10, height: 20 });
    useImageEditorStore.getState().openDocument({
      ...doc,
      layers: [makeLayer({ id: 'l1', x: 5, y: 6 })],
      activeLayerId: 'l1',
    });

    useImageEditorStore.getState().resizeDocumentCanvas('doc-1', 30, 60, 'center');

    const updated = useImageEditorStore.getState().getActiveDocument()!;
    expect(updated).toMatchObject({ width: 30, height: 60, dirty: true });
    expect(updated.layers[0]).toMatchObject({ x: 15, y: 26 });
    expect(useImageEditorStore.getState().undoStacks['doc-1'].at(-1)).toMatchObject({
      kind: 'docResize',
      before: { width: 10, height: 20 },
      after: { width: 30, height: 60 },
    });
  });
});

describe('imageEditorStore — tools and settings', () => {
  beforeEach(resetStore);

  it('sets the active tool', () => {
    useImageEditorStore.getState().setTool('brush');
    expect(useImageEditorStore.getState().tool).toBe('brush');
  });

  it('updates brush settings partially', () => {
    useImageEditorStore.getState().setBrushSettings({ size: 24 });
    const settings = useImageEditorStore.getState().brushSettings;
    expect(settings.size).toBe(24);
    expect(settings.opacity).toBe(DEFAULT_BRUSH_SETTINGS.opacity);
  });

  it('updates selection tool settings partially', () => {
    useImageEditorStore.getState().setSelectionToolSettings({ feather: 5, mode: 'add' });
    const settings = useImageEditorStore.getState().selectionToolSettings;
    expect(settings.feather).toBe(5);
    expect(settings.mode).toBe('add');
    expect(settings.antiAlias).toBe(DEFAULT_SELECTION_TOOL_SETTINGS.antiAlias);
  });
});

describe('imageEditorStore — selection + viewport', () => {
  beforeEach(resetStore);

  it('setHasSelection bumps selection version', () => {
    const doc = createEmptyImageDocument({ id: 'doc-1', title: 'a', width: 10, height: 10 });
    useImageEditorStore.getState().openDocument(doc);
    expect(useImageEditorStore.getState().getActiveDocument()?.selectionVersion).toBe(0);
    useImageEditorStore.getState().setHasSelection('doc-1', true);
    const updated = useImageEditorStore.getState().getActiveDocument()!;
    expect(updated.hasSelection).toBe(true);
    expect(updated.selectionVersion).toBe(1);
  });

  it('bumpSelectionVersion increments without changing hasSelection', () => {
    const doc = createEmptyImageDocument({ id: 'doc-1', title: 'a', width: 10, height: 10 });
    useImageEditorStore.getState().openDocument(doc);
    useImageEditorStore.getState().setHasSelection('doc-1', true);
    useImageEditorStore.getState().bumpSelectionVersion('doc-1');
    const updated = useImageEditorStore.getState().getActiveDocument()!;
    expect(updated.selectionVersion).toBe(2);
    expect(updated.hasSelection).toBe(true);
  });

  it('setViewport patches the active doc viewport', () => {
    const doc = createEmptyImageDocument({ id: 'doc-1', title: 'a', width: 10, height: 10 });
    useImageEditorStore.getState().openDocument(doc);
    useImageEditorStore.getState().setViewport('doc-1', { zoom: 2 });
    const v = useImageEditorStore.getState().getActiveDocument()!.viewport;
    expect(v.zoom).toBe(2);
    expect(v.panX).toBe(0);
  });

  it('does not emit document changes for unchanged viewport patches', () => {
    const doc = createEmptyImageDocument({ id: 'doc-1', title: 'a', width: 10, height: 10 });
    useImageEditorStore.getState().openDocument(doc);
    const before = useImageEditorStore.getState();
    const notifications: Array<ReturnType<typeof useImageEditorStore.getState>> = [];
    const unsubscribe = useImageEditorStore.subscribe((state) => {
      notifications.push(state);
    });

    try {
      before.setViewport('doc-1', { zoom: doc.viewport.zoom, panX: doc.viewport.panX });
    } finally {
      unsubscribe();
    }

    const after = useImageEditorStore.getState();
    expect(after.documents).toBe(before.documents);
    expect(notifications).toHaveLength(0);
  });

  it('tracks the image canvas viewport container size', () => {
    useImageEditorStore.getState().setViewportContainerSize({ width: 640, height: 360 });
    expect(useImageEditorStore.getState().viewportContainerSize).toEqual({
      width: 640,
      height: 360,
    });
  });
});

describe('imageEditorStore — layers', () => {
  beforeEach(resetStore);

  function setupDoc() {
    const doc = createEmptyImageDocument({ id: 'doc-1', title: 'a', width: 10, height: 10 });
    useImageEditorStore.getState().openDocument(doc);
  }

  it('addLayer appends and activates by default', () => {
    setupDoc();
    useImageEditorStore.getState().addLayer('doc-1', makeLayer({ id: 'l1' }));
    useImageEditorStore.getState().addLayer('doc-1', makeLayer({ id: 'l2' }));
    const d = useImageEditorStore.getState().getActiveDocument()!;
    expect(d.layers.map((l) => l.id)).toEqual(['l1', 'l2']);
    expect(d.activeLayerId).toBe('l2');
    expect(d.dirty).toBe(true);
  });

  it('addLayer respects index', () => {
    setupDoc();
    useImageEditorStore.getState().addLayer('doc-1', makeLayer({ id: 'l1' }));
    useImageEditorStore.getState().addLayer('doc-1', makeLayer({ id: 'l2' }));
    useImageEditorStore.getState().addLayer('doc-1', makeLayer({ id: 'l3' }), 1);
    const d = useImageEditorStore.getState().getActiveDocument()!;
    expect(d.layers.map((l) => l.id)).toEqual(['l1', 'l3', 'l2']);
  });

  it('removeLayer reassigns activeLayerId to the previous top', () => {
    setupDoc();
    useImageEditorStore.getState().addLayer('doc-1', makeLayer({ id: 'l1' }));
    useImageEditorStore.getState().addLayer('doc-1', makeLayer({ id: 'l2' }));
    useImageEditorStore.getState().removeLayer('doc-1', 'l2');
    expect(useImageEditorStore.getState().getActiveDocument()!.activeLayerId).toBe('l1');
  });

  it('removeLayer clears activeLayerId when last layer is removed', () => {
    setupDoc();
    useImageEditorStore.getState().addLayer('doc-1', makeLayer({ id: 'l1' }));
    useImageEditorStore.getState().removeLayer('doc-1', 'l1');
    expect(useImageEditorStore.getState().getActiveDocument()!.activeLayerId).toBeNull();
  });

  it('duplicateLayer inserts above the source and activates the copy', () => {
    setupDoc();
    useImageEditorStore.getState().addLayer('doc-1', makeLayer({ id: 'l1', name: 'Bg' }));
    useImageEditorStore.getState().addLayer('doc-1', makeLayer({ id: 'l2' }));
    useImageEditorStore.getState().duplicateLayer('doc-1', 'l1');
    const d = useImageEditorStore.getState().getActiveDocument()!;
    expect(d.layers).toHaveLength(3);
    expect(d.layers[0].id).toBe('l1');
    expect(d.layers[1].id).toMatch(/^l1-copy-/);
    expect(d.layers[1].name).toBe('Bg copy');
    expect(d.activeLayerId).toBe(d.layers[1].id);
  });

  it('duplicateLayer clones mutable bitmap and mask buffers instead of sharing them', () => {
    setupDoc();
    const bitmap = new OffscreenCanvas(8, 6) as LayerBitmap;
    const mask = new OffscreenCanvas(8, 6) as LayerBitmap;
    useImageEditorStore.getState().addLayer('doc-1', makeLayer({ id: 'l1', bitmap, mask }));

    useImageEditorStore.getState().duplicateLayer('doc-1', 'l1');

    const [original, copy] = useImageEditorStore.getState().getActiveDocument()!.layers;
    expect(copy.bitmap).not.toBe(original.bitmap);
    expect(copy.bitmap).toMatchObject({ width: 8, height: 6 });
    expect(copy.mask).not.toBe(original.mask);
    expect(copy.mask).toMatchObject({ width: 8, height: 6 });
  });

  it('exportProjectSnapshot preserves editable Image metadata and lightweight snapshots without runtime pixels', () => {
    setupDoc();
    const bitmap = new OffscreenCanvas(8, 6) as LayerBitmap;
    const mask = new OffscreenCanvas(8, 6) as LayerBitmap;
    const layer = makeLayer({
      id: 'vector-1',
      type: 'vector',
      bitmap,
      mask,
      metadata: {
        originalSvgSource: '<svg><text>Bang</text></svg>',
        smartLinkedSourceId: 'source-1',
        sourceLink: {
          id: 'source-1',
          label: 'Panel.svg',
          width: 8,
          height: 6,
          status: 'linked',
          relinkHistory: [],
        },
      },
      vectorRecipe: '<svg><text>Bang</text></svg>',
    });
    useImageEditorStore.setState({
      documents: [{
        ...createEmptyImageDocument({ id: 'doc-1', title: 'a', width: 10, height: 10, sourceBinItemId: 'source-1' }),
        layers: [layer],
        activeLayerId: 'vector-1',
        snapshots: [{
          id: 'snapshot-1',
          name: 'Before edits',
          createdAt: 10,
          width: 10,
          height: 10,
          layers: [layer],
          activeLayerId: 'vector-1',
          hasSelection: false,
          selectionVersion: 0,
        }],
      }],
      activeDocId: 'doc-1',
    });

    const snapshot = useImageEditorStore.getState().exportProjectSnapshot();

    expect(snapshot.documents[0].sourceBinItemId).toBe('source-1');
    expect(snapshot.documents[0].layers[0]).toMatchObject({
      id: 'vector-1',
      type: 'vector',
      bitmap: null,
      mask: null,
      metadata: {
        smartLinkedSourceId: 'source-1',
        sourceLink: { id: 'source-1', label: 'Panel.svg', status: 'linked' },
      },
      vectorRecipe: '<svg><text>Bang</text></svg>',
    });
    expect(snapshot.documents[0].snapshots).toHaveLength(1);
    expect(snapshot.documents[0].snapshots?.[0].layers[0]).toMatchObject({
      id: 'vector-1',
      type: 'vector',
      bitmap: null,
      mask: null,
      vectorRecipe: '<svg><text>Bang</text></svg>',
    });
  });

  it('updateLayer patches a single layer', () => {
    setupDoc();
    useImageEditorStore.getState().addLayer('doc-1', makeLayer({ id: 'l1' }));
    useImageEditorStore.getState().updateLayer('doc-1', 'l1', { opacity: 0.5, visible: false });
    const layer = useImageEditorStore.getState().getActiveDocument()!.layers[0];
    expect(layer.opacity).toBe(0.5);
    expect(layer.visible).toBe(false);
  });

  it('does not mark the document dirty or emit when a layer patch is unchanged', () => {
    const doc = createEmptyImageDocument({ id: 'doc-1', title: 'a', width: 10, height: 10 });
    useImageEditorStore.setState({
      documents: [{
        ...doc,
        layers: [makeLayer({ id: 'l1', opacity: 1 })],
        activeLayerId: 'l1',
        dirty: false,
      }],
      activeDocId: 'doc-1',
    });
    const before = useImageEditorStore.getState();
    const notifications: Array<ReturnType<typeof useImageEditorStore.getState>> = [];
    const unsubscribe = useImageEditorStore.subscribe((state) => {
      notifications.push(state);
    });

    try {
      before.updateLayer('doc-1', 'l1', { opacity: 1 });
    } finally {
      unsubscribe();
    }

    const after = useImageEditorStore.getState();
    expect(after.documents).toBe(before.documents);
    expect(after.getActiveDocument()!.dirty).toBe(false);
    expect(notifications).toHaveLength(0);
  });

  it('bumpLayerBitmapVersion invalidates in-place bitmap edits', () => {
    setupDoc();
    useImageEditorStore.getState().addLayer('doc-1', makeLayer({ id: 'l1' }));
    useImageEditorStore.getState().bumpLayerBitmapVersion('doc-1', 'l1');
    useImageEditorStore.getState().bumpLayerBitmapVersion('doc-1', 'l1');
    const layer = useImageEditorStore.getState().getActiveDocument()!.layers[0];
    expect(layer.bitmapVersion).toBe(2);
  });

  it('reorderLayer moves to new index', () => {
    setupDoc();
    useImageEditorStore.getState().addLayer('doc-1', makeLayer({ id: 'l1' }));
    useImageEditorStore.getState().addLayer('doc-1', makeLayer({ id: 'l2' }));
    useImageEditorStore.getState().addLayer('doc-1', makeLayer({ id: 'l3' }));
    useImageEditorStore.getState().reorderLayer('doc-1', 'l1', 2);
    const order = useImageEditorStore.getState().getActiveDocument()!.layers.map((l) => l.id);
    expect(order).toEqual(['l2', 'l3', 'l1']);
  });

  it('setActiveLayer changes activeLayerId without mutating layers', () => {
    setupDoc();
    useImageEditorStore.getState().addLayer('doc-1', makeLayer({ id: 'l1' }));
    useImageEditorStore.getState().addLayer('doc-1', makeLayer({ id: 'l2' }));
    useImageEditorStore.getState().setActiveLayer('doc-1', 'l1');
    expect(useImageEditorStore.getState().getActiveDocument()!.activeLayerId).toBe('l1');
  });
});

describe('imageEditorStore — undo/redo log', () => {
  beforeEach(resetStore);

  const op: EditorOperation = {
    kind: 'transform',
    docId: 'doc-1',
    layerId: 'l1',
    before: { x: 0, y: 0 },
    after: { x: 10, y: 20 },
  };

  it('pushOperation adds to undo stack and clears redo', () => {
    useImageEditorStore.getState().pushOperation(op);
    const state = useImageEditorStore.getState();
    expect(state.undoStacks['doc-1']).toHaveLength(1);
    expect(state.redoStacks['doc-1']).toEqual([]);
  });

  it('popUndo returns the latest op and moves it to redo', () => {
    useImageEditorStore.getState().pushOperation(op);
    const popped = useImageEditorStore.getState().popUndo('doc-1');
    expect(popped).toEqual(op);
    expect(useImageEditorStore.getState().redoStacks['doc-1']).toHaveLength(1);
  });

  it('popRedo moves the op back onto undo', () => {
    useImageEditorStore.getState().pushOperation(op);
    useImageEditorStore.getState().popUndo('doc-1');
    const redone = useImageEditorStore.getState().popRedo('doc-1');
    expect(redone).toEqual(op);
    expect(useImageEditorStore.getState().undoStacks['doc-1']).toHaveLength(1);
  });

  it('pushOperation after a popUndo clears redo (redo branch is destroyed)', () => {
    useImageEditorStore.getState().pushOperation(op);
    useImageEditorStore.getState().popUndo('doc-1');
    expect(useImageEditorStore.getState().redoStacks['doc-1']).toHaveLength(1);
    useImageEditorStore.getState().pushOperation({ ...op, after: { x: 99, y: 99 } });
    expect(useImageEditorStore.getState().redoStacks['doc-1']).toEqual([]);
  });

  it('undo stack capped at 50 entries', () => {
    for (let i = 0; i < 60; i += 1) {
      useImageEditorStore.getState().pushOperation({
        ...op,
        before: { x: i, y: 0 },
        after: { x: i + 1, y: 0 },
      });
    }
    const stack = useImageEditorStore.getState().undoStacks['doc-1'];
    expect(stack).toHaveLength(50);
    expect(stack[0].kind).toBe('transform');
    if (stack[0].kind === 'transform') {
      expect(stack[0].before.x).toBe(10);
    }
  });

  it('clearHistory empties both stacks', () => {
    useImageEditorStore.getState().pushOperation(op);
    useImageEditorStore.getState().popUndo('doc-1');
    useImageEditorStore.getState().clearHistory('doc-1');
    expect(useImageEditorStore.getState().undoStacks['doc-1']).toEqual([]);
    expect(useImageEditorStore.getState().redoStacks['doc-1']).toEqual([]);
  });
});
