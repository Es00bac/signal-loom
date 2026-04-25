import { useRef, useState, type ReactNode } from 'react';
import { Archive, ChevronDown, ChevronLeft, ChevronRight, Film, Image as ImageIcon, Music2, Plus, Star, Trash2, Type } from 'lucide-react';
import { useSourceBinStore } from '../../store/sourceBinStore';
import { useFlowStore } from '../../store/flowStore';
import type { SourceBinLibraryItem } from '../../store/sourceBinStore';
import { getSourceBinPreviewKind, sortSourceBinItemsForDisplay } from '../../lib/sourceBinLayout';
import { MediaPreviewModal } from '../Nodes/MediaPreviewModal';

export function FlowSourceBinSidebar() {
  const items = useSourceBinStore((state) => state.items);
  const sidebarOpen = useSourceBinStore((state) => state.sidebarOpen);
  const toggleSidebar = useSourceBinStore((state) => state.toggleSidebar);
  const importFiles = useSourceBinStore((state) => state.importFiles);
  const removeItem = useSourceBinStore((state) => state.removeItem);
  const toggleItemStarred = useSourceBinStore((state) => state.toggleItemStarred);
  const setItemCollapsed = useSourceBinStore((state) => state.setItemCollapsed);
  const setAllItemsCollapsed = useSourceBinStore((state) => state.setAllItemsCollapsed);
  const removeEditorSourceReferences = useFlowStore((state) => state.removeEditorSourceReferences);
  const [accept, setAccept] = useState('image/*,video/*,audio/*');
  const [previewItem, setPreviewItem] = useState<{
    kind: 'image' | 'video';
    src: string;
    label: string;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const orderedItems = sortSourceBinItemsForDisplay(items);

  const openImportPicker = (nextAccept: string) => {
    setAccept(nextAccept);
    if (inputRef.current) {
      inputRef.current.value = '';
      inputRef.current.click();
    }
  };

  const handleRemoveItem = (item: SourceBinLibraryItem) => {
    const confirmed = window.confirm(
      `Remove "${item.label}" from this project's saved source library? Timeline clips that depend on it will also be removed.`,
    );

    if (!confirmed) {
      return;
    }

    removeItem(item.id);
    removeEditorSourceReferences(item.originNodeId ?? item.id);
  };

  const openPreview = (item: SourceBinLibraryItem) => {
    const previewKind = getSourceBinPreviewKind(item);

    if (!previewKind || !item.assetUrl) {
      return;
    }

    setPreviewItem({
      kind: previewKind,
      src: item.assetUrl,
      label: item.label,
    });
  };

  return (
    <aside
      className={`absolute bottom-24 left-4 top-20 z-20 flex overflow-hidden rounded-2xl border border-gray-700/60 bg-[#10151f]/95 shadow-2xl backdrop-blur transition-[width] duration-200 ${
        sidebarOpen ? 'w-[22rem]' : 'w-14'
      }`}
    >
      <button
        className="flex w-14 shrink-0 flex-col items-center gap-3 border-r border-gray-700/60 bg-[#0d1118] py-4 text-gray-300 transition-colors hover:text-white"
        onClick={toggleSidebar}
        type="button"
      >
        <Archive size={18} />
        {sidebarOpen ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
      </button>

      {sidebarOpen ? (
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="border-b border-gray-700/60 px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-blue-200/80">
                  Project Source Bin
                </div>
                <div className="mt-1 text-base font-semibold text-white">Saved Project Library</div>
              </div>
              <div className="rounded-full border border-gray-700/60 bg-[#111217]/60 px-3 py-1 text-xs text-gray-300">
                {items.length} item{items.length === 1 ? '' : 's'}
              </div>
            </div>
            <div className="mt-2 text-xs leading-5 text-gray-400">
              Anything added here stays with the current project and can be dragged back onto the flow canvas as a reusable source node.
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <ImportChip label="Media" onClick={() => openImportPicker('image/*,video/*,audio/*')} />
              <ImportChip label="Image" onClick={() => openImportPicker('image/*')} />
              <ImportChip label="Video" onClick={() => openImportPicker('video/*')} />
              <ImportChip label="Audio" onClick={() => openImportPicker('audio/*')} />
              {items.length > 0 ? (
                <>
                  <SourceBinActionChip icon={<ChevronRight size={12} />} label="Collapse All" onClick={() => setAllItemsCollapsed(true)} />
                  <SourceBinActionChip icon={<ChevronDown size={12} />} label="Expand All" onClick={() => setAllItemsCollapsed(false)} />
                </>
              ) : null}
            </div>
            <input
              accept={accept}
              className="hidden"
              multiple
              onChange={(event) => {
                if (event.target.files?.length) {
                  void importFiles(event.target.files);
                }
              }}
              ref={inputRef}
              type="file"
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <div className="space-y-3">
              {orderedItems.length > 0 ? (
                orderedItems.map((item) => (
                  <SourceLibraryCard
                    item={item}
                    key={item.id}
                    onOpenPreview={() => openPreview(item)}
                    onRemove={() => handleRemoveItem(item)}
                    onToggleCollapsed={() => setItemCollapsed(item.id, !item.collapsed)}
                    onToggleStarred={() => toggleItemStarred(item.id)}
                  />
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-gray-700/60 bg-[#111217]/35 p-4 text-sm text-gray-400">
                  Connect outputs into any source-bin node or import media directly here to build the current project's source library.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
      {previewItem ? (
        <MediaPreviewModal
          kind={previewItem.kind}
          label={previewItem.label}
          onClose={() => setPreviewItem(null)}
          src={previewItem.src}
        />
      ) : null}
    </aside>
  );
}

function SourceLibraryCard({
  item,
  onOpenPreview,
  onRemove,
  onToggleCollapsed,
  onToggleStarred,
}: {
  item: SourceBinLibraryItem;
  onOpenPreview: () => void;
  onRemove: () => void;
  onToggleCollapsed: () => void;
  onToggleStarred: () => void;
}) {
  const isCollapsed = Boolean(item.collapsed);
  const isStarred = Boolean(item.starred);

  return (
    <div
      className="cursor-grab rounded-xl border border-gray-700/60 bg-[#111217]/45 p-3 text-left active:cursor-grabbing"
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'copy';
        event.dataTransfer.setData('application/x-flow-source-bin-item', JSON.stringify({ itemId: item.id }));
      }}
    >
      <div className="flex items-start gap-2">
        <button
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-gray-700/60 bg-[#0d0f15] text-gray-300 transition-colors hover:border-gray-500 hover:text-white"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onToggleCollapsed();
          }}
          title={isCollapsed ? 'Expand item' : 'Collapse item'}
          type="button"
        >
          {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
        </button>
        <button
          className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition-colors ${
            isStarred
              ? 'border-amber-300/40 bg-amber-400/15 text-amber-200'
              : 'border-gray-700/60 bg-[#0d0f15] text-gray-400 hover:border-gray-500 hover:text-white'
          }`}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onToggleStarred();
          }}
          title={isStarred ? 'Unstar item' : 'Star item'}
          type="button"
        >
          <Star fill={isStarred ? 'currentColor' : 'none'} size={13} />
        </button>
        {!isCollapsed ? (
          <button
            className="overflow-hidden rounded-lg border border-gray-700/60 bg-[#0d0f15]"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onOpenPreview();
            }}
            type="button"
          >
            <SourceLibraryPreview item={item} />
          </button>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5">
              {isStarred ? <Star className="shrink-0 text-amber-200" fill="currentColor" size={11} /> : null}
              <span className="truncate text-sm font-medium text-gray-100">{item.label}</span>
            </div>
            <button
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-red-500/25 bg-red-500/10 text-red-100 transition-colors hover:border-red-400/60 hover:bg-red-500/20"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onRemove();
              }}
              type="button"
            >
              <Trash2 size={12} />
            </button>
          </div>
          <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-gray-500">{item.kind}</div>
          {!isCollapsed ? (
          <div className="mt-2 inline-flex items-center gap-1 rounded-full border border-gray-700/60 bg-[#0d0f15] px-2 py-1 text-[11px] text-gray-300">
            <Plus size={10} />
            Drag to flow
          </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SourceLibraryPreview({ item }: { item: SourceBinLibraryItem }) {
  if (item.kind === 'image' && item.assetUrl) {
    return <img alt={item.label} className="h-16 w-24 object-cover" src={item.assetUrl} />;
  }

  if ((item.kind === 'video' || item.kind === 'composition') && item.assetUrl) {
    return <video className="h-16 w-24 object-cover" muted preload="metadata" src={item.assetUrl} />;
  }

  if (item.kind === 'audio') {
    return (
      <div className="flex h-16 w-24 items-center justify-center bg-[#0d0f15] text-cyan-200">
        <Music2 size={18} />
      </div>
    );
  }

  return (
    <div className="flex h-16 w-24 items-center justify-center bg-[#0d0f15] text-cyan-200">
      <Type size={18} />
    </div>
  );
}

function ImportChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      className="inline-flex items-center gap-2 rounded-xl border border-gray-700/60 bg-[#0f131b] px-3 py-2 text-xs font-semibold text-gray-200 transition-colors hover:border-gray-500 hover:text-white"
      onClick={onClick}
      type="button"
    >
      {label === 'Image' ? <ImageIcon size={12} /> : label === 'Video' ? <Film size={12} /> : label === 'Audio' ? <Music2 size={12} /> : <Archive size={12} />}
      Import {label}
    </button>
  );
}

function SourceBinActionChip({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      className="inline-flex items-center gap-2 rounded-xl border border-gray-700/60 bg-[#0f131b] px-3 py-2 text-xs font-semibold text-gray-200 transition-colors hover:border-gray-500 hover:text-white"
      onClick={onClick}
      type="button"
    >
      {icon}
      {label}
    </button>
  );
}
