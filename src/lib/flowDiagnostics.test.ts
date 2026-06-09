import { describe, expect, it } from 'vitest';
import type { Edge } from '@xyflow/react';
import type { AppNode } from '../types/flow';
import { buildListItemTargetHandle } from './listNodes';
import { collectFlowDiagnostics } from './flowDiagnostics';

function createNode(node: Partial<AppNode> & Pick<AppNode, 'id' | 'type'>): AppNode {
  return {
    position: { x: 0, y: 0 },
    data: {},
    ...node,
  } as AppNode;
}

describe('flow diagnostics', () => {
  it('reports list-aware pure-node mismatches as critical workspace diagnostics', () => {
    const nodes = [
      createNode({ id: 'a1', type: 'textNode', data: { prompt: 'a1' } }),
      createNode({ id: 'a2', type: 'textNode', data: { prompt: 'a2' } }),
      createNode({ id: 'b1', type: 'textNode', data: { prompt: 'b1' } }),
      createNode({ id: 'b2', type: 'textNode', data: { prompt: 'b2' } }),
      createNode({ id: 'b3', type: 'textNode', data: { prompt: 'b3' } }),
      createNode({ id: 'list-a', type: 'list' }),
      createNode({ id: 'list-b', type: 'list' }),
      createNode({ id: 'template', type: 'stringTemplateNode', data: { template: '{A}/{B}' } }),
      createNode({ id: 'image', type: 'imageGen' }),
    ];
    const edges: Edge[] = [
      { id: 'ea1', source: 'a1', target: 'list-a', targetHandle: buildListItemTargetHandle(0) },
      { id: 'ea2', source: 'a2', target: 'list-a', targetHandle: buildListItemTargetHandle(1) },
      { id: 'eb1', source: 'b1', target: 'list-b', targetHandle: buildListItemTargetHandle(0) },
      { id: 'eb2', source: 'b2', target: 'list-b', targetHandle: buildListItemTargetHandle(1) },
      { id: 'eb3', source: 'b3', target: 'list-b', targetHandle: buildListItemTargetHandle(2) },
      { id: 'ta', source: 'list-a', target: 'template', targetHandle: 'A' },
      { id: 'tb', source: 'list-b', target: 'template', targetHandle: 'B' },
      { id: 'out', source: 'template', target: 'image' },
    ];

    const diagnostics = collectFlowDiagnostics(nodes, edges);

    expect(diagnostics.some((diagnostic) =>
      diagnostic.severity === 'critical' &&
      diagnostic.nodeId === 'template' &&
      diagnostic.message.includes('same length'),
    )).toBe(true);
  });

  it('warns when an edge references a missing node', () => {
    const diagnostics = collectFlowDiagnostics(
      [createNode({ id: 'image', type: 'imageGen' })],
      [{ id: 'broken', source: 'missing', target: 'image' }],
    );

    expect(diagnostics).toEqual([
      expect.objectContaining({
        edgeId: 'broken',
        severity: 'critical',
        blocksRun: true,
      }),
    ]);
  });

  it('does not crash the surface when diagnostics encounters an overly deep utility chain', () => {
    const depth = 1800;
    const nodes: AppNode[] = [
      createNode({ id: 'source', type: 'textNode', data: { prompt: 'safe' } }),
      ...Array.from({ length: depth }, (_, index) =>
        createNode({ id: `monitor-${index}`, type: 'valueMonitorNode' }),
      ),
    ];
    const edges: Edge[] = Array.from({ length: depth }, (_, index) => ({
      id: `edge-${index}`,
      source: index === 0 ? 'source' : `monitor-${index - 1}`,
      target: `monitor-${index}`,
    }));

    let diagnostics: ReturnType<typeof collectFlowDiagnostics> = [];
    expect(() => {
      diagnostics = collectFlowDiagnostics(nodes, edges);
    }).not.toThrow();
    expect(diagnostics.some((diagnostic) =>
      diagnostic.severity === 'critical' &&
      diagnostic.message.includes('too deep'),
    )).toBe(true);
  }, 10_000);
});
