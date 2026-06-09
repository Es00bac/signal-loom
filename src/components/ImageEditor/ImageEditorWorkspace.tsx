import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { ImageEditorToolbar } from './ImageEditorToolbar';
import { ImageEditorCanvas } from './ImageEditorCanvas';
import { ImageEditorTabs } from './ImageEditorTabs';
import { ImageEditorLayersPanel } from './ImageEditorLayersPanel';
import { ImageEditorPropertiesPanel } from './ImageEditorPropertiesPanel';
import { ImageEditorAssetBar } from './ImageEditorAssetBar';
import { ImageEditorContextMenu } from './ImageEditorContextMenu';
import { ImageEditorHelp } from './ImageEditorHelp';
import { GenerativeFillBar } from './GenerativeFillBar';
import { useImageEditorStore } from '../../store/imageEditorStore';
import { useSourceBinStore } from '../../store/sourceBinStore';
import { useWorkspaceLayoutStore } from '../../store/workspaceLayoutStore';
import { useDockablePanelStore } from '../../store/dockablePanelStore';
import { panelKey, type DockZone } from '../../lib/dockablePanel';
import { DockablePanelHost } from '../DockablePanel/DockablePanelHost';
import {
  IMAGE_DOCKABLE_PANEL_DEFINITIONS,
  IMAGE_DOCKABLE_PANEL_IDS,
  IMAGE_DOCKABLE_WORKSPACE_ID,
  getImageDockablePanelDefinition,
  type ImageDockablePanelId,
} from './ImageDockablePanels';
import { clearSelection, getSelection, setSelection } from './selectionRegistry';
import { createMask, fillMask, invertMask } from './SelectionMask';
import {
  copyLayerPixelsToClipboard,
  createPastedLayerFromClipboard,
  deleteSelectedLayerPixels,
} from './ImageEditorClipboard';
import { PHOTOSHOP_QUICK_ACTIONS } from './PhotoshopQuickActions';
import { runPhotoshopQuickAction } from './PhotoshopQuickActionRunner';
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
import { createImageDocumentFromFile, createNewBlankDocument } from './ImageSourceDocument';
import { NewDocumentModal } from './NewDocumentModal';
import {
  getDraggedSourceLibraryItemId,
  hasDraggedSourceLibraryItem,
} from '../../lib/sourceLibraryWorkspaceActions';
import { openSourceLibraryImageDocument } from '../../lib/sourceLibraryImageOpen';
import { showAlertDialog } from '../../store/alertDialogStore';

interface ImageEditorWorkspaceProps {
  getNewFlowNodePosition: () => { x: number; y: number };
}

const IMAGE_NATIVE_MENU_COMMAND_PREFIXES = ['image:', 'edit:'] as const;

export function ImageEditorWorkspace({ getNewFlowNodePosition }: ImageEditorWorkspaceProps) {
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const [helpVisible, setHelpVisible] = useState(false);
  const [showNewDocModal, setShowNewDocModal] = useState(false);
  const [openingLocalImage, setOpeningLocalImage] = useState(false);
  const [localImageOpenStatus, setLocalImageOpenStatus] = useState<string | null>(null);
  const setTool = useImageEditorStore((s) => s.setTool);
  const setSelectionToolSettings = useImageEditorStore((s) => s.setSelectionToolSettings);
  const updateLayer = useImageEditorStore((s) => s.updateLayer);
  const openDocument = useImageEditorStore((s) => s.openDocument);
  const imageLayout = useWorkspaceLayoutStore((s) => s.image);
  const setImageLayout = useWorkspaceLayoutStore((s) => s.setImageLayout);
  const dockableLayouts = useDockablePanelStore((s) => s.layouts);
  const hidePanel = useDockablePanelStore((s) => s.hidePanel);
  const dockPanel = useDockablePanelStore((s) => s.dockPanel);
  const resetWorkspacePanels = useDockablePanelStore((s) => s.resetWorkspacePanels);

  useEffect(() => {
    setImagePanelGroupVisible([IMAGE_DOCKABLE_PANEL_IDS.tools], imageLayout.toolbarVisible, hidePanel, dockPanel);
  }, [dockPanel, hidePanel, imageLayout.toolbarVisible]);

  useEffect(() => {
    setImagePanelGroupVisible(
      [IMAGE_DOCKABLE_PANEL_IDS.layers, IMAGE_DOCKABLE_PANEL_IDS.properties],
      imageLayout.rightPanelVisible,
      hidePanel,
      dockPanel,
    );
  }, [dockPanel, hidePanel, imageLayout.rightPanelVisible]);

  useEffect(() => {
    setImagePanelGroupVisible([IMAGE_DOCKABLE_PANEL_IDS.assets], imageLayout.assetBarVisible, hidePanel, dockPanel);
  }, [dockPanel, hidePanel, imageLayout.assetBarVisible]);

  const toolsVisible = isImagePanelGroupVisible(dockableLayouts, [IMAGE_DOCKABLE_PANEL_IDS.tools], imageLayout.toolbarVisible);
  const rightPanelsVisible = isImagePanelGroupVisible(
    dockableLayouts,
    [IMAGE_DOCKABLE_PANEL_IDS.layers, IMAGE_DOCKABLE_PANEL_IDS.properties],
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
    () =>
      IMAGE_DOCKABLE_PANEL_DEFINITIONS.map((panel) => ({
        ...panel,
        content: renderImageDockablePanel(panel.panelId as ImageDockablePanelId, getNewFlowNodePosition),
      })),
    [getNewFlowNodePosition],
  );

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const ctrl = e.ctrlKey || e.metaKey;
      const docId = useImageEditorStore.getState().activeDocId;

      if (!ctrl && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        const state = useImageEditorStore.getState();
        const doc = state.documents.find((candidate) => candidate.id === docId);
        const activeLayer = doc?.layers.find((layer) => layer.id === doc.activeLayerId);
        if (doc && activeLayer && !activeLayer.locked) {
          e.preventDefault();
          const step = e.shiftKey ? 10 : e.altKey ? 0.25 : 1;
          updateLayer(doc.id, activeLayer.id, {
            x: activeLayer.x + (e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0),
            y: activeLayer.y + (e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0),
          });
          return;
        }
      }

      if (ctrl) {
        const k = e.key.toLowerCase();
        if (docId) {
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
          setTool('brush');
          break;
        case 'e':
          setTool('eraser');
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
        case 'f1':
          e.preventDefault();
          setHelpVisible((v) => !v);
          break;
      }
    };

    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [setTool, setSelectionToolSettings, updateLayer]);

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
      case 'image:tool-eraser':
        setTool('eraser');
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

  return (
    <div className="signal-loom-themed absolute inset-0 z-30 flex flex-col pt-16">
      <NewDocumentModal
        isOpen={showNewDocModal}
        onClose={() => setShowNewDocModal(false)}
        onCreate={handleCreateNewDocument}
      />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="theme-surface theme-border relative z-50 flex shrink-0 items-center border-b">
            <div className="min-w-0 flex-1">
              <ImageEditorTabs
                disabled={openingLocalImage}
                onOpenImageFile={handleOpenLocalImageFile}
                onNewCanvas={() => setShowNewDocModal(true)}
              />
            </div>
            {localImageOpenStatus ? (
              <div className="max-w-[28vw] truncate px-2 text-[11px] text-cyan-100/55" title={localImageOpenStatus}>
                {localImageOpenStatus}
              </div>
            ) : null}
            <ImageLayoutButton
              active={toolsVisible}
              label="Tools"
              onClick={() => {
                setImageLayout({ toolbarVisible: !toolsVisible });
                setImagePanelGroupVisible([IMAGE_DOCKABLE_PANEL_IDS.tools], !toolsVisible, hidePanel, dockPanel);
              }}
            />
            <ImageLayoutButton
              active={rightPanelsVisible}
              label="Panels"
              onClick={() => {
                setImageLayout({ rightPanelVisible: !rightPanelsVisible });
                setImagePanelGroupVisible(
                  [IMAGE_DOCKABLE_PANEL_IDS.layers, IMAGE_DOCKABLE_PANEL_IDS.properties],
                  !rightPanelsVisible,
                  hidePanel,
                  dockPanel,
                );
              }}
            />
            <ImageLayoutButton
              active={assetsVisible}
              label="Assets"
              onClick={() => {
                setImageLayout({ assetBarVisible: !assetsVisible });
                setImagePanelGroupVisible([IMAGE_DOCKABLE_PANEL_IDS.assets], !assetsVisible, hidePanel, dockPanel);
              }}
            />
            <ImageLayoutButton
              active={false}
              label="Reset Panels"
              onClick={() => {
                resetWorkspacePanels(IMAGE_DOCKABLE_WORKSPACE_ID);
                setImageLayout({ toolbarVisible: true, rightPanelVisible: true, assetBarVisible: true });
              }}
            />
          </div>
          <DockablePanelHost
            className={`flex-1 transition-[margin] duration-200 ${sharedSourceBinCanvasOffsetClassName}`}
            panels={dockablePanels}
            style={{ marginLeft: sharedSourceBinCanvasOffsetPx }}
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
      </div>

      <WiredContextMenu
        containerRef={canvasContainerRef}
        onHelp={() => setHelpVisible(true)}
      />
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
    case IMAGE_DOCKABLE_PANEL_IDS.assets:
      return <ImageEditorAssetBar getNewFlowNodePosition={getNewFlowNodePosition} />;
  }
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
): void {
  for (const panelId of panelIds) {
    if (!visible) {
      hidePanel(IMAGE_DOCKABLE_WORKSPACE_ID, panelId);
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
      className={`mr-2 rounded border px-2 py-1 text-[11px] font-semibold ${
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

function getActiveDocumentAndLayer() {
  const state = useImageEditorStore.getState();
  const doc = state.documents.find((d) => d.id === state.activeDocId);
  const layer = doc?.layers.find((l) => l.id === doc.activeLayerId) ?? null;
  return { doc, layer, state };
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

function copyActiveImageSelection(): boolean {
  const { doc, layer } = getActiveDocumentAndLayer();
  if (!doc || !layer) return false;
  return copyLayerPixelsToClipboard(doc, layer, getSelection(doc.id) ?? null);
}

function pasteImageClipboard(): boolean {
  const state = useImageEditorStore.getState();
  const doc = state.documents.find((d) => d.id === state.activeDocId);
  if (!doc) return false;
  const layer = createPastedLayerFromClipboard();
  if (!layer) return false;

  const before = doc.layers;
  const activeLayerIndex = doc.activeLayerId
    ? doc.layers.findIndex((candidate) => candidate.id === doc.activeLayerId)
    : -1;
  const insertAt = activeLayerIndex >= 0 ? activeLayerIndex + 1 : doc.layers.length;
  state.addLayer(doc.id, layer, insertAt);
  const after =
    useImageEditorStore.getState().documents.find((candidate) => candidate.id === doc.id)
      ?.layers ?? before;
  useImageEditorStore.getState().pushOperation({
    kind: 'layerOp',
    docId: doc.id,
    before,
    after,
  });
  return true;
}

function cutActiveImageSelection(): boolean {
  const copied = copyActiveImageSelection();
  if (!copied) return false;
  return deleteActiveImageSelection();
}

function deleteActiveImageSelection(): boolean {
  const { doc, layer, state } = getActiveDocumentAndLayer();
  if (!doc || !layer) return false;

  const selection = getSelection(doc.id) ?? null;
  if (selection) {
    const op = deleteSelectedLayerPixels(doc, layer, selection);
    if (!op) return false;
    state.pushOperation(op);
    state.bumpLayerBitmapVersion(doc.id, layer.id);
    state.markDocumentDirty(doc.id);
    return true;
  }

  return deleteActiveLayer();
}

function deleteActiveLayer(): boolean {
  const { doc, layer, state } = getActiveDocumentAndLayer();
  if (!doc || !layer) return false;

  const before = doc.layers;
  state.removeLayer(doc.id, layer.id);
  const after =
    useImageEditorStore.getState().documents.find((candidate) => candidate.id === doc.id)
      ?.layers ?? [];
  useImageEditorStore.getState().pushOperation({
    kind: 'layerOp',
    docId: doc.id,
    before,
    after,
  });
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
