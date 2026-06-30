import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SourceBinLibraryItem } from './sourceBinStore';
import {
  addFrameToPaperPage,
  addFrameToPaperParentPage,
  addPaperPage,
  addPaperParentPage,
  assignPaperParentPage,
  clearPaperFrameLocalOverrides,
  clearPaperFrameStyleLinks,
  createDefaultPaperDocument,
  deletePaperParentPage,
  detachInheritedPaperFrame,
  duplicatePaperPage,
  nextPaperFrameZIndex,
  parsePaperDocument,
  redefinePaperStyleFromFrame,
  removePaperPage,
  serializePaperDocument,
  updatePaperDocumentSetup,
  updatePaperFrame,
} from '../lib/paperDocument';
import type { PaperPoint } from '../lib/paperLayoutTools';
import { alignPaperFrames, distributePaperFrames, type PaperAlignEdge, type PaperDistributeAxis } from '../lib/paperAlignDistribute';
import { findPaperMatches, replaceAllInText, type PaperFindOptions } from '../lib/paperFindChange';
import type { PaperSwatch } from '../lib/paperSwatches';
import {
  applyPaperFrameContextAction,
  applyPaperFrameGroupContextAction,
  applyPaperPageContextAction,
  addPaperPolygonShapeFrame,
  splitPaperPanelFrame,
  nudgePaperFrame,
  placeSourceAssetOnPaperPage,
  type PaperFrameContextActionId,
  type PaperPageContextActionId,
} from '../lib/paperUsabilityActions';
import {
  applyPaperStyleClipboardPayload,
  copyPaperFrameStyle,
  type PaperStyleClipboardPayload,
} from '../lib/paperStyleClipboard';
import {
  buildPaperComicSfxDecalFrame,
  type PaperComicSfxDesign,
  type PaperComicSfxPresetId,
} from '../lib/paperComicSfx';
import {
  applyPaperDocumentNativeChange,
  type PaperDocumentNativeChange,
} from '../lib/paperDocumentNativeSync';
import type {
  PaperDocument,
  PaperDocumentSnapshot,
  PaperBubbleConnectorStyle,
  PaperFrame,
  PaperFramePatch,
  PaperFrameKind,
  PaperGuide,
  PaperPagePreset,
  PaperTool,
} from '../types/paper';

interface PaperState {
  document: PaperDocument;
  selectedPageId: string;
  selectedFrameId: string | null;
  selectedFrameIds: string[];
  tool: PaperTool;
  zoom: number;
  undoStack: PaperHistorySnapshot[];
  redoStack: PaperHistorySnapshot[];
  clipboardFrames: PaperFrame[];
  styleClipboard: PaperStyleClipboardPayload | null;
}

interface PaperActions {
  undo: () => void;
  redo: () => void;
  copySelection: () => void;
  cutSelection: () => void;
  pasteSelection: () => void;
  copySelectedFrameStyle: () => boolean;
  pasteFrameStyleToSelection: () => number;
  deleteSelection: () => void;
  createNewDocument: (options?: { title?: string; preset?: PaperPagePreset; dpi?: number }) => void;
  importDocumentJson: (json: string) => void;
  exportDocumentJson: () => string;
  updateDocumentSetup: (patch: Parameters<typeof updatePaperDocumentSetup>[1]) => void;
  setTool: (tool: PaperTool) => void;
  setZoom: (zoom: number) => void;
  selectPage: (pageId: string) => void;
  selectFrame: (frameId: string | null) => void;
  selectFrameWithMode: (frameId: string | null, mode?: 'replace' | 'add' | 'toggle') => void;
  addPage: () => void;
  addParentPage: (name?: string) => string | undefined;
  deleteParentPage: (parentPageId: string) => void;
  assignParentPage: (pageId: string, parentPageId?: string) => void;
  addFrameToParentPage: (parentPageId: string, kind: PaperFrameKind, patch?: Partial<PaperFrame>) => string | undefined;
  detachInheritedFrame: (pageId: string, inheritedFrameId: string) => void;
  duplicatePage: () => void;
  deletePage: () => void;
  addFrame: (kind: PaperFrameKind, patch?: Partial<PaperFrame>) => string | undefined;
  addFrameToPage: (pageId: string, kind: PaperFrameKind, patch?: Partial<PaperFrame>) => string | undefined;
  addPolygonShapeToPage: (pageId: string, points: PaperPoint[]) => string | undefined;
  splitPanelFrames: (pageId: string, start: PaperPoint, current: PaperPoint) => void;
  updateFrame: (pageId: string, frameId: string, patch: PaperFramePatch) => void;
  updateSelectedFrame: (patch: PaperFramePatch) => void;
  redefineSelectedStyle: (kind: 'paragraph' | 'character' | 'object') => void;
  clearSelectedStyleLinks: () => void;
  clearSelectedStyleOverrides: () => void;
  chainSelectedBubbles: (style?: PaperBubbleConnectorStyle) => void;
  unchainSelectedBubbles: () => void;
  addPaperSwatch: (swatch: PaperSwatch) => void;
  removePaperSwatch: (swatchId: string) => void;
  threadSelectedFrames: () => void;
  unthreadSelectedFrames: () => void;
  alignSelectedFrames: (edge: PaperAlignEdge) => void;
  distributeSelectedFrames: (axis: PaperDistributeAxis) => void;
  replaceAllInPaperText: (query: string, replacement: string, options?: PaperFindOptions) => number;
  addComicSfx: (
    presetId: PaperComicSfxPresetId,
    options?: { pageId?: string; point?: PaperPoint; text?: string; design?: PaperComicSfxDesign },
  ) => string | undefined;
  nudgeSelectedFrame: (deltaXMm: number, deltaYMm: number) => void;
  selectAllFramesOnSelectedPage: () => void;
  deselectFrames: () => void;
  invertFrameSelectionOnSelectedPage: () => void;
  addGuideToPage: (pageId: string, guide: Omit<PaperGuide, 'id'> & { id?: string }) => string | undefined;
  updateGuide: (pageId: string, guideId: string, patch: Partial<Omit<PaperGuide, 'id'>>) => void;
  placeSourceAsset: (item: SourceBinLibraryItem, targetFrameId?: string) => void;
  placeSourceAssetAt: (options: {
    item: SourceBinLibraryItem;
    pageId?: string;
    targetFrameId?: string | null;
    point?: PaperPoint;
  }) => void;
  runFrameContextAction: (pageId: string, frameId: string, actionId: PaperFrameContextActionId) => void;
  runPageContextAction: (
    pageId: string,
    actionId: PaperPageContextActionId,
    options?: { point?: PaperPoint; sourceItem?: SourceBinLibraryItem },
  ) => void;
  toggleViewOption: (option: keyof PaperDocument['view']) => void;
  exportSnapshot: () => PaperDocumentSnapshot;
  restoreSnapshot: (snapshot?: Partial<PaperDocumentSnapshot>) => void;
  /**
   * Apply a remote Paper op from the unified cross-device sync (#52) to the live document, **without
   * pushing undo history or re-broadcasting** (the echo guard lives in `paperSyncChannel`). Reconciles
   * the local selection if a selected frame/page was removed by the op. Returns whether the document
   * actually changed (so a self-echoed op never thrashes).
   */
  applyRemotePaperDocumentChange: (change: PaperDocumentNativeChange) => boolean;
}

const initialDocument = createDefaultPaperDocument({ title: 'Untitled Paper Layout' });
const PAPER_TOOLS: readonly PaperTool[] = ['select', 'hand', 'text', 'image', 'speech', 'thought', 'caption', 'panel', 'shape', 'line', 'ellipse', 'triangle', 'pentagon', 'hexagon', 'eyedropper', 'gutterKnife'];
const MAX_PAPER_HISTORY = 50;

interface PaperHistorySnapshot {
  document: PaperDocument;
  selectedPageId: string;
  selectedFrameId: string | null;
  selectedFrameIds: string[];
  tool: PaperTool;
  zoom: number;
}

export const usePaperStore = create<PaperState & PaperActions>()(
  persist(
    (set, get) => ({
      document: initialDocument,
      selectedPageId: initialDocument.pages[0].id,
      selectedFrameId: null,
      selectedFrameIds: [],
      tool: 'select',
      zoom: 0.8,
      undoStack: [],
      redoStack: [],
      clipboardFrames: [],
      styleClipboard: null,

      undo: () => {
        const state = get();
        const snapshot = state.undoStack.at(-1);
        if (!snapshot) return;
        set({
          ...snapshot,
          undoStack: state.undoStack.slice(0, -1),
          redoStack: [...state.redoStack, createPaperHistorySnapshot(state)].slice(-MAX_PAPER_HISTORY),
        });
      },

      redo: () => {
        const state = get();
        const snapshot = state.redoStack.at(-1);
        if (!snapshot) return;
        set({
          ...snapshot,
          redoStack: state.redoStack.slice(0, -1),
          undoStack: [...state.undoStack, createPaperHistorySnapshot(state)].slice(-MAX_PAPER_HISTORY),
        });
      },

      copySelection: () => {
        const state = get();
        set({ clipboardFrames: getSelectedPaperFrames(state).map(clonePaperFrame) });
      },

      cutSelection: () => {
        const state = get();
        const frames = getSelectedPaperFrames(state).map(clonePaperFrame);
        if (!frames.length) return;
        set({
          ...deletePaperSelectionPatch(state),
          clipboardFrames: frames,
          undoStack: pushPaperHistory(state),
          redoStack: [],
        });
      },

      pasteSelection: () => {
        const state = get();
        if (!state.clipboardFrames.length) return;
        const page = state.document.pages.find((candidate) => candidate.id === state.selectedPageId);
        if (!page) return;
        let nextZIndex = nextPaperFrameZIndex(page.frames);
        const pastedFrames = state.clipboardFrames.map((frame, index) => ({
          ...clonePaperFrame(frame),
          id: makePaperRuntimeId(`frame-paste-${index}`),
          label: frame.label.endsWith(' copy') ? frame.label : `${frame.label} copy`,
          xMm: roundPaperMm(frame.xMm + 4),
          yMm: roundPaperMm(frame.yMm + 4),
          zIndex: nextZIndex++,
          locked: false,
          inherited: false,
          parentFrameId: undefined,
          parentPageId: undefined,
        }));
        const selectedFrameIds = pastedFrames.map((frame) => frame.id);
        set({
          document: {
            ...state.document,
            pages: state.document.pages.map((candidate) =>
              candidate.id === page.id
                ? { ...candidate, frames: [...candidate.frames, ...pastedFrames] }
                : candidate,
            ),
            updatedAt: Date.now(),
          },
          selectedFrameId: selectedFrameIds[0] ?? null,
          selectedFrameIds,
          tool: 'select',
          undoStack: pushPaperHistory(state),
          redoStack: [],
        });
      },

      copySelectedFrameStyle: () => {
        const state = get();
        const page = state.document.pages.find((candidate) => candidate.id === state.selectedPageId);
        const activeFrameId = state.selectedFrameId ?? state.selectedFrameIds[0] ?? null;
        const activeFrame = page?.frames.find((frame) => frame.id === activeFrameId);
        if (!activeFrame) return false;
        set({ styleClipboard: copyPaperFrameStyle(activeFrame) });
        return true;
      },

      pasteFrameStyleToSelection: () => {
        const state = get();
        if (!state.styleClipboard) return 0;
        const selectedFrameIds = getSelectedPaperFrameIds(state);
        if (!selectedFrameIds.length) return 0;

        const patch = applyPaperStyleClipboardPayload(state.styleClipboard);
        let document = state.document;
        let changedCount = 0;
        for (const frameId of selectedFrameIds) {
          const nextDocument = updatePaperFrame(document, state.selectedPageId, frameId, patch);
          if (nextDocument !== document) {
            changedCount += 1;
            document = nextDocument;
          }
        }

        if (!changedCount) return 0;
        set(withPaperHistory(state, { document }));
        return changedCount;
      },

      deleteSelection: () => {
        const state = get();
        const frameIds = getSelectedPaperFrameIds(state);
        if (!frameIds.length) return;
        set({
          ...deletePaperSelectionPatch(state),
          undoStack: pushPaperHistory(state),
          redoStack: [],
        });
      },

      createNewDocument: (options) => {
        const document = createDefaultPaperDocument({
          title: options?.title || 'Untitled Paper Layout',
          preset: options?.preset ?? 'us-letter',
          dpi: options?.dpi,
        });
        set({
          document,
          selectedPageId: document.pages[0].id,
          selectedFrameId: null,
          selectedFrameIds: [],
          tool: 'select',
          zoom: 0.8,
          undoStack: [],
          redoStack: [],
        });
      },

      importDocumentJson: (json) => {
        const document = parsePaperDocument(json);
        set({
          document,
          selectedPageId: document.pages[0]?.id ?? '',
          selectedFrameId: null,
          selectedFrameIds: [],
          undoStack: [],
          redoStack: [],
        });
      },

      exportDocumentJson: () => serializePaperDocument(get().document),

      updateDocumentSetup: (patch) =>
        set((state) => withPaperHistory(state, {
          document: updatePaperDocumentSetup(state.document, patch),
        })),

      setTool: (tool) => set({ tool }),
      setZoom: (zoom) => set({ zoom: Math.max(0.15, Math.min(3, zoom)) }),
      selectPage: (selectedPageId) => set({ selectedPageId, selectedFrameId: null, selectedFrameIds: [] }),
      selectFrame: (selectedFrameId) => set({ selectedFrameId, selectedFrameIds: selectedFrameId ? [selectedFrameId] : [] }),
      selectFrameWithMode: (frameId, mode = 'replace') =>
        set((state) => {
          if (!frameId || mode === 'replace') {
            return { selectedFrameId: frameId, selectedFrameIds: frameId ? [frameId] : [] };
          }

          const existing = state.selectedFrameIds;
          if (mode === 'add') {
            const selectedFrameIds = existing.includes(frameId) ? existing : [...existing, frameId];
            return { selectedFrameId: frameId, selectedFrameIds };
          }

          const selectedFrameIds = existing.includes(frameId)
            ? existing.filter((selectedId) => selectedId !== frameId)
            : [...existing, frameId];
          return {
            selectedFrameId: selectedFrameIds.includes(frameId)
              ? frameId
              : selectedFrameIds[selectedFrameIds.length - 1] ?? null,
            selectedFrameIds,
          };
        }),

      addPage: () =>
        set((state) => {
          const document = addPaperPage(state.document);
          return withPaperHistory(state, {
            document,
            selectedPageId: document.pages[document.pages.length - 1].id,
            selectedFrameId: null,
            selectedFrameIds: [],
          });
        }),

      addParentPage: (name) => {
        const state = get();
        const document = addPaperParentPage(state.document, name);
        const parentId = document.parentPages[document.parentPages.length - 1]?.id;
        set(withPaperHistory(state, { document }));
        return parentId;
      },

      deleteParentPage: (parentPageId) =>
        set((state) => withPaperHistory(state, { document: deletePaperParentPage(state.document, parentPageId) })),

      assignParentPage: (pageId, parentPageId) =>
        set((state) => withPaperHistory(state, { document: assignPaperParentPage(state.document, pageId, parentPageId) })),

      addFrameToParentPage: (parentPageId, kind, patch) => {
        const state = get();
        const { document, frameId } = addFrameToPaperParentPage(state.document, parentPageId, {
          kind,
          xMm: patch?.xMm ?? 12,
          yMm: patch?.yMm ?? 12,
          widthMm: patch?.widthMm ?? defaultFrameWidth(kind),
          heightMm: patch?.heightMm ?? defaultFrameHeight(kind),
          ...patch,
        });
        set(withPaperHistory(state, { document }));
        return frameId;
      },

      detachInheritedFrame: (pageId, inheritedFrameId) =>
        set((state) => {
          const result = detachInheritedPaperFrame(state.document, pageId, inheritedFrameId);
          return withPaperHistory(state, {
            document: result.document,
            selectedPageId: pageId,
            selectedFrameId: result.frameId ?? state.selectedFrameId,
            selectedFrameIds: result.frameId ? [result.frameId] : state.selectedFrameIds,
          });
        }),

      duplicatePage: () =>
        set((state) => {
          const document = duplicatePaperPage(state.document, state.selectedPageId);
          return withPaperHistory(state, {
            document,
            selectedPageId: document.pages[document.pages.length - 1].id,
            selectedFrameId: null,
            selectedFrameIds: [],
          });
        }),

      deletePage: () =>
        set((state) => {
          const document = removePaperPage(state.document, state.selectedPageId);
          return withPaperHistory(state, {
            document,
            selectedPageId: document.pages[Math.min(document.pages.length - 1, 0)]?.id ?? '',
            selectedFrameId: null,
            selectedFrameIds: [],
          });
        }),

      addFrame: (kind, patch) => {
        const state = get();
        const pageId = state.selectedPageId || state.document.pages[0]?.id;
        if (!pageId) return undefined;
        return state.addFrameToPage(pageId, kind, patch);
      },

      addFrameToPage: (pageId, kind, patch) => {
        const state = get();
        const { document, frameId } = addFrameToPaperPage(state.document, pageId, {
          kind,
          xMm: patch?.xMm ?? 24,
          yMm: patch?.yMm ?? 24,
          widthMm: patch?.widthMm ?? defaultFrameWidth(kind),
          heightMm: patch?.heightMm ?? defaultFrameHeight(kind),
          ...patch,
        });
        set(withPaperHistory(state, { document, selectedPageId: pageId, selectedFrameId: frameId, selectedFrameIds: [frameId], tool: 'select' }));
        return frameId;
      },

      addPolygonShapeToPage: (pageId, points) => {
        const state = get();
        const result = addPaperPolygonShapeFrame(state.document, pageId, points);
        if (!result.selectedFrameId) return undefined;
        set(withPaperHistory(state, {
          document: result.document,
          selectedPageId: result.selectedPageId ?? pageId,
          selectedFrameId: result.selectedFrameId,
          selectedFrameIds: result.selectedFrameId ? [result.selectedFrameId] : [],
          tool: 'select',
        }));
        return result.selectedFrameId;
      },

      splitPanelFrames: (pageId, start, current) => {
        const state = get();
        const result = splitPaperPanelFrame(state.document, pageId, start, current);
        if (result.document === state.document) return;
        set(withPaperHistory(state, {
          document: result.document,
          selectedPageId: result.selectedPageId ?? pageId,
          selectedFrameId: result.selectedFrameId ?? null,
          selectedFrameIds: result.selectedFrameId ? [result.selectedFrameId] : [],
        }));
      },

      updateFrame: (pageId, frameId, patch) =>
        set((state) => {
          const document = updatePaperFrame(state.document, pageId, frameId, patch);
          if (document === state.document) return state;
          return withPaperHistory(state, { document });
        }),

      updateSelectedFrame: (patch) => {
        const state = get();
        if (!state.selectedFrameId) return;
        const document = updatePaperFrame(
          state.document,
          state.selectedPageId,
          state.selectedFrameId,
          patch,
        );
        if (document === state.document) return;
        set(withPaperHistory(state, { document }));
      },

      redefineSelectedStyle: (kind) => {
        const state = get();
        const page = state.document.pages.find((candidate) => candidate.id === state.selectedPageId);
        const frame = page?.frames.find((candidate) => candidate.id === state.selectedFrameId);
        if (!frame) return;
        set(withPaperHistory(state, { document: redefinePaperStyleFromFrame(state.document, frame, kind) }));
      },

      clearSelectedStyleLinks: () => {
        const state = get();
        if (!state.selectedFrameId) return;
        set(withPaperHistory(state, { document: clearPaperFrameStyleLinks(state.document, state.selectedPageId, state.selectedFrameId) }));
      },

      clearSelectedStyleOverrides: () => {
        const state = get();
        if (!state.selectedFrameId) return;
        set(withPaperHistory(state, { document: clearPaperFrameLocalOverrides(state.document, state.selectedPageId, state.selectedFrameId) }));
      },

      chainSelectedBubbles: (style = 'line') =>
        set((state) => {
          const patch = chainSelectedPaperBubblesPatch(state, style);
          return patch ? withPaperHistory(state, patch) : state;
        }),

      unchainSelectedBubbles: () =>
        set((state) => {
          const patch = unchainSelectedPaperBubblesPatch(state);
          return patch ? withPaperHistory(state, patch) : state;
        }),

      addPaperSwatch: (swatch) =>
        set((state) => withPaperHistory(state, {
          document: { ...state.document, swatches: [...(state.document.swatches ?? []), swatch] },
        })),

      removePaperSwatch: (swatchId) =>
        set((state) => withPaperHistory(state, {
          document: { ...state.document, swatches: (state.document.swatches ?? []).filter((swatch) => swatch.id !== swatchId) },
        })),

      threadSelectedFrames: () =>
        set((state) => {
          const patch = threadSelectedPaperFramesPatch(state);
          return patch ? withPaperHistory(state, patch) : state;
        }),

      unthreadSelectedFrames: () =>
        set((state) => {
          const patch = unthreadSelectedPaperFramesPatch(state);
          return patch ? withPaperHistory(state, patch) : state;
        }),

      alignSelectedFrames: (edge) =>
        set((state) => {
          const patch = arrangeSelectedPaperFramesPatch(state, (frames) => alignPaperFrames(frames, edge));
          return patch ? withPaperHistory(state, patch) : state;
        }),

      distributeSelectedFrames: (axis) =>
        set((state) => {
          const patch = arrangeSelectedPaperFramesPatch(state, (frames) => distributePaperFrames(frames, axis));
          return patch ? withPaperHistory(state, patch) : state;
        }),

      replaceAllInPaperText: (query, replacement, options = {}) => {
        const state = get();
        const { patch, count } = replaceAllInPaperTextPatch(state, query, replacement, options);
        if (patch) set(withPaperHistory(state, patch));
        return count;
      },

      addComicSfx: (presetId, options) => {
        const state = get();
        const pageId = options?.pageId || state.selectedPageId || state.document.pages[0]?.id;
        const page = state.document.pages.find((candidate) => candidate.id === pageId);
        if (!page) return undefined;
        const origin = options?.point ?? {
          xMm: 20 + (page.frames.length % 4) * 8,
          yMm: 24 + (page.frames.length % 5) * 6,
        };
        const result = buildPaperComicSfxDecalFrame({
          presetId,
          origin,
          text: options?.text,
          design: options?.design,
          zIndexStart: nextPaperFrameZIndex(page.frames),
        });
        const document = addFrameToPaperPage(state.document, pageId, result.frame).document;

        set(withPaperHistory(state, {
          document,
          selectedPageId: pageId,
          selectedFrameId: result.primaryFrameId,
          selectedFrameIds: result.selectedFrameIds,
          tool: 'select',
        }));
        return result.primaryFrameId;
      },

      nudgeSelectedFrame: (deltaXMm, deltaYMm) => {
        const state = get();
        const frameIds = state.selectedFrameIds.length ? state.selectedFrameIds : state.selectedFrameId ? [state.selectedFrameId] : [];
        if (!frameIds.length) return;
        let document = state.document;
        let selectedPageId = state.selectedPageId;
        for (const frameId of frameIds) {
          const result = nudgePaperFrame(
            document,
            selectedPageId,
            frameId,
            deltaXMm,
            deltaYMm,
          );
          document = result.document;
          selectedPageId = result.selectedPageId ?? selectedPageId;
        }
        set(withPaperHistory(state, {
          document,
          selectedPageId,
          selectedFrameId: state.selectedFrameId,
          selectedFrameIds: frameIds,
        }));
      },

      selectAllFramesOnSelectedPage: () =>
        set((state) => {
          const page = state.document.pages.find((candidate) => candidate.id === state.selectedPageId);
          const selectedFrameIds = page?.frames.map((frame) => frame.id) ?? [];
          return { selectedFrameId: selectedFrameIds[0] ?? null, selectedFrameIds };
        }),

      deselectFrames: () => set({ selectedFrameId: null, selectedFrameIds: [] }),

      invertFrameSelectionOnSelectedPage: () =>
        set((state) => {
          const page = state.document.pages.find((candidate) => candidate.id === state.selectedPageId);
          if (!page?.frames.length) return { selectedFrameId: null };
          const selected = new Set(state.selectedFrameIds);
          const selectedFrameIds = page.frames
            .map((frame) => frame.id)
            .filter((frameId) => !selected.has(frameId));
          return { selectedFrameId: selectedFrameIds[0] ?? null, selectedFrameIds };
        }),

      addGuideToPage: (pageId, guide) => {
        const guideId = guide.id ?? `guide-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`;
        set((state) => withPaperHistory(state, {
          document: {
            ...state.document,
            view: {
              ...state.document.view,
              showGuides: true,
            },
            pages: state.document.pages.map((page) =>
              page.id === pageId
                ? {
                    ...page,
                    guides: [
                      ...page.guides,
                      {
                        ...guide,
                        id: guideId,
                        positionMm: Math.max(0, guide.positionMm),
                      },
                    ],
                  }
                : page,
            ),
            updatedAt: Date.now(),
          },
          selectedPageId: pageId,
        }));
        return guideId;
      },

      updateGuide: (pageId, guideId, patch) =>
        set((state) => withPaperHistory(state, {
          document: {
            ...state.document,
            pages: state.document.pages.map((page) =>
              page.id === pageId
                ? {
                    ...page,
                    guides: page.guides.map((guide) =>
                      guide.id === guideId
                        ? { ...guide, ...patch }
                        : guide,
                    ),
                  }
                : page,
            ),
            updatedAt: Date.now(),
          },
        })),

      placeSourceAsset: (item, targetFrameId) => {
        const state = get();
        const page = state.document.pages.find((candidate) => candidate.id === state.selectedPageId);
        if (!page) return;
        get().placeSourceAssetAt({
          item,
          pageId: page.id,
          targetFrameId: targetFrameId ?? state.selectedFrameId,
          point: targetFrameId || state.selectedFrameId
            ? undefined
            : { xMm: 24, yMm: 24 + page.frames.length * 8 },
        });
      },

      placeSourceAssetAt: ({ item, pageId, targetFrameId, point }) =>
        set((state) => {
          const resolvedPageId = pageId || state.selectedPageId || state.document.pages[0]?.id;
          if (!resolvedPageId) return state;
          const result = placeSourceAssetOnPaperPage(state.document, {
            pageId: resolvedPageId,
            frameId: targetFrameId,
            item,
            point,
          });
          return withPaperHistory(state, {
            document: result.document,
            selectedPageId: result.selectedPageId ?? resolvedPageId,
            selectedFrameId: result.selectedFrameId ?? null,
            selectedFrameIds: result.selectedFrameId ? [result.selectedFrameId] : [],
            tool: 'select',
          });
        }),

      runFrameContextAction: (pageId, frameId, actionId) =>
        set((state) => {
          const activeSelection = state.selectedFrameIds.includes(frameId) && state.selectedFrameIds.length > 1
            ? state.selectedFrameIds
            : [frameId];
          const result = activeSelection.length > 1
            ? applyPaperFrameGroupContextAction(state.document, pageId, activeSelection, actionId)
            : applyPaperFrameContextAction(state.document, pageId, frameId, actionId);
          return withPaperHistory(state, {
            document: result.document,
            selectedPageId: result.selectedPageId ?? pageId,
            selectedFrameId: result.selectedFrameId === undefined ? frameId : result.selectedFrameId,
            selectedFrameIds: activeSelection.length > 1 && result.selectedFrameId
              ? activeSelection.filter((selectedId) =>
                result.document.pages
                  .find((page) => page.id === (result.selectedPageId ?? pageId))
                  ?.frames.some((candidate) => candidate.id === selectedId),
              )
              : result.selectedFrameId === undefined
                ? [frameId]
                : result.selectedFrameId
                  ? [result.selectedFrameId]
                : [],
            tool: 'select',
          });
        }),

      runPageContextAction: (pageId, actionId, options) =>
        set((state) => {
          const result = applyPaperPageContextAction(state.document, pageId, actionId, options);
          return withPaperHistory(state, {
            document: result.document,
            selectedPageId: result.selectedPageId ?? pageId,
            selectedFrameId: result.selectedFrameId ?? null,
            selectedFrameIds: result.selectedFrameId ? [result.selectedFrameId] : [],
            tool: 'select',
          });
        }),

      toggleViewOption: (option) =>
        set((state) => withPaperHistory(state, {
          document: {
            ...state.document,
            view: {
              ...state.document.view,
              [option]: !state.document.view[option],
            },
            updatedAt: Date.now(),
          },
        })),

      exportSnapshot: () => {
        const state = get();
        return {
          document: state.document,
          selectedPageId: state.selectedPageId,
          selectedFrameId: state.selectedFrameId ?? undefined,
          selectedFrameIds: state.selectedFrameIds,
          tool: state.tool,
          zoom: state.zoom,
        };
      },

      restoreSnapshot: (snapshot) => {
        set({
          ...sanitizePaperSnapshot(snapshot),
          undoStack: [],
          redoStack: [],
          clipboardFrames: get().clipboardFrames,
          styleClipboard: get().styleClipboard,
        });
      },

      applyRemotePaperDocumentChange: (change) => {
        let changed = false;
        set((state) => {
          const nextDocument = applyPaperDocumentNativeChange(state.document, change);
          if (nextDocument === state.document) return {};
          changed = true;
          return { document: nextDocument, ...reconcilePaperSelection(state, nextDocument) };
        });
        return changed;
      },
    }),
    {
      name: 'signal-loom-paper-workspace',
      partialize: (state) => ({
        document: state.document,
        selectedPageId: state.selectedPageId,
        selectedFrameId: state.selectedFrameId,
        selectedFrameIds: state.selectedFrameIds,
        tool: state.tool,
        zoom: state.zoom,
      }),
      merge: (persisted, current) => ({
        ...current,
        ...sanitizePaperSnapshot(persisted),
      }),
    },
  ),
);

function sanitizePaperSnapshot(snapshot: unknown): PaperState {
  const input = isRecord(snapshot) ? snapshot : {};
  const document = sanitizePaperDocument(input.document);
  const selectedPageId = typeof input.selectedPageId === 'string' && document.pages.some((page) => page.id === input.selectedPageId)
    ? input.selectedPageId
    : document.pages[0]?.id ?? '';
  const selectedPage = document.pages.find((page) => page.id === selectedPageId);
  const selectedFrameId = typeof input.selectedFrameId === 'string' && selectedPage?.frames.some((frame) => frame.id === input.selectedFrameId)
    ? input.selectedFrameId
    : null;
  const validFrameIds = new Set(selectedPage?.frames.map((frame) => frame.id) ?? []);
  const selectedFrameIds = Array.isArray(input.selectedFrameIds)
    ? input.selectedFrameIds.filter((frameId): frameId is string => typeof frameId === 'string' && validFrameIds.has(frameId))
    : selectedFrameId
      ? [selectedFrameId]
      : [];
  return {
    document,
    selectedPageId,
    selectedFrameId: selectedFrameId ?? selectedFrameIds[0] ?? null,
    selectedFrameIds,
    tool: isPaperTool(input.tool) ? input.tool : 'select',
    zoom: clampZoom(input.zoom),
    undoStack: [],
    redoStack: [],
    clipboardFrames: [],
    styleClipboard: null,
  };
}

function createPaperHistorySnapshot(state: PaperState): PaperHistorySnapshot {
  return {
    document: state.document,
    selectedPageId: state.selectedPageId,
    selectedFrameId: state.selectedFrameId,
    selectedFrameIds: state.selectedFrameIds,
    tool: state.tool,
    zoom: state.zoom,
  };
}

function pushPaperHistory(state: PaperState): PaperHistorySnapshot[] {
  return [...state.undoStack, createPaperHistorySnapshot(state)].slice(-MAX_PAPER_HISTORY);
}

function withPaperHistory<TPatch extends Partial<PaperState>>(state: PaperState, patch: TPatch): TPatch & Pick<PaperState, 'undoStack' | 'redoStack'> {
  return {
    ...patch,
    undoStack: pushPaperHistory(state),
    redoStack: [],
  };
}

/**
 * After a remote op replaces the document, keep the local selection valid: fall back to the first page
 * if the selected page vanished, and drop any selected frame ids that no longer exist on the selected
 * page. View state (tool/zoom) is intentionally left alone — each client keeps its own viewport.
 */
function reconcilePaperSelection(
  state: PaperState,
  document: PaperDocument,
): Pick<PaperState, 'selectedPageId' | 'selectedFrameId' | 'selectedFrameIds'> {
  const pageExists = document.pages.some((page) => page.id === state.selectedPageId);
  const selectedPageId = pageExists ? state.selectedPageId : document.pages[0]?.id ?? state.selectedPageId;
  const page = document.pages.find((candidate) => candidate.id === selectedPageId);
  const validFrameIds = new Set(page?.frames.map((frame) => frame.id) ?? []);
  const selectedFrameId =
    state.selectedFrameId && validFrameIds.has(state.selectedFrameId) ? state.selectedFrameId : null;
  const selectedFrameIds = state.selectedFrameIds.filter((frameId) => validFrameIds.has(frameId));
  return { selectedPageId, selectedFrameId, selectedFrameIds };
}

function getSelectedPaperFrameIds(state: PaperState): string[] {
  const page = state.document.pages.find((candidate) => candidate.id === state.selectedPageId);
  if (!page) return [];
  const validIds = new Set(page.frames.map((frame) => frame.id));
  const selectedIds = state.selectedFrameIds.length
    ? state.selectedFrameIds
    : state.selectedFrameId
      ? [state.selectedFrameId]
      : [];
  return selectedIds.filter((frameId) => validIds.has(frameId));
}

function getSelectedPaperFrames(state: PaperState): PaperFrame[] {
  const page = state.document.pages.find((candidate) => candidate.id === state.selectedPageId);
  if (!page) return [];
  const selectedIds = new Set(getSelectedPaperFrameIds(state));
  return page.frames.filter((frame) => selectedIds.has(frame.id));
}

function deletePaperSelectionPatch(state: PaperState): Pick<PaperState, 'document' | 'selectedFrameId' | 'selectedFrameIds'> {
  const selectedIds = new Set(getSelectedPaperFrameIds(state));
  if (!selectedIds.size) {
    return {
      document: state.document,
      selectedFrameId: state.selectedFrameId,
      selectedFrameIds: state.selectedFrameIds,
    };
  }

  return {
    document: {
      ...state.document,
      pages: state.document.pages.map((page) =>
        page.id === state.selectedPageId
          ? { ...page, frames: page.frames.filter((frame) => !selectedIds.has(frame.id)) }
          : page,
      ),
      updatedAt: Date.now(),
    },
    selectedFrameId: null,
    selectedFrameIds: [],
  };
}

function replaceAllInPaperTextPatch(
  state: PaperState,
  query: string,
  replacement: string,
  options: PaperFindOptions,
): { patch?: Pick<PaperState, 'document'>; count: number } {
  const refs = state.document.pages.flatMap((page) =>
    page.frames.filter((frame) => frame.kind === 'text').map((frame) => ({ pageId: page.id, frameId: frame.id, text: frame.text ?? '' })));
  const count = findPaperMatches(refs, query, options).length;
  if (count === 0) return { count: 0 };

  const document = {
    ...state.document,
    pages: state.document.pages.map((page) => ({
      ...page,
      frames: page.frames.map((frame) => (frame.kind === 'text' && frame.text
        ? { ...frame, text: replaceAllInText(frame.text, query, replacement, options) }
        : frame)),
    })),
    updatedAt: Date.now(),
  };
  return { patch: { document }, count };
}

function arrangeSelectedPaperFramesPatch(
  state: PaperState,
  compute: (frames: { id: string; xMm: number; yMm: number; widthMm: number; heightMm: number }[]) => Map<string, { xMm?: number; yMm?: number }>,
): Pick<PaperState, 'document'> | undefined {
  const page = state.document.pages.find((candidate) => candidate.id === state.selectedPageId);
  if (!page) return undefined;
  const selectedIds = new Set(getSelectedPaperFrameIds(state));
  const selected = page.frames.filter((frame) => selectedIds.has(frame.id) && !frame.locked && !frame.inherited);
  const patches = compute(selected.map((frame) => ({ id: frame.id, xMm: frame.xMm, yMm: frame.yMm, widthMm: frame.widthMm, heightMm: frame.heightMm })));
  if (patches.size === 0) return undefined;

  const document = {
    ...state.document,
    pages: state.document.pages.map((candidate) => candidate.id === page.id
      ? { ...candidate, frames: candidate.frames.map((frame) => patches.has(frame.id) ? { ...frame, ...patches.get(frame.id) } : frame) }
      : candidate),
    updatedAt: Date.now(),
  };
  return { document };
}

function threadSelectedPaperFramesPatch(state: PaperState): Pick<PaperState, 'document'> | undefined {
  const page = state.document.pages.find((candidate) => candidate.id === state.selectedPageId);
  if (!page) return undefined;
  const selectedOrder = getSelectedPaperFrameIds(state);
  const selectedOrderIndex = new Map(selectedOrder.map((frameId, index) => [frameId, index]));
  const selectedTextFrames = page.frames
    .filter((frame) => selectedOrderIndex.has(frame.id) && frame.kind === 'text')
    .sort((a, b) => selectedOrderIndex.get(a.id)! - selectedOrderIndex.get(b.id)!);

  if (selectedTextFrames.length < 2) return undefined;

  const threadId = makePaperRuntimeId('text-thread');
  const order = new Map(selectedTextFrames.map((frame, index) => [frame.id, index + 1]));
  const document = {
    ...state.document,
    pages: state.document.pages.map((candidate) => candidate.id === page.id
      ? {
          ...candidate,
          frames: candidate.frames.map((frame) => order.has(frame.id)
            ? { ...frame, threadId, threadOrder: order.get(frame.id)! }
            : frame),
        }
      : candidate),
    updatedAt: Date.now(),
  };
  return { document };
}

function unthreadSelectedPaperFramesPatch(state: PaperState): Pick<PaperState, 'document'> | undefined {
  const page = state.document.pages.find((candidate) => candidate.id === state.selectedPageId);
  if (!page) return undefined;
  const selectedIds = new Set(getSelectedPaperFrameIds(state));
  if (!page.frames.some((frame) => selectedIds.has(frame.id) && Boolean(frame.threadId))) return undefined;

  const document = {
    ...state.document,
    pages: state.document.pages.map((candidate) => candidate.id === page.id
      ? {
          ...candidate,
          frames: candidate.frames.map((frame) => selectedIds.has(frame.id) && frame.threadId
            ? { ...frame, threadId: undefined, threadOrder: undefined }
            : frame),
        }
      : candidate),
    updatedAt: Date.now(),
  };
  return { document };
}

function chainSelectedPaperBubblesPatch(
  state: PaperState,
  style: PaperBubbleConnectorStyle,
): Pick<PaperState, 'document'> | undefined {
  const page = state.document.pages.find((candidate) => candidate.id === state.selectedPageId);
  if (!page) return undefined;
  const selectedOrder = getSelectedPaperFrameIds(state);
  const selectedOrderIndex = new Map(selectedOrder.map((frameId, index) => [frameId, index]));
  const selectedBubbles = page.frames
    .filter((frame) => selectedOrderIndex.has(frame.id) && isPaperBubbleFrame(frame))
    .sort((a, b) => selectedOrderIndex.get(a.id)! - selectedOrderIndex.get(b.id)!);

  if (selectedBubbles.length < 2) return undefined;

  const chainId = makePaperRuntimeId('bubble-chain');
  const frameIds = new Set(selectedBubbles.map((frame) => frame.id));
  const document = {
    ...state.document,
    pages: state.document.pages.map((candidate) => candidate.id === page.id
      ? {
          ...candidate,
          frames: candidate.frames.map((frame) => frameIds.has(frame.id)
            ? {
                ...frame,
                bubbleChainId: chainId,
                bubbleChainOrder: selectedOrderIndex.get(frame.id)! + 1,
                bubbleConnectorStyle: style,
                bubbleConnectorAnchor: frame.bubbleConnectorAnchor ?? 'auto',
              }
            : frame),
        }
      : candidate),
    updatedAt: Date.now(),
  };

  return { document };
}

function unchainSelectedPaperBubblesPatch(state: PaperState): Pick<PaperState, 'document'> | undefined {
  const page = state.document.pages.find((candidate) => candidate.id === state.selectedPageId);
  if (!page) return undefined;
  const selectedIds = new Set(getSelectedPaperFrameIds(state));
  if (!selectedIds.size) return undefined;
  let changed = false;

  const document = {
    ...state.document,
    pages: state.document.pages.map((candidate) => candidate.id === page.id
      ? {
          ...candidate,
          frames: candidate.frames.map((frame) => {
            if (!selectedIds.has(frame.id) || !isPaperBubbleFrame(frame)) return frame;
            if (
              frame.bubbleChainId === undefined &&
              frame.bubbleChainOrder === undefined &&
              frame.bubbleConnectorStyle === undefined &&
              frame.bubbleConnectorAnchor === undefined
            ) {
              return frame;
            }
            changed = true;
            return {
              ...frame,
              bubbleChainId: undefined,
              bubbleChainOrder: undefined,
              bubbleConnectorStyle: undefined,
              bubbleConnectorAnchor: undefined,
            };
          }),
        }
      : candidate),
    updatedAt: Date.now(),
  };

  return changed ? { document } : undefined;
}

function isPaperBubbleFrame(frame: PaperFrame): boolean {
  return frame.kind === 'speechBubble' || frame.kind === 'thoughtBubble';
}

function clonePaperFrame(frame: PaperFrame): PaperFrame {
  return structuredCloneAvailable()
    ? globalThis.structuredClone(frame)
    : JSON.parse(JSON.stringify(frame)) as PaperFrame;
}

function structuredCloneAvailable(): boolean {
  return typeof globalThis.structuredClone === 'function';
}

function makePaperRuntimeId(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.floor(Math.random() * 1000)}`}`;
}

function roundPaperMm(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function sanitizePaperDocument(value: unknown): PaperDocument {
  if (!isRecord(value)) return initialDocument;
  try {
    return parsePaperDocument(JSON.stringify(value));
  } catch {
    return initialDocument;
  }
}

function clampZoom(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0.15, Math.min(3, value)) : 0.8;
}

function isPaperTool(value: unknown): value is PaperTool {
  return typeof value === 'string' && PAPER_TOOLS.includes(value as PaperTool);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function defaultFrameWidth(kind: PaperFrameKind): number {
  if (kind === 'caption') return 72;
  if (kind === 'speechBubble' || kind === 'thoughtBubble') return 58;
  if (kind === 'shape') return 48;
  if (kind === 'document') return 96;
  return 84;
}

// Register the Paper workspace on the unified cross-device sync (#52) lazily when this store loads, so
// channel-init is tied to the Paper workspace being present with zero app-startup cost. Mirrors flowStore.
// Skipped under the test runner so a unit test importing this store can't spawn a floating channel-init
// side-effect that races vitest's multi-file module evaluation; the channel's own tests init explicitly.
if (import.meta.env?.MODE !== 'test') {
  void import('../lib/paperSyncChannel')
    .then((module) => module.initializePaperSyncChannel())
    .catch(() => undefined);
}

function defaultFrameHeight(kind: PaperFrameKind): number {
  if (kind === 'caption') return 22;
  if (kind === 'speechBubble' || kind === 'thoughtBubble') return 34;
  if (kind === 'shape') return 48;
  if (kind === 'document') return 110;
  return kind === 'text' ? 58 : 62;
}
