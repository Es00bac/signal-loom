import { describe, expect, it } from 'vitest';
import type { Edge } from '@xyflow/react';
import type { AppNode } from '../types/flow';
import type { ExecutionContext } from './flowExecution';
import { buildListItemTargetHandle } from './listNodes';
import {
  applyListItemsToExecutionContext,
  buildLoopIterationItems,
  collectListLoopInputs,
  getLoopIterationCount,
  getLoopItemForIteration,
} from './listExecution';

function createNode(node: Partial<AppNode> & Pick<AppNode, 'id' | 'type'>): AppNode {
  return {
    position: { x: 0, y: 0 },
    data: {},
    ...node,
  } as AppNode;
}

const baseContext: ExecutionContext = {
  prompt: 'Base prompt',
  config: {
    aspectRatio: '1:1',
    steps: 30,
    durationSeconds: 6,
    videoResolution: '720p',
    videoFrameRate: 30,
    imageOutputFormat: 'png',
    audioOutputFormat: 'mp3_44100_128',
  },
};

describe('list execution expansion', () => {
  it('feeds text list items into each loop context prompt', () => {
    const nodes = [
      createNode({ id: 'text-1', type: 'textNode', data: { prompt: 'red jacket' } }),
      createNode({ id: 'text-2', type: 'textNode', data: { prompt: 'blue jacket' } }),
      createNode({ id: 'list-1', type: 'list' }),
      createNode({ id: 'image-1', type: 'imageGen' }),
    ];
    const edges: Edge[] = [
      { id: 'edge-1', source: 'text-1', target: 'list-1', targetHandle: buildListItemTargetHandle(0) },
      { id: 'edge-2', source: 'text-2', target: 'list-1', targetHandle: buildListItemTargetHandle(1) },
      { id: 'edge-3', source: 'list-1', target: 'image-1' },
    ];

    const loopInputs = collectListLoopInputs('image-1', nodes, edges);
    const nextContext = applyListItemsToExecutionContext(baseContext, nodes[3], [
      { input: loopInputs[0], item: loopInputs[0].items[1] },
    ]);

    expect(getLoopIterationCount(loopInputs)).toBe(2);
    expect(nextContext.prompt).toBe('Base prompt\n\nblue jacket');
  });

  it('routes image list items by connected video handles', () => {
    const nodes = [
      createNode({ id: 'image-a', type: 'imageGen', data: { result: 'data:image/png;base64,AAA' } }),
      createNode({ id: 'image-b', type: 'imageGen', data: { result: 'data:image/png;base64,BBB' } }),
      createNode({ id: 'list-1', type: 'list' }),
      createNode({ id: 'video-1', type: 'videoGen' }),
    ];
    const edges: Edge[] = [
      { id: 'edge-1', source: 'image-a', target: 'list-1', targetHandle: buildListItemTargetHandle(0) },
      { id: 'edge-2', source: 'image-b', target: 'list-1', targetHandle: buildListItemTargetHandle(1) },
      { id: 'edge-3', source: 'list-1', target: 'video-1', targetHandle: 'video-start-frame' },
    ];

    const loopInputs = collectListLoopInputs('video-1', nodes, edges);
    const nextContext = applyListItemsToExecutionContext(baseContext, nodes[3], [
      { input: loopInputs[0], item: loopInputs[0].items[0] },
    ]);

    expect(nextContext.startImageInput).toBe('data:image/png;base64,AAA');
  });

  it('broadcasts a singleton list across all loop iterations', () => {
    const nodes = [
      createNode({ id: 'text-1', type: 'textNode', data: { prompt: 'line one' } }),
      createNode({ id: 'text-2', type: 'textNode', data: { prompt: 'line two' } }),
      createNode({ id: 'image-a', type: 'imageGen', data: { result: 'data:image/png;base64,AAA' } }),
      createNode({ id: 'text-list', type: 'list' }),
      createNode({ id: 'image-list', type: 'list' }),
      createNode({ id: 'video-1', type: 'videoGen' }),
    ];
    const edges: Edge[] = [
      { id: 'edge-1', source: 'text-1', target: 'text-list', targetHandle: buildListItemTargetHandle(0) },
      { id: 'edge-2', source: 'text-2', target: 'text-list', targetHandle: buildListItemTargetHandle(1) },
      { id: 'edge-3', source: 'image-a', target: 'image-list', targetHandle: buildListItemTargetHandle(0) },
      { id: 'edge-4', source: 'text-list', target: 'video-1', targetHandle: 'video-prompt' },
      { id: 'edge-5', source: 'image-list', target: 'video-1', targetHandle: 'video-start-frame' },
    ];

    const loopInputs = collectListLoopInputs('video-1', nodes, edges);

    expect(getLoopIterationCount(loopInputs)).toBe(2);
    expect(getLoopItemForIteration(loopInputs[0], 0).value).toBe('line one');
    expect(getLoopItemForIteration(loopInputs[0], 1).value).toBe('line two');
    expect(getLoopItemForIteration(loopInputs[1], 0).value).toBe('data:image/png;base64,AAA');
    expect(getLoopItemForIteration(loopInputs[1], 1).value).toBe('data:image/png;base64,AAA');
  });

  it('pairs a singleton start frame with each prompt and end-frame envelope item', () => {
    const nodes = [
      createNode({ id: 'prompt-1', type: 'textNode', data: { prompt: 'move to pose one' } }),
      createNode({ id: 'prompt-2', type: 'textNode', data: { prompt: 'move to pose two' } }),
      createNode({ id: 'start-image', type: 'imageGen', data: { result: 'data:image/png;base64,START' } }),
      createNode({ id: 'prompt-list', type: 'list' }),
      createNode({ id: 'start-list', type: 'list' }),
      createNode({
        id: 'end-envelope',
        type: 'envelope',
        data: {
          envelopeItems: [
            {
              id: 'end-0',
              index: 0,
              kind: 'image',
              label: 'End frame 1',
              value: 'data:image/png;base64,END_A',
              mimeType: 'image/png',
            },
            {
              id: 'end-1',
              index: 1,
              kind: 'image',
              label: 'End frame 2',
              value: 'data:image/png;base64,END_B',
              mimeType: 'image/png',
            },
          ],
        },
      }),
      createNode({ id: 'video-1', type: 'videoGen' }),
    ];
    const edges: Edge[] = [
      { id: 'edge-1', source: 'prompt-1', target: 'prompt-list', targetHandle: buildListItemTargetHandle(0) },
      { id: 'edge-2', source: 'prompt-2', target: 'prompt-list', targetHandle: buildListItemTargetHandle(1) },
      { id: 'edge-3', source: 'start-image', target: 'start-list', targetHandle: buildListItemTargetHandle(0) },
      { id: 'edge-4', source: 'prompt-list', target: 'video-1', targetHandle: 'video-prompt' },
      { id: 'edge-5', source: 'start-list', target: 'video-1', targetHandle: 'video-start-frame' },
      { id: 'edge-6', source: 'end-envelope', target: 'video-1', targetHandle: 'video-end-frame' },
    ];

    const loopInputs = collectListLoopInputs('video-1', nodes, edges);
    const contexts = [0, 1].map((index) =>
      applyListItemsToExecutionContext(
        baseContext,
        nodes[6],
        loopInputs.map((input) => ({
          input,
          item: getLoopItemForIteration(input, index),
        })),
      ),
    );

    expect(getLoopIterationCount(loopInputs)).toBe(2);
    expect(contexts.map((context) => context.startImageInput)).toEqual([
      'data:image/png;base64,START',
      'data:image/png;base64,START',
    ]);
    expect(contexts.map((context) => context.endImageInput)).toEqual([
      'data:image/png;base64,END_A',
      'data:image/png;base64,END_B',
    ]);
    expect(contexts.map((context) => context.prompt)).toEqual([
      'Base prompt\n\nmove to pose one',
      'Base prompt\n\nmove to pose two',
    ]);
  });

  it('rejects list inputs with incompatible lengths', () => {
    const nodes = [
      createNode({ id: 'image-a', type: 'imageGen', data: { result: 'data:image/png;base64,AAA' } }),
      createNode({ id: 'image-b', type: 'imageGen', data: { result: 'data:image/png;base64,BBB' } }),
      createNode({ id: 'image-c', type: 'imageGen', data: { result: 'data:image/png;base64,CCC' } }),
      createNode({ id: 'image-d', type: 'imageGen', data: { result: 'data:image/png;base64,DDD' } }),
      createNode({ id: 'image-e', type: 'imageGen', data: { result: 'data:image/png;base64,EEE' } }),
      createNode({ id: 'image-list-a', type: 'list' }),
      createNode({ id: 'image-list-b', type: 'list' }),
      createNode({ id: 'video-1', type: 'videoGen' }),
    ];
    const edges: Edge[] = [
      { id: 'edge-1', source: 'image-a', target: 'image-list-a', targetHandle: buildListItemTargetHandle(0) },
      { id: 'edge-2', source: 'image-b', target: 'image-list-a', targetHandle: buildListItemTargetHandle(1) },
      { id: 'edge-3', source: 'image-c', target: 'image-list-b', targetHandle: buildListItemTargetHandle(0) },
      { id: 'edge-4', source: 'image-d', target: 'image-list-b', targetHandle: buildListItemTargetHandle(1) },
      { id: 'edge-5', source: 'image-e', target: 'image-list-b', targetHandle: buildListItemTargetHandle(2) },
      { id: 'edge-6', source: 'image-list-a', target: 'video-1', targetHandle: 'video-end-frame' },
      { id: 'edge-7', source: 'image-list-b', target: 'video-1', targetHandle: 'video-source-video' },
    ];

    expect(() => getLoopIterationCount(collectListLoopInputs('video-1', nodes, edges))).toThrow(
      'Connected lists must have the same number of items or a single broadcastable item.',
    );
  });

  it('expands multiple list inputs as all combinations when requested', () => {
    const nodes = [
      createNode({ id: 'start-a', type: 'imageGen', data: { result: 'data:image/png;base64,START_A' } }),
      createNode({ id: 'start-b', type: 'imageGen', data: { result: 'data:image/png;base64,START_B' } }),
      createNode({ id: 'end-a', type: 'imageGen', data: { result: 'data:image/png;base64,END_A' } }),
      createNode({ id: 'end-b', type: 'imageGen', data: { result: 'data:image/png;base64,END_B' } }),
      createNode({ id: 'end-c', type: 'imageGen', data: { result: 'data:image/png;base64,END_C' } }),
      createNode({ id: 'start-list', type: 'list' }),
      createNode({ id: 'end-list', type: 'list' }),
      createNode({ id: 'video-1', type: 'videoGen' }),
    ];
    const edges: Edge[] = [
      { id: 'edge-1', source: 'start-a', target: 'start-list', targetHandle: buildListItemTargetHandle(0) },
      { id: 'edge-2', source: 'start-b', target: 'start-list', targetHandle: buildListItemTargetHandle(1) },
      { id: 'edge-3', source: 'end-a', target: 'end-list', targetHandle: buildListItemTargetHandle(0) },
      { id: 'edge-4', source: 'end-b', target: 'end-list', targetHandle: buildListItemTargetHandle(1) },
      { id: 'edge-5', source: 'end-c', target: 'end-list', targetHandle: buildListItemTargetHandle(2) },
      { id: 'edge-6', source: 'start-list', target: 'video-1', targetHandle: 'video-start-frame' },
      { id: 'edge-7', source: 'end-list', target: 'video-1', targetHandle: 'video-end-frame' },
    ];

    const loopInputs = collectListLoopInputs('video-1', nodes, edges);
    const contexts = Array.from({ length: getLoopIterationCount(loopInputs, 'allCombinations') }, (_, index) =>
      applyListItemsToExecutionContext(
        baseContext,
        nodes[7],
        buildLoopIterationItems(loopInputs, index, 'allCombinations'),
      ),
    );

    expect(() => getLoopIterationCount(loopInputs)).toThrow(
      'Connected lists must have the same number of items or a single broadcastable item.',
    );
    expect(getLoopIterationCount(loopInputs, 'allCombinations')).toBe(6);
    expect(contexts.map((context) => [context.startImageInput, context.endImageInput])).toEqual([
      ['data:image/png;base64,START_A', 'data:image/png;base64,END_A'],
      ['data:image/png;base64,START_A', 'data:image/png;base64,END_B'],
      ['data:image/png;base64,START_A', 'data:image/png;base64,END_C'],
      ['data:image/png;base64,START_B', 'data:image/png;base64,END_A'],
      ['data:image/png;base64,START_B', 'data:image/png;base64,END_B'],
      ['data:image/png;base64,START_B', 'data:image/png;base64,END_C'],
    ]);
  });

  it('accepts envelope-driven loop inputs for video frame handles', () => {
    const nodes = [
      createNode({
        id: 'envelope-1',
        type: 'envelope',
        data: {
          envelopeItems: [
            {
              id: 'img-0',
              index: 0,
              kind: 'image',
              label: 'Frame 1',
              value: 'data:image/png;base64:AAA',
              mimeType: 'image/png',
            },
            {
              id: 'img-1',
              index: 1,
              kind: 'image',
              label: 'Frame 2',
              value: 'data:image/png;base64:BBB',
              mimeType: 'image/png',
            },
          ],
        },
      }),
      createNode({ id: 'video-1', type: 'videoGen' }),
    ];
    const edges = [
      { id: 'edge-1', source: 'envelope-1', target: 'video-1', targetHandle: 'video-start-frame' },
      { id: 'edge-2', source: 'envelope-1', target: 'video-1', targetHandle: 'video-end-frame' },
    ];

    const loopInputs = collectListLoopInputs('video-1', nodes, edges);

    expect(getLoopIterationCount(loopInputs)).toBe(2);
    expect(loopInputs[0].items.map((item) => item.value)).toEqual([
      'data:image/png;base64:AAA',
      'data:image/png;base64:BBB',
    ]);

    const iterateContext = (index: number) =>
      applyListItemsToExecutionContext(
        baseContext,
        nodes[1],
        loopInputs.map((input) => ({
          input,
          item: getLoopItemForIteration(input, index),
        })),
      );

    const startContext0 = iterateContext(0);
    const startContext1 = iterateContext(1);

    expect(startContext0.startImageInput).toBe('data:image/png;base64:AAA');
    expect(startContext1.startImageInput).toBe('data:image/png;base64:BBB');
    expect(startContext0.endImageInput).toBe('data:image/png;base64:AAA');
    expect(startContext1.endImageInput).toBe('data:image/png;base64:BBB');
  });
});
