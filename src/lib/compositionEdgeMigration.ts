import type { Connection, Edge } from '@xyflow/react';
import type { AppNode, CompositionTargetHandle } from '../types/flow';
import {
  classifyCompositionAudioHandle,
  COMPOSITION_AUDIO_HANDLES,
  COMPOSITION_VIDEO_HANDLE,
  isCompositionAudioHandle,
} from './compositionTracks';
import { resolveEffectiveSourceNode } from './virtualNodes';

export interface CompositionAudioEdgeMigrationDiagnostic {
  targetNodeId: string;
  edgeId: string;
  handle: string;
  reason: 'overflow' | 'malformed';
}

export function isCompositionVideoConnection(edge: Pick<Edge, 'targetHandle'>): boolean {
  return edge.targetHandle === COMPOSITION_VIDEO_HANDLE || edge.targetHandle == null;
}

export function normalizeCompositionEdges(nodes: AppNode[], edges: Edge[]): Edge[] {
  return normalizeCompositionEdgesWithDiagnostics(nodes, edges).edges;
}

/**
 * Same migration as `normalizeCompositionEdges`, plus diagnostics for audio-track-shaped handles
 * beyond the supported 1-4 range or otherwise malformed. Those edges are honestly dropped rather
 * than silently renumbered into range (FBL-019) or hidden behind ports that never expose them.
 * A truly legacy edge — no target handle at all — is still migrated to the next open lane.
 */
export function normalizeCompositionEdgesWithDiagnostics(
  nodes: AppNode[],
  edges: Edge[],
): { edges: Edge[]; diagnostics: CompositionAudioEdgeMigrationDiagnostic[] } {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const preserved: Edge[] = [];
  const legacyByTarget = new Map<string, Edge[]>();
  const diagnostics: CompositionAudioEdgeMigrationDiagnostic[] = [];

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
      if (edge.targetHandle == null) {
        const bucket = legacyByTarget.get(edge.target) ?? [];
        bucket.push(edge);
        legacyByTarget.set(edge.target, bucket);
        continue;
      }

      const classification = classifyCompositionAudioHandle(edge.targetHandle);

      if (classification && classification.status !== 'valid') {
        diagnostics.push({
          targetNodeId: edge.target,
          edgeId: edge.id,
          handle: classification.handle,
          reason: classification.status,
        });
        continue;
      }

      preserved.push(edge);
      continue;
    }

    preserved.push(edge);
  }

  for (const [targetId, legacyEdges] of legacyByTarget.entries()) {
    const targetEdges = preserved.filter((edge) => edge.target === targetId);
    const occupiedAudioHandles = new Set(
      targetEdges
        .map((edge) => edge.targetHandle)
        .filter((handle): handle is CompositionTargetHandle => isCompositionAudioHandle(handle)),
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

  return { edges: dedupeExclusiveCompositionEdges(nodesById, preserved), diagnostics };
}

/**
 * Turns dropped-edge diagnostics into a visible, durable node error instead of letting the edge
 * vanish without a trace (FBL-019). Applied at restore/import boundaries, where a persisted or
 * imported overflow/malformed audio handle would otherwise be silently discarded by
 * `normalizeCompositionEdgesWithDiagnostics`.
 */
export function surfaceCompositionEdgeDiagnostics(
  nodes: AppNode[],
  diagnostics: readonly CompositionAudioEdgeMigrationDiagnostic[],
): AppNode[] {
  if (diagnostics.length === 0) {
    return nodes;
  }

  const messageByTarget = new Map<string, string>();

  for (const diagnostic of diagnostics) {
    const reason = diagnostic.reason === 'overflow'
      ? 'beyond the supported 4-track limit'
      : 'not a valid track index';
    const detail = `Removed unsupported audio connection on handle "${diagnostic.handle}" (${reason}).`;
    const existing = messageByTarget.get(diagnostic.targetNodeId);
    messageByTarget.set(diagnostic.targetNodeId, existing ? `${existing} ${detail}` : detail);
  }

  return nodes.map((node) => {
    const message = messageByTarget.get(node.id);
    if (!message) {
      return node;
    }

    return { ...node, data: { ...node.data, error: message } };
  });
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

  if (sourceNode?.type === 'audioGen' && connection.targetHandle == null) {
    const occupiedHandles = new Set(
      edges
        .filter((edge) => edge.target === connection.target)
        .map((edge) => edge.targetHandle)
        .filter((handle): handle is CompositionTargetHandle => isCompositionAudioHandle(handle)),
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
