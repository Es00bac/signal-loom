import type { Edge } from '@xyflow/react';
import type { AppNode, ImageTargetHandle } from '../types/flow';
import { resolveEffectiveSourceNode } from './virtualNodes';

export function hasConnectedImageEditSource(
  nodes: AppNode[],
  edges: Edge[],
  targetNodeId: string,
): boolean {
  return hasConnectedImageInput(nodes, edges, targetNodeId, ['image-edit-source']);
}

export function hasConnectedImageReferenceSource(
  nodes: AppNode[],
  edges: Edge[],
  targetNodeId: string,
  targetHandles: Array<ImageTargetHandle | undefined>,
): boolean {
  return hasConnectedImageInput(nodes, edges, targetNodeId, targetHandles);
}

export function hasConnectedImageMaskSource(
  nodes: AppNode[],
  edges: Edge[],
  targetNodeId: string,
): boolean {
  return hasConnectedImageInput(nodes, edges, targetNodeId, ['image-mask']);
}

export function resolveConnectedImageEditAsset(
  nodes: AppNode[],
  edges: Edge[],
  targetNodeId: string,
): string | undefined {
  return resolveConnectedImageInputAsset(nodes, edges, targetNodeId, ['image-edit-source']);
}

export function resolveConnectedImageReferenceAsset(
  nodes: AppNode[],
  edges: Edge[],
  targetNodeId: string,
  targetHandles: Array<ImageTargetHandle | undefined>,
): string | undefined {
  return resolveConnectedImageInputAsset(nodes, edges, targetNodeId, targetHandles);
}

export function resolveConnectedImageMaskAsset(
  nodes: AppNode[],
  edges: Edge[],
  targetNodeId: string,
): string | undefined {
  return resolveConnectedImageInputAsset(nodes, edges, targetNodeId, ['image-mask']);
}

export function hasConnectedImageInput(
  nodes: AppNode[],
  edges: Edge[],
  targetNodeId: string,
  targetHandles: Array<ImageTargetHandle | undefined>,
): boolean {
  return Boolean(findConnectedImageInputSource(nodes, edges, targetNodeId, targetHandles));
}

export function resolveConnectedImageInputAsset(
  nodes: AppNode[],
  edges: Edge[],
  targetNodeId: string,
  targetHandles: Array<ImageTargetHandle | undefined>,
): string | undefined {
  const sourceNode = findConnectedImageInputSource(nodes, edges, targetNodeId, targetHandles);

  if (!sourceNode) {
    return undefined;
  }

  return (sourceNode.data.mediaMode ?? 'generate') === 'import'
    ? sourceNode.data.sourceAssetUrl
    : sourceNode.data.result;
}

function findConnectedImageInputSource(
  nodes: AppNode[],
  edges: Edge[],
  targetNodeId: string,
  targetHandles: Array<ImageTargetHandle | undefined>,
): AppNode | undefined {
  const sourceEdges = edges.filter(
    (edge) => edge.target === targetNodeId && targetHandles.includes(edge.targetHandle as ImageTargetHandle | undefined),
  );
  const nodesById = new Map(nodes.map((node) => [node.id, node]));

  for (const sourceEdge of sourceEdges) {
    const rawSourceNode = nodesById.get(sourceEdge.source);
    const sourceNode = rawSourceNode
      ? resolveEffectiveSourceNode(rawSourceNode, nodesById, edges)
      : undefined;

    if (isImageInputSource(sourceNode)) {
      return sourceNode;
    }
  }

  return undefined;
}

function isImageInputSource(node: AppNode | undefined): node is AppNode {
  return node?.type === 'imageGen' || node?.type === 'cropImageNode' || node?.type === 'slimgNode';
}
