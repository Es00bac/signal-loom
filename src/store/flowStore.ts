import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { StateStorage } from 'zustand/middleware';
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
} from '@xyflow/react';
import type {
  Connection,
  Edge,
  EdgeChange,
  NodeChange,
  OnConnect,
  OnEdgesChange,
  OnNodesChange,
} from '@xyflow/react';
import { loadImportedAsset } from '../lib/assetStore';
import { buildLoraWeightsJson } from '../lib/loraSpecNode';
import { parseSignalLoomAssetId } from '../lib/signalLoomAssetUrl';
import {
  COMPOSITION_AUDIO_HANDLES,
  COMPOSITION_VIDEO_HANDLE,
  getCompositionTrackSettings,
} from '../lib/compositionTracks';
import {
  isCompositionVideoConnection,
  normalizeCompositionConnectionTargetHandle,
  normalizeCompositionEdges,
} from '../lib/compositionEdgeMigration';
import {
  DEFAULT_EXECUTION_CONFIG,
  getAudioOutputFormat,
  getImageOutputFormat,
  getNodeAspectRatio,
  getVideoResolution,
} from '../lib/providerCatalog';
import {
  normalizeImageConnectionTargetHandle,
  normalizeImageEdges,
} from '../lib/imageEdgeMigration';
import { resolveImageNodeMaskInput } from '../lib/imageNodeMask';
import {
  estimateExecutionPlan,
  formatRollupSummary,
} from '../lib/costEstimation';
import { IMAGE_MASK_HANDLE, IMAGE_REFERENCE_HANDLES } from '../lib/imageModelSupport';
import {
  getEditorAudioClips,
  getEditorAudioTrackVolumes,
  getEditorVisualClips,
} from '../lib/manualEditorState';
import { getEditorAssets } from '../lib/editorAssets';
import { getEditorStageObjects } from '../lib/editorStageObjects';
import {
  buildManualEditorVisualSequenceClip,
  type ManualEditorVisualSequenceClip,
} from '../lib/manualEditorSequence';
import { appendResultAttempt, resolveSelectedResultAttempt } from '../lib/resultHistory';
import {
  deserializeResultValueFromContainer,
  resultValueAsMediaUrl,
  serializeResultValueForContainer,
} from '../lib/flowResultValues';
import { executeNodeRequest, hashExecutionParameters } from '../lib/flowExecution';
import {
  buildCollapsedFunctionNode,
  createDefaultFunctionNodeConfig,
  createGroupNodeConfig,
  getNodeResultForFunctionRouting,
  pasteFlowClipboard,
  serializeFlowSelection,
  type FlowClipboardPayload,
} from '../lib/functionNodes';
import {
  buildListNodeItems,
  getListNodeKind,
  isListItemTargetHandle,
  resolveExpandedListItemForNode,
  resolveNodeListItemKind,
  resolvePackageNodeData,
  collectEnvelopeItemsForEnvelopeNode,
  evaluateNodeTextForMonitor,
} from '../lib/listNodes';
import {
  applyListItemsToExecutionContext,
  buildLoopIterationItems,
  collectListLoopInputs,
  type LoopIterationItem,
  getLoopIterationCount,
  normalizeListLoopMode,
} from '../lib/listExecution';
import {
  collectPromptSignalForNode,
  getBlockingSignalDiagnostics,
  getSignalIterationCount,
  signalToTextAt,
} from '../lib/flowSignals';
import {
  annotateFlowEdges,
  validateFlowConnection,
} from '../lib/flowConnectionContracts';
import { LOOP_BREAK_TARGET_HANDLE } from '../lib/flowControlHandles';
import { shouldBreakLoopAtIteration } from '../lib/loopControl';
import { getBlockingFlowDiagnostics } from '../lib/flowDiagnostics';
import { buildSourceBinItem } from '../lib/sourceBin';
import { buildFlowNodePatchForRestoredSourceBinItem } from '../lib/sourceBinFlowBridge';
import {
  buildFlowNodeGeneratedResultPatch,
  sourceBinItemBelongsToFlowNode,
} from '../lib/flowNodeResultRestore';
import { recordProjectUsageFromExecution } from '../lib/projectUsageRecording';
import type { FlowProjectFlowSnapshot, FlowProjectFlowSnapshotInput } from '../lib/flowProjectWorkspaces';
import { applyFlowGraphNativeChange, type FlowGraphNativeChange } from '../lib/flowGraphNativeSync';
import {
  getDefaultGeminiTextMimeType,
  isGeminiTextMediaInputSupported,
  type GeminiTextMediaInput,
} from '../lib/geminiTextModel';
import {
  buildSourceBinLibraryItemLookup,
  mapLibraryItemToEditorSourceItem,
} from '../lib/editorSourceItems';
import { renameNodeBookmarkState } from './flow/slices/bookmarkActions';
import { replaceFlowSnapshotState } from './flow/slices/snapshotActions';
import {
  normalizeVideoImageConnectionTargetHandle,
  normalizeVideoImageEdges,
  replaceExclusiveVideoFrameEdges,
} from '../lib/videoEdgeMigration';
import {
  normalizeGeminiVideoModelId,
} from '../lib/videoModelSupport';
import { resolveEffectiveSourceNode } from '../lib/virtualNodes';
import {
  isPortalSyntheticEdge,
  normalizePortalEdges,
  prunePortalExitEdgesForRemovedEntryLeads,
} from '../lib/portalNodes';
import type {
  AspectRatio,
  AppNode,
  DynamicValue,
  EditorSourceKind,
  ExecutionConfig,
  EnvelopeItem,
  FlowNodeType,
  ImageTargetHandle,
  NodeData,
  PersistedNodeData,
  ResultType,
  RuntimeSettingsSnapshot,
  SerializableNodeValue,
  UsageTelemetry,
  VideoReferenceType,
  VideoTargetHandle,
} from '../types/flow';
import { useSettingsStore } from './settingsStore';
import { useSourceBinStore } from './sourceBinStore';
import { useProjectUsageStore } from './projectUsageStore';
import { useConfirmationStore } from './confirmationStore';
import { useFlowWorkspaceStore } from './flowWorkspaceStore';

export interface FlowState {
  nodes: AppNode[];
  edges: Edge[];
  bookmarkSidebarOpen: boolean;
  setBookmarkSidebarOpen: (open: boolean) => void;
  onNodesChange: OnNodesChange<AppNode>;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  addNode: (type: FlowNodeType, position: { x: number; y: number }, initialData?: Partial<NodeData>) => string;
  addConnectedNode: (sourceNodeId: string, type: FlowNodeType, targetHandle?: string) => void;
  updateNodeData: (id: string, key: string, value: SerializableNodeValue) => void;
  patchNodeData: (id: string, patch: Partial<NodeData>) => void;
  renameNodeBookmark: (id: string, rawTitle: string | null) => void;
  clearNodeBookmark: (id: string) => void;
  removeEditorSourceReferences: (sourceNodeId: string) => void;
  selectNodeAttempt: (id: string, attemptId: string) => void;
  runNode: (id: string) => Promise<void>;
  cancelNodeRun: (id: string) => void;
  hydratePersistedState: () => void;
  restoreImportedAssets: () => Promise<void>;
  exportFlow: () => string;
  exportProjectFlowSnapshot: () => FlowProjectFlowSnapshot;
  replaceFlowSnapshot: (snapshot: FlowProjectFlowSnapshotInput) => void;
  /**
   * Apply a remote Flow-graph op from the unified cross-device sync (task #51; channel `'flow'` on
   * [[projectSyncService]]). Mutates the live graph WITHOUT re-broadcasting — the echo guard lives in
   * the sync layer (`flowSyncChannel`), not here. Newly-added nodes get their runtime callbacks
   * re-attached. Returns whether the graph actually changed (idempotent ops on missing/unchanged
   * targets are no-ops, so a self-echoed op doesn't thrash the store).
   */
  applyRemoteFlowGraphChange: (change: FlowGraphNativeChange) => boolean;
  insertTemplate: (template: { nodes: Partial<AppNode>[]; edges: Partial<Edge>[] }, position: { x: number; y: number }) => void;
  copySelection: () => boolean;
  cutSelection: () => Promise<boolean>;
  pasteClipboard: (position: { x: number; y: number }) => boolean;
  deleteSelection: () => Promise<boolean>;
  selectAllNodes: () => void;
  deselectAll: () => void;
  createGroupFromSelection: (title?: string) => string | undefined;
  collapseSelectionToFunction: (title?: string) => string | undefined;
  centerOnNode: (id: string) => void;
  registerCenterOnNodeCallback: (callback: (id: string) => void) => void;
  onSourceBinItemRemoved: (id: string, removedItem?: import('./sourceBinStore').SourceBinLibraryItem) => void;
}

const activeRunControllers = new Map<string, AbortController>();
let flowClipboard: FlowClipboardPayload | null = null;

function getActiveFlowWorkspaceUsageContext(): {
  flowWorkspaceId?: string;
  flowWorkspaceName?: string;
} {
  const flowWorkspaceState = useFlowWorkspaceStore.getState();
  const flowWorkspaceId = flowWorkspaceState.activeWorkspaceId;
  const flowWorkspaceName = flowWorkspaceId
    ? flowWorkspaceState.getWorkspace(flowWorkspaceId)?.name
    : undefined;

  return {
    flowWorkspaceId,
    flowWorkspaceName,
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

const FLOW_STORAGE_KEY = 'flow-canvas-storage';
const PERSIST_DEBOUNCE_MS = 400;
const VIDEO_REFERENCE_HANDLES = ['video-reference-1', 'video-reference-2', 'video-reference-3'] as const;

function makeFlowId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function createDebouncedLocalStorage(delayMs: number): StateStorage {
  const pending = new Map<string, string>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  const flush = (name: string) => {
    const value = pending.get(name);
    const timer = timers.get(name);

    if (timer) {
      clearTimeout(timer);
      timers.delete(name);
    }

    if (value === undefined) {
      return;
    }

    pending.delete(name);

    try {
      window.localStorage.setItem(name, value);
    } catch {
      // Storage quota or unavailable — drop the write rather than crash.
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
      for (const name of Array.from(pending.keys())) {
        flush(name);
      }
    });
  }

  return {
    getItem: (name) => {
      const buffered = pending.get(name);
      if (buffered !== undefined) {
        return buffered;
      }

      try {
        return window.localStorage.getItem(name);
      } catch {
        return null;
      }
    },
    setItem: (name, value) => {
      pending.set(name, value);

      const existingTimer = timers.get(name);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      timers.set(
        name,
        setTimeout(() => flush(name), delayMs),
      );
    },
    removeItem: (name) => {
      pending.delete(name);

      const timer = timers.get(name);
      if (timer) {
        clearTimeout(timer);
        timers.delete(name);
      }

      try {
        window.localStorage.removeItem(name);
      } catch {
        // ignore
      }
    },
  };
}

function resolveNodeOutputAsset(node: AppNode): string | undefined {
  if (
    (node.type === 'imageGen' || node.type === 'audioGen' || node.type === 'videoGen') &&
    (node.data.mediaMode ?? 'generate') === 'import'
  ) {
    const sourceAssetUrl = resultValueAsMediaUrl(node.data.sourceAssetUrl);
    if (sourceAssetUrl) {
      return sourceAssetUrl;
    }
    const result = resultValueAsMediaUrl(node.data.result);
    if (result) {
      return result;
    }
    if (node.data.sourceBinItemId) {
      const item = useSourceBinStore.getState().getAllItems().find((item) => item.id === node.data.sourceBinItemId);
      if (item?.assetUrl) {
        return item.assetUrl;
      }
    }
    return undefined;
  }

  return resultValueAsMediaUrl(node.data.result);
}

function shouldReuseExistingNodeOutput(node: AppNode): boolean {
  if (!['imageGen', 'cropImageNode', 'videoGen', 'audioGen', 'composition', 'functionNode'].includes(node.type)) {
    return false;
  }

  return Boolean(resolveNodeOutputAsset(node));
}

export function canRunNode(node: AppNode): boolean {
  if (
    node.type === 'composition' ||
    node.type === 'cropImageNode' ||
    node.type === 'visionVerifyNode' ||
    node.type === 'functionNode'
  ) {
    return true;
  }

  if (node.type === 'textNode') {
    return (node.data.mode ?? 'prompt') === 'generate';
  }

  if (node.type === 'imageGen' || node.type === 'audioGen' || node.type === 'videoGen') {
    return (node.data.mediaMode ?? 'generate') === 'generate';
  }

  return false;
}

function createInitialNodeData(type: FlowNodeType, settings: RuntimeSettingsSnapshot): PersistedNodeData {
  switch (type) {
    case 'textNode':
      return {
        mode: 'prompt',
        prompt: '',
        systemPrompt: '',
        provider: 'gemini',
        modelId: settings.defaultModels.text.gemini,
      };
    case 'imageGen': {
      // Use the user-pinned default image model (set via the node's "default" checkbox) when present.
      const pinnedImageModel = useSettingsStore.getState().defaultImageNodeModel;
      return {
        mediaMode: 'generate',
        provider: pinnedImageModel?.provider ?? 'gemini',
        modelId: pinnedImageModel?.modelId ?? settings.defaultModels.image.gemini,
        videoFrameSelection: 'last',
      };
    }
    case 'cropImageNode':
      return {
        cropXPercent: 10,
        cropYPercent: 10,
        cropWidthPercent: 80,
        cropHeightPercent: 80,
      };
    case 'videoGen':
      return {
        mediaMode: 'generate',
        provider: 'gemini',
        modelId: settings.defaultModels.video.gemini,
        videoReference1Type: 'asset',
        videoReference2Type: 'asset',
        videoReference3Type: 'asset',
      };
    case 'audioGen':
      return {
        mediaMode: 'generate',
        provider: 'elevenlabs',
        modelId: settings.defaultModels.audio.elevenlabs,
        voiceId: settings.providerSettings.elevenlabsVoiceId,
        geminiVoiceName: 'Kore',
        audioStyleDescription: '',
        audioGenerationMode: 'speech',
        audioLoop: false,
        audioPromptInfluence: 0.3,
        audioRemoveBackgroundNoise: false,
      };
    case 'settings':
      return {
        aspectRatio: DEFAULT_EXECUTION_CONFIG.aspectRatio,
        steps: DEFAULT_EXECUTION_CONFIG.steps,
        durationSeconds: DEFAULT_EXECUTION_CONFIG.durationSeconds,
        videoResolution: DEFAULT_EXECUTION_CONFIG.videoResolution,
        imageOutputFormat: DEFAULT_EXECUTION_CONFIG.imageOutputFormat,
        audioOutputFormat: DEFAULT_EXECUTION_CONFIG.audioOutputFormat,
      };
    case 'composition':
      return {
        aspectRatio: '16:9',
        videoResolution: '1080p',
        videoFrameRate: 30,
        compositionAudioTrackCount: 1,
        compositionTimelineSeconds: 30,
        compositionUseVideoAudio: false,
        compositionVideoAudioVolume: 100,
        compositionAudio1OffsetMs: 0,
        compositionAudio2OffsetMs: 0,
        compositionAudio3OffsetMs: 0,
        compositionAudio4OffsetMs: 0,
        compositionAudio1Volume: 100,
        compositionAudio2Volume: 100,
        compositionAudio3Volume: 100,
        compositionAudio4Volume: 100,
        compositionAudio1Enabled: true,
        compositionAudio2Enabled: true,
        compositionAudio3Enabled: true,
        compositionAudio4Enabled: true,
      };
    case 'sourceBin':
      return {};
    case 'valueNode':
      return {
        valueKind: 'text',
        value: '',
      };
    case 'colorSwatchNode':
      return {
        colorSwatchColors: [],
        colorSwatchDraftColor: '#38BDF8',
        colorSwatchSelectedIndex: -1,
        colorSwatchUsageMode: 'primary',
      };
    case 'list':
      return {};
    case 'expander':
      return {
        expandedItemIndex: 0,
      };
    case 'envelope':
    case 'virtual':
    case 'portal':
    case 'advancedImageEditor':
      return {};
    case 'groupNode':
      return {
        groupNode: createGroupNodeConfig({
          childNodeIds: [],
          childEdgeIds: [],
          bounds: { x: 0, y: 0, width: 280, height: 180 },
        }),
      };
    case 'functionNode':
      return {
        functionNode: createDefaultFunctionNodeConfig('Reusable function'),
      };
    default:
      return {};
  }
}

function stripRuntimeData(node: AppNode): AppNode {
  return {
    ...node,
    data: {
      ...node.data,
      onChange: undefined,
      onRun: undefined,
      onSelectAttempt: undefined,
      isRunning: undefined,
      error: undefined,
      statusMessage: undefined,
      result: undefined,
      resultType: undefined,
      resultMimeType: undefined,
      resultExtension: undefined,
      resultFileName: undefined,
      resultOutputMetadata: undefined,
      resultHistory: undefined,
      selectedResultId: undefined,
      usage: undefined,
      sourceAssetUrl: undefined,
    },
  };
}

function stripProjectRuntimeData(node: AppNode): AppNode {
  return {
    ...node,
    data: {
      ...node.data,
      onChange: undefined,
      onRun: undefined,
      onSelectAttempt: undefined,
      isRunning: undefined,
      error: undefined,
      statusMessage: undefined,
      sourceAssetUrl: undefined,
    },
  };
}

function combineNodeDataPatches(...patches: Array<Partial<NodeData> | undefined>): Partial<NodeData> | undefined {
  const combined: Partial<NodeData> = {};

  for (const patch of patches) {
    if (patch) {
      Object.assign(combined, patch);
    }
  }

  return Object.keys(combined).length > 0 ? combined : undefined;
}

function normalizePersistedNode(node: AppNode): AppNode {
  const normalizedNode =
    (node.type as string) === 'input'
      ? ({
          ...node,
          type: 'textNode',
        } as AppNode)
      : node;

  if (
    normalizedNode.type === 'videoGen' &&
    (normalizedNode.data.provider === undefined || normalizedNode.data.provider === 'gemini')
  ) {
    const normalizedModelId = normalizeGeminiVideoModelId(normalizedNode.data.modelId);

    if (normalizedModelId !== normalizedNode.data.modelId) {
      return {
        ...normalizedNode,
        data: {
          ...normalizedNode.data,
          modelId: normalizedModelId,
        },
      };
    }
  }

  return normalizedNode;
}

type StableRuntimeCallbacks = {
  onChange: NonNullable<NodeData['onChange']>;
  onSelectAttempt: NonNullable<NodeData['onSelectAttempt']>;
  onRun: NonNullable<NodeData['onRun']> | undefined;
};

const RUNTIME_CALLBACK_CACHE = new Map<string, { canRun: boolean; callbacks: StableRuntimeCallbacks }>();

function getStableRuntimeCallbacks(
  nodeId: string,
  canRun: boolean,
  get: () => FlowState,
): StableRuntimeCallbacks {
  const cached = RUNTIME_CALLBACK_CACHE.get(nodeId);

  if (cached && cached.canRun === canRun) {
    return cached.callbacks;
  }

  const callbacks: StableRuntimeCallbacks = {
    onChange: (key, value) => get().updateNodeData(nodeId, key, value),
    onSelectAttempt: (attemptId) => get().selectNodeAttempt(nodeId, attemptId),
    onRun: canRun
      ? () => {
          void get().runNode(nodeId);
        }
      : undefined,
  };

  RUNTIME_CALLBACK_CACHE.set(nodeId, { canRun, callbacks });
  return callbacks;
}

function attachRuntimeData(node: AppNode, get: () => FlowState): AppNode {
  const callbacks = getStableRuntimeCallbacks(node.id, canRunNode(node), get);

  if (
    node.data.onChange === callbacks.onChange &&
    node.data.onSelectAttempt === callbacks.onSelectAttempt &&
    node.data.onRun === callbacks.onRun &&
    node.data.isRunning === false
  ) {
    return node;
  }

  return {
    ...node,
    data: {
      ...node.data,
      onChange: callbacks.onChange,
      onSelectAttempt: callbacks.onSelectAttempt,
      onRun: callbacks.onRun,
      isRunning: false,
    },
  };
}

function attachRuntimeDataToNodes(nodes: AppNode[], get: () => FlowState): AppNode[] {
  let mutated = false;
  const next = nodes.map((node) => {
    const normalized = normalizePersistedNode(node);
    const attached = attachRuntimeData(normalized, get);

    if (attached !== node) {
      mutated = true;
    }

    return attached;
  });

  return mutated ? next : nodes;
}

async function confirmGeneratedAssetCleanupForRemovedNodes(removedNodeIds: Iterable<string>): Promise<void> {
  const removedNodeIdSet = new Set(removedNodeIds);
  if (removedNodeIdSet.size === 0) {
    return;
  }

  const sourceBinStore = useSourceBinStore.getState();
  const itemsToRemove = sourceBinStore.getAllItems().filter((item) => item.originNodeId && removedNodeIdSet.has(item.originNodeId));

  if (itemsToRemove.length === 0) {
    return;
  }

  const shouldDelete = await useConfirmationStore.getState().requestConfirmation(
    `Deleting these nodes will orphan ${itemsToRemove.length} generated asset(s) in your Source Library.\n\nContinue to delete these generated assets as well, or cancel to keep them in the Source Library.`,
    'Generated Asset Cleanup',
  );

  if (shouldDelete) {
    itemsToRemove.forEach((item) => sourceBinStore.removeItem(item.id));
  }
}

function hasNodeDataPatchChange(data: NodeData, patch: Partial<NodeData>): boolean {
  return Object.entries(patch).some(([key, value]) => !Object.is(data[key], value));
}

function normalizeFlowEdges(nodes: AppNode[], edges: Edge[]): Edge[] {
  const visibleEdges = edges.filter((edge) => !isPortalSyntheticEdge(edge));
  const normalizedEdges = normalizePortalEdges(nodes, normalizeCompositionEdges(
    nodes,
    normalizeVideoImageEdges(nodes, normalizeImageEdges(nodes, visibleEdges)),
  ));
  return annotateFlowEdges(normalizedEdges, nodes);
}

export function sanitizePersistedFlowState(value: unknown): { nodes: AppNode[]; edges: Edge[]; bookmarkSidebarOpen: boolean } {
  const input = isRecord(value) ? value : {};
  return {
    nodes: Array.isArray(input.nodes) ? (input.nodes as AppNode[]) : [],
    edges: Array.isArray(input.edges) ? (input.edges as Edge[]) : [],
    bookmarkSidebarOpen: typeof input.bookmarkSidebarOpen === 'boolean' ? input.bookmarkSidebarOpen : true,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function validateListConnection(
  connection: Connection,
  nodes: AppNode[],
  edges: Edge[],
): { connection?: Connection; edges: Edge[]; error?: string } {
  const targetNode = nodes.find((node) => node.id === connection.target);

  if (targetNode?.type !== 'list') {
    return { connection, edges };
  }

  if (!isListItemTargetHandle(connection.targetHandle)) {
    return {
      edges,
      error: 'Drop outputs onto a visible list slot instead of the list body.',
    };
  }

  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const rawSourceNode = nodesById.get(connection.source);
  const sourceNode = rawSourceNode
    ? resolveEffectiveSourceNode(rawSourceNode, nodesById, edges)
    : undefined;
  const sourceKind = sourceNode?.type === 'expander'
    ? resolveExpandedListItemForNode(sourceNode, nodes, edges)?.kind
    : sourceNode
      ? resolveNodeListItemKind(sourceNode, nodes, edges)
      : undefined;

  if (!sourceKind) {
    return {
      edges,
      error: 'This output does not have a valid completed value to add yet.',
    };
  }

  const existingKind = getListNodeKind(buildListNodeItems(targetNode.id, nodes, edges));

  if (existingKind && existingKind !== sourceKind) {
    return {
      edges,
      error: `This list is typed as ${existingKind}; ${sourceKind} outputs cannot be added.`,
    };
  }

  return {
    connection,
    edges: edges.filter(
      (edge) => !(edge.target === connection.target && edge.targetHandle === connection.targetHandle),
    ),
  };
}

function buildIncomingMap(edges: Edge[]): Map<string, string[]> {
  const incoming = new Map<string, string[]>();

  for (const edge of edges) {
    const existing = incoming.get(edge.target) ?? [];
    existing.push(edge.source);
    incoming.set(edge.target, existing);
  }

  return incoming;
}

function buildNodeMap(nodes: AppNode[]): Map<string, AppNode> {
  return new Map(nodes.map((node) => [node.id, node]));
}

function getEffectiveSources(
  nodeId: string,
  edges: Edge[],
  nodesById: Map<string, AppNode>,
  visited = new Set<string>()
): AppNode[] {
  if (visited.has(nodeId)) {
    return [];
  }
  visited.add(nodeId);

  const node = nodesById.get(nodeId);
  if (!node) {
    return [];
  }

  if (canRunNode(node)) {
    return [node];
  }

  const sources: AppNode[] = [];
  const resolvedNode = resolveEffectiveSourceNode(node, nodesById, edges);
  if (resolvedNode && resolvedNode.id !== node.id) {
    return getEffectiveSources(resolvedNode.id, edges, nodesById, visited);
  }

  for (const edge of edges) {
    if (edge.target === nodeId) {
      const parentSources = getEffectiveSources(edge.source, edges, nodesById, visited);
      for (const src of parentSources) {
        if (!sources.some((s) => s.id === src.id)) {
          sources.push(src);
        }
      }
    }
  }

  if (sources.length === 0) {
    return [node];
  }

  return sources;
}

export function getExecutionDependencies(
  node: AppNode,
  edges: Edge[],
  nodesById: Map<string, AppNode>,
): string[] {
  const dependencies = new Set<string>();

  for (const edge of edges) {
    if (edge.target !== node.id) {
      continue;
    }

    const rawSourceNode = nodesById.get(edge.source);
    if (!rawSourceNode) {
      continue;
    }

    const effectiveSources = getEffectiveSources(rawSourceNode.id, edges, nodesById);

    for (const sourceNode of effectiveSources) {
      if (edge.targetHandle === LOOP_BREAK_TARGET_HANDLE) {
        if (canRunNode(sourceNode)) {
          dependencies.add(sourceNode.id);
        }
        continue;
      }

      // Preflight has already rejected invalid typed edges. Any runnable effective source of a
      // valid incoming value is therefore a real execution dependency, regardless of which
      // routing/container node exposed it. Keeping this type-driven avoids parallel node allowlists
      // that silently fall behind new output types.
      if (canRunNode(sourceNode)) {
        dependencies.add(sourceNode.id);
      }
    }
  }

  if (node.type === 'storyStateNode') {
    const key = (node.data.key as string) ?? '';
    const incomingEdge = edges.find((e) => e.target === node.id);
    if (!incomingEdge && key) {
      for (const n of nodesById.values()) {
        if (n.type === 'storyStateNode' && n.id !== node.id && (n.data.key as string) === key) {
          if (edges.some((e) => e.target === n.id)) {
            dependencies.add(n.id);
          }
        }
      }
    }
  }

  return [...dependencies].filter((depId) => depId !== node.id);
}

export function collectTextInputs(
  nodeId: string,
  nodesById: Map<string, AppNode>,
  incoming: Map<string, string[]>,
  edges: Edge[] = [],
): string {
  const sourceIds = incoming.get(nodeId) ?? [];
  const prompts = sourceIds.flatMap((sourceId) =>
    collectTextInputsFromSource(sourceId, nodesById, incoming, edges, new Set()),
  );

  return prompts.join('\n\n').trim();
}

export function collectTextMediaInputs(
  node: AppNode,
  nodesById: Map<string, AppNode>,
  edges: Edge[],
): GeminiTextMediaInput[] {
  const inputsByUrl = new Map<string, GeminiTextMediaInput>();
  const addInput = (input: GeminiTextMediaInput) => {
    const mimeType = input.mimeType ?? getDefaultGeminiTextMimeType(input.kind);
    const normalizedInput: GeminiTextMediaInput = {
      ...input,
      mimeType,
    };

    if (!normalizedInput.url || !isGeminiTextMediaInputSupported(normalizedInput)) {
      return;
    }

    inputsByUrl.set(`${normalizedInput.url}:${mimeType ?? ''}`, normalizedInput);
  };
  const directSourceItemId =
    typeof node.data.textVisionSourceItemId === 'string' && node.data.textVisionSourceItemId.trim()
      ? node.data.textVisionSourceItemId.trim()
      : undefined;
  const sourceBinItems = useSourceBinStore.getState().getAllItems();

  if (typeof node.data.sourceAssetUrl === 'string' && node.data.sourceAssetUrl.trim()) {
    addInput({
      url: node.data.sourceAssetUrl,
      mimeType: node.data.sourceAssetMimeType,
      kind: inferGeminiTextMediaKind(node.data.sourceAssetMimeType),
      label: node.data.sourceAssetName,
    });
  }

  if (directSourceItemId) {
    const directSourceItem = sourceBinItems.find((item) => item.id === directSourceItemId);

    if (directSourceItem?.assetUrl) {
      addInput({
        url: directSourceItem.assetUrl,
        mimeType: directSourceItem.mimeType,
        kind: directSourceItem.kind,
        label: directSourceItem.label,
      });
    }
  }

  const incoming = buildIncomingMap(edges);
  const matchingEdges = edges.filter((edge) => edge.target === node.id);

  for (const edge of matchingEdges) {
    const rawSourceNode = nodesById.get(edge.source);
    const sourceNode = rawSourceNode
      ? resolveEffectiveSourceNode(rawSourceNode, nodesById, edges, edge.sourceHandle)
      : undefined;

    if (!sourceNode || ![
      'imageGen',
      'cropImageNode',
      'slimgNode',
      'advancedImageEditor',
      'audioGen',
      'videoGen',
      'composition',
      'functionNode',
      'expander',
    ].includes(sourceNode.type)) {
      continue;
    }

    const mediaInput = collectTextMediaInputFromSource(edge.source, nodesById, incoming, edges, new Set());

    if (mediaInput) {
      addInput(mediaInput);
    }
  }

  return [...inputsByUrl.values()];
}

function resolveExpandedItemFromNode(
  node: AppNode,
  nodesById: Map<string, AppNode>,
  edges: Edge[],
) {
  return resolveExpandedListItemForNode(node, [...nodesById.values()], edges);
}

function expandedItemMatchesAcceptedTypes(
  item: ReturnType<typeof resolveExpandedListItemForNode>,
  acceptedTypes: FlowNodeType[],
): boolean {
  if (!item) return false;
  return acceptedTypes.some((type) => {
    switch (type) {
      case 'textNode':
        return item.kind === 'text';
      case 'imageGen':
      case 'cropImageNode':
        return item.kind === 'image';
      case 'videoGen':
      case 'composition':
        return item.kind === 'video';
      case 'audioGen':
        return item.kind === 'audio';
      default:
        return false;
    }
  });
}

function textMediaKindForExpandedItem(
  item: NonNullable<ReturnType<typeof resolveExpandedListItemForNode>>,
): GeminiTextMediaInput['kind'] | undefined {
  return inferGeminiTextMediaKind(item.mimeType)
    ?? (item.kind === 'image' || item.kind === 'audio' || item.kind === 'video' ? item.kind : undefined);
}

function collectTextInputsFromSource(
  sourceId: string,
  nodesById: Map<string, AppNode>,
  incoming: Map<string, string[]>,
  edges: Edge[],
  visited: Set<string>,
): string[] {
  if (visited.has(sourceId)) {
    return [];
  }

  visited.add(sourceId);

  const node = nodesById.get(sourceId);
  if (!node) {
    return [];
  }

  if (node.type === 'settings') {
    return (incoming.get(sourceId) ?? []).flatMap((upstreamId) =>
      collectTextInputsFromSource(upstreamId, nodesById, incoming, edges, visited),
    );
  }

  if (node.type === 'virtual') {
    return (incoming.get(sourceId) ?? []).flatMap((upstreamId) =>
      collectTextInputsFromSource(upstreamId, nodesById, incoming, edges, visited),
    );
  }

  const listAndUtilityNodeTypes = [
    'textNode',
    'expander',
    'packageNode',
    'colorSwatchNode',
    'conditionalNode',
    'stringTemplateNode',
    'promptsJoinerNode',
    'regexReplaceNode',
    'listLengthNode',
    'mathNode',
    'logicNode',
    'comparisonNode',
    'visionVerifyNode',
    'valueMonitorNode',
    'numberNode',
    'functionNode',
    'doodleNode',
  ];

  if (listAndUtilityNodeTypes.includes(node.type)) {
    const monitorVisited = new Set(visited);
    monitorVisited.delete(node.id);
    const value = evaluateNodeTextForMonitor(node.id, Array.from(nodesById.values()), edges, monitorVisited);
    return value.trim() ? [value.trim()] : [];
  }

  if (node.type === 'envelope') {
    const items = collectEnvelopeItemsForEnvelopeNode(node.id, Array.from(nodesById.values()), edges);
    return items.flatMap((item) => {
      if (item.kind === 'text' && item.value?.trim()) {
        return [item.value.trim()];
      }
      if (item.kind === 'package' && item.text?.trim()) {
        return [item.text.trim()];
      }
      return [];
    });
  }

  return [];
}

function collectImageInputForHandle(
  nodeId: string,
  targetHandles: Array<VideoTargetHandle | undefined>,
  nodesById: Map<string, AppNode>,
  edges: Edge[],
): string | undefined {
  const incoming = buildIncomingMap(edges);
  const matchingEdges = edges.filter(
    (edge) => edge.target === nodeId && targetHandles.includes(edge.targetHandle as VideoTargetHandle | undefined),
  );

  for (const edge of matchingEdges) {
    const image = collectImageInputFromSource(edge.source, nodesById, incoming, edges, new Set());

    if (image) {
      return image;
    }
  }

  return undefined;
}

function collectReferenceImageInputs(
  node: AppNode,
  nodesById: Map<string, AppNode>,
  edges: Edge[],
): Array<{ url: string; referenceType: VideoReferenceType }> {
  return VIDEO_REFERENCE_HANDLES.flatMap((handle, index) => {
    const url = collectImageInputForHandle(node.id, [handle], nodesById, edges);

    if (!url) {
      return [];
    }

    const dataKey = `videoReference${index + 1}Type` as const;
    const referenceType = (node.data[dataKey] as VideoReferenceType | undefined) ?? 'asset';

    return [{ url, referenceType }];
  });
}

function collectVideoExtensionInput(
  nodeId: string,
  nodesById: Map<string, AppNode>,
  edges: Edge[],
): string | undefined {
  return collectResultInputForHandle(
    nodeId,
    'video-source-video',
    nodesById,
    edges,
    ['videoGen', 'composition'],
  )?.result;
}

export function collectUpstreamImageInput(
  nodeId: string,
  nodesById: Map<string, AppNode>,
  edges: Edge[],
): string | undefined {
  const explicitSource = collectUpstreamImageInputForHandles(
    nodeId,
    ['image-edit-source', 'image'],
    nodesById,
    edges,
  );

  if (explicitSource) {
    return explicitSource;
  }

  const incoming = buildIncomingMap(edges);
  const matchingEdges = edges.filter(
    (edge) => edge.target === nodeId && (edge.targetHandle == null || edge.targetHandle === ''),
  );

  for (const edge of matchingEdges) {
    const rawSourceNode = nodesById.get(edge.source);
    const sourceNode = rawSourceNode
      ? resolveEffectiveSourceNode(rawSourceNode, nodesById, edges, edge.sourceHandle)
      : undefined;

    const allowedTypes: FlowNodeType[] = ['imageGen', 'cropImageNode', 'slimgNode', 'advancedImageEditor', 'packageNode', 'doodleNode', 'envelope', 'expander', 'functionNode'];
    if (!sourceNode || !allowedTypes.includes(sourceNode.type)) {
      continue;
    }

    const image = collectImageInputFromSource(edge.source, nodesById, incoming, edges, new Set());

    if (image) {
      return image;
    }
  }

  return undefined;
}

// loras JSON from a connected LoRA Spec node (first one wins), for FLUX LoRA image models.
function collectUpstreamLoraJson(
  nodeId: string,
  nodesById: Map<string, AppNode>,
  edges: Edge[],
): string | undefined {
  for (const edge of edges) {
    if (edge.target !== nodeId) continue;
    const sourceNode = nodesById.get(edge.source);
    if (sourceNode?.type !== 'loraSpecNode') continue;
    const json = buildLoraWeightsJson(sourceNode.data.loraEntries);
    if (json) return json;
  }
  return undefined;
}

export function collectUpstreamImageInputForHandles(
  nodeId: string,
  targetHandles: Array<ImageTargetHandle | undefined>,
  nodesById: Map<string, AppNode>,
  edges: Edge[],
): string | undefined {
  const incoming = buildIncomingMap(edges);
  const matchingEdges = edges.filter(
    (edge) => edge.target === nodeId && targetHandles.includes(edge.targetHandle as ImageTargetHandle | undefined),
  );

  for (const edge of matchingEdges) {
    const rawSourceNode = nodesById.get(edge.source);
    const sourceNode = rawSourceNode
      ? resolveEffectiveSourceNode(rawSourceNode, nodesById, edges, edge.sourceHandle)
      : undefined;

    const allowedTypes: FlowNodeType[] = ['imageGen', 'cropImageNode', 'slimgNode', 'advancedImageEditor', 'packageNode', 'doodleNode', 'envelope', 'expander', 'functionNode'];
    if (!sourceNode || !allowedTypes.includes(sourceNode.type)) {
      continue;
    }

    const image = collectImageInputFromSource(edge.source, nodesById, incoming, edges, new Set());

    if (image) {
      return image;
    }
  }

  return undefined;
}

function collectImageReferenceInputs(
  nodeId: string,
  nodesById: Map<string, AppNode>,
  edges: Edge[],
): string[] {
  return IMAGE_REFERENCE_HANDLES.flatMap((handle) => {
    const url = collectUpstreamImageInputForHandles(nodeId, [handle], nodesById, edges);
    return url ? [url] : [];
  });
}

export function collectImageMaskInput(
  nodeId: string,
  nodesById: Map<string, AppNode>,
  edges: Edge[],
): string | undefined {
  const node = nodesById.get(nodeId);
  const connectedMaskInput = collectUpstreamImageInputForHandles(nodeId, [IMAGE_MASK_HANDLE], nodesById, edges);
  return node ? resolveImageNodeMaskInput({ connectedMaskInput, nodeData: node.data }) : connectedMaskInput;
}

function collectUpstreamVideoInput(
  nodeId: string,
  nodesById: Map<string, AppNode>,
  edges: Edge[],
): string | undefined {
  const matchingEdges = edges.filter((edge) => edge.target === nodeId);

  for (const edge of matchingEdges) {
    const rawSourceNode = nodesById.get(edge.source);
    const sourceNode = rawSourceNode
      ? resolveEffectiveSourceNode(rawSourceNode, nodesById, edges)
      : undefined;

    if (!sourceNode) {
      continue;
    }

    if (sourceNode.type === 'expander') {
      const item = resolveExpandedItemFromNode(sourceNode, nodesById, edges);
      if (item?.kind === 'video') {
        return item.value;
      }
      continue;
    }

    if (sourceNode.type === 'functionNode') {
      const asset = sourceNode.data.resultType === 'video' && typeof sourceNode.data.result === 'string'
        ? sourceNode.data.result
        : undefined;
      if (asset) {
        return asset;
      }
      continue;
    }

    if (!['videoGen', 'composition'].includes(sourceNode.type)) {
      continue;
    }

    const asset = resolveNodeOutputAsset(sourceNode);

    if (asset) {
      return asset;
    }
  }

  return undefined;
}

function collectUpstreamAudioInput(
  nodeId: string,
  nodesById: Map<string, AppNode>,
  edges: Edge[],
): string | undefined {
  const matchingEdges = edges.filter((edge) => edge.target === nodeId);

  for (const edge of matchingEdges) {
    const rawSourceNode = nodesById.get(edge.source);
    const sourceNode = rawSourceNode
      ? resolveEffectiveSourceNode(rawSourceNode, nodesById, edges)
      : undefined;

    if (!sourceNode) {
      continue;
    }

    if (sourceNode.type === 'expander') {
      const item = resolveExpandedItemFromNode(sourceNode, nodesById, edges);
      if (item?.kind === 'audio') {
        return item.value;
      }
      continue;
    }

    if (sourceNode.type === 'functionNode') {
      const asset = sourceNode.data.resultType === 'audio' && typeof sourceNode.data.result === 'string'
        ? sourceNode.data.result
        : undefined;
      if (asset) {
        return asset;
      }
      continue;
    }

    if (sourceNode.type !== 'audioGen') {
      continue;
    }

    const asset = resolveNodeOutputAsset(sourceNode);

    if (asset) {
      return asset;
    }
  }

  return undefined;
}

function collectEditorVisualSequence(
  node: AppNode,
  nodesById: Map<string, AppNode>,
): ManualEditorVisualSequenceClip[] {
  const sourceBinItems = useSourceBinStore.getState().getAllItems();
  const sourceBinItemBySourceId = buildSourceBinLibraryItemLookup(sourceBinItems);
  const editorAssetById = new Map(getEditorAssets(node.data).map((asset) => [asset.id, asset]));

  return getEditorVisualClips(node.data).flatMap((clip) => {
    const editorAsset = editorAssetById.get(clip.sourceNodeId);
    const libraryItem = sourceBinItemBySourceId.get(clip.sourceNodeId);
    const sourceNode = nodesById.get(clip.sourceNodeId) ??
      (libraryItem?.originNodeId ? nodesById.get(libraryItem.originNodeId) : undefined);
    const sourceItem = libraryItem
      ? mapLibraryItemToEditorSourceItem(libraryItem)
      : sourceNode
        ? buildSourceBinItem(sourceNode)
        : undefined;

    if (!sourceItem && !editorAsset) {
      return [];
    }

    const sourceAspectRatio =
      sourceNode && (sourceNode.type === 'imageGen' || sourceNode.type === 'videoGen')
        ? (sourceNode.data.aspectRatio as AspectRatio | undefined)
        : undefined;

    return [buildManualEditorVisualSequenceClip(clip, {
      aspectRatio: sourceAspectRatio,
      assetUrl: sourceItem?.assetUrl,
      text: sourceItem?.text ?? editorAsset?.textDefaults?.text,
      mimeType: sourceItem?.mimeType,
    })];
  });
}

function collectEditorAudioSequence(
  node: AppNode,
  nodesById: Map<string, AppNode>,
): Array<{
  url: string;
  sourceNodeId: string;
  sourceKind: 'audio' | 'video' | 'composition';
  mimeType?: string;
  offsetMs: number;
  trackIndex: number;
  trackVolumePercent?: number;
  volumePercent: number;
  volumeAutomationPoints?: Array<{ timePercent: number; valuePercent: number }>;
  volumeKeyframes?: Array<{ timePercent: number; volumePercent: number }>;
  enabled: boolean;
}> {
  const sourceBinItems = useSourceBinStore.getState().getAllItems();
  const sourceBinItemBySourceId = buildSourceBinLibraryItemLookup(sourceBinItems);
  const audioTrackVolumes = getEditorAudioTrackVolumes(node.data);

  return getEditorAudioClips(node.data).flatMap((clip) => {
    const libraryItem = sourceBinItemBySourceId.get(clip.sourceNodeId);
    const sourceNode = nodesById.get(clip.sourceNodeId);
    const sourceItem = libraryItem
      ? mapLibraryItemToEditorSourceItem(libraryItem)
      : sourceNode
        ? buildSourceBinItem(sourceNode)
        : undefined;

    if (
      !sourceItem?.assetUrl ||
      (sourceItem.kind !== 'audio' && sourceItem.kind !== 'video' && sourceItem.kind !== 'composition')
    ) {
      return [];
    }

    return [{
      url: sourceItem.assetUrl,
      sourceNodeId: clip.sourceNodeId,
      sourceKind: sourceItem.kind,
      mimeType: sourceItem.mimeType,
      offsetMs: clip.offsetMs,
      trackIndex: clip.trackIndex,
      trackVolumePercent: audioTrackVolumes[clip.trackIndex] ?? 100,
      volumePercent: clip.volumePercent,
      volumeAutomationPoints: clip.volumeAutomationPoints?.map((point) => ({ ...point })),
      volumeKeyframes: clip.volumeKeyframes?.map((keyframe) => ({ ...keyframe })),
      enabled: clip.enabled,
    }];
  });
}

function collectEditorStageObjects(node: AppNode) {
  return getEditorStageObjects(node.data).map((object) => ({ ...object }));
}

function collectResultInputForHandle(
  nodeId: string,
  targetHandle: string,
  nodesById: Map<string, AppNode>,
  edges: Edge[],
  acceptedTypes: FlowNodeType[],
): { node: AppNode; result: string } | undefined {
  const edge = edges.find((candidate) => {
    if (candidate.target !== nodeId) {
      return false;
    }

    if (candidate.targetHandle === targetHandle) {
      return true;
    }

    const rawSourceNode = nodesById.get(candidate.source);
    const sourceNode = rawSourceNode
      ? resolveEffectiveSourceNode(rawSourceNode, nodesById, edges)
      : undefined;
    return targetHandle === COMPOSITION_VIDEO_HANDLE && isCompositionVideoConnection(candidate) && (
      sourceNode?.type === 'videoGen' || sourceNode?.type === 'composition'
    );
  });

  if (!edge) {
    return undefined;
  }

  const rawSourceNode = nodesById.get(edge.source);
  const sourceNode = rawSourceNode
    ? resolveEffectiveSourceNode(rawSourceNode, nodesById, edges)
    : undefined;

  if (!sourceNode || !acceptedTypes.includes(sourceNode.type)) {
    if (sourceNode?.type === 'expander') {
      const item = resolveExpandedItemFromNode(sourceNode, nodesById, edges);
      if (expandedItemMatchesAcceptedTypes(item, acceptedTypes)) {
        return {
          node: sourceNode,
          result: item!.value,
        };
      }
    }
    return undefined;
  }

  const result = resolveNodeOutputAsset(sourceNode);

  if (!result) {
    return undefined;
  }

  return {
    node: sourceNode,
    result,
  };
}

function collectFunctionNodeInputs(
  node: AppNode,
  nodesById: Map<string, AppNode>,
  edges: Edge[],
): Record<string, DynamicValue> {
  const config = node.data.functionNode;
  if (!config) {
    return {};
  }

  const portsById = new Map(config.contract.inputPorts.map((port) => [port.id, port]));
  const inputs: Record<string, DynamicValue> = {};

  for (const edge of edges) {
    if (edge.target !== node.id || !edge.targetHandle) {
      continue;
    }

    const port = portsById.get(edge.targetHandle);
    if (!port) {
      continue;
    }

    const rawSourceNode = nodesById.get(edge.source);
    const sourceNode = rawSourceNode
      ? resolveEffectiveSourceNode(rawSourceNode, nodesById, edges)
      : undefined;

    if (!sourceNode) {
      continue;
    }

    const value = resolveFunctionInputValue(sourceNode, nodesById, edges);
    inputs[port.id] = value;
    inputs[port.key] = value;
  }

  return inputs;
}

function resolveFunctionInputValue(
  sourceNode: AppNode,
  nodesById: Map<string, AppNode>,
  edges: Edge[],
): DynamicValue {
  const asset = resolveNodeOutputAsset(sourceNode);
  if (asset !== undefined) {
    return asset;
  }

  const routed = getNodeResultForFunctionRouting(sourceNode);
  if (!isEmptyFunctionInputValue(routed)) {
    return routed;
  }

  return evaluateNodeTextForMonitor(sourceNode.id, Array.from(nodesById.values()), edges, new Set());
}

function isEmptyFunctionInputValue(value: DynamicValue): boolean {
  return value === '' || value === null || value === undefined || (Array.isArray(value) && value.length === 0);
}

function collectImageInputFromSource(
  sourceId: string,
  nodesById: Map<string, AppNode>,
  incoming: Map<string, string[]>,
  edges: Edge[],
  visited: Set<string>,
): string | undefined {
  if (visited.has(sourceId)) {
    return undefined;
  }

  visited.add(sourceId);

  const node = nodesById.get(sourceId);
  if (!node) {
    return undefined;
  }

  if (node.type === 'settings') {
    for (const upstreamId of incoming.get(sourceId) ?? []) {
      const image = collectImageInputFromSource(upstreamId, nodesById, incoming, edges, visited);

      if (image) {
        return image;
      }
    }

    return undefined;
  }

  if (node.type === 'virtual') {
    for (const upstreamId of incoming.get(sourceId) ?? []) {
      const image = collectImageInputFromSource(upstreamId, nodesById, incoming, edges, visited);

      if (image) {
        return image;
      }
    }

    return undefined;
  }

  if (node.type === 'imageGen' || node.type === 'cropImageNode') {
    if ((node.data.mediaMode ?? 'generate') === 'import') {
      const sourceAssetUrl = resultValueAsMediaUrl(node.data.sourceAssetUrl);
      if (sourceAssetUrl) {
        return sourceAssetUrl;
      }
      const result = resultValueAsMediaUrl(node.data.result);
      if (result) {
        return result;
      }
      if (node.data.sourceBinItemId) {
        const item = useSourceBinStore.getState().getAllItems().find((item) => item.id === node.data.sourceBinItemId);
        if (item?.assetUrl) {
          return item.assetUrl;
        }
      }
      return undefined;
    }
    return resultValueAsMediaUrl(node.data.result);
  }

  if (node.type === 'functionNode') {
    return node.data.resultType === 'image' && typeof node.data.result === 'string'
      ? node.data.result
      : undefined;
  }

  if (node.type === 'advancedImageEditor') {
    return typeof node.data.result === 'string' && node.data.result ? node.data.result : undefined;
  }

  if (node.type === 'expander') {
    const item = resolveExpandedItemFromNode(node, nodesById, edges);
    return item?.kind === 'image' ? item.value : undefined;
  }

  if (node.type === 'packageNode') {
    const pkg = resolvePackageNodeData(node.id, Array.from(nodesById.values()), edges);
    return pkg.image;
  }

  if (node.type === 'doodleNode') {
    const sketch = node.data.doodleSketch;
    return typeof sketch === 'string' && sketch ? sketch : undefined;
  }

  if (node.type === 'slimgNode') {
    return typeof node.data.result === 'string' && node.data.result ? node.data.result : undefined;
  }

  if (node.type === 'envelope') {
    const items = collectEnvelopeItemsForEnvelopeNode(node.id, Array.from(nodesById.values()), edges);
    const imgItem = items.find((item) => (item.kind === 'image' || item.kind === 'package') && item.value);
    return imgItem?.value;
  }

  return undefined;
}

function collectTextMediaInputFromSource(
  sourceId: string,
  nodesById: Map<string, AppNode>,
  incoming: Map<string, string[]>,
  edges: Edge[],
  visited: Set<string>,
): GeminiTextMediaInput | undefined {
  if (visited.has(sourceId)) {
    return undefined;
  }

  visited.add(sourceId);

  const node = nodesById.get(sourceId);
  if (!node) {
    return undefined;
  }

  if (node.type === 'settings' || node.type === 'virtual') {
    for (const upstreamId of incoming.get(sourceId) ?? []) {
      const input = collectTextMediaInputFromSource(upstreamId, nodesById, incoming, edges, visited);

      if (input) {
        return input;
      }
    }

    return undefined;
  }

  if (
    node.type === 'imageGen' ||
    node.type === 'cropImageNode' ||
    node.type === 'slimgNode' ||
    node.type === 'advancedImageEditor' ||
    node.type === 'audioGen' ||
    node.type === 'videoGen' ||
    node.type === 'composition' ||
    node.type === 'functionNode'
  ) {
    const url = resolveNodeOutputAsset(node);

    if (!url) {
      return undefined;
    }

    return {
      url,
      kind: resolveTextMediaKindForNode(node),
      mimeType: resolveNodeOutputMimeType(node),
      label: typeof node.data.sourceAssetName === 'string' ? node.data.sourceAssetName : node.data.modelId,
    };
  }

  if (node.type === 'expander') {
    const item = resolveExpandedItemFromNode(node, nodesById, edges);
    if (!item) return undefined;
    const kind = textMediaKindForExpandedItem(item);
    if (!kind) return undefined;
    return {
      url: item.value,
      kind,
      mimeType: item.mimeType,
      label: item.label,
    };
  }

  return undefined;
}

function resolveNodeOutputMimeType(node: AppNode): string | undefined {
  if (node.type === 'imageGen' || node.type === 'cropImageNode' || node.type === 'videoGen' || node.type === 'audioGen') {
    return (node.data.mediaMode ?? 'generate') === 'import'
      ? node.data.sourceAssetMimeType
      : node.data.resultMimeType ?? getDefaultGeminiTextMimeType(resolveTextMediaKindForNode(node));
  }

  if (node.type === 'composition') {
    return typeof node.data.resultMimeType === 'string'
      ? node.data.resultMimeType
      : node.data.resultType === 'package'
        ? 'application/zip'
        : 'video/mp4';
  }

  if (node.type === 'functionNode') {
    if (typeof node.data.resultMimeType === 'string') {
      return node.data.resultMimeType;
    }
    switch (node.data.resultType) {
      case 'image':
        return 'image/png';
      case 'video':
        return 'video/mp4';
      case 'audio':
        return 'audio/mpeg';
      case 'package':
        return 'application/zip';
      case 'text':
      case 'number':
      case 'boolean':
        return 'text/plain';
      case 'json':
      case 'list':
      case 'envelope':
        return 'application/json';
      default:
        return undefined;
    }
  }

  if (node.type === 'slimgNode' || node.type === 'advancedImageEditor') {
    return node.data.resultMimeType ?? 'image/png';
  }

  return undefined;
}

function resolveTextMediaKindForNode(node: AppNode): GeminiTextMediaInput['kind'] | undefined {
  switch (node.type) {
    case 'imageGen':
    case 'cropImageNode':
    case 'slimgNode':
    case 'advancedImageEditor':
      return 'image';
    case 'audioGen':
      return 'audio';
    case 'videoGen':
      return 'video';
    case 'composition':
      return node.data.resultType === 'package' ? 'package' : 'composition';
    case 'functionNode':
      if (node.data.resultType === 'image' || node.data.resultType === 'audio' || node.data.resultType === 'video' || node.data.resultType === 'package') {
        return node.data.resultType;
      }
      return undefined;
    default:
      return undefined;
  }
}

function inferGeminiTextMediaKind(mimeType?: string): GeminiTextMediaInput['kind'] | undefined {
  const normalized = mimeType?.toLowerCase() ?? '';

  if (normalized.startsWith('image/')) {
    return 'image';
  }

  if (normalized.startsWith('audio/')) {
    return 'audio';
  }

  if (normalized.startsWith('video/')) {
    return 'video';
  }

  if (normalized === 'application/pdf' || normalized.startsWith('text/')) {
    return 'document';
  }

  return undefined;
}

function collectExecutionConfig(
  nodeId: string,
  currentNode: AppNode,
  nodesById: Map<string, AppNode>,
  incoming: Map<string, string[]>,
): ExecutionConfig {
  const configNodes: NodeData[] = [];
  visitConfigNodes(nodeId, nodesById, incoming, new Set(), configNodes);
  const baseConfig = getDefaultExecutionConfigForNode(currentNode.type);

  const mergedConfig = configNodes.reduce<ExecutionConfig>(
    (current, data) => mergeExecutionConfig(current, data),
    baseConfig,
  );

  return mergeExecutionConfig(mergedConfig, currentNode.data);
}

function mergeExecutionConfig(current: ExecutionConfig, data: NodeData): ExecutionConfig {
  return {
    aspectRatio: getNodeAspectRatio((data.aspectRatio as string | undefined) ?? current.aspectRatio),
    steps: coerceNumber(data.steps, current.steps),
    durationSeconds: coerceNumber(data.durationSeconds, current.durationSeconds),
    videoResolution: getVideoResolution((data.videoResolution as string | undefined) ?? current.videoResolution),
    videoFrameRate: coerceFrameRate(data.videoFrameRate, current.videoFrameRate),
    imageOutputFormat: getImageOutputFormat(
      (data.imageOutputFormat as string | undefined) ?? current.imageOutputFormat,
    ),
    audioOutputFormat: getAudioOutputFormat(
      (data.audioOutputFormat as string | undefined) ?? current.audioOutputFormat,
    ),
  };
}

function coerceFrameRate(value: number | string | undefined, fallback: number): number {
  const next = coerceNumber(value, fallback);
  return [24, 25, 30, 60].includes(next) ? next : fallback;
}

function visitConfigNodes(
  nodeId: string,
  nodesById: Map<string, AppNode>,
  incoming: Map<string, string[]>,
  visited: Set<string>,
  collected: NodeData[],
): void {
  if (visited.has(nodeId)) {
    return;
  }

  visited.add(nodeId);

  for (const sourceId of incoming.get(nodeId) ?? []) {
    visitConfigNodes(sourceId, nodesById, incoming, visited, collected);
    const sourceNode = nodesById.get(sourceId);

    if (sourceNode?.type === 'settings') {
      collected.push(sourceNode.data);
    }
  }
}

function coerceNumber(value: number | string | undefined, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

function resolveCombinedLoopIterationCount(explicitLoopCount: number, promptSignalLoopCount: number): number {
  if (promptSignalLoopCount <= 1) {
    return explicitLoopCount;
  }

  if (explicitLoopCount <= 1) {
    return promptSignalLoopCount;
  }

  if (explicitLoopCount === promptSignalLoopCount) {
    return explicitLoopCount;
  }

  throw new Error('Prompt batches and connected media lists must have the same length, or one side must be a single broadcastable item.');
}

function formatBlockingDiagnosticsMessage(diagnostics: Array<{ message: string; nodeId?: string; edgeId?: string }>): string {
  const [first, ...rest] = diagnostics;
  const location = first?.nodeId ? `Node ${first.nodeId}: ` : first?.edgeId ? `Edge ${first.edgeId}: ` : '';
  const suffix = rest.length > 0 ? ` (${rest.length} more issue${rest.length === 1 ? '' : 's'} in Diagnostics.)` : '';
  return `${location}${first?.message ?? 'Flow diagnostics found a blocking issue.'}${suffix}`;
}

function buildEnvelopeItemFromExecution(
  nodeId: string,
  index: number,
  execution: {
    result: import('../types/flow').ResultValue;
    resultType: ResultType;
    statusMessage: string;
    usage?: UsageTelemetry;
    mimeType?: string;
  },
  iterationItems: LoopIterationItem[] = [],
): EnvelopeItem {
  return {
    id: `${nodeId}-envelope-${Date.now()}-${index}`,
    index,
    kind: execution.resultType,
    label: buildEnvelopeItemLabel(execution.resultType, index, iterationItems),
    value: serializeResultValueForContainer(execution.result, execution.resultType),
    mimeType: execution.mimeType ?? getResultMimeType(execution.resultType),
    sourceNodeId: nodeId,
    usage: execution.usage,
  };
}

function buildEnvelopeItemFromSourceBinItem(item: import('./sourceBinStore').SourceBinLibraryItem): EnvelopeItem {
  return {
    id: `envelope-${item.id}`,
    index: item.envelopeIndex ?? 0,
    kind: item.kind as ResultType,
    label: item.label,
    value: item.assetUrl ?? item.text ?? '',
    mimeType: item.mimeType ?? 'application/octet-stream',
    sourceBinItemId: item.id,
    sourceNodeId: item.originNodeId ?? '',
  };
}

function buildEnvelopeItemLabel(
  kind: ResultType,
  index: number,
  iterationItems: LoopIterationItem[],
): string {
  const baseLabel = `${capitalizeResultKind(kind)} ${index + 1}`;

  if (iterationItems.length < 2) {
    return baseLabel;
  }

  const dimensions = iterationItems
    .map(formatLoopDimensionLabel)
    .filter((label) => label.length > 0);

  return dimensions.length > 0 ? `${baseLabel} · ${dimensions.join(' + ')}` : baseLabel;
}

function formatLoopDimensionLabel(iterationItem: LoopIterationItem): string {
  const handleLabel = formatLoopTargetHandleLabel(iterationItem.input.targetHandle);

  if (handleLabel) {
    return `${handleLabel} ${iterationItem.item.index + 1}`;
  }

  return iterationItem.item.label;
}

function formatLoopTargetHandleLabel(targetHandle?: string | null): string | undefined {
  switch (targetHandle) {
    case 'video-prompt':
      return 'Prompt';
    case 'video-start-frame':
      return 'Start';
    case 'video-end-frame':
      return 'End';
    case 'video-reference-1':
      return 'Reference 1';
    case 'video-reference-2':
      return 'Reference 2';
    case 'video-reference-3':
      return 'Reference 3';
    case 'video-source-video':
      return 'Source Video';
    case 'image-edit-source':
      return 'Source';
    case 'image-mask':
      return 'Mask';
    case 'image-reference-1':
      return 'Reference 1';
    case 'image-reference-2':
      return 'Reference 2';
    case 'image-reference-3':
      return 'Reference 3';
    case 'composition-video':
      return 'Video';
    case 'composition-audio-1':
      return 'Audio 1';
    case 'composition-audio-2':
      return 'Audio 2';
    case 'composition-audio-3':
      return 'Audio 3';
    case 'composition-audio-4':
      return 'Audio 4';
    default:
      return undefined;
  }
}

function aggregateEnvelopeUsage(items: EnvelopeItem[]): UsageTelemetry | undefined {
  const usages = items.map((item) => item.usage).filter((usage): usage is UsageTelemetry => Boolean(usage));

  if (usages.length === 0) {
    return undefined;
  }

  const sumField = (field: keyof UsageTelemetry): number | undefined => {
    const values = usages.map((usage) => usage[field]).filter((value): value is number => typeof value === 'number');
    return values.length > 0 ? values.reduce((total, value) => total + value, 0) : undefined;
  };

  const costValues = usages.map((usage) => usage.costUsd);
  const allCostsKnown = costValues.every((value) => typeof value === 'number');

  return {
    source: 'actual',
    confidence: usages.every((usage) => usage.confidence === 'measured') ? 'measured' : 'unknown',
    costUsd: allCostsKnown
      ? costValues.reduce((total, value) => total + (value ?? 0), 0)
      : undefined,
    inputTokens: sumField('inputTokens'),
    outputTokens: sumField('outputTokens'),
    totalTokens: sumField('totalTokens'),
    characters: sumField('characters'),
    durationSeconds: sumField('durationSeconds'),
    imageCount: sumField('imageCount') ?? (items.filter((item) => item.kind === 'image').length || undefined),
    notes: [`Aggregated from ${items.length} envelope iteration${items.length === 1 ? '' : 's'}.`],
  };
}

function capitalizeResultKind(kind: ResultType): string {
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

function getResultMimeType(kind: ResultType): string {
  switch (kind) {
    case 'image':
      return 'image/png';
    case 'video':
      return 'video/mp4';
    case 'audio':
      return 'audio/mpeg';
    case 'package':
      return 'application/zip';
    case 'text':
    case 'number':
      return 'text/plain';
    case 'boolean':
      return 'application/x.boolean';
    case 'json':
    case 'list':
    case 'envelope':
      return 'application/json';
  }
}

function isAssetSourceKind(kind: ResultType): kind is Extract<ResultType, Exclude<EditorSourceKind, 'text'>> {
  return kind === 'image' || kind === 'video' || kind === 'audio' || kind === 'package';
}

function getDefaultExecutionConfigForNode(nodeType: FlowNodeType): ExecutionConfig {
  if (nodeType === 'videoGen') {
    return {
      ...DEFAULT_EXECUTION_CONFIG,
      aspectRatio: '16:9',
    };
  }

  return DEFAULT_EXECUTION_CONFIG;
}

let centerOnNodeCallback: ((id: string) => void) | null = null;

export { evaluateNodeTextForMonitor } from '../lib/listNodes';

export const useFlowStore = create<FlowState>()(
  persist(
    (set, get) => ({
      nodes: [],
      edges: [],
      bookmarkSidebarOpen: true,
      setBookmarkSidebarOpen: (bookmarkSidebarOpen) => set({ bookmarkSidebarOpen }),
      centerOnNode: (id) => centerOnNodeCallback?.(id),
      registerCenterOnNodeCallback: (cb) => { centerOnNodeCallback = cb; },
      onSourceBinItemRemoved: (id, removedItem) => {
        set((state) => {
          const updatedNodes = state.nodes.map((node) => {
            let nodeUpdated = false;
            const nextData = { ...node.data };

            // 1. Clear node results or imported assets matching the removed item
            if (nextData.result && (nextData.result === removedItem?.assetUrl || nextData.result === removedItem?.text)) {
              nextData.result = undefined;
              nextData.resultType = undefined;
              nextData.resultMimeType = undefined;
              nextData.resultExtension = undefined;
              nextData.resultFileName = undefined;
              nodeUpdated = true;
            }
            if (nextData.sourceAssetUrl && nextData.sourceAssetUrl === removedItem?.assetUrl) {
              nextData.sourceAssetUrl = undefined;
              nextData.sourceAssetId = undefined;
              nextData.sourceAssetName = undefined;
              nextData.sourceAssetMimeType = undefined;
              nodeUpdated = true;
            }

            // 2. Filter envelopeItems
            if (Array.isArray(nextData.envelopeItems)) {
              const previousLength = nextData.envelopeItems.length;
              const filtered = nextData.envelopeItems.filter((item) => {
                if (item.sourceBinItemId === id) return false;
                if (removedItem?.assetUrl && item.value === removedItem.assetUrl) return false;
                return true;
              });

              if (filtered.length !== previousLength) {
                // Re-index remaining envelope items sequentially
                nextData.envelopeItems = filtered.map((item, idx) => ({
                  ...item,
                  index: idx,
                }));
                nodeUpdated = true;
              }
            }

            // 3. Filter resultHistory
            if (Array.isArray(nextData.resultHistory)) {
              const previousLength = nextData.resultHistory.length;
              const filteredHistory = nextData.resultHistory.filter((attempt) => {
                if (removedItem?.assetUrl && attempt.result === removedItem.assetUrl) return false;
                return true;
              });

              if (filteredHistory.length !== previousLength) {
                nextData.resultHistory = filteredHistory;
                nodeUpdated = true;

                // Handle selected result pointer
                if (nextData.selectedResultId && !filteredHistory.some((h) => h.id === nextData.selectedResultId)) {
                  nextData.selectedResultId = undefined;
                  if (filteredHistory.length > 0) {
                    const lastAttempt = filteredHistory[filteredHistory.length - 1];
                    nextData.result = lastAttempt.result;
                    nextData.selectedResultId = lastAttempt.id;
                  } else {
                    nextData.result = undefined;
                  }
                }
              }
            }

            if (nodeUpdated) {
              return { ...node, data: nextData };
            }
            return node;
          });

          return {
            nodes: attachRuntimeDataToNodes(updatedNodes, () => state),
          };
        });
      },
      onNodesChange: async (changes: NodeChange<AppNode>[]) => {
        const removedNodeIds = changes
          .filter((change) => change.type === 'remove')
          .map((change) => change.id);

        if (removedNodeIds.length > 0) {
          await confirmGeneratedAssetCleanupForRemovedNodes(removedNodeIds);
        }

        set({
          nodes: attachRuntimeDataToNodes(applyNodeChanges(changes, get().nodes), get),
        });
      },
      onEdgesChange: (changes: EdgeChange[]) => {
        const previousEdges = get().edges;
        const removedEdgeIds = changes
          .filter((change) => change.type === 'remove')
          .map((change) => change.id);
        const changedEdges = applyEdgeChanges(changes, previousEdges);
        const prunedEdges = prunePortalExitEdgesForRemovedEntryLeads(
          get().nodes,
          previousEdges,
          changedEdges,
          removedEdgeIds,
        );

        set({ edges: normalizeFlowEdges(get().nodes, prunedEdges) });
      },
      onConnect: (connection: Connection) => {
        const normalizedImageConnection = normalizeImageConnectionTargetHandle(
          connection,
          get().nodes,
          get().edges,
        );
        const normalizedVideoConnection = normalizeVideoImageConnectionTargetHandle(
          normalizedImageConnection,
          get().nodes,
          get().edges,
        );
        const normalizedConnection = normalizeCompositionConnectionTargetHandle(
          normalizedVideoConnection,
          get().nodes,
          get().edges,
        );
        const listValidation = validateListConnection(normalizedConnection, get().nodes, get().edges);

        if (!listValidation.connection) {
          if (normalizedConnection.target && listValidation.error) {
            get().patchNodeData(normalizedConnection.target, {
              error: listValidation.error,
              statusMessage: undefined,
            });
          }
          return;
        }

        const prunedEdges = replaceExclusiveVideoFrameEdges(
          listValidation.connection,
          get().nodes,
          listValidation.edges,
        );
        const contractValidation = validateFlowConnection(listValidation.connection, {
          nodes: get().nodes,
          edges: prunedEdges,
        });

        if (!contractValidation.valid) {
          if (normalizedConnection.target && contractValidation.reason) {
            get().patchNodeData(normalizedConnection.target, {
              error: contractValidation.reason,
              statusMessage: undefined,
            });
          }
          return;
        }

        if (normalizedConnection.target) {
          get().patchNodeData(normalizedConnection.target, {
            error: undefined,
            statusMessage: undefined,
          });
        }

        set({ edges: normalizeFlowEdges(get().nodes, addEdge(listValidation.connection, prunedEdges)) });
      },
      addNode: (type, position, initialData) => {
        const settings = useSettingsStore.getState();
        if (type === 'portal') {
          const pairId = `portal-pair-${makeFlowId()}`;
          const entryId = `portal-entry-${makeFlowId()}`;
          const exitId = `portal-exit-${makeFlowId()}`;
          const entry = attachRuntimeData(
            {
              id: entryId,
              type,
              position,
              data: {
                ...createInitialNodeData(type, settings),
                portalRole: 'entry',
                portalPairId: pairId,
                portalLabel: 'Portal pair',
              },
            },
            get,
          );
          const exit = attachRuntimeData(
            {
              id: exitId,
              type,
              position: {
                x: position.x + 420,
                y: position.y,
              },
              data: {
                ...createInitialNodeData(type, settings),
                portalRole: 'exit',
                portalPairId: pairId,
                portalLabel: 'Portal pair',
              },
            },
            get,
          );

          set({ nodes: [...get().nodes, entry, exit] });
          return entryId;
        }

        const id = `${type}-${makeFlowId()}`;
        const node = attachRuntimeData(
          {
            id,
            type,
            position,
            data: combineNodeDataPatches(createInitialNodeData(type, settings), initialData) ?? {},
          },
          get,
        );

        set({ nodes: [...get().nodes, node] });
        return id;
      },
      insertTemplate: (template, position) => {
        const settings = useSettingsStore.getState();
        const idMap = new Map<string, string>();
        
        const newNodes = template.nodes.map(templateNode => {
          const originalId = templateNode.id!;
          const newId = `${templateNode.type}-${makeFlowId()}`;
          idMap.set(originalId, newId);
          
          return attachRuntimeData(
            {
              id: newId,
              type: templateNode.type as AppNode['type'],
              position: {
                x: position.x + (templateNode.position?.x ?? 0),
                y: position.y + (templateNode.position?.y ?? 0)
              },
              data: combineNodeDataPatches(createInitialNodeData(templateNode.type as AppNode['type'], settings), templateNode.data) ?? {},
            },
            get
          );
        });

        const newEdges = template.edges.map(templateEdge => ({
          ...templateEdge,
          id: `e-${makeFlowId()}`,
          source: idMap.get(templateEdge.source!) || templateEdge.source!,
          target: idMap.get(templateEdge.target!) || templateEdge.target!,
        })) as Edge[];

        set({
          nodes: [...get().nodes, ...newNodes],
          edges: normalizeFlowEdges([...get().nodes, ...newNodes], [...get().edges, ...newEdges])
        });
      },
      copySelection: () => {
        const clipboard = serializeFlowSelection(get().nodes, get().edges);
        if (!clipboard) {
          return false;
        }
        flowClipboard = clipboard;
        return true;
      },
      cutSelection: async () => {
        if (!get().copySelection()) {
          return false;
        }
        return await get().deleteSelection();
      },
      pasteClipboard: (position) => {
        const pasted = pasteFlowClipboard({
          clipboard: flowClipboard,
          existingNodes: get().nodes,
          existingEdges: get().edges,
          position,
          createId: (prefix) => `${prefix}-${makeFlowId()}`,
        });

        if (pasted.nodes.length === 0) {
          return false;
        }

        set({
          nodes: attachRuntimeDataToNodes(pasted.nextNodes, get),
          edges: normalizeFlowEdges(pasted.nextNodes, pasted.nextEdges),
        });
        return true;
      },
      deleteSelection: async () => {
        const selectedNodeIds = new Set(get().nodes.filter((node) => node.selected).map((node) => node.id));
        const selectedEdgeIds = new Set(get().edges.filter((edge) => edge.selected).map((edge) => edge.id));

        if (selectedNodeIds.size === 0 && selectedEdgeIds.size === 0) {
          return false;
        }

        await confirmGeneratedAssetCleanupForRemovedNodes(selectedNodeIds);

        const nextNodes = get().nodes.filter((node) => !selectedNodeIds.has(node.id));
        const nextEdges = get().edges.filter((edge) => (
          !selectedEdgeIds.has(edge.id) &&
          !selectedNodeIds.has(edge.source) &&
          !selectedNodeIds.has(edge.target)
        ));

        set({
          nodes: attachRuntimeDataToNodes(nextNodes, get),
          edges: normalizeFlowEdges(nextNodes, nextEdges),
        });
        return true;
      },
      selectAllNodes: () => {
        set({
          nodes: get().nodes.map((node) => ({ ...node, selected: true })),
          edges: get().edges.map((edge) => ({ ...edge, selected: true })),
        });
      },
      deselectAll: () => {
        set({
          nodes: get().nodes.map((node) => ({ ...node, selected: false })),
          edges: get().edges.map((edge) => ({ ...edge, selected: false })),
        });
      },
      createGroupFromSelection: (title = 'Group') => {
        const clipboard = serializeFlowSelection(get().nodes, get().edges);
        if (!clipboard) {
          return undefined;
        }

        const id = `groupNode-${makeFlowId()}`;
        const groupNode = attachRuntimeData(
          {
            id,
            type: 'groupNode',
            position: {
              x: clipboard.bounds.x - 24,
              y: clipboard.bounds.y - 64,
            },
            selected: true,
            data: {
              groupNode: createGroupNodeConfig({
                title,
                childNodeIds: clipboard.nodes.map((node) => node.id),
                childEdgeIds: clipboard.edges.map((edge) => edge.id),
                bounds: clipboard.bounds,
              }),
            },
          },
          get,
        );

        set({
          nodes: [
            ...get().nodes.map((node) => ({ ...node, selected: false })),
            groupNode,
          ],
        });
        return id;
      },
      collapseSelectionToFunction: (title) => {
        const collapsed = buildCollapsedFunctionNode({
          nodes: get().nodes,
          edges: get().edges,
          createId: (prefix) => `${prefix}-${makeFlowId()}`,
          title,
        });

        if (!collapsed) {
          return undefined;
        }

        set({
          nodes: attachRuntimeDataToNodes(collapsed.nextNodes, get),
          edges: normalizeFlowEdges(collapsed.nextNodes, collapsed.nextEdges),
        });
        return collapsed.functionNode.id;
      },
      addConnectedNode: (sourceNodeId, type, targetHandle) => {
        const sourceNode = get().nodes.find((node) => node.id === sourceNodeId);

        if (!sourceNode) {
          return;
        }

        const settings = useSettingsStore.getState();
        if (type === 'portal') {
          const pairId = `portal-pair-${makeFlowId()}`;
          const entryId = `portal-entry-${makeFlowId()}`;
          const exitId = `portal-exit-${makeFlowId()}`;
          const entry = attachRuntimeData(
            {
              id: entryId,
              type,
              position: {
                x: sourceNode.position.x + 320,
                y: sourceNode.position.y + 24,
              },
              data: {
                ...createInitialNodeData(type, settings),
                portalRole: 'entry',
                portalPairId: pairId,
                portalLabel: 'Portal pair',
              },
            },
            get,
          );
          const exit = attachRuntimeData(
            {
              id: exitId,
              type,
              position: {
                x: sourceNode.position.x + 740,
                y: sourceNode.position.y + 24,
              },
              data: {
                ...createInitialNodeData(type, settings),
                portalRole: 'exit',
                portalPairId: pairId,
                portalLabel: 'Portal pair',
              },
            },
            get,
          );

          set({
            nodes: [...get().nodes, entry, exit],
            edges: normalizeFlowEdges(
              [...get().nodes, entry, exit],
              addEdge(
                {
                  source: sourceNodeId,
                  sourceHandle: null,
                  target: entryId,
                  targetHandle: targetHandle ?? null,
                },
                get().edges,
              ),
            ),
          });
          return;
        }

        const id = `${type}-${makeFlowId()}`;
        const xOffset = type === 'composition' ? 420 : 320;
        const nextNode = attachRuntimeData(
          {
            id,
            type,
            position: {
              x: sourceNode.position.x + xOffset,
              y: sourceNode.position.y + 24,
            },
            data: createInitialNodeData(type, settings),
          },
          get,
        );

        set({
          nodes: [...get().nodes, nextNode],
          edges: normalizeFlowEdges(
            [...get().nodes, nextNode],
            addEdge(
              {
                source: sourceNodeId,
                sourceHandle: null,
                target: id,
                targetHandle: targetHandle ?? null,
              },
              get().edges,
            ),
          ),
        });
      },
      updateNodeData: (id, key, value) => {
        get().patchNodeData(id, { [key]: value } as Partial<NodeData>);
      },
      patchNodeData: (id, patch) => {
        const currentNodes = get().nodes;
        let changed = false;
        const nodes = currentNodes.map((node) => {
          if (node.id !== id || !hasNodeDataPatchChange(node.data, patch)) {
            return node;
          }

          changed = true;
          return attachRuntimeData({ ...node, data: { ...node.data, ...patch } }, get);
        });

        if (!changed) {
          return;
        }

        set({ nodes });
      },
      renameNodeBookmark: (id, rawTitle) => {
        const nextState = renameNodeBookmarkState(
          get().nodes,
          get().bookmarkSidebarOpen,
          id,
          rawTitle,
          (node) => attachRuntimeData(node, get),
        );

        if (nextState) {
          set(nextState);
        }
      },
      clearNodeBookmark: (id) => {
        get().renameNodeBookmark(id, '');
      },
      removeEditorSourceReferences: (sourceNodeId) => {
        for (const node of get().nodes) {
          if (node.type !== 'composition') {
            continue;
          }

          const visualClips = getEditorVisualClips(node.data);
          const audioClips = getEditorAudioClips(node.data);
          const nextVisualClips = visualClips.filter((clip) => clip.sourceNodeId !== sourceNodeId);
          const nextAudioClips = audioClips.filter((clip) => clip.sourceNodeId !== sourceNodeId);

          if (nextVisualClips.length === visualClips.length && nextAudioClips.length === audioClips.length) {
            continue;
          }

          get().patchNodeData(node.id, {
            editorVisualClips: nextVisualClips,
            editorAudioClips: nextAudioClips,
          });
        }
      },
      selectNodeAttempt: (id, attemptId) => {
        const node = get().nodes.find((entry) => entry.id === id);
        const attempts = node?.data.resultHistory ?? [];
        const selectedAttempt = resolveSelectedResultAttempt(attempts, attemptId);

        if (!selectedAttempt) {
          return;
        }

        get().patchNodeData(id, {
          selectedResultId: selectedAttempt.id,
          result: selectedAttempt.result,
          resultType: selectedAttempt.resultType,
          usage: selectedAttempt.usage,
          statusMessage: selectedAttempt.statusMessage,
          error: undefined,
        });
      },
      cancelNodeRun: (id) => {
        const controller = activeRunControllers.get(id);

        if (!controller) {
          return;
        }

        controller.abort();
        get().patchNodeData(id, {
          statusMessage: 'Cancelling run…',
          error: undefined,
        });
      },
      hydratePersistedState: () => {
        const safe = sanitizePersistedFlowState(get());
        const normalizedNodes = attachRuntimeDataToNodes(safe.nodes, get);
        set({
          nodes: normalizedNodes,
          edges: normalizeFlowEdges(normalizedNodes, safe.edges),
          bookmarkSidebarOpen: safe.bookmarkSidebarOpen,
        });
      },
      restoreImportedAssets: async () => {
        const sourceBinItems = useSourceBinStore.getState().getAllItems();
        const nodesWithAssets = get().nodes.filter((node) => (
          node.data.sourceAssetId ||
          node.data.sourceAssetUrl ||
          node.data.sourceAssetName ||
          node.data.sourceBinItemId ||
          node.data.textVisionSourceItemId ||
          sourceBinItems.some((item) => sourceBinItemBelongsToFlowNode(item, node.id))
        ));

        const updates = await Promise.all(
          nodesWithAssets.map(async (node) => {
            const sourceBinPatch = buildFlowNodePatchForRestoredSourceBinItem(node.data, sourceBinItems);
            const generatedResultPatch = buildFlowNodeGeneratedResultPatch(node.id, node.data, sourceBinItems, {
              replaceExistingHistory: true,
            });
            const sourceBinAssetUrl =
              typeof sourceBinPatch?.sourceAssetUrl === 'string' && sourceBinPatch.sourceAssetUrl.trim()
                ? sourceBinPatch.sourceAssetUrl
                : undefined;

            if (sourceBinPatch && sourceBinAssetUrl) {
              const patch = combineNodeDataPatches(sourceBinPatch, generatedResultPatch);
              return patch ? { nodeId: node.id, patch } : undefined;
            }

            const patchedAssetId =
              typeof sourceBinPatch?.sourceAssetId === 'string' && sourceBinPatch.sourceAssetId.trim()
                ? sourceBinPatch.sourceAssetId
                : undefined;
            const assetId = patchedAssetId
              ?? node.data.sourceAssetId
              ?? parseSignalLoomAssetId(node.data.sourceAssetUrl);

            if (!assetId) {
              const patch = combineNodeDataPatches(sourceBinPatch, generatedResultPatch);
              return patch ? { nodeId: node.id, patch } : undefined;
            }

            const storedAsset = await loadImportedAsset(assetId).catch(() => undefined);

            if (!storedAsset) {
              const missingAssetPatch = sourceBinPatch
                ? undefined
                : ({ sourceAssetUrl: undefined } as Partial<NodeData>);
              const patch = combineNodeDataPatches(
                sourceBinPatch,
                generatedResultPatch,
                missingAssetPatch,
              );
              return patch ? { nodeId: node.id, patch } : undefined;
            }

            const restoredAssetPatch: Partial<NodeData> = {
              ...sourceBinPatch,
              sourceAssetId: assetId,
              sourceAssetUrl: storedAsset.dataUrl,
              sourceAssetName: sourceBinPatch?.sourceAssetName ?? storedAsset.name,
              sourceAssetMimeType: sourceBinPatch?.sourceAssetMimeType ?? storedAsset.mimeType,
            };
            const patch = combineNodeDataPatches(restoredAssetPatch, generatedResultPatch);
            return {
              nodeId: node.id,
              patch: patch ?? restoredAssetPatch,
            };
          }),
        );

        const patchesByNodeId = new Map<string, Partial<NodeData>>();
        for (const update of updates) {
          if (update) {
            patchesByNodeId.set(update.nodeId, update.patch);
          }
        }

        if (patchesByNodeId.size === 0) {
          return;
        }

        set({
          nodes: get().nodes.map((node) => {
            const patch = patchesByNodeId.get(node.id);
            if (!patch) {
              return node;
            }
            return attachRuntimeData({ ...node, data: { ...node.data, ...patch } }, get);
          }),
        });
      },
      exportFlow: () =>
        JSON.stringify(
          {
            version: 2,
            nodes: get().nodes.map(stripRuntimeData),
            edges: get().edges,
          },
          null,
          2,
        ),
      exportProjectFlowSnapshot: () => ({
        version: 3,
        nodes: get().nodes.map(stripProjectRuntimeData),
        edges: get().edges,
      }),
      replaceFlowSnapshot: (snapshot) => {
        set(replaceFlowSnapshotState(
          snapshot,
          (nodes) => attachRuntimeDataToNodes(nodes, get),
          normalizeFlowEdges,
        ));
      },
      applyRemoteFlowGraphChange: (change) => {
        // A full snapshot reuses the existing restore path (runtime re-attach + edge normalization).
        if (change.type === 'flow-graph-snapshot') {
          get().replaceFlowSnapshot(change.snapshot);
          return true;
        }
        let changed = false;
        set((state) => {
          const next = applyFlowGraphNativeChange({ nodes: state.nodes, edges: state.edges }, change);
          if (next.nodes === state.nodes && next.edges === state.edges) return {};
          changed = true;
          // Re-attach runtime callbacks (a remote `flow-node-added` arrives stripped); idempotent for
          // already-attached nodes, so a move/patch/remove only re-runs the cheap identity checks.
          const nodes =
            next.nodes === state.nodes ? state.nodes : attachRuntimeDataToNodes(next.nodes, get);
          return { nodes, edges: next.edges };
        });
        return changed;
      },
      runNode: async (nodeId: string) => {
        const preflightState = get();
        const preflightSettings = useSettingsStore.getState();
        const preflightEstimate = estimateExecutionPlan(
          nodeId,
          preflightState.nodes,
          preflightState.edges,
          preflightSettings,
        );
        const runningNode = preflightEstimate.nodeIds
          .map((id) => preflightState.nodes.find((node) => node.id === id))
          .find((node) => node?.data.isRunning);

        if (runningNode) {
          get().patchNodeData(nodeId, {
            error: `Wait for ${runningNode.type} node ${runningNode.id} to finish before running this sub-graph again.`,
            statusMessage: undefined,
          });
          return;
        }

        const blockingDiagnostics = getBlockingFlowDiagnostics(preflightState.nodes, preflightState.edges, nodeId);
        if (blockingDiagnostics.length > 0) {
          get().patchNodeData(nodeId, {
            error: formatBlockingDiagnosticsMessage(blockingDiagnostics),
            statusMessage: undefined,
          });
          return;
        }

        let preflightLoopCount = 0;
        let preflightRunCount = 0;
        try {
          const preflightNode = preflightState.nodes.find((node) => node.id === nodeId);
          const preflightLoopMode = normalizeListLoopMode(preflightNode?.data.listLoopMode);
          const preflightPromptSignal = collectPromptSignalForNode(
            nodeId,
            preflightState.nodes,
            preflightState.edges,
          );
          const promptDiagnostics = getBlockingSignalDiagnostics(preflightPromptSignal);
          if (promptDiagnostics.length > 0) {
            throw new Error(formatBlockingDiagnosticsMessage(promptDiagnostics));
          }
          preflightLoopCount = getLoopIterationCount(
            collectListLoopInputs(nodeId, preflightState.nodes, preflightState.edges),
            preflightLoopMode,
          );
          preflightRunCount = resolveCombinedLoopIterationCount(
            preflightLoopCount,
            getSignalIterationCount(preflightPromptSignal),
          );
        } catch (error) {
          get().patchNodeData(nodeId, {
            error: error instanceof Error ? error.message : 'Connected lists could not be expanded.',
            statusMessage: undefined,
          });
          return;
        }

        if (preflightRunCount > 1) {
          const preflightNode = preflightState.nodes.find((node) => node.id === nodeId);
          const preflightLoopMode = normalizeListLoopMode(preflightNode?.data.listLoopMode);
          const loopLabel = preflightLoopCount > 0
            ? preflightLoopMode === 'allCombinations' ? 'all-combinations' : 'paired'
            : 'auto-batched prompt';
          const proceed = await useConfirmationStore.getState().requestConfirmation(
            `This ${loopLabel} run will execute ${preflightRunCount} envelope iterations against the configured node. Continue only if you want to run every item now.`,
            'Envelope Run Confirmation',
          );

          if (!proceed) {
            get().patchNodeData(nodeId, {
              statusMessage: 'Envelope run cancelled before sending any provider requests.',
              error: undefined,
            });
            return;
          }
        }

        if (preflightEstimate.rollup.totalKnownCostUsd >= 0.01 || preflightEstimate.rollup.unknownCostCount > 0) {
          const summary = formatRollupSummary(preflightEstimate.rollup, 'Estimated run cost');
          const proceed = await useConfirmationStore.getState().requestConfirmation(
            `${summary}\n\nOnly continue if you want to spend against the configured providers now.`,
            'Run Cost Confirmation',
          );

          if (!proceed) {
            get().patchNodeData(nodeId, {
              statusMessage: 'Run cancelled before sending any provider requests.',
              error: undefined,
            });
            return;
          }
        }

        const runController = new AbortController();
        const abortSignal = runController.signal;
        const throwIfRunAborted = () => {
          if (abortSignal.aborted) {
            throw new DOMException('The run was cancelled.', 'AbortError');
          }
        };

        const executeRecursively = async (currentId: string, stack: Set<string>): Promise<void> => {
          throwIfRunAborted();

          if (stack.has(currentId)) {
            throw new Error('Flow execution cannot continue because the graph contains a cycle.');
          }

          const state = get();
          const currentNode = state.nodes.find((node) => node.id === currentId);
          if (!currentNode) {
            return;
          }

          if (currentId !== nodeId && shouldReuseExistingNodeOutput(currentNode)) {
            return;
          }

          const nextStack = new Set(stack);
          nextStack.add(currentId);

          if (canRunNode(currentNode)) {
            activeRunControllers.set(currentId, runController);
            state.patchNodeData(currentId, {
              isRunning: true,
              error: undefined,
              statusMessage: 'Running…',
            });
          }

          try {
            const currentEdges = get().edges;
            const currentNodesById = buildNodeMap(get().nodes);
            const sourceIds = getExecutionDependencies(currentNode, currentEdges, currentNodesById);

            for (const sourceId of sourceIds) {
              await executeRecursively(sourceId, nextStack);
            }

            throwIfRunAborted();

            const latestState = get();
            const latestNode = latestState.nodes.find((node) => node.id === currentId);

            if (!latestNode || !canRunNode(latestNode)) {
              return;
            }

            const nodesById = buildNodeMap(latestState.nodes);
            const incoming = buildIncomingMap(latestState.edges);
            const promptSignal = collectPromptSignalForNode(currentId, latestState.nodes, latestState.edges);
            const blockingPromptDiagnostics = getBlockingSignalDiagnostics(promptSignal);
            if (blockingPromptDiagnostics.length > 0) {
              throw new Error(formatBlockingDiagnosticsMessage(blockingPromptDiagnostics));
            }
            const context = {
              prompt: signalToTextAt(promptSignal, 0),
              textMediaInputs: collectTextMediaInputs(latestNode, nodesById, latestState.edges),
              functionInputs: latestNode.type === 'functionNode'
                ? collectFunctionNodeInputs(latestNode, nodesById, latestState.edges)
                : undefined,
              editImageInput: collectUpstreamImageInput(currentId, nodesById, latestState.edges),
              refImageInput: collectUpstreamImageInputForHandles(
                currentId,
                ['refImage'],
                nodesById,
                latestState.edges,
              ),
              editMaskImageInput: collectImageMaskInput(currentId, nodesById, latestState.edges),
              editReferenceImageInputs: collectImageReferenceInputs(
                currentId,
                nodesById,
                latestState.edges,
              ),
              loraWeightsJson: collectUpstreamLoraJson(currentId, nodesById, latestState.edges),
              audioSourceInput: collectUpstreamAudioInput(currentId, nodesById, latestState.edges),
              sourceVideoInput: collectUpstreamVideoInput(currentId, nodesById, latestState.edges),
              startImageInput: collectImageInputForHandle(
                currentId,
                ['video-start-frame'],
                nodesById,
                latestState.edges,
              ),
              endImageInput: collectImageInputForHandle(
                currentId,
                ['video-end-frame'],
                nodesById,
                latestState.edges,
              ),
              referenceImageInputs: collectReferenceImageInputs(latestNode, nodesById, latestState.edges),
              extensionVideoInput: collectVideoExtensionInput(currentId, nodesById, latestState.edges),
              videoInput: collectResultInputForHandle(
                currentId,
                COMPOSITION_VIDEO_HANDLE,
                nodesById,
                latestState.edges,
                ['videoGen', 'composition', 'functionNode'],
              )?.result,
              audioInputs: COMPOSITION_AUDIO_HANDLES.map((handle) => {
                const track = collectResultInputForHandle(
                  currentId,
                  handle,
                  nodesById,
                  latestState.edges,
                  ['audioGen', 'functionNode'],
                );

                if (!track) {
                  return undefined;
                }

                const settingsForTrack = getCompositionTrackSettings(latestNode.data, handle);

                return {
                  url: track.result,
                  sourceNodeId: track.node.id,
                  delayMs: settingsForTrack.offsetMs,
                  volumePercent: settingsForTrack.volumePercent,
                  enabled: settingsForTrack.enabled,
                };
              }).filter(
                (
                  value,
                ): value is {
                  url: string;
                  sourceNodeId: string;
                  delayMs: number;
                  volumePercent: number;
                  enabled: boolean;
                } => Boolean(value),
              ),
              useVideoAudio: Boolean(latestNode.data.compositionUseVideoAudio),
              videoAudioVolumePercent: coerceNumber(latestNode.data.compositionVideoAudioVolume, 100),
              visualSequenceClips: collectEditorVisualSequence(latestNode, nodesById),
              stageObjects: collectEditorStageObjects(latestNode),
              sequenceAudioInputs: collectEditorAudioSequence(latestNode, nodesById),
              nativeAssemblyManifest: latestNode.data.editorRenderCacheAssemblyManifest,
              exportPresetId: latestNode.data.editorExportPresetPlan?.presetId,
              config: collectExecutionConfig(currentId, latestNode, nodesById, incoming),
            };
            const settings = useSettingsStore.getState();
            const loopInputs = collectListLoopInputs(currentId, latestState.nodes, latestState.edges);
            const loopMode = normalizeListLoopMode(latestNode.data.listLoopMode);
            const loopIterationCount = getLoopIterationCount(loopInputs, loopMode);
            const promptSignalIterationCount = getSignalIterationCount(promptSignal);
            const combinedIterationCount = resolveCombinedLoopIterationCount(loopIterationCount, promptSignalIterationCount);

            if (combinedIterationCount > 0) {
              const envelopeItems: EnvelopeItem[] = [];
              let stoppedLoopMessage: string | undefined;
              const loopStatusLabel = loopIterationCount > 0
                ? loopMode === 'allCombinations' ? 'Combination' : 'Envelope'
                : 'Prompt batch';

              for (let index = 0; index < combinedIterationCount; index += 1) {
                throwIfRunAborted();

                const breakDecision = shouldBreakLoopAtIteration(currentId, latestState.nodes, latestState.edges, index);
                if (breakDecision.shouldBreak) {
                  stoppedLoopMessage = `Stopped before iteration ${index + 1}/${combinedIterationCount}${breakDecision.reason ? `: ${breakDecision.reason}` : ''}`;
                  get().patchNodeData(currentId, {
                    envelopeItems,
                    statusMessage: stoppedLoopMessage,
                    error: undefined,
                  });
                  break;
                }

                const iterationItems = loopIterationCount > 0 ? buildLoopIterationItems(loopInputs, index, loopMode) : [];
                const routedIterationItems = promptSignalIterationCount > 0
                  ? iterationItems.filter(({ item }) => item.kind !== 'text')
                  : iterationItems;
                const loopContext = applyListItemsToExecutionContext(
                  {
                    ...context,
                    prompt: promptSignalIterationCount > 0 ? signalToTextAt(promptSignal, index) : context.prompt,
                  },
                  latestNode,
                  routedIterationItems,
                );
                
                const envelopeId = await hashExecutionParameters(latestNode.data, loopContext);
                const allSourceBinItems = useSourceBinStore.getState().getAllItems();
                const existingAsset = allSourceBinItems.find(
                  (item) => item.originNodeId === currentId && item.envelopeId === envelopeId && item.envelopeIndex === index
                );

                if (existingAsset) {
                  envelopeItems.push(buildEnvelopeItemFromSourceBinItem(existingAsset));
                  get().patchNodeData(currentId, {
                    envelopeItems,
                    statusMessage: `${loopStatusLabel} ${index + 1}/${combinedIterationCount}: Resumed from Source Bin`,
                    error: undefined,
                  });
                  continue;
                }

                const execution = await executeNodeRequest(latestNode, loopContext, settings, (statusMessage) => {
                  if (abortSignal.aborted) {
                    return;
                  }

                  get().patchNodeData(currentId, {
                    statusMessage: `${loopStatusLabel} ${index + 1}/${combinedIterationCount}: ${statusMessage}`,
                    error: undefined,
                  });
                }, {
                  signal: abortSignal,
                  graph: { nodes: latestState.nodes, edges: latestState.edges },
                });

                throwIfRunAborted();
                recordProjectUsageFromExecution({
                  node: latestNode,
                  usage: execution.usage,
                  workspace: 'flow',
                  ...getActiveFlowWorkspaceUsageContext(),
                  recordUsage: useProjectUsageStore.getState().recordUsage,
                });
                
                const newEnvelopeItem = buildEnvelopeItemFromExecution(currentId, index, execution, iterationItems);
                
                if (isAssetSourceKind(execution.resultType)) {
                  const sourceItem = await useSourceBinStore.getState().addAssetItem({
                    label: newEnvelopeItem.label,
                    kind: execution.resultType,
                    mimeType: newEnvelopeItem.mimeType ?? 'application/octet-stream',
                    dataUrl: newEnvelopeItem.value,
                    blob: execution.blob,
                    originNodeId: currentId,
                    envelopeId,
                    envelopeLabel: newEnvelopeItem.label,
                    envelopeIndex: index,
                    envelopeCollapsed: false,
                  });
                  newEnvelopeItem.value = sourceItem.assetUrl ?? newEnvelopeItem.value;
                  newEnvelopeItem.sourceBinItemId = sourceItem.id;
                }

                envelopeItems.push(newEnvelopeItem);

                get().patchNodeData(currentId, {
                  envelopeItems,
                  statusMessage: `${loopStatusLabel} ${index + 1}/${combinedIterationCount}: ${execution.statusMessage}`,
                  error: undefined,
                });
              }

              const firstItem = envelopeItems[0];
              if (!firstItem) {
                latestState.patchNodeData(currentId, {
                  envelopeItems,
                  error: undefined,
                  statusMessage: stoppedLoopMessage ?? 'The connected list did not contain any runnable items.',
                });
                return;
              }

              const statusMessage = stoppedLoopMessage
                ? `${stoppedLoopMessage}. Kept ${envelopeItems.length} ${firstItem.kind} item${envelopeItems.length === 1 ? '' : 's'}.`
                : `Generated envelope with ${envelopeItems.length} ${firstItem.kind} item${envelopeItems.length === 1 ? '' : 's'}`;
              const usage = aggregateEnvelopeUsage(envelopeItems);
              const selectedResult = deserializeResultValueFromContainer(firstItem.value, firstItem.kind);
              if (selectedResult === undefined) {
                throw new Error(`The generated ${firstItem.kind} envelope value is invalid and cannot be restored.`);
              }
              const nextAttemptState = appendResultAttempt(latestNode.data.resultHistory ?? [], {
                result: selectedResult,
                resultType: firstItem.kind,
                statusMessage,
                usage,
                sourceBinItemId: firstItem.sourceBinItemId,
              });

              latestState.patchNodeData(currentId, {
                result: selectedResult,
                resultType: firstItem.kind,
                envelopeItems,
                resultHistory: nextAttemptState.attempts,
                selectedResultId: nextAttemptState.selectedAttemptId,
                usage,
                error: undefined,
                statusMessage,
              });
              return;
            }

            const envelopeId = await hashExecutionParameters(latestNode.data, context);
            const allSourceBinItems = useSourceBinStore.getState().getAllItems();
            const existingAsset = allSourceBinItems.find(
              (item) => item.originNodeId === currentId && item.envelopeId === envelopeId && item.envelopeIndex === 0
            );

            if (existingAsset) {
              const execution = {
                result: existingAsset.assetUrl ?? existingAsset.text ?? '',
                resultType: existingAsset.kind as import('../types/flow').ResultType,
                statusMessage: 'Resumed from Source Bin',
                mimeType: existingAsset.mimeType,
              };

              const nextAttemptState = appendResultAttempt(latestNode.data.resultHistory ?? [], {
                ...execution,
                sourceBinItemId: existingAsset.id,
              });

              latestState.patchNodeData(currentId, {
                result: execution.result,
                resultType: execution.resultType,
                resultMimeType: execution.mimeType,
                envelopeItems: undefined,
                resultHistory: nextAttemptState.attempts,
                selectedResultId: nextAttemptState.selectedAttemptId,
                statusMessage: execution.statusMessage,
                error: undefined,
              });
              return;
            }

            const execution = await executeNodeRequest(latestNode, context, settings, (statusMessage) => {
              if (abortSignal.aborted) {
                return;
              }

              get().patchNodeData(currentId, {
                statusMessage,
                error: undefined,
              });
            }, {
              signal: abortSignal,
              graph: { nodes: latestState.nodes, edges: latestState.edges },
            });

            throwIfRunAborted();

            recordProjectUsageFromExecution({
              node: latestNode,
              usage: execution.usage,
              workspace: 'flow',
              ...getActiveFlowWorkspaceUsageContext(),
              recordUsage: useProjectUsageStore.getState().recordUsage,
            });

            // Multi-image output from a SINGLE call (e.g. Seedream Sequential's `max_images`): surface every
            // image as an envelope so they all land in the Source Library + downstream list, not just the first.
            if (isAssetSourceKind(execution.resultType) && execution.additionalResults && execution.additionalResults.length > 0) {
              const firstMediaResult = resultValueAsMediaUrl(execution.result);
              if (!firstMediaResult) {
                throw new Error(`The ${execution.resultType} executor returned a non-media value.`);
              }
              const allOutputs = [{ result: firstMediaResult, mimeType: execution.mimeType }, ...execution.additionalResults];
              const baseLabel = (latestNode.data.title as string) || `${latestNode.type} result`;
              const envelopeItems: EnvelopeItem[] = [];
              for (let index = 0; index < allOutputs.length; index += 1) {
                throwIfRunAborted();
                const output = allOutputs[index];
                const sourceItem = await useSourceBinStore.getState().addAssetItem({
                  label: `${baseLabel} ${index + 1}`,
                  kind: execution.resultType,
                  mimeType: output.mimeType ?? execution.mimeType ?? 'application/octet-stream',
                  dataUrl: output.result,
                  originNodeId: currentId,
                  envelopeId,
                  envelopeLabel: baseLabel,
                  envelopeIndex: index,
                  envelopeCollapsed: false,
                });
                envelopeItems.push({
                  id: `${currentId}-envelope-${Date.now()}-${index}`,
                  index,
                  kind: execution.resultType,
                  label: `${baseLabel} ${index + 1}`,
                  value: sourceItem.assetUrl ?? output.result,
                  mimeType: output.mimeType ?? execution.mimeType ?? getResultMimeType(execution.resultType),
                  sourceNodeId: currentId,
                  sourceBinItemId: sourceItem.id,
                  usage: index === 0 ? execution.usage : undefined,
                });
              }
              const firstItem = envelopeItems[0];
              const multiAttemptState = appendResultAttempt(latestNode.data.resultHistory ?? [], {
                result: firstItem.value,
                resultType: execution.resultType,
                statusMessage: execution.statusMessage,
                usage: execution.usage,
                sourceBinItemId: firstItem.sourceBinItemId,
              });
              latestState.patchNodeData(currentId, {
                result: firstItem.value,
                resultType: execution.resultType,
                resultMimeType: firstItem.mimeType,
                envelopeItems,
                resultHistory: multiAttemptState.attempts,
                selectedResultId: multiAttemptState.selectedAttemptId,
                usage: execution.usage,
                error: undefined,
                statusMessage: execution.statusMessage,
              });
              return;
            }

            let generatedSourceBinItemId: string | undefined;
            if (isAssetSourceKind(execution.resultType)) {
              const mediaResult = resultValueAsMediaUrl(execution.result);
              if (!mediaResult) {
                throw new Error(`The ${execution.resultType} executor returned a non-media value.`);
              }
              const sourceItem = await useSourceBinStore.getState().addAssetItem({
                label: (latestNode.data.title as string) || `${latestNode.type} result`,
                kind: execution.resultType,
                mimeType: execution.mimeType ?? 'application/octet-stream',
                dataUrl: mediaResult,
                blob: execution.blob,
                originNodeId: currentId,
                envelopeId,
                envelopeLabel: (latestNode.data.title as string) || `${latestNode.type} result`,
                envelopeIndex: 0,
                envelopeCollapsed: false,
              });
              execution.result = sourceItem.assetUrl ?? mediaResult;
              generatedSourceBinItemId = sourceItem.id;
            }

            const nextAttemptState = appendResultAttempt(latestNode.data.resultHistory ?? [], {
              ...execution,
              sourceBinItemId: generatedSourceBinItemId,
            });

            latestState.patchNodeData(currentId, {
              result: execution.result,
              resultType: execution.resultType,
              resultMimeType: execution.mimeType,
              resultExtension: execution.extension,
              resultFileName: execution.fileName,
              resultOutputMetadata: execution.outputMetadata,
              envelopeItems: undefined,
              resultHistory: nextAttemptState.attempts,
              selectedResultId: nextAttemptState.selectedAttemptId,
              usage: execution.usage,
              error: undefined,
              statusMessage: execution.statusMessage,
            });
          } catch (error) {
            if (isAbortError(error)) {
              get().patchNodeData(currentId, {
                error: undefined,
                statusMessage: 'Run cancelled.',
              });
              throw error;
            }

            const message =
              error instanceof Error ? error.message : 'Flow execution failed for an unknown reason.';
            get().patchNodeData(currentId, {
              error: message,
              statusMessage: undefined,
            });
            throw error;
          } finally {
            if (canRunNode(currentNode)) {
              if (activeRunControllers.get(currentId) === runController) {
                activeRunControllers.delete(currentId);
              }

              get().patchNodeData(currentId, {
                isRunning: false,
              });
            }
          }
        };

        try {
          await executeRecursively(nodeId, new Set());
        } catch (error) {
          if (!isAbortError(error)) {
            console.error(error);
          }
        }
      },
    }),
    {
      name: FLOW_STORAGE_KEY,
      storage: createJSONStorage(() => createDebouncedLocalStorage(PERSIST_DEBOUNCE_MS)),
      partialize: (state) => ({
        nodes: Array.isArray(state.nodes) ? state.nodes.map(stripRuntimeData) : [],
        edges: Array.isArray(state.edges) ? state.edges : [],
        bookmarkSidebarOpen: state.bookmarkSidebarOpen,
      }),
      merge: (persisted, current) => ({
        ...current,
        ...sanitizePersistedFlowState(persisted),
      }),
      onRehydrateStorage: () => (state) => {
        state?.hydratePersistedState();
      },
    },
  ),
);

// Tie the unified cross-device sync's Flow channel (task #51) to this store's lifetime: registering it
// here means sync activates exactly when the Flow workspace is present, at no app-startup cost. Dynamic
// import keeps the static dependency one-way (`flowSyncChannel` → `flowStore`), avoiding an import cycle.
// Skipped under the test runner so a unit test importing this store can't spawn a floating channel-init
// side-effect that races vitest's multi-file module evaluation; the channel's own tests init explicitly.
if (import.meta.env?.MODE !== 'test') {
  void import('../lib/flowSyncChannel')
    .then((module) => module.initializeFlowSyncChannel())
    .catch(() => undefined);
}
