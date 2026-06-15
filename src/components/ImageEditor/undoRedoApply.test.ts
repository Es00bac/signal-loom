import { beforeEach, describe, expect, it } from 'vitest';
import { createEmptyImageDocument, useImageEditorStore } from '../../store/imageEditorStore';
import type { ImageLayer, LayerBitmap } from '../../types/imageEditor';
import { applyOperation, jumpToHistoryUndoCount } from './undoRedoApply';

class FakeOffscreenCanvas {
  width: number;
  height: number;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }
  getContext() {
    return {
      drawImage() {},
    };
  }
}

function layer(patch: Partial<ImageLayer> = {}): ImageLayer {
  return {
    id: 'layer-1',
    name: 'Layer 1',
    type: 'image',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    x: 24,
    y: 32,
    bitmap: null,
    bitmapVersion: 0,
    mask: null,
    ...patch,
  };
}

describe('undoRedoApply', () => {
  beforeEach(() => {
    globalThis.OffscreenCanvas = FakeOffscreenCanvas as unknown as typeof OffscreenCanvas;
    useImageEditorStore.setState({
      documents: [],
      activeDocId: null,
      undoStacks: {},
      redoStacks: {},
    });
  });

  it('restores transform pivot values when replaying transform operations', () => {
    useImageEditorStore.getState().openDocument({
      ...createEmptyImageDocument({
        id: 'doc-undo-pivot',
        title: 'Undo Pivot',
        width: 640,
        height: 480,
      }),
      layers: [
        layer({
          id: 'layer-1',
          transformOriginX: 0.5,
          transformOriginY: 0.5,
        } as unknown as Partial<ImageLayer>),
      ],
      activeLayerId: 'layer-1',
    });

    const operation = {
      kind: 'transform',
      docId: 'doc-undo-pivot',
      layerId: 'layer-1',
      before: { x: 24, y: 32, rotationDeg: 0, transformOriginX: 0.5, transformOriginY: 0.5 },
      after: { x: 24, y: 32, rotationDeg: 0, transformOriginX: 0, transformOriginY: 0.5 },
    } as any;

    applyOperation(operation, 'redo');
    let updatedLayer = useImageEditorStore.getState().documents[0]?.layers[0] as unknown as Record<string, unknown> | undefined;
    expect(updatedLayer?.transformOriginX).toBe(0);
    expect(updatedLayer?.transformOriginY).toBe(0.5);

    applyOperation(operation, 'undo');
    updatedLayer = useImageEditorStore.getState().documents[0]?.layers[0] as unknown as Record<string, unknown> | undefined;
    expect(updatedLayer?.transformOriginX).toBe(0.5);
    expect(updatedLayer?.transformOriginY).toBe(0.5);
  });

  it('restores layer perspective values when replaying transform operations', () => {
    useImageEditorStore.getState().openDocument({
      ...createEmptyImageDocument({
        id: 'doc-undo-perspective',
        title: 'Undo Perspective',
        width: 640,
        height: 480,
      }),
      layers: [
        layer({
          id: 'layer-1',
          perspectiveX: 0,
          perspectiveY: 0,
        } as unknown as Partial<ImageLayer>),
      ],
      activeLayerId: 'layer-1',
    });

    const operation = {
      kind: 'transform',
      docId: 'doc-undo-perspective',
      layerId: 'layer-1',
      before: { x: 24, y: 32, rotationDeg: 0, perspectiveX: 0, perspectiveY: 0 },
      after: { x: 24, y: 32, rotationDeg: 0, perspectiveX: 0.25, perspectiveY: -0.125 },
    } as const;

    applyOperation(operation, 'redo');
    let updatedLayer = useImageEditorStore.getState().documents[0]?.layers[0];
    expect(updatedLayer?.perspectiveX).toBe(0.25);
    expect(updatedLayer?.perspectiveY).toBe(-0.125);

    applyOperation(operation, 'undo');
    updatedLayer = useImageEditorStore.getState().documents[0]?.layers[0];
    expect(updatedLayer?.perspectiveX).toBe(0);
    expect(updatedLayer?.perspectiveY).toBe(0);
  });

  it('restores layer warp values when replaying transform operations', () => {
    useImageEditorStore.getState().openDocument({
      ...createEmptyImageDocument({
        id: 'doc-undo-warp',
        title: 'Undo Warp',
        width: 640,
        height: 480,
      }),
      layers: [
        layer({
          id: 'layer-1',
          warp: {
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
          },
        } as unknown as Partial<ImageLayer>),
      ],
      activeLayerId: 'layer-1',
    });

    const operation = {
      kind: 'transform',
      docId: 'doc-undo-warp',
      layerId: 'layer-1',
      before: {
        x: 24,
        y: 32,
        rotationDeg: 0,
        warp: { top: 0, right: 0, bottom: 0, left: 0 },
      },
      after: {
        x: 24,
        y: 32,
        rotationDeg: 0,
        warp: { top: 0.25, right: -0.15, bottom: 0.1, left: 0 },
      },
    } as const;

    applyOperation(operation, 'redo');
    let updatedLayer = useImageEditorStore.getState().documents[0]?.layers[0];
    expect(updatedLayer?.warp).toEqual({
      top: 0.25,
      right: -0.15,
      bottom: 0.1,
      left: 0,
    });

    applyOperation(operation, 'undo');
    updatedLayer = useImageEditorStore.getState().documents[0]?.layers[0];
    expect(updatedLayer?.warp).toEqual({
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    });
  });

  it('replays mask paint operations against the layer mask target instead of the layer bitmap', () => {
    const beforeMask = new OffscreenCanvas(8, 8) as LayerBitmap;
    const afterMask = new OffscreenCanvas(8, 8) as LayerBitmap;

    useImageEditorStore.getState().openDocument({
      ...createEmptyImageDocument({
        id: 'doc-undo-mask',
        title: 'Undo Mask',
        width: 640,
        height: 480,
      }),
      layers: [
        layer({
          id: 'layer-1',
          bitmap: new OffscreenCanvas(8, 8) as LayerBitmap,
          mask: beforeMask,
        }),
      ],
      activeLayerId: 'layer-1',
    });

    const operation = {
      kind: 'paint',
      docId: 'doc-undo-mask',
      layerId: 'layer-1',
      paintTarget: 'mask',
      before: beforeMask,
      after: afterMask,
    } as const;

    applyOperation(operation, 'redo');
    expect(useImageEditorStore.getState().documents[0]?.layers[0]?.mask).toBe(afterMask);
    expect(useImageEditorStore.getState().documents[0]?.layers[0]?.bitmap).not.toBe(afterMask);

    applyOperation(operation, 'undo');
    expect(useImageEditorStore.getState().documents[0]?.layers[0]?.mask).toBe(beforeMask);
  });

  it('restores the recorded active layer when replaying document resize operations', () => {
    const background = layer({ id: 'background', name: 'Background' });
    const foreground = layer({ id: 'foreground', name: 'Foreground' });
    useImageEditorStore.getState().openDocument({
      ...createEmptyImageDocument({
        id: 'doc-undo-doc-resize-active-layer',
        title: 'Undo Crop Active Layer',
        width: 640,
        height: 480,
      }),
      layers: [background, foreground],
      activeLayerId: 'background',
    });

    applyOperation({
      kind: 'docResize',
      docId: 'doc-undo-doc-resize-active-layer',
      before: {
        width: 640,
        height: 480,
        layers: [background, foreground],
        activeLayerId: 'background',
      },
      after: {
        width: 320,
        height: 240,
        layers: [
          { ...background, x: 0, y: 0 },
          { ...foreground, x: 8, y: 12 },
        ],
        activeLayerId: 'background',
      },
    }, 'redo');

    expect(useImageEditorStore.getState().getActiveDocument()?.activeLayerId).toBe('background');

    applyOperation({
      kind: 'docResize',
      docId: 'doc-undo-doc-resize-active-layer',
      before: {
        width: 640,
        height: 480,
        layers: [background, foreground],
        activeLayerId: 'background',
      },
      after: {
        width: 320,
        height: 240,
        layers: [
          { ...background, x: 0, y: 0 },
          { ...foreground, x: 8, y: 12 },
        ],
        activeLayerId: 'background',
      },
    }, 'undo');

    expect(useImageEditorStore.getState().getActiveDocument()?.activeLayerId).toBe('background');
  });

  it('jumps to a requested history depth by replaying undo and redo operations', () => {
    useImageEditorStore.getState().openDocument({
      ...createEmptyImageDocument({
        id: 'doc-history-jump',
        title: 'History Jump',
        width: 640,
        height: 480,
      }),
      layers: [
        layer({
          id: 'layer-1',
          x: 20,
          y: 0,
        }),
      ],
      activeLayerId: 'layer-1',
    });

    const op1 = {
      kind: 'transform',
      docId: 'doc-history-jump',
      layerId: 'layer-1',
      before: { x: 0, y: 0, rotationDeg: 0 },
      after: { x: 10, y: 0, rotationDeg: 0 },
    } as const;
    const op2 = {
      kind: 'transform',
      docId: 'doc-history-jump',
      layerId: 'layer-1',
      before: { x: 10, y: 0, rotationDeg: 0 },
      after: { x: 20, y: 0, rotationDeg: 0 },
    } as const;

    useImageEditorStore.setState({
      undoStacks: {
        'doc-history-jump': [op1, op2],
      },
      redoStacks: {
        'doc-history-jump': [],
      },
    });

    expect(jumpToHistoryUndoCount('doc-history-jump', 0)).toBe(true);
    expect(useImageEditorStore.getState().getActiveDocument()?.layers[0]?.x).toBe(0);
    expect(useImageEditorStore.getState().undoStacks['doc-history-jump']).toHaveLength(0);
    expect(useImageEditorStore.getState().redoStacks['doc-history-jump']).toHaveLength(2);

    expect(jumpToHistoryUndoCount('doc-history-jump', 2)).toBe(true);
    expect(useImageEditorStore.getState().getActiveDocument()?.layers[0]?.x).toBe(20);
    expect(useImageEditorStore.getState().undoStacks['doc-history-jump']).toHaveLength(2);
    expect(useImageEditorStore.getState().redoStacks['doc-history-jump']).toHaveLength(0);
  });
});
