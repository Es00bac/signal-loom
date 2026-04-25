import { memo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { GitBranch, Link2 } from 'lucide-react';
import { BaseNode } from './BaseNode';
import { getCompatibleNodeActions } from '../../lib/nodeActionMenu';
import { resolveNodeDisplayTitle } from '../../lib/nodeBookmarks';
import { resolveVirtualSourceNode } from '../../lib/virtualNodes';
import { useFlowStore } from '../../store/flowStore';
import type { AppNodeProps, FlowNodeType } from '../../types/flow';

function VirtualNodeComponent({ id, data }: AppNodeProps) {
  const derived = useFlowStore(
    useShallow((state) => {
      const nodesById = new Map(state.nodes.map((node) => [node.id, node]));
      const virtualNode = nodesById.get(id);
      const sourceNode = virtualNode ? resolveVirtualSourceNode(virtualNode, nodesById, state.edges) : undefined;
      const sourceTitle = sourceNode
        ? resolveNodeDisplayTitle(getDefaultNodeTitle(sourceNode.type), sourceNode.data.customTitle)
        : undefined;
      const outputActionTypes =
        sourceNode && sourceNode.type !== 'virtual' ? sourceNode.type : undefined;
      return { sourceTitle, outputActionTypes };
    }),
  );
  const outputActions = derived.outputActionTypes
    ? getCompatibleNodeActions(derived.outputActionTypes)
    : [];

  return (
    <BaseNode
      nodeId={id}
      nodeType="virtual"
      icon={GitBranch}
      title="Virtual Node"
      outputActions={outputActions}
      error={data.error}
      statusMessage={data.statusMessage}
    >
      <div className="rounded-lg border border-fuchsia-400/25 bg-fuchsia-500/10 p-3 text-xs text-fuchsia-50">
        <div className="flex items-center gap-2 font-semibold">
          <Link2 size={13} />
          {derived.sourceTitle ? `Alias of ${derived.sourceTitle}` : 'Waiting for a linked source'}
        </div>
        <div className="mt-2 leading-5 text-fuchsia-50/75">
          Connect any completed or runnable node into this virtual node, then connect this node downstream. Downstream edges resolve as if they came from the linked source.
        </div>
      </div>
    </BaseNode>
  );
}

export const VirtualNode = memo(VirtualNodeComponent);

function getDefaultNodeTitle(type: FlowNodeType): string {
  switch (type) {
    case 'textNode':
      return 'Text Node';
    case 'imageGen':
      return 'Image Generation';
    case 'videoGen':
      return 'Video Generation';
    case 'audioGen':
      return 'Audio Generation';
    case 'settings':
      return 'Generation Defaults';
    case 'composition':
      return 'Composition';
    case 'sourceBin':
      return 'Source Bin';
    case 'virtual':
      return 'Virtual Node';
  }
}
