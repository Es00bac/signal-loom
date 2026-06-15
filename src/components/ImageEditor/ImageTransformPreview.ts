import { useImageEditorStore } from '../../store/imageEditorStore';
import type {
  EditorOperation,
  ImageDocument,
  ImageLayer,
  ImageLayerTransformCorner,
  ImageLayerWarpOffsets,
  ImageLayerTransformState,
} from '../../types/imageEditor';
import {
  describeImageLayerTransformCapabilities,
  resolveImageLayerTransformOrigin,
  type ImageLayerTransformCapabilityDescriptor,
  type ImageLayerTransformCapabilityKind,
  type ImageLayerTransformDescriptorOptions,
  type ImageLayerTransformWarning,
} from './ImageLayerTransform';
import {
  createEmptyImageLayerTransformCornerOffsets,
  createEmptyImageLayerWarpOffsets,
  normalizeImageLayerTransformCornerOffsets,
  normalizeImageLayerWarpOffsets,
  type ImageLayerTransformMode,
} from './ImageLayerTransformControls';

export interface ImageTransformPreviewSession {
  docId: string;
  layerId: string;
  activeLayerId: string | null;
  beforeLayers: ImageLayer[];
  beforeTransform: ImageLayerTransformState;
  structureChange: boolean;
  currentMode: ImageLayerTransformMode;
}

export type ImageTransformPreviewOperationKind = 'none' | 'transform' | 'layerOp';

export interface ImageTransformPreviewSessionDescriptor {
  docId: string;
  layerId: string;
  activeLayerId: string | null;
  currentMode: ImageLayerTransformMode;
  activeCapability: ImageLayerTransformCapabilityKind;
  pendingChanges: boolean;
  structureChange: boolean;
  operationKind: ImageTransformPreviewOperationKind;
  beforeTransform: ImageLayerTransformState;
  currentTransform: ImageLayerTransformState;
  capabilities: ImageLayerTransformCapabilityDescriptor[];
  warnings: ImageLayerTransformWarning[];
  previewSignature: string;
}

const listeners = new Set<() => void>();
let session: ImageTransformPreviewSession | null = null;

export function subscribeTransformPreviewSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getTransformPreviewSession(docId?: string): ImageTransformPreviewSession | null {
  if (!session) return null;
  if (docId && session.docId !== docId) return null;
  return session;
}

export function clearTransformPreviewSession(): void {
  if (!session) return;
  session = null;
  notify();
}

export function beginTransformPreviewSession(doc: ImageDocument, layer: ImageLayer): ImageTransformPreviewSession {
  if (session && session.docId === doc.id && session.layerId === layer.id) {
    return session;
  }

  session = {
    docId: doc.id,
    layerId: layer.id,
    activeLayerId: doc.activeLayerId,
    beforeLayers: doc.layers,
    beforeTransform: getLayerTransformState(layer),
    structureChange: false,
    currentMode: 'resize',
  };
  notify();
  return session;
}

export function markTransformPreviewSessionStructureChange(
  doc: ImageDocument,
  layer: ImageLayer,
): ImageTransformPreviewSession {
  const current = beginTransformPreviewSession(doc, layer);
  if (current.structureChange) return current;
  session = { ...current, structureChange: true };
  notify();
  return session;
}

export function setTransformPreviewMode(
  docId: string,
  mode: ImageLayerTransformMode,
): boolean {
  const current = getTransformPreviewSession(docId);
  if (!current || current.currentMode === mode) return Boolean(current);
  session = {
    ...current,
    currentMode: mode,
  };
  notify();
  return true;
}

export function describeTransformPreviewSession(
  doc: ImageDocument,
  options: ImageLayerTransformDescriptorOptions = {},
): ImageTransformPreviewSessionDescriptor | null {
  const current = getTransformPreviewSession(doc.id);
  if (!current) return null;
  const layer = doc.layers.find((candidate) => candidate.id === current.layerId);
  if (!layer) return null;

  const currentTransform = getLayerTransformState(layer);
  const pendingChanges = transformPreviewSessionHasPendingChanges(doc);
  const operationKind = getTransformPreviewOperationKind(current, pendingChanges);
  const activeCapability = getTransformPreviewActiveCapability(current, currentTransform);
  const capabilityDescriptor = describeImageLayerTransformCapabilities(layer, options);
  const warnings = capabilityDescriptor.warnings;

  return {
    docId: current.docId,
    layerId: current.layerId,
    activeLayerId: current.activeLayerId,
    currentMode: current.currentMode,
    activeCapability,
    pendingChanges,
    structureChange: current.structureChange,
    operationKind,
    beforeTransform: current.beforeTransform,
    currentTransform,
    capabilities: capabilityDescriptor.capabilities,
    warnings,
    previewSignature: buildTransformPreviewSessionSignature({
      current,
      activeCapability,
      pendingChanges,
      operationKind,
      currentTransform,
      warnings,
    }),
  };
}

export function transformPreviewSessionHasPendingChanges(doc: ImageDocument): boolean {
  const current = getTransformPreviewSession(doc.id);
  if (!current) return false;
  if (current.structureChange) {
    return doc.layers !== current.beforeLayers;
  }
  const layer = doc.layers.find((candidate) => candidate.id === current.layerId);
  if (!layer) return false;
  return !transformStatesMatch(current.beforeTransform, getLayerTransformState(layer));
}

export function applyTransformPreviewSession(
  docId: string,
  requestRender?: () => void,
): EditorOperation | null {
  const current = getTransformPreviewSession(docId);
  if (!current) return null;
  const store = useImageEditorStore.getState();
  const doc = store.documents.find((candidate) => candidate.id === docId);
  const layer = doc?.layers.find((candidate) => candidate.id === current.layerId);
  let operation: EditorOperation | null = null;

  if (doc && layer) {
    if (current.structureChange) {
      if (doc.layers !== current.beforeLayers) {
        operation = {
          kind: 'layerOp',
          docId,
          before: current.beforeLayers,
          after: doc.layers,
        };
      }
    } else {
      const after = getLayerTransformState(layer);
      if (!transformStatesMatch(current.beforeTransform, after)) {
        operation = {
          kind: 'transform',
          docId,
          layerId: layer.id,
          before: current.beforeTransform,
          after,
        };
      }
    }
  }

  clearTransformPreviewSession();
  if (operation) {
    store.pushOperation(operation);
  }
  requestRender?.();
  return operation;
}

export function cancelTransformPreviewSession(docId: string, requestRender?: () => void): boolean {
  const current = getTransformPreviewSession(docId);
  if (!current) return false;
  const store = useImageEditorStore.getState();
  store.setLayers(current.docId, current.beforeLayers, current.activeLayerId);
  clearTransformPreviewSession();
  requestRender?.();
  return true;
}

function notify(): void {
  listeners.forEach((listener) => listener());
}

function getLayerTransformState(layer: ImageLayer): ImageLayerTransformState {
  const origin = resolveImageLayerTransformOrigin(layer);
  return {
    x: layer.x,
    y: layer.y,
    rotationDeg: layer.rotationDeg ?? 0,
    skewXDeg: layer.skewXDeg ?? 0,
    skewYDeg: layer.skewYDeg ?? 0,
    perspectiveX: layer.perspectiveX ?? 0,
    perspectiveY: layer.perspectiveY ?? 0,
    warp: normalizeImageLayerWarpOffsets(layer.warp),
    cornerOffsets: normalizeImageLayerTransformCornerOffsets(layer.cornerOffsets),
    transformOriginX: origin.x,
    transformOriginY: origin.y,
  };
}

function transformStatesMatch(a: ImageLayerTransformState, b: ImageLayerTransformState): boolean {
  return (
    a.x === b.x &&
    a.y === b.y &&
    (a.rotationDeg ?? 0) === (b.rotationDeg ?? 0) &&
    (a.skewXDeg ?? 0) === (b.skewXDeg ?? 0) &&
    (a.skewYDeg ?? 0) === (b.skewYDeg ?? 0) &&
    (a.perspectiveX ?? 0) === (b.perspectiveX ?? 0) &&
    (a.perspectiveY ?? 0) === (b.perspectiveY ?? 0) &&
    warpOffsetsMatch(a.warp, b.warp) &&
    cornerOffsetsMatch(a.cornerOffsets, b.cornerOffsets) &&
    a.transformOriginX === b.transformOriginX &&
    a.transformOriginY === b.transformOriginY
  );
}

function cornerOffsetsMatch(
  a: ImageLayerTransformState['cornerOffsets'],
  b: ImageLayerTransformState['cornerOffsets'],
): boolean {
  const left = a ?? createEmptyImageLayerTransformCornerOffsets();
  const right = b ?? createEmptyImageLayerTransformCornerOffsets();
  const corners: ImageLayerTransformCorner[] = ['nw', 'ne', 'se', 'sw'];
  return corners.every((corner) => left[corner].x === right[corner].x && left[corner].y === right[corner].y);
}

function warpOffsetsMatch(
  a: ImageLayerWarpOffsets | undefined,
  b: ImageLayerWarpOffsets | undefined,
): boolean {
  const left = a ?? createEmptyImageLayerWarpOffsets();
  const right = b ?? createEmptyImageLayerWarpOffsets();
  return left.top === right.top
    && left.right === right.right
    && left.bottom === right.bottom
    && left.left === right.left;
}

function getTransformPreviewOperationKind(
  current: ImageTransformPreviewSession,
  pendingChanges: boolean,
): ImageTransformPreviewOperationKind {
  if (!pendingChanges) return 'none';
  return current.structureChange ? 'layerOp' : 'transform';
}

function getTransformPreviewActiveCapability(
  current: ImageTransformPreviewSession,
  currentTransform: ImageLayerTransformState,
): ImageLayerTransformCapabilityKind {
  if (current.structureChange) return 'scale';
  if (current.currentMode !== 'resize') return current.currentMode;
  if ((current.beforeTransform.rotationDeg ?? 0) !== (currentTransform.rotationDeg ?? 0)) return 'rotate';
  if (
    current.beforeTransform.transformOriginX !== currentTransform.transformOriginX
    || current.beforeTransform.transformOriginY !== currentTransform.transformOriginY
  ) {
    return 'rotate';
  }
  if (current.beforeTransform.x !== currentTransform.x || current.beforeTransform.y !== currentTransform.y) return 'move';
  if (
    (current.beforeTransform.skewXDeg ?? 0) !== (currentTransform.skewXDeg ?? 0)
    || (current.beforeTransform.skewYDeg ?? 0) !== (currentTransform.skewYDeg ?? 0)
  ) {
    return 'skew';
  }
  if (!cornerOffsetsMatch(current.beforeTransform.cornerOffsets, currentTransform.cornerOffsets)) return 'distort';
  if (
    (current.beforeTransform.perspectiveX ?? 0) !== (currentTransform.perspectiveX ?? 0)
    || (current.beforeTransform.perspectiveY ?? 0) !== (currentTransform.perspectiveY ?? 0)
  ) {
    return 'perspective';
  }
  if (!warpOffsetsMatch(current.beforeTransform.warp, currentTransform.warp)) return 'warp';
  return 'scale';
}

function buildTransformPreviewSessionSignature({
  current,
  activeCapability,
  pendingChanges,
  operationKind,
  currentTransform,
  warnings,
}: {
  current: ImageTransformPreviewSession;
  activeCapability: ImageLayerTransformCapabilityKind;
  pendingChanges: boolean;
  operationKind: ImageTransformPreviewOperationKind;
  currentTransform: ImageLayerTransformState;
  warnings: ImageLayerTransformWarning[];
}): string {
  return `transform-preview-session:v1:${JSON.stringify({
    docId: current.docId,
    layerId: current.layerId,
    currentMode: current.currentMode,
    activeCapability,
    structureChange: current.structureChange,
    pendingChanges,
    operationKind,
    before: current.beforeTransform,
    current: currentTransform,
    warnings: warnings.map((warning) => warning.code),
  })}`;
}
