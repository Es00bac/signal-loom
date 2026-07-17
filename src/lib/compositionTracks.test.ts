import { describe, expect, it } from 'vitest';
import type { AppNode } from '../types/flow';
import {
  classifyCompositionAudioHandle,
  COMPOSITION_AUDIO_HANDLES,
  getConnectedCompositionAudioHandles,
  normalizeCompositionAudioTrackCounts,
  resolveCompositionAudioTrackModel,
} from './compositionTracks';

function compositionNode(id: string, compositionAudioTrackCount?: unknown): AppNode {
  return {
    id,
    type: 'composition',
    position: { x: 0, y: 0 },
    data: { compositionAudioTrackCount },
  } as AppNode;
}

describe('classifyCompositionAudioHandle', () => {
  it('returns null for handles that are not audio-track-shaped', () => {
    expect(classifyCompositionAudioHandle('composition-video')).toBeNull();
    expect(classifyCompositionAudioHandle(null)).toBeNull();
    expect(classifyCompositionAudioHandle(undefined)).toBeNull();
  });

  it('classifies in-range handles as valid', () => {
    expect(classifyCompositionAudioHandle('composition-audio-1')).toEqual({
      handle: 'composition-audio-1',
      index: 1,
      status: 'valid',
    });
    expect(classifyCompositionAudioHandle('composition-audio-4')).toMatchObject({ index: 4, status: 'valid' });
  });

  it('classifies handles beyond the supported range as overflow', () => {
    expect(classifyCompositionAudioHandle('composition-audio-5')).toEqual({
      handle: 'composition-audio-5',
      index: 5,
      status: 'overflow',
    });
  });

  it('classifies non-positive or non-integer indexes as malformed', () => {
    expect(classifyCompositionAudioHandle('composition-audio-0')).toMatchObject({ status: 'malformed', index: null });
  });
});

describe('resolveCompositionAudioTrackModel', () => {
  it('shows only the requested track count by default', () => {
    expect(resolveCompositionAudioTrackModel(1, []).handles).toEqual(['composition-audio-1']);
    expect(resolveCompositionAudioTrackModel(3, []).handles).toEqual([
      'composition-audio-1',
      'composition-audio-2',
      'composition-audio-3',
    ]);
  });

  it('keeps a hidden connected audio track visible so its edge stays reachable', () => {
    expect(resolveCompositionAudioTrackModel(1, ['composition-audio-3']).handles).toEqual([
      'composition-audio-1',
      'composition-audio-2',
      'composition-audio-3',
    ]);
  });

  it('clamps invalid requested audio track counts into the supported range', () => {
    expect(resolveCompositionAudioTrackModel(0, []).effectiveCount).toBe(1);
    expect(resolveCompositionAudioTrackModel(12, []).effectiveCount).toBe(4);
    expect(resolveCompositionAudioTrackModel(2.9, []).effectiveCount).toBe(2);
    expect(resolveCompositionAudioTrackModel(Number.NaN, []).effectiveCount).toBe(1);
  });

  it('never shrinks a larger authored count when connections are absent', () => {
    expect(resolveCompositionAudioTrackModel(4, []).effectiveCount).toBe(4);
    expect(resolveCompositionAudioTrackModel(4, ['composition-audio-1']).effectiveCount).toBe(4);
  });

  it('reports overflow/malformed handles instead of silently absorbing them into the count', () => {
    const model = resolveCompositionAudioTrackModel(1, ['composition-audio-7', 'composition-audio-0']);
    expect(model.effectiveCount).toBe(1);
    expect(model.overflowHandles).toEqual(['composition-audio-7', 'composition-audio-0']);
  });

  it('ignores handles unrelated to audio tracks', () => {
    expect(resolveCompositionAudioTrackModel(1, ['composition-video', null, undefined]).effectiveCount).toBe(1);
  });
});

describe('getConnectedCompositionAudioHandles', () => {
  it('collects target handles pointed at the given node only', () => {
    const edges = [
      { target: 'composition-1', targetHandle: 'composition-audio-2' },
      { target: 'composition-1', targetHandle: 'composition-video' },
      { target: 'composition-2', targetHandle: 'composition-audio-1' },
    ];
    expect(getConnectedCompositionAudioHandles('composition-1', edges)).toEqual([
      'composition-audio-2',
      'composition-video',
    ]);
  });
});

describe('normalizeCompositionAudioTrackCounts', () => {
  it('raises a stale saved count to the highest explicitly connected audio track', () => {
    const nodes = [compositionNode('composition-1', 1)];
    const edges = [{ target: 'composition-1', targetHandle: 'composition-audio-3' }];

    const next = normalizeCompositionAudioTrackCounts(nodes, edges);
    expect(next[0]?.data.compositionAudioTrackCount).toBe(3);
  });

  it('normalizes at the track-4 boundary', () => {
    const nodes = [compositionNode('composition-1', 1)];
    const edges = [{ target: 'composition-1', targetHandle: 'composition-audio-4' }];

    const next = normalizeCompositionAudioTrackCounts(nodes, edges);
    expect(next[0]?.data.compositionAudioTrackCount).toBe(4);
  });

  it('clamps invalid, zero, fractional, or oversize saved counts deterministically', () => {
    expect(normalizeCompositionAudioTrackCounts([compositionNode('a', 0)], [])[0]?.data.compositionAudioTrackCount).toBe(1);
    expect(normalizeCompositionAudioTrackCounts([compositionNode('b', 2.7)], [])[0]?.data.compositionAudioTrackCount).toBe(2);
    expect(normalizeCompositionAudioTrackCounts([compositionNode('c', 99)], [])[0]?.data.compositionAudioTrackCount).toBe(4);
    expect(normalizeCompositionAudioTrackCounts([compositionNode('d', Number.NaN)], [])[0]?.data.compositionAudioTrackCount).toBe(1);
  });

  it('preserves a larger authored count after its higher track disconnects', () => {
    const settled = compositionNode('composition-1', 4);
    const next = normalizeCompositionAudioTrackCounts([settled], []);
    expect(next[0]?.data.compositionAudioTrackCount).toBe(4);
    expect(next[0]).toBe(settled);
  });

  it('does not rewrite node data when the canonical value already matches (no update-loop churn)', () => {
    const settled = compositionNode('composition-1', 2);
    const edges = [{ target: 'composition-1', targetHandle: 'composition-audio-1' }];
    const originalNodesArray = [settled];

    const next = normalizeCompositionAudioTrackCounts(originalNodesArray, edges);
    expect(next[0]).toBe(settled);
    expect(next).toBe(originalNodesArray);
  });

  it('leaves non-composition nodes untouched', () => {
    const other: AppNode = { id: 'video-1', type: 'videoGen', position: { x: 0, y: 0 }, data: {} } as AppNode;
    const next = normalizeCompositionAudioTrackCounts([other], []);
    expect(next[0]).toBe(other);
  });

  it('is idempotent across the whole snapshot: normalizing twice yields identical output', () => {
    const nodes = [
      compositionNode('composition-1', 1),
      compositionNode('composition-2', 99),
    ];
    const edges = [
      { target: 'composition-1', targetHandle: 'composition-audio-3' },
      { target: 'composition-2', targetHandle: 'composition-audio-2' },
    ];

    const once = normalizeCompositionAudioTrackCounts(nodes, edges);
    const twice = normalizeCompositionAudioTrackCounts(once, edges);
    expect(twice).toEqual(once);
    expect(twice).toBe(once);
  });
});

describe('COMPOSITION_AUDIO_HANDLES', () => {
  it('is bounded to exactly 4 supported handles', () => {
    expect(COMPOSITION_AUDIO_HANDLES).toEqual([
      'composition-audio-1',
      'composition-audio-2',
      'composition-audio-3',
      'composition-audio-4',
    ]);
  });
});
