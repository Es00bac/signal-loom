import type { Edge } from '@xyflow/react';
import type { AppNode, CompositionTargetHandle, NodeData } from '../types/flow';

export const COMPOSITION_VIDEO_HANDLE: CompositionTargetHandle = 'composition-video';
export const COMPOSITION_AUDIO_HANDLES: CompositionTargetHandle[] = [
  'composition-audio-1',
  'composition-audio-2',
  'composition-audio-3',
  'composition-audio-4',
];

const COMPOSITION_AUDIO_HANDLE_PATTERN = /^composition-audio-(\d+)$/;

export type CompositionAudioHandleStatus = 'valid' | 'overflow' | 'malformed';

export interface CompositionAudioHandleClassification {
  handle: string;
  /** 1-based track index when the handle is shaped like `composition-audio-N`; otherwise `null`. */
  index: number | null;
  status: CompositionAudioHandleStatus;
}

/**
 * Classifies a handle string as a supported audio track (`valid`), an audio-track-shaped handle
 * beyond the supported 1-4 range (`overflow`), or a non-positive/non-integer index (`malformed`).
 * Returns `null` for anything that isn't audio-track-shaped at all (e.g. the video handle).
 */
export function classifyCompositionAudioHandle(
  handle: string | null | undefined,
): CompositionAudioHandleClassification | null {
  if (typeof handle !== 'string') {
    return null;
  }

  const match = COMPOSITION_AUDIO_HANDLE_PATTERN.exec(handle);

  if (!match) {
    return null;
  }

  const index = Number(match[1]);

  if (!Number.isInteger(index) || index < 1) {
    return { handle, index: null, status: 'malformed' };
  }

  if (index > COMPOSITION_AUDIO_HANDLES.length) {
    return { handle, index, status: 'overflow' };
  }

  return { handle, index, status: 'valid' };
}

export function isCompositionAudioHandle(handle: string | null | undefined): handle is CompositionTargetHandle {
  return COMPOSITION_AUDIO_HANDLES.includes(handle as CompositionTargetHandle);
}

export interface CompositionAudioTrackModel {
  /** At least 1, at least the highest validly connected track, and never below the authored count. */
  effectiveCount: number;
  handles: readonly CompositionTargetHandle[];
  /** Audio-track-shaped handles beyond the supported range or otherwise malformed — never hidden, never counted. */
  overflowHandles: readonly string[];
}

/**
 * The single canonical source of truth for how many Composition audio tracks are effectively
 * present. Every consumer — contract ports, UI visible handles, add-track behavior, connection
 * validation, and execution input collection — must derive from this instead of re-deriving its
 * own max(authored, connected) logic, so they can never disagree (FBL-019).
 */
export function resolveCompositionAudioTrackModel(
  authoredTrackCount: unknown,
  connectedAudioHandles: readonly (string | null | undefined)[] = [],
): CompositionAudioTrackModel {
  const authoredCount = clampCompositionAudioTrackCount(authoredTrackCount);
  let highestValidConnected = 0;
  const overflowHandles: string[] = [];

  for (const handle of connectedAudioHandles) {
    const classification = classifyCompositionAudioHandle(handle);

    if (!classification) {
      continue;
    }

    if (classification.status === 'valid' && classification.index !== null) {
      highestValidConnected = Math.max(highestValidConnected, classification.index);
    } else {
      overflowHandles.push(classification.handle);
    }
  }

  const effectiveCount = Math.max(1, authoredCount, highestValidConnected);

  return {
    effectiveCount,
    handles: COMPOSITION_AUDIO_HANDLES.slice(0, effectiveCount),
    overflowHandles,
  };
}

/** Target handles of every edge pointed at `nodeId`, regardless of source node type. */
export function getConnectedCompositionAudioHandles(
  nodeId: string,
  edges: readonly Pick<Edge, 'target' | 'targetHandle'>[],
): (string | null | undefined)[] {
  return edges.filter((edge) => edge.target === nodeId).map((edge) => edge.targetHandle);
}

/**
 * Settles each Composition node's persisted `compositionAudioTrackCount` to the canonical
 * effective count derived from `edges` — e.g. a saved count of 1 with an explicit
 * `composition-audio-3` edge becomes 3. Only rewrites a node's data when the canonical value
 * actually differs, so an already-settled project produces the identical node array (referential
 * equality) on repeat calls instead of churning saves or triggering extra re-renders.
 */
export function normalizeCompositionAudioTrackCounts(
  nodes: AppNode[],
  edges: readonly Pick<Edge, 'target' | 'targetHandle'>[],
): AppNode[] {
  let mutated = false;
  const next = nodes.map((node) => {
    if (node.type !== 'composition') {
      return node;
    }

    const connectedHandles = getConnectedCompositionAudioHandles(node.id, edges);
    const { effectiveCount } = resolveCompositionAudioTrackModel(node.data.compositionAudioTrackCount, connectedHandles);

    if (node.data.compositionAudioTrackCount === effectiveCount) {
      return node;
    }

    mutated = true;
    return {
      ...node,
      data: {
        ...node.data,
        compositionAudioTrackCount: effectiveCount,
      },
    };
  });

  return mutated ? next : nodes;
}

interface CompositionTrackSettings {
  offsetMs: number;
  volumePercent: number;
  enabled: boolean;
}

export function getCompositionTrackSettings(
  nodeData: NodeData,
  handle: CompositionTargetHandle,
): CompositionTrackSettings {
  switch (handle) {
    case 'composition-audio-1':
      return {
        offsetMs: coerceNumber(nodeData.compositionAudio1OffsetMs, 0),
        volumePercent: coerceNumber(nodeData.compositionAudio1Volume, 100),
        enabled: coerceBoolean(nodeData.compositionAudio1Enabled, true),
      };
    case 'composition-audio-2':
      return {
        offsetMs: coerceNumber(nodeData.compositionAudio2OffsetMs, 0),
        volumePercent: coerceNumber(nodeData.compositionAudio2Volume, 100),
        enabled: coerceBoolean(nodeData.compositionAudio2Enabled, true),
      };
    case 'composition-audio-3':
      return {
        offsetMs: coerceNumber(nodeData.compositionAudio3OffsetMs, 0),
        volumePercent: coerceNumber(nodeData.compositionAudio3Volume, 100),
        enabled: coerceBoolean(nodeData.compositionAudio3Enabled, true),
      };
    case 'composition-audio-4':
      return {
        offsetMs: coerceNumber(nodeData.compositionAudio4OffsetMs, 0),
        volumePercent: coerceNumber(nodeData.compositionAudio4Volume, 100),
        enabled: coerceBoolean(nodeData.compositionAudio4Enabled, true),
      };
    case 'composition-video':
      return {
        offsetMs: 0,
        volumePercent: coerceNumber(nodeData.compositionVideoAudioVolume, 100),
        enabled: true,
      };
  }
}

export function getCompositionTrackKeys(handle: CompositionTargetHandle): {
  offsetKey?: keyof NodeData;
  volumeKey?: keyof NodeData;
  enabledKey?: keyof NodeData;
} {
  switch (handle) {
    case 'composition-audio-1':
      return {
        offsetKey: 'compositionAudio1OffsetMs',
        volumeKey: 'compositionAudio1Volume',
        enabledKey: 'compositionAudio1Enabled',
      };
    case 'composition-audio-2':
      return {
        offsetKey: 'compositionAudio2OffsetMs',
        volumeKey: 'compositionAudio2Volume',
        enabledKey: 'compositionAudio2Enabled',
      };
    case 'composition-audio-3':
      return {
        offsetKey: 'compositionAudio3OffsetMs',
        volumeKey: 'compositionAudio3Volume',
        enabledKey: 'compositionAudio3Enabled',
      };
    case 'composition-audio-4':
      return {
        offsetKey: 'compositionAudio4OffsetMs',
        volumeKey: 'compositionAudio4Volume',
        enabledKey: 'compositionAudio4Enabled',
      };
    case 'composition-video':
      return {};
  }
}

function coerceNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

export function clampCompositionAudioTrackCount(value: unknown): number {
  return Math.max(1, Math.min(COMPOSITION_AUDIO_HANDLES.length, Math.floor(coerceNumber(value, 1))));
}

function coerceBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  return fallback;
}
