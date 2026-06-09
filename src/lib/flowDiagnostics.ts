import type { Edge } from '@xyflow/react';
import type { AppNode } from '../types/flow';
import { collectFunctionNodeWarnings } from './functionNodes';
import {
  collectSignalDiagnostics,
  evaluateNodeSignal,
  type FlowDiagnostic,
} from './flowSignals';

export function collectFlowDiagnostics(nodes: AppNode[], edges: Edge[]): FlowDiagnostic[] {
  const diagnostics: FlowDiagnostic[] = [];
  const nodeIds = new Set(nodes.map((node) => node.id));

  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      diagnostics.push({
        id: `broken-edge-${edge.id}`,
        edgeId: edge.id,
        severity: 'critical',
        message: 'This edge references a node that no longer exists.',
        suggestedFix: 'Delete the broken edge or reconnect it to an existing node.',
        blocksRun: true,
      });
    }
  }

  for (const node of nodes) {
    diagnostics.push(...collectSignalDiagnostics(evaluateNodeSignal(node.id, nodes, edges)));

    if (node.type === 'functionNode' && node.data.functionNode) {
      diagnostics.push(...collectFunctionNodeWarnings(node.data.functionNode).map((message, index) => ({
        id: `function-warning-${node.id}-${index}`,
        nodeId: node.id,
        severity: 'warning' as const,
        message,
        suggestedFix: 'Open the function node and repair the missing port or internal binding.',
        blocksRun: false,
      })));
    }
  }

  return dedupeDiagnostics(diagnostics);
}

export function getBlockingFlowDiagnostics(nodes: AppNode[], edges: Edge[]): FlowDiagnostic[] {
  return collectFlowDiagnostics(nodes, edges).filter((diagnostic) => diagnostic.blocksRun);
}

function dedupeDiagnostics(diagnostics: FlowDiagnostic[]): FlowDiagnostic[] {
  const seen = new Set<string>();
  return diagnostics.filter((diagnostic) => {
    const key = `${diagnostic.id}:${diagnostic.nodeId ?? ''}:${diagnostic.edgeId ?? ''}:${diagnostic.message}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
