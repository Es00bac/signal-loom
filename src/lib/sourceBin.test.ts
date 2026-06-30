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

  it('extracts cropped image outputs as reusable image assets', () => {
    const item = buildSourceBinItem(
      createNode({
        id: 'crop-1',
        type: 'cropImageNode' as AppNode['type'],
        data: {
          result: 'data:image/png;base64,Q1JPUFBFRA==',
          resultType: 'image',
        },
      }),
    );

    expect(item).toMatchObject({
      kind: 'image',
      assetUrl: 'data:image/png;base64,Q1JPUFBFRA==',
      label: 'Cropped image',
      mimeType: 'image/png',
    });
  });

  it('represents image-sequence composition ZIP outputs as packages', () => {
    const item = buildSourceBinItem(
      createNode({
        id: 'composition-1',
        type: 'composition',
        data: {
          result: 'blob:image-sequence-zip',
          resultType: 'package',
          resultMimeType: 'application/zip',
        },
      }),
    );

    expect(item).toMatchObject({
      kind: 'package',
      label: 'Composition package',
      assetUrl: 'blob:image-sequence-zip',
      mimeType: 'application/zip',
    });
  });

  it('keeps normal composition outputs as video compositions', () => {
    const item = buildSourceBinItem(
      createNode({
        id: 'composition-1',
        type: 'composition',
        data: {
          result: 'blob:composition-video',
          resultType: 'video',
          resultMimeType: 'video/webm',
        },
      }),
    );

    expect(item).toMatchObject({
      kind: 'composition',
      label: 'Composition output',
      assetUrl: 'blob:composition-video',
      mimeType: 'video/webm',
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

  it('ingests generator node connected directly to source-bin as a single plain item, ignoring envelopeItems', () => {
    const nodes = [
      createNode({
        id: 'image-1',
        type: 'imageGen',
        data: {
          result: 'data:image/png;base64,AAA',
          envelopeItems: [
            {
              id: 'image-1-envelope-0',
              index: 0,
              kind: 'image',
              label: 'Image 1',
              value: 'data:image/png;base64,AAA',
              mimeType: 'image/png',
            },
          ],
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
    ];

    expect(collectGlobalSourceBinItems(nodes, edges)).toEqual([
      expect.objectContaining({
        id: 'source-image-1',
        kind: 'image',
        label: 'Image',
        assetUrl: 'data:image/png;base64,AAA',
      }),
    ]);
  });

  it('expands a generator node\'s multi-result BATCH (2+ envelopeItems) into all N connected items', () => {
    const nodes = [
      createNode({
        id: 'image-1',
        type: 'imageGen',
        data: {
          result: 'data:image/png;base64,AAA',
          envelopeItems: [
            { id: 'image-1-envelope-0', index: 0, kind: 'image', label: 'Image 1', value: 'data:image/png;base64,AAA', mimeType: 'image/png', sourceBinItemId: 'sb-a' },
            { id: 'image-1-envelope-1', index: 1, kind: 'image', label: 'Image 2', value: 'data:image/png;base64,BBB', mimeType: 'image/png', sourceBinItemId: 'sb-b' },
            { id: 'image-1-envelope-2', index: 2, kind: 'image', label: 'Image 3', value: 'data:image/png;base64,CCC', mimeType: 'image/png', sourceBinItemId: 'sb-c' },
          ],
        },
      }),
      createNode({ id: 'bin-1', type: 'sourceBin' }),
    ];
    const edges: Edge[] = [{ id: 'edge-1', source: 'image-1', target: 'bin-1' }];

    const items = collectGlobalSourceBinItems(nodes, edges);
    // All three batch results are surfaced (so the source-bin reconciliation keeps them, not just the first).
    expect(items).toHaveLength(3);
    expect(items.map((item) => item.sourceBinItemId)).toEqual(['sb-a', 'sb-b', 'sb-c']);
  });

  it('expands envelope outputs into individually draggable source-bin items when explicitly routed through an envelope node', () => {
    const nodes = [
      createNode({
        id: 'image-1',
        type: 'imageGen',
        data: {
          envelopeItems: [
            {
              id: 'image-1-envelope-0',
              index: 0,
              kind: 'image',
              label: 'Image 1',
              value: 'data:image/png;base64,AAA',
              mimeType: 'image/png',
            },
            {
              id: 'image-1-envelope-1',
              index: 1,
              kind: 'image',
              label: 'Image 2',
              value: 'data:image/png;base64,BBB',
              mimeType: 'image/png',
            },
          ],
        },
      }),
      createNode({ id: 'envelope-1', type: 'envelope' }),
      createNode({ id: 'bin-1', type: 'sourceBin' }),
    ];
    const edges: Edge[] = [
      {
        id: 'edge-1',
        source: 'image-1',
        target: 'envelope-1',
      },
      {
        id: 'edge-2',
        source: 'envelope-1',
        target: 'bin-1',
      },
    ];

    expect(collectGlobalSourceBinItems(nodes, edges)).toEqual([
      expect.objectContaining({
        id: 'source-image-1-envelope-0',
        kind: 'image',
        label: 'Image 1',
        assetUrl: 'data:image/png;base64,AAA',
        envelopeId: 'envelope-1',
        envelopeIndex: 0,
      }),
      expect.objectContaining({
        id: 'source-image-1-envelope-1',
        kind: 'image',
        label: 'Image 2',
        assetUrl: 'data:image/png;base64,BBB',
        envelopeId: 'envelope-1',
        envelopeIndex: 1,
      }),
    ]);
  });

  it('expands package node outputs with both image values and prefilled text prompts in the source bin items', () => {
    const nodes = [
      createNode({
        id: 'text-1',
        type: 'textNode',
        data: { prompt: 'My Package Prompt text' },
      }),
      createNode({
        id: 'image-1',
        type: 'imageGen',
        data: { result: 'data:image/png;base64,AAA' },
      }),
      createNode({
        id: 'pkg-1',
        type: 'packageNode',
        data: { customTitle: 'Custom Package Name' },
      }),
      createNode({ id: 'envelope-1', type: 'envelope' }),
      createNode({ id: 'bin-1', type: 'sourceBin' }),
    ];
    const edges: Edge[] = [
      { id: 'edge-t', source: 'text-1', target: 'pkg-1', targetHandle: 'text' },
      { id: 'edge-i', source: 'image-1', target: 'pkg-1', targetHandle: 'image' },
      { id: 'edge-p', source: 'pkg-1', target: 'envelope-1' },
      { id: 'edge-b', source: 'envelope-1', target: 'bin-1' },
    ];

    expect(collectGlobalSourceBinItems(nodes, edges)).toEqual([
      expect.objectContaining({
        id: 'source-pkg-1-single-0',
        kind: 'package',
        label: 'Custom Package Name',
        assetUrl: 'data:image/png;base64,AAA',
        text: 'My Package Prompt text',
        envelopeId: 'envelope-1',
        envelopeIndex: 0,
      }),
    ]);
  });
});
