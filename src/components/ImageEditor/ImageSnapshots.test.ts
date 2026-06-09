import { describe, expect, it } from 'vitest';
import type { ImageDocument, ImageLayer, LayerBitmap } from '../../types/imageEditor';
import { addImageDocumentSnapshot, createImageDocumentSnapshot, deleteImageDocumentSnapshot, restoreImageDocumentSnapshot } from './ImageSnapshots';

function makeLayer(id: string): ImageLayer {
  return {
    id,
    name: id,
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
  };
}

function makeDoc(overrides?: Partial<ImageDocument>): ImageDocument {
  return {
    id: 'doc',
    title: 'Doc',
    width: 10,
    height: 10,
    layers: [makeLayer('base')],
    activeLayerId: 'base',
    hasSelection: false,
    selectionVersion: 0,
    viewport: { zoom: 1, panX: 0, panY: 0 },
    dirty: false,
    snapshots: [],
    ...overrides,
  };
}

describe('ImageSnapshots', () => {
  it('stores compact document layer state snapshots without flattening bitmaps', () => {
    const doc = makeDoc();
    const snapshot = createImageDocumentSnapshot(doc, 'Before type');
    const withSnapshot = addImageDocumentSnapshot(doc, snapshot);

    expect(withSnapshot.snapshots).toHaveLength(1);
    expect(withSnapshot.snapshots?.[0]).toMatchObject({ name: 'Before type', layers: doc.layers });
    expect(withSnapshot.dirty).toBe(true);
  });

  it('restores and deletes snapshots by id', () => {
    const original = makeDoc();
    const snapshot = createImageDocumentSnapshot(original, 'Base');
    const changed = addImageDocumentSnapshot(original, snapshot);
    const withEdit = { ...changed, layers: [makeLayer('edit')], activeLayerId: 'edit' };

    const restored = restoreImageDocumentSnapshot(withEdit, snapshot.id);
    expect(restored.layers.map((layer) => layer.id)).toEqual(['base']);
    expect(restored.activeLayerId).toBe('base');

    const deleted = deleteImageDocumentSnapshot(restored, snapshot.id);
    expect(deleted.snapshots).toEqual([]);
  });

  it('restores lightweight snapshots without blanking same-id live bitmap and mask buffers', () => {
    const liveBitmap = { width: 20, height: 20 } as LayerBitmap;
    const liveMask = { width: 20, height: 20 } as LayerBitmap;
    const snapshot = {
      id: 'snapshot-lightweight',
      name: 'Saved metadata checkpoint',
      createdAt: 1,
      width: 10,
      height: 10,
      layers: [{
        ...makeLayer('base'),
        name: 'Saved layer name',
        bitmap: null,
        bitmapVersion: 2,
        mask: null,
      }],
      activeLayerId: 'base',
      hasSelection: false,
      selectionVersion: 1,
    };
    const doc = makeDoc({
      layers: [{
        ...makeLayer('base'),
        bitmap: liveBitmap,
        bitmapVersion: 8,
        mask: liveMask,
      }],
      snapshots: [snapshot],
    });

    const restored = restoreImageDocumentSnapshot(doc, 'snapshot-lightweight');

    expect(restored.layers[0]).toMatchObject({
      name: 'Saved layer name',
      bitmap: liveBitmap,
      bitmapVersion: 8,
      mask: liveMask,
    });
  });

  it('keeps current dimensions when restoring a malformed snapshot with invalid dimensions', () => {
    const snapshot = {
      id: 'snapshot-invalid-size',
      name: 'Invalid size',
      createdAt: 1,
      width: 0,
      height: -50,
      layers: [makeLayer('base')],
      activeLayerId: 'base',
      hasSelection: false,
      selectionVersion: 1,
    };
    const doc = makeDoc({ width: 640, height: 480, snapshots: [snapshot] });

    const restored = restoreImageDocumentSnapshot(doc, 'snapshot-invalid-size');

    expect(restored.width).toBe(640);
    expect(restored.height).toBe(480);
  });
});
