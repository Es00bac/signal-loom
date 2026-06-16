import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { IMAGE_TOPBAR_CENTER_SLOT_ID, IMAGE_TOPBAR_RIGHT_SLOT_ID, observeTopbarSlot } from '../../lib/imageTopbarSlots';
import { GripHorizontal, Hand, Maximize2, Minus, PanelBottomOpen, PanelLeftOpen, PanelRightOpen, Plus, X } from 'lucide-react';
import { ImageEditorToolbar } from './ImageEditorToolbar';
import { ImageEditorCanvas } from './ImageEditorCanvas';
import { ImageEditorTabs } from './ImageEditorTabs';
import { ImageEditorLayersPanel } from './ImageEditorLayersPanel';
import { ImageEditorChannelsPanel } from './ImageEditorChannelsPanel';
import { ImageEditorHistoryPanel } from './ImageEditorHistoryPanel';
import { ImageEditorPathsPanel } from './ImageEditorPathsPanel';
import { ImageEditorPropertiesPanel } from './ImageEditorPropertiesPanel';
import { BrushSelectionPalette } from './BrushSelectionPalette';
import { ImageEditorAssetBar } from './ImageEditorAssetBar';
import { ImageEditorContextMenu } from './ImageEditorContextMenu';
import { ImageEditorHelp } from './ImageEditorHelp';
import { GenerativeFillBar } from './GenerativeFillBar';
import { useImageEditorStore } from '../../store/imageEditorStore';
import { useSourceBinStore } from '../../store/sourceBinStore';
import { useWorkspaceLayoutStore } from '../../store/workspaceLayoutStore';
import { useDockablePanelStore } from '../../store/dockablePanelStore';
import { panelKey, type DockZone, type DockablePanelLayout } from '../../lib/dockablePanel';
import { canMoveImageLayer } from '../../lib/imageLayerLocks';
import { isImageLayerLinked, translateLinkedImageLayers } from '../../lib/imageLayerLinks';
import { DockablePanelHost } from '../DockablePanel/DockablePanelHost';
import {
  IMAGE_DOCKABLE_PANEL_DEFINITIONS,
  IMAGE_DOCKABLE_PANEL_IDS,
  IMAGE_LAYOUT_PRESETS,
  IMAGE_DOCKABLE_WORKSPACE_ID,
  createImageDockablePanelDefinitions,
  getImageDockablePanelDefinition,
  getImageLayoutPreset,
  getImageLayoutPresetIdForLayout,
  resolveImagePanelsForWorkspaceChrome,
  type ImageLayoutPreset,
  type ImageLayoutPresetId,
  type ImageDockablePanelId,
} from './ImageDockablePanels';
import { clearSelection, getSelection, setSelection } from './selectionRegistry';
import { createMask, fillMask, invertMask, maskBoundingBox, toSnapshot } from './SelectionMask';
import {
  copyActiveImageSelection,
  cutActiveImageSelection,
  deleteActiveImageSelection,
  deleteActiveLayer,
  pasteImageClipboard,
} from './imageClipboardActions';
import { PHOTOSHOP_QUICK_ACTIONS } from './PhotoshopQuickActions';
import { runPhotoshopQuickAction } from './PhotoshopQuickActionRunner';
import { nudgeSelection } from './photoshopQuickActions/selectionActions';
import { redo, undo } from './undoRedoApply';
import type { NativeMenuCommand } from '../../lib/nativeApp';
import { buildDownloadFilename, downloadBlob } from '../../lib/downloadAsset';
import { useNativeMenuCommand } from '../../shared/native/useNativeMenuCommand';
import {
  getSharedSourceBinCanvasOffsetClassName,
  getSharedSourceBinCanvasOffsetPx,
} from '../../lib/sharedWorkspacePanelDefaults';
import {
  imageDocumentToSaveBlob,
  readStoredImageDocumentSaveMimeType,
} from './ImageDocumentSave';
import {
  IMAGE_PSD_EXTENSION,
  IMAGE_PSD_MIME_TYPE,
  imageDocumentToPsdBlob,
} from './ImagePsdInterop';
import { createImageDocumentFromClipboard, createImageDocumentFromFile, createNewBlankDocument } from './ImageSourceDocument';
import { NewDocumentModal } from './NewDocumentModal';
import {
  getDraggedSourceLibraryItemId,
  hasDraggedSourceLibraryItem,
} from '../../lib/sourceLibraryWorkspaceActions';
import { openSourceLibraryImageDocument } from '../../lib/sourceLibraryImageOpen';
import { showAlertDialog } from '../../store/alertDialogStore';
import { ImageAutomationWorkspace } from '../../features/imageAutomation/ImageAutomationWorkspace';
import {
  getImageNavigationCommandViewport,
  type ImageNavigationCommand,
} from './ImageNavigationCommands';
import { useMobileInterfaceStore } from '../../store/mobileInterfaceStore';
import { useMobilePhoneInterfaceDescriptor } from '../../lib/mobilePhoneInterface';
import { FlowSourceBinSidebar } from '../Layout/FlowSourceBinSidebar';
import { useTouchNavigationStore } from '../../store/touchNavigationStore';

interface ImageEditorWorkspaceProps {
  getNewFlowNodePosition: () => { x: number; y: number };
}

const IMAGE_NATIVE_MENU_COMMAND_PREFIXES = ['image:', 'edit:'] as const;

export function ImageEditorWorkspace({ getNewFlowNodePosition }: ImageEditorWorkspaceProps) {
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const [helpVisible, setHelpVisible] = useState(false);
  const [showNewDocModal, setShowNewDocModal] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState<'editor' | 'automation'>('editor');
  // Top-nav-bar slots the desktop workspace controls are portaled into (zoom -> right, the rest -> center).
  const [imageTopbarCenterSlot, setImageTopbarCenterSlot] = useState<HTMLElement | null>(null);
  const [imageTopbarRightSlot, setImageTopbarRightSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const disposeCenter = observeTopbarSlot(document, IMAGE_TOPBAR_CENTER_SLOT_ID, setImageTopbarCenterSlot);
    const disposeRight = observeTopbarSlot(document, IMAGE_TOPBAR_RIGHT_SLOT_ID, setImageTopbarRightSlot);
    return () => { disposeCenter(); disposeRight(); };
  }, []);
  const [openingLocalImage, setOpeningLocalImage] = useState(false);
  const [localImageOpenStatus, setLocalImageOpenStatus] = useState<string | null>(null);
  const [selectedLayoutPresetId, setSelectedLayoutPresetId] = useState<ImageLayoutPresetId | 'custom'>(() =>
    getImageLayoutPresetIdForLayout(useWorkspaceLayoutStore.getState().image),
  );
  const setTool = useImageEditorStore((s) => s.setTool);
  const setSelectionToolSettings = useImageEditorStore((s) => s.setSelectionToolSettings);
  const toggleQuickMask = useImageEditorStore((s) => s.toggleQuickMask);
  const updateLayer = useImageEditorStore((s) => s.updateLayer);
  const openDocument = useImageEditorStore((s) => s.openDocument);
  const activeDocId = useImageEditorStore((s) => s.activeDocId);
  const imageLayout = useWorkspaceLayoutStore((s) => s.image);
  const setImageLayout = useWorkspaceLayoutStore((s) => s.setImageLayout);
  const dockableLayouts = useDockablePanelStore((s) => s.layouts);
  const hidePanel = useDockablePanelStore((s) => s.hidePanel);
  const dockPanel = useDockablePanelStore((s) => s.dockPanel);
  const floatPanel = useDockablePanelStore((s) => s.floatPanel);
  const resetWorkspacePanels = useDockablePanelStore((s) => s.resetWorkspacePanels);

  useEffect(() => {
    setImagePanelGroupVisible([IMAGE_DOCKABLE_PANEL_IDS.tools], imageLayout.toolbarVisible, hidePanel, dockPanel, floatPanel);
  }, [dockPanel, floatPanel, hidePanel, imageLayout.toolbarVisible]);

  useEffect(() => {
    setImagePanelGroupVisible(
      [IMAGE_DOCKABLE_PANEL_IDS.layers, IMAGE_DOCKABLE_PANEL_IDS.properties, IMAGE_DOCKABLE_PANEL_IDS.brushes, IMAGE_DOCKABLE_PANEL_IDS.channels, IMAGE_DOCKABLE_PANEL_IDS.paths, IMAGE_DOCKABLE_PANEL_IDS.history],
      imageLayout.rightPanelVisible,
      hidePanel,
      dockPanel,
      floatPanel,
    );
  }, [dockPanel, floatPanel, hidePanel, imageLayout.rightPanelVisible]);

  useEffect(() => {
    setImagePanelGroupVisible([IMAGE_DOCKABLE_PANEL_IDS.assets], imageLayout.assetBarVisible, hidePanel, dockPanel, floatPanel);
  }, [dockPanel, floatPanel, hidePanel, imageLayout.assetBarVisible]);

  const toolsVisible = isImagePanelGroupVisible(dockableLayouts, [IMAGE_DOCKABLE_PANEL_IDS.tools], imageLayout.toolbarVisible);
  const rightPanelsVisible = isImagePanelGroupVisible(
    dockableLayouts,
    [IMAGE_DOCKABLE_PANEL_IDS.layers, IMAGE_DOCKABLE_PANEL_IDS.properties, IMAGE_DOCKABLE_PANEL_IDS.brushes, IMAGE_DOCKABLE_PANEL_IDS.channels, IMAGE_DOCKABLE_PANEL_IDS.paths, IMAGE_DOCKABLE_PANEL_IDS.history],
    imageLayout.rightPanelVisible,
  );
  const assetsVisible = isImagePanelGroupVisible(dockableLayouts, [IMAGE_DOCKABLE_PANEL_IDS.assets], imageLayout.assetBarVisible);
  const sharedSourceBinCanvasOffsetClassName = getSharedSourceBinCanvasOffsetClassName(
    dockableLayouts[panelKey(IMAGE_DOCKABLE_WORKSPACE_ID, 'source-bin')],
  );
  const sharedSourceBinCanvasOffsetPx = getSharedSourceBinCanvasOffsetPx(
    dockableLayouts[panelKey(IMAGE_DOCKABLE_WORKSPACE_ID, 'source-bin')],
  );

  const dockablePanels = useMemo(
    () => {
      const layoutByPanelId = Object.fromEntries(
        IMAGE_DOCKABLE_PANEL_DEFINITIONS.map((panel) => [
          panel.panelId as ImageDockablePanelId,
          dockableLayouts[panelKey(IMAGE_DOCKABLE_WORKSPACE_ID, panel.panelId)],
        ]),
      ) as Partial<Record<ImageDockablePanelId, DockablePanelLayout>>;

      return createImageDockablePanelDefinitions({
        enableTabbedPanelGroups: true,
        layoutByPanelId,
      }).map((panel) => ({
        ...panel,
        content: renderImageDockablePanel(panel.panelId as ImageDockablePanelId, getNewFlowNodePosition),
      }));
    },
    [dockableLayouts, getNewFlowNodePosition],
  );

  const applyLayoutPreset = useCallback((presetId: ImageLayoutPresetId) => {
    const preset = getImageLayoutPreset(presetId);
    if (!preset) return;

    setSelectedLayoutPresetId(presetId);
    setImageLayout(preset.layout);
    applyImageLayoutPreset(preset, hidePanel, dockPanel, floatPanel);
  }, [dockPanel, floatPanel, hidePanel, setImageLayout]);

  const runNavigationCommand = useCallback((command: ImageNavigationCommand) => {
    const state = useImageEditorStore.getState();
    const doc = state.documents.find((candidate) => candidate.id === state.activeDocId);
    if (!doc) return;
    const nextViewport = getImageNavigationCommandViewport(command, doc, state.viewportContainerSize);
    state.setViewport(doc.id, nextViewport);
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const ctrl = e.ctrlKey || e.metaKey;
      const docId = useImageEditorStore.getState().activeDocId;

      if (!ctrl && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        const state = useImageEditorStore.getState();
        const doc = state.documents.find((candidate) => candidate.id === docId);
        if (doc) {
          const selection = getSelection(doc.id);
          if (selection && maskBoundingBox(selection)) {
            e.preventDefault();
            const step = e.shiftKey ? 10 : 1;
            const delta = {
              x: e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0,
              y: e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0,
            };
            const after = nudgeSelection(selection, delta.x, delta.y);
            const hasSelectionAfter = Boolean(maskBoundingBox(after));
            state.pushOperation({
              kind: 'selection',
              docId: doc.id,
              before: toSnapshot(selection),
              after: hasSelectionAfter ? toSnapshot(after) : null,
            });
            if (hasSelectionAfter) {
              setSelection(doc.id, after);
            } else {
              clearSelection(doc.id);
            }
            state.bumpSelectionVersion(doc.id);
            state.setHasSelection(doc.id, hasSelectionAfter);
            return;
          }
        }
        const activeLayer = doc?.layers.find((layer) => layer.id === doc.activeLayerId);
        if (doc && canMoveImageLayer(activeLayer)) {
          e.preventDefault();
          const step = e.shiftKey ? 10 : e.altKey ? 0.25 : 1;
          const delta = {
            x: e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0,
            y: e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0,
          };
          if (isImageLayerLinked(activeLayer)) {
            state.setLayers(doc.id, translateLinkedImageLayers(doc.layers, activeLayer.id, delta), doc.activeLayerId);
          } else {
            updateLayer(doc.id, activeLayer.id, {
              x: activeLayer.x + delta.x,
              y: activeLayer.y + delta.y,
            });
          }
          return;
        }
      }

      if (ctrl) {
        const k = e.key.toLowerCase();
        if (docId) {
          if (k === '=' || k === '+') {
            e.preventDefault();
            runNavigationCommand('zoom-in');
            return;
          }
          if (k === '-' || k === '_') {
            e.preventDefault();
            runNavigationCommand('zoom-out');
            return;
          }
          if (k === '0') {
            e.preventDefault();
            runNavigationCommand('fit');
            return;
          }
          if (k === '1') {
            e.preventDefault();
            runNavigationCommand('actual-size');
            return;
          }
          if (k === 'z' && !e.shiftKey) {
            e.preventDefault();
            undo(docId);
            return;
          }
          if ((k === 'y') || (k === 'z' && e.shiftKey)) {
            e.preventDefault();
            redo(docId);
            return;
          }
          if (k === 'c' && !e.shiftKey) {
            e.preventDefault();
            copyActiveImageSelection();
            return;
          }
          if (k === 'x' && !e.shiftKey) {
            e.preventDefault();
            cutActiveImageSelection();
            return;
          }
          if (k === 'v' && !e.shiftKey) {
            e.preventDefault();
            pasteImageClipboard();
            return;
          }
          if (k === 'a') {
            e.preventDefault();
            const state = useImageEditorStore.getState();
            const doc = state.documents.find((d) => d.id === docId);
            if (!doc) return;
            const mask = createMask(doc.width, doc.height);
            fillMask(mask);
            setSelection(docId, mask);
            state.setHasSelection(docId, true);
            return;
          }
          if (k === 'd') {
            e.preventDefault();
            const state = useImageEditorStore.getState();
            clearSelection(docId);
            state.setHasSelection(docId, false);
            return;
          }
          if (k === 'i' && e.shiftKey) {
            e.preventDefault();
            const state = useImageEditorStore.getState();
            const doc = state.documents.find((d) => d.id === docId);
            if (!doc) return;
            let mask = getSelection(docId);
            if (!mask) {
              mask = createMask(doc.width, doc.height);
              fillMask(mask);
              setSelection(docId, mask);
            } else {
              invertMask(mask);
            }
            state.bumpSelectionVersion(docId);
            state.setHasSelection(docId, true);
            return;
          }
        }
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'h':
          setTool('hand');
          break;
        case 'v':
          setTool('move');
          break;
        case 'm':
          setTool('marquee');
          if (e.shiftKey) {
            const next =
              useImageEditorStore.getState().selectionToolSettings.marqueeShape === 'rectangle'
                ? 'ellipse'
                : 'rectangle';
            setSelectionToolSettings({ marqueeShape: next });
          }
          break;
        case 'l':
          setTool('lasso');
          if (e.shiftKey) {
            const next =
              useImageEditorStore.getState().selectionToolSettings.lassoShape === 'freehand'
                ? 'polygonal'
                : 'freehand';
            setSelectionToolSettings({ lassoShape: next });
          }
          break;
        case 'w':
          setTool('magicWand');
          break;
        case 'b':
          setTool(e.shiftKey ? 'pen' : 'brush');
          break;
        case 'e':
          setTool(e.shiftKey ? 'magicEraser' : 'eraser');
          break;
        case 's':
          setTool('cloneStamp');
          break;
        case 'j':
          setTool('spotHeal');
          break;
        case 'r':
          setTool(e.shiftKey ? 'sharpenBrush' : 'blurBrush');
          break;
        case 'u':
          setTool('smudgeBrush');
          break;
        case 'o':
          setTool(e.shiftKey ? 'burnBrush' : 'dodgeBrush');
          break;
        case 'p':
          setTool(e.shiftKey ? 'spongeDesaturateBrush' : 'spongeSaturateBrush');
          break;
        case 'g':
          setTool(e.shiftKey ? 'gradientTool' : 'paintBucket');
          break;
        case 'x':
          setTool(e.shiftKey ? 'ellipseShape' : 'rectShape');
          break;
        case 'c':
          setTool('crop');
          break;
        case 't':
          setTool('text');
          break;
        case 'i':
          setTool('eyedropper');
          break;
        case 'q':
          if (useImageEditorStore.getState().activeDocId) {
            toggleQuickMask();
          }
          break;
        case 'f1':
          e.preventDefault();
          setHelpVisible((v) => !v);
          break;
      }
    };

    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [runNavigationCommand, setTool, setSelectionToolSettings, toggleQuickMask, updateLayer]);

  const handleNativeMenuCommand = useCallback((command: NativeMenuCommand) => {
    switch (command) {
      case 'edit:undo': {
        const docId = useImageEditorStore.getState().activeDocId;
        if (docId) undo(docId);
        return;
      }
      case 'edit:redo': {
        const docId = useImageEditorStore.getState().activeDocId;
        if (docId) redo(docId);
        return;
      }
      case 'edit:copy':
        copyActiveImageSelection();
        return;
      case 'edit:cut':
        cutActiveImageSelection();
        return;
      case 'edit:paste':
        pasteImageClipboard();
        return;
      case 'edit:delete':
        deleteActiveImageSelection();
        return;
      case 'edit:select-all':
        selectAllActiveImageDocument();
        return;
      case 'edit:deselect':
        deselectActiveImageDocument();
        return;
      case 'edit:invert-selection':
        invertActiveImageSelection();
        return;
      case 'image:tool-hand':
        setTool('hand');
        return;
      case 'image:tool-text':
        setTool('text');
        return;
      case 'image:tool-move':
        setTool('move');
        return;
      case 'image:tool-marquee':
        setTool('marquee');
        return;
      case 'image:tool-lasso':
        setTool('lasso');
        return;
      case 'image:tool-magic-wand':
        setTool('magicWand');
        return;
      case 'image:tool-brush':
        setTool('brush');
        return;
      case 'image:tool-pen':
        setTool('pen');
        return;
      case 'image:tool-eraser':
        setTool('eraser');
        return;
      case 'image:tool-background-eraser':
        setTool('backgroundEraser');
        return;
      case 'image:tool-magic-eraser':
        setTool('magicEraser');
        return;
      case 'image:tool-clone-stamp':
        setTool('cloneStamp');
        return;
      case 'image:tool-spot-heal':
        setTool('spotHeal');
        return;
      case 'image:tool-blur-brush':
        setTool('blurBrush');
        return;
      case 'image:tool-sharpen-brush':
        setTool('sharpenBrush');
        return;
      case 'image:tool-smudge-brush':
        setTool('smudgeBrush');
        return;
      case 'image:tool-dodge-brush':
        setTool('dodgeBrush');
        return;
      case 'image:tool-burn-brush':
        setTool('burnBrush');
        return;
      case 'image:tool-sponge-saturate':
        setTool('spongeSaturateBrush');
        return;
      case 'image:tool-sponge-desaturate':
        setTool('spongeDesaturateBrush');
        return;
      case 'image:tool-paint-bucket':
        setTool('paintBucket');
        return;
      case 'image:tool-gradient':
        setTool('gradientTool');
        return;
      case 'image:tool-rectangle-shape':
        setTool('rectShape');
        return;
      case 'image:tool-ellipse-shape':
        setTool('ellipseShape');
        return;
      case 'image:tool-crop':
        setTool('crop');
        return;
      case 'image:tool-eyedropper':
        setTool('eyedropper');
        return;
      case 'image:export-visible':
        void downloadActiveImageDocument();
        return;
      case 'image:export-psd':
        void downloadActiveImagePsd();
        return;
      default:
        return;
    }
  }, [setTool]);

  useNativeMenuCommand(handleNativeMenuCommand, {
    prefixes: IMAGE_NATIVE_MENU_COMMAND_PREFIXES,
  });

  const handleOpenLocalImageFile = useCallback(async (file: File) => {
    if (openingLocalImage) return;

    setOpeningLocalImage(true);
    setLocalImageOpenStatus(null);
    try {
      const doc = await createImageDocumentFromFile(file);
      openDocument(doc);
      setLocalImageOpenStatus(`Opened "${doc.title}".`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The image file could not be opened.';
      setLocalImageOpenStatus(message);
      await showAlertDialog({
        title: 'Open Image Failed',
        message,
        tone: 'danger',
      });
    } finally {
      setOpeningLocalImage(false);
    }
  }, [openDocument, openingLocalImage]);

  const handleCreateNewDocument = useCallback((options: {
    title: string;
    width: number;
    height: number;
    background: string;
  }) => {
    const doc = createNewBlankDocument(options);
    openDocument(doc);
    setLocalImageOpenStatus(`Created new canvas "${doc.title}".`);
  }, [openDocument]);

  const handleCreateFromClipboard = useCallback(async () => {
    setLocalImageOpenStatus(null);
    try {
      const doc = await createImageDocumentFromClipboard();
      if (!doc) {
        setLocalImageOpenStatus('No image on the clipboard. Copy an image (here or from another app) first.');
        return;
      }
      openDocument(doc);
      setLocalImageOpenStatus(`Created "${doc.title}" from the clipboard (${doc.width}×${doc.height}).`);
    } catch {
      setLocalImageOpenStatus('Could not read an image from the clipboard.');
    }
  }, [openDocument]);

  const handleSourceLibraryDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!hasDraggedSourceLibraryItem(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleSourceLibraryDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!hasDraggedSourceLibraryItem(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();

    const itemId = getDraggedSourceLibraryItemId(event.dataTransfer);
    const item = itemId
      ? useSourceBinStore.getState().getAllItems().find((candidate) => candidate.id === itemId)
      : undefined;

    if (!item) {
      setLocalImageOpenStatus('That Source Library item could not be found in the current project.');
      return;
    }

    void openSourceLibraryImageDocument({
      item,
      openDocument,
      onStatus: setLocalImageOpenStatus,
    });
  }, [openDocument]);
  const mobilePhoneInterface = useMobilePhoneInterfaceDescriptor();
  const mobileChromeMode = useMobileInterfaceStore((state) => state.chromeMode);
  const workspaceChromeHidden = mobileChromeMode === 'hidden';
  const workspaceChromePaddingClassName = workspaceChromeHidden
    ? 'pt-0'
    : mobilePhoneInterface.enabled
      ? mobilePhoneInterface.collapsedTopPaddingClassName
      : 'pt-16';
  const showWorkspaceChrome = !workspaceChromeHidden;
  const visibleDockablePanels = workspaceChromeHidden
    ? []
    : resolveImagePanelsForWorkspaceChrome(dockablePanels, showWorkspaceChrome);
  const effectiveSharedSourceBinCanvasOffsetClassName = showWorkspaceChrome ? sharedSourceBinCanvasOffsetClassName : '';
  const effectiveSharedSourceBinCanvasOffsetPx = showWorkspaceChrome ? sharedSourceBinCanvasOffsetPx : 0;
  const usePhoneImageShell = mobilePhoneInterface.enabled && workspaceMode === 'editor';

  useEffect(() => {
    if (!mobilePhoneInterface.enabled || mobileChromeMode !== 'collapsed' || workspaceMode !== 'editor') return;

    const toolsLayout = dockableLayouts[panelKey(IMAGE_DOCKABLE_WORKSPACE_ID, IMAGE_DOCKABLE_PANEL_IDS.tools)];
    const topInsetPx = mobilePhoneInterface.topbarHeightPx + 8;
    const currentRect = toolsLayout?.floatingRect ?? { x: 368, y: 112, width: 66, height: 492 };
    const nextRect = {
      ...currentRect,
      y: Math.max(topInsetPx, currentRect.y),
      height: Math.max(currentRect.height, 492),
    };

    if (!imageLayout.toolbarVisible) {
      setImageLayout({ toolbarVisible: true });
    }

    if (toolsLayout?.mode !== 'floating' || currentRect.y !== nextRect.y || currentRect.height !== nextRect.height) {
      floatPanel(
        IMAGE_DOCKABLE_WORKSPACE_ID,
        IMAGE_DOCKABLE_PANEL_IDS.tools,
        nextRect,
        {
          width: typeof window === 'undefined' ? 1920 : window.innerWidth,
          height: typeof window === 'undefined' ? 1080 : window.innerHeight,
        },
        { constrainSize: false },
      );
    }
  }, [
    dockableLayouts,
    floatPanel,
    imageLayout.toolbarVisible,
    mobileChromeMode,
    mobilePhoneInterface.enabled,
    mobilePhoneInterface.topbarHeightPx,
    setImageLayout,
    workspaceMode,
  ]);

  // Workspace controls, shared between the desktop top-nav-bar slots (zoom -> right, the rest -> centre)
  // and the inline mobile row.
  const workspaceControlsStatus = localImageOpenStatus ? (
    <div className="max-w-[28vw] shrink-0 truncate px-2 text-[11px] text-cyan-100/55" title={localImageOpenStatus}>
      {localImageOpenStatus}
    </div>
  ) : null;
  const workspaceControlsZoom = workspaceMode === 'editor' ? (
    <ImageNavigationControls disabled={!activeDocId} onCommand={runNavigationCommand} />
  ) : null;
  const workspaceControlsButtons = workspaceMode === 'editor' ? (
    <>
      {!mobilePhoneInterface.enabled ? (
        <>
          <ImageLayoutButton
            active={toolsVisible}
            label="Tools"
            onClick={() => {
              setSelectedLayoutPresetId('custom');
              setImageLayout({ toolbarVisible: !toolsVisible });
              setImagePanelGroupVisible([IMAGE_DOCKABLE_PANEL_IDS.tools], !toolsVisible, hidePanel, dockPanel, floatPanel);
            }}
          />
          <ImageLayoutButton
            active={rightPanelsVisible}
            label="Panels"
            onClick={() => {
              setSelectedLayoutPresetId('custom');
              setImageLayout({ rightPanelVisible: !rightPanelsVisible });
              setImagePanelGroupVisible(
                [IMAGE_DOCKABLE_PANEL_IDS.layers, IMAGE_DOCKABLE_PANEL_IDS.properties, IMAGE_DOCKABLE_PANEL_IDS.brushes, IMAGE_DOCKABLE_PANEL_IDS.channels, IMAGE_DOCKABLE_PANEL_IDS.paths, IMAGE_DOCKABLE_PANEL_IDS.history],
                !rightPanelsVisible,
                hidePanel,
                dockPanel,
                floatPanel,
              );
            }}
          />
          <ImageLayoutButton
            active={assetsVisible}
            label="Assets"
            onClick={() => {
              setSelectedLayoutPresetId('custom');
              setImageLayout({ assetBarVisible: !assetsVisible });
              setImagePanelGroupVisible([IMAGE_DOCKABLE_PANEL_IDS.assets], !assetsVisible, hidePanel, dockPanel, floatPanel);
            }}
          />
        </>
      ) : null}
      <label className="mr-2 flex items-center gap-1.5 rounded border border-cyan-300/10 bg-[#101a29]/70 px-2 py-1 text-[11px] font-semibold text-cyan-100/55">
        <span>Layout</span>
        <select
          aria-label="Image layout preset"
          className="max-w-28 bg-transparent text-[11px] font-semibold text-cyan-100 outline-none"
          onChange={(event) => {
            const presetId = event.target.value as ImageLayoutPresetId | 'custom';
            if (presetId !== 'custom') {
              applyLayoutPreset(presetId);
            }
          }}
          value={selectedLayoutPresetId}
        >
          {selectedLayoutPresetId === 'custom' ? <option className="bg-[#101a29]" value="custom">Custom</option> : null}
          {IMAGE_LAYOUT_PRESETS.map((preset) => (
            <option className="bg-[#101a29]" key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
        </select>
      </label>
      <ImageLayoutButton
        active={false}
        label="Reset Panels"
        onClick={() => {
          resetWorkspacePanels(IMAGE_DOCKABLE_WORKSPACE_ID);
          setSelectedLayoutPresetId('full-suite');
          setImageLayout({ toolbarVisible: true, rightPanelVisible: true, assetBarVisible: true });
        }}
      />
    </>
  ) : null;
  const workspaceModeToggle = (
    <div className="flex shrink-0 items-center gap-1 rounded border border-cyan-300/10 bg-[#101a29]/70 p-1 text-[11px] font-semibold">
      <button
        className={`rounded px-2 py-1 ${
          workspaceMode === 'editor'
            ? 'bg-cyan-400/15 text-cyan-100'
            : 'text-cyan-100/45 hover:text-cyan-100'
        }`}
        onClick={() => setWorkspaceMode('editor')}
        type="button"
      >
        Editor
      </button>
      <button
        className={`rounded px-2 py-1 ${
          workspaceMode === 'automation'
            ? 'bg-emerald-400/15 text-emerald-100'
            : 'text-cyan-100/45 hover:text-emerald-100'
        }`}
        onClick={() => setWorkspaceMode('automation')}
        type="button"
      >
        Automation
      </button>
    </div>
  );

  return (
    <div className={`signal-loom-themed absolute inset-0 z-30 flex flex-col ${workspaceChromePaddingClassName}`}>
      <NewDocumentModal
        isOpen={showNewDocModal}
        onClose={() => setShowNewDocModal(false)}
        onCreate={handleCreateNewDocument}
      />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {showWorkspaceChrome ? (
          <>
          <div className="theme-surface theme-border relative z-50 flex shrink-0 overflow-x-auto border-b" data-image-workspace-document-chrome="true">
            <div className="flex min-w-max items-center" data-image-workspace-document-chrome-track="true">
            <div className="shrink-0">
              <ImageEditorTabs
                disabled={openingLocalImage}
                onOpenImageFile={handleOpenLocalImageFile}
                onNewCanvas={() => setShowNewDocModal(true)}
                onNewFromClipboard={handleCreateFromClipboard}
              />
            </div>
            </div>
          </div>
          {mobilePhoneInterface.enabled ? (
            <div className="theme-surface theme-border relative z-40 flex shrink-0 overflow-x-auto border-b" data-image-workspace-controls-bar="true">
              <div className="flex min-w-max flex-1 items-center gap-1 px-2 py-1" data-image-workspace-controls-track="true">
                {workspaceControlsStatus}
                {workspaceControlsZoom}
                {workspaceControlsButtons}
                <div className="ml-auto">{workspaceModeToggle}</div>
              </div>
            </div>
          ) : null}
          {/* Desktop: the controls live in the top nav bar — zoom in the right region, the rest in the centre. */}
          {!mobilePhoneInterface.enabled && imageTopbarRightSlot
            ? createPortal(workspaceControlsZoom, imageTopbarRightSlot)
            : null}
          {!mobilePhoneInterface.enabled && imageTopbarCenterSlot
            ? createPortal(
                <div className="flex items-center gap-1.5" data-image-workspace-controls-track="true">
                  {workspaceControlsStatus}
                  {workspaceControlsButtons}
                  {workspaceModeToggle}
                </div>,
                imageTopbarCenterSlot,
              )
            : null}
          </>
          ) : null}
          {workspaceMode === 'automation' ? (
            <div className={`relative flex-1 transition-[margin] duration-200 ${effectiveSharedSourceBinCanvasOffsetClassName}`} style={{ marginLeft: effectiveSharedSourceBinCanvasOffsetPx }}>
              <ImageAutomationWorkspace />
            </div>
          ) : usePhoneImageShell ? (
            <ImageMobileWorkspaceShell getNewFlowNodePosition={getNewFlowNodePosition} visible={showWorkspaceChrome}>
              <div
                className="relative flex h-full min-h-0 flex-1"
                onDragOver={handleSourceLibraryDragOver}
                onDrop={handleSourceLibraryDrop}
                ref={canvasContainerRef}
              >
                <ImageEditorCanvas />
                <GenerativeFillBar />
              </div>
            </ImageMobileWorkspaceShell>
          ) : (
            <DockablePanelHost
              className={`flex-1 transition-[margin] duration-200 ${effectiveSharedSourceBinCanvasOffsetClassName}`}
              panels={visibleDockablePanels}
              style={{ marginLeft: effectiveSharedSourceBinCanvasOffsetPx }}
              workspaceId={IMAGE_DOCKABLE_WORKSPACE_ID}
            >
              <div
                className="relative flex h-full min-h-0 flex-1"
                onDragOver={handleSourceLibraryDragOver}
                onDrop={handleSourceLibraryDrop}
                ref={canvasContainerRef}
              >
                <ImageEditorCanvas />
                <GenerativeFillBar />
              </div>
            </DockablePanelHost>
          )}
      </div>

      {workspaceMode === 'editor' ? (
        <WiredContextMenu
          containerRef={canvasContainerRef}
          onHelp={() => setHelpVisible(true)}
        />
      ) : null}
      <ImageEditorHelp visible={helpVisible} onClose={() => setHelpVisible(false)} />
    </div>
  );
}

function renderImageDockablePanel(panelId: ImageDockablePanelId, getNewFlowNodePosition: () => { x: number; y: number }) {
  switch (panelId) {
    case IMAGE_DOCKABLE_PANEL_IDS.tools:
      return <ImageEditorToolbar />;
    case IMAGE_DOCKABLE_PANEL_IDS.layers:
      return <ImageEditorLayersPanel />;
    case IMAGE_DOCKABLE_PANEL_IDS.properties:
      return <ImageEditorPropertiesPanel />;
    case IMAGE_DOCKABLE_PANEL_IDS.brushes:
      return <BrushSelectionPalette />;
    case IMAGE_DOCKABLE_PANEL_IDS.channels:
      return <ImageEditorChannelsPanel />;
    case IMAGE_DOCKABLE_PANEL_IDS.paths:
      return <ImageEditorPathsPanel />;
    case IMAGE_DOCKABLE_PANEL_IDS.history:
      return <ImageEditorHistoryPanel />;
    case IMAGE_DOCKABLE_PANEL_IDS.assets:
      return <ImageEditorAssetBar getNewFlowNodePosition={getNewFlowNodePosition} />;
  }
}

const MOBILE_IMAGE_RIGHT_PANEL_IDS = [
  IMAGE_DOCKABLE_PANEL_IDS.layers,
  IMAGE_DOCKABLE_PANEL_IDS.properties,
  IMAGE_DOCKABLE_PANEL_IDS.brushes,
  IMAGE_DOCKABLE_PANEL_IDS.channels,
  IMAGE_DOCKABLE_PANEL_IDS.paths,
  IMAGE_DOCKABLE_PANEL_IDS.history,
] as const;

function ImageMobileWorkspaceShell({
  children,
  getNewFlowNodePosition,
  visible,
}: {
  children: ReactNode;
  getNewFlowNodePosition: () => { x: number; y: number };
  visible: boolean;
}) {
  const activeEdgeDrawer = useMobileInterfaceStore((state) => state.activeEdgeDrawer);
  const setActiveEdgeDrawer = useMobileInterfaceStore((state) => state.setActiveEdgeDrawer);
  const toggleEdgeDrawer = useMobileInterfaceStore((state) => state.toggleEdgeDrawer);
  const imageTouchNavigation = useTouchNavigationStore((state) => state.image);
  const setImageTouchNavigationEnabled = useTouchNavigationStore((state) => state.setImageTouchNavigationEnabled);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [toolsPosition, setToolsPosition] = useState({ x: 12, y: 64 });
  const toolsDragRef = useRef<{
    pointerId: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  const beginToolsDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const shellRect = shellRef.current?.getBoundingClientRect();
    if (!shellRect) return;

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    toolsDragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - shellRect.left - toolsPosition.x,
      offsetY: event.clientY - shellRect.top - toolsPosition.y,
    };
  };

  const moveToolsDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = toolsDragRef.current;
    const shellRect = shellRef.current?.getBoundingClientRect();
    if (!drag || drag.pointerId !== event.pointerId || !shellRect) return;

    event.preventDefault();
    event.stopPropagation();
    const nextX = event.clientX - shellRect.left - drag.offsetX;
    const nextY = event.clientY - shellRect.top - drag.offsetY;
    setToolsPosition({
      x: clamp(nextX, 4, Math.max(4, shellRect.width - 72)),
      y: clamp(nextY, 4, Math.max(4, shellRect.height - 80)),
    });
  };

  const endToolsDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = toolsDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.releasePointerCapture(event.pointerId);
    toolsDragRef.current = null;
  };
  const touchNavigationActive = imageTouchNavigation.enabled && (
    imageTouchNavigation.oneFingerPan || imageTouchNavigation.pinchZoom
  );
  const closeActiveDrawer = () => setActiveEdgeDrawer(null);

  return (
    <div
      className="relative min-h-0 flex-1 overflow-hidden bg-[#070b12]"
      data-image-mobile-edge-chrome-visible={visible ? 'true' : 'false'}
      data-image-mobile-edge-shell="true"
      ref={shellRef}
    >
      <div className="absolute inset-0 min-h-0 min-w-0">{children}</div>

      <MobileEdgeHandle
        active={activeEdgeDrawer === 'source'}
        ariaLabel="Open Source Library drawer"
        className="left-0 top-1/2 -translate-y-1/2 rounded-r-full border-l-0"
        compact={!visible}
        edge="source"
        icon={<PanelLeftOpen size={16} />}
        onClick={() => toggleEdgeDrawer('source')}
      />
      <MobileEdgeHandle
        active={activeEdgeDrawer === 'panels'}
        ariaLabel="Open Image panels drawer"
        className="right-0 top-1/2 -translate-y-1/2 rounded-l-full border-r-0"
        compact={!visible}
        edge="panels"
        icon={<PanelRightOpen size={16} />}
        onClick={() => toggleEdgeDrawer('panels')}
      />
      <MobileEdgeHandle
        active={activeEdgeDrawer === 'assets'}
        ariaLabel="Open Image assets drawer"
        className="bottom-0 left-1/2 -translate-x-1/2 rounded-t-full border-b-0"
        compact={!visible}
        edge="assets"
        icon={<PanelBottomOpen size={16} />}
        onClick={() => toggleEdgeDrawer('assets')}
      />

      {activeEdgeDrawer === 'source' ? (
        <aside
          className="absolute bottom-0 left-0 top-0 z-50 flex w-[min(22rem,86vw)] flex-col overflow-hidden border-r border-cyan-300/20 bg-[#09111d]/95 shadow-[18px_0_32px_rgba(0,0,0,0.32)] backdrop-blur-md"
          data-image-mobile-edge-drawer="source"
        >
          <MobileDrawerHeader onClose={closeActiveDrawer} title="Source Library" />
          <div className="min-h-0 flex-1 overflow-y-auto">
            <FlowSourceBinSidebar dockable embeddedDrawer workspaceId="image" />
          </div>
        </aside>
      ) : null}

      {activeEdgeDrawer === 'panels' ? (
        <aside
          className="absolute bottom-0 right-0 top-0 z-50 flex w-[min(23rem,88vw)] flex-col overflow-hidden border-l border-cyan-300/20 bg-[#09111d]/95 shadow-[-18px_0_32px_rgba(0,0,0,0.32)] backdrop-blur-md"
          data-image-mobile-edge-drawer="panels"
        >
          <MobileDrawerHeader onClose={closeActiveDrawer} title="Image Panels" />
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {MOBILE_IMAGE_RIGHT_PANEL_IDS.map((panelId) => (
              <details
                className="mb-2 overflow-hidden rounded-md border border-cyan-300/15 bg-[#0d1724]/90"
                key={panelId}
                open={panelId === IMAGE_DOCKABLE_PANEL_IDS.layers}
              >
                <summary className="cursor-pointer select-none border-b border-cyan-300/10 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-100">
                  {getImageDockablePanelDefinition(panelId)?.title ?? panelId}
                </summary>
                <div className="min-h-0 p-2">
                  {renderImageDockablePanel(panelId, getNewFlowNodePosition)}
                </div>
              </details>
            ))}
          </div>
        </aside>
      ) : null}

      {activeEdgeDrawer === 'assets' ? (
        <aside
          className="absolute bottom-0 left-0 right-0 z-50 flex h-[min(42dvh,20rem)] flex-col overflow-hidden border-t border-cyan-300/20 bg-[#09111d]/95 shadow-[0_-18px_32px_rgba(0,0,0,0.32)] backdrop-blur-md"
          data-image-mobile-edge-drawer="assets"
        >
          <MobileDrawerHeader onClose={closeActiveDrawer} title="Assets" />
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            <ImageEditorAssetBar getNewFlowNodePosition={getNewFlowNodePosition} />
          </div>
        </aside>
      ) : null}

      <button
        aria-label={touchNavigationActive ? 'Disable Image touch navigation' : 'Enable Image touch navigation'}
        aria-pressed={touchNavigationActive}
        className={`absolute bottom-3 right-3 z-[65] inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[11px] font-semibold shadow-xl shadow-black/40 backdrop-blur-md ${
          touchNavigationActive
            ? 'border-emerald-300/45 bg-emerald-400/20 text-emerald-100'
            : 'border-cyan-300/20 bg-[#08111d]/90 text-cyan-100/70 hover:text-white'
        }`}
        data-image-touch-navigation-toggle="true"
        onClick={() => setImageTouchNavigationEnabled(!imageTouchNavigation.enabled)}
        title="Finger touch navigates the Image canvas; pen and mouse keep editing"
        type="button"
      >
        <Hand size={14} />
        <span>Touch Nav</span>
      </button>

      <div
        className="absolute z-[60] flex w-16 max-h-[calc(100%-0.5rem)] flex-col overflow-hidden rounded-[3px] border border-cyan-300/30 bg-[#11131a]/95 text-cyan-50 shadow-2xl"
        data-image-mobile-tools-palette="true"
        style={{ left: toolsPosition.x, top: toolsPosition.y }}
      >
        <div
          aria-label="Move Image tools palette"
          className="flex h-5 shrink-0 touch-none items-center justify-center border-b border-cyan-300/20 bg-[#101826] text-cyan-200"
          data-image-mobile-tools-handle="true"
          onPointerCancel={endToolsDrag}
          onPointerDown={beginToolsDrag}
          onPointerMove={moveToolsDrag}
          onPointerUp={endToolsDrag}
          role="button"
          tabIndex={0}
          title="Move tools"
        >
          <GripHorizontal size={14} />
        </div>
        <div className="min-h-0 overflow-x-hidden overflow-y-auto" data-image-mobile-tools-body="true">
          <ImageEditorToolbar />
        </div>
      </div>
    </div>
  );
}

function MobileEdgeHandle({
  active,
  ariaLabel,
  className,
  compact,
  edge,
  icon,
  onClick,
}: {
  active: boolean;
  ariaLabel: string;
  className: string;
  compact: boolean;
  edge: 'source' | 'panels' | 'assets';
  icon: ReactNode;
  onClick: () => void;
}) {
  const lastPointerActivationAtRef = useRef(0);
  const sizeClassName = edge === 'assets'
    ? (compact ? 'h-6 w-14' : 'h-7 w-16')
    : (compact ? 'h-12 w-6' : 'h-12 w-7');
  const handlePointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || event.isPrimary === false) return;
    event.preventDefault();
    event.stopPropagation();
    lastPointerActivationAtRef.current = Date.now();
    onClick();
  };
  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (Date.now() - lastPointerActivationAtRef.current < 700) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    onClick();
  };

  return (
    <button
      aria-label={ariaLabel}
      className={`absolute z-[110] flex touch-none items-center justify-center border border-cyan-300/35 bg-[#08111d]/95 text-cyan-100 shadow-xl backdrop-blur-md transition-colors hover:bg-cyan-400/15 ${sizeClassName} ${active ? 'bg-cyan-400/20 text-white' : ''} ${className}`}
      data-mobile-edge-handle-compact={compact ? 'true' : 'false'}
      data-mobile-edge-handle-edge={edge}
      data-mobile-edge-handle-visible="true"
      data-mobile-edge-handle="image"
      onClick={handleClick}
      onPointerUp={handlePointerUp}
      type="button"
    >
      {icon}
    </button>
  );
}

function MobileDrawerHeader({ onClose, title }: { onClose: () => void; title: string }) {
  return (
    <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-cyan-300/15 px-3 text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-100">
      <span className="min-w-0 truncate">{title}</span>
      <button
        aria-label={`Close ${title} drawer`}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-cyan-300/15 bg-[#101826]/90 text-cyan-100/70 hover:bg-cyan-400/15 hover:text-white"
        onClick={onClose}
        title={`Close ${title}`}
        type="button"
      >
        <X size={14} />
      </button>
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isImagePanelGroupVisible(
  layouts: ReturnType<typeof useDockablePanelStore.getState>['layouts'],
  panelIds: ImageDockablePanelId[],
  fallback: boolean,
): boolean {
  const groupLayouts = panelIds
    .map((id) => layouts[panelKey(IMAGE_DOCKABLE_WORKSPACE_ID, id)])
    .filter(Boolean);
  if (groupLayouts.length === 0) return fallback;
  return groupLayouts.some((layout) => layout.mode !== 'hidden');
}

function setImagePanelGroupVisible(
  panelIds: ImageDockablePanelId[],
  visible: boolean,
  hidePanel: (workspaceId: string, panelId: string) => void,
  dockPanel: (workspaceId: string, panelId: string, zone: DockZone) => void,
  floatPanel: (workspaceId: string, panelId: string) => void,
): void {
  for (const panelId of panelIds) {
    if (!visible) {
      hidePanel(IMAGE_DOCKABLE_WORKSPACE_ID, panelId);
      continue;
    }
    if (panelId === IMAGE_DOCKABLE_PANEL_IDS.tools) {
      floatPanel(IMAGE_DOCKABLE_WORKSPACE_ID, panelId);
      continue;
    }
    const definition = getImageDockablePanelDefinition(panelId);
    dockPanel(IMAGE_DOCKABLE_WORKSPACE_ID, panelId, definition?.dockZone ?? 'right');
  }
}

function applyImageLayoutPreset(
  preset: ImageLayoutPreset,
  hidePanel: (workspaceId: string, panelId: string) => void,
  dockPanel: (workspaceId: string, panelId: string, zone: DockZone) => void,
  floatPanel: (workspaceId: string, panelId: string) => void,
): void {
  for (const [panelId, mode] of Object.entries(preset.panelModes) as Array<[ImageDockablePanelId, ImageLayoutPreset['panelModes'][ImageDockablePanelId]]>) {
    if (mode === 'hidden') {
      hidePanel(IMAGE_DOCKABLE_WORKSPACE_ID, panelId);
      continue;
    }
    if (mode === 'floating') {
      floatPanel(IMAGE_DOCKABLE_WORKSPACE_ID, panelId);
      continue;
    }
    const definition = getImageDockablePanelDefinition(panelId);
    dockPanel(IMAGE_DOCKABLE_WORKSPACE_ID, panelId, definition?.dockZone ?? 'right');
  }
}

function ImageLayoutButton({
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
      className={`mr-2 shrink-0 rounded border px-2 py-1 text-[11px] font-semibold ${
        active
          ? 'border-cyan-300/45 bg-cyan-400/15 text-cyan-100'
          : 'border-cyan-300/10 bg-[#101a29]/70 text-cyan-100/45 hover:text-cyan-100'
      }`}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function ImageNavigationControls({
  disabled,
  onCommand,
}: {
  disabled: boolean;
  onCommand: (command: ImageNavigationCommand) => void;
}) {
  return (
    <div
      aria-label="Image navigation controls"
      className="mr-2 flex shrink-0 items-center gap-1 rounded border border-cyan-300/10 bg-[#101a29]/70 p-1 text-[11px] font-semibold text-cyan-100/60"
    >
      <ImageNavigationButton
        ariaLabel="Zoom image out"
        disabled={disabled}
        onClick={() => onCommand('zoom-out')}
        title="Zoom Out"
      >
        <Minus size={12} />
      </ImageNavigationButton>
      <ImageNavigationButton
        ariaLabel="Fit image to view"
        disabled={disabled}
        onClick={() => onCommand('fit')}
        title="Fit to View"
      >
        <Maximize2 size={12} />
      </ImageNavigationButton>
      <ImageNavigationButton
        ariaLabel="Set image zoom to 100%"
        disabled={disabled}
        onClick={() => onCommand('actual-size')}
        title="100%"
      >
        100%
      </ImageNavigationButton>
      <ImageNavigationButton
        ariaLabel="Zoom image in"
        disabled={disabled}
        onClick={() => onCommand('zoom-in')}
        title="Zoom In"
      >
        <Plus size={12} />
      </ImageNavigationButton>
    </div>
  );
}

function ImageNavigationButton({
  ariaLabel,
  children,
  disabled,
  onClick,
  title,
}: {
  ariaLabel: string;
  children: ReactNode;
  disabled: boolean;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      aria-label={ariaLabel}
      className="inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded border border-cyan-300/10 px-1.5 text-[10px] font-semibold text-cyan-100/65 hover:border-cyan-300/35 hover:bg-cyan-400/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
      disabled={disabled}
      onClick={onClick}
      title={title}
      type="button"
    >
      {children}
    </button>
  );
}

function WiredContextMenu({
  containerRef,
  onHelp,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  onHelp: () => void;
}) {
  const handleSelectAll = useCallback(() => {
    selectAllActiveImageDocument();
  }, []);

  const handleDeselect = useCallback(() => {
    deselectActiveImageDocument();
  }, []);

  const handleInvert = useCallback(() => {
    invertActiveImageSelection();
  }, []);

  const handleDelete = useCallback(() => {
    deleteActiveImageSelection();
  }, []);

  const handleDuplicateLayer = useCallback(() => {
    const state = useImageEditorStore.getState();
    const doc = state.documents.find((d) => d.id === state.activeDocId);
    if (!doc?.activeLayerId) return;
    state.duplicateLayer(doc.id, doc.activeLayerId);
  }, []);

  const handleDeleteLayer = useCallback(() => {
    deleteActiveLayer();
  }, []);

  const quickActionItems = useMemo(
    () =>
      PHOTOSHOP_QUICK_ACTIONS.map((quickAction) => ({
        label: `${quickAction.group}: ${quickAction.label}`,
        action: () => runPhotoshopQuickAction(quickAction.id),
      })),
    [],
  );

  return (
    <ImageEditorContextMenu
      containerRef={containerRef}
      extraItems={quickActionItems}
      onCopy={copyActiveImageSelection}
      onCut={cutActiveImageSelection}
      onDelete={handleDelete}
      onDeselect={handleDeselect}
      onHelp={onHelp}
      onInvertSelection={handleInvert}
      onPaste={pasteImageClipboard}
      onSelectAll={handleSelectAll}
      onDuplicateLayer={handleDuplicateLayer}
      onDeleteLayer={handleDeleteLayer}
    />
  );
}

function selectAllActiveImageDocument(): boolean {
  const state = useImageEditorStore.getState();
  const doc = state.documents.find((d) => d.id === state.activeDocId);
  if (!doc) return false;
  const mask = createMask(doc.width, doc.height);
  fillMask(mask);
  setSelection(doc.id, mask);
  state.setHasSelection(doc.id, true);
  return true;
}

function deselectActiveImageDocument(): boolean {
  const state = useImageEditorStore.getState();
  const doc = state.documents.find((d) => d.id === state.activeDocId);
  if (!doc) return false;
  clearSelection(doc.id);
  state.setHasSelection(doc.id, false);
  return true;
}

function invertActiveImageSelection(): boolean {
  const state = useImageEditorStore.getState();
  const doc = state.documents.find((d) => d.id === state.activeDocId);
  if (!doc) return false;
  let mask = getSelection(doc.id);
  if (!mask) {
    mask = createMask(doc.width, doc.height);
    fillMask(mask);
    setSelection(doc.id, mask);
  } else {
    invertMask(mask);
  }
  state.bumpSelectionVersion(doc.id);
  state.setHasSelection(doc.id, true);
  return true;
}

async function downloadActiveImageDocument(): Promise<void> {
  const doc = useImageEditorStore.getState().getActiveDocument();
  if (!doc) {
    await showAlertDialog({
      title: 'No Image Document',
      message: 'Open an image document before exporting.',
      tone: 'warning',
    });
    return;
  }

  const { blob, format } = await imageDocumentToSaveBlob(doc, readStoredImageDocumentSaveMimeType());
  downloadBlob(blob, buildDownloadFilename(doc.title || 'image-document', format.mimeType, format.extension));
}

async function downloadActiveImagePsd(): Promise<void> {
  const doc = useImageEditorStore.getState().getActiveDocument();
  if (!doc) {
    await showAlertDialog({
      title: 'No Image Document',
      message: 'Open an image document before exporting PSD.',
      tone: 'warning',
    });
    return;
  }

  const blob = await imageDocumentToPsdBlob(doc);
  downloadBlob(blob, buildDownloadFilename(doc.title || 'image-document', IMAGE_PSD_MIME_TYPE, IMAGE_PSD_EXTENSION));
}
