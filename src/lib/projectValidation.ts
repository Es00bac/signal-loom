import type { Edge } from '@xyflow/react';
import type { EditorWorkspaceSnapshot } from '../store/editorStore';
import type { ImageEditorProjectSnapshot } from '../store/imageEditorStore';
import type { SourceBinLibraryItem, SourceBinProjectSnapshot } from '../store/sourceBinStore';
import type { AppNode, EditorSourceKind, EnvelopeItem, NodeData, NodeResultAttempt, ResultType, WorkspaceView } from '../types/flow';
import type {
  PaperDocumentSnapshot,
  PaperQuarantinedDocumentRecovery,
  PaperSnapshotRecovery,
  PaperTool,
  PaperWorkspaceDocumentSnapshot,
} from '../types/paper';
import { mergePaperSnapshotRecovery, sanitizePaperSnapshotRecovery } from './paperSnapshotRecovery';
import { sanitizePaperPortableAssetsSection } from '../features/paper/assets/PaperPortableAssets';
import { isBinaryAssetRef, type BinaryAssetId } from '../shared/assets/contentAddressedAsset';
import type {
  ImageDocumentSnapshot,
  ImageDocumentSnapshotAssetIntegrity,
  ImageDocumentSnapshotIntegrity,
  ImageLayer,
  ImageLayerEditTarget,
  ImageQuickActionMacro,
  LayerType,
} from '../types/imageEditor';
import type { FlowProjectDocument } from './projectLibrary';
import {
  buildDefaultFlowWorkspace,
  DEFAULT_FLOW_WORKSPACE_ID,
  DEFAULT_FLOW_WORKSPACE_NAME,
  findActiveFlowWorkspace,
  type FlowWorkspaceProjectSnapshot,
} from './flowProjectWorkspaces';
import { buildFlowNodeGeneratedResultPatch, collectSourceBinItemsForFlowNode } from './flowNodeResultRestore';
import { buildMediaAssetSignaturePart } from './mediaAssetSignature';
import { CURRENT_PROJECT_SCHEMA_VERSION, isFlowNodeType } from './projectSchema';
import { sanitizeProjectUsageLedgerSnapshot } from './projectUsageLedger';
import { sanitizeImageLayerLocks } from './imageLayerLocks';
import {
  assertImageDocumentSnapshotDecodeBounds,
  IMAGE_PROJECT_MAX_SNAPSHOT_LAYERS,
  IMAGE_PROJECT_MAX_SNAPSHOT_METADATA_BYTES,
  IMAGE_PROJECT_MAX_SNAPSHOT_STRUCTURAL_RESOURCES,
  IMAGE_PROJECT_MAX_SNAPSHOTS,
} from '../components/ImageEditor/ImageSnapshots';
import {
  omitImageLayerLinkGroup,
  sanitizeImageLayerLinkGroupId,
} from './imageLayerLinks';
import {
  sanitizeImageLayerMaskDensity,
  sanitizeImageLayerMaskFeather,
} from '../components/ImageEditor/ImageLayerMask';
import {
  isPlausibleSavedSelectionChannelData,
  sanitizeSavedSelectionChannelName,
  truncateSavedSelectionChannels,
} from '../components/ImageEditor/ImageSelectionChannels';
import { sanitizeImageSpotChannelName } from '../components/ImageEditor/ImageSpotChannels';
import { isPaperManagedIccProfile } from './paperManagedIccProfiles';
import { normalizeBundledFontFaceState, normalizeBundledFontFaceStateForTypography } from './bundledFontLibrary';
import { getEditorAssets } from './editorAssets';
import { getEditorVisualClips } from './manualEditorState';
import { getEditorStageObjects } from './editorStageObjects';

const VALID_RESULT_TYPES = new Set<ResultType>(['text', 'number', 'boolean', 'json', 'image', 'video', 'audio', 'package', 'list', 'envelope']);
const VALID_SOURCE_KINDS = new Set<EditorSourceKind>(['text', 'image', 'video', 'audio', 'composition', 'document', 'subtitle', 'package']);
const VALID_WORKSPACE_VIEWS = new Set<WorkspaceView>(['flow', 'editor', 'image', 'paper']);
const VALID_PAPER_TOOLS = new Set<PaperTool>([
  'select', 'hand', 'text', 'image', 'speech', 'thought', 'caption', 'panel', 'shape', 'line', 'ellipse', 'triangle', 'pentagon', 'hexagon', 'gutterKnife',
]);

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function sanitizeResultHistory(value: unknown): NodeResultAttempt[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return [];

  return value.flatMap((attempt, index) => {
    if (!isRecord(attempt)) return [];
    const resultType = optionalString(attempt.resultType);
    const result = resultType === 'boolean'
      ? (typeof attempt.result === 'boolean'
        ? attempt.result
        : attempt.result === 'true'
          ? true
          : attempt.result === 'false'
            ? false
            : undefined)
      : optionalString(attempt.result);

    if (result === undefined || result === '' || !resultType || !VALID_RESULT_TYPES.has(resultType as ResultType)) {
      return [];
    }

    return [{
      id: stringValue(attempt.id, `attempt-${index}`),
      result,
      resultType: resultType as ResultType,
      statusMessage: stringValue(attempt.statusMessage, 'Restored result'),
      createdAt: stringValue(attempt.createdAt, new Date(0).toISOString()),
      usage: isRecord(attempt.usage) ? attempt.usage as unknown as NodeResultAttempt['usage'] : undefined,
    }];
  });
}

function sanitizeEnvelopeItems(value: unknown): EnvelopeItem[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return [];

  const seenIds = new Set<string>();
  const seenSourceBinItemIds = new Set<string>();
  const seenSignatures = new Set<string>();

  const rawItems = value.flatMap((item, index) => {
    if (!isRecord(item)) return [];
    const val = optionalString(item.value);
    const kind = optionalString(item.kind);
    if (val === undefined || !kind || !VALID_RESULT_TYPES.has(kind as ResultType)) return [];

    const id = stringValue(item.id, `envelope-item-${index}`);
    const sourceBinItemId = optionalString(item.sourceBinItemId);
    const sourceNodeId = optionalString(item.sourceNodeId);

    const sigPart = buildMediaAssetSignaturePart(val);
    const signature = `${kind}:${sigPart}`;

    if (seenIds.has(id)) return [];
    if (sourceBinItemId && seenSourceBinItemIds.has(sourceBinItemId)) return [];
    if (seenSignatures.has(signature)) return [];

    seenIds.add(id);
    if (sourceBinItemId) seenSourceBinItemIds.add(sourceBinItemId);
    seenSignatures.add(signature);

    return [{
      id,
      index: optionalNumber(item.index) ?? index,
      kind: kind as ResultType,
      label: stringValue(item.label, `Envelope item ${index + 1}`),
      value: val,
      mimeType: optionalString(item.mimeType),
      sourceBinItemId,
      sourceNodeId,
      usage: isRecord(item.usage) ? item.usage as unknown as EnvelopeItem['usage'] : undefined,
    }];
  });

  const sorted = rawItems.sort((left, right) => left.index - right.index);

  return sorted.map((item, index) => {
    let cleanSourceNodeId = item.sourceNodeId;
    if (cleanSourceNodeId) {
      const parts = cleanSourceNodeId.split(':');
      if (parts.length > 2) {
        cleanSourceNodeId = `${parts[0]}:${parts[1]}`;
      }
    }

    return {
      ...item,
      index,
      sourceNodeId: cleanSourceNodeId,
    };
  });
}

function restoreSelectedResultFromHistory(data: NodeData, history: NodeResultAttempt[]): void {
  if (history.length === 0) return;
  const selectedResultId = typeof data.selectedResultId === 'string' ? data.selectedResultId : undefined;
  const selected = history.find((attempt) => attempt.id === selectedResultId) ?? history[history.length - 1];
  if (!selected) return;

  data.selectedResultId = selected.id;
  data.result = selected.result;
  data.resultType = selected.resultType;
  data.usage = selected.usage;
}

function sanitizeNodeData(value: unknown): NodeData {
  const data: NodeData = isRecord(value) ? { ...value } : {};
  const history = sanitizeResultHistory(data.resultHistory);
  const envelopeItems = sanitizeEnvelopeItems(data.envelopeItems);

  delete data.onChange;
  delete data.onRun;
  delete data.onSelectAttempt;
  data.isRunning = undefined;
  data.error = undefined;
  data.statusMessage = undefined;

  if (history !== undefined) {
    data.resultHistory = history;
    if (data.selectedResultId && !history.some((attempt) => attempt.id === data.selectedResultId)) {
      data.selectedResultId = history[history.length - 1]?.id;
    }
    restoreSelectedResultFromHistory(data, history);
  }

  if (envelopeItems !== undefined) {
    data.envelopeItems = envelopeItems;
  }

  if (data.editorAssets !== undefined) data.editorAssets = getEditorAssets(data);
  if (data.editorVisualClips !== undefined) data.editorVisualClips = getEditorVisualClips(data);
  if (data.editorStageObjects !== undefined) data.editorStageObjects = getEditorStageObjects(data);

  return data;
}

function normalizeVisionVerifyNodeData(data: NodeData): NodeData {
  if (data.result === true || data.result === false) {
    return { ...data, resultType: 'boolean' };
  }

  // AUD-033 stored the old string wire form with a text tag. Convert saved
  // verify decisions while loading so an old selected attempt cannot re-open
  // as a text result.
  if (data.result === 'true' || data.result === 'false') {
    return { ...data, result: data.result === 'true', resultType: 'boolean' };
  }

  return data;
}

export function sanitizeFlowSnapshot(snapshot: unknown): FlowProjectDocument['flow'] {
  if (!isRecord(snapshot) || !Array.isArray(snapshot.nodes) || !Array.isArray(snapshot.edges)) {
    throw new Error('The selected file is not a valid Sloom Studio .sloom project: flow nodes and edges must be arrays.');
  }

  const seenNodeIds = new Set<string>();
  const nodes = snapshot.nodes.flatMap((node, index): AppNode[] => {
    if (!isRecord(node)) return [];

    const rawType = node.type === 'input' ? 'textNode' : node.type;
    if (!isFlowNodeType(rawType)) {
      return [];
    }

    const id = stringValue(node.id, `node-${index}`);
    if (seenNodeIds.has(id)) return [];
    seenNodeIds.add(id);

    const rawPosition = isRecord(node.position) ? node.position : undefined;
    return [{
      ...node,
      id,
      type: rawType,
      position: {
        x: finiteNumber(rawPosition?.x, 0),
        y: finiteNumber(rawPosition?.y, 0),
      },
      data: rawType === 'visionVerifyNode'
        ? normalizeVisionVerifyNodeData(sanitizeNodeData(node.data))
        : sanitizeNodeData(node.data),
    } as AppNode];
  });

  const validNodeIds = new Set(nodes.map((node) => node.id));
  const seenEdgeIds = new Set<string>();
  const edges = snapshot.edges.flatMap((edge, index): Edge[] => {
    if (!isRecord(edge)) return [];
    const source = optionalString(edge.source);
    const target = optionalString(edge.target);

    if (!source || !target || !validNodeIds.has(source) || !validNodeIds.has(target)) {
      return [];
    }

    const id = stringValue(edge.id, `${source}-${target}-${index}`);
    if (seenEdgeIds.has(id)) return [];
    seenEdgeIds.add(id);

    return [{
      ...edge,
      id,
      source,
      target,
      sourceHandle: optionalString(edge.sourceHandle),
      targetHandle: optionalString(edge.targetHandle),
    } as Edge];
  });

  return {
    version: finiteNumber(snapshot.version, 3),
    nodes,
    edges,
  };
}

export function sanitizeEditorSnapshot(snapshot: unknown): Partial<EditorWorkspaceSnapshot> | undefined {
  if (snapshot === undefined) return undefined;
  if (!isRecord(snapshot)) return undefined;

  return {
    workspaceView: VALID_WORKSPACE_VIEWS.has(snapshot.workspaceView as WorkspaceView) ? snapshot.workspaceView as WorkspaceView : 'flow',
    activeSourceBinId: optionalString(snapshot.activeSourceBinId),
    activeCompositionId: optionalString(snapshot.activeCompositionId),
    selectedSourceItemId: optionalString(snapshot.selectedSourceItemId),
    selectedVisualClipId: optionalString(snapshot.selectedVisualClipId),
    selectedAudioClipId: optionalString(snapshot.selectedAudioClipId),
    sourceBinTab: snapshot.sourceBinTab === 'editorAssets' ? 'editorAssets' : 'media',
    sourceMonitorVisible: typeof snapshot.sourceMonitorVisible === 'boolean' ? snapshot.sourceMonitorVisible : undefined,
    programMonitorVisible: typeof snapshot.programMonitorVisible === 'boolean' ? snapshot.programMonitorVisible : undefined,
    inspectorVisible: typeof snapshot.inspectorVisible === 'boolean' ? snapshot.inspectorVisible : undefined,
    sourceBinVisible: typeof snapshot.sourceBinVisible === 'boolean' ? snapshot.sourceBinVisible : undefined,
    sourceMonitorWidth: optionalNumber(snapshot.sourceMonitorWidth),
    inspectorWidth: optionalNumber(snapshot.inspectorWidth),
    sourceBinWidth: optionalNumber(snapshot.sourceBinWidth),
    monitorSplitPercent: optionalNumber(snapshot.monitorSplitPercent),
    monitorSectionHeight: optionalNumber(snapshot.monitorSectionHeight),
    timelineVisualTrackHeight: optionalNumber(snapshot.timelineVisualTrackHeight),
    timelineAudioTrackHeight: optionalNumber(snapshot.timelineAudioTrackHeight),
  };
}

function sanitizeSourceBinItem(item: unknown, index: number): (SourceBinLibraryItem & { assetUrl?: string }) | undefined {
  if (!isRecord(item)) return undefined;
  const rawKind = optionalString(item.kind);
  if (!rawKind || !VALID_SOURCE_KINDS.has(rawKind as EditorSourceKind)) return undefined;
  const kind = rawKind as EditorSourceKind;
  const assetUrl = optionalString(item.assetUrl);
  const assetId = optionalString(item.assetId);
  const scratchFileName = optionalString(item.scratchFileName);
  const nativeFilePath = optionalString(item.nativeFilePath);
  const text = optionalString(item.text);

  if (kind === 'text' && !text && !assetUrl) return undefined;
  if (kind !== 'text' && !assetUrl && !assetId && !scratchFileName && !nativeFilePath) return undefined;

  const rawOriginNodeId = optionalString(item.originNodeId);
  let cleanOriginNodeId = rawOriginNodeId;
  if (cleanOriginNodeId) {
    const baseNodeIdAndIndex = cleanOriginNodeId.match(/^([^:]+):(\d+)/);
    if (baseNodeIdAndIndex) {
      cleanOriginNodeId = `${baseNodeIdAndIndex[1]}:${baseNodeIdAndIndex[2]}`;
    }
  }

  return {
    id: stringValue(item.id, `source-item-${index}`),
    label: stringValue(item.label, kind),
    kind,
    mimeType: optionalString(item.mimeType),
    assetId,
    assetUrl,
    scratchFileName,
    nativeFilePath,
    text,
    createdAt: finiteNumber(item.createdAt, Date.now()),
    sourceKey: optionalString(item.sourceKey),
    originNodeId: cleanOriginNodeId,
    starred: Boolean(item.starred),
    collapsed: Boolean(item.collapsed),
    envelopeId: optionalString(item.envelopeId),
    envelopeLabel: optionalString(item.envelopeLabel),
    envelopeIndex: optionalNumber(item.envelopeIndex),
  };
}

export function sanitizeSourceBinSnapshot(snapshot: unknown): SourceBinProjectSnapshot | undefined {
  if (snapshot === undefined) return undefined;
  if (!isRecord(snapshot)) return undefined;

  const flatItems = Array.isArray(snapshot.items)
    ? snapshot.items.flatMap((item, index) => sanitizeSourceBinItem(item, index) ?? [])
    : undefined;
  const bins = Array.isArray(snapshot.bins)
    ? snapshot.bins.flatMap((bin, binIndex) => {
        if (!isRecord(bin)) return [];
        const items = Array.isArray(bin.items)
          ? bin.items.flatMap((item, itemIndex) => sanitizeSourceBinItem(item, itemIndex) ?? [])
          : [];
        return [{
          id: stringValue(bin.id, binIndex === 0 ? 'default' : `bin-${binIndex}`),
          name: stringValue(bin.name, binIndex === 0 ? 'Source Library' : `Bin ${binIndex + 1}`),
          items,
          collapsed: Boolean(bin.collapsed),
          createdAt: finiteNumber(bin.createdAt, Date.now()),
        }];
      })
    : undefined;

  return {
    bins: bins && bins.length > 0 ? bins : undefined,
    items: bins && bins.length > 0 ? undefined : flatItems,
    dismissedSourceKeys: Array.isArray(snapshot.dismissedSourceKeys)
      ? snapshot.dismissedSourceKeys.filter((key): key is string => typeof key === 'string')
      : [],
  };
}

export function sanitizePaperSnapshot(snapshot: unknown): Partial<PaperDocumentSnapshot> | undefined {
  if (snapshot === undefined || !isRecord(snapshot)) return undefined;

  const repairs: string[] = [];
  const quarantined: PaperQuarantinedDocumentRecovery[] = [];
  const priorRecovery = sanitizePaperSnapshotRecovery(snapshot.recovery);

  // Tabs are validated independently: one malformed or duplicated entry must never blank the
  // remaining valid documents. Failures are quarantined with their original payload instead.
  let documents: PaperWorkspaceDocumentSnapshot[] | undefined;
  let hadDocumentEntries = false;
  if (snapshot.documents !== undefined) {
    if (!Array.isArray(snapshot.documents)) {
      repairs.push('The saved Paper tab list was malformed; fell back to the active document.');
    } else if (snapshot.documents.length > 0) {
      hadDocumentEntries = true;
      const validDocuments: PaperWorkspaceDocumentSnapshot[] = [];
      snapshot.documents.forEach((candidate, index) => {
        const result = sanitizePaperWorkspaceDocumentSnapshot(candidate, index);
        if (result.ok) {
          repairs.push(...result.repairs);
          validDocuments.push(result.snapshot);
        } else {
          quarantined.push(buildPaperQuarantineEntry(candidate, index, result.reason));
        }
      });
      const seenTabIds = new Set<string>();
      const dedupedDocuments = validDocuments.map((workspaceDocument) => {
        let id = workspaceDocument.id;
        if (seenTabIds.has(id)) {
          let suffix = 2;
          while (seenTabIds.has(`${workspaceDocument.id}-${suffix}`)) suffix += 1;
          id = `${workspaceDocument.id}-${suffix}`;
          repairs.push(`Duplicate Paper tab id "${workspaceDocument.id}" was renamed to "${id}".`);
        }
        seenTabIds.add(id);
        return id === workspaceDocument.id ? workspaceDocument : { ...workspaceDocument, id };
      });
      if (dedupedDocuments.length > 0) documents = dedupedDocuments;
    }
  }

  let activeDocument: PaperWorkspaceDocumentSnapshot | undefined;
  if (documents) {
    const requestedActiveId = typeof snapshot.activeDocumentId === 'string' ? snapshot.activeDocumentId : undefined;
    activeDocument = documents.find((candidate) => candidate.id === requestedActiveId) ?? documents[0];
  } else {
    const legacyResult = sanitizePaperWorkspaceDocumentSnapshot({
      id: typeof snapshot.activeDocumentId === 'string'
        ? snapshot.activeDocumentId
        : isRecord(snapshot.document) ? stringValue(snapshot.document.id, 'paper-document') : 'paper-document',
      document: snapshot.document,
      selectedPageId: snapshot.selectedPageId,
      selectedFrameId: snapshot.selectedFrameId,
      selectedFrameIds: snapshot.selectedFrameIds,
      tool: snapshot.tool,
      zoom: snapshot.zoom,
    });
    if (legacyResult.ok) {
      repairs.push(...legacyResult.repairs);
      activeDocument = legacyResult.snapshot;
    }
  }

  if (!activeDocument) {
    // Nothing restorable. When tabs were declared, surface the quarantined payloads explicitly so
    // the workspace opens with a recoverable diagnostic; a snapshot that never had a valid shape
    // keeps the historical undefined result.
    const recovery = mergePaperSnapshotRecovery(priorRecovery, buildPaperSnapshotRecovery(quarantined, repairs));
    return hadDocumentEntries && recovery ? { recovery } : undefined;
  }

  const assetIds = [...new Set((documents ?? [activeDocument]).flatMap((candidate) => candidate.assetIds ?? []))].sort();
  if (snapshot.assetIds !== undefined) {
    if (!Array.isArray(snapshot.assetIds)) {
      repairs.push('The saved Paper asset inventory was malformed; recomputed from document content.');
    } else {
      const declaredAssetIds = snapshot.assetIds.filter((assetId): assetId is BinaryAssetId => isBinaryAssetId(assetId));
      if (declaredAssetIds.length !== snapshot.assetIds.length || !samePaperAssetIds(assetIds, declaredAssetIds)) {
        repairs.push('The saved Paper asset inventory was stale; recomputed from document content.');
      }
    }
  }

  const recovery = mergePaperSnapshotRecovery(priorRecovery, buildPaperSnapshotRecovery(quarantined, repairs));
  return {
    document: activeDocument.document,
    assetIds,
    selectedPageId: activeDocument.selectedPageId,
    selectedFrameId: activeDocument.selectedFrameId,
    selectedFrameIds: activeDocument.selectedFrameIds,
    tool: activeDocument.tool,
    zoom: activeDocument.zoom,
    documents,
    activeDocumentId: documents ? activeDocument.id : undefined,
    ...(recovery ? { recovery } : {}),
  };
}

type PaperWorkspaceDocumentSanitizeResult =
  | { ok: true; snapshot: PaperWorkspaceDocumentSnapshot; repairs: string[] }
  | { ok: false; reason: 'malformed-document' | 'invalid-asset-reference' };

function sanitizePaperWorkspaceDocumentSnapshot(
  value: unknown,
  index = 0,
): PaperWorkspaceDocumentSanitizeResult {
  if (!isRecord(value) || !isRecord(value.document) || !Array.isArray(value.document.pages)) {
    return { ok: false, reason: 'malformed-document' };
  }
  const assetIds = collectPaperSnapshotAssetIds(value.document);
  if (!assetIds) return { ok: false, reason: 'invalid-asset-reference' };
  const id = stringValue(value.id, `paper-document-${index + 1}`);
  // The declared inventory is advisory — reachability is always recomputed from content — so a
  // stale list (e.g. captured before save-time locator remapping) is repaired, not discarded.
  const repairs: string[] = [];
  if (value.assetIds !== undefined) {
    if (!Array.isArray(value.assetIds)) {
      repairs.push(`Paper tab "${id}": the saved asset inventory was malformed; recomputed from document content.`);
    } else {
      const declaredAssetIds = value.assetIds.filter((assetId): assetId is BinaryAssetId => isBinaryAssetId(assetId));
      if (declaredAssetIds.length !== value.assetIds.length || !samePaperAssetIds(assetIds, declaredAssetIds)) {
        repairs.push(`Paper tab "${id}": the saved asset inventory was stale; recomputed from document content.`);
      }
    }
  }
  return {
    ok: true,
    repairs,
    snapshot: {
      id,
      document: value.document as unknown as PaperWorkspaceDocumentSnapshot['document'],
      assetIds,
      selectedPageId: optionalString(value.selectedPageId),
      selectedFrameId: optionalString(value.selectedFrameId),
      selectedFrameIds: Array.isArray(value.selectedFrameIds)
        ? value.selectedFrameIds.filter((frameId): frameId is string => typeof frameId === 'string')
        : undefined,
      tool: VALID_PAPER_TOOLS.has(value.tool as PaperTool) ? value.tool as PaperTool : 'select',
      zoom: finiteNumber(value.zoom, 0.8),
    },
  };
}

function buildPaperQuarantineEntry(
  candidate: unknown,
  index: number,
  reason: 'malformed-document' | 'invalid-asset-reference',
): PaperQuarantinedDocumentRecovery {
  const record = isRecord(candidate) ? candidate : undefined;
  const documentRecord = record && isRecord(record.document) ? record.document : undefined;
  let payloadJson: string | undefined;
  try {
    payloadJson = JSON.stringify(candidate);
  } catch {
    payloadJson = undefined;
  }
  const id = record ? optionalString(record.id) : undefined;
  const title = documentRecord ? optionalString(documentRecord.title) : undefined;
  return {
    index,
    ...(id ? { id } : {}),
    ...(title ? { title } : {}),
    reason,
    detail: reason === 'invalid-asset-reference'
      ? 'The tab document contained invalid or inline asset references.'
      : 'The tab entry was not a valid Paper document snapshot.',
    ...(payloadJson ? { payloadJson } : {}),
  };
}

function buildPaperSnapshotRecovery(
  quarantinedDocuments: PaperQuarantinedDocumentRecovery[],
  repairs: string[],
): PaperSnapshotRecovery | undefined {
  if (quarantinedDocuments.length === 0 && repairs.length === 0) return undefined;
  return { quarantinedDocuments, repairs };
}

function collectPaperSnapshotAssetIds(document: Record<string, unknown>): BinaryAssetId[] | undefined {
  const assetIds = new Set<BinaryAssetId>();
  const frameContainers = [...(document.pages as unknown[])];
  if (document.parentPages !== undefined) {
    if (!Array.isArray(document.parentPages)) return undefined;
    frameContainers.push(...document.parentPages);
  }
  for (const page of frameContainers) {
    if (!isRecord(page) || !Array.isArray(page.frames)) return undefined;
    for (const frame of page.frames) {
      if (!isRecord(frame)) return undefined;
      const asset = frame.asset;
      if (asset === undefined) continue;
      if (!isRecord(asset)) return undefined;
      const locator = asset.locator;
      if (locator === undefined) continue;
      if (!isRecord(locator) || typeof locator.kind !== 'string') return undefined;
      if (locator.kind === 'managed') {
        if (!isBinaryAssetRef(locator.ref)) return undefined;
        assetIds.add(locator.ref.id);
      } else if (locator.kind === 'external') {
        if (typeof locator.url !== 'string' || /^(?:data:|blob:)/i.test(locator.url)) return undefined;
      } else {
        return undefined;
      }
    }
  }

  const importedFonts = document.importedFonts;
  if (importedFonts !== undefined) {
    if (!Array.isArray(importedFonts)) return undefined;
    for (const font of importedFonts) {
      if (!isRecord(font)) return undefined;
      if (isBinaryAssetRef(font.fontAsset)) {
        assetIds.add(font.fontAsset.id);
        if (isRecord(font.license) && isBinaryAssetRef(font.license.textAsset)) {
          assetIds.add(font.license.textAsset.id);
        }
        continue;
      }
      if (isBinaryAssetRef(font.assetRef)) {
        assetIds.add(font.assetRef.id);
        continue;
      }
      // Older Paper saves stored imported font bytes directly in the document. Keep that exact
      // legacy shape only until restoreProjectDocument migrates it into the managed repository.
      if (typeof font.dataBase64 !== 'string' || font.dataBase64.length === 0) return undefined;
    }
  }

  const managedIccProfiles = document.managedIccProfiles;
  if (managedIccProfiles !== undefined) {
    if (!Array.isArray(managedIccProfiles)) return undefined;
    for (const profile of managedIccProfiles) {
      if (!isPaperManagedIccProfile(profile) || !isRecord(profile)) return undefined;
      // Project snapshots carry references only. Byte strings belong in the asset store/container.
      if ('bytes' in profile || 'dataBase64' in profile || 'assetBase64' in profile) return undefined;
      assetIds.add(profile.asset.id);
    }
  }

  return [...assetIds].sort();
}

function isBinaryAssetId(value: unknown): value is BinaryAssetId {
  return typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value);
}

function samePaperAssetIds(left: readonly BinaryAssetId[], right: readonly BinaryAssetId[]): boolean {
  if (left.length !== right.length) return false;
  const sortedRight = [...right].sort();
  return left.every((assetId, index) => assetId === sortedRight[index]);
}

export function sanitizeImageEditorSnapshot(snapshot: unknown): ImageEditorProjectSnapshot | undefined {
  if (snapshot === undefined) return undefined;
  if (!isRecord(snapshot)) return undefined;
  const rawDocuments = Array.isArray(snapshot.documents) ? snapshot.documents : [];
  const projectSnapshots = rawDocuments.flatMap((doc) => (
    isRecord(doc) && Array.isArray(doc.snapshots) ? doc.snapshots : []
  ));
  assertImageDocumentSnapshotDecodeBounds(projectSnapshots, {
    transport: 'project',
    maxSnapshots: IMAGE_PROJECT_MAX_SNAPSHOTS,
    maxAggregateLayers: IMAGE_PROJECT_MAX_SNAPSHOT_LAYERS,
    maxAggregateProofs: IMAGE_PROJECT_MAX_SNAPSHOT_LAYERS,
    maxAggregateResources: IMAGE_PROJECT_MAX_SNAPSHOT_STRUCTURAL_RESOURCES,
    maxAggregateMetadataBytes: IMAGE_PROJECT_MAX_SNAPSHOT_METADATA_BYTES,
  });
  const documents = rawDocuments.length > 0
    ? rawDocuments.flatMap((doc, index) => {
        if (!isRecord(doc)) return [];
        const width = finiteNumber(doc.width, 0);
        const height = finiteNumber(doc.height, 0);
        if (width <= 0 || height <= 0) return [];
        const layers = Array.isArray(doc.layers) ? doc.layers.filter(isRecord) : [];
        const sanitizedLayers = sanitizeImageLayerCollection(layers);
        const rawSnapshots = Array.isArray(doc.snapshots) ? doc.snapshots : [];
        assertImageDocumentSnapshotDecodeBounds(rawSnapshots, { transport: 'project' });
        const snapshots = rawSnapshots.filter(isRecord);
        const sanitizedSnapshots = snapshots.map((namedSnapshot, snapshotIndex) => sanitizeImageDocumentSnapshot(
          namedSnapshot,
          snapshotIndex,
          { width, height },
        ));
        assertImageDocumentSnapshotDecodeBounds(sanitizedSnapshots, { transport: 'project' });
        const activeLayerEditTarget: ImageLayerEditTarget = doc.activeLayerEditTarget === 'mask' ? 'mask' : 'layer';
        return [{
          ...doc,
          id: stringValue(doc.id, `image-doc-${index}`),
          title: stringValue(doc.title, `Image ${index + 1}`),
          width,
          height,
          layers: sanitizedLayers,
          activeLayerId: optionalString(doc.activeLayerId) ?? null,
          activeLayerEditTarget,
          hasSelection: Boolean(doc.hasSelection),
          selectionVersion: finiteNumber(doc.selectionVersion, 0),
          selectionMask: undefined,
          selectionMaskData: typeof doc.selectionMaskData === 'string' ? doc.selectionMaskData : undefined,
          savedSelectionChannels: sanitizeSavedSelectionChannels(doc.savedSelectionChannels),
          spotChannels: sanitizeImageSpotChannels(doc.spotChannels),
          viewport: isRecord(doc.viewport)
            ? { zoom: finiteNumber(doc.viewport.zoom, 1), panX: finiteNumber(doc.viewport.panX, 0), panY: finiteNumber(doc.viewport.panY, 0) }
            : { zoom: 1, panX: 0, panY: 0 },
          dirty: Boolean(doc.dirty),
          snapshots: sanitizedSnapshots,
        }];
      })
    : [];

  return {
    documents,
    activeDocId: optionalString(snapshot.activeDocId) ?? documents[0]?.id ?? null,
    quickActionMacros: sanitizeImageQuickActionMacros(snapshot.quickActionMacros),
  };
}

function sanitizeImageQuickActionMacros(value: unknown): ImageQuickActionMacro[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry, index) => {
    if (!isRecord(entry)) return [];
    const steps = Array.isArray(entry.steps)
      ? entry.steps.flatMap((step) => {
          if (!isRecord(step)) return [];
          const actionId = optionalString(step.actionId);
          return actionId ? [{ actionId }] : [];
        })
      : [];

    if (steps.length === 0) return [];

    return [{
      id: stringValue(entry.id, `quick-action-macro-${index}`),
      name: stringValue(entry.name, `Action ${index + 1}`),
      createdAt: finiteNumber(entry.createdAt, 0),
      updatedAt: finiteNumber(entry.updatedAt, finiteNumber(entry.createdAt, 0)),
      steps,
    }];
  });
}

function sanitizeImageDocumentSnapshot(
  snapshot: UnknownRecord,
  index: number,
  fallbackSize: { width: number; height: number },
): ImageDocumentSnapshot {
  const width = positiveFiniteNumber(snapshot.width, fallbackSize.width);
  const height = positiveFiniteNumber(snapshot.height, fallbackSize.height);
  const layers = Array.isArray(snapshot.layers) ? snapshot.layers.filter(isRecord) : [];
  const integrity = sanitizeImageDocumentSnapshotIntegrity(snapshot.integrity);
  if (
    snapshot.pixelState === 'complete'
    && isRecord(snapshot.integrity)
    && snapshot.integrity.version === 2
    && !integrity
  ) {
    throw new Error('Image snapshot has a malformed cryptographic content integrity manifest.');
  }

  return {
    ...snapshot,
    id: stringValue(snapshot.id, `image-snapshot-${index}`),
    name: stringValue(snapshot.name, `Snapshot ${index + 1}`),
    createdAt: finiteNumber(snapshot.createdAt, 0),
    ...(typeof snapshot.updatedAt === 'number' && Number.isFinite(snapshot.updatedAt)
      ? { updatedAt: snapshot.updatedAt }
      : {}),
    width,
    height,
    layers: sanitizeImageLayerCollection(layers),
    activeLayerId: optionalString(snapshot.activeLayerId) ?? null,
    hasSelection: Boolean(snapshot.hasSelection),
    selectionVersion: finiteNumber(snapshot.selectionVersion, 0),
    selectionMask: undefined,
    selectionMaskData: typeof snapshot.selectionMaskData === 'string' ? snapshot.selectionMaskData : undefined,
    pixelState: snapshot.pixelState === 'complete' && integrity ? 'complete' : 'unavailable',
    ...(integrity ? { integrity } : {}),
  };
}

function sanitizeImageDocumentSnapshotAssetIntegrity(
  value: unknown,
): ImageDocumentSnapshotAssetIntegrity | undefined {
  if (!isRecord(value) || typeof value.present !== 'boolean') return undefined;
  const width = finiteNumber(value.width, -1);
  const height = finiteNumber(value.height, -1);
  if (value.present) {
    if (width <= 0 || height <= 0) return undefined;
    if (typeof value.contentDigest !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(value.contentDigest)) {
      return undefined;
    }
  } else if (width !== 0 || height !== 0) {
    return undefined;
  } else if (value.contentDigest !== undefined) {
    return undefined;
  }
  return {
    present: value.present,
    width,
    height,
    ...(value.present ? { contentDigest: value.contentDigest as string } : {}),
  };
}

function sanitizeImageDocumentSnapshotIntegrity(value: unknown): ImageDocumentSnapshotIntegrity | undefined {
  if (!isRecord(value) || value.version !== 2 || !Array.isArray(value.layers) || !isRecord(value.selection)) {
    return undefined;
  }
  const layers = value.layers.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.layerId !== 'string') return [];
    const bitmap = sanitizeImageDocumentSnapshotAssetIntegrity(entry.bitmap);
    const mask = sanitizeImageDocumentSnapshotAssetIntegrity(entry.mask);
    return bitmap && mask ? [{ layerId: entry.layerId, bitmap, mask }] : [];
  });
  if (layers.length !== value.layers.length) return undefined;
  const selectionAsset = sanitizeImageDocumentSnapshotAssetIntegrity(value.selection);
  const byteLength = finiteNumber(value.selection.byteLength, -1);
  if (!selectionAsset || byteLength < 0) return undefined;
  if (selectionAsset.present) {
    if (byteLength !== selectionAsset.width * selectionAsset.height) return undefined;
  } else if (byteLength !== 0) {
    return undefined;
  }
  return {
    version: 2,
    layers,
    selection: { ...selectionAsset, byteLength },
  };
}

function sanitizeSavedSelectionChannels(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as Array<{
      id: string;
      name: string;
      width: number;
      height: number;
      dataBase64: string;
      createdAt: number;
    }>;
  }

  return truncateSavedSelectionChannels(value.flatMap((entry, index) => {
    if (!isRecord(entry)) return [];
    const width = positiveFiniteNumber(entry.width, 0);
    const height = positiveFiniteNumber(entry.height, 0);
    const name = sanitizeSavedSelectionChannelName(entry.name);
    const dataBase64 = isPlausibleSavedSelectionChannelData(entry.dataBase64) ? entry.dataBase64 : undefined;
    if (width <= 0 || height <= 0 || !name || !dataBase64) return [];
    return [{
      id: stringValue(entry.id, `alpha-channel-${index}`),
      name,
      width,
      height,
      dataBase64,
      createdAt: finiteNumber(entry.createdAt, 0),
    }];
  }));
}

function sanitizeImageSpotChannels(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as Array<{
      id: string;
      name: string;
      width: number;
      height: number;
      color: { r: number; g: number; b: number };
      opacity: number;
      solidity: number;
      visible: boolean;
      dataBase64: string;
      createdAt: number;
      updatedAt?: number;
    }>;
  }

  return value.flatMap((entry, index) => {
    if (!isRecord(entry)) return [];
    const width = positiveFiniteNumber(entry.width, 0);
    const height = positiveFiniteNumber(entry.height, 0);
    const name = sanitizeImageSpotChannelName(entry.name);
    const dataBase64 = isPlausibleSavedSelectionChannelData(entry.dataBase64) ? entry.dataBase64 : undefined;
    if (width <= 0 || height <= 0 || !name || !dataBase64) return [];

    const updatedAt = finiteNumber(entry.updatedAt, Number.NaN);
    return [{
      id: stringValue(entry.id, `spot-channel-${index}`),
      name,
      width,
      height,
      color: sanitizeImageSpotChannelColor(entry.color),
      opacity: clampUnit(finiteNumber(entry.opacity, 1)),
      solidity: clampUnit(finiteNumber(entry.solidity, 1)),
      visible: entry.visible !== false,
      dataBase64,
      createdAt: finiteNumber(entry.createdAt, 0),
      ...(Number.isFinite(updatedAt) ? { updatedAt } : {}),
    }];
  });
}

function sanitizeImageSpotChannelColor(value: unknown): { r: number; g: number; b: number } {
  const color = isRecord(value) ? value : {};
  return {
    r: clampByte(finiteNumber(color.r, 0)),
    g: clampByte(finiteNumber(color.g, 174)),
    b: clampByte(finiteNumber(color.b, 239)),
  };
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(0, Math.min(1, value));
}

function clampByte(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(255, Math.round(value)));
}

function sanitizeImageLayer(layer: UnknownRecord, layerIndex: number): ImageLayer {
  const locks = sanitizeImageLayerLocks(layer.locks);
  const type = sanitizeImageLayerType(layer.type);
  const groupExpanded = typeof layer.groupExpanded === 'boolean' ? layer.groupExpanded : true;
  const linkGroupId = sanitizeImageLayerLinkGroupId(layer.linkGroupId);
  const skewXDeg = sanitizeImageLayerTransformSkew(layer.skewXDeg);
  const skewYDeg = sanitizeImageLayerTransformSkew(layer.skewYDeg);
  const perspectiveX = sanitizeImageLayerTransformPerspective(layer.perspectiveX);
  const perspectiveY = sanitizeImageLayerTransformPerspective(layer.perspectiveY);
  const warp = sanitizeImageLayerTransformWarp(layer.warp);
  const cornerOffsets = sanitizeImageLayerTransformCornerOffsets(layer.cornerOffsets);
  const transformOriginX = sanitizeImageLayerTransformOrigin(layer.transformOriginX);
  const transformOriginY = sanitizeImageLayerTransformOrigin(layer.transformOriginY);
  const maskDensity = sanitizeImageLayerMaskDensity(layer.maskDensity);
  const maskFeather = sanitizeImageLayerMaskFeather(layer.maskFeather);
  return {
    ...layer,
    id: stringValue(layer.id, `layer-${layerIndex}`),
    name: stringValue(layer.name, `Layer ${layerIndex + 1}`),
    type,
    visible: typeof layer.visible === 'boolean' ? layer.visible : true,
    locked: Boolean(layer.locked),
    ...(locks ? { locks } : { locks: undefined }),
    opacity: finiteNumber(layer.opacity, 1),
    blendMode: typeof layer.blendMode === 'string' ? layer.blendMode as ImageLayer['blendMode'] : 'normal',
    x: type === 'group' ? 0 : finiteNumber(layer.x, 0),
    y: type === 'group' ? 0 : finiteNumber(layer.y, 0),
    ...(type !== 'group' && skewXDeg !== undefined ? { skewXDeg } : {}),
    ...(type !== 'group' && skewYDeg !== undefined ? { skewYDeg } : {}),
    ...(type !== 'group' && perspectiveX !== undefined ? { perspectiveX } : {}),
    ...(type !== 'group' && perspectiveY !== undefined ? { perspectiveY } : {}),
    ...(type !== 'group' && warp !== undefined ? { warp } : {}),
    ...(type !== 'group' && cornerOffsets !== undefined ? { cornerOffsets } : {}),
    transformOriginX: type === 'group' ? undefined : transformOriginX,
    transformOriginY: type === 'group' ? undefined : transformOriginY,
    bitmap: null,
    mask: null,
    // Serialized pixel payloads carry the actual layer pixels across a project save/open; keep
    // them through sanitize so the image isn't wiped on restore (decoded back into bitmap/mask).
    bitmapData: typeof layer.bitmapData === 'string' ? layer.bitmapData : undefined,
    maskData: typeof layer.maskData === 'string' ? layer.maskData : undefined,
    ...(maskDensity !== undefined ? { maskDensity } : {}),
    ...(maskFeather !== undefined ? { maskFeather } : {}),
    bitmapVersion: finiteNumber(layer.bitmapVersion, 0),
    text: sanitizeImageTextLayerStyle(layer.text),
    groupExpanded: type === 'group' ? groupExpanded : undefined,
    linkGroupId: type === 'group' ? undefined : linkGroupId,
  };
}

function sanitizeImageTextLayerStyle(value: unknown): ImageLayer['text'] {
  if (!isRecord(value)) return undefined;
  const initialManagedFaceState = normalizeBundledFontFaceState(value.managedFace, value.managedFaceIssue);
  const fontStyle = value.fontStyle === 'italic' || (value.fontStyle === 'oblique' && initialManagedFaceState.managedFace?.style === 'oblique')
    ? value.fontStyle
    : 'normal';
  const managedFaceState = normalizeBundledFontFaceStateForTypography(value.managedFace, value.managedFaceIssue, {
    family: typeof value.fontFamily === 'string' ? value.fontFamily : '',
    weight: value.fontWeight as string | number | undefined,
    style: fontStyle,
  });
  return {
    ...(value as unknown as NonNullable<ImageLayer['text']>),
    fontStyle,
    managedFace: managedFaceState.managedFace,
    managedFaceIssue: managedFaceState.managedFaceIssue,
  };
}

function sanitizeImageLayerCollection(layers: UnknownRecord[]): ImageLayer[] {
  const sanitized = layers.map(sanitizeImageLayer);
  const groupIds = new Set(sanitized.filter((layer) => layer.type === 'group').map((layer) => layer.id));
  const grouped = sanitized.map((layer) => {
    const validGroupId = typeof layer.groupId === 'string'
      && layer.groupId !== layer.id
      && groupIds.has(layer.groupId);
    if (layer.type === 'group') {
      return omitImageLayerGroupId(layer);
    }
    return validGroupId ? layer : omitImageLayerGroupId(layer);
  });
  const linkCounts = new Map<string, number>();
  for (const layer of grouped) {
    if (!layer.linkGroupId) continue;
    linkCounts.set(layer.linkGroupId, (linkCounts.get(layer.linkGroupId) ?? 0) + 1);
  }
  return grouped.map((layer) => (
    layer.linkGroupId && (linkCounts.get(layer.linkGroupId) ?? 0) >= 2
      ? layer
      : omitImageLayerLinkGroup(layer)
  ));
}

function sanitizeImageLayerType(value: unknown): LayerType {
  return ['image', 'mask', 'text', 'adjustment', 'vector', 'group'].includes(value as string)
    ? value as LayerType
    : 'image';
}

function omitImageLayerGroupId(layer: ImageLayer): ImageLayer {
  const { groupId: _groupId, ...rest } = layer;
  return rest;
}

function positiveFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

function sanitizeImageLayerTransformOrigin(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.min(1, value));
}

function sanitizeImageLayerTransformSkew(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(-75, Math.min(75, Math.round(value * 100) / 100));
}

function sanitizeImageLayerTransformPerspective(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(-0.95, Math.min(0.95, Math.round(value * 1000) / 1000));
}

function sanitizeImageLayerTransformWarp(value: unknown): ImageLayer['warp'] | undefined {
  if (value === undefined) return undefined;
  const entry = isRecord(value) ? value : {};
  return {
    top: sanitizeImageLayerTransformWarpValue(entry.top),
    right: sanitizeImageLayerTransformWarpValue(entry.right),
    bottom: sanitizeImageLayerTransformWarpValue(entry.bottom),
    left: sanitizeImageLayerTransformWarpValue(entry.left),
  };
}

function sanitizeImageLayerTransformCornerOffsets(value: unknown): ImageLayer['cornerOffsets'] | undefined {
  if (value === undefined) return undefined;
  const entry = isRecord(value) ? value : {};
  return {
    nw: sanitizeImageTransformPoint(entry.nw),
    ne: sanitizeImageTransformPoint(entry.ne),
    se: sanitizeImageTransformPoint(entry.se),
    sw: sanitizeImageTransformPoint(entry.sw),
  };
}

function sanitizeImageTransformPoint(value: unknown): { x: number; y: number } {
  const point = isRecord(value) ? value : {};
  return {
    x: sanitizeImageTransformCoordinate(point.x),
    y: sanitizeImageTransformCoordinate(point.y),
  };
}

function sanitizeImageTransformCoordinate(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

function sanitizeImageLayerTransformWarpValue(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(-1, Math.min(1, Math.round(value * 1000) / 1000));
}

export function sanitizeFileSystemMetadata(value: unknown): FlowProjectDocument['fileSystem'] | undefined {
  if (!isRecord(value)) return undefined;
  return {
    projectDirectoryName: optionalString(value.projectDirectoryName),
    scratchDirectoryName: optionalString(value.scratchDirectoryName),
    lastSavedToFolderAt: optionalNumber(value.lastSavedToFolderAt),
    scratchAssetCount: optionalNumber(value.scratchAssetCount),
  };
}

function collectSourceBinSnapshotItems(sourceBin: SourceBinProjectSnapshot | undefined): Array<SourceBinLibraryItem & { assetUrl?: string }> {
  if (!sourceBin) return [];
  const binItems = sourceBin.bins?.flatMap((bin) => bin.items) ?? [];
  const flatItems = sourceBin.items ?? [];
  return [...binItems, ...flatItems];
}

function hydrateFlowSnapshotFromSourceBin(
  flow: FlowProjectDocument['flow'],
  sourceBin: SourceBinProjectSnapshot | undefined,
): FlowProjectDocument['flow'] {
  const sourceBinItems = collectSourceBinSnapshotItems(sourceBin);

  if (sourceBinItems.length === 0) {
    return {
      ...flow,
      nodes: flow.nodes.map((node) => ({
        ...node,
        data: finalizeHydratedNodeData({ ...node.data }),
      })),
    };
  }

  return {
    ...flow,
    nodes: flow.nodes.map((node) => {
      const sourceItems = collectSourceBinItemsForFlowNode(node.id, sourceBinItems);
      const data: NodeData = { ...node.data };

      if (sourceItems.length > 0) {
        Object.assign(data, buildFlowNodeGeneratedResultPatch(node.id, data, sourceItems));
      }

      return {
        ...node,
        data: finalizeHydratedNodeData(data),
      };
    }),
  };
}

function finalizeHydratedNodeData(data: NodeData): NodeData {
  if (Array.isArray(data.resultHistory)) {
    restoreSelectedResultFromHistory(data, data.resultHistory);
  }
  return data;
}

function sanitizeFlowWorkspaceSnapshot(
  snapshot: unknown,
  index: number,
  sourceBin: SourceBinProjectSnapshot | undefined,
): FlowWorkspaceProjectSnapshot | undefined {
  if (!isRecord(snapshot)) {
    return undefined;
  }

  const rawFlow = snapshot.flow;
  if (rawFlow === undefined) {
    return undefined;
  }

  const createdAt = finiteNumber(snapshot.createdAt, Date.now());
  const sanitizedFlow = hydrateFlowSnapshotFromSourceBin(
    sanitizeFlowSnapshot(rawFlow),
    sourceBin,
  );

  return {
    id: stringValue(snapshot.id, index === 0 ? DEFAULT_FLOW_WORKSPACE_ID : `flow-workspace-${index + 1}`),
    name: stringValue(snapshot.name, index === 0 ? DEFAULT_FLOW_WORKSPACE_NAME : `Flow Workspace ${index + 1}`),
    createdAt,
    updatedAt: finiteNumber(snapshot.updatedAt, createdAt),
    flow: sanitizedFlow,
  };
}

function sanitizeFlowWorkspaceState(
  input: UnknownRecord,
  sourceBin: SourceBinProjectSnapshot | undefined,
): {
  flow: FlowProjectDocument['flow'];
  flowWorkspaces: FlowWorkspaceProjectSnapshot[];
  activeFlowWorkspaceId: string;
} {
  const legacyFlowInput = input.flow;
  const legacyFlow = legacyFlowInput === undefined
    ? undefined
    : hydrateFlowSnapshotFromSourceBin(sanitizeFlowSnapshot(legacyFlowInput), sourceBin);
  const sanitizedWorkspaces = Array.isArray(input.flowWorkspaces)
    ? input.flowWorkspaces.flatMap((workspace, index) => sanitizeFlowWorkspaceSnapshot(workspace, index, sourceBin) ?? [])
    : [];
  const flowWorkspaces = sanitizedWorkspaces.length > 0
    ? sanitizedWorkspaces
    : legacyFlow
      ? [buildDefaultFlowWorkspace(legacyFlow)]
      : [];
  const activeWorkspace = findActiveFlowWorkspace(
    flowWorkspaces,
    optionalString(input.activeFlowWorkspaceId),
  );

  if (!activeWorkspace) {
    throw new Error('The selected file is not a valid Sloom Studio .sloom project: flow nodes and edges must be arrays.');
  }

  return {
    flow: activeWorkspace.flow,
    flowWorkspaces,
    activeFlowWorkspaceId: activeWorkspace.id,
  };
}

export function sanitizeProjectDocument(input: unknown, fallbackName = 'Sloom Studio Project'): FlowProjectDocument {
  if (!isRecord(input)) {
    throw new Error('The selected file is not a valid Sloom Studio .sloom project.');
  }

  const sourceBin = sanitizeSourceBinSnapshot(input.sourceBin);
  const flowWorkspaceState = sanitizeFlowWorkspaceState(input, sourceBin);

  return {
    schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
    id: stringValue(input.id, globalThis.crypto?.randomUUID?.() ?? `project-${Date.now()}`),
    name: stringValue(input.name, fallbackName),
    savedAt: finiteNumber(input.savedAt, Date.now()),
    flow: flowWorkspaceState.flow,
    flowWorkspaces: flowWorkspaceState.flowWorkspaces,
    activeFlowWorkspaceId: flowWorkspaceState.activeFlowWorkspaceId,
    editor: sanitizeEditorSnapshot(input.editor),
    sourceBin,
    usageLedger: sanitizeProjectUsageLedgerSnapshot(input.usageLedger),
    paper: sanitizePaperSnapshot(input.paper),
    paperAssets: sanitizePaperPortableAssetsSection(input.paperAssets),
    imageEditor: sanitizeImageEditorSnapshot(input.imageEditor),
    fileSystem: sanitizeFileSystemMetadata(input.fileSystem),
  };
}
