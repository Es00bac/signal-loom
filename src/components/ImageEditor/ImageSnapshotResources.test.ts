import { beforeEach, describe, expect, it } from 'vitest';
import { useImageEditorStore } from '../../store/imageEditorStore';
import type { ImageDocument, ImageDocumentSnapshot, ImageLayer, LayerBitmap } from '../../types/imageEditor';
import { createMask, toSnapshot } from './SelectionMask';
import {
  IMAGE_DOCUMENT_MAX_SNAPSHOTS,
  addImageDocumentSnapshot,
  buildImageDocumentSnapshotIntegrity,
  deleteImageDocumentSnapshot,
  disposeImageDocumentSnapshotResources,
  markImageDocumentSnapshotOwned,
  restoreImageDocumentSnapshot,
} from './ImageSnapshots';
import { clearAllSelections, getSelection, setSelection } from './selectionRegistry';

class ResourceCanvas {
  width: number;
  height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  getContext() {
    return {
      drawImage: () => undefined,
      getImageData: () => ({
        width: this.width,
        height: this.height,
        data: new Uint8ClampedArray(this.width * this.height * 4),
      }),
    };
  }
}

function bitmap(width = 4, height = 3): LayerBitmap {
  return new ResourceCanvas(width, height) as unknown as LayerBitmap;
}

function layer(id: string, pixels: LayerBitmap | null): ImageLayer {
  return {
    id, name: id, type: 'image', visible: true, locked: false, opacity: 1,
    blendMode: 'normal', x: 0, y: 0, bitmap: pixels, bitmapVersion: 0, mask: null,
  };
}

function ownedSnapshot(id: string, pixels: LayerBitmap | null): ImageDocumentSnapshot {
  const layers = [layer(`${id}-layer`, pixels)];
  return markImageDocumentSnapshotOwned({
    id,
    name: id,
    createdAt: 1,
    width: 4,
    height: 3,
    layers,
    activeLayerId: layers[0].id,
    hasSelection: false,
    selectionVersion: 0,
    pixelState: 'complete',
    integrity: buildImageDocumentSnapshotIntegrity(layers),
  });
}

function document(id: string, snapshots: ImageDocumentSnapshot[], liveBitmap: LayerBitmap | null = null): ImageDocument {
  return {
    id,
    title: id,
    width: 4,
    height: 3,
    layers: [layer(`${id}-live`, liveBitmap)],
    activeLayerId: `${id}-live`,
    hasSelection: false,
    selectionVersion: 0,
    viewport: { zoom: 1, panX: 0, panY: 0 },
    dirty: false,
    snapshots,
  };
}

describe('named snapshot resource ownership', () => {
  beforeEach(() => {
    globalThis.OffscreenCanvas = ResourceCanvas as unknown as typeof OffscreenCanvas;
    useImageEditorStore.getState().restoreProjectSnapshot(undefined);
    clearAllSelections();
  });

  it('disposes deleted owned clones once while preserving live, editable restored, and unowned history-like pixels', () => {
    const snapshotPixels = bitmap();
    const livePixels = bitmap();
    const snapshot = ownedSnapshot('delete-me', snapshotPixels);
    const doc = document('delete-doc', [snapshot], livePixels);
    const restored = restoreImageDocumentSnapshot(doc, snapshot.id);
    const editableRestored = restored.layers[0].bitmap!;

    deleteImageDocumentSnapshot(restored, snapshot.id);
    expect(snapshotPixels.width).toBe(0);
    expect(snapshotPixels.height).toBe(0);
    expect(livePixels.width).toBe(4);
    expect(editableRestored.width).toBe(4);

    disposeImageDocumentSnapshotResources(snapshot);
    expect(snapshotPixels.width).toBe(0);

    const unownedPixels = bitmap();
    const unowned = { ...ownedSnapshot('temporary-owner', null), layers: [layer('history', unownedPixels)] };
    disposeImageDocumentSnapshotResources(unowned);
    expect(unownedPixels.width).toBe(4);
  });

  it('protects shared identities until the last named owner leaves and never zero-sizes a live identity', () => {
    const shared = bitmap();
    const first = ownedSnapshot('shared-a', shared);
    const second = ownedSnapshot('shared-b', shared);
    let doc = document('shared-doc', [first, second]);

    doc = deleteImageDocumentSnapshot(doc, first.id);
    expect(shared.width).toBe(4);
    doc = deleteImageDocumentSnapshot(doc, second.id);
    expect(shared.width).toBe(0);

    const liveShared = bitmap();
    const liveSnapshot = ownedSnapshot('live-shared', liveShared);
    deleteImageDocumentSnapshot(document('live-protected', [liveSnapshot], liveShared), liveSnapshot.id);
    expect(liveShared.width).toBe(4);
  });

  it('disposes only the cap-evicted snapshot', () => {
    const snapshots = Array.from({ length: IMAGE_DOCUMENT_MAX_SNAPSHOTS }, (_, index) => (
      ownedSnapshot(`snapshot-${index}`, bitmap())
    ));
    const newest = ownedSnapshot('snapshot-new', bitmap());
    const next = addImageDocumentSnapshot(document('cap-doc', snapshots), newest);

    expect(next.snapshots).toHaveLength(IMAGE_DOCUMENT_MAX_SNAPSHOTS);
    expect(snapshots[0].layers[0].bitmap?.width).toBe(0);
    for (const retained of snapshots.slice(1)) expect(retained.layers[0].bitmap?.width).toBe(4);
    expect(newest.layers[0].bitmap?.width).toBe(4);
  });

  it('disposes snapshots and only the matching selection on close/discard', () => {
    const closeSnapshot = ownedSnapshot('close-snapshot', bitmap());
    const discardSnapshot = ownedSnapshot('discard-snapshot', bitmap());
    const closeDoc = document('close-doc', [closeSnapshot]);
    const discardDoc = { ...document('discard-doc', [discardSnapshot]), dirty: true };
    useImageEditorStore.getState().openDocument(closeDoc);
    useImageEditorStore.getState().openDocument(discardDoc);
    const closeSelection = createMask(4, 3);
    closeSelection.data[0] = 255;
    const discardSelection = createMask(4, 3);
    discardSelection.data[1] = 255;
    setSelection(closeDoc.id, closeSelection);
    setSelection(discardDoc.id, discardSelection);

    useImageEditorStore.getState().closeDocument(closeDoc.id);
    expect(closeSnapshot.layers[0].bitmap?.width).toBe(0);
    expect(getSelection(closeDoc.id)).toBeUndefined();
    expect(getSelection(discardDoc.id)).toBe(discardSelection);

    useImageEditorStore.getState().discardDocument(discardDoc.id);
    expect(discardSnapshot.layers[0].bitmap?.width).toBe(0);
    expect(getSelection(discardDoc.id)).toBeUndefined();
  });

  it('disposes old snapshots on replacement and incoming snapshots on rollback without touching retained rollback data', () => {
    const oldSnapshot = ownedSnapshot('old', bitmap());
    const oldDoc = document('old-doc', [oldSnapshot]);
    useImageEditorStore.getState().openDocument(oldDoc);
    useImageEditorStore.getState().restoreProjectSnapshot(undefined);
    expect(oldSnapshot.layers[0].bitmap?.width).toBe(0);

    const rollbackSnapshot = ownedSnapshot('rollback-retained', bitmap());
    const rollbackDoc = document('rollback-doc', [rollbackSnapshot]);
    const incomingSnapshot = ownedSnapshot('incoming-discarded', bitmap());
    const incomingDoc = document('incoming-doc', [incomingSnapshot]);
    useImageEditorStore.setState({ documents: [incomingDoc], activeDocId: incomingDoc.id });
    const selection = createMask(4, 3);
    selection.data[5] = 201;

    useImageEditorStore.getState().restoreLiveProjectRollback({
      documents: [rollbackDoc],
      activeDocId: rollbackDoc.id,
      quickActionMacros: [],
      selectionMasks: { [rollbackDoc.id]: toSnapshot(selection) },
    });

    expect(incomingSnapshot.layers[0].bitmap?.width).toBe(0);
    expect(rollbackSnapshot.layers[0].bitmap?.width).toBe(4);
    expect(Array.from(getSelection(rollbackDoc.id)?.data ?? [])).toEqual(Array.from(selection.data));
  });
});
