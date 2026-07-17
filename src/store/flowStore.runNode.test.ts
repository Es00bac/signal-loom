// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Edge } from '@xyflow/react';
import type { AppNode, RuntimeSettingsSnapshot } from '../types/flow';
import type { ExecutionContext } from '../lib/flowExecution';
import { executeNodeRequest, hashExecutionParameters } from '../lib/flowExecution';
import { buildListItemTargetHandle } from '../lib/listNodes';
import { buildMinimalIsoBmffFixture } from '../lib/isoBmffResumeFixtures.testSupport';
import { useFlowStore } from './flowStore';
import { useConfirmationStore } from './confirmationStore';
import { useSettingsStore } from './settingsStore';
import { useSourceBinStore } from './sourceBinStore';

const capturedContexts: {
  nodeId: string;
  context: ExecutionContext;
  index: number;
  provider: unknown;
  modelId: unknown;
  settings: RuntimeSettingsSnapshot;
}[] = [];

function imageResultDataUrl(nodeId: string, index: number): string {
  const png = Uint8Array.from(
    atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='),
    (character) => character.charCodeAt(0),
  );
  const payload = new TextEncoder().encode(`Result\0${nodeId}:${index}`);
  const chunk = new Uint8Array(12 + payload.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, payload.length);
  chunk.set([0x74, 0x45, 0x58, 0x74], 4);
  chunk.set(payload, 8);
  let crc = 0xffffffff;
  for (const byte of chunk.subarray(4, 8 + payload.length)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  view.setUint32(8 + payload.length, (crc ^ 0xffffffff) >>> 0);
  const bytes = new Uint8Array(png.length + chunk.length);
  bytes.set(png.subarray(0, 33));
  bytes.set(chunk, 33);
  bytes.set(png.subarray(33), 33 + chunk.length);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:image/png;base64,${btoa(binary)}`;
}

function videoResultDataUrl(): string {
  let binary = '';
  for (const byte of buildMinimalIsoBmffFixture()) binary += String.fromCharCode(byte);
  return `data:video/mp4;base64,${btoa(binary)}`;
}

vi.mock('../lib/flowExecution', async () => {
  const actual = await vi.importActual<typeof import('../lib/flowExecution')>('../lib/flowExecution');
  return {
    ...actual,
    hashExecutionParameters: vi.fn(actual.hashExecutionParameters),
    executeNodeRequest: vi.fn(async (node: AppNode, context: ExecutionContext, settings: RuntimeSettingsSnapshot) => {
      capturedContexts.push({
        nodeId: node.id,
        context,
        index: capturedContexts.length,
        provider: node.data.provider,
        modelId: node.data.modelId,
        settings,
      });
      const resultType = node.type === 'imageGen' ? 'image' : node.type === 'videoGen' ? 'video' : 'text';
      return {
        result: resultType === 'image'
          ? imageResultDataUrl(node.id, capturedContexts.length)
          : resultType === 'video'
            ? videoResultDataUrl()
            : `result-${node.id}-${capturedContexts.length}`,
        resultType,
        statusMessage: 'Done',
      };
    }),
  };
});

function createNode(id: string, type: AppNode['type'], data: Record<string, unknown> = {}): AppNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data,
  } as AppNode;
}

function createTextEnvelopeNode(id: string, values: string[]) {
  return createNode(id, 'envelope', {
    envelopeItemKind: 'text',
    envelopeItems: values.map((value, index) => ({
      id: `${id}-${index}`,
      index,
      kind: 'text',
      label: `Prompt ${index + 1}`,
      value,
    })),
  });
}

function createImageEnvelopeNode(id: string, values: string[]) {
  return createNode(id, 'envelope', {
    envelopeItemKind: 'image',
    envelopeItems: values.map((value, index) => ({
      id: `${id}-${index}`,
      index,
      kind: 'image',
      label: `Image ${index + 1}`,
      value,
      mimeType: 'image/png',
    })),
  });
}

function createEmptyEnvelopeNode(id: string, kind: 'text' | 'image') {
  return createNode(id, 'envelope', {
    envelopeItemKind: kind,
    envelopeItems: [],
  });
}

function createTypedEnvelopeNode(id: string, kind: 'text' | 'number' | 'boolean' | 'json' | 'package', values: readonly string[]) {
  return createNode(id, 'envelope', {
    envelopeItemKind: kind,
    envelopeItems: values.map((value, index) => ({
      id: `${id}-${index}`,
      index,
      kind,
      label: `${kind} ${index + 1}`,
      value,
    })),
  });
}

function createTypedListGraph(
  id: string,
  kind: 'number' | 'boolean' | 'json' | 'package',
  values: readonly string[],
): { nodes: AppNode[]; edges: Edge[]; list: AppNode } {
  const list = createNode(id, 'list', { envelopeItemKind: kind });
  const nodes: AppNode[] = [list];
  const edges: Edge[] = [];

  values.forEach((value, index) => {
    let source: AppNode;
    if (kind === 'number') {
      source = createNode(`${id}-value-${index}`, 'numberNode', { value: Number(value) });
    } else if (kind === 'boolean' || kind === 'json') {
      source = createNode(`${id}-value-${index}`, 'valueNode', { valueKind: kind, value });
    } else {
      const text = createNode(`${id}-text-${index}`, 'textNode', { mode: 'prompt', prompt: value });
      source = createNode(`${id}-package-${index}`, 'packageNode');
      nodes.push(text);
      edges.push({
        id: `${id}-text-package-${index}`,
        source: text.id,
        target: source.id,
        targetHandle: 'text',
      });
    }
    nodes.push(source);
    edges.push({
      id: `${id}-list-${index}`,
      source: source.id,
      target: list.id,
      targetHandle: buildListItemTargetHandle(index),
    });
  });

  return { nodes, edges, list };
}

function patchSourceBinItem(
  itemId: string,
  patch: Partial<ReturnType<typeof useSourceBinStore.getState>['bins'][number]['items'][number]>,
): void {
  useSourceBinStore.setState((state) => ({
    bins: state.bins.map((bin) => ({
      ...bin,
      items: bin.items.map((item) => item.id === itemId ? { ...item, ...patch } : item),
    })),
  }));
}

function addRawSourceBinItem(
  item: ReturnType<typeof useSourceBinStore.getState>['bins'][number]['items'][number],
): void {
  useSourceBinStore.setState((state) => ({
    bins: state.bins.map((bin, index) => (
      index === 0 ? { ...bin, items: [item, ...bin.items] } : bin
    )),
  }));
}

async function findHashedEnvelopeId(
  predicate: (nodeData: Record<string, unknown>, context: ExecutionContext) => boolean,
): Promise<string> {
  const hashMock = vi.mocked(hashExecutionParameters);
  const index = hashMock.mock.calls.findIndex(([nodeData, context]) => (
    predicate(nodeData as Record<string, unknown>, context)
  ));
  if (index < 0) {
    throw new Error('Expected execution hash call was not captured.');
  }
  return await hashMock.mock.results[index].value;
}

function plannedProviderCallCount(message: string): number {
  return [...message.matchAll(/(\d+) provider call/g)]
    .reduce((total, match) => total + Number(match[1]), 0);
}

const baselineRuntimeSettings: RuntimeSettingsSnapshot = {
  apiKeys: { ...useSettingsStore.getState().apiKeys },
  defaultModels: {
    text: { ...useSettingsStore.getState().defaultModels.text },
    image: { ...useSettingsStore.getState().defaultModels.image },
    video: { ...useSettingsStore.getState().defaultModels.video },
    audio: { ...useSettingsStore.getState().defaultModels.audio },
  },
  providerSettings: { ...useSettingsStore.getState().providerSettings },
};

describe('runNode list expansion regression (FBL-017 follow-up)', () => {
  let requestConfirmationSpy: ReturnType<typeof vi.fn<(message: string, title?: string) => Promise<boolean>>>;

  beforeEach(() => {
    useFlowStore.setState({
      nodes: [],
      edges: [],
      bookmarkSidebarOpen: true,
    });
    useSourceBinStore.setState({
      bins: [{
        id: 'default',
        name: 'Source Library',
        collapsed: false,
        createdAt: Date.now(),
        items: [],
      }],
      dismissedSourceKeys: [],
      sidebarOpen: true,
    });
    requestConfirmationSpy = vi.fn<(message: string, title?: string) => Promise<boolean>>(() => Promise.resolve(true));
    useConfirmationStore.setState({
      activeRequest: null,
      requestConfirmation: requestConfirmationSpy,
      respond: () => {},
    });
    capturedContexts.length = 0;
  });

  afterEach(() => {
    useSettingsStore.setState({
      apiKeys: { ...baselineRuntimeSettings.apiKeys },
      defaultModels: {
        text: { ...baselineRuntimeSettings.defaultModels.text },
        image: { ...baselineRuntimeSettings.defaultModels.image },
        video: { ...baselineRuntimeSettings.defaultModels.video },
        audio: { ...baselineRuntimeSettings.defaultModels.audio },
      },
      providerSettings: { ...baselineRuntimeSettings.providerSettings },
    });
    vi.clearAllMocks();
  });

  it('runs a text envelope prompt in allCombinations exactly N times, not N squared', async () => {
    const textEnvelope = createTextEnvelopeNode('text-env', ['red', 'blue', 'green']);
    const target = createNode('target', 'imageGen', {
      mediaMode: 'generate',
      provider: 'bfl',
      modelId: 'flux-2-pro',
      listLoopMode: 'allCombinations',
    });

    const edges: Edge[] = [
      { id: 'edge-env-target', source: textEnvelope.id, target: target.id },
    ];

    useFlowStore.setState({ nodes: [textEnvelope, target], edges });

    await useFlowStore.getState().runNode(target.id);

    expect(capturedContexts).toHaveLength(3);
    const prompts = capturedContexts.map((record) => record.context.prompt);
    expect(prompts).toEqual(['red', 'blue', 'green']);
  });

  it('runs the Cartesian product for image envelope 2 × text envelope prompt 3', async () => {
    const imageEnvelope = createImageEnvelopeNode('image-env', [
      'data:image/png;base64,A',
      'data:image/png;base64,B',
    ]);
    const textEnvelope = createTextEnvelopeNode('text-env', ['wide', 'tall', 'square']);
    const target = createNode('target', 'imageGen', {
      mediaMode: 'generate',
      provider: 'bfl',
      modelId: 'flux-2-pro',
      listLoopMode: 'allCombinations',
    });

    const edges: Edge[] = [
      { id: 'edge-image-env', source: imageEnvelope.id, target: target.id, targetHandle: 'image-edit-source' },
      { id: 'edge-text-env', source: textEnvelope.id, target: target.id },
    ];

    useFlowStore.setState({ nodes: [imageEnvelope, textEnvelope, target], edges });

    await useFlowStore.getState().runNode(target.id);

    expect(capturedContexts).toHaveLength(6);
    const pairs = capturedContexts.map((record) => ({
      prompt: record.context.prompt,
      image: record.context.editImageInput,
    }));

    const expectedPairs = [
      { prompt: 'wide', image: 'data:image/png;base64,A' },
      { prompt: 'wide', image: 'data:image/png;base64,B' },
      { prompt: 'tall', image: 'data:image/png;base64,A' },
      { prompt: 'tall', image: 'data:image/png;base64,B' },
      { prompt: 'square', image: 'data:image/png;base64,A' },
      { prompt: 'square', image: 'data:image/png;base64,B' },
    ];
    expect(pairs).toEqual(expectedPairs);
  });

  it('keeps the ordinary single-run path with undefined envelopeItems when no lists are present', async () => {
    const prompt = createNode('prompt', 'textNode', { mode: 'prompt', prompt: 'a single prompt' });
    const target = createNode('target', 'imageGen', {
      mediaMode: 'generate',
      provider: 'bfl',
      modelId: 'flux-2-pro',
      listLoopMode: 'allCombinations',
    });

    const edges: Edge[] = [
      { id: 'edge-prompt-target', source: prompt.id, target: target.id },
    ];

    useFlowStore.setState({ nodes: [prompt, target], edges });

    await useFlowStore.getState().runNode(target.id);

    expect(capturedContexts).toHaveLength(1);
    expect(capturedContexts[0].context.prompt).toBe('a single prompt');

    const finalTarget = useFlowStore.getState().nodes.find((node) => node.id === target.id);
    expect(finalTarget?.data.envelopeItems).toBeUndefined();
  });

  describe('single-item textual prompt envelopes', () => {
    it.each([
      ['text', ['red'], 'red'],
      ['number', ['42'], '42'],
      ['boolean', ['true'], 'true'],
      ['json', ['{"key":"value"}'], '{"key":"value"}'],
      ['package', ['pkg:abc'], 'pkg:abc'],
    ] as const)('%s envelope produces one exact prompt and no envelope item', async (kind, values, expectedPrompt) => {
      const envelope = createTypedEnvelopeNode('env', kind, values);
      const target = createNode('target', 'imageGen', {
        mediaMode: 'generate',
        provider: 'bfl',
        modelId: 'flux-2-pro',
        listLoopMode: 'allCombinations',
      });

      useFlowStore.setState({
        nodes: [envelope, target],
        edges: [{ id: 'edge-env-target', source: envelope.id, target: target.id }],
      });

      await useFlowStore.getState().runNode(target.id);

      expect(capturedContexts).toHaveLength(1);
      expect(capturedContexts[0].context.prompt).toBe(expectedPrompt);

      const finalTarget = useFlowStore.getState().nodes.find((node) => node.id === target.id);
      expect(finalTarget?.data.envelopeItems).toBeUndefined();
      expect(finalTarget?.data.result).toBeDefined();
    });
  });

  describe('three-item non-text textual prompt envelopes do not double-count', () => {
    it.each([
      ['number', ['1', '2', '3']],
      ['boolean', ['true', 'false', 'true']],
      ['json', ['{"a":1}', '{"b":2}', '{"c":3}']],
      ['package', ['pkg:a', 'pkg:b', 'pkg:c']],
    ] as const)('%s envelope runs exactly 3 times', async (kind, values) => {
      const envelope = createTypedEnvelopeNode('env', kind, values);
      const target = createNode('target', 'imageGen', {
        mediaMode: 'generate',
        provider: 'bfl',
        modelId: 'flux-2-pro',
        listLoopMode: 'allCombinations',
      });

      useFlowStore.setState({
        nodes: [envelope, target],
        edges: [{ id: 'edge-env-target', source: envelope.id, target: target.id }],
      });

      await useFlowStore.getState().runNode(target.id);

      expect(capturedContexts).toHaveLength(3);
      expect(capturedContexts.map((record) => record.context.prompt)).toEqual(values);

      const finalTarget = useFlowStore.getState().nodes.find((node) => node.id === target.id);
      expect(finalTarget?.data.envelopeItems).toHaveLength(3);
    });
  });

  it.each([
    ['number', ['1', '2', '3']],
    ['boolean', ['true', 'false', 'true']],
    ['json', ['{"a":1}', '{"b":2}', '{"c":3}']],
    ['package', ['pkg:a', 'pkg:b', 'pkg:c']],
  ] as const)('requests final consent for a paid unknown-price Image target before a %s envelope call', async (kind, values) => {
    const envelope = createTypedEnvelopeNode('env', kind, values);
    const target = createNode('target', 'imageGen', {
      mediaMode: 'generate',
      provider: 'byteplus',
      modelId: 'seedream-5-0-260128',
      listLoopMode: 'allCombinations',
    });
    let providerCallsAtConfirmation = -1;
    requestConfirmationSpy.mockImplementation(async () => {
      providerCallsAtConfirmation = capturedContexts.length;
      return true;
    });
    useFlowStore.setState({
      nodes: [envelope, target],
      edges: [{ id: 'edge-env-target', source: envelope.id, target: target.id }],
    });

    await useFlowStore.getState().runNode(target.id);

    expect(providerCallsAtConfirmation).toBe(0);
    expect(capturedContexts).toHaveLength(3);
    expect(requestConfirmationSpy).toHaveBeenCalledTimes(1);
    expect(requestConfirmationSpy).toHaveBeenCalledWith(
      expect.stringMatching(/Target imageGen.*3 provider calls.*3 unknown-rate models/s),
      'Final Run Cost Confirmation',
    );
  });

  it.each([
    ['number', ['1', '2', '3']],
    ['boolean', ['true', 'false', 'true']],
    ['json', ['{"a":1}', '{"b":2}', '{"c":3}']],
    ['package', ['pkg:a', 'pkg:b', 'pkg:c']],
  ] as const)('requests final consent before a paid Image target consumes a 3-item %s list', async (kind, values) => {
    const graph = createTypedListGraph('values', kind, values);
    const target = createNode('target', 'imageGen', {
      mediaMode: 'generate',
      provider: 'byteplus',
      modelId: 'seedream-5-0-260128',
      listLoopMode: 'allCombinations',
    });
    let providerCallsAtConfirmation = -1;
    requestConfirmationSpy.mockImplementation(async () => {
      providerCallsAtConfirmation = capturedContexts.length;
      return true;
    });
    useFlowStore.setState({
      nodes: [...graph.nodes, target],
      edges: [
        ...graph.edges,
        { id: 'values-target', source: graph.list.id, target: target.id },
      ],
    });

    await useFlowStore.getState().runNode(target.id);

    expect(providerCallsAtConfirmation).toBe(0);
    expect(capturedContexts.filter((record) => record.nodeId === target.id)).toHaveLength(3);
    expect(requestConfirmationSpy).toHaveBeenCalledTimes(1);
    expect(requestConfirmationSpy).toHaveBeenCalledWith(
      expect.stringContaining('3 unknown-rate models'),
      'Final Run Cost Confirmation',
    );
  });

  it('declining the final plan prevents both a fresh paid Text dependency and its paid target', async () => {
    const prompts = createTextEnvelopeNode('prompts', ['short', 'medium prompt', 'the longest prompt in the dependency batch']);
    const dependency = createNode('dependency', 'textNode', {
      mode: 'generate',
      provider: 'gemini',
      modelId: 'gemini-3.5-flash',
      listLoopMode: 'allCombinations',
    });
    const target = createNode('target', 'imageGen', {
      mediaMode: 'generate',
      provider: 'bfl',
      modelId: 'flux-2-pro',
      listLoopMode: 'allCombinations',
    });
    requestConfirmationSpy.mockResolvedValue(false);
    useFlowStore.setState({
      nodes: [prompts, dependency, target],
      edges: [
        { id: 'prompts-dependency', source: prompts.id, target: dependency.id },
        { id: 'dependency-target', source: dependency.id, target: target.id },
      ],
    });

    await useFlowStore.getState().runNode(target.id);

    expect(capturedContexts).toHaveLength(0);
    expect(vi.mocked(executeNodeRequest)).not.toHaveBeenCalled();
    expect(requestConfirmationSpy).toHaveBeenCalledTimes(1);
    const [message, title] = requestConfirmationSpy.mock.calls[0];
    expect(title).toBe('Final Run Cost Confirmation');
    expect(message).toMatch(/Dependency textNode.*3 provider calls/s);
    expect(message).toMatch(/Target imageGen.*3 provider calls/s);
  });

  it('approves a fresh paid Text dependency and its target with one distinguished final plan', async () => {
    const prompts = createTextEnvelopeNode('prompts', ['one', 'two', 'three']);
    const dependency = createNode('dependency', 'textNode', {
      mode: 'generate',
      provider: 'gemini',
      modelId: 'gemini-3.5-flash',
      listLoopMode: 'allCombinations',
    });
    const target = createNode('target', 'imageGen', {
      mediaMode: 'generate',
      provider: 'bfl',
      modelId: 'flux-2-pro',
      listLoopMode: 'allCombinations',
    });
    let providerCallsAtConfirmation = -1;
    requestConfirmationSpy.mockImplementation(async () => {
      providerCallsAtConfirmation = capturedContexts.length;
      return true;
    });
    useFlowStore.setState({
      nodes: [prompts, dependency, target],
      edges: [
        { id: 'prompts-dependency', source: prompts.id, target: dependency.id },
        { id: 'dependency-target', source: dependency.id, target: target.id },
      ],
    });

    await useFlowStore.getState().runNode(target.id);

    expect(providerCallsAtConfirmation).toBe(0);
    expect(capturedContexts.filter((record) => record.nodeId === dependency.id)).toHaveLength(3);
    expect(capturedContexts.filter((record) => record.nodeId === target.id)).toHaveLength(3);
    expect(requestConfirmationSpy).toHaveBeenCalledTimes(1);
    const [message, title] = requestConfirmationSpy.mock.calls[0];
    expect(title).toBe('Final Run Cost Confirmation');
    expect(message).toMatch(/Dependency textNode.*3 provider calls/s);
    expect(message).toMatch(/Target imageGen.*3 provider calls/s);
  });

  it('aggregates unequal prompt estimates per target iteration instead of multiplying a joined batch', async () => {
    const prompts = createTextEnvelopeNode('prompts', ['a', 'b'.repeat(40), 'c'.repeat(400)]);
    const target = createNode('target', 'imageGen', {
      mediaMode: 'generate',
      provider: 'bfl',
      modelId: 'flux-2-pro',
      listLoopMode: 'allCombinations',
    });
    useFlowStore.setState({
      nodes: [prompts, target],
      edges: [{ id: 'prompts-target', source: prompts.id, target: target.id }],
    });

    await useFlowStore.getState().runNode(target.id);

    expect(requestConfirmationSpy).toHaveBeenCalledTimes(1);
    const [message] = requestConfirmationSpy.mock.calls[0];
    expect(message).toContain('111 in / 0 out');
    expect(message).not.toContain('336 in / 0 out');
  });

  it('makes zero provider calls when a connected list is empty', async () => {
    const emptyTextEnvelope = createEmptyEnvelopeNode('empty-text', 'text');
    const emptyImageEnvelope = createEmptyEnvelopeNode('empty-image', 'image');
    const target = createNode('target', 'imageGen', {
      mediaMode: 'generate',
      provider: 'bfl',
      modelId: 'flux-2-pro',
      listLoopMode: 'allCombinations',
    });

    useFlowStore.setState({
      nodes: [emptyTextEnvelope, emptyImageEnvelope, target],
      edges: [
        { id: 'edge-text', source: emptyTextEnvelope.id, target: target.id },
        { id: 'edge-image', source: emptyImageEnvelope.id, target: target.id, targetHandle: 'image-edit-source' },
      ],
    });

    await useFlowStore.getState().runNode(target.id);

    expect(capturedContexts).toHaveLength(0);

    const finalTarget = useFlowStore.getState().nodes.find((node) => node.id === target.id);
    expect(finalTarget?.data.envelopeItems).toBeUndefined();
    expect(finalTarget?.data.statusMessage).toContain('did not contain any runnable items');
  });

  it.each(['paired', 'allCombinations'] as const)(
    'treats an empty plus nonempty prompt axis as zero runnable items in %s mode',
    async (listLoopMode) => {
      const empty = createEmptyEnvelopeNode('empty', 'text');
      const nonempty = createTextEnvelopeNode('nonempty', ['one', 'two', 'three']);
      const target = createNode('target', 'imageGen', {
        mediaMode: 'generate',
        provider: 'bfl',
        modelId: 'flux-2-pro',
        listLoopMode,
      });
      useFlowStore.setState({
        nodes: [empty, nonempty, target],
        edges: [
          { id: 'empty-target', source: empty.id, target: target.id },
          { id: 'nonempty-target', source: nonempty.id, target: target.id },
        ],
      });

      await useFlowStore.getState().runNode(target.id);

      expect(capturedContexts).toHaveLength(0);
      expect(requestConfirmationSpy).not.toHaveBeenCalled();
      const finalTarget = useFlowStore.getState().nodes.find((node) => node.id === target.id);
      expect(finalTarget?.data.error).toBeUndefined();
      expect(finalTarget?.data.statusMessage).toContain('did not contain any runnable items');
    },
  );

  it('broadcasts a single image across a 3-item text prompt in paired mode', async () => {
    const imageEnvelope = createImageEnvelopeNode('image-env', ['data:image/png;base64,ONLY']);
    const textEnvelope = createTextEnvelopeNode('text-env', ['wide', 'tall', 'square']);
    const target = createNode('target', 'imageGen', {
      mediaMode: 'generate',
      provider: 'bfl',
      modelId: 'flux-2-pro',
      listLoopMode: 'paired',
    });

    useFlowStore.setState({
      nodes: [imageEnvelope, textEnvelope, target],
      edges: [
        { id: 'edge-image', source: imageEnvelope.id, target: target.id, targetHandle: 'image-edit-source' },
        { id: 'edge-text', source: textEnvelope.id, target: target.id },
      ],
    });

    await useFlowStore.getState().runNode(target.id);

    expect(capturedContexts).toHaveLength(3);
    expect(capturedContexts.every((record) => record.context.editImageInput === 'data:image/png;base64,ONLY')).toBe(true);
    expect(capturedContexts.map((record) => record.context.prompt)).toEqual(['wide', 'tall', 'square']);
  });

  it('throws when paired lengths are incompatible', async () => {
    const imageEnvelope = createImageEnvelopeNode('image-env', ['data:image/png;base64,A', 'data:image/png;base64,B']);
    const textEnvelope = createTextEnvelopeNode('text-env', ['wide', 'tall', 'square']);
    const target = createNode('target', 'imageGen', {
      mediaMode: 'generate',
      provider: 'bfl',
      modelId: 'flux-2-pro',
      listLoopMode: 'paired',
    });

    useFlowStore.setState({
      nodes: [imageEnvelope, textEnvelope, target],
      edges: [
        { id: 'edge-image', source: imageEnvelope.id, target: target.id, targetHandle: 'image-edit-source' },
        { id: 'edge-text', source: textEnvelope.id, target: target.id },
      ],
    });

    await useFlowStore.getState().runNode(target.id);

    expect(capturedContexts).toHaveLength(0);
    const finalTarget = useFlowStore.getState().nodes.find((node) => node.id === target.id);
    expect(finalTarget?.data.error).toContain('must have the same length');
  });

  describe('Source Bin resume and cost confirmation', () => {
    it('resumes every iteration when all outputs are already in the Source Bin', async () => {
      const textEnvelope = createTextEnvelopeNode('text-env', ['red', 'blue', 'green']);
      const target = createNode('target', 'imageGen', {
        mediaMode: 'generate',
        provider: 'bfl',
        modelId: 'flux-2-pro',
        listLoopMode: 'allCombinations',
      });

      useFlowStore.setState({
        nodes: [textEnvelope, target],
        edges: [{ id: 'edge-text', source: textEnvelope.id, target: target.id }],
      });

      // First run populates Source Bin.
      await useFlowStore.getState().runNode(target.id);
      expect(capturedContexts).toHaveLength(3);
      const firstRunItems = useSourceBinStore.getState().getAllItems();
      expect(firstRunItems).toHaveLength(3);

      // Reset and run again.
      capturedContexts.length = 0;
      vi.mocked(executeNodeRequest).mockClear();
      requestConfirmationSpy.mockClear();

      await useFlowStore.getState().runNode(target.id);

      expect(capturedContexts).toHaveLength(0);
      expect(vi.mocked(executeNodeRequest)).not.toHaveBeenCalled();

      const finalTarget = useFlowStore.getState().nodes.find((node) => node.id === target.id);
      expect(finalTarget?.data.envelopeItems).toHaveLength(3);

      // Stable envelopeId/envelopeIndex matching.
      const resumedItems = useSourceBinStore.getState().getAllItems();
      expect(resumedItems).toHaveLength(3);
      for (const item of resumedItems) {
        expect(item.envelopeId).toBeDefined();
        expect(typeof item.envelopeIndex).toBe('number');
      }

      // Fully resumed paid work needs no spend confirmation.
      expect(requestConfirmationSpy).not.toHaveBeenCalled();
    });

    it('cost-confirms only the remaining paid iterations after a partial Source Bin resume', async () => {
      const textEnvelope = createTextEnvelopeNode('text-env', ['red', 'blue', 'green']);
      const target = createNode('target', 'imageGen', {
        mediaMode: 'generate',
        provider: 'bfl',
        modelId: 'flux-2-pro',
        listLoopMode: 'allCombinations',
      });

      useFlowStore.setState({
        nodes: [textEnvelope, target],
        edges: [{ id: 'edge-text', source: textEnvelope.id, target: target.id }],
      });

      // First run populates Source Bin.
      await useFlowStore.getState().runNode(target.id);
      const firstRunItems = useSourceBinStore.getState().getAllItems();
      expect(firstRunItems).toHaveLength(3);

      // Remove one item so only two can be resumed.
      const removed = firstRunItems[1];
      useSourceBinStore.getState().removeItem(removed.id);

      capturedContexts.length = 0;
      vi.mocked(executeNodeRequest).mockClear();
      requestConfirmationSpy.mockClear();

      await useFlowStore.getState().runNode(target.id);

      // One new provider call for the missing iteration.
      expect(capturedContexts).toHaveLength(1);
      expect(vi.mocked(executeNodeRequest)).toHaveBeenCalledTimes(1);

      const finalTarget = useFlowStore.getState().nodes.find((node) => node.id === target.id);
      expect(finalTarget?.data.envelopeItems).toHaveLength(3);

      expect(requestConfirmationSpy).toHaveBeenCalledTimes(1);
      expect(requestConfirmationSpy).toHaveBeenCalledWith(
        expect.stringContaining('1 provider call'),
        'Final Run Cost Confirmation',
      );
    });

    it.each([
      ['missing payload', {
        assetId: undefined,
        assetUrl: undefined,
        scratchFileName: undefined,
        nativeFilePath: undefined,
      }],
      ['corrupt data payload', {
        assetId: undefined,
        assetUrl: 'data:image/png;base64,%%%',
        scratchFileName: undefined,
        nativeFilePath: undefined,
      }],
      ['the exact 33-byte truncated-container PNG probe', {
        assetId: undefined,
        assetUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAAAAAA',
        scratchFileName: undefined,
        nativeFilePath: undefined,
      }],
      ['kind mismatch', {
        kind: 'video' as const,
        mimeType: 'video/mp4',
        assetId: undefined,
        assetUrl: 'data:video/mp4;base64,AAAA',
        scratchFileName: undefined,
        nativeFilePath: undefined,
      }],
    ])('reruns and re-consents exactly one invalid direct cached iteration: %s', async (_label, invalidPatch) => {
      const prompts = createTextEnvelopeNode('prompts', ['one', 'two', 'three']);
      const target = createNode('target', 'imageGen', {
        mediaMode: 'generate',
        provider: 'bfl',
        modelId: 'flux-2-pro',
        listLoopMode: 'allCombinations',
      });
      useFlowStore.setState({
        nodes: [prompts, target],
        edges: [{ id: 'prompts-target', source: prompts.id, target: target.id }],
      });

      await useFlowStore.getState().runNode(target.id);
      const generatedItems = useSourceBinStore.getState().getAllItems();
      expect(generatedItems).toHaveLength(3);
      patchSourceBinItem(generatedItems[2].id, invalidPatch);

      capturedContexts.length = 0;
      vi.mocked(executeNodeRequest).mockClear();
      requestConfirmationSpy.mockClear();
      await useFlowStore.getState().runNode(target.id);

      expect(capturedContexts.map((record) => record.nodeId)).toEqual([target.id]);
      expect(requestConfirmationSpy).toHaveBeenCalledTimes(1);
      expect(requestConfirmationSpy.mock.calls[0][0]).toContain('1 provider call');
      const finalTarget = useFlowStore.getState().nodes.find((node) => node.id === target.id);
      expect(finalTarget?.data.envelopeItems).toHaveLength(3);
      expect(finalTarget?.data.envelopeItems?.every((item) => (
        item.kind === 'image' && item.value.trim().length > 0
      ))).toBe(true);
      expect(finalTarget?.data.envelopeItems?.some((item) => item.value === '')).toBe(false);
      expect(finalTarget?.data.envelopeItems?.some((item) => item.value === invalidPatch.assetUrl)).toBe(false);
      expect(finalTarget?.data.statusMessage).not.toContain('Resumed');
    });

    it('reruns and re-consents for the exact 57-byte Terra skeleton in a matching video cache entry', async () => {
      const prompts = createTextEnvelopeNode('video-prompts', ['one', 'two', 'three']);
      const target = createNode('video-target', 'videoGen', {
        mediaMode: 'generate',
        provider: 'gemini',
        modelId: 'veo-3.1-fast-generate-preview',
        listLoopMode: 'allCombinations',
      });
      useFlowStore.setState({
        nodes: [prompts, target],
        edges: [{ id: 'video-prompts-target', source: prompts.id, target: target.id, targetHandle: 'video-prompt' }],
      });

      await useFlowStore.getState().runNode(target.id);
      const firstVideoTarget = useFlowStore.getState().nodes.find((node) => node.id === target.id);
      expect(firstVideoTarget?.data.error).toBeUndefined();
      expect(capturedContexts).toHaveLength(3);
      const generatedItems = useSourceBinStore.getState().getAllItems();
      expect(generatedItems).toHaveLength(3);
      const skeletonUrl = 'data:video/mp4;base64,AAAAFGZ0eXBpc29tAAAAAGlzb20AAAAcbW9vdgAAABRoZGxyAAAAAAAAAAB2aWRlAAAACW1kYXQB';
      patchSourceBinItem(generatedItems[2].id, { assetUrl: skeletonUrl });

      capturedContexts.length = 0;
      vi.mocked(executeNodeRequest).mockClear();
      requestConfirmationSpy.mockClear();
      await useFlowStore.getState().runNode(target.id);

      expect(capturedContexts.map((record) => record.nodeId)).toEqual([target.id]);
      expect(requestConfirmationSpy).toHaveBeenCalledTimes(1);
      expect(requestConfirmationSpy.mock.calls[0][0]).toContain('1 provider call');
      const finalTarget = useFlowStore.getState().nodes.find((node) => node.id === target.id);
      expect(finalTarget?.data.envelopeItems).toHaveLength(3);
      expect(finalTarget?.data.envelopeItems?.every((item) => item.kind === 'video' && item.value.length > 0)).toBe(true);
      expect(finalTarget?.data.envelopeItems?.some((item) => item.value === skeletonUrl)).toBe(false);
      expect(finalTarget?.data.statusMessage).not.toContain('Resumed');
    });

    async function prepareTextDependencyResume(text: string) {
      const seed = createNode('seed', 'textNode', { mode: 'prompt', prompt: 'seed prompt' });
      const shared = createNode('shared-text', 'textNode', {
        mode: 'generate',
        provider: 'gemini',
        modelId: 'gemini-3.5-flash',
      });
      const target = createNode('target', 'imageGen', {
        mediaMode: 'generate',
        provider: 'bfl',
        modelId: 'flux-2-pro',
      });
      const nodes = [seed, shared, target];
      const edges: Edge[] = [
        { id: 'seed-shared', source: seed.id, target: shared.id },
        { id: 'shared-target', source: shared.id, target: target.id },
      ];
      useFlowStore.setState({ nodes, edges });
      await useFlowStore.getState().runNode(target.id);

      const envelopeId = await findHashedEnvelopeId((nodeData, context) => (
        nodeData.mode === 'generate' && context.prompt === 'seed prompt'
      ));
      const targetItem = useSourceBinStore.getState().getAllItems()
        .find((item) => item.originNodeId === target.id);
      expect(targetItem).toBeDefined();
      useSourceBinStore.getState().removeItem(targetItem!.id);
      useFlowStore.setState({
        nodes: nodes.map((node) => ({ ...node, data: { ...node.data } })),
        edges: edges.map((edge) => ({ ...edge })),
      });
      addRawSourceBinItem({
        id: `cached-shared-${text.trim() ? 'valid' : 'empty'}`,
        label: 'Cached shared text',
        kind: 'text',
        mimeType: 'text/plain',
        text,
        createdAt: Date.now(),
        originNodeId: shared.id,
        envelopeId,
        envelopeIndex: 0,
      });

      capturedContexts.length = 0;
      vi.mocked(executeNodeRequest).mockClear();
      requestConfirmationSpy.mockClear();
      return { shared, target };
    }

    it('feeds a valid textual dependency resume downstream without another dependency call', async () => {
      const { shared, target } = await prepareTextDependencyResume('cached usable dependency');

      await useFlowStore.getState().runNode(target.id);

      expect(capturedContexts.map((record) => record.nodeId)).toEqual([target.id]);
      expect(capturedContexts.some((record) => record.nodeId === shared.id)).toBe(false);
      expect(capturedContexts[0].context.prompt).toBe('cached usable dependency');
      expect(requestConfirmationSpy).toHaveBeenCalledTimes(1);
      expect(requestConfirmationSpy.mock.calls[0][0]).toContain('1 provider call');
    });

    it('reruns an empty textual dependency cache before building the downstream envelope', async () => {
      const { shared, target } = await prepareTextDependencyResume('   ');

      await useFlowStore.getState().runNode(target.id);

      expect(capturedContexts.map((record) => record.nodeId)).toEqual([shared.id, target.id]);
      expect(capturedContexts[1].context.prompt).toBe('result-shared-text-1');
      expect(capturedContexts[1].context.prompt.trim()).not.toBe('');
      expect(requestConfirmationSpy).toHaveBeenCalledTimes(1);
      expect(
        plannedProviderCallCount(requestConfirmationSpy.mock.calls[0][0]),
        requestConfirmationSpy.mock.calls.map(([message]) => message).join('\n---\n'),
      ).toBe(2);
      const finalTarget = useFlowStore.getState().nodes.find((node) => node.id === target.id);
      expect(finalTarget?.data.result).toMatch(/^data:image\/png;base64,/);
      expect(finalTarget?.data.statusMessage).not.toContain('Resumed');
    });

    it('reruns a corrupt media dependency before feeding a paid downstream node', async () => {
      const seed = createNode('seed', 'textNode', { mode: 'prompt', prompt: 'seed image' });
      const shared = createNode('shared-image', 'imageGen', {
        mediaMode: 'generate',
        provider: 'bfl',
        modelId: 'flux-2-pro',
      });
      const target = createNode('target', 'imageGen', {
        mediaMode: 'generate',
        provider: 'bfl',
        modelId: 'flux-2-pro',
      });
      const targetPrompt = createNode('target-prompt', 'textNode', { mode: 'prompt', prompt: 'refine image' });
      const nodes = [seed, shared, targetPrompt, target];
      const edges: Edge[] = [
        { id: 'seed-shared', source: seed.id, target: shared.id },
        { id: 'prompt-target', source: targetPrompt.id, target: target.id },
        { id: 'shared-target', source: shared.id, target: target.id, targetHandle: 'image-edit-source' },
      ];
      useFlowStore.setState({ nodes, edges });
      await useFlowStore.getState().runNode(target.id);

      const generatedItems = useSourceBinStore.getState().getAllItems();
      const sharedItem = generatedItems.find((item) => item.originNodeId === shared.id);
      const targetItem = generatedItems.find((item) => item.originNodeId === target.id);
      expect(sharedItem).toBeDefined();
      expect(targetItem).toBeDefined();
      patchSourceBinItem(sharedItem!.id, {
        assetId: undefined,
        assetUrl: 'data:image/png;base64,%%%',
        scratchFileName: undefined,
        nativeFilePath: undefined,
      });
      useSourceBinStore.getState().removeItem(targetItem!.id);
      useFlowStore.setState({
        nodes: nodes.map((node) => ({ ...node, data: { ...node.data } })),
        edges: edges.map((edge) => ({ ...edge })),
      });

      capturedContexts.length = 0;
      vi.mocked(executeNodeRequest).mockClear();
      requestConfirmationSpy.mockClear();
      await useFlowStore.getState().runNode(target.id);

      expect(capturedContexts.map((record) => record.nodeId)).toEqual([shared.id, target.id]);
      expect(capturedContexts[1].context.editImageInput).toMatch(/^data:image\/png;base64,/);
      expect(capturedContexts[1].context.editImageInput).not.toContain('%%%');
      expect(
        plannedProviderCallCount(requestConfirmationSpy.mock.calls[0][0]),
        requestConfirmationSpy.mock.calls.map(([message]) => message).join('\n---\n'),
      ).toBe(2);
      const finalTarget = useFlowStore.getState().nodes.find((node) => node.id === target.id);
      expect(finalTarget?.data.result).toMatch(/^data:image\/png;base64,/);
      expect(finalTarget?.data.result).not.toBe('');
    });

    it('shows a loop-aware cost confirmation for a fresh multi-iteration run', async () => {
      const textEnvelope = createTextEnvelopeNode('text-env', ['red', 'blue', 'green']);
      const target = createNode('target', 'imageGen', {
        mediaMode: 'generate',
        provider: 'bfl',
        modelId: 'flux-2-pro',
        listLoopMode: 'allCombinations',
      });

      useFlowStore.setState({
        nodes: [textEnvelope, target],
        edges: [{ id: 'edge-text', source: textEnvelope.id, target: target.id }],
      });

      await useFlowStore.getState().runNode(target.id);

      expect(capturedContexts).toHaveLength(3);

      expect(requestConfirmationSpy).toHaveBeenCalledTimes(1);
      expect(requestConfirmationSpy).toHaveBeenCalledWith(
        expect.stringContaining('3 provider calls'),
        'Final Run Cost Confirmation',
      );
    });
  });

  describe('final consent plan integrity', () => {
    function setPaidPromptGraph() {
      const prompt = createNode('prompt', 'textNode', { mode: 'prompt', prompt: 'approved prompt' });
      const alternate = createNode('alternate', 'textNode', { mode: 'prompt', prompt: 'alternate prompt' });
      const target = createNode('target', 'imageGen', {
        mediaMode: 'generate',
        provider: 'bfl',
        modelId: 'flux-2-pro',
      });
      const edge: Edge = { id: 'prompt-target', source: prompt.id, target: target.id };
      useFlowStore.setState({ nodes: [prompt, alternate, target], edges: [edge] });
      return { prompt, alternate, target, edge };
    }

    it('continues an unchanged approved plan without a second dialog', async () => {
      const { target } = setPaidPromptGraph();

      await useFlowStore.getState().runNode(target.id);

      expect(requestConfirmationSpy).toHaveBeenCalledTimes(1);
      expect(capturedContexts).toHaveLength(1);
      expect(capturedContexts[0].context.prompt).toBe('approved prompt');
    });

    it('re-plans and re-confirms a prompt mutation while the dialog is open', async () => {
      const { prompt, target } = setPaidPromptGraph();
      requestConfirmationSpy.mockImplementation(async () => {
        if (requestConfirmationSpy.mock.calls.length === 1) {
          useFlowStore.getState().updateNodeData(prompt.id, 'prompt', 'changed prompt');
        }
        return true;
      });

      await useFlowStore.getState().runNode(target.id);

      expect(requestConfirmationSpy).toHaveBeenCalledTimes(2);
      expect(capturedContexts).toHaveLength(1);
      expect(capturedContexts[0].context.prompt).toBe('changed prompt');
    });

    it('re-plans and re-confirms an edge mutation while the dialog is open', async () => {
      const { alternate, target } = setPaidPromptGraph();
      requestConfirmationSpy.mockImplementation(async () => {
        if (requestConfirmationSpy.mock.calls.length === 1) {
          useFlowStore.setState({
            edges: [{ id: 'alternate-target', source: alternate.id, target: target.id }],
          });
        }
        return true;
      });

      await useFlowStore.getState().runNode(target.id);

      expect(requestConfirmationSpy).toHaveBeenCalledTimes(2);
      expect(capturedContexts).toHaveLength(1);
      expect(capturedContexts[0].context.prompt).toBe('alternate prompt');
    });

    it('re-plans and re-confirms a provider/model mutation while the dialog is open', async () => {
      const { target } = setPaidPromptGraph();
      requestConfirmationSpy.mockImplementation(async () => {
        if (requestConfirmationSpy.mock.calls.length === 1) {
          useFlowStore.getState().patchNodeData(target.id, {
            provider: 'openai',
            modelId: 'gpt-image-2',
          });
        }
        return true;
      });

      await useFlowStore.getState().runNode(target.id);

      expect(requestConfirmationSpy).toHaveBeenCalledTimes(2);
      expect(capturedContexts).toHaveLength(1);
      expect(capturedContexts[0]).toMatchObject({ provider: 'openai', modelId: 'gpt-image-2' });
    });

    it('re-plans and re-confirms a model-only mutation while the dialog is open', async () => {
      const { target } = setPaidPromptGraph();
      requestConfirmationSpy.mockImplementation(async () => {
        if (requestConfirmationSpy.mock.calls.length === 1) {
          useFlowStore.getState().patchNodeData(target.id, { modelId: 'flux-2-flex' });
        }
        return true;
      });

      await useFlowStore.getState().runNode(target.id);

      expect(requestConfirmationSpy).toHaveBeenCalledTimes(2);
      expect(capturedContexts).toHaveLength(1);
      expect(capturedContexts[0].modelId).toBe('flux-2-flex');
    });

    it('re-plans and re-confirms a provider setting mutation while the dialog is open', async () => {
      const { target } = setPaidPromptGraph();
      const changedRetryBudget = baselineRuntimeSettings.providerSettings.batchMaxRetries + 1;
      requestConfirmationSpy.mockImplementation(async () => {
        if (requestConfirmationSpy.mock.calls.length === 1) {
          useSettingsStore.setState((state) => ({
            providerSettings: {
              ...state.providerSettings,
              batchMaxRetries: changedRetryBudget,
            },
          }));
        }
        return true;
      });

      await useFlowStore.getState().runNode(target.id);

      expect(requestConfirmationSpy).toHaveBeenCalledTimes(2);
      expect(capturedContexts).toHaveLength(1);
      expect(capturedContexts[0].settings.providerSettings.batchMaxRetries).toBe(changedRetryBudget);
    });

    it('re-prices and re-confirms a Source Bin resume mutation while the dialog is open', async () => {
      const prompts = createTextEnvelopeNode('prompts', ['one', 'two', 'three']);
      const target = createNode('target', 'imageGen', {
        mediaMode: 'generate',
        provider: 'bfl',
        modelId: 'flux-2-pro',
        listLoopMode: 'allCombinations',
      });
      useFlowStore.setState({
        nodes: [prompts, target],
        edges: [{ id: 'prompts-target', source: prompts.id, target: target.id }],
      });
      await useFlowStore.getState().runNode(target.id);
      const generatedItems = useSourceBinStore.getState().getAllItems();
      expect(generatedItems).toHaveLength(3);

      useSourceBinStore.getState().removeItem(generatedItems[0].id);
      await Promise.resolve();
      await Promise.resolve();
      capturedContexts.length = 0;
      vi.mocked(executeNodeRequest).mockClear();
      requestConfirmationSpy.mockClear();
      requestConfirmationSpy.mockImplementation(async () => {
        if (requestConfirmationSpy.mock.calls.length === 1) {
          useSourceBinStore.getState().removeItem(generatedItems[1].id);
        }
        return true;
      });

      await useFlowStore.getState().runNode(target.id);

      expect(requestConfirmationSpy).toHaveBeenCalledTimes(2);
      expect(requestConfirmationSpy.mock.calls[0][0]).toContain('1 provider call');
      expect(requestConfirmationSpy.mock.calls[1][0]).toContain('2 provider calls');
      expect(capturedContexts).toHaveLength(2);
    });
  });

  describe('diamond dependency identity', () => {
    function setDiamond(sharedPrompts?: string[]) {
      const promptSource = sharedPrompts
        ? createTextEnvelopeNode('shared-prompts', sharedPrompts)
        : createNode('shared-prompt', 'textNode', { mode: 'prompt', prompt: 'seed prompt' });
      const shared = createNode('shared', 'textNode', {
        mode: 'generate',
        provider: 'gemini',
        modelId: 'gemini-3.5-flash',
        listLoopMode: 'paired',
      });
      const left = createNode('left', 'textNode', {
        mode: 'generate',
        provider: 'gemini',
        modelId: 'gemini-3.5-flash',
        listLoopMode: 'paired',
      });
      const right = createNode('right', 'textNode', {
        mode: 'generate',
        provider: 'gemini',
        modelId: 'gemini-3.5-flash',
        listLoopMode: 'paired',
      });
      const target = createNode('target', 'imageGen', {
        mediaMode: 'generate',
        provider: 'bfl',
        modelId: 'flux-2-pro',
        listLoopMode: 'paired',
      });
      const nodes = [promptSource, shared, left, right, target];
      const edges: Edge[] = [
        { id: 'prompts-shared', source: promptSource.id, target: shared.id },
        { id: 'shared-left', source: shared.id, target: left.id },
        { id: 'shared-right', source: shared.id, target: right.id },
        { id: 'left-target', source: left.id, target: target.id },
        { id: 'right-target', source: right.id, target: target.id },
      ];
      useFlowStore.setState({ nodes, edges });
      return { shared, left, right, target };
    }

    it('executes one shared dependency and fans the same output into both branches', async () => {
      const { shared, left, right, target } = setDiamond();

      await useFlowStore.getState().runNode(target.id);

      expect(requestConfirmationSpy).toHaveBeenCalledTimes(1);
      const [message] = requestConfirmationSpy.mock.calls[0];
      expect(plannedProviderCallCount(message), message).toBe(capturedContexts.length);
      expect(capturedContexts.filter((record) => record.nodeId === shared.id)).toHaveLength(1);
      expect(capturedContexts.filter((record) => record.nodeId === left.id).map((record) => record.context.prompt))
        .toEqual(['result-shared-1']);
      expect(capturedContexts.filter((record) => record.nodeId === right.id).map((record) => record.context.prompt))
        .toEqual(['result-shared-1']);
    });

    it('preserves a legitimate shared vector axis while executing its node identity once', async () => {
      const { shared, left, right, target } = setDiamond(['first', 'second']);

      await useFlowStore.getState().runNode(target.id);

      expect(requestConfirmationSpy).toHaveBeenCalledTimes(1);
      const [message] = requestConfirmationSpy.mock.calls[0];
      expect(plannedProviderCallCount(message), message).toBe(capturedContexts.length);
      expect(capturedContexts.filter((record) => record.nodeId === shared.id)).toHaveLength(2);
      const sharedResults = ['result-shared-1', 'result-shared-2'];
      expect(capturedContexts.filter((record) => record.nodeId === left.id).map((record) => record.context.prompt))
        .toEqual(sharedResults);
      expect(capturedContexts.filter((record) => record.nodeId === right.id).map((record) => record.context.prompt))
        .toEqual(sharedResults);
    });

    it('preserves full and partial Source Bin resume through a vector diamond', async () => {
      const seed = createNode('seed', 'textNode', { mode: 'prompt', prompt: 'seed image' });
      const branchPrompt = createNode('branch-prompt', 'textNode', { mode: 'prompt', prompt: 'refine image' });
      const targetPrompts = createTextEnvelopeNode('target-prompts', ['first target', 'second target']);
      const imageNode = (id: string) => createNode(id, 'imageGen', {
        mediaMode: 'generate',
        provider: 'bfl',
        modelId: 'flux-2-pro',
        listLoopMode: 'paired',
      });
      const shared = imageNode('shared-image');
      const left = imageNode('left-image');
      const right = imageNode('right-image');
      const target = imageNode('target');
      useFlowStore.setState({
        nodes: [seed, branchPrompt, targetPrompts, shared, left, right, target],
        edges: [
          { id: 'seed-shared', source: seed.id, target: shared.id },
          { id: 'prompt-left', source: branchPrompt.id, target: left.id },
          { id: 'prompt-right', source: branchPrompt.id, target: right.id },
          { id: 'shared-left', source: shared.id, target: left.id, targetHandle: 'image-edit-source' },
          { id: 'shared-right', source: shared.id, target: right.id, targetHandle: 'image-edit-source' },
          { id: 'prompts-target', source: targetPrompts.id, target: target.id },
          { id: 'left-target', source: left.id, target: target.id, targetHandle: 'image-edit-source' },
          { id: 'right-target', source: right.id, target: target.id, targetHandle: 'image-reference-1' },
        ],
      });
      await useFlowStore.getState().runNode(target.id);
      const targetItems = useSourceBinStore.getState().getAllItems()
        .filter((item) => item.originNodeId === target.id);
      expect(targetItems).toHaveLength(2);

      capturedContexts.length = 0;
      vi.mocked(executeNodeRequest).mockClear();
      requestConfirmationSpy.mockClear();
      await useFlowStore.getState().runNode(target.id);

      expect(capturedContexts).toHaveLength(0);
      expect(requestConfirmationSpy).not.toHaveBeenCalled();

      useSourceBinStore.getState().removeItem(targetItems[0].id);
      await Promise.resolve();
      await Promise.resolve();
      capturedContexts.length = 0;
      vi.mocked(executeNodeRequest).mockClear();
      requestConfirmationSpy.mockClear();
      await useFlowStore.getState().runNode(target.id);

      expect(capturedContexts.map((record) => record.nodeId)).toEqual([target.id]);
      expect(capturedContexts.some((record) => [shared.id, left.id, right.id].includes(record.nodeId))).toBe(false);
      expect(requestConfirmationSpy).toHaveBeenCalledTimes(1);
      expect(requestConfirmationSpy.mock.calls[0][0]).toContain('1 provider call');
    });
  });

  describe('cancellation boundaries', () => {
    function setPlanningGraph() {
      const prompts = createTextEnvelopeNode('prompts', Array.from({ length: 40 }, (_, index) => `prompt ${index}`));
      const target = createNode('target', 'imageGen', {
        mediaMode: 'generate',
        provider: 'bfl',
        modelId: 'flux-2-pro',
        listLoopMode: 'allCombinations',
      });
      useFlowStore.setState({
        nodes: [prompts, target],
        edges: [{ id: 'prompts-target', source: prompts.id, target: target.id }],
      });
      return target;
    }

    it('cancels during planning without confirmation or provider work', async () => {
      const target = setPlanningGraph();

      const run = useFlowStore.getState().runNode(target.id);
      useFlowStore.getState().cancelNodeRun(target.id);
      await run;

      expect(requestConfirmationSpy).not.toHaveBeenCalled();
      expect(capturedContexts).toHaveLength(0);
      expect(useFlowStore.getState().nodes.find((node) => node.id === target.id)?.data).toMatchObject({
        isRunning: false,
        statusMessage: 'Run cancelled before sending any provider requests.',
      });
    });

    it('cancels a pending final confirmation without provider work', async () => {
      const target = setPlanningGraph();
      requestConfirmationSpy.mockImplementation(() => new Promise<boolean>(() => {}));

      const run = useFlowStore.getState().runNode(target.id);
      await vi.waitFor(() => expect(requestConfirmationSpy).toHaveBeenCalledTimes(1));
      useFlowStore.getState().cancelNodeRun(target.id);
      await run;

      expect(capturedContexts).toHaveLength(0);
      expect(useFlowStore.getState().nodes.find((node) => node.id === target.id)?.data).toMatchObject({
        isRunning: false,
        statusMessage: 'Run cancelled before sending any provider requests.',
      });
    });

    it('aborts execution without starting another provider call or publishing a result', async () => {
      const prompt = createNode('prompt', 'textNode', { mode: 'prompt', prompt: 'abort me' });
      const target = createNode('target', 'imageGen', {
        mediaMode: 'generate',
        provider: 'bfl',
        modelId: 'flux-2-pro',
      });
      useFlowStore.setState({
        nodes: [prompt, target],
        edges: [{ id: 'prompt-target', source: prompt.id, target: target.id }],
      });
      vi.mocked(executeNodeRequest).mockImplementationOnce(async (_node, _context, _settings, _status, options) => (
        new Promise((_, reject) => {
          options?.signal?.addEventListener('abort', () => {
            reject(new DOMException('The run was cancelled.', 'AbortError'));
          }, { once: true });
        })
      ));

      const run = useFlowStore.getState().runNode(target.id);
      await vi.waitFor(() => expect(vi.mocked(executeNodeRequest)).toHaveBeenCalledTimes(1));
      useFlowStore.getState().cancelNodeRun(target.id);
      await run;

      expect(vi.mocked(executeNodeRequest)).toHaveBeenCalledTimes(1);
      const finalTarget = useFlowStore.getState().nodes.find((node) => node.id === target.id);
      expect(finalTarget?.data.result).toBeUndefined();
      expect(finalTarget?.data).toMatchObject({ isRunning: false, statusMessage: 'Run cancelled.' });
    });
  });
});

