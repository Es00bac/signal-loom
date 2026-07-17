import type { Edge } from '@xyflow/react';
import type { FlowProjectFlowSnapshotInput } from '../../../lib/flowProjectWorkspaces';
import { sanitizeFlowSnapshot } from '../../../lib/projectValidation';
import type { AppNode } from '../../../types/flow';

export function replaceFlowSnapshotState(
  snapshot: FlowProjectFlowSnapshotInput,
  attachRuntimeDataToNodes: (nodes: AppNode[]) => AppNode[],
  normalizeFlowEdges: (nodes: AppNode[], edges: Edge[]) => Edge[],
): { nodes: AppNode[]; edges: Edge[] } {
  // Workspace switches pass an in-memory snapshot. Preserve its live run marker so
  // a just-duplicated workspace cannot launch a second provider request while the
  // original immutable run graph is still active. Project-file sanitization keeps
  // the default fail-closed behavior and clears this marker.
  const sanitizedSnapshot = sanitizeFlowSnapshot(snapshot, { preserveRuntimeRunState: true });
  const normalizedNodes = attachRuntimeDataToNodes(sanitizedSnapshot.nodes);

  return {
    nodes: normalizedNodes,
    edges: normalizeFlowEdges(normalizedNodes, sanitizedSnapshot.edges),
  };
}
