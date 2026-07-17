import { describe, expect, it } from 'vitest';
import type { Connection, Edge } from '@xyflow/react';
import type { AppNode } from '../types/flow';
import {
  normalizeCompositionConnectionTargetHandle,
  normalizeCompositionEdges,
  normalizeCompositionEdgesWithDiagnostics,
} from './compositionEdgeMigration';

function createNode(id: string, type: AppNode['type']): AppNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: {},
  };
}

describe('normalizeCompositionConnectionTargetHandle', () => {
  it('pins video and composition sources onto the composition video handle', () => {
    const nodes = [createNode('video-1', 'videoGen'), createNode('composition-1', 'composition')];
    const connection: Connection = {
      source: 'video-1',
      sourceHandle: null,
      target: 'composition-1',
      targetHandle: null,
    };

    expect(normalizeCompositionConnectionTargetHandle(connection, nodes, [])).toMatchObject({
      targetHandle: 'composition-video',
    });
  });

  it('routes unhandled audio connections to the first open audio track', () => {
    const nodes = [createNode('audio-1', 'audioGen'), createNode('composition-1', 'composition')];
    const edges: Edge[] = [
      {
        id: 'existing-audio',
        source: 'audio-existing',
        target: 'composition-1',
        targetHandle: 'composition-audio-1',
      },
    ];
    const connection: Connection = {
      source: 'audio-1',
      sourceHandle: null,
      target: 'composition-1',
      targetHandle: null,
    };

    expect(normalizeCompositionConnectionTargetHandle(connection, nodes, edges)).toMatchObject({
      targetHandle: 'composition-audio-2',
    });
  });

  it('leaves an explicit out-of-range audio handle untouched instead of silently renumbering it', () => {
    const nodes = [createNode('audio-1', 'audioGen'), createNode('composition-1', 'composition')];
    const connection: Connection = {
      source: 'audio-1',
      sourceHandle: null,
      target: 'composition-1',
      targetHandle: 'composition-audio-7',
    };

    expect(normalizeCompositionConnectionTargetHandle(connection, nodes, [])).toEqual(connection);
  });
});

describe('normalizeCompositionEdges', () => {
  it('repairs legacy composition video edges that were saved without the video handle', () => {
    const nodes = [createNode('video-1', 'videoGen'), createNode('composition-1', 'composition')];
    const edges: Edge[] = [
      {
        id: 'legacy-video',
        source: 'video-1',
        target: 'composition-1',
      },
    ];

    expect(normalizeCompositionEdges(nodes, edges)).toEqual([
      expect.objectContaining({
        id: 'legacy-video',
        source: 'video-1',
        target: 'composition-1',
        targetHandle: 'composition-video',
      }),
    ]);
  });

  it('assigns legacy audio edges to the next available composition audio lane', () => {
    const nodes = [
      createNode('audio-1', 'audioGen'),
      createNode('audio-2', 'audioGen'),
      createNode('composition-1', 'composition'),
    ];
    const edges: Edge[] = [
      {
        id: 'explicit-audio',
        source: 'audio-1',
        target: 'composition-1',
        targetHandle: 'composition-audio-1',
      },
      {
        id: 'legacy-audio',
        source: 'audio-2',
        target: 'composition-1',
      },
    ];

    expect(normalizeCompositionEdges(nodes, edges)).toEqual([
      expect.objectContaining({
        id: 'explicit-audio',
        targetHandle: 'composition-audio-1',
      }),
      expect.objectContaining({
        id: 'legacy-audio',
        targetHandle: 'composition-audio-2',
      }),
    ]);
  });

  it('assigns stable, non-colliding handles to multiple legacy audio edges across repeated normalization', () => {
    const nodes = [
      createNode('audio-1', 'audioGen'),
      createNode('audio-2', 'audioGen'),
      createNode('audio-3', 'audioGen'),
      createNode('composition-1', 'composition'),
    ];
    const edges: Edge[] = [
      { id: 'legacy-a', source: 'audio-1', target: 'composition-1' },
      { id: 'legacy-b', source: 'audio-2', target: 'composition-1' },
      { id: 'legacy-c', source: 'audio-3', target: 'composition-1' },
    ];

    const once = normalizeCompositionEdges(nodes, edges);
    expect(once).toEqual([
      expect.objectContaining({ id: 'legacy-a', targetHandle: 'composition-audio-1' }),
      expect.objectContaining({ id: 'legacy-b', targetHandle: 'composition-audio-2' }),
      expect.objectContaining({ id: 'legacy-c', targetHandle: 'composition-audio-3' }),
    ]);

    const twice = normalizeCompositionEdges(nodes, once);
    expect(twice).toEqual(once);
  });

  it('rejects an already-persisted explicit handle beyond track 4 with a diagnostic instead of renumbering it into range', () => {
    const nodes = [createNode('audio-1', 'audioGen'), createNode('composition-1', 'composition')];
    const edges: Edge[] = [
      { id: 'overflow-audio', source: 'audio-1', target: 'composition-1', targetHandle: 'composition-audio-9' },
    ];

    const result = normalizeCompositionEdgesWithDiagnostics(nodes, edges);
    expect(result.edges).toEqual([]);
    expect(result.diagnostics).toEqual([
      { targetNodeId: 'composition-1', edgeId: 'overflow-audio', handle: 'composition-audio-9', reason: 'overflow' },
    ]);
  });

  it('rejects a malformed audio handle (non-positive index) with a diagnostic', () => {
    const nodes = [createNode('audio-1', 'audioGen'), createNode('composition-1', 'composition')];
    const edges: Edge[] = [
      { id: 'malformed-audio', source: 'audio-1', target: 'composition-1', targetHandle: 'composition-audio-0' },
    ];

    const result = normalizeCompositionEdgesWithDiagnostics(nodes, edges);
    expect(result.edges).toEqual([]);
    expect(result.diagnostics).toEqual([
      { targetNodeId: 'composition-1', edgeId: 'malformed-audio', handle: 'composition-audio-0', reason: 'malformed' },
    ]);
  });

  it('does not disturb explicit valid handles while also migrating a legacy edge in the same pass', () => {
    const nodes = [
      createNode('audio-1', 'audioGen'),
      createNode('audio-2', 'audioGen'),
      createNode('composition-1', 'composition'),
    ];
    const edges: Edge[] = [
      { id: 'explicit-3', source: 'audio-1', target: 'composition-1', targetHandle: 'composition-audio-3' },
      { id: 'legacy', source: 'audio-2', target: 'composition-1' },
    ];

    expect(normalizeCompositionEdges(nodes, edges)).toEqual([
      expect.objectContaining({ id: 'explicit-3', targetHandle: 'composition-audio-3' }),
      expect.objectContaining({ id: 'legacy', targetHandle: 'composition-audio-1' }),
    ]);
  });

  it('leaves unrelated Composition video-handle migration unchanged', () => {
    const nodes = [
      createNode('video-1', 'videoGen'),
      createNode('video-2', 'videoGen'),
      createNode('composition-1', 'composition'),
    ];
    const edges: Edge[] = [
      { id: 'legacy-video-1', source: 'video-1', target: 'composition-1' },
      { id: 'legacy-video-2', source: 'video-2', target: 'composition-1' },
    ];

    // Only the most recently saved legacy video edge wins the single video handle — unrelated to
    // the audio overflow/malformed handling above.
    expect(normalizeCompositionEdges(nodes, edges)).toEqual([
      expect.objectContaining({ id: 'legacy-video-2', targetHandle: 'composition-video' }),
    ]);
  });
});
