import type { Edge } from '@xyflow/react';
import type { FlowProjectFlowSnapshotInput } from '../../../lib/flowProjectWorkspaces';
import { sanitizeFlowSnapshot } from '../../../lib/projectValidation';
import type { AppNode } from '../../../types/flow';

export function replaceFlowSnapshotState(
  snapshot: FlowProjectFlowSnapshotInput,
  attachRuntimeDataToNodes: (nodes: AppNode[]) => AppNode[],
  normalizeFlowEdges: (nodes: AppNode[], edges: Edge[]) => Edge[],
): { nodes: AppNode[]; edges: Edge[] } {
  const sanitizedSnapshot = sanitizeFlowSnapshot(snapshot);
  const normalizedNodes = attachRuntimeDataToNodes(sanitizedSnapshot.nodes);

  return {
    nodes: normalizedNodes,
    edges: normalizeFlowEdges(normalizedNodes, sanitizedSnapshot.edges),
  };
}
