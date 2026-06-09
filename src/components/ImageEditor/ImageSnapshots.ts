import type { ImageDocument, ImageDocumentSnapshot, ImageLayer } from '../../types/imageEditor';

export function createImageDocumentSnapshot(
  doc: ImageDocument,
  name = `Snapshot ${(doc.snapshots?.length ?? 0) + 1}`,
): ImageDocumentSnapshot {
  return {
    id: `snapshot-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    name,
    createdAt: Date.now(),
    width: doc.width,
    height: doc.height,
    layers: doc.layers,
    activeLayerId: doc.activeLayerId,
    hasSelection: doc.hasSelection,
    selectionVersion: doc.selectionVersion,
  };
}

export function addImageDocumentSnapshot(
  doc: ImageDocument,
  snapshot: ImageDocumentSnapshot = createImageDocumentSnapshot(doc),
): ImageDocument {
  return {
    ...doc,
    snapshots: [...(doc.snapshots ?? []), snapshot].slice(-12),
    dirty: true,
  };
}

export function restoreImageDocumentSnapshot(
  doc: ImageDocument,
  snapshotId: string,
): ImageDocument {
  const snapshot = doc.snapshots?.find((candidate) => candidate.id === snapshotId);
  if (!snapshot) return doc;
  return {
    ...doc,
    width: getRestorableSnapshotDimension(snapshot.width, doc.width),
    height: getRestorableSnapshotDimension(snapshot.height, doc.height),
    layers: restoreSnapshotLayers(snapshot.layers, doc.layers),
    activeLayerId: snapshot.activeLayerId,
    hasSelection: snapshot.hasSelection,
    selectionVersion: snapshot.selectionVersion + 1,
    dirty: true,
  };
}

function getRestorableSnapshotDimension(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function restoreSnapshotLayers(snapshotLayers: ImageLayer[], currentLayers: ImageLayer[]): ImageLayer[] {
  return snapshotLayers.map((layer) => {
    const current = currentLayers.find((candidate) => candidate.id === layer.id);
    const bitmap = layer.bitmap ?? current?.bitmap ?? null;
    const mask = layer.mask ?? current?.mask ?? null;
    const preservingRuntimeBuffer =
      (layer.bitmap === null && bitmap !== null) ||
      (layer.mask === null && mask !== null);

    return {
      ...layer,
      bitmap,
      mask,
      bitmapVersion: preservingRuntimeBuffer && current
        ? Math.max(layer.bitmapVersion, current.bitmapVersion)
        : layer.bitmapVersion,
    };
  });
}

export function deleteImageDocumentSnapshot(doc: ImageDocument, snapshotId: string): ImageDocument {
  return {
    ...doc,
    snapshots: (doc.snapshots ?? []).filter((snapshot) => snapshot.id !== snapshotId),
    dirty: true,
  };
}
