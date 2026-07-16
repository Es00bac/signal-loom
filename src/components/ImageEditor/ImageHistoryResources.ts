import type {
  EditorOperation,
  ImageDocument,
  ImageDocumentSnapshot,
  ImageLayer,
  LayerBitmap,
  SelectionMaskSnapshot,
} from '../../types/imageEditor';
import { cloneBitmap } from './LayerBitmap';

const retainedHistoryOperations = new WeakSet<EditorOperation>();

function cloneSerializableValue<T>(value: T): T {
  if (value === undefined || value === null) return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

function cloneRetainedBitmap(
  bitmap: LayerBitmap | null,
  clones: Map<LayerBitmap, LayerBitmap>,
): LayerBitmap | null {
  if (!bitmap) return null;
  const existing = clones.get(bitmap);
  if (existing) return existing;
  const cloned = cloneBitmap(bitmap);
  clones.set(bitmap, cloned);
  return cloned;
}

function cloneLayer(
  layer: ImageLayer,
  clones: Map<LayerBitmap, LayerBitmap>,
): ImageLayer {
  const { bitmap, mask, ...serializable } = layer;
  return {
    ...cloneSerializableValue(serializable),
    bitmap: cloneRetainedBitmap(bitmap, clones),
    mask: cloneRetainedBitmap(mask, clones),
  };
}

function cloneLayers(
  layers: readonly ImageLayer[],
  clones: Map<LayerBitmap, LayerBitmap>,
): ImageLayer[] {
  return layers.map((layer) => cloneLayer(layer, clones));
}

function cloneSnapshot(
  snapshot: ImageDocumentSnapshot,
  clones: Map<LayerBitmap, LayerBitmap>,
): ImageDocumentSnapshot {
  const { layers, ...serializable } = snapshot;
  return {
    ...cloneSerializableValue(serializable),
    layers: cloneLayers(layers, clones),
  };
}

function cloneDocument(
  document: ImageDocument,
  clones: Map<LayerBitmap, LayerBitmap>,
): ImageDocument {
  const { layers, snapshots, ...serializable } = document;
  return {
    ...cloneSerializableValue(serializable),
    layers: cloneLayers(layers, clones),
    snapshots: snapshots?.map((snapshot) => cloneSnapshot(snapshot, clones)),
  };
}

function cloneSelectionSnapshot(snapshot: SelectionMaskSnapshot | null): SelectionMaskSnapshot | null {
  if (!snapshot) return null;
  return {
    width: snapshot.width,
    height: snapshot.height,
    data: new Uint8ClampedArray(snapshot.data),
  };
}

/**
 * Copy all mutable content retained by an undo entry. One clone map spans the
 * operation's before/after states, so unchanged bitmap identities are shared
 * inside that immutable operation instead of being duplicated.
 */
export function retainEditorOperation(operation: EditorOperation): EditorOperation {
  const clones = new Map<LayerBitmap, LayerBitmap>();
  let retained: EditorOperation;

  switch (operation.kind) {
    case 'paint':
      retained = {
        ...operation,
        before: cloneRetainedBitmap(operation.before, clones),
        after: cloneRetainedBitmap(operation.after, clones),
      };
      break;
    case 'selection':
      retained = {
        ...operation,
        before: cloneSelectionSnapshot(operation.before),
        after: cloneSelectionSnapshot(operation.after),
      };
      break;
    case 'transform':
      retained = cloneSerializableValue(operation);
      break;
    case 'layerOp':
      retained = {
        ...operation,
        before: cloneLayers(operation.before, clones),
        after: cloneLayers(operation.after, clones),
      };
      break;
    case 'docResize':
      retained = {
        ...operation,
        before: {
          ...cloneSerializableValue({ ...operation.before, layers: undefined }),
          layers: cloneLayers(operation.before.layers, clones),
        },
        after: {
          ...cloneSerializableValue({ ...operation.after, layers: undefined }),
          layers: cloneLayers(operation.after.layers, clones),
        },
      };
      break;
    case 'documentState':
      retained = {
        ...operation,
        before: cloneDocument(operation.before, clones),
        after: cloneDocument(operation.after, clones),
      };
      break;
  }

  retainedHistoryOperations.add(retained);
  return retained;
}

/** Clone an immutable history layer graph before exposing it to live tools. */
export function materializeHistoryLayers(layers: readonly ImageLayer[]): ImageLayer[] {
  return cloneLayers(layers, new Map());
}

/** Clone an immutable history document before exposing it to live tools. */
export function materializeHistoryDocument(document: ImageDocument): ImageDocument {
  return cloneDocument(document, new Map());
}

/** Clone one immutable history bitmap before exposing it to live tools. */
export function materializeHistoryBitmap(bitmap: LayerBitmap | null): LayerBitmap | null {
  return bitmap ? cloneBitmap(bitmap) : null;
}

function collectLayerBitmaps(layer: ImageLayer, bitmaps: Set<LayerBitmap>): void {
  if (layer.bitmap) bitmaps.add(layer.bitmap);
  if (layer.mask) bitmaps.add(layer.mask);
}

function collectSnapshotBitmaps(snapshot: ImageDocumentSnapshot, bitmaps: Set<LayerBitmap>): void {
  for (const layer of snapshot.layers) collectLayerBitmaps(layer, bitmaps);
}

function collectDocumentBitmaps(document: ImageDocument, bitmaps: Set<LayerBitmap>): void {
  for (const layer of document.layers) collectLayerBitmaps(layer, bitmaps);
  for (const snapshot of document.snapshots ?? []) collectSnapshotBitmaps(snapshot, bitmaps);
}

function operationBitmaps(operation: EditorOperation): Set<LayerBitmap> {
  const bitmaps = new Set<LayerBitmap>();
  switch (operation.kind) {
    case 'paint':
      if (operation.before) bitmaps.add(operation.before);
      if (operation.after) bitmaps.add(operation.after);
      break;
    case 'layerOp':
      for (const layer of operation.before) collectLayerBitmaps(layer, bitmaps);
      for (const layer of operation.after) collectLayerBitmaps(layer, bitmaps);
      break;
    case 'docResize':
      for (const layer of operation.before.layers) collectLayerBitmaps(layer, bitmaps);
      for (const layer of operation.after.layers) collectLayerBitmaps(layer, bitmaps);
      break;
    case 'documentState':
      collectDocumentBitmaps(operation.before, bitmaps);
      collectDocumentBitmaps(operation.after, bitmaps);
      break;
    case 'selection':
    case 'transform':
      break;
  }
  return bitmaps;
}

/** Exact RGBA8 bytes held by unique immutable bitmap/selection buffers in one operation. */
export function editorOperationRetainedBytes(operation: EditorOperation): number {
  let bytes = 0;
  for (const bitmap of operationBitmaps(operation)) {
    bytes += Math.max(0, bitmap.width) * Math.max(0, bitmap.height) * 4;
  }
  if (operation.kind === 'selection') {
    bytes += operation.before?.data.byteLength ?? 0;
    bytes += operation.after?.data.byteLength ?? 0;
  }
  return bytes;
}

/**
 * Release only buffers created by retainEditorOperation. Replaying an entry
 * always materializes fresh live canvases, so zero-sizing these owned retained
 * canvases cannot invalidate the document currently being edited.
 */
export function disposeEditorOperation(operation: EditorOperation): void {
  if (!retainedHistoryOperations.has(operation)) return;
  for (const bitmap of operationBitmaps(operation)) {
    bitmap.width = 0;
    bitmap.height = 0;
  }
  retainedHistoryOperations.delete(operation);
}

export function disposeEditorOperations(operations: readonly EditorOperation[]): void {
  for (const operation of operations) disposeEditorOperation(operation);
}
