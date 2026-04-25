import { describe, expect, it } from 'vitest';
import type { Connection, Edge } from '@xyflow/react';
import type { AppNode } from '../types/flow';
import {
  normalizeCompositionConnectionTargetHandle,
  normalizeCompositionEdges,
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
});
