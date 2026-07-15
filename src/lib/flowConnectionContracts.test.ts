import type { Connection, Edge } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import type { AppNode, FlowNodeType, NodeData } from '../types/flow';
import {
  annotateFlowEdge,
  resolveFlowOutputType,
  validateFlowConnection,
} from './flowConnectionContracts';

function node(id: string, type: FlowNodeType, data: NodeData = {}): AppNode {
  return { id, type, position: { x: 0, y: 0 }, data } as AppNode;
}

function connection(overrides: Partial<Connection> = {}): Connection {
  return {
    source: 'source',
    sourceHandle: null,
    target: 'target',
    targetHandle: null,
    ...overrides,
  };
}

describe('validateFlowConnection', () => {
  it('accepts an exact text connection and reports the carried type', () => {
    const nodes = [node('source', 'textNode'), node('target', 'imageGen', { provider: 'bfl', modelId: 'flux-2-pro' })];

    expect(validateFlowConnection(connection(), { nodes, edges: [] })).toMatchObject({
      valid: true,
      carriedType: { kind: 'text' },
      sourcePort: { id: null, direction: 'output' },
      targetPort: { id: null, direction: 'input' },
    });
  });

  it('rejects number to text without implicit coercion and suggests an explicit converter', () => {
    const nodes = [node('source', 'numberNode'), node('target', 'regexReplaceNode')];
    const result = validateFlowConnection(connection(), { nodes, edges: [] });

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('number cannot connect to text');
    expect(result.converterNodeTypes).toContain('javascriptNode');
  });

  it('rejects text to an image-only port', () => {
    const nodes = [node('source', 'textNode'), node('target', 'cropImageNode')];
    const result = validateFlowConnection(connection({ targetHandle: 'image' }), { nodes, edges: [] });

    expect(result).toMatchObject({ valid: false });
    expect(result.reason).toContain('text cannot connect to image');
  });

  it('rejects connections whose source or target handle does not exist', () => {
    const nodes = [node('source', 'textNode'), node('target', 'regexReplaceNode')];

    expect(validateFlowConnection(connection({ sourceHandle: 'missing' }), { nodes, edges: [] }).reason)
      .toContain('source handle');
    expect(validateFlowConnection(connection({ targetHandle: 'missing' }), { nodes, edges: [] }).reason)
      .toContain('target handle');
  });

  it('blocks a visible model-specific port when the selected model does not support it', () => {
    const nodes = [
      node('source', 'imageGen', { mediaMode: 'import' }),
      node('target', 'imageGen', { provider: 'stability', modelId: 'stable-image-core' }),
    ];
    const result = validateFlowConnection(connection({ targetHandle: 'image-reference-1' }), { nodes, edges: [] });

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('does not support reference images');
  });

  it('enforces target port cardinality', () => {
    const nodes = [node('source', 'textNode'), node('other', 'textNode'), node('target', 'regexReplaceNode')];
    const edges: Edge[] = [{ id: 'existing', source: 'other', target: 'target' }];
    const result = validateFlowConnection(connection(), { nodes, edges });

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('already has its maximum');
  });

  it('accepts explicit package extraction on Image source ports', () => {
    const nodes = [
      node('source', 'packageNode'),
      node('target', 'imageGen', { provider: 'bfl', modelId: 'flux-2-pro' }),
    ];

    expect(validateFlowConnection(connection({ targetHandle: 'image-edit-source' }), { nodes, edges: [] }))
      .toMatchObject({ valid: true, carriedType: { kind: 'package' } });
  });
});

describe('resolveFlowOutputType', () => {
  it('infers pass-through types through switches and virtual aliases', () => {
    const nodes = [
      node('text', 'textNode'),
      node('switch', 'switchNode'),
      node('virtual', 'virtual'),
    ];
    const edges: Edge[] = [
      { id: 'text-switch', source: 'text', target: 'switch', targetHandle: 'input' },
      { id: 'switch-virtual', source: 'switch', target: 'virtual' },
    ];

    expect(resolveFlowOutputType('switch', null, { nodes, edges })).toEqual({ kind: 'text' });
    expect(resolveFlowOutputType('virtual', null, { nodes, edges })).toEqual({ kind: 'text' });
  });

  it('infers typed list and expander outputs from connected items', () => {
    const nodes = [node('image', 'imageGen'), node('list', 'list'), node('expander', 'expander')];
    const edges: Edge[] = [
      { id: 'image-list', source: 'image', target: 'list', targetHandle: 'list-item-0' },
      { id: 'list-expander', source: 'list', target: 'expander' },
    ];

    expect(resolveFlowOutputType('list', null, { nodes, edges })).toEqual({
      kind: 'list',
      item: { kind: 'image' },
    });
    expect(resolveFlowOutputType('expander', null, { nodes, edges })).toEqual({ kind: 'image' });
  });

  it('infers a portal exit from its paired entrance', () => {
    const nodes = [
      node('source', 'numberNode'),
      node('entry', 'portal', { portalRole: 'entry', portalPairId: 'pair-1' }),
      node('exit', 'portal', { portalRole: 'exit', portalPairId: 'pair-1' }),
    ];
    const edges: Edge[] = [{ id: 'source-entry', source: 'source', target: 'entry' }];

    expect(resolveFlowOutputType('exit', null, { nodes, edges })).toEqual({ kind: 'number' });
  });
});

describe('annotateFlowEdge', () => {
  it('preserves an invalid legacy edge while attaching a durable contract diagnostic', () => {
    const nodes = [node('source', 'textNode'), node('target', 'cropImageNode')];
    const edge: Edge = {
      id: 'legacy',
      source: 'source',
      target: 'target',
      targetHandle: 'image',
      data: { existing: 'kept' },
    };

    expect(annotateFlowEdge(edge, { nodes, edges: [edge] })).toMatchObject({
      id: 'legacy',
      data: {
        existing: 'kept',
        flowContract: {
          valid: false,
          carriedType: { kind: 'text' },
          reason: 'text cannot connect to image',
        },
      },
    });
  });
});
