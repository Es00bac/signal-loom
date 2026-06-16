import React from 'react';
import { ChevronDown, ChevronUp, Command, Download, EyeOff, FolderOpen, Library, Maximize2, Menu, Minimize2, Minus, Play, Plus, Redo2, Settings, Undo2 } from 'lucide-react';
import { useReactFlow, useViewport } from '@xyflow/react';
import { useSettingsStore } from '../../store/settingsStore';
import { useFlowStore } from '../../store/flowStore';
import { useEditorStore } from '../../store/editorStore';
import { useImageEditorStore } from '../../store/imageEditorStore';
import { useSourceBinStore } from '../../store/sourceBinStore';
import { useDockablePanelStore } from '../../store/dockablePanelStore';
import { ProjectLibraryModal } from './ProjectLibraryModal';
import { buildAppMenuGroups, shouldShowIntegratedAppMenu } from '../../lib/appMenuModel';
import { dispatchNativeRendererCommand, getSignalLoomNativeBridge, type NativeMenuCommand } from '../../lib/nativeApp';
import type { ActivityTrailSource } from '../../lib/activityTrail';
import {
  applyVideoDockablePanelVisibility,
  type VideoPanelVisibilityKey,
} from '../../lib/videoDockablePanelVisibility';
import { fitToContainer, zoomViewportStepAroundCenter } from '../ImageEditor/viewport';
import { PAPER_TOPBAR_SLOT_ID } from '../../lib/paperTopbarSlot';
import { IMAGE_TOPBAR_CENTER_SLOT_ID, IMAGE_TOPBAR_RIGHT_SLOT_ID } from '../../lib/imageTopbarSlots';
import { BottomToolbar } from './BottomToolbar';
import type { FlowNodeType, NodeData, WorkspaceView } from '../../types/flow';
import { FunctionLibraryDrawer } from '../Common/FunctionLibraryDrawer';
import { FlowWorkspaceSwitcher } from '../../features/flow/workspace/FlowWorkspaceSwitcher';
import { useFlowWorkspaceCommands } from '../../features/flow/workspace/useFlowWorkspaceCommands';
import {
  createFunctionNodeDataFromLibraryFunction,
  createLibraryFunctionFromFunctionNode,
  getFunctionLibraryEntries,
  type StandardLibraryFunction,
} from '../../lib/standardLibrary';
import { useMobileInterfaceStore } from '../../store/mobileInterfaceStore';
import { useMobilePhoneInterfaceDescriptor } from '../../lib/mobilePhoneInterface';
import { isAndroidNativeFullscreenAvailable, setAndroidFullscreen } from '../../lib/androidSystemUi';
import { UsageBar } from './UsageBar';

const flowIcon = new URL('../../assets/icon-flow.png', import.meta.url).href;
const editorIcon = new URL('../../assets/icon-editor.png', import.meta.url).href;
const imageIcon = new URL('../../assets/icon-image.png', import.meta.url).href;
const paperIcon = new URL('../../assets/icon-paper.png', import.meta.url).href;

const WORKSPACE_TABS = [
  {
    id: 'flow' as WorkspaceView,
    label: 'Flow',
    command: 'view:flow' as NativeMenuCommand,
    icon: flowIcon,
    activeClass: 'border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-100 shadow-[0_0_14px_rgba(217,70,239,0.2)]',
    dotClass: 'bg-fuchsia-400',
    hoverClass: 'hover:bg-fuchsia-500/5 hover:text-fuchsia-100',
    desc: 'Generative AI Multi-Agent Media Workflow Builder',
  },
  {
    id: 'editor' as WorkspaceView,
    label: 'Video',
    command: 'view:editor' as NativeMenuCommand,
    icon: editorIcon,
    activeClass: 'border-sky-500/30 bg-sky-500/10 text-sky-100 shadow-[0_0_14px_rgba(14,165,233,0.2)]',
    dotClass: 'bg-sky-400',
    hoverClass: 'hover:bg-sky-500/5 hover:text-sky-100',
    desc: 'Multi-track Non-linear Timeline Video Editor',
  },
  {
    id: 'image' as WorkspaceView,
    label: 'Image',
    command: 'view:image' as NativeMenuCommand,
    icon: imageIcon,
    activeClass: 'border-rose-500/30 bg-rose-500/10 text-rose-100 shadow-[0_0_14px_rgba(244,63,94,0.2)]',
    dotClass: 'bg-rose-400',
    hoverClass: 'hover:bg-rose-500/5 hover:text-rose-100',
    desc: 'Layers-based Creative Image Editor',
  },
  {
    id: 'paper' as WorkspaceView,
    label: 'Paper',
    command: 'view:paper' as NativeMenuCommand,
    icon: paperIcon,
    activeClass: 'border-amber-500/30 bg-amber-500/10 text-amber-100 shadow-[0_0_14px_rgba(245,158,11,0.2)]',
    dotClass: 'bg-amber-400',
    hoverClass: 'hover:bg-amber-500/5 hover:text-amber-100',
    desc: 'Professional Publishing & Document Layouts',
  },
];

interface TopNavbarProps {
  activeFlowSourceBinId?: string;
  onMenuCommand?: (command: NativeMenuCommand, source?: ActivityTrailSource) => void;
  onActiveFlowSourceBinChange?: (binId: string | undefined) => void;
  flowWorkspaceMetricLabel?: string;
  sourceBins?: Array<{ id: string; name: string; items: unknown[] }>;
  workspaceView?: WorkspaceView;
}

export const TopNavbar: React.FC<TopNavbarProps> = ({
  activeFlowSourceBinId,
  onMenuCommand,
  onActiveFlowSourceBinChange,
  flowWorkspaceMetricLabel,
  sourceBins = [],
  workspaceView: workspaceViewOverride,
}) => {
  const toggleSettings = useSettingsStore((state) => state.toggleSettings);
  const keyboardShortcuts = useSettingsStore((state) => state.keyboardShortcuts);
  const exportFlow = useFlowStore((state) => state.exportFlow);
  const nodes = useFlowStore((state) => state.nodes);
  const addNode = useFlowStore((state) => state.addNode);
  const runNode = useFlowStore((state) => state.runNode);
  const storedWorkspaceView = useEditorStore((state) => state.workspaceView);
  const workspaceView = workspaceViewOverride ?? storedWorkspaceView;
  const isImageWorkspace = workspaceView === 'image';
  const isPaperWorkspace = workspaceView === 'paper';
  const activeCompositionId = useEditorStore((state) => state.activeCompositionId);
  const sourceBinVisible = useEditorStore((state) => state.sourceBinVisible);
  const sourceMonitorVisible = useEditorStore((state) => state.sourceMonitorVisible);
  const programMonitorVisible = useEditorStore((state) => state.programMonitorVisible);
  const inspectorVisible = useEditorStore((state) => state.inspectorVisible);
  const setActiveSourceBinId = useEditorStore((state) => state.setActiveSourceBinId);
  const setActiveCompositionId = useEditorStore((state) => state.setActiveCompositionId);
  const setPanelVisibility = useEditorStore((state) => state.setPanelVisibility);
  const dockVideoPanel = useDockablePanelStore((state) => state.dockPanel);
  const hideVideoPanel = useDockablePanelStore((state) => state.hidePanel);
  const activeImageDocument = useImageEditorStore((state) =>
    state.documents.find((doc) => doc.id === state.activeDocId) ?? null,
  );
  const imageViewportContainerSize = useImageEditorStore((state) => state.viewportContainerSize);
  const setImageViewport = useImageEditorStore((state) => state.setViewport);
  const sourceBinItemCount = useSourceBinStore((state) => state.bins.reduce((sum, bin) => sum + bin.items.length, 0));
  const { zoom } = useViewport();
  const { fitView, screenToFlowPosition, zoomIn, zoomOut } = useReactFlow();
  const [copyState, setCopyState] = React.useState<'idle' | 'copied' | 'error'>('idle');
  const [isProjectLibraryOpen, setProjectLibraryOpen] = React.useState(false);
  const [isFunctionLibraryOpen, setFunctionLibraryOpen] = React.useState(false);
  const [isFullscreen, setFullscreen] = React.useState(Boolean(document.fullscreenElement));
  const [openMenuId, setOpenMenuId] = React.useState<string | null>(null);
  const [showIntegratedMenu] = React.useState(() =>
    shouldShowIntegratedAppMenu(Boolean(getSignalLoomNativeBridge())),
  );
  const mobilePhoneInterface = useMobilePhoneInterfaceDescriptor();
  const mobileChromeMode = useMobileInterfaceStore((state) => state.chromeMode);
  const activeMobileEdgeDrawer = useMobileInterfaceStore((state) => state.activeEdgeDrawer);
  const toggleMobileEdgeDrawer = useMobileInterfaceStore((state) => state.toggleEdgeDrawer);
  const hideMobileInterface = useMobileInterfaceStore((state) => state.hideInterface);
  const restoreMobileInterface = useMobileInterfaceStore((state) => state.restoreInterface);
  const appMenuRef = React.useRef<HTMLDivElement | null>(null);
  const sourceBinNodeCount = React.useMemo(
    () => nodes.filter((node) => node.type === 'sourceBin').length,
    [nodes],
  );
  const compositionNodes = React.useMemo(
    () => nodes.filter((node) => node.type === 'composition'),
    [nodes],
  );
  const customFunctionLibraryEntries = React.useMemo(
    () => nodes.flatMap((node) => createLibraryFunctionFromFunctionNode(node) ?? []),
    [nodes],
  );
  const activeComposition = compositionNodes.find((node) => node.id === activeCompositionId);
  const isCompositionRendering = Boolean(activeComposition?.data.isRunning);
  const activeIcon = {
    flow: flowIcon,
    editor: editorIcon,
    image: imageIcon,
    paper: paperIcon,
  }[workspaceView];
  const showGenericViewportControls = !isPaperWorkspace;
  const appMenuGroups = React.useMemo(() => buildAppMenuGroups(workspaceView, keyboardShortcuts), [keyboardShortcuts, workspaceView]);
  const imageViewportReady =
    Boolean(activeImageDocument) &&
    imageViewportContainerSize.width > 0 &&
    imageViewportContainerSize.height > 0;
  const visibleZoom =
    isImageWorkspace && activeImageDocument ? activeImageDocument.viewport.zoom : zoom;
  const primaryControlsFlexClass = isPaperWorkspace
    ? 'max-w-[48vw] shrink-0 overflow-x-auto overflow-y-hidden [scrollbar-width:none]'
    : 'flex-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none]';
  const flowWorkspaceCommands = useFlowWorkspaceCommands();
  const flowTargetBinId = React.useMemo(() => {
    if (activeFlowSourceBinId && sourceBins.some((bin) => bin.id === activeFlowSourceBinId)) {
      return activeFlowSourceBinId;
    }

    return sourceBins[0]?.id ?? '';
  }, [activeFlowSourceBinId, sourceBins]);

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
    // Android WebView ignores the web Fullscreen API, so toggle native immersive mode.
    if (isAndroidNativeFullscreenAvailable()) {
      const next = !isFullscreen;
      try {
        const applied = await setAndroidFullscreen(next);
        setFullscreen(applied);
      } catch {
        // Leave the toggle state unchanged if the native call fails.
      }
      return;
    }

    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }

    await document.documentElement.requestFullscreen();
  };

  const handleMenuCommand = (command: NativeMenuCommand, source: ActivityTrailSource = 'menu') => {
    setOpenMenuId(null);
    onMenuCommand?.(command, source);
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

  const addFlowNodeFromTopbar = React.useCallback((type: FlowNodeType, initialData?: Partial<NodeData>) => {
    addNode(type, getNewFlowNodePosition(), initialData);
  }, [addNode, getNewFlowNodePosition]);

  const insertFunctionLibraryEntry = React.useCallback((func: StandardLibraryFunction) => {
    addFlowNodeFromTopbar('functionNode', createFunctionNodeDataFromLibraryFunction(func));
    setFunctionLibraryOpen(false);
  }, [addFlowNodeFromTopbar]);

  const renderActiveComposition = React.useCallback(() => {
    if (!activeComposition || isCompositionRendering) {
      return;
    }

    void runNode(activeComposition.id);
  }, [activeComposition, isCompositionRendering, runNode]);

  const toggleVideoPanel = React.useCallback(
    (panel: VideoPanelVisibilityKey, visible: boolean) => {
      applyVideoDockablePanelVisibility(panel, visible, {
        dockPanel: dockVideoPanel,
        hidePanel: hideVideoPanel,
        setPanelVisibility,
      });
    },
    [dockVideoPanel, hideVideoPanel, setPanelVisibility],
  );

  const handleZoomOut = React.useCallback(() => {
    if (isImageWorkspace) {
      if (!activeImageDocument || !imageViewportReady) return;
      setImageViewport(
        activeImageDocument.id,
        zoomViewportStepAroundCenter(
          activeImageDocument.viewport,
          imageViewportContainerSize,
          'out',
        ),
      );
      return;
    }

    void zoomOut();
  }, [
    activeImageDocument,
    imageViewportContainerSize,
    imageViewportReady,
    isImageWorkspace,
    setImageViewport,
    zoomOut,
  ]);

  const handleZoomFit = React.useCallback(() => {
    if (isImageWorkspace) {
      if (!activeImageDocument || !imageViewportReady) return;
      setImageViewport(
        activeImageDocument.id,
        fitToContainer(
          { width: activeImageDocument.width, height: activeImageDocument.height },
          imageViewportContainerSize,
        ),
      );
      return;
    }

    void fitView({ padding: 0.2, duration: 300 });
  }, [
    activeImageDocument,
    fitView,
    imageViewportContainerSize,
    imageViewportReady,
    isImageWorkspace,
    setImageViewport,
  ]);

  const handleZoomIn = React.useCallback(() => {
    if (isImageWorkspace) {
      if (!activeImageDocument || !imageViewportReady) return;
      setImageViewport(
        activeImageDocument.id,
        zoomViewportStepAroundCenter(
          activeImageDocument.viewport,
          imageViewportContainerSize,
          'in',
        ),
      );
      return;
    }

    void zoomIn();
  }, [
    activeImageDocument,
    imageViewportContainerSize,
    imageViewportReady,
    isImageWorkspace,
    setImageViewport,
    zoomIn,
  ]);

  const renderMobileTopbarOverlays = () => (
    <>
      <ProjectLibraryModal
        isOpen={isProjectLibraryOpen}
        onClose={() => setProjectLibraryOpen(false)}
      />
      <FunctionLibraryDrawer
        builtInFunctions={getFunctionLibraryEntries([]).filter((entry) => entry.source !== 'custom')}
        customFunctions={customFunctionLibraryEntries}
        onClose={() => setFunctionLibraryOpen(false)}
        onInsertBuiltIn={insertFunctionLibraryEntry}
        onInsertCustom={insertFunctionLibraryEntry}
        open={isFunctionLibraryOpen}
      />
    </>
  );

  if (!mobilePhoneInterface.enabled && mobileChromeMode === 'hidden') {
    return (
      <>
        <button
          aria-label="Show Signal Loom interface"
          className="theme-topbar absolute left-3 top-3 z-[90] flex h-11 w-11 items-center justify-center rounded-full border border-cyan-300/30 bg-[#0b1421]/95 text-cyan-100 shadow-[0_10px_28px_rgba(0,0,0,0.35)] backdrop-blur-md"
          data-application-chrome-restore="true"
          onClick={restoreMobileInterface}
          type="button"
        >
          <Menu size={20} />
        </button>
        {renderMobileTopbarOverlays()}
      </>
    );
  }

  if (mobilePhoneInterface.enabled) {
    const drawerExpanded = mobileChromeMode === 'expanded' || activeMobileEdgeDrawer === 'top';

    if (mobileChromeMode === 'hidden') {
      return (
        <>
          <button
            aria-label="Show Signal Loom interface"
            className="theme-topbar absolute left-3 top-3 z-[90] flex h-11 w-11 items-center justify-center rounded-full border border-cyan-300/30 bg-[#0b1421]/95 text-cyan-100 shadow-[0_10px_28px_rgba(0,0,0,0.35)] backdrop-blur-md"
            data-mobile-phone-topbar="hidden"
            data-mobile-phone-orientation={mobilePhoneInterface.orientation}
            onClick={restoreMobileInterface}
            type="button"
          >
            <Menu size={20} />
          </button>
          {renderMobileTopbarOverlays()}
        </>
      );
    }

    return (
      <div
        className="theme-topbar absolute top-0 left-0 right-0 z-[80] flex flex-col overflow-hidden border-b shadow-[0_10px_28px_rgba(0,0,0,0.22)] transition-[max-height] duration-200"
        data-mobile-phone-topbar="true"
        data-mobile-phone-orientation={mobilePhoneInterface.orientation}
        data-mobile-phone-drawer={drawerExpanded ? 'expanded' : 'collapsed'}
        style={{ maxHeight: drawerExpanded ? mobilePhoneInterface.expandedDrawerMaxHeightCss : `${mobilePhoneInterface.topbarHeightPx}px` }}
      >
        <div className="flex h-12 shrink-0 items-center gap-2 px-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-cyan-300/25 bg-[#0b1421] shadow-[0_0_18px_rgba(34,211,238,0.16)]">
            <img
              alt={`${workspaceView} Icon`}
              className="h-full w-full object-contain p-1.5"
              src={activeIcon}
            />
          </div>

          <div
            className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto rounded-full border border-cyan-300/10 bg-[#09101d]/65 p-1"
            data-mobile-workspace-switcher="true"
          >
            {WORKSPACE_TABS.map((tab) => {
              const isActive = workspaceView === tab.id;
              return (
                <button
                  aria-label={`${tab.label} Workspace`}
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors ${
                    isActive
                      ? tab.activeClass
                      : `border-transparent text-cyan-100/50 ${tab.hoverClass}`
                  }`}
                  key={tab.id}
                  onClick={() => handleMenuCommand(tab.command, 'topbar')}
                  title={`${tab.label} Workspace`}
                  type="button"
                >
                  <img src={tab.icon} alt="" className="h-5 w-5 rounded-md object-contain" />
                </button>
              );
            })}
          </div>

          <IconButton
            icon={drawerExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            label={drawerExpanded ? 'Collapse interface drawer' : 'Expand interface drawer'}
            onClick={() => toggleMobileEdgeDrawer('top')}
          />
          <IconButton
            icon={<EyeOff size={18} />}
            label="Hide interface"
            onClick={hideMobileInterface}
          />
        </div>

        {drawerExpanded ? (
          <div
            className="flex max-h-[calc(100vh-3rem)] flex-col gap-2 overflow-y-auto border-t border-cyan-300/15 p-2"
            data-mobile-interface-drawer-panel="true"
          >
            {showIntegratedMenu ? (
              <div className="grid grid-cols-3 gap-1" data-mobile-app-menu="true">
                {appMenuGroups.map((group) => (
                  <button
                    className={`rounded-md border px-2 py-2 text-xs font-semibold transition-colors ${
                      group.enabled
                        ? 'border-cyan-300/15 bg-cyan-400/10 text-cyan-50 hover:border-cyan-300/40'
                        : 'border-cyan-300/5 bg-cyan-400/5 text-cyan-100/25'
                    }`}
                    disabled={!group.enabled}
                    key={group.id}
                    onClick={() => setOpenMenuId((current) => current === group.id ? null : group.id)}
                    type="button"
                  >
                    {group.label}
                  </button>
                ))}
              </div>
            ) : null}

            {openMenuId ? (
              <div className="grid gap-1 rounded-lg border border-cyan-300/15 bg-[#0d1725] p-1" data-mobile-app-menu-items="true">
                {appMenuGroups.find((group) => group.id === openMenuId)?.items.map((item) => (
                  <button
                    className="flex items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm text-cyan-50/80 transition-colors hover:bg-cyan-400/10 hover:text-white"
                    key={item.command}
                    onClick={() => handleMenuCommand(item.command)}
                    type="button"
                  >
                    <span>{item.label}</span>
                    {item.shortcut ? <span className="text-xs text-cyan-100/35">{item.shortcut}</span> : null}
                  </button>
                ))}
              </div>
            ) : null}

            {workspaceView === 'flow' ? (
              <div className="overflow-x-auto rounded-lg border border-cyan-300/10 bg-[#09101d]/65 p-1" data-mobile-flow-toolbar="true">
                <BottomToolbar onAddNode={addFlowNodeFromTopbar} variant="topbar" />
              </div>
            ) : null}

            {isPaperWorkspace ? (
              <div
                className="min-h-10 overflow-x-auto rounded-lg border border-cyan-300/10 bg-[#09101d]/65 p-1"
                data-mobile-paper-topbar-slot="true"
                id={PAPER_TOPBAR_SLOT_ID}
              />
            ) : null}

            {workspaceView === 'editor' ? (
              <MobileEditorPanelControls
                inspectorVisible={inspectorVisible}
                isCompositionRendering={isCompositionRendering}
                onAddComposition={addEditorComposition}
                onAddSourceBin={addEditorSourceBin}
                onHelp={() => dispatchNativeRendererCommand('help:keyboard-shortcuts')}
                onRedo={() => dispatchNativeRendererCommand('edit:redo')}
                onRender={renderActiveComposition}
                onTogglePanel={toggleVideoPanel}
                onUndo={() => dispatchNativeRendererCommand('edit:undo')}
                programMonitorVisible={programMonitorVisible}
                renderDisabled={!activeComposition?.id || isCompositionRendering}
                sourceBinVisible={sourceBinVisible}
                sourceMonitorVisible={sourceMonitorVisible}
              />
            ) : null}

            <div className="grid grid-cols-2 gap-2" data-mobile-primary-actions="true">
              {showGenericViewportControls ? (
                <div className="theme-control col-span-2 flex items-center justify-between rounded-lg border px-2 py-1">
                  <span className="px-2 text-sm font-semibold text-cyan-100/70">{Math.round(visibleZoom * 100)}%</span>
                  <div className="flex items-center gap-1">
                    <IconButton
                      disabled={isImageWorkspace && !imageViewportReady}
                      icon={<Minus size={16} />}
                      label="Zoom out"
                      onClick={handleZoomOut}
                    />
                    <button
                      className="rounded-full px-2.5 py-2 text-sm text-cyan-100/75 transition-colors hover:bg-cyan-400/10 hover:text-white disabled:cursor-not-allowed disabled:text-cyan-100/30 disabled:hover:bg-transparent"
                      disabled={isImageWorkspace && !imageViewportReady}
                      onClick={handleZoomFit}
                      type="button"
                    >
                      Fit
                    </button>
                    <IconButton
                      disabled={isImageWorkspace && !imageViewportReady}
                      icon={<Plus size={16} />}
                      label="Zoom in"
                      onClick={handleZoomIn}
                    />
                  </div>
                </div>
              ) : null}

              <MobileDrawerActionButton icon={<Command size={16} />} label="Commands" onClick={() => handleMenuCommand('view:command-palette', 'topbar')} />
              <MobileDrawerActionButton icon={<FolderOpen size={16} />} label="Projects" onClick={() => setProjectLibraryOpen(true)} />
              <MobileDrawerActionButton icon={isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />} label={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'} onClick={() => void toggleFullscreen()} />
              <MobileDrawerActionButton icon={<Settings size={16} />} label="Settings" onClick={toggleSettings} />

              {workspaceView === 'flow' ? (
                <>
                  <MobileDrawerActionButton icon={<Library size={16} />} label="Functions" onClick={() => setFunctionLibraryOpen(true)} />
                  <MobileDrawerActionButton
                    icon={<Download size={16} />}
                    label={copyState === 'copied' ? 'Copied' : copyState === 'error' ? 'Failed' : 'Export'}
                    onClick={() => void handleCopyFlow()}
                  />
                </>
              ) : null}
            </div>
            <UsageBar placement="mobile-drawer" workspaceView={workspaceView} />
          </div>
        ) : null}

        {renderMobileTopbarOverlays()}
      </div>
    );
  }

  return (
    <div className="theme-topbar absolute top-0 left-0 right-0 z-[80] flex h-16 items-center gap-3 border-b px-4 shadow-[0_10px_28px_rgba(0,0,0,0.22)]">
      <div
        className="pointer-events-none relative z-20 flex min-w-0 max-w-[58vw] shrink items-center gap-3 overflow-x-auto overflow-y-hidden [scrollbar-width:none]"
        data-topbar-left-controls="true"
      >
        <div className="pointer-events-auto flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-cyan-300/25 bg-[#0b1421] shadow-[0_0_18px_rgba(34,211,238,0.16)]" data-testid="app-icon-container" title={`${workspaceView.charAt(0).toUpperCase() + workspaceView.slice(1)} Workspace`}>
          <img
            alt={`${workspaceView} Icon`}
            className="h-full w-full object-contain p-1.5"
            src={activeIcon}
          />
        </div>

        {showIntegratedMenu ? (
          <div
            ref={appMenuRef}
            className="pointer-events-auto flex shrink-0 items-center gap-0.5 border-r border-cyan-300/15 pr-3"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setOpenMenuId(null);
              }
            }}
          >
            {appMenuGroups.map((group) => (
              <div className="relative" key={group.id}>
                <button
                  aria-expanded={openMenuId === group.id}
                  className={`rounded px-2 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:text-cyan-100/25 ${
                    group.enabled ? 'text-cyan-100/70 hover:bg-cyan-400/10 hover:text-white' : 'text-cyan-100/25'
                  } ${
                    openMenuId === group.id ? 'bg-cyan-400/10 text-white' : ''
                  }`}
                  disabled={!group.enabled}
                  onClick={() => setOpenMenuId((current) => current === group.id ? null : group.id)}
                  type="button"
                >
                  {group.label}
                </button>
                {openMenuId === group.id ? (
                  <div className="absolute left-0 top-full z-[70] mt-2 min-w-56 overflow-hidden rounded-md border border-cyan-300/20 bg-[#0d1725] py-1 shadow-2xl shadow-black/40">
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

        <div className="pointer-events-auto flex shrink-0 items-center gap-1 rounded-full border border-cyan-300/10 bg-[#09101d]/65 p-1 shadow-[0_4px_24px_rgba(0,0,0,0.35)] backdrop-blur-md" data-testid="workspace-switcher">
          {WORKSPACE_TABS.map((tab) => {
            const isActive = workspaceView === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => handleMenuCommand(tab.command, 'topbar')}
                className={`group flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-semibold tracking-wide border transition-all duration-300 ${
                  isActive
                    ? tab.activeClass
                    : `border-transparent text-cyan-100/50 ${tab.hoverClass}`
                }`}
                title={`${tab.label} Workspace — ${tab.desc}`}
                type="button"
              >
                <img
                  src={tab.icon}
                  alt={tab.label}
                  className="h-5 w-5 rounded-md object-contain transition-transform duration-300 group-hover:scale-110"
                />
                {isActive && (
                  <span className={`h-1.5 w-1.5 rounded-full ${tab.dotClass} shrink-0 animate-pulse`} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {workspaceView === 'flow' ? (
        <div
          className="pointer-events-none relative z-10 flex min-w-0 flex-1 justify-center"
          data-flow-node-toolbar-layer="true"
        >
          <BottomToolbar onAddNode={addFlowNodeFromTopbar} variant="topbar" />
        </div>
      ) : null}

      {isPaperWorkspace ? (
        <div
          className="flex min-w-0 flex-1 items-center overflow-hidden"
          id={PAPER_TOPBAR_SLOT_ID}
        />
      ) : null}

      {workspaceView === 'image' ? (
        <div
          className="pointer-events-auto relative z-10 flex min-w-0 flex-1 items-center justify-center gap-1 overflow-x-auto [scrollbar-width:none]"
          id={IMAGE_TOPBAR_CENTER_SLOT_ID}
        />
      ) : null}

      <div
        className={`pointer-events-none relative z-20 flex min-w-0 items-center justify-end gap-2 ${primaryControlsFlexClass}`}
        data-topbar-primary-controls="true"
      >
        {workspaceView === 'image' ? (
          <div
            className="pointer-events-auto flex shrink-0 items-center"
            id={IMAGE_TOPBAR_RIGHT_SLOT_ID}
          />
        ) : null}
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
            onTogglePanel={toggleVideoPanel}
            onUndo={() => dispatchNativeRendererCommand('edit:undo')}
            programMonitorVisible={programMonitorVisible}
            sourceBinCount={sourceBinItemCount}
            sourceBinNodeCount={sourceBinNodeCount}
            sourceBinVisible={sourceBinVisible}
            sourceMonitorVisible={sourceMonitorVisible}
          />
        ) : null}

        {workspaceView === 'flow' && sourceBins.length > 0 ? (
          <label
            className="theme-control pointer-events-auto flex h-9 shrink-0 items-center gap-2 rounded-full border px-3 text-sm text-cyan-50/80"
            title="Target source bin"
          >
            <Library size={15} />
            <select
              aria-label="Target source bin"
              className="max-w-44 bg-transparent text-sm text-cyan-50 outline-none"
              onChange={(event) => onActiveFlowSourceBinChange?.(event.target.value || undefined)}
              value={flowTargetBinId}
            >
              {sourceBins.map((bin) => (
                <option className="bg-[#0d1725] text-cyan-50" key={bin.id} value={bin.id}>
                  {bin.name} ({bin.items.length})
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <div className="theme-control pointer-events-auto flex shrink-0 items-center gap-2 rounded-full border px-2 py-1.5">
          {showGenericViewportControls ? (
            <>
              <div className="theme-border theme-muted-text hidden min-w-16 items-center justify-center border-r px-2 text-sm min-[2000px]:flex">
                {Math.round(visibleZoom * 100)}%
              </div>

              <IconButton
                disabled={isImageWorkspace && !imageViewportReady}
                icon={<Minus size={16} />}
                label="Zoom out"
                onClick={handleZoomOut}
              />
              <button
                className="rounded-full px-2.5 py-2 text-sm text-cyan-100/75 transition-colors hover:bg-cyan-400/10 hover:text-white disabled:cursor-not-allowed disabled:text-cyan-100/30 disabled:hover:bg-transparent"
                disabled={isImageWorkspace && !imageViewportReady}
                onClick={handleZoomFit}
                type="button"
              >
                Fit
              </button>
              <IconButton
                disabled={isImageWorkspace && !imageViewportReady}
                icon={<Plus size={16} />}
                label="Zoom in"
                onClick={handleZoomIn}
              />

              <div className="mx-0.5 h-5 w-px bg-cyan-300/15" />
            </>
          ) : null}

          <IconButton
            icon={isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            onClick={() => void toggleFullscreen()}
          />
          <IconButton
            icon={<Command size={16} />}
            label="Command palette"
            onClick={() => handleMenuCommand('view:command-palette', 'topbar')}
          />

          <div className="mx-0.5 h-5 w-px bg-cyan-300/15" />

          <button
            className="flex items-center gap-2 rounded-full px-2.5 py-2 text-sm text-cyan-100/75 transition-colors hover:bg-cyan-400/10 hover:text-white"
            onClick={() => setProjectLibraryOpen(true)}
            title="Open the local project library"
            type="button"
          >
            <FolderOpen size={16} />
            <span className="hidden min-[2000px]:inline">Projects</span>
          </button>

          {workspaceView === 'flow' ? (
            <FlowWorkspaceSwitcher
              activeWorkspaceId={flowWorkspaceCommands.activeWorkspaceId}
              onCreateWorkspace={() => {
                void flowWorkspaceCommands.handleCreateWorkspace();
              }}
              onSelectWorkspace={flowWorkspaceCommands.handleSelectWorkspace}
              workspaces={flowWorkspaceCommands.workspaces}
            />
          ) : null}

          {workspaceView === 'flow' ? (
            <button
              className="flex items-center gap-2 rounded-full border border-emerald-300/30 bg-emerald-400/15 px-2.5 py-2 text-sm font-semibold text-emerald-100 transition-colors hover:border-emerald-100/70 hover:bg-emerald-300/25 hover:text-white"
              onClick={() => setFunctionLibraryOpen(true)}
              title="Open the reusable function library"
              type="button"
            >
              <Library size={16} />
              <span className="hidden min-[2000px]:inline">Functions</span>
            </button>
          ) : null}

          {workspaceView === 'flow' ? (
            <button
              className="flex items-center gap-2 rounded-full px-2.5 py-2 text-sm text-cyan-100/75 transition-colors hover:bg-cyan-400/10 hover:text-white"
              onClick={() => void handleCopyFlow()}
              title="Copy the current flow JSON to the clipboard"
              type="button"
            >
              <Download size={16} />
              <span className="hidden min-[2000px]:inline">{copyState === 'copied' ? 'Copied' : copyState === 'error' ? 'Failed' : 'Export'}</span>
            </button>
          ) : null}

          {workspaceView === 'flow' && flowWorkspaceMetricLabel ? (
            <span
              className="hidden rounded-full border border-cyan-300/15 px-2.5 py-2 text-[11px] text-cyan-100/45 3xl:inline"
              data-testid="flow-workspace-metrics"
            >
              {flowWorkspaceMetricLabel}
            </span>
          ) : null}

          <IconButton icon={<Settings size={16} />} label="Provider settings" onClick={toggleSettings} />
          <UsageBar placement="topbar" workspaceView={workspaceView} />
        </div>
      </div>

      <ProjectLibraryModal
        isOpen={isProjectLibraryOpen}
        onClose={() => setProjectLibraryOpen(false)}
      />
      <FunctionLibraryDrawer
        builtInFunctions={getFunctionLibraryEntries([]).filter((entry) => entry.source !== 'custom')}
        customFunctions={customFunctionLibraryEntries}
        onClose={() => setFunctionLibraryOpen(false)}
        onInsertBuiltIn={insertFunctionLibraryEntry}
        onInsertCustom={insertFunctionLibraryEntry}
        open={isFunctionLibraryOpen}
      />
    </div>
  );
};

interface IconButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
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
    <div className="pointer-events-auto hidden min-w-0 flex-1 items-center justify-end gap-1.5 overflow-hidden xl:flex">
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

function MobileEditorPanelControls({
  inspectorVisible,
  isCompositionRendering,
  onAddComposition,
  onAddSourceBin,
  onHelp,
  onRedo,
  onRender,
  onTogglePanel,
  onUndo,
  programMonitorVisible,
  renderDisabled,
  sourceBinVisible,
  sourceMonitorVisible,
}: {
  inspectorVisible: boolean;
  isCompositionRendering: boolean;
  onAddComposition: () => void;
  onAddSourceBin: () => void;
  onHelp: () => void;
  onRedo: () => void;
  onRender: () => void;
  onTogglePanel: (panel: EditorPanelVisibilityKey, visible: boolean) => void;
  onUndo: () => void;
  programMonitorVisible: boolean;
  renderDisabled: boolean;
  sourceBinVisible: boolean;
  sourceMonitorVisible: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 rounded-lg border border-cyan-300/10 bg-[#09101d]/65 p-2" data-mobile-video-controls="true">
      <MobileDrawerActionButton icon={<Undo2 size={16} />} label="Undo" onClick={onUndo} />
      <MobileDrawerActionButton icon={<Redo2 size={16} />} label="Redo" onClick={onRedo} />
      <MobileDrawerActionButton icon={<Plus size={16} />} label="Source Bin" onClick={onAddSourceBin} />
      <MobileDrawerActionButton icon={<Plus size={16} />} label="Composition" onClick={onAddComposition} />
      <button
        className="col-span-2 inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-white px-3 text-sm font-semibold text-black transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:bg-gray-500/30 disabled:text-white"
        disabled={renderDisabled}
        onClick={onRender}
        type="button"
      >
        <Play size={14} fill="currentColor" />
        {isCompositionRendering ? 'Rendering...' : 'Render'}
      </button>
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
      <MobileDrawerActionButton icon={<Command size={16} />} label="Help" onClick={onHelp} />
    </div>
  );
}

function MobileDrawerActionButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="theme-control inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-semibold text-cyan-100/80 transition-colors hover:text-white"
      onClick={onClick}
      type="button"
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function IconButton({ disabled = false, icon, label, onClick }: IconButtonProps) {
  return (
    <button
      className="rounded-full p-2 text-cyan-100/60 transition-colors hover:bg-cyan-400/10 hover:text-white disabled:cursor-not-allowed disabled:text-cyan-100/25 disabled:hover:bg-transparent"
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      {icon}
    </button>
  );
}
