import type { Edge } from '@xyflow/react';
import type { AppNode } from '../types/flow';
import { resolveEffectiveSourceNode } from './virtualNodes';

export function hasConnectedVideoSource(
  nodes: AppNode[],
  edges: Edge[],
  targetNodeId: string,
): boolean {
  return Boolean(findConnectedVideoSource(nodes, edges, targetNodeId));
}

export function resolveConnectedVideoSourceAsset(
  nodes: AppNode[],
  edges: Edge[],
  targetNodeId: string,
): string | undefined {
  const sourceNode = findConnectedVideoSource(nodes, edges, targetNodeId);

  if (!sourceNode) {
    return undefined;
  }

  if (sourceNode.type === 'videoGen' && (sourceNode.data.mediaMode ?? 'generate') === 'import') {
    return sourceNode.data.sourceAssetUrl;
  }

  return sourceNode.data.result;
}

function findConnectedVideoSource(
  nodes: AppNode[],
  edges: Edge[],
  targetNodeId: string,
): AppNode | undefined {
  for (const edge of edges) {
    if (edge.target !== targetNodeId) {
      continue;
    }

    const nodesById = new Map(nodes.map((node) => [node.id, node]));
    const rawSourceNode = nodesById.get(edge.source);
    const sourceNode = rawSourceNode
      ? resolveEffectiveSourceNode(rawSourceNode, nodesById, edges)
      : undefined;

    if (sourceNode?.type === 'videoGen' || sourceNode?.type === 'composition') {
      return sourceNode;
    }
  }

  return undefined;
}
