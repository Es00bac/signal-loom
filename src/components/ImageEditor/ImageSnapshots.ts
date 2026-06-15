import type { ImageDocument, ImageDocumentSnapshot, ImageLayer } from '../../types/imageEditor';

export const IMAGE_DOCUMENT_MAX_SNAPSHOTS = 12;

export type ImageSnapshotReadinessIssueCode =
  | 'invalid-snapshot-dimensions'
  | 'empty-snapshot-layers'
  | 'missing-snapshot'
  | 'blank-snapshot-name'
  | 'unchanged-snapshot-name'
  | 'snapshot-limit-reached';

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

export function createImageDocumentSnapshot(
  doc: ImageDocument,
  name = `Snapshot ${(doc.snapshots?.length ?? 0) + 1}`,
): ImageDocumentSnapshot {
  const createdAt = Date.now();
  return {
    id: `snapshot-${createdAt}-${Math.floor(Math.random() * 1000)}`,
    name: normalizeSnapshotName(name, doc),
    createdAt,
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
    snapshots: [...(doc.snapshots ?? []), snapshot].slice(-IMAGE_DOCUMENT_MAX_SNAPSHOTS),
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
      snapshotVariableTargets: namedSnapshots.map((snapshot) => snapshot.id),
    },
    blockers,
    warnings,
    preview: {
      id: `image-history-snapshots-preview:${input.doc.id}:${namedSnapshots.length}-snapshots:${blockers.length}-blockers`,
      signature: `image-history-snapshots-readiness:v1:${JSON.stringify(previewSignaturePayload)}`,
    },
  };
}

export function deleteImageDocumentSnapshot(doc: ImageDocument, snapshotId: string): ImageDocument {
  return {
    ...doc,
    snapshots: (doc.snapshots ?? []).filter((snapshot) => snapshot.id !== snapshotId),
    dirty: true,
  };
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
