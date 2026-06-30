import { describe, expect, it } from 'vitest';
import type { Edge } from '@xyflow/react';
import type { AppNode } from '../types/flow';
import type { FlowProjectFlowSnapshot } from './flowProjectWorkspaces';
import {
  applyFlowGraphNativeChange,
  diffFlowGraphNativeChanges,
  type FlowGraphRendererState,
} from './flowGraphNativeSync';

const node = (id: string, position = { x: 0, y: 0 }, data: Record<string, unknown> = {}): AppNode =>
  ({ id, type: 'textInput', position, data } as unknown as AppNode);

const edge = (id: string, source: string, target: string): Edge =>
  ({ id, source, target } as Edge);

const state = (nodes: AppNode[] = [], edges: Edge[] = []): FlowGraphRendererState => ({ nodes, edges });

describe('applyFlowGraphNativeChange', () => {
  it('replaces the whole graph from a snapshot', () => {
    const snapshot: FlowProjectFlowSnapshot = {
      version: 3,
      nodes: [node('a'), node('b')],
      edges: [edge('e1', 'a', 'b')],
    };
    const next = applyFlowGraphNativeChange(state([node('old')]), { type: 'flow-graph-snapshot', snapshot });
    expect(next.nodes.map((n) => n.id)).toEqual(['a', 'b']);
    expect(next.edges.map((e) => e.id)).toEqual(['e1']);
    // Cloned, not aliased to the snapshot arrays/objects.
    expect(next.nodes[0]).not.toBe(snapshot.nodes[0]);
  });

  it('adds a node, and is idempotent on re-delivery of the same id', () => {
    const start = state([node('a')]);
    const added = applyFlowGraphNativeChange(start, { type: 'flow-node-added', node: node('b') });
    expect(added.nodes.map((n) => n.id)).toEqual(['a', 'b']);

    const again = applyFlowGraphNativeChange(added, { type: 'flow-node-added', node: node('b') });
    expect(again).toBe(added); // no-op → same reference
  });

  it('moves a node, no-ops when the position is unchanged or the node is missing', () => {
    const start = state([node('a', { x: 10, y: 20 })]);
    const moved = applyFlowGraphNativeChange(start, { type: 'flow-node-moved', nodeId: 'a', position: { x: 99, y: 1 } });
    expect(moved.nodes[0].position).toEqual({ x: 99, y: 1 });

    expect(applyFlowGraphNativeChange(moved, { type: 'flow-node-moved', nodeId: 'a', position: { x: 99, y: 1 } })).toBe(moved);
    expect(applyFlowGraphNativeChange(moved, { type: 'flow-node-moved', nodeId: 'missing', position: { x: 0, y: 0 } })).toBe(moved);
  });

  it('merges a node-data patch onto existing data, no-ops when the node is missing', () => {
    const start = state([node('a', { x: 0, y: 0 }, { prompt: 'hi', keep: 1 })]);
    const patched = applyFlowGraphNativeChange(start, {
      type: 'flow-node-data-updated',
      nodeId: 'a',
      patch: { prompt: 'bye' } as never,
    });
    expect(patched.nodes[0].data).toMatchObject({ prompt: 'bye', keep: 1 });
    expect(applyFlowGraphNativeChange(patched, { type: 'flow-node-data-updated', nodeId: 'gone', patch: {} })).toBe(patched);
  });

  it('removes a node together with its incident edges', () => {
    const start = state(
      [node('a'), node('b'), node('c')],
      [edge('e1', 'a', 'b'), edge('e2', 'b', 'c')],
    );
    const next = applyFlowGraphNativeChange(start, { type: 'flow-node-removed', nodeId: 'b' });
    expect(next.nodes.map((n) => n.id)).toEqual(['a', 'c']);
    expect(next.edges).toEqual([]); // both edges touched b
  });

  it('node-removed is a no-op when nothing references the id', () => {
    const start = state([node('a')], [edge('e1', 'a', 'a')]);
    expect(applyFlowGraphNativeChange(start, { type: 'flow-node-removed', nodeId: 'ghost' })).toBe(start);
  });

  it('node-removed still prunes dangling edges even if the node is already gone', () => {
    // Idempotent removal: node 'b' already removed, but a stale edge still references it.
    const start = state([node('a')], [edge('e1', 'a', 'b')]);
    const next = applyFlowGraphNativeChange(start, { type: 'flow-node-removed', nodeId: 'b' });
    expect(next.nodes.map((n) => n.id)).toEqual(['a']);
    expect(next.edges).toEqual([]);
  });

  it('adds an edge, idempotent on the same edge id', () => {
    const start = state([node('a'), node('b')]);
    const added = applyFlowGraphNativeChange(start, { type: 'flow-edge-added', edge: edge('e1', 'a', 'b') });
    expect(added.edges.map((e) => e.id)).toEqual(['e1']);
    expect(applyFlowGraphNativeChange(added, { type: 'flow-edge-added', edge: edge('e1', 'a', 'b') })).toBe(added);
  });

  it('removes an edge, no-ops when the edge id is absent', () => {
    const start = state([node('a'), node('b')], [edge('e1', 'a', 'b')]);
    const removed = applyFlowGraphNativeChange(start, { type: 'flow-edge-removed', edgeId: 'e1' });
    expect(removed.edges).toEqual([]);
    expect(applyFlowGraphNativeChange(removed, { type: 'flow-edge-removed', edgeId: 'nope' })).toBe(removed);
  });
});

describe('diffFlowGraphNativeChanges', () => {
  it('emits nothing when the graph is unchanged (incl. reordered data keys)', () => {
    const prev = state([node('a', { x: 1, y: 2 }, { prompt: 'hi', n: 1 })]);
    const next = state([node('a', { x: 1, y: 2 }, { n: 1, prompt: 'hi' })]);
    expect(diffFlowGraphNativeChanges(prev, next)).toEqual([]);
  });

  it('detects an added node', () => {
    const ops = diffFlowGraphNativeChanges(state([node('a')]), state([node('a'), node('b')]));
    expect(ops).toEqual([{ type: 'flow-node-added', node: node('b') }]);
  });

  it('detects a removed node', () => {
    const ops = diffFlowGraphNativeChanges(state([node('a'), node('b')]), state([node('a')]));
    expect(ops).toEqual([{ type: 'flow-node-removed', nodeId: 'b' }]);
  });

  it('detects a move and a data change independently', () => {
    const prev = state([node('a', { x: 0, y: 0 }, { prompt: 'one' })]);
    const next = state([node('a', { x: 5, y: 6 }, { prompt: 'two' })]);
    const ops = diffFlowGraphNativeChanges(prev, next);
    expect(ops).toContainEqual({ type: 'flow-node-moved', nodeId: 'a', position: { x: 5, y: 6 } });
    expect(ops).toContainEqual({ type: 'flow-node-data-updated', nodeId: 'a', patch: { prompt: 'two' } as never });
    expect(ops).toHaveLength(2);
  });

  it('detects edge add and remove', () => {
    const prev = state([node('a'), node('b')], [edge('e1', 'a', 'b')]);
    const next = state([node('a'), node('b')], [edge('e2', 'b', 'a')]);
    const ops = diffFlowGraphNativeChanges(prev, next);
    expect(ops).toContainEqual({ type: 'flow-edge-removed', edgeId: 'e1' });
    expect(ops).toContainEqual({ type: 'flow-edge-added', edge: edge('e2', 'b', 'a') });
  });

  it('round-trips: applying the diff to prev reproduces next', () => {
    const prev = state([node('a', { x: 0, y: 0 }), node('keep')], [edge('e1', 'a', 'keep')]);
    const next = state(
      [node('a', { x: 9, y: 9 }, { prompt: 'edited' }), node('keep'), node('c')],
      [edge('e2', 'c', 'keep')],
    );
    const result = diffFlowGraphNativeChanges(prev, next).reduce(applyFlowGraphNativeChange, prev);
    expect(result.nodes.map((n) => n.id).sort()).toEqual(['a', 'c', 'keep']);
    expect(result.nodes.find((n) => n.id === 'a')?.position).toEqual({ x: 9, y: 9 });
    expect(result.edges.map((e) => e.id)).toEqual(['e2']);
  });
});
