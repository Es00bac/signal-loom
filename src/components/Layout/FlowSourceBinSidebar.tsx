import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import {
  Archive,
  Captions,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  Film,
  Image as ImageIcon,
  Music2,
  Package,
  Plus,
  RefreshCw,
  Search,
  Star,
  Trash2,
  Type,
  X,
} from 'lucide-react';
import { useSourceBinStore } from '../../store/sourceBinStore';
import { useConfirmationStore } from '../../store/confirmationStore';
import { useTextInputDialogStore } from '../../store/textInputDialogStore';
import { showAlertDialog } from '../../store/alertDialogStore';
import { useFlowStore } from '../../store/flowStore';
import { useEditorStore } from '../../store/editorStore';
import { useImageEditorStore } from '../../store/imageEditorStore';
import { usePaperStore } from '../../store/paperStore';
import { useDockablePanelStore } from '../../store/dockablePanelStore';
import { resolveSourceNodeId } from '../../lib/virtualNodes';
import type { SourceBin, SourceBinLibraryItem } from '../../store/sourceBinStore';
import type { AppNode } from '../../types/flow';
import {
  buildSourceLibraryDisplayRows,
  getSourceBinPreviewKind,
  filterSourceBinsForDisplay,
  getSourceLibraryDisplayRowHeight,
  resolveSourceBinSidebarPresentation,
  sortSourceBinItemsForDisplay,
} from '../../lib/sourceBinLayout';
import type { SourceLibraryDisplayRow } from '../../lib/sourceBinLayout';
import { SharedContextMenu } from '../Common/SharedContextMenu';
import type { SharedContextMenuItem } from '../../lib/sharedContextMenu';
import { MediaPreviewModal } from '../Nodes/MediaPreviewModal';
import { openSourceLibraryImageDocument } from '../../lib/sourceLibraryImageOpen';
import { VirtualizedSourceBinList } from './VirtualizedSourceBinList';
import {
  resolveSourceLibraryPrimaryAction,
  SOURCE_LIBRARY_DRAG_MIME,
  type SourceLibraryWorkspaceId,
} from '../../lib/sourceLibraryWorkspaceActions';
import { getAcceptStringForAllImportableFormats, getAcceptStringForKinds } from '../../lib/mediaFormatRegistry';

const ALL_SOURCE_IMPORT_ACCEPT = getAcceptStringForAllImportableFormats();
const MEDIA_SOURCE_IMPORT_ACCEPT = getAcceptStringForKinds(['image', 'video', 'audio']);
const IMAGE_SOURCE_IMPORT_ACCEPT = getAcceptStringForKinds(['image']);
const VIDEO_SOURCE_IMPORT_ACCEPT = getAcceptStringForKinds(['video']);
const AUDIO_SOURCE_IMPORT_ACCEPT = getAcceptStringForKinds(['audio']);
const DOCUMENT_SOURCE_IMPORT_ACCEPT = getAcceptStringForKinds(['document']);
const SUBTITLE_SOURCE_IMPORT_ACCEPT = getAcceptStringForKinds(['subtitle']);
const PACKAGE_SOURCE_IMPORT_ACCEPT = getAcceptStringForKinds(['package']);
const GENERATED_POOL_ROW_HEIGHT = 124;
const GENERATED_POOL_COLLAPSED_ROW_HEIGHT = 76;
const SOURCE_LIBRARY_ROW_HEIGHT = 124;
const SOURCE_LIBRARY_VIRTUALIZATION_ROW_THRESHOLD = 18;

interface FlowSourceBinSidebarProps {
  dockable?: boolean;
  workspaceId?: SourceLibraryWorkspaceId;
}

type SourcePanelMode = 'source-library' | 'generated-pool';
type GeneratedPoolKindFilter = 'all' | 'audio' | 'image' | 'video';

export function FlowSourceBinSidebar({ dockable = false, workspaceId }: FlowSourceBinSidebarProps) {
  const [sidebarMode, setSidebarMode] = useState<SourcePanelMode>('source-library');
  const [generatedPoolKindFilter, setGeneratedPoolKindFilter] = useState<GeneratedPoolKindFilter>('all');
  const editorWorkspaceView = useEditorStore((state) => state.workspaceView);
  const workspaceView = workspaceId ?? editorWorkspaceView;
  const openImageDocument = useImageEditorStore((state) => state.openDocument);
  const placePaperSourceAsset = usePaperStore((state) => state.placeSourceAsset);
  const collapsePanel = useDockablePanelStore((state) => state.collapsePanel);
  const bins = useSourceBinStore((state) => state.bins);
  const sidebarOpen = useSourceBinStore((state) => state.sidebarOpen);
  const nativeSyncStatus = useSourceBinStore((state) => state.nativeSyncStatus);
  const toggleSidebar = useSourceBinStore((state) => state.toggleSidebar);
  const retryNativeSourceLibrarySync = useSourceBinStore((state) => state.retryNativeSourceLibrarySync);
  const createBin = useSourceBinStore((state) => state.createBin);
  const removeBin = useSourceBinStore((state) => state.removeBin);
  const renameBin = useSourceBinStore((state) => state.renameBin);
  const setBinCollapsed = useSourceBinStore((state) => state.setBinCollapsed);
  const importFiles = useSourceBinStore((state) => state.importFiles);
  const removeItem = useSourceBinStore((state) => state.removeItem);
  const renameItem = useSourceBinStore((state) => state.renameItem);
  const toggleItemStarred = useSourceBinStore((state) => state.toggleItemStarred);
  const setItemCollapsed = useSourceBinStore((state) => state.setItemCollapsed);
  const setEnvelopeCollapsed = useSourceBinStore((state) => state.setEnvelopeCollapsed);
  const setAllItemsCollapsed = useSourceBinStore((state) => state.setAllItemsCollapsed);
  const removeEditorSourceReferences = useFlowStore((state) => state.removeEditorSourceReferences);
  const runNode = useFlowStore((state) => state.runNode);
  const flowNodes = useFlowStore((state) => state.nodes);
  const sourceNodeById = useMemo(
    () => new Map<string, AppNode>(flowNodes.map((node) => [node.id, node])),
    [flowNodes],
  );
  const [accept, setAccept] = useState(ALL_SOURCE_IMPORT_ACCEPT);
  const [activeBinIdForImport, setActiveBinIdForImport] = useState<string | undefined>(undefined);
  const [previewItem, setPreviewItem] = useState<{
    kind: 'image' | 'video';
    src: string;
    label: string;
  } | null>(null);
  const [metadataItem, setMetadataItem] = useState<SourceBinLibraryItem | null>(null);
  const [renamingItemId, setRenamingItemId] = useState<string | null>(null);
  const [renamingItemDraft, setRenamingItemDraft] = useState('');
  const [sourceSearchQuery, setSourceSearchQuery] = useState('');
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    title: string;
    items: SharedContextMenuItem[];
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const allItems = useMemo(() => bins.flatMap((bin) => bin.items), [bins]);
  const generatedPoolItems = useMemo(
    () => allItems.filter((item) => isGeneratedPoolItem(item, sourceNodeById)),
    [allItems, sourceNodeById],
  );
  const filteredGeneratedItems = useMemo(
    () => {
      const query = sourceSearchQuery.trim().toLocaleLowerCase();
      return sortSourceBinItemsForDisplay(generatedPoolItems.filter((item) => (
        (generatedPoolKindFilter === 'all' || item.kind === generatedPoolKindFilter)
        && (!query || `${item.label} ${item.kind}`.toLocaleLowerCase().includes(query))
      )));
    },
    [generatedPoolItems, generatedPoolKindFilter, sourceSearchQuery],
  );
  const generatedPoolCounts = useMemo(() => ({
    all: generatedPoolItems.length,
    image: generatedPoolItems.filter((item) => item.kind === 'image').length,
    video: generatedPoolItems.filter((item) => item.kind === 'video').length,
    audio: generatedPoolItems.filter((item) => item.kind === 'audio').length,
  }), [generatedPoolItems]);
  const visibleBins = useMemo(
    () => filterSourceBinsForDisplay(bins, { kind: 'all', query: sourceSearchQuery }),
    [bins, sourceSearchQuery],
  );
  const visibleItemCount = useMemo(
    () => visibleBins.reduce((count, bin) => count + bin.items.length, 0),
    [visibleBins],
  );

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    const close = () => setContextMenu(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
      }
    };

    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [contextMenu]);

  const openImportPicker = (nextAccept: string, binId?: string) => {
    setAccept(nextAccept);
    setActiveBinIdForImport(binId);
    if (inputRef.current) {
      inputRef.current.value = '';
      inputRef.current.click();
    }
  };

  const handleLocateGeneratorNode = (item: SourceBinLibraryItem) => {
    if (!item.originNodeId) return;
    const baseNodeId = resolveSourceNodeId(item.originNodeId);
    if (!baseNodeId) return;

    if (workspaceView !== 'flow') {
      useEditorStore.getState().setWorkspaceView('flow');
    }

    setTimeout(() => {
      useFlowStore.getState().centerOnNode(baseNodeId);
    }, 100);

    setContextMenu(null);
  };

  const handleRemoveItem = async (item: SourceBinLibraryItem) => {
    const confirmed = await useConfirmationStore.getState().requestConfirmation(
      `Remove "${item.label}" from this project's saved source library? Timeline clips that depend on it will also be removed.`,
      'Remove Asset'
    );

    if (!confirmed) {
      return;
    }

    removeItem(item.id);
    removeEditorSourceReferences(resolveSourceNodeId(item.originNodeId) ?? item.id);
  };

  const handleRemoveGeneratedItem = async (item: SourceBinLibraryItem) => {
    const confirmed = await useConfirmationStore.getState().requestConfirmation(
      `Remove "${item.label}" from the generated pool?`,
      'Remove Generated Asset'
    );

    if (!confirmed) {
      return;
    }

    removeItem(item.id);
  };

  const handleRerunGeneratedItem = async (item: SourceBinLibraryItem) => {
    if (!isGeneratedPoolItem(item, sourceNodeById)) {
      return;
    }

    if (!item.originNodeId) {
      await showAlertDialog({
        title: 'Generated Asset Unlinked',
        message: 'This generated asset is not currently linked to a source node.',
        tone: 'warning',
      });
      return;
    }

    const sourceNode = sourceNodeById.get(resolveSourceNodeId(item.originNodeId) ?? '');
    if (!sourceNode) {
      await showAlertDialog({
        title: 'Source Node Missing',
        message: 'The source node for this generated asset is not available.',
        tone: 'warning',
      });
      return;
    }

    const shouldRerun = await useConfirmationStore.getState().requestConfirmation(
      `Regenerate only "${item.label}"? Other generated assets from this node will be reused if already available.`,
      'Regenerate Asset'
    );

    if (!shouldRerun) {
      return;
    }

    const removedItem = removeItem(item.id);
    if (!removedItem) {
      return;
    }

    void runNode(sourceNode.id);
  };

  const startRenameItem = (item: SourceBinLibraryItem) => {
    setContextMenu(null);
    setRenamingItemId(item.id);
    setRenamingItemDraft(item.label);
  };

  const commitRenameItem = (item: SourceBinLibraryItem, rawLabel = renamingItemDraft) => {
    const label = rawLabel.trim();
    setRenamingItemId(null);
    setRenamingItemDraft('');

    if (!label || label === item.label) {
      return;
    }

    renameItem(item.id, label);
  };

  const cancelRenameItem = () => {
    setRenamingItemId(null);
    setRenamingItemDraft('');
  };

  const copySourceReference = (item: SourceBinLibraryItem) => {
    const reference = item.nativeFilePath ?? item.scratchFileName ?? item.assetUrl ?? item.text;
    if (!reference || !navigator.clipboard?.writeText) {
      return;
    }

    void navigator.clipboard.writeText(reference);
  };

  const openItemContextMenu = (
    event: ReactMouseEvent<HTMLElement>,
    item: SourceBinLibraryItem,
    options?: { includeRerun?: boolean },
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const hasCopyableReference = Boolean(item.nativeFilePath ?? item.scratchFileName ?? item.assetUrl ?? item.text);
    const isGeneratedItem = isGeneratedPoolItem(item, sourceNodeById);

    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      title: item.label,
      items: [
        { id: 'open-preview', label: sourceLibraryPrimaryActionLabel(resolveSourceLibraryPrimaryAction(workspaceView, item)), action: () => openPreview(item) },
        { id: 'locate-node', label: 'Locate Generator Node', action: () => handleLocateGeneratorNode(item), hidden: !item.originNodeId },
        { id: 'rename', label: 'Rename', action: () => startRenameItem(item) },
        { id: 'toggle-star', label: item.starred ? 'Unstar' : 'Star', action: () => toggleItemStarred(item.id) },
        { id: 'toggle-collapse', label: item.collapsed ? 'Expand Details' : 'Collapse Details', action: () => setItemCollapsed(item.id, !item.collapsed) },
        { id: 'rerun-generated', label: 'Regenerate This Output', action: () => handleRerunGeneratedItem(item), hidden: !isGeneratedItem || !options?.includeRerun },
        { id: 'copy-reference', label: 'Copy Source Reference', action: () => copySourceReference(item), hidden: !hasCopyableReference },
        { id: 'metadata', label: 'Show Metadata', action: () => setMetadataItem(item) },
        {
          id: 'remove',
          label: isGeneratedItem ? 'Remove From Generated Pool' : 'Remove From Source Library',
          tone: 'danger',
          action: () => isGeneratedItem ? handleRemoveGeneratedItem(item) : handleRemoveItem(item),
        },
      ],
    });
  };

  const openEnvelopeContextMenu = (
    event: ReactMouseEvent<HTMLElement>,
    entry: { id: string; label: string; collapsed: boolean; items: SourceBinLibraryItem[] },
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      title: entry.label,
      items: [
        { id: 'toggle-envelope', label: entry.collapsed ? 'Expand Envelope' : 'Collapse Envelope', action: () => setEnvelopeCollapsed(entry.id, !entry.collapsed) },
        { id: 'preview-first', label: 'Preview First Item', action: () => entry.items[0] && openPreview(entry.items[0]), disabled: entry.items.length === 0 },
        { id: 'collapse-items', label: 'Collapse Child Details', action: () => entry.items.forEach((item) => setItemCollapsed(item.id, true)), disabled: entry.items.length === 0 },
        { id: 'expand-items', label: 'Expand Child Details', action: () => entry.items.forEach((item) => setItemCollapsed(item.id, false)), disabled: entry.items.length === 0 },
      ],
    });
  };

  const openPreview = (item: SourceBinLibraryItem) => {
    const action = resolveSourceLibraryPrimaryAction(workspaceView, item);
    if (action === 'place-paper') {
      placePaperSourceAsset(item);
      return;
    }

    if (action === 'open-image-editor') {
      void openSourceLibraryImageDocument({
        item,
        openDocument: openImageDocument,
        alertOnFailure: true,
      });
      return;
    }

    const previewKind = getSourceBinPreviewKind(item);

    if (!previewKind || !item.assetUrl) {
      setMetadataItem(item);
      return;
    }

    setPreviewItem({
      kind: previewKind,
      src: item.assetUrl,
      label: item.label,
    });
  };

  const handleCreateBin = async () => {
    const name = await useTextInputDialogStore.getState().requestTextInput({
      title: 'New Source Bin',
      message: 'Create a named bin for organizing project assets.',
      label: 'Bin name',
      initialValue: 'New Bin',
      placeholder: 'New Bin',
      confirmLabel: 'Create',
    });
    if (name !== null) {
      createBin(name.trim() || 'New Bin');
    }
  };

  const handleRenameBin = async (bin: SourceBin) => {
    const name = await useTextInputDialogStore.getState().requestTextInput({
      title: 'Rename Source Bin',
      message: `Rename "${bin.name}".`,
      label: 'Bin name',
      initialValue: bin.name,
      placeholder: bin.name,
      confirmLabel: 'Rename',
    });
    if (name !== null) {
      renameBin(bin.id, name.trim() || bin.name);
    }
  };

  const handleRemoveBin = async (bin: SourceBin) => {
    if (bins.length <= 1) {
      await showAlertDialog({
        title: 'Source Bin Required',
        message: 'You must keep at least one source bin.',
        tone: 'warning',
      });
      return;
    }
    const confirmed = await useConfirmationStore.getState().requestConfirmation(
      `Delete "${bin.name}"? Its items will be moved to your first bin.`,
      'Delete Bin'
    );
    if (confirmed) {
      removeBin(bin.id);
    }
  };

  const sidebarPresentation = resolveSourceBinSidebarPresentation({ dockable, sidebarOpen });
  const handleToggleSidebar = () => {
    if (sidebarPresentation.toggleAction === 'collapse-dock' && isSharedWorkspaceId(workspaceView)) {
      collapsePanel(workspaceView, 'source-bin');
      return;
    }
    toggleSidebar();
  };
  const sidebarWidthClassName = sidebarPresentation.widthClassName;
  const sidebarPlacementClassName = dockable
    ? 'flex h-full rounded-none border-0 shadow-none backdrop-blur-0'
    : `absolute z-40 flex ${workspaceView === 'image' || workspaceView === 'paper' ? 'left-16 top-28 bottom-16' : 'left-4 top-20 bottom-24'} rounded-2xl border border-gray-700/60 shadow-2xl backdrop-blur`;
  const isSourceLibraryMode = sidebarMode === 'source-library';
  const isGeneratedPoolMode = sidebarMode === 'generated-pool';
  const currentModeVisibleCount = isSourceLibraryMode ? visibleItemCount : filteredGeneratedItems.length;
  const renderGeneratedPoolItem = (item: SourceBinLibraryItem) => {
    const sourceNode = sourceNodeById.get(resolveSourceNodeId(item.originNodeId) ?? '');
    const canRerunGeneratedItem = isGeneratedPoolItem(item, sourceNodeById);

    return (
      <SourceLibraryCard
        isRenaming={renamingItemId === item.id}
        item={item}
        onCancelRename={cancelRenameItem}
        onCommitRename={(label) => commitRenameItem(item, label)}
        onOpenContextMenu={(event) => openItemContextMenu(event, item, { includeRerun: true })}
        onOpenPreview={() => openPreview(item)}
        onRemove={() => handleRemoveGeneratedItem(item)}
        onRename={() => startRenameItem(item)}
        onRenameDraftChange={setRenamingItemDraft}
        renameDraft={renamingItemDraft}
        onRerun={canRerunGeneratedItem ? () => handleRerunGeneratedItem(item) : undefined}
        onToggleCollapsed={() => setItemCollapsed(item.id, !item.collapsed)}
        onToggleStarred={() => toggleItemStarred(item.id)}
        showRerunButton={canRerunGeneratedItem}
        sourceNodeLabel={sourceNode ? sourceNode.id : item.originNodeId}
      />
    );
  };

  return (
    <aside
      className={`${sidebarPlacementClassName} ${sidebarWidthClassName} overflow-hidden bg-[#10151f]/95 transition-[width] duration-200`}
    >
      <button
        aria-label={dockable ? 'Collapse Source Bin panel' : sidebarPresentation.contentOpen ? 'Collapse Source Bin' : 'Expand Source Bin'}
        className="flex w-14 shrink-0 flex-col items-center gap-3 border-r border-gray-700/60 bg-[#0d1118] py-4 text-gray-300 transition-colors hover:text-white"
        onClick={handleToggleSidebar}
        type="button"
      >
        <Archive size={18} />
        {sidebarPresentation.contentOpen ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
      </button>

      {sidebarPresentation.contentOpen ? (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="border-b border-gray-700/60 px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-blue-200/80">
                  {isSourceLibraryMode ? 'Project Source Bins' : 'Generated Asset Pool'}
                </div>
                <div className="mt-1 text-base font-semibold text-white">
                  {isSourceLibraryMode ? 'Source Library' : 'Generated Outputs'}
                </div>
              </div>
              <div className="rounded-full border border-gray-700/60 bg-[#111217]/60 px-3 py-1 text-xs text-gray-300">
                {currentModeVisibleCount} item{currentModeVisibleCount === 1 ? '' : 's'}
              </div>
            </div>
            <div className="mt-2 text-xs leading-5 text-gray-400">
              {isSourceLibraryMode
                ? 'Organize assets into named bins. Anything added here stays with the current project and can be dragged back onto the flow canvas as a reusable source node.'
                : 'Browse generated outputs from flow nodes, delete bad ones, and rerun only what you removed.'}
            </div>
            {isSourceLibraryMode && nativeSyncStatus.state !== 'idle' && nativeSyncStatus.state !== 'synced' ? (
              <div
                className={`mt-3 rounded-lg border px-3 py-2 text-xs ${
                  nativeSyncStatus.state === 'degraded'
                    ? 'border-amber-300/40 bg-amber-500/10 text-amber-100'
                    : 'border-blue-300/40 bg-blue-500/10 text-blue-100'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold">
                      {nativeSyncStatus.state === 'degraded' ? 'Native sync needs repair' : 'Syncing native windows'}
                    </div>
                    <div className="mt-1 text-[11px] leading-4 opacity-80">
                      {nativeSyncStatus.message ?? 'Keeping Source Library changes aligned across workspace windows.'}
                    </div>
                  </div>
                  {nativeSyncStatus.state === 'degraded' ? (
                    <button
                      aria-label="Retry Source Library native sync"
                      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-amber-200/50 bg-amber-200/10 px-2 py-1 text-[11px] font-semibold text-amber-50 transition-colors hover:bg-amber-200/20"
                      onClick={retryNativeSourceLibrarySync}
                      type="button"
                    >
                      <RefreshCw size={12} />
                      Repair
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
            <div className="mt-2 flex items-center gap-2">
              <button
                className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors ${
                  isSourceLibraryMode
                    ? 'border-blue-200/60 bg-blue-200/15 text-blue-100'
                    : 'border-gray-700/70 bg-[#0d131d] text-gray-300 hover:text-white'
                }`}
                onClick={() => setSidebarMode('source-library')}
                type="button"
              >
                Source Library
              </button>
              <button
                className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors ${
                  isGeneratedPoolMode
                    ? 'border-blue-200/60 bg-blue-200/15 text-blue-100'
                    : 'border-gray-700/70 bg-[#0d131d] text-gray-300 hover:text-white'
                }`}
                onClick={() => setSidebarMode('generated-pool')}
                type="button"
              >
                Generated Pool
              </button>
            </div>
            <label className="mt-3 flex items-center gap-2 rounded-md border border-gray-700/60 bg-[#0b1018] px-2.5 py-2 text-xs text-gray-300 focus-within:border-blue-300/60">
              <Search size={14} className="shrink-0 text-blue-200/70" />
              <input
                aria-label={isSourceLibraryMode ? 'Search source library' : 'Search generated pool'}
                className="min-w-0 flex-1 bg-transparent text-sm text-gray-100 outline-none placeholder:text-gray-500"
                onChange={(event) => setSourceSearchQuery(event.target.value)}
                placeholder={isSourceLibraryMode ? 'Search sources' : 'Search generated assets'}
                value={sourceSearchQuery}
              />
              {sourceSearchQuery ? (
                <button
                  aria-label="Clear search"
                  className="rounded-md p-1 text-gray-500 transition-colors hover:text-white"
                  onClick={() => setSourceSearchQuery('')}
                  type="button"
                >
                  <X size={13} />
                </button>
              ) : null}
            </label>
            {sourceSearchQuery.trim() ? (
              <div className="mt-2 text-[11px] text-gray-500">
                Showing {currentModeVisibleCount} of {isSourceLibraryMode ? allItems.length : generatedPoolItems.length}
              </div>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {isSourceLibraryMode ? (
                <>
                  <button
                    className="inline-flex items-center gap-2 rounded-xl border border-gray-700/60 bg-[#0f131b] px-3 py-2 text-xs font-semibold text-gray-200 transition-colors hover:border-gray-500 hover:text-white"
                    onClick={handleCreateBin}
                    type="button"
                  >
                    <Plus size={12} />
                    New Bin
                  </button>
                  {allItems.length > 0 ? (
                    <>
                      <SourceBinActionChip icon={<ChevronRight size={12} />} label="Collapse All" onClick={() => setAllItemsCollapsed(true)} />
                      <SourceBinActionChip icon={<ChevronDown size={12} />} label="Expand All" onClick={() => setAllItemsCollapsed(false)} />
                    </>
                  ) : null}
                </>
              ) : (
                <>
                  <GeneratedPoolFilterButton
                    active={generatedPoolKindFilter === 'all'}
                    count={generatedPoolCounts.all}
                    icon={<Package size={12} />}
                    label="All"
                    onClick={() => setGeneratedPoolKindFilter('all')}
                  />
                  <GeneratedPoolFilterButton
                    active={generatedPoolKindFilter === 'image'}
                    count={generatedPoolCounts.image}
                    icon={<ImageIcon size={12} />}
                    label="Images"
                    onClick={() => setGeneratedPoolKindFilter('image')}
                  />
                  <GeneratedPoolFilterButton
                    active={generatedPoolKindFilter === 'video'}
                    count={generatedPoolCounts.video}
                    icon={<Film size={12} />}
                    label="Videos"
                    onClick={() => setGeneratedPoolKindFilter('video')}
                  />
                  <GeneratedPoolFilterButton
                    active={generatedPoolKindFilter === 'audio'}
                    count={generatedPoolCounts.audio}
                    icon={<Music2 size={12} />}
                    label="Audio"
                    onClick={() => setGeneratedPoolKindFilter('audio')}
                  />
                </>
              )}
            </div>
            <input
              accept={accept}
              className="hidden"
              data-source-library-import-input="true"
              multiple
              onChange={(event) => {
                if (event.target.files?.length) {
                  void importFiles(event.target.files, activeBinIdForImport);
                }
              }}
              ref={inputRef}
              type="file"
            />
          </div>

          <div className="min-h-0 flex-1 p-4">
            {isSourceLibraryMode ? (
              <div className="h-full overflow-y-auto">
                <div className="space-y-4">
                  {visibleBins.length > 0 ? (
                    visibleBins.map((bin) => (
                      <SourceBinSection
                        bin={bin}
                        key={bin.id}
                        onImport={(acceptFilter) => openImportPicker(acceptFilter, bin.id)}
                        onOpenPreview={openPreview}
                        onRemoveBin={() => handleRemoveBin(bin)}
                        onRenameBin={() => handleRenameBin(bin)}
                        onRemoveItem={handleRemoveItem}
                        onOpenEnvelopeContextMenu={openEnvelopeContextMenu}
                        onOpenItemContextMenu={(event, item) => openItemContextMenu(event, item, { includeRerun: true })}
                        onCancelRenameItem={cancelRenameItem}
                        onCommitRenameItem={commitRenameItem}
                        onRenameItem={startRenameItem}
                        onRenameItemDraftChange={setRenamingItemDraft}
                        renamingItemDraft={renamingItemDraft}
                        renamingItemId={renamingItemId}
                        onToggleEnvelopeCollapsed={setEnvelopeCollapsed}
                        onToggleBinCollapsed={() => setBinCollapsed(bin.id, !bin.collapsed)}
                        onToggleItemCollapsed={setItemCollapsed}
                        onToggleItemStarred={toggleItemStarred}
                      />
                    ))
                  ) : (
                    <div className="rounded-xl border border-dashed border-gray-700/60 bg-[#111217]/35 p-4 text-sm text-gray-400">
                      {bins.length > 0
                        ? 'No source assets match that search.'
                        : "Connect outputs into any source-bin node or import media directly here to build the current project's source library."}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              filteredGeneratedItems.length > 0 ? (
              <div className="h-full" data-source-library-generated-list="">
                <VirtualizedSourceBinList
                  className="h-full pr-1"
                  getItemHeight={(item) => (item.collapsed ? GENERATED_POOL_COLLAPSED_ROW_HEIGHT : GENERATED_POOL_ROW_HEIGHT)}
                  initialHeight={480}
                  items={filteredGeneratedItems}
                  rowHeight={GENERATED_POOL_ROW_HEIGHT}
                  renderRow={(item) => renderGeneratedPoolItem(item)}
                />
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-gray-700/60 bg-[#111217]/35 p-4 text-sm text-gray-400">
                  {generatedPoolItems.length === 0
                    ? 'No generated assets have been created yet.'
                    : `No generated ${generatedPoolKindFilter === 'all' ? 'assets' : `${generatedPoolKindFilter}s`} match that search.`}
                </div>
              )
            )}
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
      {metadataItem ? <SourceMetadataDialog item={metadataItem} onClose={() => setMetadataItem(null)} /> : null}
      {contextMenu ? (
        <SharedContextMenu
          ariaLabel="Source library context menu"
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
          title={contextMenu.title}
          x={contextMenu.x}
          y={contextMenu.y}
        />
      ) : null}
    </aside>
  );
}

function sourceLibraryPrimaryActionLabel(action: ReturnType<typeof resolveSourceLibraryPrimaryAction>): string {
  if (action === 'place-paper') return 'Place / Open';
  if (action === 'open-image-editor') return 'Open In Image Editor';
  return 'Preview / Details';
}

function isFlowGeneratedSourceNode(sourceNode?: AppNode): boolean {
  if (
    !sourceNode
    || (sourceNode.type !== 'imageGen' && sourceNode.type !== 'cropImageNode' && sourceNode.type !== 'videoGen' && sourceNode.type !== 'audioGen')
  ) {
    return false;
  }

  if (sourceNode.type === 'cropImageNode') {
    return true;
  }

  return (sourceNode.data.mediaMode ?? 'generate') === 'generate';
}

function isGeneratedPoolItem(item: SourceBinLibraryItem, sourceNodeById: Map<string, AppNode>): boolean {
  if (item.kind !== 'image' && item.kind !== 'video' && item.kind !== 'audio') {
    return false;
  }

  if (item.envelopeId) {
    return true;
  }

  if (item.isGenerated === true) {
    return true;
  }

  if (item.isGenerated === false) {
    return false;
  }

  const sourceNodeId = resolveSourceNodeId(item.originNodeId);
  const sourceNode = sourceNodeId ? sourceNodeById.get(sourceNodeId) : undefined;
  if (sourceNode) {
    if (sourceNode.type === 'envelope' || sourceNode.type === 'list' || sourceNode.type === 'expander') {
      return true;
    }
    return isFlowGeneratedSourceNode(sourceNode);
  }

  return false;
}

function isSharedWorkspaceId(value: string): value is 'flow' | 'image' | 'paper' {
  return value === 'flow' || value === 'image' || value === 'paper';
}

function SourceMetadataDialog({ item, onClose }: { item: SourceBinLibraryItem; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-gray-700/70 bg-[#10151f] p-4 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">Source Metadata</div>
            <div className="mt-1 truncate text-base font-semibold text-white">{item.label}</div>
          </div>
          <button className="rounded-lg border border-gray-700/60 px-2 py-1 text-xs text-gray-300 hover:text-white" onClick={onClose} type="button">
            Close
          </button>
        </div>
        <div className="mt-4 space-y-2 text-sm text-gray-300">
          <MetadataRow label="Kind" value={item.kind} />
          <MetadataRow label="MIME" value={item.mimeType ?? 'Unknown'} />
          <MetadataRow label="Path" value={item.nativeFilePath ?? item.scratchFileName ?? item.assetUrl ?? 'Project asset'} />
        </div>
      </div>
    </div>
  );
}

function MetadataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-700/50 bg-[#0d0f15]/70 px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.16em] text-gray-500">{label}</div>
      <div className="mt-1 break-all text-xs text-gray-200">{value}</div>
    </div>
  );
}

function SourceBinSection({
  bin,
  onCancelRenameItem,
  onCommitRenameItem,
  onImport,
  onOpenEnvelopeContextMenu,
  onOpenItemContextMenu,
  onOpenPreview,
  onRemoveBin,
  onRenameBin,
  onRemoveItem,
  onRenameItem,
  onRenameItemDraftChange,
  onToggleEnvelopeCollapsed,
  onToggleBinCollapsed,
  onToggleItemCollapsed,
  onToggleItemStarred,
  renamingItemDraft,
  renamingItemId,
}: {
  bin: SourceBin;
  onCancelRenameItem: () => void;
  onCommitRenameItem: (item: SourceBinLibraryItem, label?: string) => void;
  onImport: (accept: string) => void;
  onOpenEnvelopeContextMenu: (event: ReactMouseEvent<HTMLElement>, entry: Extract<SourceLibraryRow, { kind: 'envelope-header' }>) => void;
  onOpenItemContextMenu: (event: ReactMouseEvent<HTMLElement>, item: SourceBinLibraryItem, options?: { includeRerun?: boolean }) => void;
  onOpenPreview: (item: SourceBinLibraryItem) => void;
  onRemoveBin: () => void;
  onRenameBin: () => void;
  onRemoveItem: (item: SourceBinLibraryItem) => void;
  onRenameItem: (item: SourceBinLibraryItem) => void;
  onRenameItemDraftChange: (label: string) => void;
  onToggleEnvelopeCollapsed: (envelopeId: string, collapsed: boolean) => void;
  onToggleBinCollapsed: () => void;
  onToggleItemCollapsed: (id: string, collapsed: boolean) => void;
  onToggleItemStarred: (id: string) => void;
  renamingItemDraft: string;
  renamingItemId: string | null;
}) {
  const isCollapsed = Boolean(bin.collapsed);
  const orderedItems = useMemo(() => sortSourceBinItemsForDisplay(bin.items), [bin.items]);
  const rows = useMemo(() => buildSourceLibraryDisplayRows(orderedItems), [orderedItems]);
  const shouldVirtualizeRows = rows.length >= SOURCE_LIBRARY_VIRTUALIZATION_ROW_THRESHOLD;
  const itemCount = bin.items.length;
  const resolveRowKey = (row: SourceLibraryRow) => `${bin.id}:${row.key}`;

  const renderSourceLibraryRow = (row: SourceLibraryRow) => {
    if (row.kind === 'envelope-header') {
      return (
        <EnvelopeLibraryHeaderRow
          entry={row}
          onOpenContextMenu={onOpenEnvelopeContextMenu}
          onToggleEnvelopeCollapsed={() => onToggleEnvelopeCollapsed(row.id, !row.collapsed)}
        />
      );
    }

    const item = row.item;
    const card = (
      <SourceLibraryCard
        item={item}
        key={item.id}
        onOpenContextMenu={(event) => onOpenItemContextMenu(event, item, row.kind === 'envelope-item' ? { includeRerun: true } : undefined)}
        onOpenPreview={() => onOpenPreview(item)}
        onRemove={() => onRemoveItem(item)}
        onCancelRename={onCancelRenameItem}
        onCommitRename={(label) => onCommitRenameItem(item, label)}
        onRename={() => onRenameItem(item)}
        onRenameDraftChange={onRenameItemDraftChange}
        isRenaming={renamingItemId === item.id}
        renameDraft={renamingItemDraft}
        onToggleCollapsed={() => onToggleItemCollapsed(item.id, !item.collapsed)}
        onToggleStarred={() => onToggleItemStarred(item.id)}
      />
    );

    if (row.kind === 'envelope-item') {
      return <div className="pl-3">{card}</div>;
    }

    return card;
  };

  return (
    <div className="rounded-xl border border-gray-700/60 bg-[#111217]/45">
      <div
        className="flex items-center justify-between gap-2 px-3 py-2.5 cursor-context-menu"
        onContextMenu={(event) => {
          event.preventDefault();
          onRenameBin();
        }}
      >
        <button
          className="flex items-center gap-2 text-left"
          onClick={onToggleBinCollapsed}
          type="button"
        >
          {isCollapsed ? <ChevronRight size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
          <span className="text-sm font-semibold text-gray-100">{bin.name}</span>
          <span className="rounded-full border border-gray-700/60 bg-[#0d0f15] px-2 py-0.5 text-[10px] text-gray-400">
            {itemCount}
          </span>
        </button>
        <div className="flex items-center gap-1">
          <button
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-gray-400 transition-colors hover:text-white"
            onClick={(event) => {
              event.stopPropagation();
              onRenameBin();
            }}
            title="Rename bin"
            type="button"
          >
            <Type size={11} />
          </button>
          <button
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-gray-400 transition-colors hover:text-red-300"
            onClick={(event) => {
              event.stopPropagation();
              onRemoveBin();
            }}
            title="Delete bin"
            type="button"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {!isCollapsed ? (
        <div className="space-y-2 border-t border-gray-700/40 px-3 pb-3 pt-2">
          {orderedItems.length > 0 ? (
            shouldVirtualizeRows ? (
              <div className="max-h-[32rem] overflow-hidden" data-source-library-bin-list="">
                <VirtualizedSourceBinList
                  className="h-full pr-1"
                  getItemHeight={(row) => getSourceLibraryDisplayRowHeight(row)}
                  getItemKey={(row) => resolveRowKey(row)}
                  initialHeight={512}
                  items={rows}
                  rowHeight={SOURCE_LIBRARY_ROW_HEIGHT}
                  renderRow={(row) => renderSourceLibraryRow(row)}
                />
              </div>
            ) : (
              rows.map((row) => (
                <div key={resolveRowKey(row)}>
                  {renderSourceLibraryRow(row)}
                </div>
              ))
            )
          ) : (
            <div className="rounded-lg border border-dashed border-gray-700/60 bg-[#0d0f15]/50 px-3 py-3 text-center text-[11px] text-gray-500">
              Empty bin — import or generate media to fill it
            </div>
          )}
          <div className="flex flex-wrap gap-1.5 pt-1">
            <MiniImportChip label="All" onClick={() => onImport(ALL_SOURCE_IMPORT_ACCEPT)} />
            <MiniImportChip label="Media" onClick={() => onImport(MEDIA_SOURCE_IMPORT_ACCEPT)} />
            <MiniImportChip label="Image" onClick={() => onImport(IMAGE_SOURCE_IMPORT_ACCEPT)} />
            <MiniImportChip label="Video" onClick={() => onImport(VIDEO_SOURCE_IMPORT_ACCEPT)} />
            <MiniImportChip label="Audio" onClick={() => onImport(AUDIO_SOURCE_IMPORT_ACCEPT)} />
            <MiniImportChip label="Document" onClick={() => onImport(DOCUMENT_SOURCE_IMPORT_ACCEPT)} />
            <MiniImportChip label="Subtitle" onClick={() => onImport(SUBTITLE_SOURCE_IMPORT_ACCEPT)} />
            <MiniImportChip label="Package" onClick={() => onImport(PACKAGE_SOURCE_IMPORT_ACCEPT)} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

type SourceLibraryRow = SourceLibraryDisplayRow<SourceBinLibraryItem>;

function EnvelopeLibraryHeaderRow({
  entry,
  onOpenContextMenu,
  onToggleEnvelopeCollapsed,
}: {
  entry: Extract<SourceLibraryRow, { kind: 'envelope-header' }>;
  onOpenContextMenu: (event: ReactMouseEvent<HTMLElement>, entry: Extract<SourceLibraryRow, { kind: 'envelope-header' }>) => void;
  onToggleEnvelopeCollapsed: () => void;
}) {
  return (
    <div
      className="rounded-xl border border-purple-400/25 bg-purple-500/10 px-3 py-2"
      onContextMenu={(event) => onOpenContextMenu(event, entry)}
    >
      <button
        className="flex min-w-0 items-center gap-2 text-left"
        onClick={onToggleEnvelopeCollapsed}
        type="button"
      >
        {entry.collapsed ? <ChevronRight size={14} className="shrink-0 text-purple-100/65" /> : <ChevronDown size={14} className="shrink-0 text-purple-100/65" />}
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-purple-100">{entry.label}</span>
          <span className="block text-[10px] uppercase tracking-[0.16em] text-purple-200/55">
            Envelope · {entry.itemCount} item{entry.itemCount === 1 ? '' : 's'}
          </span>
        </span>
      </button>
    </div>
  );
}

function SourceLibraryCard({
  isRenaming,
  item,
  onCancelRename,
  onCommitRename,
  onOpenContextMenu,
  onOpenPreview,
  onRemove,
  onRename,
  onRenameDraftChange,
  renameDraft,
  onToggleCollapsed,
  onToggleStarred,
  onRerun,
  showRerunButton,
  sourceNodeLabel,
}: {
  isRenaming: boolean;
  item: SourceBinLibraryItem;
  onCancelRename: () => void;
  onCommitRename: (label: string) => void;
  onOpenContextMenu: (event: ReactMouseEvent<HTMLElement>) => void;
  onOpenPreview: () => void;
  onRemove: () => void;
  onRename: () => void;
  onRenameDraftChange: (label: string) => void;
  renameDraft: string;
  onToggleCollapsed: () => void;
  onToggleStarred: () => void;
  onRerun?: () => void;
  showRerunButton?: boolean;
  sourceNodeLabel?: string | null;
}) {
  const isCollapsed = Boolean(item.collapsed);
  const isStarred = Boolean(item.starred);

  return (
    <div
      className="cursor-grab rounded-lg border border-gray-700/60 bg-[#0d0f15]/60 p-2 text-left transition-colors hover:border-gray-600/80 active:cursor-grabbing"
      draggable={!isRenaming}
      onClick={() => {
        if (!isRenaming) {
          onOpenPreview();
        }
      }}
      onContextMenu={onOpenContextMenu}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'copy';
        event.dataTransfer.setData(SOURCE_LIBRARY_DRAG_MIME, JSON.stringify({ itemId: item.id }));
      }}
    >
      <div className={`grid items-center gap-2 ${isCollapsed ? 'grid-cols-[auto_minmax(0,1fr)_auto]' : 'grid-cols-[auto_auto_minmax(0,1fr)_auto]'}`}>
        <div className="flex shrink-0 flex-col gap-1">
          <button
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-700/60 bg-[#0d0f15] text-gray-300 transition-colors hover:border-gray-500 hover:text-white"
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
            className={`inline-flex h-7 w-7 items-center justify-center rounded-md border transition-colors ${
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
        </div>
        {!isCollapsed ? (
          <button
            className="overflow-hidden rounded-md border border-gray-700/60 bg-[#0d0f15]"
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
          <div className="flex min-w-0 items-center gap-1.5">
              {isStarred ? <Star className="shrink-0 text-amber-200" fill="currentColor" size={11} /> : null}
              {isRenaming ? (
                <form
                  className="min-w-0 flex-1"
                  onSubmit={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onCommitRename(renameDraft);
                  }}
                >
                  <input
                    autoFocus
                    className="w-full rounded-md border border-cyan-300/45 bg-[#05080d] px-2 py-1 text-sm font-medium text-white outline-none ring-2 ring-cyan-300/20"
                    onBlur={() => onCommitRename(renameDraft)}
                    onChange={(event) => onRenameDraftChange(event.target.value)}
                    onClick={(event) => event.stopPropagation()}
                    onFocus={(event) => event.currentTarget.select()}
                    onKeyDown={(event) => {
                      event.stopPropagation();
                      if (event.key === 'Escape') {
                        event.preventDefault();
                        onCancelRename();
                      }
                    }}
                    onPointerDown={(event) => event.stopPropagation()}
                    value={renameDraft}
                  />
                </form>
              ) : (
                <span className="truncate text-sm font-medium text-gray-100">{item.label}</span>
              )}
          </div>
          <div className="mt-1 truncate text-[10px] uppercase tracking-[0.12em] text-gray-500">
            {item.kind}{item.mimeType ? ` · ${item.mimeType}` : ''}
          </div>
          {sourceNodeLabel ? (
            <div className="mt-0.5 truncate text-[9px] uppercase tracking-[0.08em] text-gray-500">
              Generated by {sourceNodeLabel}
            </div>
          ) : null}
          {!isCollapsed ? (
            <div className="mt-1 inline-flex max-w-full items-center gap-1 truncate text-[10px] text-gray-400">
              <Plus size={10} />
              <span className="truncate">Drag to flow</span>
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          {showRerunButton ? (
            <button
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-700/60 bg-[#0d0f15] text-gray-400 transition-colors hover:border-blue-300 hover:text-blue-200"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onRerun?.();
              }}
              title="Regenerate this output"
              type="button"
            >
              <RefreshCw size={12} />
            </button>
          ) : null}
          <button
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-700/60 bg-[#0d0f15] text-gray-400 transition-colors hover:border-gray-500 hover:text-white"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onRename();
            }}
            title="Rename source item"
            type="button"
          >
            <Type size={12} />
          </button>
          <button
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-red-500/25 bg-red-500/10 text-red-100 transition-colors hover:border-red-400/60 hover:bg-red-500/20"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onRemove();
            }}
            title="Remove source item"
            type="button"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}

function SourceLibraryPreview({ item }: { item: SourceBinLibraryItem }) {
  const previewRef = useRef<HTMLDivElement>(null);
  const [shouldLoadMedia, setShouldLoadMedia] = useState(() => (
    typeof window === 'undefined' || !('IntersectionObserver' in window)
  ));
  const mediaKey = `${item.id}:${item.assetUrl ?? ''}`;
  const [failedMediaKey, setFailedMediaKey] = useState<string | null>(null);
  const mediaFailed = failedMediaKey === mediaKey;

  useEffect(() => {
    if (shouldLoadMedia) {
      return;
    }

    const node = previewRef.current;
    if (!node) {
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setShouldLoadMedia(true);
        observer.disconnect();
      }
    }, { rootMargin: '320px' });

    observer.observe(node);
    return () => observer.disconnect();
  }, [shouldLoadMedia]);

  if (!shouldLoadMedia) {
    return (
      <div ref={previewRef}>
        <SourceLibraryPreviewPlaceholder item={item} />
      </div>
    );
  }

  if (mediaFailed) {
    return <SourceLibraryPreviewPlaceholder item={item} status="Missing" />;
  }

  if (item.kind === 'image' && item.assetUrl) {
    return (
      <img
        alt={item.label}
        className="h-[72px] w-28 object-cover"
        decoding="async"
        loading="lazy"
        onError={() => setFailedMediaKey(mediaKey)}
        src={item.assetUrl}
      />
    );
  }

  if ((item.kind === 'video' || item.kind === 'composition') && item.assetUrl) {
    return (
      <video
        className="h-[72px] w-28 object-cover"
        muted
        onError={() => setFailedMediaKey(mediaKey)}
        preload="none"
        src={item.assetUrl}
      />
    );
  }

  return <SourceLibraryPreviewPlaceholder item={item} />;
}

function SourceLibraryPreviewPlaceholder({ item, status }: { item: SourceBinLibraryItem; status?: string }) {
  if (item.kind === 'audio') {
    return (
      <div className="flex h-[72px] w-28 items-center justify-center bg-[#0d0f15] text-cyan-200">
        <Music2 size={18} />
      </div>
    );
  }

  if (item.kind === 'document') {
    return (
      <div className="flex h-[72px] w-28 flex-col items-center justify-center gap-1 bg-[#0d0f15] text-emerald-200">
        <FileText size={18} />
        <span className="text-[9px] uppercase tracking-[0.14em] text-emerald-100/70">Document</span>
      </div>
    );
  }

  if (item.kind === 'subtitle') {
    return (
      <div className="flex h-[72px] w-28 flex-col items-center justify-center gap-1 bg-[#0d0f15] text-violet-200">
        <Captions size={18} />
        <span className="text-[9px] uppercase tracking-[0.14em] text-violet-100/70">Captions</span>
      </div>
    );
  }

  if (item.kind === 'package') {
    return (
      <div className="flex h-[72px] w-28 flex-col items-center justify-center gap-1 bg-[#0d0f15] text-amber-200">
        <Package size={18} />
        <span className="text-[9px] uppercase tracking-[0.14em] text-amber-100/70">Package</span>
      </div>
    );
  }

  return (
    <div className="flex h-[72px] w-28 flex-col items-center justify-center gap-1 bg-[#0d0f15] text-cyan-200">
      <Type size={18} />
      {status ? <span className="text-[9px] uppercase tracking-[0.14em] text-cyan-100/70">{status}</span> : null}
    </div>
  );
}

function MiniImportChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-700/60 bg-[#0f131b] px-2 py-1 text-[10px] font-semibold text-gray-300 transition-colors hover:border-gray-500 hover:text-white"
      onClick={onClick}
      type="button"
    >
      {label === 'Image' ? <ImageIcon size={10} /> : label === 'Video' ? <Film size={10} /> : label === 'Audio' ? <Music2 size={10} /> : label === 'Document' ? <FileText size={10} /> : label === 'Subtitle' ? <Captions size={10} /> : label === 'Package' ? <Package size={10} /> : <Archive size={10} />}
      {label}
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

function GeneratedPoolFilterButton({
  active,
  count,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  count: number;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
        active
          ? 'border-blue-300/65 bg-blue-300/20 text-blue-100'
          : 'border-gray-700/60 bg-[#0f131b] text-gray-300 hover:border-gray-500 hover:text-white'
      }`}
      onClick={onClick}
      type="button"
    >
      {icon}
      {label}
      <span className="rounded-full border border-current px-1.5 py-0.5 text-[9px]">{count}</span>
    </button>
  );
}
