import { describe, expect, it } from 'vitest';
import { FLOW_NODE_TYPES, type AppNode, type FlowNodeType, type NodeData } from '../types/flow';
import {
  FLOW_NODE_CONTRACTS,
  getFlowNodeContract,
  resolveFlowNodePorts,
  type FlowNodeContractContext,
} from './flowNodeContracts';
import { LOOP_BREAK_TARGET_HANDLE } from './flowControlHandles';

function node(type: FlowNodeType, data: NodeData = {}): AppNode {
  return { id: `${type}-1`, type, position: { x: 0, y: 0 }, data } as AppNode;
}

function context(type: FlowNodeType, data: NodeData = {}): FlowNodeContractContext {
  const current = node(type, data);
  return { node: current, nodes: [current], edges: [] };
}

describe('FLOW_NODE_CONTRACTS', () => {
  it('defines exactly one contract for every registered Flow node type', () => {
    expect(Object.keys(FLOW_NODE_CONTRACTS).sort()).toEqual([...FLOW_NODE_TYPES].sort());
  });

  it.each(FLOW_NODE_TYPES)('%s has durable audit documentation', (type) => {
    const contract = getFlowNodeContract(type);

    expect(contract.type).toBe(type);
    expect(contract.purpose.trim().length).toBeGreaterThan(12);
    expect(contract.help.trim().length).toBeGreaterThan(20);
    expect(contract.failureModes.length).toBeGreaterThan(0);
    expect(contract.failureModes.every((failure) => failure.trim().length > 8)).toBe(true);
    expect(contract.examples.length).toBeGreaterThan(0);
    expect(contract.implementation.path).toMatch(/^src\//);

    for (const example of contract.examples) {
      expect(example.title.trim()).not.toBe('');
      expect(example.description.trim().length).toBeGreaterThan(12);
      expect([...example.upstream, ...example.downstream].every((candidate) => FLOW_NODE_TYPES.includes(candidate))).toBe(true);
    }
  });

  it.each(FLOW_NODE_TYPES)('%s resolves unique port IDs per direction', (type) => {
    const ports = resolveFlowNodePorts(context(type));
    for (const direction of ['input', 'output'] as const) {
      const ids = ports.filter((port) => port.direction === direction).map((port) => port.id ?? '__default__');
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('keeps the Group node purposeful without inventing data ports', () => {
    expect(getFlowNodeContract('groupNode').role).toBe('ui-only');
    expect(resolveFlowNodePorts(context('groupNode'))).toEqual([]);
  });
});

describe('dynamic Flow node contracts', () => {
  it('resolves Value output from the selected primitive kind', () => {
    expect(resolveFlowNodePorts(context('valueNode', { valueKind: 'number' }))).toContainEqual(
      expect.objectContaining({ direction: 'output', types: [{ kind: 'number' }] }),
    );
  });

  it('keeps flexible code output unknown until explicitly declared', () => {
    expect(resolveFlowNodePorts(context('javascriptNode')).find((port) => port.direction === 'output')?.types).toEqual([{ kind: 'unknown' }]);
    expect(resolveFlowNodePorts(context('javascriptNode', { declaredOutputType: 'json' })).find((port) => port.direction === 'output')?.types).toEqual([{ kind: 'json' }]);
  });

  it('resolves function boundary ports from the saved function contract', () => {
    const ports = resolveFlowNodePorts(context('functionNode', {
      functionNode: {
        schemaVersion: 1,
        title: 'Caption image',
        description: '',
        contract: {
          id: 'fn-1',
          title: 'Caption image',
          inputPorts: [{ id: 'in-image', key: 'image', label: 'Image', resultType: 'image', required: true, order: 0 }],
          outputPorts: [{ id: 'out-text', key: 'caption', label: 'Caption', resultType: 'text', required: true, order: 0 }],
          version: 1,
        },
        graph: { version: 1, nodes: [], edges: [] },
        inputBindings: [],
        outputBindings: [],
      },
    }));

    expect(ports).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'in-image', direction: 'input', required: true, types: [{ kind: 'image' }] }),
      expect.objectContaining({ id: 'out-text', direction: 'output', types: [{ kind: 'text' }] }),
    ]));
  });

  it('exposes every conceptual Image reference port but disables unsupported ones', () => {
    const supported = resolveFlowNodePorts(context('imageGen', { provider: 'bfl', modelId: 'flux-2-pro' }));
    const unsupported = resolveFlowNodePorts(context('imageGen', { provider: 'stability', modelId: 'stable-image-core' }));

    expect(supported.find((port) => port.id === 'image-reference-8')?.disabledReason).toBeUndefined();
    expect(unsupported.find((port) => port.id === 'image-reference-1')?.disabledReason).toContain('does not support reference images');
  });

  it('declares composite package and envelope extraction on Image source and reference inputs', () => {
    const ports = resolveFlowNodePorts(context('imageGen', { provider: 'bfl', modelId: 'flux-2-pro' }));
    const compositeImageTypes = [
      { kind: 'image' },
      { kind: 'package' },
      { kind: 'envelope', item: { kind: 'image' } },
      { kind: 'envelope', item: { kind: 'package' } },
      { kind: 'envelope', item: { kind: 'mixed' } },
    ];

    expect(ports.find((port) => port.id === 'image-edit-source')?.types).toEqual(compositeImageTypes);
    expect(ports.find((port) => port.id === 'image-reference-1')?.types).toEqual(compositeImageTypes);
    expect(ports.find((port) => port.id === 'image-mask')?.types).toEqual([{ kind: 'image' }]);
  });

  it('declares package and envelope prompt extraction without accepting unrelated scalar coercions', () => {
    const prompt = resolveFlowNodePorts(context('imageGen', { provider: 'bfl', modelId: 'flux-2-pro' }))
      .find((port) => port.id === null && port.direction === 'input');

    expect(prompt?.types).toEqual([
      { kind: 'text' },
      { kind: 'video' },
      { kind: 'package' },
      { kind: 'envelope', item: { kind: 'text' } },
      { kind: 'envelope', item: { kind: 'package' } },
      { kind: 'envelope', item: { kind: 'mixed' } },
    ]);
    expect(prompt?.types).not.toContainEqual({ kind: 'number' });
    expect(prompt?.types).not.toContainEqual({ kind: 'boolean' });
  });

  it('distinguishes Portal entrance and exit directions', () => {
    expect(resolveFlowNodePorts(context('portal', { portalRole: 'entry' })).map((port) => port.direction)).toEqual(['input']);
    expect(resolveFlowNodePorts(context('portal', { portalRole: 'exit' })).map((port) => port.direction)).toEqual(['output']);
  });

  it.each([
    'textNode',
    'imageGen',
    'cropImageNode',
    'videoGen',
    'audioGen',
    'composition',
    'visionVerifyNode',
    'functionNode',
  ] as const)('%s exposes the Stop When control handle rendered by BaseNode', (type) => {
    expect(resolveFlowNodePorts(context(type))).toContainEqual(expect.objectContaining({
      id: LOOP_BREAK_TARGET_HANDLE,
      direction: 'input',
      types: [{ kind: 'control' }],
    }));
  });
});
