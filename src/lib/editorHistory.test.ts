import { describe, expect, it } from 'vitest';
import {
  createEditorHistorySnapshot,
  createEditorHistoryState,
  pushEditorHistoryEntry,
  redoEditorHistory,
  undoEditorHistory,
} from './editorHistory';
import type { EditorVisualClip, NodeData } from '../types/flow';

function createVisualClip(overrides: Partial<EditorVisualClip> & Pick<EditorVisualClip, 'id'>): EditorVisualClip {
  const { id, ...rest } = overrides;

  return {
    id,
    sourceNodeId: 'source-1',
    sourceKind: 'image',
    trackIndex: 0,
    startMs: 0,
    sourceInMs: 0,
    durationSeconds: 4,
    trimStartMs: 0,
    trimEndMs: 0,
    playbackRate: 1,
    reversePlayback: false,
    fitMode: 'contain',
    scalePercent: 100,
    scaleMotionEnabled: false,
    endScalePercent: 100,
    opacityPercent: 100,
    rotationDeg: 0,
    rotationMotionEnabled: false,
    endRotationDeg: 0,
    flipHorizontal: false,
    flipVertical: false,
    positionX: 0,
    positionY: 0,
    motionEnabled: false,
    endPositionX: 0,
    endPositionY: 0,
    cropLeftPercent: 0,
    cropRightPercent: 0,
    cropTopPercent: 0,
    cropBottomPercent: 0,
    cropPanXPercent: 0,
    cropPanYPercent: 0,
    cropRotationDeg: 0,
    filterStack: [],
    transitionIn: 'none',
    transitionOut: 'none',
    transitionDurationMs: 500,
    textFontFamily: 'Inter, system-ui, sans-serif',
    textSizePx: 64,
    textColor: '#f3f4f6',
    textEffect: 'shadow',
    textBackgroundOpacityPercent: 0,
    ...rest,
  };
}

describe('editor history', () => {
  it('undoes and redoes composition editor snapshots', () => {
    const before = createEditorHistorySnapshot({
      aspectRatio: '16:9',
      editorVisualClips: [createVisualClip({ id: 'visual-1', startMs: 0 })],
    });
    const after = createEditorHistorySnapshot({
      aspectRatio: '9:16',
      editorVisualClips: [createVisualClip({ id: 'visual-1', startMs: 2500 })],
    });

    const history = pushEditorHistoryEntry(createEditorHistoryState(), {
      compositionId: 'composition-1',
      before,
      after,
      label: 'Move clip',
    });

    const undo = undoEditorHistory(history);
    expect(undo.entry?.compositionId).toBe('composition-1');
    expect(undo.snapshot).toEqual(before);
    expect(undo.history.undoStack).toHaveLength(0);
    expect(undo.history.redoStack).toHaveLength(1);

    const redo = redoEditorHistory(undo.history);
    expect(redo.entry?.label).toBe('Move clip');
    expect(redo.snapshot).toEqual(after);
    expect(redo.history.undoStack).toHaveLength(1);
    expect(redo.history.redoStack).toHaveLength(0);
  });

  it('ignores no-op snapshots and clears redo after a new edit', () => {
    const first = createEditorHistorySnapshot({
      editorVisualClips: [createVisualClip({ id: 'visual-1', startMs: 0 })],
    });
    const second = createEditorHistorySnapshot({
      editorVisualClips: [createVisualClip({ id: 'visual-1', startMs: 1000 })],
    });
    const third = createEditorHistorySnapshot({
      editorVisualClips: [createVisualClip({ id: 'visual-1', startMs: 2000 })],
    });

    const empty = pushEditorHistoryEntry(createEditorHistoryState(), {
      compositionId: 'composition-1',
      before: first,
      after: first,
      label: 'No op',
    });
    expect(empty.undoStack).toHaveLength(0);

    const withRedo = undoEditorHistory(
      pushEditorHistoryEntry(empty, {
        compositionId: 'composition-1',
        before: first,
        after: second,
        label: 'Move clip',
      }),
    ).history;

    const next = pushEditorHistoryEntry(withRedo, {
      compositionId: 'composition-1',
      before: first,
      after: third,
      label: 'Move clip again',
    });

    expect(next.undoStack).toHaveLength(1);
    expect(next.redoStack).toHaveLength(0);
  });

  it('converts a saved snapshot back to a node-data patch', () => {
    const snapshot = createEditorHistorySnapshot({
      aspectRatio: '1:1',
      videoResolution: '4k',
      compositionTimelineSeconds: 42,
      editorVisualClips: [createVisualClip({ id: 'visual-1', startMs: 3000 })],
    } satisfies Partial<NodeData>);

    expect(snapshot.toPatch()).toMatchObject({
      aspectRatio: '1:1',
      videoResolution: '4k',
      compositionTimelineSeconds: 42,
      editorVisualClips: [{ id: 'visual-1', startMs: 3000 }],
      editorAudioClips: [],
    });
  });
});
