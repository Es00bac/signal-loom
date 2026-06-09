import type { AppNode, UsageTelemetry, WorkspaceView } from '../types/flow';

interface RecordProjectUsageInput {
  node: AppNode;
  usage?: UsageTelemetry;
  workspace: WorkspaceView;
  flowWorkspaceId?: string;
  flowWorkspaceName?: string;
  createdAt?: number;
  recordUsage: (input: {
    nodeId: string;
    nodeType: AppNode['type'];
    nodeData: AppNode['data'];
    workspace: WorkspaceView;
    flowWorkspaceId?: string;
    flowWorkspaceName?: string;
    usage: UsageTelemetry;
    createdAt?: number;
  }) => void;
}

export function recordProjectUsageFromExecution({
  node,
  usage,
  workspace,
  flowWorkspaceId,
  flowWorkspaceName,
  createdAt,
  recordUsage,
}: RecordProjectUsageInput): void {
  if (!usage) return;
  recordUsage({
    nodeId: node.id,
    nodeType: node.type,
    nodeData: node.data,
    workspace,
    flowWorkspaceId,
    flowWorkspaceName,
    usage,
    createdAt,
  });
}
