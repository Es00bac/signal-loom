import type { Edge } from '@xyflow/react';
import type { AppNode } from '../types/flow';

export function resolveVirtualSourceNode(
  virtualNode: AppNode,
  nodesById: Map<string, AppNode>,
  edges: Edge[],
): AppNode | undefined {
  if (virtualNode.type !== 'virtual') {
    return virtualNode;
  }

  const sourceId = resolveVirtualSourceNodeId(virtualNode.id, nodesById, edges, new Set());
  return sourceId ? nodesById.get(sourceId) : undefined;
}

export function resolveEffectiveSourceNode(
  sourceNode: AppNode,
  nodesById: Map<string, AppNode>,
  edges: Edge[],
): AppNode | undefined {
  return sourceNode.type === 'virtual'
    ? resolveVirtualSourceNode(sourceNode, nodesById, edges)
    : sourceNode;
}

export function resolveVirtualSourceNodeId(
  virtualNodeId: string,
  nodesById: Map<string, AppNode>,
  edges: Edge[],
  visited: Set<string> = new Set(),
): string | undefined {
  if (visited.has(virtualNodeId)) {
    return undefined;
  }

  visited.add(virtualNodeId);

  const virtualNode = nodesById.get(virtualNodeId);

  if (virtualNode?.type !== 'virtual') {
    return virtualNodeId;
  }

  const incomingEdge = edges.find((edge) => edge.target === virtualNodeId);

  if (!incomingEdge) {
    return undefined;
  }

  const sourceNode = nodesById.get(incomingEdge.source);

  if (!sourceNode) {
    return undefined;
  }

  return sourceNode.type === 'virtual'
    ? resolveVirtualSourceNodeId(sourceNode.id, nodesById, edges, visited)
    : sourceNode.id;
}
