import React from 'react';
import { Activity, AlignLeft, Braces, ChevronDown, Database, Image, List, Repeat, ScrollText, Settings, Sigma, Sparkles } from 'lucide-react';
import {
  createImageNodeTemplateDataPatch,
  listImageNodeTemplates,
  type ImageNodeTemplate,
} from '../../lib/imageNodeTemplates';
import {
  FLOW_NODE_CATALOG_CATEGORIES,
  getNodeCatalogEntriesForCategory,
  type FlowNodeCatalogCategory,
  type FlowNodeCatalogCategoryId,
  type FlowNodeCatalogEntry,
} from '../../lib/nodeCatalog';
import type { FlowNodeType, NodeData } from '../../types/flow';

interface BottomToolbarProps {
  onAddNode: (type: FlowNodeType, initialData?: Partial<NodeData>) => void;
  dockable?: boolean;
  variant?: 'floating' | 'dockable' | 'topbar';
}

const CATEGORY_ICONS: Record<FlowNodeCatalogCategoryId, React.ReactNode> = {
  generate: <Sparkles size={18} />,
  'inputs-data': <Database size={18} />,
  'lists-envelopes': <List size={18} />,
  'flow-control': <Repeat size={18} />,
  'logic-math': <Sigma size={18} />,
  'text-tools': <AlignLeft size={18} />,
  'story-tools': <ScrollText size={18} />,
  'reuse-layout': <Braces size={18} />,
  'monitor-debug': <Activity size={18} />,
  settings: <Settings size={18} />,
};

export const BottomToolbar: React.FC<BottomToolbarProps> = ({ onAddNode, dockable = false, variant }) => {
  const resolvedVariant = variant ?? (dockable ? 'dockable' : 'floating');
  const compact = resolvedVariant === 'topbar';
  const imageTemplates = React.useMemo(() => listImageNodeTemplates(), []);
  const className = resolvedVariant === 'topbar'
    ? 'pointer-events-auto flex w-max items-center justify-center gap-1 px-1 py-0.5'
    : `theme-popover ${resolvedVariant === 'dockable' ? 'flex w-max max-w-full flex-wrap' : 'absolute bottom-8 left-1/2 z-40 flex -translate-x-1/2'} items-center gap-2 bg-[#252830] border border-gray-700 px-4 py-3 rounded-2xl shadow-2xl backdrop-blur-md`;

  return (
    <div className={className} data-toolbar-variant={resolvedVariant}>
      {FLOW_NODE_CATALOG_CATEGORIES.map((category) => (
        <NodeCategoryMenu
          category={category}
          compact={compact}
          imageTemplates={imageTemplates}
          key={category.id}
          onAddNode={onAddNode}
        />
      ))}
    </div>
  );
};

function NodeCategoryMenu({
  category,
  compact,
  imageTemplates,
  onAddNode,
}: {
  category: FlowNodeCatalogCategory;
  compact: boolean;
  imageTemplates: ImageNodeTemplate[];
  onAddNode: (type: FlowNodeType, initialData?: Partial<NodeData>) => void;
}) {
  const entries = getNodeCatalogEntriesForCategory(category.id);
  const menuClassName = compact
    ? 'absolute left-1/2 top-9 z-50 w-80 -translate-x-1/2 rounded-lg border border-gray-700 bg-[#10151f] p-2 shadow-2xl'
    : 'absolute bottom-12 left-0 z-50 w-80 rounded-lg border border-gray-700 bg-[#10151f] p-2 shadow-2xl';

  const closeMenu = (target: EventTarget | null) => {
    const details = target instanceof Element ? target.closest('details') : null;
    if (details instanceof HTMLDetailsElement) {
      details.open = false;
    }
  };

  return (
    <details className="relative" data-node-category-menu="true">
      <summary
        aria-label={`Open ${category.label} node category`}
        className={compact
          ? 'theme-icon-button flex h-8 cursor-pointer list-none items-center gap-1 rounded-md border border-transparent px-2 text-cyan-100/75 transition-colors hover:border-cyan-300/25 hover:bg-cyan-400/10 hover:text-white [&::-webkit-details-marker]:hidden'
          : 'theme-button flex cursor-pointer list-none items-center gap-2 rounded-xl border border-transparent px-3 py-2 text-sm text-gray-300 transition-all duration-200 hover:border-gray-600 hover:bg-gray-700/50 hover:text-white [&::-webkit-details-marker]:hidden'}
        title={category.description}
      >
        {CATEGORY_ICONS[category.id]}
        <span className={compact ? 'hidden 2xl:inline' : undefined}>{category.label}</span>
        <ChevronDown size={13} />
      </summary>
      <div className={menuClassName}>
        <div className="px-2 pb-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">{category.label}</div>
          <div className="mt-1 text-[11px] leading-4 text-gray-400">{category.description}</div>
        </div>
        <div className="grid max-h-[62vh] gap-1 overflow-y-auto pr-1">
          {entries.map((entry) => (
            <NodeEntryButton
              entry={entry}
              key={entry.type}
              onAdd={(event) => {
                onAddNode(entry.type, entry.initialData);
                closeMenu(event.currentTarget);
              }}
            />
          ))}
          {category.id === 'generate' ? (
            <ImageTemplateMenuItems
              closeMenu={closeMenu}
              onAddNode={onAddNode}
              templates={imageTemplates}
            />
          ) : null}
        </div>
      </div>
    </details>
  );
}

function NodeEntryButton({ entry, onAdd }: { entry: FlowNodeCatalogEntry; onAdd: (event: React.MouseEvent<HTMLButtonElement>) => void }) {
  return (
    <button
      aria-label={`Add ${entry.label} node`}
      className="rounded-md px-2.5 py-2 text-left transition-colors hover:bg-blue-500/10"
      onClick={onAdd}
      title={`Add ${entry.label} node`}
      type="button"
    >
      <span className="block text-xs font-semibold text-gray-100">{entry.label}</span>
      <span className="mt-0.5 block text-[10px] leading-4 text-gray-400">{entry.description}</span>
    </button>
  );
}

function ImageTemplateMenuItems({
  closeMenu,
  onAddNode,
  templates,
}: {
  closeMenu: (target: EventTarget | null) => void;
  onAddNode: (type: FlowNodeType, initialData?: Partial<NodeData>) => void;
  templates: ImageNodeTemplate[];
}) {
  return (
    <div className="mt-1 border-t border-gray-700/60 pt-1" data-image-provider-menu="true">
      <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">
        Image model templates
      </div>
      {templates.map((template) => (
        <button
          aria-label={`Add ${template.label} image node`}
          className="w-full rounded-md px-2.5 py-2 text-left transition-colors hover:bg-blue-500/10"
          key={template.id}
          onClick={(event) => {
            onAddNode('imageGen', createImageNodeTemplateDataPatch(template.id));
            closeMenu(event.currentTarget);
          }}
          title={`Add ${template.label} image node`}
          type="button"
        >
          <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-100"><Image size={12} />{template.label}</span>
          <span className="mt-0.5 block text-[10px] leading-4 text-gray-400">{template.description}</span>
          <span className="mt-1 flex flex-wrap gap-1">
            {template.highlights.map((highlight) => (
              <span
                className="rounded border border-gray-700/70 bg-[#0d1118] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-gray-400"
                key={highlight}
              >
                {highlight}
              </span>
            ))}
          </span>
        </button>
      ))}
    </div>
  );
}
