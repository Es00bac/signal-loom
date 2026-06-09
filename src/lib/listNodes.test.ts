import { describe, expect, it } from 'vitest';
import type { Edge } from '@xyflow/react';
import type { AppNode } from '../types/flow';
import {
  buildListItemTargetHandle,
  buildListNodeItems,
  getListNodeKind,
  getListNodeSlotCount,
  normalizeEnvelopeItems,
  resolveExpandedListItemForNode,
  collectEnvelopeItemsForEnvelopeNode,
  collectEnvelopeItemsFromSourceNode,
  evaluateNodeTextForMonitor,
} from './listNodes';

function createNode(node: Partial<AppNode> & Pick<AppNode, 'id' | 'type'>): AppNode {
  return {
    position: { x: 0, y: 0 },
    data: {},
    ...node,
  } as AppNode;
}

describe('list node model', () => {
  it('uses the first populated slot to type the list and keeps one empty slot after the last item', () => {
    const nodes = [
      createNode({
        id: 'image-1',
        type: 'imageGen',
        data: { result: 'data:image/png;base64,AAA', modelId: 'image-model' },
      }),
      createNode({
        id: 'image-2',
        type: 'imageGen',
        data: { result: 'data:image/png;base64,BBB', modelId: 'image-model' },
      }),
      createNode({ id: 'list-1', type: 'list' }),
    ];
    const edges: Edge[] = [
      {
        id: 'edge-1',
        source: 'image-1',
        target: 'list-1',
        targetHandle: buildListItemTargetHandle(0),
      },
      {
        id: 'edge-2',
        source: 'image-2',
        target: 'list-1',
        targetHandle: buildListItemTargetHandle(1),
      },
    ];

    const items = buildListNodeItems('list-1', nodes, edges);

    expect(getListNodeKind(items)).toBe('image');
    expect(getListNodeSlotCount(items)).toBe(3);
    expect(items.map((item) => item.value)).toEqual([
      'data:image/png;base64,AAA',
      'data:image/png;base64,BBB',
    ]);
  });

  it('marks later slots incompatible when they do not match the first item type', () => {
    const nodes = [
      createNode({
        id: 'image-1',
        type: 'imageGen',
        data: { result: 'data:image/png;base64,AAA' },
      }),
      createNode({
        id: 'audio-1',
        type: 'audioGen',
        data: { result: 'data:audio/mpeg;base64,BBB' },
      }),
      createNode({ id: 'list-1', type: 'list' }),
    ];
    const edges: Edge[] = [
      {
        id: 'edge-1',
        source: 'image-1',
        target: 'list-1',
        targetHandle: buildListItemTargetHandle(0),
      },
      {
        id: 'edge-2',
        source: 'audio-1',
        target: 'list-1',
        targetHandle: buildListItemTargetHandle(1),
      },
    ];

    const items = buildListNodeItems('list-1', nodes, edges);

    expect(getListNodeKind(items)).toBe('image');
    expect(items[1]).toMatchObject({
      kind: 'audio',
      invalidReason: 'This list is typed as image, so audio outputs cannot be added.',
    });
  });

  it('expands a connected list to the selected single item for downstream operations', () => {
    const nodes = [
      createNode({
        id: 'image-1',
        type: 'imageGen',
        data: { result: 'data:image/png;base64,AAA', modelId: 'image-model' },
      }),
      createNode({
        id: 'image-2',
        type: 'imageGen',
        data: { result: 'data:image/png;base64,BBB', modelId: 'image-model' },
      }),
      createNode({ id: 'list-1', type: 'list' }),
      createNode({ id: 'expander-1', type: 'expander', data: { expandedItemIndex: 1 } }),
      createNode({ id: 'list-2', type: 'list' }),
    ];
    const edges: Edge[] = [
      { id: 'edge-1', source: 'image-1', target: 'list-1', targetHandle: buildListItemTargetHandle(0) },
      { id: 'edge-2', source: 'image-2', target: 'list-1', targetHandle: buildListItemTargetHandle(1) },
      { id: 'edge-3', source: 'list-1', target: 'expander-1' },
      { id: 'edge-4', source: 'expander-1', target: 'list-2', targetHandle: buildListItemTargetHandle(0) },
    ];

    expect(resolveExpandedListItemForNode(nodes[3], nodes, edges)).toMatchObject({
      kind: 'image',
      value: 'data:image/png;base64,BBB',
      index: 1,
    });
    expect(buildListNodeItems('list-2', nodes, edges)[0]).toMatchObject({
      kind: 'image',
      value: 'data:image/png;base64,BBB',
      nodeId: 'expander-1',
    });
  });

  it('repairs duplicate persisted envelope indexes so batch items keep distinct slots', () => {
    const items = normalizeEnvelopeItems([
      {
        id: 'panel-a',
        index: 0,
        kind: 'image',
        label: 'Panel A',
        value: 'signal-loom-asset://file/panel-a',
      },
      {
        id: 'panel-b',
        index: 0,
        kind: 'image',
        label: 'Panel B',
        value: 'signal-loom-asset://file/panel-b',
      },
      {
        id: 'panel-c',
        index: 0,
        kind: 'image',
        label: 'Panel C',
        value: 'signal-loom-asset://file/panel-c',
      },
    ]);

    expect(items.map((item) => item.index)).toEqual([0, 1, 2]);
  });

  it('merges persisted envelope items with dynamically collected ones rather than overriding them', () => {
    const nodes = [
      createNode({
        id: 'image-1',
        type: 'imageGen',
        data: { result: 'data:image/png;base64,AAA', modelId: 'image-model' },
      }),
      createNode({
        id: 'envelope-1',
        type: 'envelope',
        data: {
          envelopeItems: [
            {
              id: 'persisted-1',
              index: 0,
              kind: 'image',
              label: 'Persisted Image',
              value: 'data:image/png;base64,BBB',
            },
          ],
        },
      }),
    ];
    const edges: Edge[] = [
      { id: 'edge-1', source: 'image-1', target: 'envelope-1' },
    ];

    const items = collectEnvelopeItemsForEnvelopeNode('envelope-1', nodes, edges);

    expect(items.length).toBe(2);
    expect(items.map(item => item.value)).toContain('data:image/png;base64,AAA');
    expect(items.map(item => item.value)).toContain('data:image/png;base64,BBB');
    expect(items.map(item => item.index)).toEqual([0, 1]);
  });

  it('supports loopNode as a source in collectEnvelopeItemsFromSourceNode', () => {
    const nodes = [
      createNode({
        id: 'loop-1',
        type: 'loopNode',
        data: { count: 2 },
      }),
      createNode({
        id: 'image-1',
        type: 'imageGen',
        data: { result: 'data:image/png;base64,AAA' },
      }),
    ];
    const edges: Edge[] = [
      { id: 'edge-loop-input', source: 'image-1', target: 'loop-1' },
    ];

    const items = collectEnvelopeItemsFromSourceNode(nodes[0], nodes, edges);
    expect(items.length).toBe(2);
    expect(items[0].value).toBe('data:image/png;base64,AAA');
    expect(items[1].value).toBe('data:image/png;base64,AAA');
    expect(items[0].index).toBe(0);
    expect(items[1].index).toBe(1);
  });

  it('delegates to collectEnvelopeItemsForEnvelopeNode in collectEnvelopeItemsFromSourceNode even when envelope has persisted items', () => {
    const nodes = [
      createNode({
        id: 'image-1',
        type: 'imageGen',
        data: { result: 'data:image/png;base64,AAA', modelId: 'image-model' },
      }),
      createNode({
        id: 'envelope-1',
        type: 'envelope',
        data: {
          envelopeItems: [
            {
              id: 'persisted-1',
              index: 0,
              kind: 'image',
              label: 'Persisted Image',
              value: 'data:image/png;base64,BBB',
            },
          ],
        },
      }),
    ];
    const edges: Edge[] = [
      { id: 'edge-1', source: 'image-1', target: 'envelope-1' },
    ];

    const items = collectEnvelopeItemsFromSourceNode(nodes[1], nodes, edges);

    expect(items.length).toBe(2);
    expect(items.map(item => item.value)).toContain('data:image/png;base64,AAA');
    expect(items.map(item => item.value)).toContain('data:image/png;base64,BBB');
  });

  it('correctly passes nodes and edges to buildListItemFromNode inside collectEnvelopeItemsFromSourceNode for a packageNode', () => {
    const nodes = [
      createNode({
        id: 'text-1',
        type: 'textNode',
        data: { prompt: 'Package Promo Prompt' },
      }),
      createNode({
        id: 'image-1',
        type: 'imageGen',
        data: { result: 'data:image/png;base64,AAA' },
      }),
      createNode({
        id: 'pkg-1',
        type: 'packageNode',
        data: { customTitle: 'My Test Package' },
      }),
    ];
    const edges: Edge[] = [
      { id: 'edge-text', source: 'text-1', target: 'pkg-1', targetHandle: 'text' },
      { id: 'edge-image', source: 'image-1', target: 'pkg-1', targetHandle: 'image' },
    ];
    const items = collectEnvelopeItemsFromSourceNode(nodes[2], nodes, edges);

    expect(items.length).toBe(1);
    expect(items[0]).toMatchObject({
      kind: 'package',
      label: 'My Test Package',
      value: 'data:image/png;base64,AAA',
      text: 'Package Promo Prompt',
    });
  });

  it('deduplicates envelope items by matching sourceBinItemId even with different id formats', () => {
    const nodes = [
      createNode({
        id: 'image-1',
        type: 'imageGen',
        data: {
          envelopeItems: [
            {
              id: 'source-bin-item-6',
              index: 0,
              kind: 'image',
              label: 'Generated Item',
              value: 'assets/source-bin-item-6.png',
              sourceBinItemId: 'source-bin-item-6',
            },
          ],
        },
      }),
      createNode({
        id: 'envelope-1',
        type: 'envelope',
        data: {
          envelopeItems: [
            {
              id: 'imageGen-envelope-12345-5',
              index: 0,
              kind: 'image',
              label: 'Generated Item',
              value: 'assets/source-bin-item-6.png',
              sourceBinItemId: 'source-bin-item-6',
            },
          ],
        },
      }),
    ];
    const edges: Edge[] = [
      { id: 'edge-1', source: 'image-1', target: 'envelope-1' },
    ];

    const items = collectEnvelopeItemsForEnvelopeNode('envelope-1', nodes, edges);

    expect(items.length).toBe(1);
    expect(items[0].id).toBe('imageGen-envelope-12345-5');
    expect(items[0].sourceBinItemId).toBe('source-bin-item-6');
  });

  it('deduplicates envelope items by matching media asset signatures of data urls and asset urls', () => {
    const nodes = [
      createNode({
        id: 'image-1',
        type: 'imageGen',
        data: {
          envelopeItems: [
            {
              id: 'source-bin-item-7',
              index: 0,
              kind: 'image',
              label: 'Generated Item',
              value: 'data:image/png;base64,abcdefghijklmnopqrstuvwxyz',
              sourceBinItemId: 'source-bin-item-7',
            },
          ],
        },
      }),
      createNode({
        id: 'envelope-1',
        type: 'envelope',
        data: {
          envelopeItems: [
            {
              id: 'imageGen-envelope-12345-6',
              index: 0,
              kind: 'image',
              label: 'Generated Item',
              value: 'data:image/png;base64,abcdefghijklmnopqrstuvwxyz',
            },
          ],
        },
      }),
    ];
    const edges: Edge[] = [
      { id: 'edge-1', source: 'image-1', target: 'envelope-1' },
    ];

    const items = collectEnvelopeItemsForEnvelopeNode('envelope-1', nodes, edges);

    expect(items.length).toBe(1);
    expect(items[0].id).toBe('imageGen-envelope-12345-6');
  });
});
describe('evaluateNodeTextForMonitor', () => {
  it('correctly parses math node edge cases (empty strings, div by zero, modulo by zero)', () => {
    const nodes = [
      createNode({
        id: 'math-add',
        type: 'mathNode',
        data: { operation: '+', valueA: 10, valueB: 20 },
      }),
      createNode({
        id: 'math-div-zero',
        type: 'mathNode',
        data: { operation: '/', valueA: 5, valueB: 0 },
      }),
      createNode({
        id: 'math-mod-zero',
        type: 'mathNode',
        data: { operation: 'modulo', valueA: 5, valueB: 0 },
      }),
      createNode({
        id: 'math-empty',
        type: 'mathNode',
        data: { operation: '+', valueA: '', valueB: '15' },
      }),
    ];

    expect(evaluateNodeTextForMonitor('math-add', nodes, [])).toBe('30');
    expect(evaluateNodeTextForMonitor('math-div-zero', nodes, [])).toBe('0');
    expect(evaluateNodeTextForMonitor('math-mod-zero', nodes, [])).toBe('0');
    expect(evaluateNodeTextForMonitor('math-empty', nodes, [])).toBe('15');
  });

  it('correctly handles Boolean string coercions in logicNode', () => {
    const nodes = [
      createNode({
        id: 'logic-and',
        type: 'logicNode',
        data: { operation: 'AND' },
      }),
      createNode({
        id: 'const-true',
        type: 'textNode',
        data: { prompt: 'TRUE' },
      }),
      createNode({
        id: 'const-one',
        type: 'textNode',
        data: { prompt: '1' },
      }),
    ];
    const edges: Edge[] = [
      { id: 'e1', source: 'const-true', target: 'logic-and', targetHandle: 'A' },
      { id: 'e2', source: 'const-one', target: 'logic-and', targetHandle: 'B' },
    ];

    expect(evaluateNodeTextForMonitor('logic-and', nodes, edges)).toBe('true');
  });

  it('prevents infinite recursion on circular connections in evaluateNodeTextForMonitor', () => {
    const nodes = [
      createNode({ id: 'node-a', type: 'mathNode', data: { operation: '+' } }),
      createNode({ id: 'node-b', type: 'mathNode', data: { operation: '+' } }),
    ];
    const edges: Edge[] = [
      { id: 'ea', source: 'node-a', target: 'node-b', targetHandle: 'A' },
      { id: 'eb', source: 'node-b', target: 'node-a', targetHandle: 'A' },
    ];

    expect(evaluateNodeTextForMonitor('node-a', nodes, edges)).toBe('0');
  });
});
