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
import {
  estimateExecutionPlan,
  formatRollupSummary,
} from '../lib/costEstimation';
import { IMAGE_REFERENCE_HANDLES } from '../lib/imageModelSupport';
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
import { executeNodeRequest } from '../lib/flowExecution';
import { buildSourceBinItem } from '../lib/sourceBin';
import {
  buildSourceBinLibraryItemLookup,
  mapLibraryItemToEditorSourceItem,
} from '../lib/editorSourceItems';
import {
  normalizeVideoImageConnectionTargetHandle,
  normalizeVideoImageEdges,
  replaceExclusiveVideoFrameEdges,
} from '../lib/videoEdgeMigration';
import {
  isVideoExtensionHandle,
  isVideoImageConditioningHandle,
  normalizeGeminiVideoModelId,
} from '../lib/videoModelSupport';
import { resolveEffectiveSourceNode } from '../lib/virtualNodes';
import type {
  AspectRatio,
  AppNode,
  ExecutionConfig,
  FlowNodeType,
  ImageTargetHandle,
  NodeData,
  PersistedNodeData,
  RuntimeSettingsSnapshot,
  SerializableNodeValue,
  VideoReferenceType,
  VideoTargetHandle,
} from '../types/flow';
import { useSettingsStore } from './settingsStore';
import { useSourceBinStore } from './sourceBinStore';

interface FlowState {
  nodes: AppNode[];
  edges: Edge[];
  bookmarkSidebarOpen: boolean;
  setBookmarkSidebarOpen: (open: boolean) => void;
  onNodesChange: OnNodesChange<AppNode>;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  addNode: (type: FlowNodeType, position: { x: number; y: number }) => string;
  addConnectedNode: (sourceNodeId: string, type: FlowNodeType, targetHandle?: string) => void;
  updateNodeData: (id: string, key: string, value: SerializableNodeValue) => void;
  patchNodeData: (id: string, patch: Partial<NodeData>) => void;
  removeEditorSourceReferences: (sourceNodeId: string) => void;
  selectNodeAttempt: (id: string, attemptId: string) => void;
  runNode: (id: string) => Promise<void>;
  cancelNodeRun: (id: string) => void;
  hydratePersistedState: () => void;
  restoreImportedAssets: () => Promise<void>;
  exportFlow: () => string;
  exportProjectFlowSnapshot: () => {
    version: number;
    nodes: AppNode[];
    edges: Edge[];
  };
  replaceFlowSnapshot: (snapshot: {
    nodes: AppNode[];
    edges: Edge[];
  }) => void;
}

const activeRunControllers = new Map<string, AbortController>();

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

const FLOW_STORAGE_KEY = 'flow-canvas-storage';
const PERSIST_DEBOUNCE_MS = 400;
const VIDEO_REFERENCE_HANDLES = ['video-reference-1', 'video-reference-2', 'video-reference-3'] as const;

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
    return node.data.sourceAssetUrl;
  }

  return node.data.result;
}

function shouldReuseExistingNodeOutput(node: AppNode): boolean {
  if (!['imageGen', 'videoGen', 'audioGen', 'composition'].includes(node.type)) {
    return false;
  }

  return Boolean(resolveNodeOutputAsset(node));
}

function canRunNode(node: AppNode): boolean {
  if (node.type === 'settings' || node.type === 'sourceBin' || node.type === 'virtual') {
    return false;
  }

  if (node.type === 'textNode') {
    return (node.data.mode ?? 'prompt') === 'generate';
  }

  if (node.type === 'imageGen' || node.type === 'audioGen' || node.type === 'videoGen') {
    return (node.data.mediaMode ?? 'generate') === 'generate';
  }

  return true;
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
    case 'imageGen':
      return {
        mediaMode: 'generate',
        provider: 'gemini',
        modelId: settings.defaultModels.image.gemini,
        videoFrameSelection: 'last',
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
    case 'virtual':
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

function normalizeFlowEdges(nodes: AppNode[], edges: Edge[]): Edge[] {
  return normalizeCompositionEdges(
    nodes,
    normalizeVideoImageEdges(nodes, normalizeImageEdges(nodes, edges)),
  );
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

function getExecutionDependencies(
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
    const sourceNode = rawSourceNode
      ? resolveEffectiveSourceNode(rawSourceNode, nodesById, edges)
      : undefined;

    if (!sourceNode) {
      continue;
    }

    if (sourceNode.type === 'settings') {
      dependencies.add(sourceNode.id);
      continue;
    }

    if (node.type === 'textNode') {
      if (sourceNode.type === 'textNode' || sourceNode.type === 'imageGen') {
        dependencies.add(sourceNode.id);
      }

      continue;
    }

    if (node.type === 'imageGen') {
      if (
        sourceNode.type === 'textNode' ||
        sourceNode.type === 'imageGen' ||
        sourceNode.type === 'videoGen' ||
        sourceNode.type === 'composition'
      ) {
        dependencies.add(sourceNode.id);
      }

      continue;
    }

    if (node.type === 'audioGen') {
      const audioMode = (node.data.audioGenerationMode as string | undefined) ?? 'speech';

      if (audioMode === 'voiceChange') {
        if (sourceNode.type === 'audioGen') {
          dependencies.add(sourceNode.id);
        }

        continue;
      }

      if (sourceNode.type === 'textNode') {
        dependencies.add(sourceNode.id);
      }

      continue;
    }

    if (node.type === 'videoGen') {
      if (sourceNode.type === 'textNode') {
        dependencies.add(sourceNode.id);
        continue;
      }

      if (
        sourceNode.type === 'imageGen' &&
        isVideoImageConditioningHandle(edge.targetHandle as VideoTargetHandle | undefined)
      ) {
        dependencies.add(sourceNode.id);
        continue;
      }

      if (
        (sourceNode.type === 'videoGen' || sourceNode.type === 'composition') &&
        isVideoExtensionHandle(edge.targetHandle as VideoTargetHandle | undefined)
      ) {
        dependencies.add(sourceNode.id);
      }

      continue;
    }

    if (node.type === 'composition') {
      if (
        (isCompositionVideoConnection(edge) && ['videoGen', 'composition'].includes(sourceNode.type)) ||
        (COMPOSITION_AUDIO_HANDLES.includes(edge.targetHandle as typeof COMPOSITION_AUDIO_HANDLES[number]) &&
          sourceNode.type === 'audioGen')
      ) {
        dependencies.add(sourceNode.id);
      }
    }
  }

  return [...dependencies];
}

function collectTextInputs(
  nodeId: string,
  nodesById: Map<string, AppNode>,
  incoming: Map<string, string[]>,
): string {
  const sourceIds = incoming.get(nodeId) ?? [];
  const prompts = sourceIds.flatMap((sourceId) =>
    collectTextInputsFromSource(sourceId, nodesById, incoming, new Set()),
  );

  return prompts.join('\n\n').trim();
}

function collectTextImageInputs(
  node: AppNode,
  nodesById: Map<string, AppNode>,
  edges: Edge[],
): string[] {
  const inputUrls = new Set<string>();
  const directSourceItemId =
    typeof node.data.textVisionSourceItemId === 'string' && node.data.textVisionSourceItemId.trim()
      ? node.data.textVisionSourceItemId.trim()
      : undefined;
  const sourceBinItems = useSourceBinStore.getState().items;

  if (directSourceItemId) {
    const directSourceItem = sourceBinItems.find((item) => item.id === directSourceItemId);

    if (directSourceItem?.kind === 'image' && directSourceItem.assetUrl) {
      inputUrls.add(directSourceItem.assetUrl);
    }
  }

  const incoming = buildIncomingMap(edges);
  const matchingEdges = edges.filter((edge) => edge.target === node.id);

  for (const edge of matchingEdges) {
    const rawSourceNode = nodesById.get(edge.source);
    const sourceNode = rawSourceNode
      ? resolveEffectiveSourceNode(rawSourceNode, nodesById, edges)
      : undefined;

    if (sourceNode?.type !== 'imageGen') {
      continue;
    }

    const imageUrl = collectImageInputFromSource(edge.source, nodesById, incoming, new Set());

    if (imageUrl) {
      inputUrls.add(imageUrl);
    }
  }

  return [...inputUrls];
}

function collectTextInputsFromSource(
  sourceId: string,
  nodesById: Map<string, AppNode>,
  incoming: Map<string, string[]>,
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
      collectTextInputsFromSource(upstreamId, nodesById, incoming, visited),
    );
  }

  if (node.type === 'virtual') {
    return (incoming.get(sourceId) ?? []).flatMap((upstreamId) =>
      collectTextInputsFromSource(upstreamId, nodesById, incoming, visited),
    );
  }

  if (node.type === 'textNode') {
    const mode = node.data.mode ?? 'prompt';
    const value = (mode === 'generate' ? node.data.result : node.data.prompt)?.trim();
    return value ? [value] : [];
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
    const image = collectImageInputFromSource(edge.source, nodesById, incoming, new Set());

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

function collectUpstreamImageInput(
  nodeId: string,
  nodesById: Map<string, AppNode>,
  edges: Edge[],
): string | undefined {
  const explicitSource = collectUpstreamImageInputForHandles(
    nodeId,
    ['image-edit-source'],
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
      ? resolveEffectiveSourceNode(rawSourceNode, nodesById, edges)
      : undefined;

    if (sourceNode?.type !== 'imageGen') {
      continue;
    }

    const image = collectImageInputFromSource(edge.source, nodesById, incoming, new Set());

    if (image) {
      return image;
    }
  }

  return undefined;
}

function collectUpstreamImageInputForHandles(
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
      ? resolveEffectiveSourceNode(rawSourceNode, nodesById, edges)
      : undefined;

    if (sourceNode?.type !== 'imageGen') {
      continue;
    }

    const image = collectImageInputFromSource(edge.source, nodesById, incoming, new Set());

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

    if (!sourceNode || !['videoGen', 'composition'].includes(sourceNode.type)) {
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

    if (sourceNode?.type !== 'audioGen') {
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
  const sourceBinItems = useSourceBinStore.getState().items;
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
  const sourceBinItems = useSourceBinStore.getState().items;
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

function collectImageInputFromSource(
  sourceId: string,
  nodesById: Map<string, AppNode>,
  incoming: Map<string, string[]>,
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
      const image = collectImageInputFromSource(upstreamId, nodesById, incoming, visited);

      if (image) {
        return image;
      }
    }

    return undefined;
  }

  if (node.type === 'virtual') {
    for (const upstreamId of incoming.get(sourceId) ?? []) {
      const image = collectImageInputFromSource(upstreamId, nodesById, incoming, visited);

      if (image) {
        return image;
      }
    }

    return undefined;
  }

  if (node.type === 'imageGen') {
    return (node.data.mediaMode ?? 'generate') === 'import'
      ? node.data.sourceAssetUrl
      : node.data.result;
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
    imageOutputFormat: getImageOutputFormat(
      (data.imageOutputFormat as string | undefined) ?? current.imageOutputFormat,
    ),
    audioOutputFormat: getAudioOutputFormat(
      (data.audioOutputFormat as string | undefined) ?? current.audioOutputFormat,
    ),
  };
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

function getDefaultExecutionConfigForNode(nodeType: FlowNodeType): ExecutionConfig {
  if (nodeType === 'videoGen') {
    return {
      ...DEFAULT_EXECUTION_CONFIG,
      aspectRatio: '16:9',
    };
  }

  return DEFAULT_EXECUTION_CONFIG;
}

export const useFlowStore = create<FlowState>()(
  persist(
    (set, get) => ({
      nodes: [],
      edges: [],
      bookmarkSidebarOpen: true,
      setBookmarkSidebarOpen: (bookmarkSidebarOpen) => set({ bookmarkSidebarOpen }),
      onNodesChange: (changes: NodeChange<AppNode>[]) => {
        set({
          nodes: attachRuntimeDataToNodes(applyNodeChanges(changes, get().nodes), get),
        });
      },
      onEdgesChange: (changes: EdgeChange[]) => {
        set({ edges: normalizeFlowEdges(get().nodes, applyEdgeChanges(changes, get().edges)) });
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
        const prunedEdges = replaceExclusiveVideoFrameEdges(
          normalizedConnection,
          get().nodes,
          get().edges,
        );

        set({ edges: normalizeFlowEdges(get().nodes, addEdge(normalizedConnection, prunedEdges)) });
      },
      addNode: (type, position) => {
        const id = `${type}-${Date.now()}`;
        const settings = useSettingsStore.getState();
        const node = attachRuntimeData(
          {
            id,
            type,
            position,
            data: createInitialNodeData(type, settings),
          },
          get,
        );

        set({ nodes: [...get().nodes, node] });
        return id;
      },
      addConnectedNode: (sourceNodeId, type, targetHandle) => {
        const sourceNode = get().nodes.find((node) => node.id === sourceNodeId);

        if (!sourceNode) {
          return;
        }

        const id = `${type}-${Date.now()}`;
        const settings = useSettingsStore.getState();
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
        set({
          nodes: get().nodes.map((node) =>
            node.id === id
              ? attachRuntimeData({ ...node, data: { ...node.data, ...patch } }, get)
              : node,
          ),
        });
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
        set({
          nodes: attachRuntimeDataToNodes(get().nodes, get),
          edges: normalizeFlowEdges(get().nodes, get().edges),
        });
      },
      restoreImportedAssets: async () => {
        const nodesWithAssets = get().nodes.filter((node) => node.data.sourceAssetId);

        const updates = await Promise.all(
          nodesWithAssets.map(async (node) => {
            const assetId = node.data.sourceAssetId;

            if (!assetId) {
              return undefined;
            }

            const storedAsset = await loadImportedAsset(assetId);

            if (!storedAsset) {
              return { nodeId: node.id, patch: { sourceAssetUrl: undefined } as Partial<NodeData> };
            }

            return {
              nodeId: node.id,
              patch: {
                sourceAssetUrl: storedAsset.dataUrl,
                sourceAssetName: storedAsset.name,
                sourceAssetMimeType: storedAsset.mimeType,
              } as Partial<NodeData>,
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
        const normalizedNodes = attachRuntimeDataToNodes(snapshot.nodes ?? [], get);
        set({
          nodes: normalizedNodes,
          edges: normalizeFlowEdges(normalizedNodes, snapshot.edges ?? []),
        });
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

        if (preflightEstimate.rollup.totalKnownCostUsd >= 0.01 || preflightEstimate.rollup.unknownCostCount > 0) {
          const summary = formatRollupSummary(preflightEstimate.rollup, 'Estimated run cost');
          const proceed = window.confirm(
            `${summary}\n\nOnly continue if you want to spend against the configured providers now.`,
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
            const context = {
              prompt: collectTextInputs(currentId, nodesById, incoming),
              textImageInputs: collectTextImageInputs(latestNode, nodesById, latestState.edges),
              editImageInput: collectUpstreamImageInput(currentId, nodesById, latestState.edges),
              editReferenceImageInputs: collectImageReferenceInputs(
                currentId,
                nodesById,
                latestState.edges,
              ),
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
                ['videoGen', 'composition'],
              )?.result,
              audioInputs: COMPOSITION_AUDIO_HANDLES.map((handle) => {
                const track = collectResultInputForHandle(
                  currentId,
                  handle,
                  nodesById,
                  latestState.edges,
                  ['audioGen'],
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
              config: collectExecutionConfig(currentId, latestNode, nodesById, incoming),
            };
            const settings = useSettingsStore.getState();
            const execution = await executeNodeRequest(latestNode, context, settings, (statusMessage) => {
              if (abortSignal.aborted) {
                return;
              }

              get().patchNodeData(currentId, {
                statusMessage,
                error: undefined,
              });
            }, { signal: abortSignal });

            throwIfRunAborted();

            const nextAttemptState = appendResultAttempt(latestNode.data.resultHistory ?? [], execution);

            latestState.patchNodeData(currentId, {
              result: execution.result,
              resultType: execution.resultType,
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
        nodes: state.nodes.map(stripRuntimeData),
        edges: state.edges,
        bookmarkSidebarOpen: state.bookmarkSidebarOpen,
      }),
      onRehydrateStorage: () => (state) => {
        state?.hydratePersistedState();
      },
    },
  ),
);
