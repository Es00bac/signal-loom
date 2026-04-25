import React, { useEffect, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Maximize2, Minimize2, Play, RotateCcw, Square } from 'lucide-react';
import { OutputPortMenu } from './OutputPortMenu';
import { SharedContextMenu } from '../Common/SharedContextMenu';
import type { NodeActionTemplate } from '../../lib/nodeActionMenu';
import { getNodeTheme } from '../../lib/nodeTheme';
import { resolveNodeDisplayTitle } from '../../lib/nodeBookmarks';
import { withFlowNodeInteractionClasses } from '../../lib/flowNodeInteraction';
import { useFlowStore } from '../../store/flowStore';
import type { FlowNodeType } from '../../types/flow';
import type { SharedContextMenuItem } from '../../lib/sharedContextMenu';

interface BaseNodeProps {
  nodeId?: string;
  nodeType?: FlowNodeType;
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
  hasInput?: boolean;
  hasOutput?: boolean;
  customHandles?: React.ReactNode;
  onRun?: () => void;
  isRunning?: boolean;
  error?: string;
  statusMessage?: string;
  footerActions?: React.ReactNode;
  outputActions?: NodeActionTemplate[];
  containerClassName?: string;
  isCollapsed?: boolean;
  onToggleCollapsed?: () => void;
  collapsedContent?: React.ReactNode;
}

export const BaseNode: React.FC<BaseNodeProps> = ({
  nodeId,
  nodeType,
  icon: Icon,
  title,
  children,
  hasInput = true,
  hasOutput = true,
  customHandles,
  onRun,
  isRunning = false,
  error,
  statusMessage,
  footerActions,
  outputActions = [],
  containerClassName,
  isCollapsed = false,
  onToggleCollapsed,
  collapsedContent,
}) => {
  const hasFooter = Boolean(onRun) || Boolean(footerActions);
  const visibleContent = isCollapsed && collapsedContent ? collapsedContent : children;
  const theme = getNodeTheme(nodeType);
  const customTitle = useFlowStore(
    (state) => nodeId ? state.nodes.find((node) => node.id === nodeId)?.data.customTitle : undefined,
  );
  const patchNodeData = useFlowStore((state) => state.patchNodeData);
  const cancelNodeRun = useFlowStore((state) => state.cancelNodeRun);
  const displayTitle = resolveNodeDisplayTitle(title, customTitle);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    items: SharedContextMenuItem[];
  } | null>(null);

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    const close = () => setContextMenu(null);
    window.addEventListener('pointerdown', close);
    window.addEventListener('contextmenu', close);

    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('contextmenu', close);
    };
  }, [contextMenu]);

  const renameTitle = () => {
    if (!nodeId) {
      return;
    }

    const nextTitle = window.prompt('Rename this node and add it to the bookmark sidebar.', displayTitle);

    if (nextTitle === null) {
      return;
    }

    patchNodeData(nodeId, {
      customTitle: nextTitle.trim() || undefined,
    });
  };

  const openTitleContextMenu = (event: React.MouseEvent<HTMLSpanElement>) => {
    if (!nodeId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      items: [
        {
          id: 'rename-node-title',
          label: 'Rename And Bookmark',
          action: renameTitle,
        },
        {
          id: 'clear-node-title',
          label: 'Clear Custom Title',
          disabled: !customTitle,
          action: () => {
            patchNodeData(nodeId, { customTitle: undefined });
          },
        },
      ],
    });
  };

  return (
    <div className={`border rounded-xl w-[260px] shadow-2xl font-sans relative flex flex-col group transition-all hover:border-gray-500 ${theme.containerClassName} ${containerClassName ?? ''}`}>

      {hasInput && (
        <Handle
          type="target"
          position={Position.Left}
          className="!w-6 !h-6 !border-[3px] !border-[#1e2027] !-ml-3"
          style={{ backgroundColor: theme.accentColor }}
        />
      )}

      {customHandles}

      {/* Header */}
      <div className={`flex justify-between items-center px-3 py-2 rounded-t-xl border-b backdrop-blur-md ${theme.headerClassName}`}>
        <div className="flex items-center gap-2 overflow-hidden">
          <Icon size={14} className={`${theme.iconClassName} shrink-0`} />
          <span
            className={`text-xs font-semibold text-gray-200 tracking-wide truncate ${nodeId ? 'cursor-context-menu' : ''}`}
            onContextMenu={openTitleContextMenu}
            title={nodeId ? 'Right-click for node title actions' : undefined}
          >
            {displayTitle}
          </span>
        </div>

        {onToggleCollapsed ? (
          <button
            aria-label={isCollapsed ? 'Expand node' : 'Collapse node'}
            className={withFlowNodeInteractionClasses('rounded-md border border-gray-700/60 bg-[#111217]/40 p-1 text-gray-400 transition-colors hover:border-gray-500 hover:text-white')}
            onClick={onToggleCollapsed}
            type="button"
          >
            {isCollapsed ? <Maximize2 size={12} /> : <Minimize2 size={12} />}
          </button>
        ) : null}
      </div>

      {/* Content */}
      <div className="p-3 flex flex-col gap-3">
        {statusMessage ? (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-2 text-[11px] text-emerald-100">
            {statusMessage}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-2 text-[11px] text-red-100">
            {error}
          </div>
        ) : null}

        {visibleContent}
      </div>

      {/* Footer / Actions */}
      {hasFooter && (
        <div className="px-3 pb-3 pt-1 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">{footerActions}</div>

          {onRun ? (
            <div className="flex items-center gap-1.5">
              <button
                onClick={onRun}
                disabled={isRunning}
                className={withFlowNodeInteractionClasses(`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all
                  ${isRunning
                    ? 'bg-blue-600/50 text-white cursor-not-allowed'
                    : 'bg-white text-black hover:bg-gray-200 shadow-sm'
                  }`)}
                type="button"
              >
                {isRunning ? (
                  <RotateCcw size={12} className="animate-spin" />
                ) : (
                  <Play size={12} fill="currentColor" />
                )}
                {isRunning ? 'Running' : 'Run'}
              </button>
              {isRunning && nodeId ? (
                <button
                  aria-label="Cancel node run"
                  className={withFlowNodeInteractionClasses('flex items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 p-1.5 text-red-100 transition-colors hover:border-red-400/60 hover:bg-red-500/20')}
                  onClick={() => cancelNodeRun(nodeId)}
                  title="Cancel run"
                  type="button"
                >
                  <Square size={12} fill="currentColor" />
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      )}

      {hasOutput && (
        nodeId ? (
          <OutputPortMenu
            accentColor={theme.accentColor}
            actions={outputActions}
            hoverAccentColor={theme.hoverAccentColor}
            nodeId={nodeId}
          />
        ) : (
          <Handle
            type="source"
            position={Position.Right}
            className="!w-6 !h-6 !border-[3px] !border-[#1e2027] !-mr-3"
            style={{ backgroundColor: theme.accentColor }}
          />
        )
      )}
      {contextMenu ? (
        <SharedContextMenu
          ariaLabel="Node title context menu"
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
          title="Node Actions"
          x={contextMenu.x}
          y={contextMenu.y}
        />
      ) : null}
    </div>
  );
};
