import type { Connection, Edge } from '@xyflow/react';
import type { AppNode } from '../types/flow';
import { COMPOSITION_AUDIO_HANDLES, COMPOSITION_VIDEO_HANDLE } from './compositionTracks';
import { resolveEffectiveSourceNode } from './virtualNodes';

type CompositionAudioHandle = (typeof COMPOSITION_AUDIO_HANDLES)[number];

function isCompositionAudioHandle(handle: string | null | undefined): handle is CompositionAudioHandle {
  return COMPOSITION_AUDIO_HANDLES.includes(handle as CompositionAudioHandle);
}

export function isCompositionVideoConnection(edge: Pick<Edge, 'targetHandle'>): boolean {
  return edge.targetHandle === COMPOSITION_VIDEO_HANDLE || edge.targetHandle == null;
}

export function normalizeCompositionEdges(nodes: AppNode[], edges: Edge[]): Edge[] {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const preserved: Edge[] = [];
  const legacyByTarget = new Map<string, Edge[]>();

  for (const edge of edges) {
    const rawSourceNode = nodesById.get(edge.source);
    const sourceNode = rawSourceNode
      ? resolveEffectiveSourceNode(rawSourceNode, nodesById, edges)
      : undefined;
    const targetNode = nodesById.get(edge.target);

    if (targetNode?.type !== 'composition') {
      preserved.push(edge);
      continue;
    }

    if ((sourceNode?.type === 'videoGen' || sourceNode?.type === 'composition') && edge.targetHandle !== COMPOSITION_VIDEO_HANDLE) {
      const bucket = legacyByTarget.get(edge.target) ?? [];
      bucket.push(edge);
      legacyByTarget.set(edge.target, bucket);
      continue;
    }

    if (sourceNode?.type === 'audioGen' && !isCompositionAudioHandle(edge.targetHandle)) {
      const bucket = legacyByTarget.get(edge.target) ?? [];
      bucket.push(edge);
      legacyByTarget.set(edge.target, bucket);
      continue;
    }

    preserved.push(edge);
  }

  for (const [targetId, legacyEdges] of legacyByTarget.entries()) {
    const targetEdges = preserved.filter((edge) => edge.target === targetId);
    const occupiedAudioHandles = new Set(
      targetEdges
        .map((edge) => edge.targetHandle)
        .filter((handle): handle is CompositionAudioHandle => isCompositionAudioHandle(handle)),
    );
    const explicitVideoEdgeExists = targetEdges.some((edge) => edge.targetHandle === COMPOSITION_VIDEO_HANDLE);
    const legacyVideoEdges = legacyEdges.filter((edge) => {
      const rawSourceNode = nodesById.get(edge.source);
      const sourceNode = rawSourceNode
        ? resolveEffectiveSourceNode(rawSourceNode, nodesById, edges)
        : undefined;
      return sourceNode?.type === 'videoGen' || sourceNode?.type === 'composition';
    });
    const legacyAudioEdges = legacyEdges.filter((edge) => {
      const rawSourceNode = nodesById.get(edge.source);
      const sourceNode = rawSourceNode
        ? resolveEffectiveSourceNode(rawSourceNode, nodesById, edges)
        : undefined;
      return sourceNode?.type === 'audioGen';
    });

    if (!explicitVideoEdgeExists && legacyVideoEdges.length > 0) {
      const legacyVideoEdge = legacyVideoEdges[legacyVideoEdges.length - 1];
      preserved.push({
        ...legacyVideoEdge,
        targetHandle: COMPOSITION_VIDEO_HANDLE,
      });
    }

    for (const legacyAudioEdge of legacyAudioEdges) {
      const nextHandle = COMPOSITION_AUDIO_HANDLES.find((handle) => !occupiedAudioHandles.has(handle));

      if (!nextHandle) {
        break;
      }

      occupiedAudioHandles.add(nextHandle);
      preserved.push({
        ...legacyAudioEdge,
        targetHandle: nextHandle,
      });
    }
  }

  return dedupeExclusiveCompositionEdges(nodesById, preserved);
}

export function normalizeCompositionConnectionTargetHandle(
  connection: Connection,
  nodes: AppNode[],
  edges: Edge[],
): Connection {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const rawSourceNode = nodesById.get(connection.source);
  const sourceNode = rawSourceNode
    ? resolveEffectiveSourceNode(rawSourceNode, nodesById, edges)
    : undefined;
  const targetNode = nodes.find((node) => node.id === connection.target);

  if (targetNode?.type !== 'composition') {
    return connection;
  }

  if (sourceNode?.type === 'videoGen' || sourceNode?.type === 'composition') {
    if (connection.targetHandle !== COMPOSITION_VIDEO_HANDLE) {
      return {
        ...connection,
        targetHandle: COMPOSITION_VIDEO_HANDLE,
      };
    }

    return connection;
  }

  if (sourceNode?.type === 'audioGen' && !isCompositionAudioHandle(connection.targetHandle)) {
    const occupiedHandles = new Set(
      edges
        .filter((edge) => edge.target === connection.target)
        .map((edge) => edge.targetHandle)
        .filter((handle): handle is CompositionAudioHandle => isCompositionAudioHandle(handle)),
    );
    const nextHandle = COMPOSITION_AUDIO_HANDLES.find((handle) => !occupiedHandles.has(handle));

    if (nextHandle) {
      return {
        ...connection,
        targetHandle: nextHandle,
      };
    }
  }

  return connection;
}

function dedupeExclusiveCompositionEdges(nodesById: Map<string, AppNode>, edges: Edge[]): Edge[] {
  const seen = new Set<string>();
  const dedupedReversed: Edge[] = [];

  for (let index = edges.length - 1; index >= 0; index -= 1) {
    const edge = edges[index];
    const targetNode = nodesById.get(edge.target);

    if (targetNode?.type !== 'composition') {
      dedupedReversed.push(edge);
      continue;
    }

    if (edge.targetHandle !== COMPOSITION_VIDEO_HANDLE && !isCompositionAudioHandle(edge.targetHandle)) {
      dedupedReversed.push(edge);
      continue;
    }

    const key = `${edge.target}:${edge.targetHandle}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    dedupedReversed.push(edge);
  }

  return dedupedReversed.reverse();
}
