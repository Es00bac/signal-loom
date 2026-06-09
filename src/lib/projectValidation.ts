import type { Edge } from '@xyflow/react';
import type { EditorWorkspaceSnapshot } from '../store/editorStore';
import type { ImageEditorProjectSnapshot } from '../store/imageEditorStore';
import type { SourceBinLibraryItem, SourceBinProjectSnapshot } from '../store/sourceBinStore';
import type { AppNode, EditorSourceKind, EnvelopeItem, NodeData, NodeResultAttempt, ResultType, WorkspaceView } from '../types/flow';
import type { PaperDocumentSnapshot, PaperTool } from '../types/paper';
import type { ImageDocumentSnapshot, ImageLayer, LayerType } from '../types/imageEditor';
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
    const result = optionalString(attempt.result);
    const resultType = optionalString(attempt.resultType);

    if (!result || !resultType || !VALID_RESULT_TYPES.has(resultType as ResultType)) {
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

  return data;
}

export function sanitizeFlowSnapshot(snapshot: unknown): FlowProjectDocument['flow'] {
  if (!isRecord(snapshot) || !Array.isArray(snapshot.nodes) || !Array.isArray(snapshot.edges)) {
    throw new Error('The selected file is not a valid Signal Loom .sloom project: flow nodes and edges must be arrays.');
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
      data: sanitizeNodeData(node.data),
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
  if (snapshot === undefined) return undefined;
  if (!isRecord(snapshot) || !isRecord(snapshot.document) || !Array.isArray(snapshot.document.pages)) return undefined;

  return {
    document: snapshot.document as unknown as PaperDocumentSnapshot['document'],
    selectedPageId: optionalString(snapshot.selectedPageId),
    selectedFrameId: optionalString(snapshot.selectedFrameId),
    tool: VALID_PAPER_TOOLS.has(snapshot.tool as PaperTool) ? snapshot.tool as PaperTool : 'select',
    zoom: finiteNumber(snapshot.zoom, 0.8),
  };
}

export function sanitizeImageEditorSnapshot(snapshot: unknown): ImageEditorProjectSnapshot | undefined {
  if (snapshot === undefined) return undefined;
  if (!isRecord(snapshot)) return undefined;
  const documents = Array.isArray(snapshot.documents)
    ? snapshot.documents.flatMap((doc, index) => {
        if (!isRecord(doc)) return [];
        const width = finiteNumber(doc.width, 0);
        const height = finiteNumber(doc.height, 0);
        if (width <= 0 || height <= 0) return [];
        const layers = Array.isArray(doc.layers) ? doc.layers.filter(isRecord) : [];
        const snapshots = Array.isArray(doc.snapshots) ? doc.snapshots.filter(isRecord) : [];
        return [{
          ...doc,
          id: stringValue(doc.id, `image-doc-${index}`),
          title: stringValue(doc.title, `Image ${index + 1}`),
          width,
          height,
          layers: layers.map(sanitizeImageLayer),
          activeLayerId: optionalString(doc.activeLayerId) ?? null,
          hasSelection: Boolean(doc.hasSelection),
          selectionVersion: finiteNumber(doc.selectionVersion, 0),
          viewport: isRecord(doc.viewport)
            ? { zoom: finiteNumber(doc.viewport.zoom, 1), panX: finiteNumber(doc.viewport.panX, 0), panY: finiteNumber(doc.viewport.panY, 0) }
            : { zoom: 1, panX: 0, panY: 0 },
          dirty: Boolean(doc.dirty),
          snapshots: snapshots.map((snapshot, snapshotIndex) => sanitizeImageDocumentSnapshot(snapshot, snapshotIndex, {
            width,
            height,
          })),
        }];
      })
    : [];

  return {
    documents,
    activeDocId: optionalString(snapshot.activeDocId) ?? documents[0]?.id ?? null,
  };
}

function sanitizeImageDocumentSnapshot(
  snapshot: UnknownRecord,
  index: number,
  fallbackSize: { width: number; height: number },
): ImageDocumentSnapshot {
  const width = positiveFiniteNumber(snapshot.width, fallbackSize.width);
  const height = positiveFiniteNumber(snapshot.height, fallbackSize.height);
  const layers = Array.isArray(snapshot.layers) ? snapshot.layers.filter(isRecord) : [];

  return {
    ...snapshot,
    id: stringValue(snapshot.id, `image-snapshot-${index}`),
    name: stringValue(snapshot.name, `Snapshot ${index + 1}`),
    createdAt: finiteNumber(snapshot.createdAt, 0),
    width,
    height,
    layers: layers.map(sanitizeImageLayer),
    activeLayerId: optionalString(snapshot.activeLayerId) ?? null,
    hasSelection: Boolean(snapshot.hasSelection),
    selectionVersion: finiteNumber(snapshot.selectionVersion, 0),
  };
}

function sanitizeImageLayer(layer: UnknownRecord, layerIndex: number): ImageLayer {
  return {
    ...layer,
    id: stringValue(layer.id, `layer-${layerIndex}`),
    name: stringValue(layer.name, `Layer ${layerIndex + 1}`),
    type: sanitizeImageLayerType(layer.type),
    visible: typeof layer.visible === 'boolean' ? layer.visible : true,
    locked: Boolean(layer.locked),
    opacity: finiteNumber(layer.opacity, 1),
    blendMode: typeof layer.blendMode === 'string' ? layer.blendMode as ImageLayer['blendMode'] : 'normal',
    x: finiteNumber(layer.x, 0),
    y: finiteNumber(layer.y, 0),
    bitmap: null,
    mask: null,
    bitmapVersion: finiteNumber(layer.bitmapVersion, 0),
  };
}

function sanitizeImageLayerType(value: unknown): LayerType {
  return ['image', 'mask', 'text', 'adjustment', 'vector'].includes(value as string)
    ? value as LayerType
    : 'image';
}

function positiveFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : fallback;
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
    throw new Error('The selected file is not a valid Signal Loom .sloom project: flow nodes and edges must be arrays.');
  }

  return {
    flow: activeWorkspace.flow,
    flowWorkspaces,
    activeFlowWorkspaceId: activeWorkspace.id,
  };
}

export function sanitizeProjectDocument(input: unknown, fallbackName = 'Signal Loom Project'): FlowProjectDocument {
  if (!isRecord(input)) {
    throw new Error('The selected file is not a valid Signal Loom .sloom project.');
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
    imageEditor: sanitizeImageEditorSnapshot(input.imageEditor),
    fileSystem: sanitizeFileSystemMetadata(input.fileSystem),
  };
}
