import { beforeEach, describe, expect, it } from 'vitest';
import { createEmptyImageDocument, useImageEditorStore } from '../../store/imageEditorStore';
import { defaultAdjustmentSettings } from './ImageAdjustmentLayer';
import {
  addAdjustmentLayerUndoable,
  commitAdjustmentSettingsUndoable,
} from './imageAdjustmentActions';

class FakeOffscreenCanvas {
  width: number;
  height: number;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }
  getContext() {
    return { drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }) };
  }
}

function openDoc() {
  useImageEditorStore.getState().openDocument(
    createEmptyImageDocument({ id: 'doc-adjust', title: 'Adjust', width: 64, height: 64 }),
  );
}

function undoCount(): number {
  return useImageEditorStore.getState().undoStacks['doc-adjust']?.length ?? 0;
}

describe('imageAdjustmentActions', () => {
  beforeEach(() => {
    globalThis.OffscreenCanvas = FakeOffscreenCanvas as unknown as typeof OffscreenCanvas;
    useImageEditorStore.setState({ documents: [], activeDocId: null, undoStacks: {}, redoStacks: {} });
  });

  it('adds a non-destructive adjustment layer of the requested kind, makes it active, and is undoable', () => {
    openDoc();
    const before = undoCount();

    const layer = addAdjustmentLayerUndoable('curves');

    expect(layer).not.toBeNull();
    expect(layer?.type).toBe('adjustment');
    expect(layer?.adjustment?.kind).toBe('curves');

    const doc = useImageEditorStore.getState().getActiveDocument();
    expect(doc?.layers.some((entry) => entry.id === layer?.id)).toBe(true);
    expect(doc?.activeLayerId).toBe(layer?.id);
    expect(undoCount()).toBe(before + 1);
  });

  it('returns null and does nothing when there is no active document', () => {
    expect(addAdjustmentLayerUndoable('levels')).toBeNull();
  });

  it('commits edited adjustment settings onto an existing adjustment layer, undoably', () => {
    openDoc();
    const layer = addAdjustmentLayerUndoable('brightnessContrast');
    expect(layer).not.toBeNull();
    const undoAfterAdd = undoCount();

    const edited = { ...defaultAdjustmentSettings('brightnessContrast'), brightness: 42, contrast: -15 };
    commitAdjustmentSettingsUndoable(layer!.id, edited);

    const committed = useImageEditorStore
      .getState()
      .getActiveDocument()
      ?.layers.find((entry) => entry.id === layer!.id);
    expect(committed?.adjustment).toMatchObject({ kind: 'brightnessContrast', brightness: 42, contrast: -15 });
    expect(undoCount()).toBe(undoAfterAdd + 1);
  });

  it('ignores a commit for a layer that does not exist', () => {
    openDoc();
    const before = undoCount();
    commitAdjustmentSettingsUndoable('missing-layer', defaultAdjustmentSettings('levels'));
    expect(undoCount()).toBe(before);
  });
});
