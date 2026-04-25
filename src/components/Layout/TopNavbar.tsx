import React from 'react';
import { Download, FolderOpen, Maximize2, Minimize2, Minus, Play, Plus, Redo2, Settings, Undo2 } from 'lucide-react';
import { useReactFlow, useViewport } from '@xyflow/react';
import { useSettingsStore } from '../../store/settingsStore';
import { useFlowStore } from '../../store/flowStore';
import { useEditorStore } from '../../store/editorStore';
import { useSourceBinStore } from '../../store/sourceBinStore';
import { ProjectLibraryModal } from './ProjectLibraryModal';
import { APP_EYEBROW, APP_NAME } from '../../lib/brand';
import { APP_MENU_GROUPS, shouldShowIntegratedAppMenu } from '../../lib/appMenuModel';
import { dispatchNativeRendererCommand, getSignalLoomNativeBridge, type NativeMenuCommand } from '../../lib/nativeApp';
import {
  TITLEBAR_LOGO_ALT,
  TITLEBAR_LOGO_CONTAINER_CLASS,
  TITLEBAR_LOGO_IMAGE_CLASS,
  TITLEBAR_LOGO_SRC,
} from '../../lib/titlebarBrand';

interface TopNavbarProps {
  onMenuCommand?: (command: NativeMenuCommand) => void;
}

export const TopNavbar: React.FC<TopNavbarProps> = ({ onMenuCommand }) => {
  const toggleSettings = useSettingsStore((state) => state.toggleSettings);
  const exportFlow = useFlowStore((state) => state.exportFlow);
  const nodes = useFlowStore((state) => state.nodes);
  const addNode = useFlowStore((state) => state.addNode);
  const runNode = useFlowStore((state) => state.runNode);
  const workspaceView = useEditorStore((state) => state.workspaceView);
  const setWorkspaceView = useEditorStore((state) => state.setWorkspaceView);
  const activeCompositionId = useEditorStore((state) => state.activeCompositionId);
  const sourceBinVisible = useEditorStore((state) => state.sourceBinVisible);
  const sourceMonitorVisible = useEditorStore((state) => state.sourceMonitorVisible);
  const programMonitorVisible = useEditorStore((state) => state.programMonitorVisible);
  const inspectorVisible = useEditorStore((state) => state.inspectorVisible);
  const setActiveSourceBinId = useEditorStore((state) => state.setActiveSourceBinId);
  const setActiveCompositionId = useEditorStore((state) => state.setActiveCompositionId);
  const setPanelVisibility = useEditorStore((state) => state.setPanelVisibility);
  const sourceBinItems = useSourceBinStore((state) => state.items);
  const { zoom } = useViewport();
  const { fitView, screenToFlowPosition, zoomIn, zoomOut } = useReactFlow();
  const [copyState, setCopyState] = React.useState<'idle' | 'copied' | 'error'>('idle');
  const [isProjectLibraryOpen, setProjectLibraryOpen] = React.useState(false);
  const [isFullscreen, setFullscreen] = React.useState(Boolean(document.fullscreenElement));
  const [openMenuId, setOpenMenuId] = React.useState<string | null>(null);
  const [showIntegratedMenu] = React.useState(() =>
    shouldShowIntegratedAppMenu(Boolean(getSignalLoomNativeBridge())),
  );
  const appMenuRef = React.useRef<HTMLDivElement | null>(null);
  const sourceBinNodeCount = React.useMemo(
    () => nodes.filter((node) => node.type === 'sourceBin').length,
    [nodes],
  );
  const compositionNodes = React.useMemo(
    () => nodes.filter((node) => node.type === 'composition'),
    [nodes],
  );
  const activeComposition = compositionNodes.find((node) => node.id === activeCompositionId);
  const isCompositionRendering = Boolean(activeComposition?.data.isRunning);

  React.useEffect(() => {
    const updateFullscreenState = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', updateFullscreenState);

    return () => {
      document.removeEventListener('fullscreenchange', updateFullscreenState);
    };
  }, []);

  React.useEffect(() => {
    if (!openMenuId) {
      return;
    }

    const closeMenu = (event: PointerEvent) => {
      if (appMenuRef.current?.contains(event.target as Node)) {
        return;
      }

      setOpenMenuId(null);
    };

    window.addEventListener('pointerdown', closeMenu);
    return () => window.removeEventListener('pointerdown', closeMenu);
  }, [openMenuId]);

  const handleCopyFlow = async () => {
    try {
      await navigator.clipboard.writeText(exportFlow());
      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), 1500);
    } catch {
      setCopyState('error');
      window.setTimeout(() => setCopyState('idle'), 1500);
    }
  };

  const toggleFullscreen = async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }

    await document.documentElement.requestFullscreen();
  };

  const handleMenuCommand = (command: NativeMenuCommand) => {
    setOpenMenuId(null);
    onMenuCommand?.(command);
  };

  const getNewFlowNodePosition = React.useCallback(() => (
    screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
  ), [screenToFlowPosition]);

  const addEditorSourceBin = React.useCallback(() => {
    const id = addNode('sourceBin', getNewFlowNodePosition());
    setActiveSourceBinId(id);
  }, [addNode, getNewFlowNodePosition, setActiveSourceBinId]);

  const addEditorComposition = React.useCallback(() => {
    setActiveCompositionId(addNode('composition', getNewFlowNodePosition()));
  }, [addNode, getNewFlowNodePosition, setActiveCompositionId]);

  const renderActiveComposition = React.useCallback(() => {
    if (!activeComposition || isCompositionRendering) {
      return;
    }

    void runNode(activeComposition.id);
  }, [activeComposition, isCompositionRendering, runNode]);

  return (
    <div className="absolute top-0 left-0 right-0 z-40 flex h-16 items-center gap-3 border-b border-cyan-400/15 bg-[#08111d]/95 px-4 shadow-[0_10px_28px_rgba(0,0,0,0.22)]">
      <div className="flex min-w-0 items-center gap-3">
        {showIntegratedMenu ? (
          <div
            ref={appMenuRef}
            className="flex shrink-0 items-center gap-0.5 border-r border-cyan-300/15 pr-3"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setOpenMenuId(null);
              }
            }}
          >
            {APP_MENU_GROUPS.map((group) => (
              <div className="relative" key={group.id}>
                <button
                  aria-expanded={openMenuId === group.id}
                  className={`rounded px-2 py-1 text-xs font-medium text-cyan-100/70 transition-colors hover:bg-cyan-400/10 hover:text-white ${
                    openMenuId === group.id ? 'bg-cyan-400/10 text-white' : ''
                  }`}
                  onClick={() => setOpenMenuId((current) => current === group.id ? null : group.id)}
                  type="button"
                >
                  {group.label}
                </button>
                {openMenuId === group.id ? (
                  <div className="absolute left-0 top-full z-50 mt-2 min-w-56 overflow-hidden rounded-md border border-cyan-300/20 bg-[#0d1725] py-1 shadow-2xl shadow-black/40">
                    {group.items.map((item) => (
                      <button
                        className="flex w-full items-center justify-between gap-5 px-3 py-2 text-left text-sm text-cyan-50/80 transition-colors hover:bg-cyan-400/10 hover:text-white"
                        key={item.command}
                        onClick={() => handleMenuCommand(item.command)}
                        type="button"
                      >
                        <span>{item.label}</span>
                        {item.shortcut ? (
                          <span className="text-xs text-cyan-100/35">{item.shortcut}</span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
        <div className={TITLEBAR_LOGO_CONTAINER_CLASS}>
          <img
            alt={TITLEBAR_LOGO_ALT}
            className={TITLEBAR_LOGO_IMAGE_CLASS}
            src={TITLEBAR_LOGO_SRC}
          />
        </div>
        <div className="hidden flex-col xl:flex">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200/65">{APP_EYEBROW}</div>
          <div className="text-lg font-semibold tracking-normal">
            <span className="text-cyan-300">{APP_NAME.split(' ')[0]}</span>
            <span className="text-white"> {APP_NAME.split(' ').slice(1).join(' ')}</span>
          </div>
        </div>
        <div className="flex items-center rounded-full border border-cyan-300/15 bg-[#101a29] p-1">
          <ViewToggleButton
            active={workspaceView === 'flow'}
            label="Flow"
            onClick={() => setWorkspaceView('flow')}
          />
          <ViewToggleButton
            active={workspaceView === 'editor'}
            label="Editor"
            onClick={() => setWorkspaceView('editor')}
          />
        </div>
      </div>

      <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
        {workspaceView === 'editor' ? (
          <EditorTitlebarControls
            activeCompositionId={activeComposition?.id}
            compositionOptions={compositionNodes.map((node) => ({ value: node.id, label: node.id }))}
            inspectorVisible={inspectorVisible}
            isCompositionRendering={isCompositionRendering}
            onAddComposition={addEditorComposition}
            onAddSourceBin={addEditorSourceBin}
            onCompositionChange={(value) => setActiveCompositionId(value || undefined)}
            onHelp={() => dispatchNativeRendererCommand('help:keyboard-shortcuts')}
            onRedo={() => dispatchNativeRendererCommand('edit:redo')}
            onRender={renderActiveComposition}
            onTogglePanel={setPanelVisibility}
            onUndo={() => dispatchNativeRendererCommand('edit:undo')}
            programMonitorVisible={programMonitorVisible}
            sourceBinCount={sourceBinItems.length}
            sourceBinNodeCount={sourceBinNodeCount}
            sourceBinVisible={sourceBinVisible}
            sourceMonitorVisible={sourceMonitorVisible}
          />
        ) : null}

        <div className="flex shrink-0 items-center gap-2 rounded-full border border-cyan-300/15 bg-[#101a29] px-2 py-1.5">
          <div className="hidden min-w-16 items-center justify-center border-r border-cyan-300/15 px-2 text-sm text-cyan-100/80 lg:flex">
            {Math.round(zoom * 100)}%
          </div>

          <IconButton icon={<Minus size={16} />} label="Zoom out" onClick={() => void zoomOut()} />
          <button
            className="rounded-full px-2.5 py-2 text-sm text-cyan-100/75 transition-colors hover:bg-cyan-400/10 hover:text-white"
            onClick={() => void fitView({ padding: 0.2, duration: 300 })}
            type="button"
          >
            Fit
          </button>
          <IconButton icon={<Plus size={16} />} label="Zoom in" onClick={() => void zoomIn()} />

          <div className="mx-0.5 h-5 w-px bg-cyan-300/15" />

          <IconButton
            icon={isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            onClick={() => void toggleFullscreen()}
          />

          <div className="mx-0.5 h-5 w-px bg-cyan-300/15" />

          <button
            className="flex items-center gap-2 rounded-full px-2.5 py-2 text-sm text-cyan-100/75 transition-colors hover:bg-cyan-400/10 hover:text-white"
            onClick={() => setProjectLibraryOpen(true)}
            title="Open the local project library"
            type="button"
          >
            <FolderOpen size={16} />
            <span className="hidden xl:inline">Projects</span>
          </button>

          <button
            className="flex items-center gap-2 rounded-full px-2.5 py-2 text-sm text-cyan-100/75 transition-colors hover:bg-cyan-400/10 hover:text-white"
            onClick={() => void handleCopyFlow()}
            title="Copy the current flow JSON to the clipboard"
            type="button"
          >
            <Download size={16} />
            <span className="hidden xl:inline">{copyState === 'copied' ? 'Copied' : copyState === 'error' ? 'Failed' : 'Export'}</span>
          </button>

          <IconButton icon={<Settings size={16} />} label="Provider settings" onClick={toggleSettings} />
        </div>
      </div>

      <ProjectLibraryModal
        isOpen={isProjectLibraryOpen}
        onClose={() => setProjectLibraryOpen(false)}
      />
    </div>
  );
};

interface IconButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}

function ViewToggleButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`rounded-full px-3 py-2 text-sm font-medium transition-colors ${
        active ? 'bg-cyan-400 text-slate-950 shadow-[0_0_16px_rgba(34,211,238,0.25)]' : 'text-cyan-100/70 hover:bg-cyan-400/10 hover:text-white'
      }`}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

type EditorPanelVisibilityKey = 'sourceMonitorVisible' | 'programMonitorVisible' | 'inspectorVisible' | 'sourceBinVisible';

function EditorTitlebarControls({
  activeCompositionId,
  compositionOptions,
  inspectorVisible,
  isCompositionRendering,
  onAddComposition,
  onAddSourceBin,
  onCompositionChange,
  onHelp,
  onRedo,
  onRender,
  onTogglePanel,
  onUndo,
  programMonitorVisible,
  sourceBinCount,
  sourceBinNodeCount,
  sourceBinVisible,
  sourceMonitorVisible,
}: {
  activeCompositionId?: string;
  compositionOptions: Array<{ value: string; label: string }>;
  inspectorVisible: boolean;
  isCompositionRendering: boolean;
  onAddComposition: () => void;
  onAddSourceBin: () => void;
  onCompositionChange: (value: string) => void;
  onHelp: () => void;
  onRedo: () => void;
  onRender: () => void;
  onTogglePanel: (panel: EditorPanelVisibilityKey, visible: boolean) => void;
  onUndo: () => void;
  programMonitorVisible: boolean;
  sourceBinCount: number;
  sourceBinNodeCount: number;
  sourceBinVisible: boolean;
  sourceMonitorVisible: boolean;
}) {
  return (
    <div className="hidden min-w-0 flex-1 items-center justify-end gap-1.5 overflow-hidden 2xl:flex">
      <div className="hidden shrink-0 rounded-md border border-cyan-300/15 bg-[#101a29]/85 px-2 py-1 text-[11px] font-medium text-cyan-100/75 min-[1800px]:block">
        Source Pool · {sourceBinCount} asset{sourceBinCount === 1 ? '' : 's'} · {sourceBinNodeCount} bin{sourceBinNodeCount === 1 ? '' : 's'}
      </div>
      <select
        className="hidden h-8 max-w-52 rounded-md border border-cyan-300/15 bg-[#0b121d] px-2 text-[11px] font-semibold text-gray-200 outline-none transition-colors hover:border-cyan-300/35 focus:border-cyan-300/60 min-[1800px]:block"
        onChange={(event) => onCompositionChange(event.target.value)}
        title="Active composition"
        value={activeCompositionId ?? ''}
      >
        <option value="">No compositions</option>
        {compositionOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <TitlebarActionButton icon={<Undo2 size={12} />} label="Undo" onClick={onUndo} title="Undo editor edit" />
      <TitlebarActionButton icon={<Redo2 size={12} />} label="Redo" onClick={onRedo} title="Redo editor edit" />
      <TitlebarActionButton icon={<Plus size={12} />} label="Source Bin" onClick={onAddSourceBin} />
      <TitlebarActionButton icon={<Plus size={12} />} label="Composition" onClick={onAddComposition} />
      <button
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-white px-2.5 text-[11px] font-semibold text-black transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:bg-gray-500/30 disabled:text-white"
        disabled={!activeCompositionId || isCompositionRendering}
        onClick={onRender}
        type="button"
      >
        <Play size={12} fill="currentColor" />
        <span className="hidden min-[1700px]:inline">{isCompositionRendering ? 'Rendering...' : 'Render'}</span>
      </button>
      <div className="mx-0.5 h-5 w-px shrink-0 bg-cyan-300/15" />
      <PanelToggleButton
        active={sourceBinVisible}
        label="Bin"
        onClick={() => onTogglePanel('sourceBinVisible', !sourceBinVisible)}
      />
      <PanelToggleButton
        active={sourceMonitorVisible}
        label="Source"
        onClick={() => onTogglePanel('sourceMonitorVisible', !sourceMonitorVisible)}
      />
      <PanelToggleButton
        active={programMonitorVisible}
        label="Program"
        onClick={() => onTogglePanel('programMonitorVisible', !programMonitorVisible)}
      />
      <PanelToggleButton
        active={inspectorVisible}
        label="Inspector"
        onClick={() => onTogglePanel('inspectorVisible', !inspectorVisible)}
      />
      <button
        className="inline-flex h-7 shrink-0 items-center rounded-full border border-cyan-300/15 bg-[#101a29]/70 px-2 text-[10px] font-semibold text-cyan-100/75 transition-colors hover:border-cyan-300/40 hover:text-white"
        onClick={onHelp}
        type="button"
      >
        Help
      </button>
    </div>
  );
}

function TitlebarActionButton({
  icon,
  label,
  onClick,
  title,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-cyan-300/15 bg-[#101a29]/70 px-2 text-[11px] font-semibold text-cyan-100/75 transition-colors hover:border-cyan-300/40 hover:text-white"
      onClick={onClick}
      title={title ?? label}
      type="button"
    >
      {icon}
      <span className="hidden min-[1800px]:inline">{label}</span>
    </button>
  );
}

function PanelToggleButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`inline-flex h-7 shrink-0 items-center rounded-full border px-2 text-[10px] font-semibold transition-colors ${
        active
          ? 'border-cyan-300/45 bg-cyan-400/15 text-cyan-100'
          : 'border-cyan-300/10 bg-[#101a29]/50 text-cyan-100/45 hover:border-cyan-300/30 hover:text-cyan-100'
      }`}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function IconButton({ icon, label, onClick }: IconButtonProps) {
  return (
    <button
      className="rounded-full p-2 text-cyan-100/60 transition-colors hover:bg-cyan-400/10 hover:text-white"
      onClick={onClick}
      title={label}
      type="button"
    >
      {icon}
    </button>
  );
}
