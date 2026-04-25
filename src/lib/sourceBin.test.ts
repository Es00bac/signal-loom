import { describe, expect, it } from 'vitest';
import type { Edge } from '@xyflow/react';
import type { AppNode } from '../types/flow';
import { buildSourceBinItem, collectGlobalSourceBinItems, collectSourceBinItems } from './sourceBin';

function createNode(node: Partial<AppNode> & Pick<AppNode, 'id' | 'type'>): AppNode {
  return {
    position: { x: 0, y: 0 },
    data: {},
    ...node,
  } as AppNode;
}

describe('buildSourceBinItem', () => {
  it('extracts prompt text from prompt-mode text nodes', () => {
    const item = buildSourceBinItem(
      createNode({
        id: 'text-1',
        type: 'textNode',
        data: {
          mode: 'prompt',
          prompt: 'Hello world',
        },
      }),
    );

    expect(item).toMatchObject({
      kind: 'text',
      text: 'Hello world',
    });
  });

  it('extracts imported image assets from image nodes', () => {
    const item = buildSourceBinItem(
      createNode({
        id: 'image-1',
        type: 'imageGen',
        data: {
          mediaMode: 'import',
          sourceAssetUrl: 'data:image/png;base64,AAA',
          sourceAssetName: 'portrait.png',
        },
      }),
    );

    expect(item).toMatchObject({
      kind: 'image',
      assetUrl: 'data:image/png;base64,AAA',
      label: 'portrait.png',
    });
  });
});

describe('collectSourceBinItems', () => {
  it('returns only connected source items for a source bin', () => {
    const nodes = [
      createNode({
        id: 'image-1',
        type: 'imageGen',
        data: {
          result: 'data:image/png;base64,AAA',
        },
      }),
      createNode({
        id: 'audio-1',
        type: 'audioGen',
        data: {
          result: 'data:audio/mpeg;base64,BBB',
        },
      }),
      createNode({ id: 'bin-1', type: 'sourceBin' }),
    ];
    const edges: Edge[] = [
      {
        id: 'edge-1',
        source: 'image-1',
        target: 'bin-1',
      },
      {
        id: 'edge-2',
        source: 'audio-1',
        target: 'bin-1',
      },
    ];

    expect(collectSourceBinItems(nodes, edges, 'bin-1')).toHaveLength(2);
  });

  it('treats multiple source bins as entry points into one global pool', () => {
    const nodes = [
      createNode({
        id: 'image-1',
        type: 'imageGen',
        data: {
          result: 'data:image/png;base64,AAA',
        },
      }),
      createNode({
        id: 'video-1',
        type: 'videoGen',
        data: {
          result: 'data:video/mp4;base64,BBB',
        },
      }),
      createNode({ id: 'bin-1', type: 'sourceBin' }),
      createNode({ id: 'bin-2', type: 'sourceBin' }),
    ];
    const edges: Edge[] = [
      {
        id: 'edge-1',
        source: 'image-1',
        target: 'bin-1',
      },
      {
        id: 'edge-2',
        source: 'video-1',
        target: 'bin-2',
      },
    ];

    expect(collectSourceBinItems(nodes, edges, 'bin-1')).toHaveLength(2);
    expect(collectSourceBinItems(nodes, edges, 'bin-2')).toHaveLength(2);
  });
});

describe('collectGlobalSourceBinItems', () => {
  it('deduplicates a source asset connected into multiple bins', () => {
    const nodes = [
      createNode({
        id: 'image-1',
        type: 'imageGen',
        data: {
          result: 'data:image/png;base64,AAA',
        },
      }),
      createNode({ id: 'bin-1', type: 'sourceBin' }),
      createNode({ id: 'bin-2', type: 'sourceBin' }),
    ];
    const edges: Edge[] = [
      {
        id: 'edge-1',
        source: 'image-1',
        target: 'bin-1',
      },
      {
        id: 'edge-2',
        source: 'image-1',
        target: 'bin-2',
      },
    ];

    expect(collectGlobalSourceBinItems(nodes, edges)).toHaveLength(1);
  });
});
