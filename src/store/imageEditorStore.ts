import { create } from 'zustand';
import {
  DEFAULT_BRUSH_SETTINGS,
  DEFAULT_CROP_TOOL_SETTINGS,
  DEFAULT_GRADIENT_TOOL_SETTINGS,
  DEFAULT_QUICK_MASK_SETTINGS,
  DEFAULT_RETOUCH_TOOL_SETTINGS,
  DEFAULT_SHAPE_TOOL_SETTINGS,
  DEFAULT_SELECT_AND_MASK_SETTINGS,
  DEFAULT_SELECTION_TOOL_SETTINGS,
  DEFAULT_TEXT_TOOL_SETTINGS,
  DEFAULT_VIEWPORT,
  type BrushSettings,
  type CropToolSettings,
  type DocumentViewport,
  type EditorOperation,
  type EditorTool,
  type ImageDocument,
  type ImageGuide,
  type ImageDocumentSnapshot,
  type ImageLayerEditTarget,
  type ImageLayer,
  type ImageQuickActionMacro,
  type ImageQuickActionMacroStep,
  type GradientToolSettings,
  type QuickMaskSettings,
  type RetouchToolSettings,
  type SelectAndMaskSettings,
  type SelectionToolSettings,
  type ShapeToolSettings,
  type TextLayerStyle,
} from '../types/imageEditor';
import {
  clampGridSpacing,
  createImageGuide,
  DEFAULT_IMAGE_VIEW_SETTINGS,
  type ImageViewSettings,
  type ImageViewToggleKey,
} from '../components/ImageEditor/ImageRulersGuides';
import { normalizeBrushSettings } from '../components/ImageEditor/ImageBrushEngine';
import { cloneBitmap } from '../components/ImageEditor/LayerBitmap';
import { buildPerspectiveCroppedImageDocumentState } from '../components/ImageEditor/tools/perspectiveCropDocument';
import type { CropPoint as PerspectiveCropCorner } from '../components/ImageEditor/tools/perspectiveCrop';
import {
  resizeImageCanvas,
  resizeImageDocumentPixels,
  type CanvasResizeAnchor,
} from '../components/ImageEditor/ImageDocumentGeometry';
import { sanitizeImageEditorSnapshot } from '../lib/projectValidation';
import { rasterizeSvgToBitmapAtResolution } from '../components/ImageEditor/ImageFileFormats';
import {
  DEFAULT_IMAGE_EDITOR_TOOLBAR_FLYOUT_ORDER,
  sanitizeImageEditorToolbarFlyoutOrder,
  type ImageEditorToolbarFlyoutGroupId,
} from '../components/ImageEditor/imageEditorTools';

const MAX_HISTORY = 50;
const DEFAULT_IMAGE_BACKGROUND_COLOR = '#000000';

interface ImageEditorState {
  documents: ImageDocument[];
  activeDocId: string | null;
  tool: EditorTool;
  backgroundColor: string;
  brushSettings: BrushSettings;
  cropToolSettings: CropToolSettings;
  gradientToolSettings: GradientToolSettings;
  retouchToolSettings: RetouchToolSettings;
  shapeToolSettings: ShapeToolSettings;
  quickMaskSettings: QuickMaskSettings;
  selectAndMaskSettings: SelectAndMaskSettings;
  selectionToolSettings: SelectionToolSettings;
  textToolSettings: TextLayerStyle;
  /**
   * When the Text tool drops a new text layer, it stores the new layer id here so
   * the canvas can open the on-canvas text editor immediately (type-to-place).
   * The canvas clears it once editing starts.
   */
  pendingTextEditLayerId: string | null;
  /** Rulers / grid / guides view options (shared across documents). */
  imageViewSettings: ImageViewSettings;
  viewportContainerSize: { width: number; height: number };
  undoStacks: Record<string, EditorOperation[]>;
  redoStacks: Record<string, EditorOperation[]>;
  quickActionMacros: ImageQuickActionMacro[];
  activeQuickActionRecording: {
    startedAt: number;
    steps: ImageQuickActionMacroStep[];
  } | null;
  toolbarFlyoutOrder: ImageEditorToolbarFlyoutGroupId[];
  generativeFillDismissedByDocId: Record<string, boolean>;
  isDraggingSlider: boolean;
}

export interface ImageEditorProjectSnapshot {
  documents: ImageDocument[];
  activeDocId: string | null;
  quickActionMacros?: ImageQuickActionMacro[];
}

interface ImageEditorActions {
  openDocument: (doc: ImageDocument) => void;
  closeDocument: (id: string) => void;
  setActiveDocument: (id: string) => void;
  setDocumentTitle: (id: string, title: string) => void;
  setLayers: (docId: string, layers: ImageLayer[], activeLayerId?: string | null) => void;
  setDocumentDimensions: (id: string, width: number, height: number) => void;
  /** Rectify the document through a 4-corner quad (TL,TR,BR,BL) into a straight rectangle (undoable). */
  applyPerspectiveCrop: (docId: string, corners: PerspectiveCropCorner[]) => void;
  resizeDocumentPixels: (id: string, width: number, height: number) => void;
  resizeDocumentCanvas: (
    id: string,
    width: number,
    height: number,
    anchor?: CanvasResizeAnchor,
  ) => void;
  markDocumentClean: (id: string) => void;
  markDocumentDirty: (id: string) => void;
  setTool: (tool: EditorTool) => void;
  setBackgroundColor: (color: string) => void;
  swapForegroundBackgroundColors: () => void;
  resetForegroundBackgroundColors: () => void;
  setBrushSettings: (patch: Partial<BrushSettings>) => void;
  setCropToolSettings: (patch: Partial<CropToolSettings>) => void;
  setGradientToolSettings: (patch: Partial<GradientToolSettings>) => void;
  setRetouchToolSettings: (patch: Partial<RetouchToolSettings>) => void;
  setShapeToolSettings: (patch: Partial<ShapeToolSettings>) => void;
  setQuickMaskSettings: (patch: Partial<QuickMaskSettings>) => void;
  toggleQuickMask: () => void;
  setSelectAndMaskSettings: (patch: Partial<SelectAndMaskSettings>) => void;
  toggleSelectAndMask: () => void;
  setSelectionToolSettings: (patch: Partial<SelectionToolSettings>) => void;
  setTextToolSettings: (patch: Partial<TextLayerStyle>) => void;
  setPendingTextEditLayerId: (layerId: string | null) => void;
  toggleImageViewSetting: (key: ImageViewToggleKey) => void;
  setImageGridSpacing: (spacing: number) => void;
  addImageGuide: (docId: string, axis: ImageGuide['axis'], position: number) => void;
  updateImageGuidePosition: (docId: string, guideId: string, position: number) => void;
  removeImageGuide: (docId: string, guideId: string) => void;
  clearImageGuides: (docId: string) => void;
  setToolbarFlyoutOrder: (order: readonly string[]) => void;
  resetToolbarFlyoutOrder: () => void;
  setViewportContainerSize: (size: { width: number; height: number }) => void;
  setViewport: (id: string, patch: Partial<DocumentViewport>) => void;
  setHasSelection: (id: string, hasSelection: boolean) => void;
  setGenerativeFillDismissed: (id: string, dismissed: boolean) => void;
  bumpSelectionVersion: (id: string) => void;
  addLayer: (docId: string, layer: ImageLayer, index?: number) => void;
  removeLayer: (docId: string, layerId: string) => void;
  duplicateLayer: (docId: string, layerId: string) => void;
  updateLayer: (docId: string, layerId: string, patch: Partial<ImageLayer>) => void;
  bumpLayerBitmapVersion: (docId: string, layerId: string) => void;
  reorderLayer: (docId: string, layerId: string, newIndex: number) => void;
  setActiveLayer: (docId: string, layerId: string | null) => void;
  setActiveLayerEditTarget: (docId: string, target: ImageLayerEditTarget) => void;
  pushOperation: (op: EditorOperation) => void;
  popUndo: (docId: string) => EditorOperation | undefined;
  popRedo: (docId: string) => EditorOperation | undefined;
  clearHistory: (docId: string) => void;
  startQuickActionRecording: () => void;
  appendQuickActionRecordingStep: (actionId: string) => void;
  saveQuickActionRecording: () => ImageQuickActionMacro | null;
  cancelQuickActionRecording: () => void;
  renameQuickActionMacro: (id: string, name: string) => void;
  deleteQuickActionMacro: (id: string) => void;
  getActiveDocument: () => ImageDocument | undefined;
  exportProjectSnapshot: () => ImageEditorProjectSnapshot;
  restoreProjectSnapshot: (snapshot?: ImageEditorProjectSnapshot) => void;
  setIsDraggingSlider: (dragging: boolean) => void;
}

export const useImageEditorStore = create<ImageEditorState & ImageEditorActions>()(
  (set, get) => ({
    documents: [],
    activeDocId: null,
    tool: 'move',
    backgroundColor: DEFAULT_IMAGE_BACKGROUND_COLOR,
    brushSettings: { ...DEFAULT_BRUSH_SETTINGS },
    cropToolSettings: { ...DEFAULT_CROP_TOOL_SETTINGS },
    gradientToolSettings: { ...DEFAULT_GRADIENT_TOOL_SETTINGS },
    retouchToolSettings: { ...DEFAULT_RETOUCH_TOOL_SETTINGS },
    shapeToolSettings: { ...DEFAULT_SHAPE_TOOL_SETTINGS },
    quickMaskSettings: { ...DEFAULT_QUICK_MASK_SETTINGS },
    selectAndMaskSettings: { ...DEFAULT_SELECT_AND_MASK_SETTINGS },
    selectionToolSettings: { ...DEFAULT_SELECTION_TOOL_SETTINGS },
    textToolSettings: { ...DEFAULT_TEXT_TOOL_SETTINGS },
    pendingTextEditLayerId: null,
    imageViewSettings: { ...DEFAULT_IMAGE_VIEW_SETTINGS },
    viewportContainerSize: { width: 0, height: 0 },
    undoStacks: {},
    redoStacks: {},
    quickActionMacros: [],
    activeQuickActionRecording: null,
    toolbarFlyoutOrder: [...DEFAULT_IMAGE_EDITOR_TOOLBAR_FLYOUT_ORDER],
    generativeFillDismissedByDocId: {},
    isDraggingSlider: false,

    setIsDraggingSlider: (isDraggingSlider) => set({ isDraggingSlider }),

    openDocument: (doc) =>
      set((state) => {
        const exists = state.documents.some((d) => d.id === doc.id);
        if (exists) {
          if (state.activeDocId === doc.id) return state;
          return { activeDocId: doc.id };
        }
        return {
          documents: [...state.documents, doc],
          activeDocId: doc.id,
        };
      }),

    setLayers: (docId, layers, activeLayerId) =>
      set((state) => ({
        documents: state.documents.map((d) =>
          d.id === docId
            ? (() => {
                const nextActiveLayerId = activeLayerId !== undefined
                  ? activeLayerId
                  : (layers.some((l) => l.id === d.activeLayerId) ? d.activeLayerId : (layers[layers.length - 1]?.id ?? null));
                return {
                  ...d,
                  layers,
                  activeLayerId: nextActiveLayerId,
                  activeLayerEditTarget: resolveActiveLayerEditTarget({
                    ...d,
                    layers,
                    activeLayerId: nextActiveLayerId,
                  }),
                  dirty: true,
                };
              })()
            : d,
        ),
      })),

    closeDocument: (id) =>
      set((state) => {
        if (!state.documents.some((d) => d.id === id)) return state;
        const docs = state.documents.filter((d) => d.id !== id);
        let activeDocId = state.activeDocId;
        if (activeDocId === id) {
          activeDocId = docs.length > 0 ? docs[docs.length - 1].id : null;
        }
        const undoStacks = { ...state.undoStacks };
        const redoStacks = { ...state.redoStacks };
        const generativeFillDismissedByDocId = { ...state.generativeFillDismissedByDocId };
        delete undoStacks[id];
        delete redoStacks[id];
        delete generativeFillDismissedByDocId[id];
        return { documents: docs, activeDocId, undoStacks, redoStacks, generativeFillDismissedByDocId };
      }),

    setActiveDocument: (id) =>
      set((state) => {
        if (state.activeDocId === id || !state.documents.some((d) => d.id === id)) return state;
        return { activeDocId: id };
      }),

    setDocumentTitle: (id, title) =>
      set((state) => {
        let changed = false;
        const documents = state.documents.map((d) => {
          if (d.id !== id || d.title === title) return d;
          changed = true;
          return { ...d, title };
        });
        return changed ? { documents } : state;
      }),

    setDocumentDimensions: (id, width, height) =>
      set((state) => {
        let changed = false;
        const documents = state.documents.map((d) => {
          if (d.id !== id || (d.width === width && d.height === height)) return d;
          changed = true;
          return { ...d, width, height };
        });
        return changed ? { documents } : state;
      }),

    applyPerspectiveCrop: (docId, corners) => {
      const doc = get().documents.find((candidate) => candidate.id === docId);
      if (!doc) return;
      const result = buildPerspectiveCroppedImageDocumentState(doc, corners);
      if (!result) return;
      get().pushOperation({
        kind: 'docResize',
        docId,
        before: { width: doc.width, height: doc.height, layers: doc.layers, activeLayerId: doc.activeLayerId },
        after: { width: result.width, height: result.height, layers: result.layers, activeLayerId: result.activeLayerId },
      });
      get().setLayers(docId, result.layers, result.activeLayerId);
      get().setDocumentDimensions(docId, result.width, result.height);
    },

    resizeDocumentPixels: (id, width, height) =>
      set((state) => {
        const doc = state.documents.find((candidate) => candidate.id === id);
        if (!doc) return state;
        const nextDoc = resizeImageDocumentPixels(doc, width, height);
        if (nextDoc === doc) return state;

        nextDoc.layers.forEach((layer) => {
          const svgSource = layer.vectorRecipe || layer.metadata?.originalSvgSource;
          if (layer.type === 'vector' && svgSource && layer.bitmap) {
            const targetWidth = layer.bitmap.width;
            const targetHeight = layer.bitmap.height;
            rasterizeSvgToBitmapAtResolution(svgSource, targetWidth, targetHeight)
              .then((newBitmap) => {
                const store = useImageEditorStore.getState();
                const currentDoc = store.documents.find((d) => d.id === id);
                if (currentDoc) {
                  const updatedLayers = currentDoc.layers.map((l) =>
                    l.id === layer.id
                      ? {
                          ...l,
                          bitmap: newBitmap,
                          bitmapVersion: l.bitmapVersion + 1,
                          vectorRecipe: l.vectorRecipe || svgSource,
                          metadata: {
                            ...l.metadata,
                            originalSvgSource: l.metadata?.originalSvgSource || svgSource,
                            sourceLink: l.metadata?.sourceLink
                              ? { ...l.metadata.sourceLink, width: targetWidth, height: targetHeight }
                              : { id: l.id, status: 'linked' as const, width: targetWidth, height: targetHeight, relinkHistory: [] },
                          },
                        }
                      : l
                  );
                  store.setLayers(id, updatedLayers, currentDoc.activeLayerId);
                }
              })
              .catch((err) => {
                console.error('Failed to regenerate vector layer bitmap:', err);
              });
          }
        });

        return applyDocumentResizeState(state, doc, nextDoc);
      }),

    resizeDocumentCanvas: (id, width, height, anchor = 'center') =>
      set((state) => {
        const doc = state.documents.find((candidate) => candidate.id === id);
        if (!doc) return state;
        const nextDoc = resizeImageCanvas(doc, width, height, anchor);
        if (nextDoc === doc) return state;
        return applyDocumentResizeState(state, doc, nextDoc);
      }),

    markDocumentClean: (id) =>
      set((state) => {
        let changed = false;
        const documents = state.documents.map((d) => {
          if (d.id !== id || !d.dirty) return d;
          changed = true;
          return { ...d, dirty: false };
        });
        return changed ? { documents } : state;
      }),

    markDocumentDirty: (id) =>
      set((state) => {
        let changed = false;
        const documents = state.documents.map((d) => {
          if (d.id !== id || d.dirty) return d;
          changed = true;
          return { ...d, dirty: true };
        });
        return changed ? { documents } : state;
      }),

    setTool: (tool) =>
      set((state) => (state.tool === tool ? state : { tool })),

    setBackgroundColor: (color) =>
      set((state) => {
        const backgroundColor = normalizePaletteColor(color, state.backgroundColor);
        return state.backgroundColor === backgroundColor ? state : { backgroundColor };
      }),

    swapForegroundBackgroundColors: () =>
      set((state) => {
        const foregroundColor = normalizePaletteColor(state.brushSettings.color, DEFAULT_BRUSH_SETTINGS.color);
        const backgroundColor = normalizePaletteColor(state.backgroundColor, DEFAULT_IMAGE_BACKGROUND_COLOR);
        return {
          backgroundColor: foregroundColor,
          brushSettings: normalizeBrushSettings({
            ...state.brushSettings,
            color: backgroundColor,
            presetId: undefined,
          }),
        };
      }),

    resetForegroundBackgroundColors: () =>
      set((state) => ({
        backgroundColor: DEFAULT_IMAGE_BACKGROUND_COLOR,
        brushSettings: normalizeBrushSettings({
          ...state.brushSettings,
          color: DEFAULT_BRUSH_SETTINGS.color,
          presetId: undefined,
        }),
      })),

    setBrushSettings: (patch) =>
      set((state) => {
        const brushSettings = normalizeBrushSettings({ ...state.brushSettings, ...patch });
        return hasShallowPatchChange(state.brushSettings, brushSettings)
          ? { brushSettings }
          : state;
      }),

    setCropToolSettings: (patch) =>
      set((state) => {
        if (!hasShallowPatchChange(state.cropToolSettings, patch)) return state;
        return {
          cropToolSettings: { ...state.cropToolSettings, ...patch },
        };
      }),

    setGradientToolSettings: (patch) =>
      set((state) => {
        if (!hasShallowPatchChange(state.gradientToolSettings, patch)) return state;
        return {
          gradientToolSettings: {
            ...state.gradientToolSettings,
            ...patch,
          },
        };
      }),

    setRetouchToolSettings: (patch) =>
      set((state) => {
        if (!hasShallowPatchChange(state.retouchToolSettings, patch)) return state;
        return {
          retouchToolSettings: {
            ...state.retouchToolSettings,
            ...patch,
          },
        };
      }),

    setShapeToolSettings: (patch) =>
      set((state) => {
        if (!hasShallowPatchChange(state.shapeToolSettings, patch)) return state;
        return {
          shapeToolSettings: {
            ...state.shapeToolSettings,
            ...patch,
          },
        };
      }),

    setQuickMaskSettings: (patch) =>
      set((state) => {
        if (!hasShallowPatchChange(state.quickMaskSettings, patch)) return state;
        return {
          quickMaskSettings: {
            ...state.quickMaskSettings,
            ...patch,
          },
        };
      }),

    toggleQuickMask: () =>
      set((state) => ({
        quickMaskSettings: {
          ...state.quickMaskSettings,
          enabled: !state.quickMaskSettings.enabled,
        },
      })),

    setSelectAndMaskSettings: (patch) =>
      set((state) => {
        if (!hasShallowPatchChange(state.selectAndMaskSettings, patch)) return state;
        return {
          selectAndMaskSettings: {
            ...state.selectAndMaskSettings,
            ...patch,
          },
        };
      }),

    toggleSelectAndMask: () =>
      set((state) => ({
        selectAndMaskSettings: {
          ...state.selectAndMaskSettings,
          enabled: !state.selectAndMaskSettings.enabled,
        },
      })),

    setSelectionToolSettings: (patch) =>
      set((state) => {
        if (!hasShallowPatchChange(state.selectionToolSettings, patch)) return state;
        return {
          selectionToolSettings: { ...state.selectionToolSettings, ...patch },
        };
      }),

    setTextToolSettings: (patch) =>
      set((state) => {
        if (!hasShallowPatchChange(state.textToolSettings, patch)) return state;
        return {
          textToolSettings: { ...state.textToolSettings, ...patch },
        };
      }),

    setPendingTextEditLayerId: (layerId) =>
      set((state) => (state.pendingTextEditLayerId === layerId ? state : { pendingTextEditLayerId: layerId })),

    toggleImageViewSetting: (key: ImageViewToggleKey) =>
      set((state) => ({
        imageViewSettings: { ...state.imageViewSettings, [key]: !state.imageViewSettings[key] },
      })),

    setImageGridSpacing: (spacing) =>
      set((state) => {
        const gridSpacing = clampGridSpacing(spacing);
        if (gridSpacing === state.imageViewSettings.gridSpacing) return state;
        return { imageViewSettings: { ...state.imageViewSettings, gridSpacing } };
      }),

    addImageGuide: (docId, axis, position) =>
      set((state) => updateDocumentGuides(state, docId, (guides) => [
        ...guides,
        createImageGuide(axis, position),
      ])),

    updateImageGuidePosition: (docId, guideId, position) =>
      set((state) => updateDocumentGuides(state, docId, (guides) =>
        guides.map((guide) => (guide.id === guideId ? { ...guide, position: Math.round(position) } : guide)),
      )),

    removeImageGuide: (docId, guideId) =>
      set((state) => updateDocumentGuides(state, docId, (guides) => guides.filter((guide) => guide.id !== guideId))),

    clearImageGuides: (docId) =>
      set((state) => {
        const document = state.documents.find((candidate) => candidate.id === docId);
        if (!document?.guides?.length) return state;
        return updateDocumentGuides(state, docId, () => []);
      }),

    setToolbarFlyoutOrder: (order) =>
      set((state) => {
        const toolbarFlyoutOrder = sanitizeImageEditorToolbarFlyoutOrder(order);
        return arraysEqual(state.toolbarFlyoutOrder, toolbarFlyoutOrder)
          ? state
          : { toolbarFlyoutOrder };
      }),

    resetToolbarFlyoutOrder: () =>
      set((state) => arraysEqual(state.toolbarFlyoutOrder, DEFAULT_IMAGE_EDITOR_TOOLBAR_FLYOUT_ORDER)
        ? state
        : { toolbarFlyoutOrder: [...DEFAULT_IMAGE_EDITOR_TOOLBAR_FLYOUT_ORDER] }),

    setViewportContainerSize: (size) =>
      set((state) => {
        const width = Math.max(0, Math.floor(size.width));
        const height = Math.max(0, Math.floor(size.height));
        if (
          state.viewportContainerSize.width === width &&
          state.viewportContainerSize.height === height
        ) {
          return state;
        }
        return { viewportContainerSize: { width, height } };
      }),

    setViewport: (id, patch) =>
      set((state) => {
        let changed = false;
        const documents = state.documents.map((d) => {
          if (d.id !== id || !hasShallowPatchChange(d.viewport, patch)) return d;
          changed = true;
          return { ...d, viewport: { ...d.viewport, ...patch } };
        });
        return changed ? { documents } : state;
      }),

    setHasSelection: (id, hasSelection) =>
      set((state) => {
        const nextDismissedByDocId = { ...state.generativeFillDismissedByDocId };
        if (!hasSelection) {
          delete nextDismissedByDocId[id];
        }
        return {
          documents: state.documents.map((d) =>
            d.id === id
              ? {
                  ...d,
                  hasSelection,
                  selectionVersion: d.selectionVersion + 1,
                }
              : d,
          ),
          generativeFillDismissedByDocId: nextDismissedByDocId,
        };
      }),

    setGenerativeFillDismissed: (id, dismissed) =>
      set((state) => {
        if (!state.documents.some((document) => document.id === id)) return state;
        const current = Boolean(state.generativeFillDismissedByDocId[id]);
        if (current === dismissed) return state;
        const generativeFillDismissedByDocId = { ...state.generativeFillDismissedByDocId };
        if (dismissed) {
          generativeFillDismissedByDocId[id] = true;
        } else {
          delete generativeFillDismissedByDocId[id];
        }
        return { generativeFillDismissedByDocId };
      }),

    bumpSelectionVersion: (id) =>
      set((state) => ({
        documents: state.documents.map((d) =>
          d.id === id ? { ...d, selectionVersion: d.selectionVersion + 1 } : d,
        ),
      })),

    addLayer: (docId, layer, index) =>
      set((state) => {
        let changed = false;
        const documents = state.documents.map((d) => {
          if (d.id !== docId) return d;
          const layers = [...d.layers];
          const insertAt = index ?? layers.length;
          layers.splice(insertAt, 0, layer);
          changed = true;
          return {
            ...d,
            layers,
            activeLayerId: layer.id,
            dirty: true,
          };
        });
        return changed ? { documents } : state;
      }),

    removeLayer: (docId, layerId) =>
      set((state) => {
        let changed = false;
        const documents = state.documents.map((d) => {
          if (d.id !== docId) return d;
          if (!d.layers.some((l) => l.id === layerId)) return d;
          const layers = d.layers.filter((l) => l.id !== layerId);
          const activeLayerId =
            d.activeLayerId === layerId
              ? (layers[layers.length - 1]?.id ?? null)
              : d.activeLayerId;
          changed = true;
          return {
            ...d,
            layers,
            activeLayerId,
            activeLayerEditTarget: resolveActiveLayerEditTarget({
              ...d,
              layers,
              activeLayerId,
            }),
            dirty: true,
          };
        });
        return changed ? { documents } : state;
      }),

    duplicateLayer: (docId, layerId) =>
      set((state) => {
        let changed = false;
        const documents = state.documents.map((d) => {
          if (d.id !== docId) return d;
          const idx = d.layers.findIndex((l) => l.id === layerId);
          if (idx < 0) return d;
          const original = d.layers[idx];
          const copy: ImageLayer = {
            ...cloneImageLayerForEditableCopy(original),
            id: `${original.id}-copy-${Date.now()}`,
            name: `${original.name} copy`,
          };
          const layers = [...d.layers];
          layers.splice(idx + 1, 0, copy);
          changed = true;
          return { ...d, layers, activeLayerId: copy.id, activeLayerEditTarget: 'layer' as const, dirty: true };
        });
        return changed ? { documents } : state;
      }),

    updateLayer: (docId, layerId, patch) =>
      set((state) => {
        let changed = false;
        const documents = state.documents.map((d) => {
          if (d.id !== docId) return d;
          let layerChanged = false;
          const layers = d.layers.map((l) => {
            if (l.id !== layerId) return l;
            const bitmapChanged =
              Object.prototype.hasOwnProperty.call(patch, 'bitmap') &&
              patch.bitmap !== l.bitmap &&
              typeof patch.bitmapVersion !== 'number';
            const maskChanged =
              Object.prototype.hasOwnProperty.call(patch, 'mask') &&
              patch.mask !== l.mask &&
              typeof patch.bitmapVersion !== 'number';
            if (!bitmapChanged && !maskChanged && !hasShallowPatchChange(l, patch)) return l;
            layerChanged = true;
            return {
              ...l,
              ...patch,
              bitmapVersion: (bitmapChanged || maskChanged)
                ? l.bitmapVersion + 1
                : (patch.bitmapVersion ?? l.bitmapVersion),
            };
          });
          if (!layerChanged) return d;
          changed = true;
          return { ...d, layers, dirty: true };
        });
        return changed ? { documents } : state;
      }),

    bumpLayerBitmapVersion: (docId, layerId) =>
      set((state) => {
        let changed = false;
        const documents = state.documents.map((d) => {
          if (d.id !== docId) return d;
          if (!d.layers.some((l) => l.id === layerId)) return d;
          const layers = d.layers.map((l) =>
            l.id === layerId ? { ...l, bitmapVersion: l.bitmapVersion + 1 } : l,
          );
          changed = true;
          return { ...d, layers, dirty: true };
        });
        return changed ? { documents } : state;
      }),

    reorderLayer: (docId, layerId, newIndex) =>
      set((state) => {
        let changed = false;
        const documents = state.documents.map((d) => {
          if (d.id !== docId) return d;
          const fromIndex = d.layers.findIndex((l) => l.id === layerId);
          if (fromIndex < 0 || fromIndex === newIndex) return d;
          const layers = [...d.layers];
          const [moved] = layers.splice(fromIndex, 1);
          const clampedIndex = Math.max(0, Math.min(layers.length, newIndex));
          layers.splice(clampedIndex, 0, moved);
          changed = true;
          return { ...d, layers, dirty: true };
        });
        return changed ? { documents } : state;
      }),

    setActiveLayer: (docId, layerId) =>
      set((state) => {
        let changed = false;
        const documents = state.documents.map((d) => {
          if (d.id !== docId || d.activeLayerId === layerId) return d;
          changed = true;
          return {
            ...d,
            activeLayerId: layerId,
            activeLayerEditTarget: resolveActiveLayerEditTarget({
              ...d,
              activeLayerId: layerId,
            }),
          };
        });
        return changed ? { documents } : state;
      }),

    setActiveLayerEditTarget: (docId, target) =>
      set((state) => {
        let changed = false;
        const documents = state.documents.map((d) => {
          if (d.id !== docId) return d;
          const nextTarget = resolveActiveLayerEditTarget(d, target);
          if ((d.activeLayerEditTarget ?? 'layer') === nextTarget) return d;
          changed = true;
          return { ...d, activeLayerEditTarget: nextTarget };
        });
        return changed ? { documents } : state;
      }),

    pushOperation: (op) =>
      set((state) => {
        const docId = op.docId;
        const stack = [...(state.undoStacks[docId] ?? []), op].slice(-MAX_HISTORY);
        return {
          undoStacks: { ...state.undoStacks, [docId]: stack },
          redoStacks: { ...state.redoStacks, [docId]: [] },
        };
      }),

    popUndo: (docId) => {
      const state = get();
      const stack = state.undoStacks[docId] ?? [];
      if (stack.length === 0) return undefined;
      const op = stack[stack.length - 1];
      set({
        undoStacks: { ...state.undoStacks, [docId]: stack.slice(0, -1) },
        redoStacks: {
          ...state.redoStacks,
          [docId]: [...(state.redoStacks[docId] ?? []), op],
        },
      });
      return op;
    },

    popRedo: (docId) => {
      const state = get();
      const stack = state.redoStacks[docId] ?? [];
      if (stack.length === 0) return undefined;
      const op = stack[stack.length - 1];
      set({
        redoStacks: { ...state.redoStacks, [docId]: stack.slice(0, -1) },
        undoStacks: {
          ...state.undoStacks,
          [docId]: [...(state.undoStacks[docId] ?? []), op],
        },
      });
      return op;
    },

    clearHistory: (docId) =>
      set((state) => ({
        undoStacks: { ...state.undoStacks, [docId]: [] },
        redoStacks: { ...state.redoStacks, [docId]: [] },
      })),

    startQuickActionRecording: () =>
      set((state) => (
        state.activeQuickActionRecording
          ? state
          : {
              activeQuickActionRecording: {
                startedAt: Date.now(),
                steps: [],
              },
            }
      )),

    appendQuickActionRecordingStep: (actionId) =>
      set((state) => {
        const recording = state.activeQuickActionRecording;
        if (!recording || !actionId.trim()) return state;
        return {
          activeQuickActionRecording: {
            ...recording,
            steps: [...recording.steps, { actionId }],
          },
        };
      }),

    saveQuickActionRecording: () => {
      const state = get();
      const recording = state.activeQuickActionRecording;
      if (!recording || recording.steps.length === 0) return null;

      const createdAt = Date.now();
      const macro: ImageQuickActionMacro = {
        id: `quick-action-macro-${createdAt}`,
        name: `Action ${state.quickActionMacros.length + 1}`,
        createdAt,
        updatedAt: createdAt,
        steps: recording.steps.map((step) => ({ ...step })),
      };

      set({
        quickActionMacros: [...state.quickActionMacros, macro],
        activeQuickActionRecording: null,
      });

      return macro;
    },

    cancelQuickActionRecording: () => set({ activeQuickActionRecording: null }),

    renameQuickActionMacro: (id, name) =>
      set((state) => {
        const normalizedName = name.trim();
        if (!normalizedName) return state;
        let changed = false;
        const quickActionMacros = state.quickActionMacros.map((macro) => {
          if (macro.id !== id || macro.name === normalizedName) return macro;
          changed = true;
          return {
            ...macro,
            name: normalizedName,
            updatedAt: Date.now(),
          };
        });
        return changed ? { quickActionMacros } : state;
      }),

    deleteQuickActionMacro: (id) =>
      set((state) => ({
        quickActionMacros: state.quickActionMacros.filter((macro) => macro.id !== id),
      })),

    getActiveDocument: () => {
      const { documents, activeDocId } = get();
      return documents.find((d) => d.id === activeDocId);
    },

    exportProjectSnapshot: () => {
      const state = get();
      return {
        documents: state.documents.map((document) => ({
          ...document,
          layers: document.layers.map(stripImageLayerRuntimePixels),
          snapshots: document.snapshots?.map(stripImageSnapshotRuntimePixels) ?? [],
        })),
        activeDocId: state.activeDocId,
        quickActionMacros: state.quickActionMacros.map(cloneImageQuickActionMacro),
      };
    },

    restoreProjectSnapshot: (snapshot) => {
      const safeSnapshot = sanitizeImageEditorSnapshot(snapshot);
      const documents = safeSnapshot?.documents ?? [];
      const activeDocId = safeSnapshot?.activeDocId && documents.some((document) => document.id === safeSnapshot.activeDocId)
        ? safeSnapshot.activeDocId
        : documents[0]?.id ?? null;
      set({
        documents,
        activeDocId,
        undoStacks: {},
        redoStacks: {},
        quickActionMacros: safeSnapshot?.quickActionMacros?.map(cloneImageQuickActionMacro) ?? [],
        activeQuickActionRecording: null,
        generativeFillDismissedByDocId: {},
      });
    },
  }),
);

/**
 * Build a fresh ImageDocument shell. Layer bitmaps are not created here —
 * compositor/tools allocate OffscreenCanvas instances when needed.
 */
export function createEmptyImageDocument(params: {
  id: string;
  title: string;
  width: number;
  height: number;
  sourceBinItemId?: string;
}): ImageDocument {
  return {
    id: params.id,
    title: params.title,
    width: params.width,
    height: params.height,
    layers: [],
    activeLayerId: null,
    activeLayerEditTarget: 'layer',
    hasSelection: false,
    selectionVersion: 0,
    viewport: { ...DEFAULT_VIEWPORT },
    dirty: false,
    sourceBinItemId: params.sourceBinItemId,
    savedSelectionChannels: [],
    spotChannels: [],
    snapshots: [],
  };
}

function hasShallowPatchChange<T extends object>(current: T, patch: Partial<T>): boolean {
  return Object.entries(patch).some(([key, value]) => !Object.is(current[key as keyof T], value));
}

function updateDocumentGuides(
  state: ImageEditorState,
  docId: string,
  mapper: (guides: readonly ImageGuide[]) => ImageGuide[],
): Partial<ImageEditorState> | ImageEditorState {
  let changed = false;
  const documents = state.documents.map((document) => {
    if (document.id !== docId) return document;
    const current = document.guides ?? [];
    const next = mapper(current);
    if (next === current) return document;
    changed = true;
    return { ...document, guides: next, dirty: true };
  });
  return changed ? { documents } : state;
}

function arraysEqual<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((item, index) => Object.is(item, b[index]));
}

function normalizePaletteColor(color: string, fallback: string): string {
  const trimmed = color.trim();
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toLowerCase();
  const short = trimmed.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase();
  return fallback;
}

function applyDocumentResizeState(
  state: ImageEditorState,
  beforeDoc: ImageDocument,
  afterDoc: ImageDocument,
): Partial<ImageEditorState> {
  const docId = beforeDoc.id;
  const op: EditorOperation = {
    kind: 'docResize',
    docId,
    before: {
      width: beforeDoc.width,
      height: beforeDoc.height,
      layers: beforeDoc.layers,
    },
    after: {
      width: afterDoc.width,
      height: afterDoc.height,
      layers: afterDoc.layers,
    },
  };
  const stack = [...(state.undoStacks[docId] ?? []), op].slice(-MAX_HISTORY);

  return {
    documents: state.documents.map((document) => (document.id === docId ? afterDoc : document)),
    undoStacks: { ...state.undoStacks, [docId]: stack },
    redoStacks: { ...state.redoStacks, [docId]: [] },
  };
}

function cloneImageLayerForEditableCopy(layer: ImageLayer): ImageLayer {
  return {
    ...layer,
    bitmap: layer.bitmap ? cloneBitmap(layer.bitmap) : null,
    mask: layer.mask ? cloneBitmap(layer.mask) : null,
    metadata: cloneSerializableValue(layer.metadata),
    text: cloneSerializableValue(layer.text),
    adjustment: cloneSerializableValue(layer.adjustment),
    effects: cloneSerializableValue(layer.effects),
    filters: cloneSerializableValue(layer.filters),
  };
}

function stripImageLayerRuntimePixels(layer: ImageLayer): ImageLayer {
  return {
    ...layer,
    bitmap: null,
    mask: null,
    metadata: cloneSerializableValue(layer.metadata),
    text: cloneSerializableValue(layer.text),
    adjustment: cloneSerializableValue(layer.adjustment),
    effects: cloneSerializableValue(layer.effects),
    filters: cloneSerializableValue(layer.filters),
  };
}

function stripImageSnapshotRuntimePixels(snapshot: ImageDocumentSnapshot): ImageDocumentSnapshot {
  return {
    ...snapshot,
    layers: snapshot.layers.map(stripImageLayerRuntimePixels),
  };
}

function cloneImageQuickActionMacro(macro: ImageQuickActionMacro): ImageQuickActionMacro {
  return {
    ...macro,
    steps: macro.steps.map((step) => ({ ...step })),
  };
}

function cloneSerializableValue<T>(value: T): T {
  if (value === undefined || value === null) return value;
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

function resolveActiveLayerEditTarget(
  doc: Pick<ImageDocument, 'layers' | 'activeLayerId' | 'activeLayerEditTarget'>,
  requestedTarget?: ImageLayerEditTarget,
): ImageLayerEditTarget {
  const target = requestedTarget ?? doc.activeLayerEditTarget ?? 'layer';
  if (target !== 'mask') return 'layer';
  const activeLayer = doc.layers.find((layer) => layer.id === doc.activeLayerId) ?? null;
  return activeLayer?.mask ? 'mask' : 'layer';
}
