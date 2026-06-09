import { create } from 'zustand';
import {
  DEFAULT_BRUSH_SETTINGS,
  DEFAULT_SELECTION_TOOL_SETTINGS,
  DEFAULT_TEXT_TOOL_SETTINGS,
  DEFAULT_VIEWPORT,
  type BrushSettings,
  type DocumentViewport,
  type EditorOperation,
  type EditorTool,
  type ImageDocument,
  type ImageDocumentSnapshot,
  type ImageLayer,
  type SelectionToolSettings,
  type TextLayerStyle,
} from '../types/imageEditor';
import { normalizeBrushSettings } from '../components/ImageEditor/ImageBrushEngine';
import { cloneBitmap } from '../components/ImageEditor/LayerBitmap';
import {
  resizeImageCanvas,
  resizeImageDocumentPixels,
  type CanvasResizeAnchor,
} from '../components/ImageEditor/ImageDocumentGeometry';
import { sanitizeImageEditorSnapshot } from '../lib/projectValidation';
import { rasterizeSvgToBitmapAtResolution } from '../components/ImageEditor/ImageFileFormats';

const MAX_HISTORY = 50;

interface ImageEditorState {
  documents: ImageDocument[];
  activeDocId: string | null;
  tool: EditorTool;
  brushSettings: BrushSettings;
  selectionToolSettings: SelectionToolSettings;
  textToolSettings: TextLayerStyle;
  viewportContainerSize: { width: number; height: number };
  undoStacks: Record<string, EditorOperation[]>;
  redoStacks: Record<string, EditorOperation[]>;
  isDraggingSlider: boolean;
}

export interface ImageEditorProjectSnapshot {
  documents: ImageDocument[];
  activeDocId: string | null;
}

interface ImageEditorActions {
  openDocument: (doc: ImageDocument) => void;
  closeDocument: (id: string) => void;
  setActiveDocument: (id: string) => void;
  setDocumentTitle: (id: string, title: string) => void;
  setLayers: (docId: string, layers: ImageLayer[], activeLayerId?: string | null) => void;
  setDocumentDimensions: (id: string, width: number, height: number) => void;
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
  setBrushSettings: (patch: Partial<BrushSettings>) => void;
  setSelectionToolSettings: (patch: Partial<SelectionToolSettings>) => void;
  setTextToolSettings: (patch: Partial<TextLayerStyle>) => void;
  setViewportContainerSize: (size: { width: number; height: number }) => void;
  setViewport: (id: string, patch: Partial<DocumentViewport>) => void;
  setHasSelection: (id: string, hasSelection: boolean) => void;
  bumpSelectionVersion: (id: string) => void;
  addLayer: (docId: string, layer: ImageLayer, index?: number) => void;
  removeLayer: (docId: string, layerId: string) => void;
  duplicateLayer: (docId: string, layerId: string) => void;
  updateLayer: (docId: string, layerId: string, patch: Partial<ImageLayer>) => void;
  bumpLayerBitmapVersion: (docId: string, layerId: string) => void;
  reorderLayer: (docId: string, layerId: string, newIndex: number) => void;
  setActiveLayer: (docId: string, layerId: string | null) => void;
  pushOperation: (op: EditorOperation) => void;
  popUndo: (docId: string) => EditorOperation | undefined;
  popRedo: (docId: string) => EditorOperation | undefined;
  clearHistory: (docId: string) => void;
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
    brushSettings: { ...DEFAULT_BRUSH_SETTINGS },
    selectionToolSettings: { ...DEFAULT_SELECTION_TOOL_SETTINGS },
    textToolSettings: { ...DEFAULT_TEXT_TOOL_SETTINGS },
    viewportContainerSize: { width: 0, height: 0 },
    undoStacks: {},
    redoStacks: {},
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
            ? {
                ...d,
                layers,
                activeLayerId: activeLayerId !== undefined ? activeLayerId : (layers.some((l) => l.id === d.activeLayerId) ? d.activeLayerId : (layers[layers.length - 1]?.id ?? null)),
                dirty: true,
              }
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
        delete undoStacks[id];
        delete redoStacks[id];
        return { documents: docs, activeDocId, undoStacks, redoStacks };
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

    setBrushSettings: (patch) =>
      set((state) => {
        const brushSettings = normalizeBrushSettings({ ...state.brushSettings, ...patch });
        return hasShallowPatchChange(state.brushSettings, brushSettings)
          ? { brushSettings }
          : state;
      }),

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
      set((state) => ({
        documents: state.documents.map((d) =>
          d.id === id
            ? {
                ...d,
                hasSelection,
                selectionVersion: d.selectionVersion + 1,
              }
            : d,
        ),
      })),

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
          return { ...d, layers, activeLayerId, dirty: true };
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
          return { ...d, layers, activeLayerId: copy.id, dirty: true };
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
            if (!bitmapChanged && !hasShallowPatchChange(l, patch)) return l;
            layerChanged = true;
            return {
              ...l,
              ...patch,
              bitmapVersion: bitmapChanged ? l.bitmapVersion + 1 : (patch.bitmapVersion ?? l.bitmapVersion),
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
          return { ...d, activeLayerId: layerId };
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
    hasSelection: false,
    selectionVersion: 0,
    viewport: { ...DEFAULT_VIEWPORT },
    dirty: false,
    sourceBinItemId: params.sourceBinItemId,
    snapshots: [],
  };
}

function hasShallowPatchChange<T extends object>(current: T, patch: Partial<T>): boolean {
  return Object.entries(patch).some(([key, value]) => !Object.is(current[key as keyof T], value));
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

function cloneSerializableValue<T>(value: T): T {
  if (value === undefined || value === null) return value;
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as T;
}
