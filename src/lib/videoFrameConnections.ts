import type { Edge } from '@xyflow/react';
import type { AppNode, VideoTargetHandle } from '../types/flow';
import { isVideoImageConditioningHandle } from './videoModelSupport';
import { resolveEffectiveSourceNode } from './virtualNodes';

interface MiswiredVideoImageSource {
  nodeId: string;
  targetHandle: string | null | undefined;
}

export function hasConnectedVideoFrameSource(
  nodes: AppNode[],
  edges: Edge[],
  targetNodeId: string,
  targetHandles: Array<VideoTargetHandle | undefined>,
): boolean {
  return Boolean(findConnectedVideoFrameSource(nodes, edges, targetNodeId, targetHandles));
}

export function resolveConnectedVideoFrameAsset(
  nodes: AppNode[],
  edges: Edge[],
  targetNodeId: string,
  targetHandles: Array<VideoTargetHandle | undefined>,
): string | undefined {
  const sourceNode = findConnectedVideoFrameSource(nodes, edges, targetNodeId, targetHandles);

  if (!sourceNode) {
    return undefined;
  }

  return (sourceNode.data.mediaMode ?? 'generate') === 'import'
    ? sourceNode.data.sourceAssetUrl
    : sourceNode.data.result;
}

export function findMiswiredVideoImageSources(
  nodes: AppNode[],
  edges: Edge[],
  targetNodeId: string,
): MiswiredVideoImageSource[] {
  return edges.flatMap((edge) => {
    const targetHandle = edge.targetHandle ?? undefined;

    if (edge.target !== targetNodeId || isVideoImageConditioningHandle(targetHandle)) {
      return [];
    }

    const nodesById = new Map(nodes.map((node) => [node.id, node]));
    const rawSourceNode = nodesById.get(edge.source);
    const sourceNode = rawSourceNode
      ? resolveEffectiveSourceNode(rawSourceNode, nodesById, edges)
      : undefined;

    if (sourceNode?.type !== 'imageGen') {
      return [];
    }

    return [{
      nodeId: sourceNode.id,
      targetHandle,
    }];
  });
}

export function hasConnectedVideoSource(
  nodes: AppNode[],
  edges: Edge[],
  targetNodeId: string,
  targetHandles: Array<VideoTargetHandle | undefined>,
): boolean {
  return Boolean(findConnectedVideoSource(nodes, edges, targetNodeId, targetHandles));
}

export function resolveConnectedVideoSourceAsset(
  nodes: AppNode[],
  edges: Edge[],
  targetNodeId: string,
  targetHandles: Array<VideoTargetHandle | undefined>,
): string | undefined {
  const sourceNode = findConnectedVideoSource(nodes, edges, targetNodeId, targetHandles);

  if (!sourceNode) {
    return undefined;
  }

  return (sourceNode.data.mediaMode ?? 'generate') === 'import'
    ? sourceNode.data.sourceAssetUrl
    : sourceNode.data.result;
}

function findConnectedVideoFrameSource(
  nodes: AppNode[],
  edges: Edge[],
  targetNodeId: string,
  targetHandles: Array<VideoTargetHandle | undefined>,
): AppNode | undefined {
  const sourceEdge = edges.find(
    (edge) => edge.target === targetNodeId && targetHandles.includes(edge.targetHandle as VideoTargetHandle | undefined),
  );

  if (!sourceEdge) {
    return undefined;
  }

  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const rawSourceNode = nodesById.get(sourceEdge.source);
  const sourceNode = rawSourceNode
    ? resolveEffectiveSourceNode(rawSourceNode, nodesById, edges)
    : undefined;

  return sourceNode?.type === 'imageGen' ? sourceNode : undefined;
}

function findConnectedVideoSource(
  nodes: AppNode[],
  edges: Edge[],
  targetNodeId: string,
  targetHandles: Array<VideoTargetHandle | undefined>,
): AppNode | undefined {
  const sourceEdge = edges.find(
    (edge) => edge.target === targetNodeId && targetHandles.includes(edge.targetHandle as VideoTargetHandle | undefined),
  );

  if (!sourceEdge) {
    return undefined;
  }

  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const rawSourceNode = nodesById.get(sourceEdge.source);
  const sourceNode = rawSourceNode
    ? resolveEffectiveSourceNode(rawSourceNode, nodesById, edges)
    : undefined;

  return sourceNode && (sourceNode.type === 'videoGen' || sourceNode.type === 'composition')
    ? sourceNode
    : undefined;
}
