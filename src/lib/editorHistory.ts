import type {
  AspectRatio,
  EditorAudioClip,
  EditorAsset,
  EditorVisualClip,
  NodeData,
  VideoResolution,
} from '../types/flow';
import {
  getEditorAudioClips,
  getEditorAudioTrackVolumes,
  getEditorVisualClips,
} from './manualEditorState';
import { getEditorStageObjects } from './editorStageObjects';
import { getEditorAssets } from './editorAssets';

export const EDITOR_HISTORY_LIMIT = 80;

export interface EditorHistorySnapshot {
  aspectRatio?: AspectRatio;
  videoResolution?: VideoResolution;
  compositionTimelineSeconds?: number;
  editorVisualClips: EditorVisualClip[];
  editorAudioClips: EditorAudioClip[];
  editorAudioTrackVolumes: number[];
  editorAssets: EditorAsset[];
  editorStageObjects: NodeData['editorStageObjects'];
  toPatch: () => Partial<NodeData>;
}

export interface EditorHistoryEntry {
  compositionId: string;
  before: EditorHistorySnapshot;
  after: EditorHistorySnapshot;
  label: string;
}

export interface EditorHistoryState {
  undoStack: EditorHistoryEntry[];
  redoStack: EditorHistoryEntry[];
  limit: number;
}

export interface EditorHistoryResult {
  history: EditorHistoryState;
  entry?: EditorHistoryEntry;
  snapshot?: EditorHistorySnapshot;
}

export function createEditorHistoryState(limit = EDITOR_HISTORY_LIMIT): EditorHistoryState {
  return {
    undoStack: [],
    redoStack: [],
    limit,
  };
}

export function createEditorHistorySnapshot(data: Partial<NodeData>): EditorHistorySnapshot {
  const snapshotData = {
    aspectRatio: normalizeAspectRatio(data.aspectRatio),
    videoResolution: normalizeVideoResolution(data.videoResolution),
    compositionTimelineSeconds: normalizeTimelineSeconds(data.compositionTimelineSeconds),
    editorVisualClips: getEditorVisualClips(data).map(cloneVisualClip),
    editorAudioClips: getEditorAudioClips(data).map(cloneAudioClip),
    editorAudioTrackVolumes: getEditorAudioTrackVolumes(data),
    editorAssets: getEditorAssets(data).map(cloneEditorAsset),
    editorStageObjects: getEditorStageObjects(data).map(cloneStageObject),
  };

  return {
    ...snapshotData,
    toPatch: () => ({
      aspectRatio: snapshotData.aspectRatio,
      videoResolution: snapshotData.videoResolution,
      compositionTimelineSeconds: snapshotData.compositionTimelineSeconds,
      editorVisualClips: snapshotData.editorVisualClips.map(cloneVisualClip),
      editorAudioClips: snapshotData.editorAudioClips.map(cloneAudioClip),
      editorAudioTrackVolumes: [...snapshotData.editorAudioTrackVolumes],
      editorAssets: snapshotData.editorAssets.map(cloneEditorAsset),
      editorStageObjects: snapshotData.editorStageObjects?.map(cloneStageObject),
    }),
  };
}

export function pushEditorHistoryEntry(
  history: EditorHistoryState,
  entry: EditorHistoryEntry,
): EditorHistoryState {
  if (areEditorHistorySnapshotsEqual(entry.before, entry.after)) {
    return history;
  }

  return {
    ...history,
    undoStack: [...history.undoStack, entry].slice(-history.limit),
    redoStack: [],
  };
}

export function undoEditorHistory(history: EditorHistoryState): EditorHistoryResult {
  const entry = history.undoStack.at(-1);

  if (!entry) {
    return { history };
  }

  return {
    history: {
      ...history,
      undoStack: history.undoStack.slice(0, -1),
      redoStack: [...history.redoStack, entry].slice(-history.limit),
    },
    entry,
    snapshot: entry.before,
  };
}

export function redoEditorHistory(history: EditorHistoryState): EditorHistoryResult {
  const entry = history.redoStack.at(-1);

  if (!entry) {
    return { history };
  }

  return {
    history: {
      ...history,
      undoStack: [...history.undoStack, entry].slice(-history.limit),
      redoStack: history.redoStack.slice(0, -1),
    },
    entry,
    snapshot: entry.after,
  };
}

function areEditorHistorySnapshotsEqual(
  left: EditorHistorySnapshot,
  right: EditorHistorySnapshot,
): boolean {
  return stableSnapshotString(left) === stableSnapshotString(right);
}

function stableSnapshotString(snapshot: EditorHistorySnapshot): string {
  return JSON.stringify({
    aspectRatio: snapshot.aspectRatio,
    videoResolution: snapshot.videoResolution,
    compositionTimelineSeconds: snapshot.compositionTimelineSeconds,
    editorVisualClips: snapshot.editorVisualClips,
    editorAudioClips: snapshot.editorAudioClips,
    editorAudioTrackVolumes: snapshot.editorAudioTrackVolumes,
    editorAssets: snapshot.editorAssets,
    editorStageObjects: snapshot.editorStageObjects,
  });
}

function cloneVisualClip(clip: EditorVisualClip): EditorVisualClip {
  return {
    ...clip,
    opacityAutomationPoints: clip.opacityAutomationPoints?.map((point) => ({ ...point })),
    keyframes: clip.keyframes?.map((keyframe) => ({ ...keyframe })),
  };
}

function cloneAudioClip(clip: EditorAudioClip): EditorAudioClip {
  return {
    ...clip,
    volumeAutomationPoints: clip.volumeAutomationPoints?.map((point) => ({ ...point })),
    volumeKeyframes: clip.volumeKeyframes?.map((keyframe) => ({ ...keyframe })),
  };
}

function cloneEditorAsset(asset: EditorAsset): EditorAsset {
  return {
    ...asset,
    textDefaults: asset.textDefaults ? { ...asset.textDefaults } : undefined,
    shapeDefaults: asset.shapeDefaults ? { ...asset.shapeDefaults } : undefined,
  };
}

function cloneStageObject(
  object: NonNullable<NodeData['editorStageObjects']>[number],
): NonNullable<NodeData['editorStageObjects']>[number] {
  return { ...object };
}

function normalizeAspectRatio(value: unknown): AspectRatio | undefined {
  return value === '1:1' || value === '16:9' || value === '9:16' ? value : undefined;
}

function normalizeVideoResolution(value: unknown): VideoResolution | undefined {
  return value === '720p' || value === '1080p' || value === '4k' ? value : undefined;
}

function normalizeTimelineSeconds(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(1, Math.round(value))
    : undefined;
}
