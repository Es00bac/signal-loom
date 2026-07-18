import { Capacitor } from '@capacitor/core';
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
  type LayerBitmap,
  type ImageQuickActionMacro,
  type ImageQuickActionMacroStep,
  type GradientToolSettings,
  type QuickMaskSettings,
  type RetouchToolSettings,
  type SelectAndMaskSettings,
  type SelectionMaskSnapshot,
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
import { toggleLayerInSelection } from '../components/ImageEditor/ImageGroupTransform';
import { cloneBitmap, releaseImmutableBitmap } from '../components/ImageEditor/LayerBitmap';
import {
  decodeImageDocumentSnapshotProjectPixels,
  decodeImageSelectionMaskProjectData,
  decodeImageLayerProjectPixels,
  encodeImageDocumentSnapshotProjectPixels,
  encodeImageSelectionMaskProjectData,
  encodeImageLayerProjectPixels,
} from '../components/ImageEditor/ImageLayerProjectPixels';
import {
  assertImageDocumentSnapshotDecodeBounds,
  disposeImageDocumentNamedSnapshots,
  disposeImageDocumentSnapshotResources,
  IMAGE_PROJECT_MAX_SNAPSHOT_LAYERS,
  IMAGE_PROJECT_MAX_SNAPSHOT_METADATA_BYTES,
  IMAGE_PROJECT_MAX_SNAPSHOT_STRUCTURAL_RESOURCES,
  IMAGE_PROJECT_MAX_SNAPSHOTS,
} from '../components/ImageEditor/ImageSnapshots';
import {
  clearAllSelections,
  clearSelection,
  getFloatingSelection,
  getSelection,
  setFloatingSelection,
  setSelection,
} from '../components/ImageEditor/selectionRegistry';
import {
  fromSnapshot,
  isMaskEmpty,
  toSnapshot,
  type SelectionMask,
} from '../components/ImageEditor/SelectionMask';
import { buildPerspectiveCroppedImageDocumentState } from '../components/ImageEditor/tools/perspectiveCropDocument';
import type { CropPoint as PerspectiveCropCorner } from '../components/ImageEditor/tools/perspectiveCrop';
import {
  resizeImageCanvas,
  resizeImageDocumentPixels,
  type CanvasResizeAnchor,
} from '../components/ImageEditor/ImageDocumentGeometry';
import { sanitizeImageEditorSnapshot } from '../lib/projectValidation';
import {
  applyImageDocumentNativeChange,
  toImageDocumentWire,
  type ImageDocumentNativeChange,
  type ImageDocumentWire,
} from '../lib/imageDocumentNativeSync';
import { rasterizeSvgToBitmapAtResolution } from '../components/ImageEditor/ImageFileFormats';
import {
  DEFAULT_IMAGE_EDITOR_TOOLBAR_FLYOUT_ORDER,
  sanitizeImageEditorToolbarFlyoutOrder,
  type ImageEditorToolbarFlyoutGroupId,
} from '../components/ImageEditor/imageEditorTools';
import {
  disposeEditorOperations,
  editorOperationRetainedBytes,
  retainEditorOperation,
} from '../components/ImageEditor/ImageHistoryResources';

const MAX_HISTORY = 50;
// Undo snapshots store layer bitmaps; at 4K a single paint op holds ~134MB (full-layer
// before+after). Capping only by op count (50) let history grow toward gigabytes, which
// degrades brush responsiveness over a session (GC/memory pressure). Also bound by bytes so
// large docs stop growing while small docs still keep deep history.
const MAX_HISTORY_BYTES = 768 * 1024 * 1024;

function trimHistory(stack: EditorOperation[]): EditorOperation[] {
  const trimmed = stack.length > MAX_HISTORY ? stack.slice(stack.length - MAX_HISTORY) : stack;
  let total = 0;
  for (const op of trimmed) total += editorOperationRetainedBytes(op);
  if (total <= MAX_HISTORY_BYTES) {
    if (trimmed !== stack) disposeEditorOperations(stack.slice(0, stack.length - trimmed.length));
    return trimmed;
  }
  let start = 0;
  while (start < trimmed.length - 1 && total > MAX_HISTORY_BYTES) {
    total -= editorOperationRetainedBytes(trimmed[start]);
    start += 1;
  }
  const retained = start > 0 ? trimmed.slice(start) : trimmed;
  const retainedSet = new Set(retained);
  disposeEditorOperations(stack.filter((operation) => !retainedSet.has(operation)));
  return retained;
}

const DEFAULT_IMAGE_BACKGROUND_COLOR = '#000000';

export type ImageDocumentRecoveryReason = 'crash-recovery' | 'startup-recovery';

export interface ImageDiscardedDocumentRecovery {
  id: string;
  batchId: string;
  reason: ImageDocumentRecoveryReason;
  capturedAt: number;
  originalIndex: number;
  wasActive: boolean;
  /** Pixel-complete encoded document; runtime canvases are decoded only when restored. */
  snapshot: ImageDocument;
  /** History operations retained against disposal until restored, dismissed, or evicted. */
  undoStack?: EditorOperation[];
  redoStack?: EditorOperation[];
}

interface ImageEditorState {
  documents: ImageDocument[];
  activeDocId: string | null;
  /** Bounded local recovery copies retained across deliberate project replacement/reset. */
  discardedDocumentRecoveries: ImageDiscardedDocumentRecovery[];
  /** The document id the cross-device sync's last snapshot seeded; granular remote ops target it. */
  syncedImageDocumentId: string | null;
  /**
   * Bumped whenever remote sync changes a document (structure or pixels). The canvas subscribes to
   * it and hard-invalidates the CompositeRenderer's cached worker composite: remote pixel flips can
   * land at a bitmapVersion the renderer has already cached a composite for (each device bumps
   * versions independently), so a version-based signature alone would keep serving stale pixels
   * (docs/notes/820 — "drawing vanished after taking the baton back").
   */
  remoteImageApplyEpoch: number;
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
  /** True while a brush/eraser/retouch stroke is mutating the active layer in place. Lets the
   * compositor use a fast cached-backdrop path for live previews; cleared on pointer-up so the
   * final committed frame goes through the normal full render. */
  isPaintingStroke: boolean;
  toolsCollapsed: boolean;
}

export interface ImageEditorProjectSnapshot {
  documents: ImageDocument[];
  activeDocId: string | null;
  quickActionMacros?: ImageQuickActionMacro[];
}

/**
 * Opaque ownership token for fully decoded project pixels. Callers must either commit it or
 * dispose it; exposing the decoded document graph would let prepared canvases escape before the
 * surrounding native project switch has committed.
 */
export interface PreparedImageEditorProjectSnapshot {
  readonly kind: 'prepared-image-editor-project-snapshot';
}

/** Owns both sides of one installed Image project until the outer project switch settles. */
export interface ImageEditorProjectSnapshotTransaction {
  rollback: () => void;
  finalize: () => void;
}

interface ImageEditorActions {
  openDocument: (doc: ImageDocument) => void;
  /** Close only when no editable layered changes are pending. */
  closeDocument: (id: string) => void;
  /** Deliberately destroy a document after an explicit Discard decision. */
  discardDocument: (id: string) => void;
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
  setSelectedLayers: (docId: string, layerIds: string[]) => void;
  toggleLayerSelection: (docId: string, layerId: string) => void;
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
  exportProjectSnapshotWithPixels: () => Promise<ImageEditorProjectSnapshot>;
  prepareProjectSnapshotWithPixels: (snapshot?: ImageEditorProjectSnapshot) => Promise<PreparedImageEditorProjectSnapshot>;
  disposePreparedProjectSnapshotWithPixels: (snapshot: PreparedImageEditorProjectSnapshot) => void;
  commitPreparedProjectSnapshotWithPixels: (
    snapshot: PreparedImageEditorProjectSnapshot,
  ) => ImageEditorProjectSnapshotTransaction;
  restoreProjectSnapshotWithPixels: (snapshot?: ImageEditorProjectSnapshot) => Promise<void>;
  prepareDocumentRecovery: (
    documentIds: readonly string[],
    reason: ImageDocumentRecoveryReason,
  ) => Promise<ImageDiscardedDocumentRecovery[]>;
  disposePreparedDocumentRecovery: (recoveries: readonly ImageDiscardedDocumentRecovery[]) => void;
  commitPreparedDocumentRecovery: (recoveries: readonly ImageDiscardedDocumentRecovery[]) => number;
  restoreDiscardedDocument: (recoveryId: string) => Promise<string | undefined>;
  dismissDiscardedDocumentRecovery: (recoveryId: string) => void;
  /**
   * Lossless rollback for a failed project restore: puts back the exact live
   * document objects (bitmaps included) that were captured before the restore
   * started. Never sanitizes — sanitize nulls live bitmaps, which is exactly
   * the data loss this exists to prevent.
   */
  restoreLiveProjectRollback: (rollback: {
    documents: ImageDocument[];
    activeDocId: string | null;
    quickActionMacros: ImageQuickActionMacro[];
    selectionMasks?: Record<string, SelectionMaskSnapshot>;
  }) => void;
  setIsDraggingSlider: (dragging: boolean) => void;
  setPaintingStroke: (painting: boolean) => void;
  setToolsCollapsed: (collapsed: boolean) => void;
  /**
   * Cross-device sync seam (task #53): apply one **non-pixel** op from the unified op-sync to the active
   * document, preserving every surviving layer's live `bitmap`/`mask` `OffscreenCanvas` by id. Pixel ops
   * carry only a version pointer; their bytes arrive out-of-band via {@link applyRemoteLayerPixels}.
   * Returns true if the document changed. Non-broadcasting: the Image channel wraps it in its echo guard.
   */
  applyRemoteImageDocumentChange: (change: ImageDocumentNativeChange) => boolean;
  /**
   * Cross-device sync seam (task #53): atomically flip one layer's pixels — its live `bitmap`/`mask` and
   * `bitmapVersion` together — once the channel has fetched + decoded the out-of-band bytes. Keeping the
   * version and the pixels in one `set` means a layer never advertises version N while still showing N−1.
   */
  applyRemoteLayerPixels: (
    layerId: string,
    pixels: { bitmap: LayerBitmap | null; mask: LayerBitmap | null; bitmapVersion: number },
  ) => boolean;
}

function removeImageDocumentState(state: ImageEditorState, id: string): Partial<ImageEditorState> {
  const removedDocument = state.documents.find((document) => document.id === id);
  const documents = state.documents.filter((document) => document.id !== id);
  const activeDocId = state.activeDocId === id
    ? documents[documents.length - 1]?.id ?? null
    : state.activeDocId;
  const undoStacks = { ...state.undoStacks };
  const redoStacks = { ...state.redoStacks };
  const generativeFillDismissedByDocId = { ...state.generativeFillDismissedByDocId };
  disposeEditorOperations(undoStacks[id] ?? []);
  disposeEditorOperations(redoStacks[id] ?? []);
  delete undoStacks[id];
  delete redoStacks[id];
  delete generativeFillDismissedByDocId[id];
  if (removedDocument) disposeImageDocumentNamedSnapshots(removedDocument);
  clearSelection(id);
  return { documents, activeDocId, undoStacks, redoStacks, generativeFillDismissedByDocId };
}

function disposeAllImageHistory(state: Pick<ImageEditorState, 'undoStacks' | 'redoStacks'>): void {
  for (const stack of Object.values(state.undoStacks)) disposeEditorOperations(stack);
  for (const stack of Object.values(state.redoStacks)) disposeEditorOperations(stack);
}

interface PreparedImageEditorProjectSnapshotData {
  snapshot: ImageEditorProjectSnapshot;
  phase: 'prepared' | 'committed' | 'disposed';
}

interface ImageEditorProjectRuntimeSide {
  documents: ImageDocument[];
  activeDocId: string | null;
  undoStacks: Record<string, EditorOperation[]>;
  redoStacks: Record<string, EditorOperation[]>;
  quickActionMacros: ImageQuickActionMacro[];
  activeQuickActionRecording: ImageEditorState['activeQuickActionRecording'];
  generativeFillDismissedByDocId: Record<string, boolean>;
  selections: Map<string, SelectionMask>;
  floatingSelections: Map<string, { layerId: string }>;
}

const preparedImageEditorProjectSnapshots = new WeakMap<
  PreparedImageEditorProjectSnapshot,
  PreparedImageEditorProjectSnapshotData
>();

function collectImageDocumentBitmaps(
  documents: readonly ImageDocument[],
  target: Set<LayerBitmap>,
): void {
  for (const document of documents) {
    for (const layer of document.layers) {
      if (layer.bitmap) target.add(layer.bitmap);
      if (layer.mask) target.add(layer.mask);
    }
    for (const snapshot of document.snapshots ?? []) {
      for (const layer of snapshot.layers) {
        if (layer.bitmap) target.add(layer.bitmap);
        if (layer.mask) target.add(layer.mask);
      }
    }
  }
}

function disposeImageProjectDocumentResources(
  documents: readonly ImageDocument[],
  protectedDocuments: readonly ImageDocument[] = [],
): void {
  const protectedBitmaps = new Set<LayerBitmap>();
  collectImageDocumentBitmaps(protectedDocuments, protectedBitmaps);
  const liveBitmaps = new Set<LayerBitmap>();
  for (const document of documents) {
    for (const layer of document.layers) {
      if (layer.bitmap) liveBitmaps.add(layer.bitmap);
      if (layer.mask) liveBitmaps.add(layer.mask);
    }
  }
  const snapshotProtectedBitmaps = new Set([...protectedBitmaps, ...liveBitmaps]);
  for (const document of documents) {
    for (const snapshot of document.snapshots ?? []) {
      disposeImageDocumentSnapshotResources(snapshot, snapshotProtectedBitmaps);
    }
  }
  for (const bitmap of liveBitmaps) {
    if (protectedBitmaps.has(bitmap) || (bitmap.width === 0 && bitmap.height === 0)) continue;
    releaseImmutableBitmap(bitmap);
    bitmap.width = 0;
    bitmap.height = 0;
  }
}

function captureImageProjectSelections(documents: readonly ImageDocument[]): {
  selections: Map<string, SelectionMask>;
  floatingSelections: Map<string, { layerId: string }>;
} {
  const selections = new Map<string, SelectionMask>();
  const floatingSelections = new Map<string, { layerId: string }>();
  for (const document of documents) {
    const selection = getSelection(document.id);
    if (selection) selections.set(document.id, selection);
    const floatingSelection = getFloatingSelection(document.id);
    if (floatingSelection) floatingSelections.set(document.id, floatingSelection);
  }
  return { selections, floatingSelections };
}

function installImageProjectSelections(
  selections: ReadonlyMap<string, SelectionMask>,
  floatingSelections: ReadonlyMap<string, { layerId: string }>,
): void {
  clearAllSelections();
  for (const [documentId, selection] of selections) setSelection(documentId, selection);
  for (const [documentId, floatingSelection] of floatingSelections) {
    setFloatingSelection(documentId, floatingSelection);
  }
}

function captureImageProjectRuntimeSide(state: ImageEditorState): ImageEditorProjectRuntimeSide {
  const selectionState = captureImageProjectSelections(state.documents);
  return {
    documents: state.documents,
    activeDocId: state.activeDocId,
    undoStacks: state.undoStacks,
    redoStacks: state.redoStacks,
    quickActionMacros: state.quickActionMacros,
    activeQuickActionRecording: state.activeQuickActionRecording,
    generativeFillDismissedByDocId: state.generativeFillDismissedByDocId,
    ...selectionState,
  };
}

function sameImageProjectSelections(
  expected: ReadonlyMap<string, SelectionMask>,
  expectedFloating: ReadonlyMap<string, { layerId: string }>,
  documents: readonly ImageDocument[],
): boolean {
  if (expected.size !== documents.filter((document) => getSelection(document.id)).length) return false;
  if (expectedFloating.size !== documents.filter((document) => getFloatingSelection(document.id)).length) return false;
  return documents.every((document) => (
    getSelection(document.id) === expected.get(document.id)
    && getFloatingSelection(document.id) === (expectedFloating.get(document.id) ?? null)
  ));
}

function sameImageProjectRuntimeSide(
  state: ImageEditorState,
  expected: ImageEditorProjectRuntimeSide,
): boolean {
  return state.documents === expected.documents
    && state.activeDocId === expected.activeDocId
    && state.undoStacks === expected.undoStacks
    && state.redoStacks === expected.redoStacks
    && state.quickActionMacros === expected.quickActionMacros
    && state.activeQuickActionRecording === expected.activeQuickActionRecording
    && state.generativeFillDismissedByDocId === expected.generativeFillDismissedByDocId
    && sameImageProjectSelections(expected.selections, expected.floatingSelections, expected.documents);
}

function disposeImageProjectRuntimeSide(
  side: ImageEditorProjectRuntimeSide,
  protectedDocuments: readonly ImageDocument[] = [],
): void {
  disposeAllImageHistory(side);
  disposeImageProjectDocumentResources(side.documents, protectedDocuments);
}

export const useImageEditorStore = create<ImageEditorState & ImageEditorActions>()(
  (set, get) => ({
    documents: [],
    activeDocId: null,
    discardedDocumentRecoveries: [],
    tool: 'move',
    backgroundColor: DEFAULT_IMAGE_BACKGROUND_COLOR,
    // Volume-key brush sizing is opt-in via DEFAULT_BRUSH_SETTINGS, but on a native (Android/DeX) build
    // it's the expected drawing-app behaviour — default it on so volume keys resize the brush in the Image
    // editor out of the box (scoped to the editor; toggle off in Brush properties to restore volume control).
    brushSettings: { ...DEFAULT_BRUSH_SETTINGS, androidBrushControls: Capacitor.isNativePlatform() },
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
    isPaintingStroke: false,
    toolsCollapsed: false,

    setIsDraggingSlider: (isDraggingSlider) => set({ isDraggingSlider }),
    setPaintingStroke: (isPaintingStroke) => set((state) => (state.isPaintingStroke === isPaintingStroke ? state : { isPaintingStroke })),
    setToolsCollapsed: (toolsCollapsed) => set({ toolsCollapsed }),

    openDocument: (doc) =>
      set((state) => {
        const exists = state.documents.some((d) => d.id === doc.id);
        if (exists) {
          if (state.activeDocId === doc.id) return state;
          return { activeDocId: doc.id };
        }
        clearSelection(doc.id);
        const persistedSelection = doc.hasSelection && doc.selectionMask
          && doc.selectionMask.width === doc.width
          && doc.selectionMask.height === doc.height
          && doc.selectionMask.data.byteLength === doc.width * doc.height
          && !isMaskEmpty(doc.selectionMask)
          ? toSnapshot(doc.selectionMask)
          : undefined;
        if (persistedSelection) setSelection(doc.id, fromSnapshot(persistedSelection));
        const openedDocument = {
          ...doc,
          hasSelection: Boolean(persistedSelection),
          selectionMask: undefined,
          selectionMaskData: undefined,
        };
        return {
          documents: [...state.documents, openedDocument],
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
        const document = state.documents.find((candidate) => candidate.id === id);
        if (!document || document.dirty) return state;
        return removeImageDocumentState(state, id);
      }),

    discardDocument: (id) =>
      set((state) => state.documents.some((document) => document.id === id)
        ? removeImageDocumentState(state, id)
        : state),

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

    setHasSelection: (id, hasSelection) => {
      if (!hasSelection) clearSelection(id);
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
      });
    },

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
          if (d.id !== docId) return d;
          const nextSelection = layerId ? [layerId] : [];
          const prevSelection = d.selectedLayerIds ?? [];
          const selectionSame = d.activeLayerId === layerId
            && prevSelection.length === nextSelection.length
            && prevSelection.every((id, i) => id === nextSelection[i]);
          if (selectionSame) return d;
          changed = true;
          // A plain selection collapses any multi-selection to just this layer.
          return {
            ...d,
            activeLayerId: layerId,
            selectedLayerIds: nextSelection,
            activeLayerEditTarget: resolveActiveLayerEditTarget({
              ...d,
              activeLayerId: layerId,
            }),
          };
        });
        return changed ? { documents } : state;
      }),

    setSelectedLayers: (docId, layerIds) =>
      set((state) => {
        let changed = false;
        const documents = state.documents.map((d) => {
          if (d.id !== docId) return d;
          const existing = new Set(d.layers.map((l) => l.id));
          const ids = layerIds.filter((id, i) => existing.has(id) && layerIds.indexOf(id) === i);
          if (ids.length === 0) return d;
          const activeLayerId = ids.includes(d.activeLayerId ?? '') ? d.activeLayerId : ids[ids.length - 1];
          changed = true;
          return { ...d, selectedLayerIds: ids, activeLayerId };
        });
        return changed ? { documents } : state;
      }),

    toggleLayerSelection: (docId, layerId) =>
      set((state) => {
        let changed = false;
        const documents = state.documents.map((d) => {
          if (d.id !== docId || !d.layers.some((l) => l.id === layerId)) return d;
          const current = (d.selectedLayerIds && d.selectedLayerIds.length > 0)
            ? d.selectedLayerIds
            : (d.activeLayerId ? [d.activeLayerId] : []);
          const next = toggleLayerInSelection(current, d.activeLayerId, layerId);
          changed = true;
          return { ...d, selectedLayerIds: next.selectedLayerIds, activeLayerId: next.activeLayerId };
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
        const retainedOperation = retainEditorOperation(op);
        const stack = trimHistory([...(state.undoStacks[docId] ?? []), retainedOperation]);
        disposeEditorOperations(state.redoStacks[docId] ?? []);
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
      set((state) => {
        disposeEditorOperations(state.undoStacks[docId] ?? []);
        disposeEditorOperations(state.redoStacks[docId] ?? []);
        return {
          undoStacks: { ...state.undoStacks, [docId]: [] },
          redoStacks: { ...state.redoStacks, [docId]: [] },
        };
      }),

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
          hasSelection: false,
          selectionMask: undefined,
          selectionMaskData: undefined,
          layers: document.layers.map(stripImageLayerRuntimePixels),
          snapshots: document.snapshots?.map(stripImageSnapshotRuntimePixels) ?? [],
        })),
        activeDocId: state.activeDocId,
        quickActionMacros: state.quickActionMacros.map(cloneImageQuickActionMacro),
      };
    },

    restoreProjectSnapshot: (snapshot) => {
      const previous = get();
      const safeSnapshot = sanitizeImageEditorSnapshot(snapshot);
      const documents = (safeSnapshot?.documents ?? []).map((document) => ({
        ...document,
        hasSelection: false,
        selectionMask: undefined,
        selectionMaskData: undefined,
        snapshots: document.snapshots?.map(stripImageSnapshotRuntimePixels) ?? [],
      }));
      const activeDocId = safeSnapshot?.activeDocId && documents.some((document) => document.id === safeSnapshot.activeDocId)
        ? safeSnapshot.activeDocId
        : documents[0]?.id ?? null;
      disposeAllImageHistory(previous);
      for (const document of previous.documents) {
        disposeImageDocumentNamedSnapshots(document);
      }
      clearAllSelections();
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

    // Asset-complete variants used when a project document is written to / read from disk: the
    // live layer pixels are encoded into base64 (bitmapData/maskData) so the active canvas
    // survives a save, instead of being stripped to null and lost. See ImageLayerProjectPixels.
    exportProjectSnapshotWithPixels: async () => {
      const state = get();
      assertImageDocumentSnapshotDecodeBounds(
        state.documents.flatMap((document) => document.snapshots ?? []),
        {
          transport: 'runtime',
          maxSnapshots: IMAGE_PROJECT_MAX_SNAPSHOTS,
          maxAggregateLayers: IMAGE_PROJECT_MAX_SNAPSHOT_LAYERS,
          maxAggregateProofs: IMAGE_PROJECT_MAX_SNAPSHOT_LAYERS,
          maxAggregateResources: IMAGE_PROJECT_MAX_SNAPSHOT_STRUCTURAL_RESOURCES,
          maxAggregateMetadataBytes: IMAGE_PROJECT_MAX_SNAPSHOT_METADATA_BYTES,
        },
      );
      const documents = await Promise.all(state.documents.map(async (document) => {
        assertImageDocumentSnapshotDecodeBounds(document.snapshots ?? [], { transport: 'runtime' });
        const selection = document.hasSelection ? getSelection(document.id) : undefined;
        const persistSelection = Boolean(
          selection
          && selection.width === document.width
          && selection.height === document.height
          && selection.data.byteLength === document.width * document.height
          && !isMaskEmpty(selection),
        );
        return {
          ...document,
          // A persisted project is an editable layered baseline, not a flattened derivative.
          dirty: false,
          hasSelection: persistSelection,
          selectionMask: undefined,
          selectionMaskData: persistSelection ? encodeImageSelectionMaskProjectData(selection!) : undefined,
          layers: await Promise.all(document.layers.map((layer) => encodeImageLayerProjectPixels(layer))),
          // Named snapshots are capped at 12 and use the same lossless per-layer PNG transport as
          // the live document. Undo/redo history remains intentionally non-persistent.
          snapshots: await Promise.all(
            (document.snapshots ?? []).map((snapshot) => encodeImageDocumentSnapshotProjectPixels(snapshot)),
          ),
        };
      }));
      return {
        documents,
        activeDocId: state.activeDocId,
        quickActionMacros: state.quickActionMacros.map(cloneImageQuickActionMacro),
      };
    },

    prepareProjectSnapshotWithPixels: async (snapshot) => {
      const safeSnapshot = sanitizeImageEditorSnapshot(snapshot);
      const rawDocuments = safeSnapshot?.documents ?? [];
      const documents: ImageDocument[] = [];
      const decodedLiveBitmaps = new Set<LayerBitmap>();
      const decodedNamedSnapshots = new Set<ImageDocumentSnapshot>();
      try {
        for (const document of rawDocuments) {
          const layers: ImageLayer[] = [];
          for (const layer of document.layers) {
            const decoded = await decodeImageLayerProjectPixels(layer);
            if (decoded.bitmap) decodedLiveBitmaps.add(decoded.bitmap);
            if (decoded.mask) decodedLiveBitmaps.add(decoded.mask);
            layers.push(decoded);
          }
          const snapshots: ImageDocumentSnapshot[] = [];
          for (const namedSnapshot of document.snapshots ?? []) {
            const decodedSnapshot = await decodeImageDocumentSnapshotProjectPixels(namedSnapshot);
            snapshots.push(decodedSnapshot);
            decodedNamedSnapshots.add(decodedSnapshot);
          }
          let selectionMask;
          if (document.hasSelection && document.selectionMaskData) {
            selectionMask = decodeImageSelectionMaskProjectData(
              document.selectionMaskData,
              document.width,
              document.height,
            );
            if (isMaskEmpty(selectionMask)) selectionMask = undefined;
          }
          documents.push({
            ...document,
            layers,
            snapshots,
            hasSelection: Boolean(selectionMask),
            selectionMask,
            selectionMaskData: undefined,
          });
        }
      } catch (error) {
        for (const document of documents) disposeImageDocumentNamedSnapshots(document);
        for (const namedSnapshot of decodedNamedSnapshots) {
          disposeImageDocumentSnapshotResources(namedSnapshot);
        }
        for (const bitmap of decodedLiveBitmaps) {
          if (bitmap.width !== 0 || bitmap.height !== 0) {
            bitmap.width = 0;
            bitmap.height = 0;
          }
        }
        throw error;
      }
      const activeDocId = safeSnapshot?.activeDocId && documents.some((document) => document.id === safeSnapshot.activeDocId)
        ? safeSnapshot.activeDocId
        : documents[0]?.id ?? null;
      const prepared = Object.freeze({
        kind: 'prepared-image-editor-project-snapshot' as const,
      });
      preparedImageEditorProjectSnapshots.set(prepared, {
        phase: 'prepared',
        snapshot: {
          documents,
          activeDocId,
          quickActionMacros: safeSnapshot?.quickActionMacros?.map(cloneImageQuickActionMacro) ?? [],
        },
      });
      return prepared;
    },

    disposePreparedProjectSnapshotWithPixels: (prepared) => {
      const data = preparedImageEditorProjectSnapshots.get(prepared);
      if (!data || data.phase !== 'prepared') return;
      data.phase = 'disposed';
      preparedImageEditorProjectSnapshots.delete(prepared);
      disposeImageProjectDocumentResources(data.snapshot.documents);
    },

    commitPreparedProjectSnapshotWithPixels: (prepared) => {
      const data = preparedImageEditorProjectSnapshots.get(prepared);
      if (!data || data.phase !== 'prepared') {
        throw new Error('The prepared Image project snapshot is no longer available.');
      }
      const previous = captureImageProjectRuntimeSide(get());
      const selections = new Map<string, SelectionMask>();
      const documents = data.snapshot.documents.map((document) => {
        const selection = document.hasSelection && document.selectionMask
          ? fromSnapshot(document.selectionMask)
          : undefined;
        if (selection) selections.set(document.id, selection);
        return {
          ...document,
          hasSelection: Boolean(selection),
          selectionMask: undefined,
          selectionMaskData: undefined,
        };
      });
      const installed: ImageEditorProjectRuntimeSide = {
        documents,
        activeDocId: data.snapshot.activeDocId && documents.some((document) => document.id === data.snapshot.activeDocId)
          ? data.snapshot.activeDocId
          : documents[0]?.id ?? null,
        undoStacks: {},
        redoStacks: {},
        quickActionMacros: data.snapshot.quickActionMacros?.map(cloneImageQuickActionMacro) ?? [],
        activeQuickActionRecording: null,
        generativeFillDismissedByDocId: {},
        selections,
        floatingSelections: new Map(),
      };

      installImageProjectSelections(installed.selections, installed.floatingSelections);
      let observerError: unknown;
      try {
        set({
          documents: installed.documents,
          activeDocId: installed.activeDocId,
          undoStacks: installed.undoStacks,
          redoStacks: installed.redoStacks,
          quickActionMacros: installed.quickActionMacros,
          activeQuickActionRecording: installed.activeQuickActionRecording,
          generativeFillDismissedByDocId: installed.generativeFillDismissedByDocId,
        });
      } catch (error) {
        observerError = error;
      }
      if (!sameImageProjectRuntimeSide(get(), installed)) {
        installImageProjectSelections(previous.selections, previous.floatingSelections);
        if (observerError) throw observerError;
        throw new Error('The prepared Image project snapshot could not be installed.');
      }
      data.phase = 'committed';

      let settled = false;
      const settle = (outcome: 'rollback' | 'finalize') => {
        if (settled) return;
        settled = true;
        data.phase = 'disposed';
        preparedImageEditorProjectSnapshots.delete(prepared);
        const current = get();
        if (outcome === 'rollback' && sameImageProjectRuntimeSide(current, installed)) {
          installImageProjectSelections(previous.selections, previous.floatingSelections);
          try {
            set({
              documents: previous.documents,
              activeDocId: previous.activeDocId,
              undoStacks: previous.undoStacks,
              redoStacks: previous.redoStacks,
              quickActionMacros: previous.quickActionMacros,
              activeQuickActionRecording: previous.activeQuickActionRecording,
              generativeFillDismissedByDocId: previous.generativeFillDismissedByDocId,
            });
          } catch {
            // Zustand publishes the state before notifying synchronous observers. The exact A
            // side is already restored even if one observer rejects its notification.
          }
          disposeImageProjectRuntimeSide(installed, previous.documents);
          return;
        }
        // Successful settlement, or a concurrent Image edit after commit: the installed/current
        // side wins and only the superseded A resources may be released.
        disposeImageProjectRuntimeSide(previous, current.documents);
      };

      return {
        rollback: () => settle('rollback'),
        finalize: () => settle('finalize'),
      };
    },

    restoreProjectSnapshotWithPixels: async (snapshot) => {
      const prepared = await get().prepareProjectSnapshotWithPixels(snapshot);
      let transaction: ImageEditorProjectSnapshotTransaction | undefined;
      try {
        transaction = get().commitPreparedProjectSnapshotWithPixels(prepared);
        transaction.finalize();
      } catch (error) {
        if (transaction) transaction.rollback();
        else get().disposePreparedProjectSnapshotWithPixels(prepared);
        throw error;
      }
    },

    prepareDocumentRecovery: async (documentIds, reason) => {
      const state = get();
      const requestedIds = new Set(documentIds);
      const batchId = makeImageRecoveryId('image-recovery-batch');
      const recoveryResults = await Promise.allSettled(state.documents.flatMap((document, originalIndex) => (
        requestedIds.has(document.id)
          ? [Promise.all([
              Promise.all(document.layers.map((layer) => encodeImageLayerProjectPixels(layer))),
              Promise.all((document.snapshots ?? []).map(
                (snapshot) => encodeImageDocumentSnapshotProjectPixels(snapshot),
              )),
            ]).then(([layers, snapshots]): ImageDiscardedDocumentRecovery => ({
              id: makeImageRecoveryId('image-recovery'),
              batchId,
              reason,
              capturedAt: Date.now(),
              originalIndex,
              wasActive: document.id === state.activeDocId,
              // Selection lives in the runtime registry, so the encoded copy never claims one.
              snapshot: {
                ...document,
                dirty: true,
                hasSelection: false,
                selectionMask: undefined,
                selectionMaskData: undefined,
                layers,
                snapshots,
              },
              ...(state.undoStacks[document.id]?.length
                ? { undoStack: state.undoStacks[document.id].map((operation) => retainEditorOperation(operation)) }
                : {}),
              ...(state.redoStacks[document.id]?.length
                ? { redoStack: state.redoStacks[document.id].map((operation) => retainEditorOperation(operation)) }
                : {}),
            }))]
          : []
      )));
      const recoveries = recoveryResults.flatMap((result) => (
        result.status === 'fulfilled' ? [result.value] : []
      ));
      const rejected = recoveryResults.find(
        (result): result is PromiseRejectedResult => result.status === 'rejected',
      );
      if (rejected) {
        disposeImageDocumentRecoveries(recoveries);
        throw rejected.reason;
      }
      if (get() !== state) {
        disposeImageDocumentRecoveries(recoveries);
        throw new Error('The Image workspace changed while crash recovery was being captured.');
      }
      return recoveries;
    },

    disposePreparedDocumentRecovery: (recoveries) => {
      disposeImageDocumentRecoveries(recoveries);
    },

    commitPreparedDocumentRecovery: (recoveries) => {
      if (!recoveries.length) return 0;
      set((state) => ({
        discardedDocumentRecoveries: appendImageDocumentRecoveries(
          state.discardedDocumentRecoveries,
          recoveries,
        ),
      }));
      return recoveries.length;
    },

    restoreDiscardedDocument: async (recoveryId) => {
      const recovery = get().discardedDocumentRecoveries
        .find((candidate) => candidate.id === recoveryId);
      if (!recovery) return undefined;
      const decodedLayers: ImageLayer[] = [];
      const decodedSnapshots: ImageDocumentSnapshot[] = [];
      try {
        for (const layer of recovery.snapshot.layers) {
          decodedLayers.push(await decodeImageLayerProjectPixels(layer));
        }
        for (const namedSnapshot of recovery.snapshot.snapshots ?? []) {
          decodedSnapshots.push(await decodeImageDocumentSnapshotProjectPixels(namedSnapshot));
        }
      } catch (error) {
        disposeDecodedImageLayers(decodedLayers);
        for (const namedSnapshot of decodedSnapshots) {
          disposeImageDocumentSnapshotResources(namedSnapshot);
        }
        throw error;
      }
      const current = get();
      if (!current.discardedDocumentRecoveries.includes(recovery)) {
        disposeDecodedImageLayers(decodedLayers);
        for (const namedSnapshot of decodedSnapshots) {
          disposeImageDocumentSnapshotResources(namedSnapshot);
        }
        return undefined;
      }
      const restoredId = makeUniqueImageDocumentId(recovery.snapshot.id, current.documents);
      const restoredDocument: ImageDocument = {
        ...recovery.snapshot,
        id: restoredId,
        dirty: true,
        layers: decodedLayers,
        snapshots: decodedSnapshots,
      };
      const insertIndex = Math.max(0, Math.min(recovery.originalIndex, current.documents.length));
      const documents = [...current.documents];
      documents.splice(insertIndex, 0, restoredDocument);
      set({
        documents,
        activeDocId: restoredId,
        // Retained history ownership transfers into the live stacks with the tab.
        undoStacks: recovery.undoStack?.length
          ? { ...current.undoStacks, [restoredId]: recovery.undoStack }
          : current.undoStacks,
        redoStacks: recovery.redoStack?.length
          ? { ...current.redoStacks, [restoredId]: recovery.redoStack }
          : current.redoStacks,
        discardedDocumentRecoveries: current.discardedDocumentRecoveries
          .filter((candidate) => candidate.id !== recoveryId),
      });
      return restoredId;
    },

    dismissDiscardedDocumentRecovery: (recoveryId) => set((state) => {
      const dismissed = state.discardedDocumentRecoveries
        .find((candidate) => candidate.id === recoveryId);
      if (dismissed) disposeImageDocumentRecoveries([dismissed]);
      return {
        discardedDocumentRecoveries: state.discardedDocumentRecoveries
          .filter((candidate) => candidate.id !== recoveryId),
      };
    }),

    restoreLiveProjectRollback: (rollback) => {
      const current = get();
      if (
        current.documents.length === rollback.documents.length
        && current.documents.every((document, index) => document === rollback.documents[index])
      ) {
        return;
      }
      disposeAllImageHistory(current);
      for (const document of current.documents) {
        disposeImageDocumentNamedSnapshots(document);
        clearSelection(document.id);
      }
      for (const document of rollback.documents) {
        clearSelection(document.id);
        const selection = rollback.selectionMasks?.[document.id];
        if (selection) setSelection(document.id, fromSnapshot(selection));
      }
      set({
        documents: rollback.documents,
        activeDocId: rollback.activeDocId
          && rollback.documents.some((document) => document.id === rollback.activeDocId)
          ? rollback.activeDocId
          : rollback.documents[0]?.id ?? null,
        undoStacks: {},
        redoStacks: {},
        quickActionMacros: rollback.quickActionMacros,
        activeQuickActionRecording: null,
        generativeFillDismissedByDocId: {},
      });
    },

    syncedImageDocumentId: null,
    remoteImageApplyEpoch: 0,

    applyRemoteImageDocumentChange: (change) => {
      let changed = false;
      set((state) => {
        // Ops must NEVER target the blind activeDocId (owner bug 2026-07-03): a served client with
        // no document open silently dropped the authority's seed forever, and one with a DIFFERENT
        // document open had its layers wiped by id-mismatch reconciliation. Snapshots name their
        // document — create-or-target by that id; granular ops target the doc the last snapshot
        // seeded (tracked in syncedImageDocumentId).
        if (change.type === 'image-document-snapshot') {
          const wire = change.document;
          if (!wire?.id) return state; // empty seed: the authority had no document open
          const existing = state.documents.find((d) => d.id === wire.id);
          if (existing) {
            const prevWire = toImageDocumentWire(existing);
            const nextWire = applyImageDocumentNativeChange(prevWire, change);
            if (nextWire === prevWire) {
              return state.syncedImageDocumentId === wire.id
                ? state
                : { ...state, syncedImageDocumentId: wire.id };
            }
            changed = true;
            const nextDoc = reconcileLiveDocumentToWire(existing, nextWire);
            return {
              documents: state.documents.map((d) => (d.id === existing.id ? nextDoc : d)),
              syncedImageDocumentId: wire.id,
              remoteImageApplyEpoch: state.remoteImageApplyEpoch + 1,
            };
          }
          // The authority's document doesn't exist here yet — create it as a live shell (null
          // bitmaps; the channel streams the pixels out-of-band right after this op).
          const { layers: _wireLayers, ...docMeta } = wire;
          const shell = reconcileLiveDocumentToWire(
            { ...docMeta, layers: [], snapshots: [] } as unknown as ImageDocument,
            wire,
          );
          changed = true;
          return {
            documents: [...state.documents, shell],
            // Surface the synced document when nothing else is open (the served-second-screen
            // contract); never steal focus from a document the user is actively editing.
            activeDocId: state.activeDocId ?? shell.id,
            syncedImageDocumentId: wire.id,
            remoteImageApplyEpoch: state.remoteImageApplyEpoch + 1,
          };
        }

        const doc = state.documents.find((d) => d.id === state.syncedImageDocumentId);
        if (!doc) return state; // granular op before any snapshot seed — the next seed reconciles
        const wire = toImageDocumentWire(doc);
        const nextWire = applyImageDocumentNativeChange(wire, change);
        if (nextWire === wire) return state; // reducer no-op (idempotent op / nothing changed)
        changed = true;
        const nextDoc = reconcileLiveDocumentToWire(doc, nextWire);
        return {
          documents: state.documents.map((d) => (d.id === doc.id ? nextDoc : d)),
          remoteImageApplyEpoch: state.remoteImageApplyEpoch + 1,
        };
      });
      return changed;
    },

    applyRemoteLayerPixels: (layerId, pixels) => {
      let changed = false;
      set((state) => {
        const doc = state.documents.find((d) => d.id === state.syncedImageDocumentId)
          ?? state.documents.find((d) => d.layers.some((l) => l.id === layerId));
        if (!doc) return state;
        const index = doc.layers.findIndex((l) => l.id === layerId);
        if (index < 0) return state;
        const layers = doc.layers.slice();
        layers[index] = {
          ...layers[index],
          bitmap: pixels.bitmap,
          mask: pixels.mask,
          bitmapVersion: pixels.bitmapVersion,
          // The live buffers are now authoritative; drop any stale serialized payload for this layer.
          bitmapData: undefined,
          maskData: undefined,
        };
        changed = true;
        return {
          documents: state.documents.map((d) => (d.id === doc.id ? { ...d, layers } : d)),
          remoteImageApplyEpoch: state.remoteImageApplyEpoch + 1,
        };
      });
      return changed;
    },
  }),
);

/**
 * Rebuild a live {@link ImageDocument} from a canvas-free {@link ImageDocumentWire} produced by the op
 * reducer, **preserving every surviving layer's live `bitmap`/`mask` `OffscreenCanvas` by id** (the wire
 * dropped them). A layer present in the wire but not live yet (a remote add) becomes a null-bitmap shell;
 * the Image channel fills its pixels afterward via {@link ImageEditorActions.applyRemoteLayerPixels}.
 * Undo `snapshots` are not synced, so the live history is carried across untouched.
 */
function reconcileLiveDocumentToWire(live: ImageDocument, wire: ImageDocumentWire): ImageDocument {
  const liveById = new Map(live.layers.map((layer) => [layer.id, layer] as const));
  const layers: ImageLayer[] = wire.layers.map((wireLayer) => {
    const { hasBitmap: _hasBitmap, hasMask: _hasMask, ...meta } = wireLayer;
    const existing = liveById.get(wireLayer.id);
    return {
      ...meta,
      bitmap: existing?.bitmap ?? null,
      mask: existing?.mask ?? null,
      bitmapData: existing?.bitmapData,
      maskData: existing?.maskData,
    };
  });
  const { layers: _wireLayers, ...docMeta } = wire;
  return { ...docMeta, layers, snapshots: live.snapshots };
}

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
  const op = retainEditorOperation({
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
  });
  const stack = trimHistory([...(state.undoStacks[docId] ?? []), op]);
  disposeEditorOperations(state.redoStacks[docId] ?? []);

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
    hasSelection: false,
    selectionMask: undefined,
    selectionMaskData: undefined,
    pixelState: 'unavailable',
  };
}

function cloneImageQuickActionMacro(macro: ImageQuickActionMacro): ImageQuickActionMacro {
  return {
    ...macro,
    steps: macro.steps.map((step) => ({ ...step })),
  };
}

const MAX_IMAGE_RECOVERY_BATCHES = 8;

function makeImageRecoveryId(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`;
}

function disposeImageDocumentRecoveries(
  recoveries: readonly ImageDiscardedDocumentRecovery[],
): void {
  for (const recovery of recoveries) {
    disposeEditorOperations(recovery.undoStack ?? []);
    disposeEditorOperations(recovery.redoStack ?? []);
  }
}

function disposeDecodedImageLayers(layers: readonly ImageLayer[]): void {
  const bitmaps = new Set<LayerBitmap>();
  for (const layer of layers) {
    if (layer.bitmap) bitmaps.add(layer.bitmap);
    if (layer.mask) bitmaps.add(layer.mask);
  }
  for (const bitmap of bitmaps) {
    if (bitmap.width === 0 && bitmap.height === 0) continue;
    releaseImmutableBitmap(bitmap);
    bitmap.width = 0;
    bitmap.height = 0;
  }
}

function appendImageDocumentRecoveries(
  existing: readonly ImageDiscardedDocumentRecovery[],
  incoming: readonly ImageDiscardedDocumentRecovery[],
): ImageDiscardedDocumentRecovery[] {
  const next = [...existing, ...incoming];
  const retainedBatchIds = [...new Set(next.map((recovery) => recovery.batchId))]
    .slice(-MAX_IMAGE_RECOVERY_BATCHES);
  const retained = new Set(retainedBatchIds);
  disposeImageDocumentRecoveries(next.filter((recovery) => !retained.has(recovery.batchId)));
  return next.filter((recovery) => retained.has(recovery.batchId));
}

function makeUniqueImageDocumentId(id: string, documents: readonly ImageDocument[]): string {
  if (!documents.some((document) => document.id === id)) return id;
  let suffix = 2;
  while (documents.some((document) => document.id === `${id}-recovered-${suffix}`)) suffix += 1;
  return `${id}-recovered-${suffix}`;
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

// Register the Image workspace on the unified cross-device sync (#53) lazily when this store loads, so
// channel-init is tied to the Image workspace being present with zero app-startup cost. Mirrors flow/paper.
// Skipped under the test runner: a unit test merely importing this store must not spawn a live, floating
// channel-init side-effect. Across vitest's multi-file worker that unawaited bootstrap can resolve into a
// half-evaluated module context and throw a TDZ error ("Cannot access 'applyingRemote' before
// initialization"). The channel's own tests drive `initializeImageSyncChannel()` explicitly; the real app
// (which imports this store exactly once, after the module graph settles) is unaffected.
if (import.meta.env?.MODE !== 'test') {
  void import('../lib/imageSyncChannel')
    .then((module) => module.initializeImageSyncChannel())
    .catch(() => undefined);
}
