import type {
  ImageDocument,
  ImageDocumentSnapshot,
  ImageDocumentSnapshotAssetIntegrity,
  ImageDocumentSnapshotIntegrity,
  ImageLayer,
  LayerBitmap,
  SelectionMaskSnapshot,
} from '../../types/imageEditor';
import { sha256 } from '@noble/hashes/sha2.js';
import { cloneBitmap, getBitmapImageData } from './LayerBitmap';
import { fromSnapshot, isMaskEmpty, toSnapshot, type SelectionMask } from './SelectionMask';
import { clearSelection, getSelection, setSelection } from './selectionRegistry';

export const IMAGE_DOCUMENT_MAX_SNAPSHOTS = 12;

export type ImageSnapshotReadinessIssueCode =
  | 'invalid-snapshot-dimensions'
  | 'empty-snapshot-layers'
  | 'missing-snapshot'
  | 'blank-snapshot-name'
  | 'unchanged-snapshot-name'
  | 'snapshot-limit-reached'
  | 'snapshot-pixels-unavailable'
  | 'snapshot-integrity-unproven'
  | 'snapshot-selection-unavailable';

export interface ImageSnapshotReadinessIssue {
  code: ImageSnapshotReadinessIssueCode;
  severity: 'error' | 'warning';
  snapshotId?: string;
  message: string;
}

export interface ImageNamedSnapshotReadiness {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number | null;
  width: number;
  height: number;
  layerCount: number;
  activeLayerId: string | null;
  hasSelection: boolean;
  selectionVersion: number;
  restorable: boolean;
  blockers: ImageSnapshotReadinessIssue[];
  warnings: ImageSnapshotReadinessIssue[];
  previewSignature: string;
}

export interface ImageSnapshotRenameReadiness {
  supported: boolean;
  targetSnapshotId: string | null;
  targetExists: boolean;
  currentName: string | null;
  draftName: string;
  unchanged: boolean;
  willUpdate: boolean;
  blockers: ImageSnapshotReadinessIssue[];
  warnings: ImageSnapshotReadinessIssue[];
  signature: string;
}

export interface ImageSnapshotReadinessDescriptor {
  descriptorId: 'image-history-snapshots-readiness:v1';
  document: {
    id: string;
    title: string;
    width: number;
    height: number;
    layerCount: number;
    activeLayerId: string | null;
    hasSelection: boolean;
    dirty: boolean;
  };
  capacity: {
    maxSnapshots: typeof IMAGE_DOCUMENT_MAX_SNAPSHOTS;
    count: number;
    remaining: number;
    canCreate: boolean;
  };
  namedSnapshots: {
    count: number;
    hasNamedSnapshots: boolean;
    snapshots: ImageNamedSnapshotReadiness[];
    signature: string;
  };
  rename: ImageSnapshotRenameReadiness;
  automationMetadata: {
    workspaceId: 'image-automation';
    separateFromMainFlow: true;
    bindingReadiness: 'ready-for-review';
    supportsNamedSnapshotVariables: true;
    supportsArbitraryJsExpressions: false;
    snapshotVariableTargets: string[];
  };
  blockers: ImageSnapshotReadinessIssue[];
  warnings: ImageSnapshotReadinessIssue[];
  preview: {
    id: string;
    signature: string;
  };
}

const ownedNamedSnapshots = new WeakSet<ImageDocumentSnapshot>();

type SnapshotAssetRole = 'bitmap-rgba8' | 'mask-rgba8' | 'selection-alpha8';

function snapshotContentDigest(input: {
  role: SnapshotAssetRole;
  layerId: string;
  width: number;
  height: number;
  bytes: Uint8Array | Uint8ClampedArray;
}): string {
  const layerIdBytes = new TextEncoder().encode(input.layerId);
  const header = new TextEncoder().encode(
    `signal-loom:image-snapshot-content:v2\0role=${input.role}\0layer-id-bytes=${layerIdBytes.byteLength}\0`,
  );
  const dimensions = new TextEncoder().encode(
    `\0width=${input.width}\0height=${input.height}\0byte-length=${input.bytes.byteLength}\0payload\0`,
  );
  const hasher = sha256.create();
  hasher.update(header);
  hasher.update(layerIdBytes);
  hasher.update(dimensions);
  hasher.update(new Uint8Array(input.bytes.buffer, input.bytes.byteOffset, input.bytes.byteLength));
  return `sha256:${[...hasher.digest()].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

function snapshotAssetIntegrity(
  bitmap: LayerBitmap | null,
  layerId: string,
  role: Exclude<SnapshotAssetRole, 'selection-alpha8'>,
): ImageDocumentSnapshotAssetIntegrity {
  if (!bitmap) return { present: false, width: 0, height: 0 };
  const pixels = getBitmapImageData(bitmap).data;
  if (pixels.byteLength !== bitmap.width * bitmap.height * 4) {
    throw new Error(`Snapshot ${role} ${layerId} did not expose exact RGBA bytes.`);
  }
  return {
    present: true,
    width: bitmap.width,
    height: bitmap.height,
    contentDigest: snapshotContentDigest({
      role,
      layerId,
      width: bitmap.width,
      height: bitmap.height,
      bytes: pixels,
    }),
  };
}

function selectionAssetIntegrity(selection: SelectionMaskSnapshot | undefined): ImageDocumentSnapshotIntegrity['selection'] {
  return selection
    ? {
        present: true,
        width: selection.width,
        height: selection.height,
        byteLength: selection.data.byteLength,
        contentDigest: snapshotContentDigest({
          role: 'selection-alpha8',
          layerId: '',
          width: selection.width,
          height: selection.height,
          bytes: selection.data,
        }),
      }
    : { present: false, width: 0, height: 0, byteLength: 0 };
}

export function buildImageDocumentSnapshotIntegrity(
  layers: readonly ImageLayer[],
  selectionMask?: SelectionMaskSnapshot,
): ImageDocumentSnapshotIntegrity {
  return {
    version: 2,
    layers: layers.map((layer) => ({
      layerId: layer.id,
      bitmap: snapshotAssetIntegrity(layer.bitmap, layer.id, 'bitmap-rgba8'),
      mask: snapshotAssetIntegrity(layer.mask, layer.id, 'mask-rgba8'),
    })),
    selection: selectionAssetIntegrity(selectionMask),
  };
}

function validSelectionForDocument(
  selection: SelectionMask | SelectionMaskSnapshot | undefined,
  width: number,
  height: number,
): selection is SelectionMask | SelectionMaskSnapshot {
  return Boolean(
    selection
    && selection.width === width
    && selection.height === height
    && selection.data instanceof Uint8ClampedArray
    && selection.data.byteLength === width * height
    && !isMaskEmpty(selection),
  );
}

function assetMatchesIntegrity(
  bitmap: LayerBitmap | null,
  expected: ImageDocumentSnapshotAssetIntegrity,
  layerId: string,
  role: Exclude<SnapshotAssetRole, 'selection-alpha8'>,
): boolean {
  if (!expected.present) {
    return bitmap === null
      && expected.width === 0
      && expected.height === 0
      && expected.contentDigest === undefined;
  }
  if (
    !bitmap
    || !Number.isFinite(expected.width)
    || !Number.isFinite(expected.height)
    || expected.width <= 0
    || expected.height <= 0
    || bitmap.width !== expected.width
    || bitmap.height !== expected.height
    || typeof expected.contentDigest !== 'string'
  ) return false;
  try {
    const actual = snapshotAssetIntegrity(bitmap, layerId, role);
    return actual.contentDigest === expected.contentDigest;
  } catch {
    return false;
  }
}

export interface ImageDocumentSnapshotIntegrityResult {
  complete: boolean;
  selectionComplete: boolean;
  reasons: string[];
}

/** Runtime proof used by Restore, readiness, project encoding, and native encoding. */
export function inspectImageDocumentSnapshotIntegrity(
  snapshot: ImageDocumentSnapshot,
): ImageDocumentSnapshotIntegrityResult {
  const reasons: string[] = [];
  const integrity = snapshot.integrity;
  if (snapshot.pixelState !== 'complete') reasons.push('pixel-state-unavailable');
  if (!integrity || integrity.version !== 2) {
    reasons.push('missing-integrity-manifest');
    return { complete: false, selectionComplete: !snapshot.hasSelection, reasons };
  }
  if (integrity.layers.length !== snapshot.layers.length) reasons.push('layer-count-mismatch');
  const layerProofById = new Map(integrity.layers.map((layer) => [layer.layerId, layer] as const));
  if (layerProofById.size !== integrity.layers.length) reasons.push('duplicate-layer-proof');
  for (const layer of snapshot.layers) {
    const proof = layerProofById.get(layer.id);
    if (!proof) {
      reasons.push(`missing-layer-proof:${layer.id}`);
      continue;
    }
    if (!assetMatchesIntegrity(layer.bitmap, proof.bitmap, layer.id, 'bitmap-rgba8')) {
      reasons.push(`bitmap-content-digest-mismatch:${layer.id}`);
    }
    if (!assetMatchesIntegrity(layer.mask, proof.mask, layer.id, 'mask-rgba8')) {
      reasons.push(`mask-content-digest-mismatch:${layer.id}`);
    }
  }

  const selectionProof = integrity.selection;
  let selectionComplete = true;
  if (selectionProof.present !== snapshot.hasSelection) {
    reasons.push('selection-claim-mismatch');
    selectionComplete = false;
  } else if (selectionProof.present) {
    const selection = snapshot.selectionMask;
    selectionComplete = Boolean(
      validSelectionForDocument(selection, snapshot.width, snapshot.height)
      && selectionProof.width === selection.width
      && selectionProof.height === selection.height
      && selectionProof.byteLength === selection.data.byteLength
      && typeof selectionProof.contentDigest === 'string'
      && selectionProof.contentDigest === snapshotContentDigest({
        role: 'selection-alpha8',
        layerId: '',
        width: selection.width,
        height: selection.height,
        bytes: selection.data,
      }),
    );
    if (!selectionComplete) reasons.push('selection-payload-mismatch');
  } else if (
    snapshot.selectionMask
    || selectionProof.width !== 0
    || selectionProof.height !== 0
    || selectionProof.byteLength !== 0
    || selectionProof.contentDigest !== undefined
  ) {
    reasons.push('unexpected-selection-payload');
    selectionComplete = false;
  }
  return { complete: reasons.length === 0, selectionComplete, reasons };
}

export function markImageDocumentSnapshotOwned(snapshot: ImageDocumentSnapshot): ImageDocumentSnapshot {
  ownedNamedSnapshots.add(snapshot);
  return snapshot;
}

function collectSnapshotBitmaps(snapshot: ImageDocumentSnapshot, target: Set<LayerBitmap>): void {
  for (const layer of snapshot.layers) {
    if (layer.bitmap) target.add(layer.bitmap);
    if (layer.mask) target.add(layer.mask);
  }
}

function collectDocumentLiveBitmaps(document: ImageDocument, target: Set<LayerBitmap>): void {
  for (const layer of document.layers) {
    if (layer.bitmap) target.add(layer.bitmap);
    if (layer.mask) target.add(layer.mask);
  }
}

/** Release only clones explicitly owned by named snapshots; safe to call repeatedly. */
export function disposeImageDocumentSnapshotResources(
  snapshot: ImageDocumentSnapshot,
  protectedBitmaps: ReadonlySet<LayerBitmap> = new Set(),
): void {
  if (!ownedNamedSnapshots.has(snapshot)) return;
  const bitmaps = new Set<LayerBitmap>();
  collectSnapshotBitmaps(snapshot, bitmaps);
  for (const bitmap of bitmaps) {
    if (protectedBitmaps.has(bitmap)) continue;
    if (bitmap.width !== 0 || bitmap.height !== 0) {
      bitmap.width = 0;
      bitmap.height = 0;
    }
  }
  ownedNamedSnapshots.delete(snapshot);
}

export function disposeImageDocumentSnapshotsRemoved(
  before: ImageDocument,
  after: ImageDocument,
): void {
  const retained = new Set(after.snapshots ?? []);
  const protectedBitmaps = new Set<LayerBitmap>();
  collectDocumentLiveBitmaps(before, protectedBitmaps);
  for (const snapshot of after.snapshots ?? []) collectSnapshotBitmaps(snapshot, protectedBitmaps);
  for (const snapshot of before.snapshots ?? []) {
    if (!retained.has(snapshot)) disposeImageDocumentSnapshotResources(snapshot, protectedBitmaps);
  }
}

export function disposeImageDocumentNamedSnapshots(document: ImageDocument): void {
  const protectedBitmaps = new Set<LayerBitmap>();
  collectDocumentLiveBitmaps(document, protectedBitmaps);
  for (const snapshot of document.snapshots ?? []) {
    disposeImageDocumentSnapshotResources(snapshot, protectedBitmaps);
  }
}

export function captureImageDocumentSelectionState(document: ImageDocument): ImageDocument {
  const selection = document.hasSelection ? getSelection(document.id) : undefined;
  const selectionMask = validSelectionForDocument(selection, document.width, document.height)
    ? toSnapshot(selection)
    : undefined;
  return {
    ...document,
    hasSelection: Boolean(selectionMask),
    selectionMask,
    selectionMaskData: undefined,
  };
}

export function applyImageDocumentSelectionState(document: ImageDocument): ImageDocument {
  const selectionMask = document.hasSelection
    && validSelectionForDocument(document.selectionMask, document.width, document.height)
    ? toSnapshot(document.selectionMask)
    : undefined;
  clearSelection(document.id);
  if (selectionMask) setSelection(document.id, fromSnapshot(selectionMask));
  return {
    ...document,
    hasSelection: Boolean(selectionMask),
    selectionMask: undefined,
    selectionMaskData: undefined,
  };
}

export function createImageDocumentSnapshot(
  doc: ImageDocument,
  name = `Snapshot ${(doc.snapshots?.length ?? 0) + 1}`,
): ImageDocumentSnapshot {
  const createdAt = Date.now();
  const liveSelection = doc.hasSelection ? getSelection(doc.id) : undefined;
  const selectionMask = validSelectionForDocument(liveSelection, doc.width, doc.height)
    ? toSnapshot(liveSelection)
    : undefined;
  const layers = cloneSnapshotLayers(doc.layers);
  return markImageDocumentSnapshotOwned({
    id: `snapshot-${createdAt}-${Math.floor(Math.random() * 1000)}`,
    name: normalizeSnapshotName(name, doc),
    createdAt,
    width: doc.width,
    height: doc.height,
    layers,
    activeLayerId: doc.activeLayerId,
    hasSelection: Boolean(selectionMask),
    selectionVersion: doc.selectionVersion,
    ...(selectionMask ? { selectionMask } : {}),
    pixelState: 'complete',
    integrity: buildImageDocumentSnapshotIntegrity(layers, selectionMask),
  });
}

export function addImageDocumentSnapshot(
  doc: ImageDocument,
  snapshot: ImageDocumentSnapshot = createImageDocumentSnapshot(doc),
  options: { deferDisposal?: boolean } = {},
): ImageDocument {
  const next = {
    ...doc,
    snapshots: [...(doc.snapshots ?? []), snapshot].slice(-IMAGE_DOCUMENT_MAX_SNAPSHOTS),
    dirty: true,
  };
  if (!options.deferDisposal) disposeImageDocumentSnapshotsRemoved(doc, next);
  return next;
}

export function restoreImageDocumentSnapshot(
  doc: ImageDocument,
  snapshotId: string,
): ImageDocument {
  const snapshot = doc.snapshots?.find((candidate) => candidate.id === snapshotId);
  if (!snapshot || !hasValidSnapshotDimensions(snapshot) || !inspectImageDocumentSnapshotIntegrity(snapshot).complete) return doc;
  const selectionMask = snapshot.hasSelection && snapshot.selectionMask
    ? toSnapshot(snapshot.selectionMask)
    : undefined;
  if (selectionMask) {
    setSelection(doc.id, fromSnapshot(selectionMask));
  } else {
    clearSelection(doc.id);
  }
  return {
    ...doc,
    width: getRestorableSnapshotDimension(snapshot.width, doc.width),
    height: getRestorableSnapshotDimension(snapshot.height, doc.height),
    layers: restoreSnapshotLayers(snapshot.layers),
    activeLayerId: snapshot.activeLayerId,
    hasSelection: Boolean(selectionMask),
    selectionVersion: snapshot.selectionVersion + 1,
    ...(selectionMask ? { selectionMask } : { selectionMask: undefined }),
    selectionMaskData: undefined,
    dirty: true,
  };
}

function getRestorableSnapshotDimension(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function restoreSnapshotLayers(snapshotLayers: ImageLayer[]): ImageLayer[] {
  return cloneSnapshotLayers(snapshotLayers);
}

function cloneSnapshotLayers(layers: readonly ImageLayer[]): ImageLayer[] {
  const bitmapClones = new Map<NonNullable<ImageLayer['bitmap']>, NonNullable<ImageLayer['bitmap']>>();
  const cloneLayerBitmap = (bitmap: ImageLayer['bitmap']): ImageLayer['bitmap'] => {
    if (!bitmap) return null;
    const existing = bitmapClones.get(bitmap);
    if (existing) return existing;
    const cloned = cloneBitmap(bitmap);
    bitmapClones.set(bitmap, cloned);
    return cloned;
  };
  return layers.map((layer) => {
    const { bitmap, mask, ...serializable } = layer;
    const clonedSerializable = typeof structuredClone === 'function'
      ? structuredClone(serializable)
      : JSON.parse(JSON.stringify(serializable)) as typeof serializable;
    return {
      ...clonedSerializable,
      bitmap: cloneLayerBitmap(bitmap),
      mask: cloneLayerBitmap(mask),
    };
  });
}

function hasValidSnapshotDimensions(snapshot: ImageDocumentSnapshot): boolean {
  return Number.isFinite(snapshot.width)
    && Number.isFinite(snapshot.height)
    && snapshot.width > 0
    && snapshot.height > 0;
}

function compactSnapshotName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').slice(0, 80);
}

function buildNamedSnapshotReadiness(snapshot: ImageDocumentSnapshot): ImageNamedSnapshotReadiness {
  const blockers: ImageSnapshotReadinessIssue[] = [];
  const warnings: ImageSnapshotReadinessIssue[] = [];

  if (!hasValidSnapshotDimensions(snapshot)) {
    blockers.push({
      code: 'invalid-snapshot-dimensions',
      severity: 'error',
      snapshotId: snapshot.id,
      message: `Snapshot ${snapshot.id} has invalid stored dimensions.`,
    });
  }

  const integrity = inspectImageDocumentSnapshotIntegrity(snapshot);
  if (snapshot.pixelState !== 'complete') {
    blockers.push({
      code: 'snapshot-pixels-unavailable',
      severity: 'error',
      snapshotId: snapshot.id,
      message: `Snapshot ${snapshot.id} predates pixel-complete snapshots and cannot be restored safely.`,
    });
  }

  if (snapshot.pixelState === 'complete' && !snapshot.integrity) {
    blockers.push({
      code: 'snapshot-integrity-unproven',
      severity: 'error',
      snapshotId: snapshot.id,
      message: `Snapshot ${snapshot.id} has no cryptographic pixel manifest and cannot be restored safely.`,
    });
  } else if (snapshot.pixelState === 'complete' && !integrity.complete) {
    blockers.push({
      code: integrity.selectionComplete ? 'snapshot-integrity-unproven' : 'snapshot-selection-unavailable',
      severity: 'error',
      snapshotId: snapshot.id,
      message: `Snapshot ${snapshot.id} does not match its stored pixel/selection content digest manifest.`,
    });
  }

  if (snapshot.layers.length === 0) {
    warnings.push({
      code: 'empty-snapshot-layers',
      severity: 'warning',
      snapshotId: snapshot.id,
      message: `Snapshot ${snapshot.id} contains no layer records.`,
    });
  }

  const restorable = blockers.length === 0;
  const signaturePayload = {
    id: snapshot.id,
    name: snapshot.name,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt ?? null,
    width: snapshot.width,
    height: snapshot.height,
    layerCount: snapshot.layers.length,
    activeLayerId: snapshot.activeLayerId,
    hasSelection: snapshot.hasSelection,
    selectionVersion: snapshot.selectionVersion,
    restorable,
    blockerCodes: blockers.map((blocker) => blocker.code),
    warningCodes: warnings.map((warning) => warning.code),
  };

  return {
    id: snapshot.id,
    name: snapshot.name,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt ?? null,
    width: snapshot.width,
    height: snapshot.height,
    layerCount: snapshot.layers.length,
    activeLayerId: snapshot.activeLayerId,
    hasSelection: snapshot.hasSelection,
    selectionVersion: snapshot.selectionVersion,
    restorable,
    blockers,
    warnings,
    previewSignature: `image-history-snapshot:v1:${JSON.stringify(signaturePayload)}`,
  };
}

function buildSnapshotRenameReadiness(
  doc: ImageDocument,
  rename?: {
    snapshotId?: string | null;
    draftName?: string;
  },
): ImageSnapshotRenameReadiness {
  const targetSnapshotId = rename?.snapshotId ?? null;
  const target = targetSnapshotId
    ? (doc.snapshots ?? []).find((snapshot) => snapshot.id === targetSnapshotId) ?? null
    : null;
  const draftName = compactSnapshotName(rename?.draftName ?? '');
  const blockers: ImageSnapshotReadinessIssue[] = [];
  const warnings: ImageSnapshotReadinessIssue[] = [];

  if (rename && !target) {
    blockers.push({
      code: 'missing-snapshot',
      severity: 'error',
      snapshotId: targetSnapshotId ?? undefined,
      message: targetSnapshotId
        ? `Snapshot ${targetSnapshotId} does not exist.`
        : 'No snapshot is selected for rename.',
    });
  }

  if (rename && draftName.length === 0) {
    blockers.push({
      code: 'blank-snapshot-name',
      severity: 'error',
      snapshotId: targetSnapshotId ?? undefined,
      message: 'Snapshot rename requires a non-empty name.',
    });
  }

  const unchanged = Boolean(target && draftName === target.name);
  if (rename && unchanged) {
    warnings.push({
      code: 'unchanged-snapshot-name',
      severity: 'warning',
      snapshotId: targetSnapshotId ?? undefined,
      message: `Snapshot ${targetSnapshotId ?? ''} already uses this name.`,
    });
  }

  const supported = Boolean(target && draftName.length > 0);
  const willUpdate = supported && !unchanged && blockers.length === 0;
  const signaturePayload = {
    snapshotId: targetSnapshotId,
    targetExists: Boolean(target),
    currentName: target?.name ?? null,
    draftName,
    willUpdate,
    blockerCodes: blockers.map((blocker) => blocker.code),
    warningCodes: warnings.map((warning) => warning.code),
  };

  return {
    supported,
    targetSnapshotId,
    targetExists: Boolean(target),
    currentName: target?.name ?? null,
    draftName,
    unchanged,
    willUpdate,
    blockers,
    warnings,
    signature: `image-history-snapshot-rename:v1:${JSON.stringify(signaturePayload)}`,
  };
}

export function buildImageSnapshotReadinessDescriptor(input: {
  doc: ImageDocument;
  rename?: {
    snapshotId?: string | null;
    draftName?: string;
  };
}): ImageSnapshotReadinessDescriptor {
  const snapshots = input.doc.snapshots ?? [];
  const namedSnapshots = snapshots.map(buildNamedSnapshotReadiness);
  const capacityWarning: ImageSnapshotReadinessIssue[] = snapshots.length >= IMAGE_DOCUMENT_MAX_SNAPSHOTS
    ? [{
      code: 'snapshot-limit-reached',
      severity: 'warning',
      message: `Only the most recent ${IMAGE_DOCUMENT_MAX_SNAPSHOTS} Image snapshots are retained.`,
    }]
    : [];
  const rename = buildSnapshotRenameReadiness(input.doc, input.rename);
  const blockers = [
    ...namedSnapshots.flatMap((snapshot) => snapshot.blockers),
    ...rename.blockers,
  ];
  const warnings = [
    ...namedSnapshots.flatMap((snapshot) => snapshot.warnings),
    ...capacityWarning,
    ...rename.warnings,
  ];
  const snapshotSignatures = namedSnapshots.map((snapshot) => snapshot.previewSignature);
  const namedSnapshotSignaturePayload = {
    documentId: input.doc.id,
    snapshotSignatures,
  };
  const previewSignaturePayload = {
    document: {
      id: input.doc.id,
      width: input.doc.width,
      height: input.doc.height,
      layerCount: input.doc.layers.length,
      activeLayerId: input.doc.activeLayerId,
      hasSelection: input.doc.hasSelection,
    },
    snapshotSignatures,
    renameSignature: rename.signature,
    blockerCodes: blockers.map((blocker) => blocker.code),
    warningCodes: warnings.map((warning) => warning.code),
  };

  return {
    descriptorId: 'image-history-snapshots-readiness:v1',
    document: {
      id: input.doc.id,
      title: input.doc.title,
      width: input.doc.width,
      height: input.doc.height,
      layerCount: input.doc.layers.length,
      activeLayerId: input.doc.activeLayerId,
      hasSelection: input.doc.hasSelection,
      dirty: input.doc.dirty,
    },
    capacity: {
      maxSnapshots: IMAGE_DOCUMENT_MAX_SNAPSHOTS,
      count: snapshots.length,
      remaining: Math.max(0, IMAGE_DOCUMENT_MAX_SNAPSHOTS - snapshots.length),
      canCreate: snapshots.length < IMAGE_DOCUMENT_MAX_SNAPSHOTS,
    },
    namedSnapshots: {
      count: namedSnapshots.length,
      hasNamedSnapshots: namedSnapshots.length > 0,
      snapshots: namedSnapshots,
      signature: `image-history-named-snapshots:v1:${JSON.stringify(namedSnapshotSignaturePayload)}`,
    },
    rename,
    automationMetadata: {
      workspaceId: 'image-automation',
      separateFromMainFlow: true,
      bindingReadiness: 'ready-for-review',
      supportsNamedSnapshotVariables: true,
      supportsArbitraryJsExpressions: false,
      snapshotVariableTargets: namedSnapshots.filter((snapshot) => snapshot.restorable).map((snapshot) => snapshot.id),
    },
    blockers,
    warnings,
    preview: {
      id: `image-history-snapshots-preview:${input.doc.id}:${namedSnapshots.length}-snapshots:${blockers.length}-blockers`,
      signature: `image-history-snapshots-readiness:v1:${JSON.stringify(previewSignaturePayload)}`,
    },
  };
}

export function deleteImageDocumentSnapshot(
  doc: ImageDocument,
  snapshotId: string,
  options: { deferDisposal?: boolean } = {},
): ImageDocument {
  const next = {
    ...doc,
    snapshots: (doc.snapshots ?? []).filter((snapshot) => snapshot.id !== snapshotId),
    dirty: true,
  };
  if (!options.deferDisposal) disposeImageDocumentSnapshotsRemoved(doc, next);
  return next;
}

export function renameImageDocumentSnapshot(
  doc: ImageDocument,
  snapshotId: string,
  name: string,
  updatedAt = Date.now(),
): ImageDocument {
  const normalizedName = normalizeSnapshotName(name, doc);
  if (!name.trim()) return doc;
  let changed = false;
  const snapshots = (doc.snapshots ?? []).map((snapshot) => {
    if (snapshot.id !== snapshotId || snapshot.name === normalizedName) return snapshot;
    changed = true;
    return {
      ...snapshot,
      name: normalizedName,
      updatedAt,
    };
  });
  return changed ? { ...doc, snapshots, dirty: true } : doc;
}

function normalizeSnapshotName(name: string, doc: ImageDocument): string {
  const normalized = compactSnapshotName(name);
  return normalized.length > 0 ? normalized : `Snapshot ${(doc.snapshots?.length ?? 0) + 1}`;
}
