import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  RefObject,
} from 'react';
import { Check, Pencil, X } from 'lucide-react';
import { useImageEditorStore } from '../../store/imageEditorStore';
import { useSourceBinStore } from '../../store/sourceBinStore';
import { useTouchNavigationStore } from '../../store/touchNavigationStore';
import { canMoveImageLayer } from '../../lib/imageLayerLocks';
import { shouldRouteImagePointerToTouchNavigation } from '../../lib/imageTouchNavigation';
import { usePaperTouchNavigationAvailabilityDescriptor } from '../../lib/paperTouchNavigation';
import { CompositeRenderer } from './CompositeRenderer';
import { bitmapFromUrl, cloneBitmap, createBitmap } from './LayerBitmap';
import { docToScreen, fitToContainer, screenToDoc, zoomAround, type Point } from './viewport';
import { ImageEditorRulers } from './ImageEditorRulers';
import { snapGuidePosition } from './ImageRulersGuides';
import { CanvasViewportGesture } from './imageCanvasGestures';
import { getSelection } from './selectionRegistry';
import { useToolDispatcher } from './tools/dispatcher';
import type { EditorTool, ImageDocument, ImageLayer, ImageVectorPathPoint, LayerBitmap } from '../../types/imageEditor';
import {
  getImageTextEditOverlayBounds,
  imageTextLayerContainsPoint,
} from './ImageTextPresets';
import { updateTextLayerFromStyle } from './ImageTextLayer';
import {
  calculateLayerPerspectiveValue,
  calculateLayerSkewDeg,
  calculateLayerWarpValue,
  calculateLayerRotationDeg,
  getImageLayerIntrinsicSize,
  getImageLayerTransformBounds,
  getImageLayerTransformHandlePoints,
  getImageLayerTransformRotateHandlePoint,
  getImageLayerTransformScreenBorderPoints,
  getImageLayerTransformScreenCorners,
  getImageLayerTransformShape,
  moveLayerDistortCornerOffset,
  resizeLayerRectFromHandle,
  type ImageLayerTransformHandle,
  type ImageLayerTransformRect,
} from './ImageLayerTransformControls';
import {
  getImageLayerPivotPoint,
  resolveImageLayerTransformOrigin,
} from './ImageLayerTransform';
import {
  applyTransformPreviewSession,
  beginTransformPreviewSession,
  cancelTransformPreviewSession,
  clearTransformPreviewSession,
  getTransformPreviewSession,
  markTransformPreviewSessionStructureChange,
  subscribeTransformPreviewSession,
  transformPreviewSessionHasPendingChanges,
} from './ImageTransformPreview';
import {
  applySelectionTransformSession,
  cancelSelectionTransformSession,
  getSelectionTransformSession,
  updateSelectionTransformDistortCornerOffset,
  subscribeSelectionTransformSession,
  updateSelectionTransformSkew,
  updateSelectionTransformBounds,
  updateSelectionTransformRotation,
  type SelectionTransformBounds,
  type SelectionTransformCorner,
  type SelectionTransformMode,
  type SelectionTransformShape,
} from './ImageSelectionTransform';
import {
  calculateSelectionSkewDeg,
  calculateSelectionRotationDeg,
  getSelectionTransformHandlePoints,
  getSelectionTransformRotateHandlePoint,
  getSelectionTransformScreenCorners,
  getSelectionTransformScreenExtents,
  moveSelectionBounds,
  moveSelectionDistortCornerOffset,
  resizeSelectionBoundsFromHandle,
  type SelectionTransformHandle,
} from './ImageSelectionTransformControls';
import {
  buildCroppedImageDocumentState,
  clearCropPreview,
  getCropPreview,
  subscribeCropPreview,
  type CropPreviewRect,
} from './tools/cropTool';
import {
  getEditableVectorShape,
  getVectorPathDocumentPoints,
  type ImageVectorPathHandleKind,
  updateVectorPathLayerHandle,
  updateVectorPathLayerPoint,
} from './ImageVectorShape';

const BRUSH_STATUS_TOOLS = new Set<EditorTool>([
  'brush',
  'eraser',
  'cloneStamp',
  'spotHeal',
  'blurBrush',
  'sharpenBrush',
  'smudgeBrush',
  'dodgeBrush',
  'burnBrush',
  'spongeSaturateBrush',
  'spongeDesaturateBrush',
]);
const BRUSH_SYMMETRY_TOOLS = new Set<EditorTool>(['brush', 'eraser']);

export function ImageEditorCanvas() {
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<CompositeRenderer | null>(null);

  useToolDispatcher({ wrapperRef, rendererRef });

  const subscribedActiveDoc = useImageEditorStore((s) =>
    s.documents.find((d) => d.id === s.activeDocId) ?? null,
  );
  const stateSnapshot = useImageEditorStore.getState();
  const activeDoc = subscribedActiveDoc
    ?? stateSnapshot.documents.find((d) => d.id === stateSnapshot.activeDocId)
    ?? null;
  const subscribedBrushSettings = useImageEditorStore((s) => s.brushSettings);
  const subscribedCropToolSettings = useImageEditorStore((s) => s.cropToolSettings);
  const subscribedQuickMaskSettings = useImageEditorStore((s) => s.quickMaskSettings);
  const subscribedTool = useImageEditorStore((s) => s.tool);
  const imageTouchNavigation = useTouchNavigationStore((s) => s.image);
  const imageTouchNavigationAvailability = usePaperTouchNavigationAvailabilityDescriptor();
  const setViewport = useImageEditorStore((s) => s.setViewport);
  const setViewportContainerSize = useImageEditorStore((s) => s.setViewportContainerSize);
  const setDocumentDimensions = useImageEditorStore((s) => s.setDocumentDimensions);
  const addLayer = useImageEditorStore((s) => s.addLayer);
  const setActiveLayer = useImageEditorStore((s) => s.setActiveLayer);
  const updateLayer = useImageEditorStore((s) => s.updateLayer);
  const removeLayer = useImageEditorStore((s) => s.removeLayer);
  const pushOperation = useImageEditorStore((s) => s.pushOperation);
  const pendingTextEditLayerId = useImageEditorStore((s) => s.pendingTextEditLayerId);
  const setPendingTextEditLayerId = useImageEditorStore((s) => s.setPendingTextEditLayerId);
  const imageViewSettings = useImageEditorStore((s) => s.imageViewSettings);
  const showRulers = imageViewSettings.rulers;
  const [editingTextLayerId, setEditingTextLayerId] = useState<string | null>(null);
  const [editingTextDraft, setEditingTextDraft] = useState('');
  const [cropPreviewVersion, setCropPreviewVersion] = useState(0);
  const [transformPreviewVersion, setTransformPreviewVersion] = useState(0);
  const [selectionTransformPreviewVersion, setSelectionTransformPreviewVersion] = useState(0);

  const activeLayer = useMemo(() => {
    if (!activeDoc?.activeLayerId) return null;
    return activeDoc.layers.find((candidate) => candidate.id === activeDoc.activeLayerId) ?? null;
  }, [activeDoc]);
  const brushSettings = stateSnapshot.brushSettings === subscribedBrushSettings
    ? subscribedBrushSettings
    : stateSnapshot.brushSettings;
  const cropToolSettings = stateSnapshot.cropToolSettings === subscribedCropToolSettings
    ? subscribedCropToolSettings
    : stateSnapshot.cropToolSettings;
  const quickMaskSettings = stateSnapshot.quickMaskSettings === subscribedQuickMaskSettings
    ? subscribedQuickMaskSettings
    : stateSnapshot.quickMaskSettings;
  const tool = stateSnapshot.tool === subscribedTool
    ? subscribedTool
    : stateSnapshot.tool;
  const showBrushStatus = BRUSH_STATUS_TOOLS.has(tool);
  const showBrushSymmetry = Boolean(
    activeDoc
    && BRUSH_SYMMETRY_TOOLS.has(tool)
    && brushSettings.symmetryMode
    && brushSettings.symmetryMode !== 'none',
  );

  const cropPreview = useMemo(() => {
    void cropPreviewVersion;
    return activeDoc ? getCropPreview(activeDoc) : null;
  }, [activeDoc, cropPreviewVersion, cropToolSettings]);
  const transformPreview = useMemo(() => {
    void transformPreviewVersion;
    return activeDoc ? getTransformPreviewSession(activeDoc.id) : null;
  }, [activeDoc, transformPreviewVersion]);
  const selectionTransformPreview = useMemo(() => {
    void selectionTransformPreviewVersion;
    return activeDoc ? getSelectionTransformSession(activeDoc.id) : null;
  }, [activeDoc, selectionTransformPreviewVersion]);

  const activeTextLayer = useMemo(() => {
    const layer = activeLayer;
    return layer?.text && layer.metadata?.editableText !== false ? layer : null;
  }, [activeLayer]);
  const activeVectorPathLayer = useMemo(() => {
    if (!activeLayer) return null;
    const shape = getEditableVectorShape(activeLayer);
    return shape?.kind === 'path' ? activeLayer : null;
  }, [activeLayer]);

  const activeTextBounds = activeTextLayer && activeDoc
    ? getImageTextEditOverlayBounds(activeTextLayer, activeDoc.viewport)
    : null;
  const editingTextLayer = activeDoc?.layers.find((layer) => layer.id === editingTextLayerId) ?? null;
  const editingTextBounds = editingTextLayer && activeDoc
    ? getImageTextEditOverlayBounds(editingTextLayer, activeDoc.viewport)
    : null;
  const transformPreviewLayer = activeDoc && transformPreview
    ? activeDoc.layers.find((layer) => layer.id === transformPreview.layerId) ?? null
    : null;
  const transformPreviewBounds = activeDoc && transformPreviewLayer
    ? getImageLayerTransformBounds(transformPreviewLayer, activeDoc.viewport)
    : null;
  const hasPendingTransformPreview = activeDoc ? transformPreviewSessionHasPendingChanges(activeDoc) : false;
  const selectionTransformPreviewBounds = selectionTransformPreview?.currentBounds ?? null;
  const selectionTransformPreviewShape = selectionTransformPreviewBounds
    ? {
        bounds: selectionTransformPreviewBounds,
        rotationDeg: selectionTransformPreview?.currentRotationDeg ?? 0,
        skewXDeg: selectionTransformPreview?.currentSkewXDeg ?? 0,
        skewYDeg: selectionTransformPreview?.currentSkewYDeg ?? 0,
        cornerOffsets: selectionTransformPreview?.currentCornerOffsets ?? {
          nw: { x: 0, y: 0 },
          ne: { x: 0, y: 0 },
          se: { x: 0, y: 0 },
          sw: { x: 0, y: 0 },
        },
      } satisfies SelectionTransformShape
    : null;
  const selectionTransformPreviewScreenBounds = activeDoc && selectionTransformPreviewShape
    ? getSelectionTransformScreenExtents(
        getSelectionTransformScreenCorners(selectionTransformPreviewShape, activeDoc.viewport),
      )
    : null;

  const startTextEditing = useCallback((layer: ImageLayer) => {
    if (!layer.text || layer.locked) return;
    setEditingTextLayerId(layer.id);
    setEditingTextDraft(layer.text.content);
  }, []);

  const cancelTextEditing = useCallback(() => {
    const layerId = editingTextLayerId;
    setEditingTextLayerId(null);
    setEditingTextDraft('');
    if (!layerId) return;
    // Discard a freshly-placed Type-tool layer that was dismissed before any
    // text was committed, so a stray click never leaves an empty text layer.
    const state = useImageEditorStore.getState();
    const doc = state.documents.find((candidate) => candidate.id === state.activeDocId);
    const layer = doc?.layers.find((candidate) => candidate.id === layerId);
    if (doc && layer?.metadata?.freshlyPlaced && !(layer.text?.content ?? '').trim()) {
      removeLayer(doc.id, layer.id);
      rendererRef.current?.requestRender();
    }
  }, [editingTextLayerId, removeLayer]);

  const commitTextEditing = useCallback(() => {
    if (!editingTextLayerId) return;
    const state = useImageEditorStore.getState();
    const doc = state.documents.find((candidate) => candidate.id === state.activeDocId);
    const layer = doc?.layers.find((candidate) => candidate.id === editingTextLayerId);
    if (!doc || !layer?.text || layer.locked) {
      cancelTextEditing();
      return;
    }

    if (layer.text.content === editingTextDraft) {
      cancelTextEditing();
      return;
    }

    const before = doc.layers;
    const restyled = updateTextLayerFromStyle(layer, { content: editingTextDraft });
    // Once a freshly-placed layer gets real content it becomes a normal text
    // layer; clear the flag so future edits/cancels don't discard it.
    const nextLayer = restyled.metadata?.freshlyPlaced
      ? { ...restyled, metadata: { ...restyled.metadata, freshlyPlaced: false } }
      : restyled;
    const after = doc.layers.map((candidate) => candidate.id === layer.id ? nextLayer : candidate);
    pushOperation({ kind: 'layerOp', docId: doc.id, before, after });
    updateLayer(doc.id, layer.id, nextLayer);
    cancelTextEditing();
    rendererRef.current?.requestRender();
  }, [cancelTextEditing, editingTextDraft, editingTextLayerId, pushOperation, updateLayer]);

  // The Type tool drops a new layer and flags it for editing; open the on-canvas
  // editor for it, then clear the flag so it fires exactly once per placement.
  useEffect(() => {
    if (!pendingTextEditLayerId) return;
    const layer = activeDoc?.layers.find((candidate) => candidate.id === pendingTextEditLayerId);
    if (layer?.text && !layer.locked) {
      startTextEditing(layer);
    }
    setPendingTextEditLayerId(null);
  }, [activeDoc, pendingTextEditLayerId, setPendingTextEditLayerId, startTextEditing]);

  const commitCropEditing = useCallback(() => {
    const state = useImageEditorStore.getState();
    const doc = state.documents.find((candidate) => candidate.id === state.activeDocId);
    const preview = doc ? getCropPreview(doc) : null;
    if (!doc || !preview) return;
    const result = buildCroppedImageDocumentState(doc, preview, state.cropToolSettings);
    if (!result) return;

    state.pushOperation({
      kind: 'docResize',
      docId: doc.id,
      before: {
        width: doc.width,
        height: doc.height,
        layers: doc.layers,
        activeLayerId: doc.activeLayerId,
      },
      after: {
        width: result.width,
        height: result.height,
        layers: result.layers,
        activeLayerId: result.activeLayerId,
      },
    });
    state.setLayers(doc.id, result.layers, result.activeLayerId);
    state.setDocumentDimensions(doc.id, result.width, result.height);
    clearCropPreview();
    rendererRef.current?.requestRender();
  }, []);

  const cancelCropEditing = useCallback(() => {
    clearCropPreview();
    rendererRef.current?.requestRender();
  }, []);

  const applyTransformEditing = useCallback(() => {
    if (!activeDoc) return;
    applyTransformPreviewSession(activeDoc.id, () => rendererRef.current?.requestRender());
  }, [activeDoc]);

  const cancelTransformEditing = useCallback(() => {
    if (!activeDoc) return;
    cancelTransformPreviewSession(activeDoc.id, () => rendererRef.current?.requestRender());
  }, [activeDoc]);

  const handleCanvasDoubleClick = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (!activeDoc || !wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    const docPoint = screenToDoc(
      { x: event.clientX - rect.left, y: event.clientY - rect.top },
      activeDoc.viewport,
    );
    const hitLayer = [...activeDoc.layers]
      .reverse()
      .find((layer) =>
        layer.visible &&
        !layer.locked &&
        layer.text &&
        layer.metadata?.editableText !== false &&
        imageTextLayerContainsPoint(layer, docPoint),
      );

    if (!hitLayer) return;
    event.preventDefault();
    event.stopPropagation();
    setActiveLayer(activeDoc.id, hitLayer.id);
    startTextEditing(hitLayer);
  }, [activeDoc, setActiveLayer, startTextEditing]);

  // Dropping a drag started from a ruler creates a guide at the release point
  // (snapped to the grid when snapping is on). Releasing off the document cancels.
  const handleCreateGuide = useCallback((axis: 'x' | 'y', clientX: number, clientY: number) => {
    const wrapper = wrapperRef.current;
    const state = useImageEditorStore.getState();
    const doc = state.documents.find((candidate) => candidate.id === state.activeDocId);
    if (!wrapper || !doc) return;
    const rect = wrapper.getBoundingClientRect();
    const docPoint = screenToDoc({ x: clientX - rect.left, y: clientY - rect.top }, doc.viewport);
    if (axis === 'y') {
      if (docPoint.y < 0 || docPoint.y > doc.height) return;
      state.addImageGuide(doc.id, 'y', snapGuidePosition(docPoint.y, state.imageViewSettings));
    } else {
      if (docPoint.x < 0 || docPoint.x > doc.width) return;
      state.addImageGuide(doc.id, 'x', snapGuidePosition(docPoint.x, state.imageViewSettings));
    }
    rendererRef.current?.requestRender();
  }, []);

  // Mount/unmount the renderer.
  useEffect(() => {
    const canvas = canvasElRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;
    const renderer = new CompositeRenderer(canvas, wrapper);
    rendererRef.current = renderer;
    return () => {
      renderer.destroy();
      rendererRef.current = null;
    };
  }, []);

  // Keep TopNavbar zoom controls grounded in the actual image canvas size.
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const updateSize = () => {
      const rect = wrapper.getBoundingClientRect();
      setViewportContainerSize({ width: rect.width, height: rect.height });
    };

    updateSize();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateSize);
      return () => window.removeEventListener('resize', updateSize);
    }

    const observer = new ResizeObserver(updateSize);
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [setViewportContainerSize]);

  // Push current doc + selection into the renderer whenever they change.
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const selection = activeDoc ? getSelection(activeDoc.id) ?? null : null;
    renderer.setInputs(activeDoc, selection);
  }, [activeDoc]);

  // The renderer draws the grid + guides from the view settings, but it only
  // repaints on demand — request a repaint when those settings change.
  useEffect(() => {
    rendererRef.current?.requestRender();
  }, [imageViewSettings]);

  useEffect(() => subscribeCropPreview(() => {
    setCropPreviewVersion((version) => version + 1);
  }), []);

  useEffect(() => subscribeTransformPreviewSession(() => {
    setTransformPreviewVersion((version) => version + 1);
  }), []);

  useEffect(() => subscribeSelectionTransformSession(() => {
    setSelectionTransformPreviewVersion((version) => version + 1);
  }), []);

  useEffect(() => {
    if (tool !== 'crop' && getCropPreview()) {
      clearCropPreview();
      rendererRef.current?.requestRender();
    }
    if (tool !== 'move' && activeDoc && getTransformPreviewSession(activeDoc.id)) {
      applyTransformPreviewSession(activeDoc.id, () => rendererRef.current?.requestRender());
    }
    if (tool !== 'move' && activeDoc && getSelectionTransformSession(activeDoc.id)) {
      applySelectionTransformSession(activeDoc.id, () => rendererRef.current?.requestRender());
    }
  }, [activeDoc, tool]);

  useEffect(() => {
    if (tool === 'crop' && activeDoc && getCropPreview(activeDoc)) {
      rendererRef.current?.requestRender();
    }
  }, [activeDoc, cropToolSettings, tool]);

  useEffect(() => {
    rendererRef.current?.requestRender();
  }, [quickMaskSettings]);

  // Bootstrap a source-bin-backed document by loading the image into a layer
  // and fitting the viewport.
  useEffect(() => {
    if (!activeDoc) return;
    if (activeDoc.layers.length > 0) return;
    if (!activeDoc.sourceBinItemId) return;

    const renderer = rendererRef.current;
    if (!renderer) return;

    const sourceItem = useSourceBinStore
      .getState()
      .bins.flatMap((bin) => bin.items)
      .find((candidate) => candidate.id === activeDoc.sourceBinItemId);

    if (!sourceItem?.assetUrl) return;

    let cancelled = false;
    void (async () => {
      try {
        const bitmap = await bitmapFromUrl(sourceItem.assetUrl!);
        if (cancelled) return;

        const docId = activeDoc.id;
        setDocumentDimensions(docId, bitmap.width, bitmap.height);

        const layer: ImageLayer = {
          id: `layer-${Date.now()}`,
          name: sourceItem.label ?? 'Background',
          type: 'image',
          visible: true,
          locked: false,
          opacity: 1,
          blendMode: 'normal',
          x: 0,
          y: 0,
          bitmap,
          bitmapVersion: 0,
          mask: null,
        };
        addLayer(docId, layer);

        const container = renderer.getCssSize();
        const viewport = fitToContainer(
          { width: bitmap.width, height: bitmap.height },
          container,
        );
        setViewport(docId, viewport);
      } catch {
        // Failed to load source image; leave the doc empty.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeDoc, addLayer, setDocumentDimensions, setViewport]);

  // Auto-fit viewport when doc dimensions become known and viewport is still
  // at its default (zoom 1, no pan).
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || !activeDoc) return;
    const isDefaultViewport =
      activeDoc.viewport.zoom === 1 &&
      activeDoc.viewport.panX === 0 &&
      activeDoc.viewport.panY === 0;
    if (!isDefaultViewport) return;
    const container = renderer.getCssSize();
    if (container.width <= 1 || container.height <= 1) return;
    const fit = fitToContainer(
      { width: activeDoc.width, height: activeDoc.height },
      container,
    );
    setViewport(activeDoc.id, fit);
  }, [activeDoc, setViewport]);

  // Wheel-zoom + space-drag pan + pinch-zoom.
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const onWheel = (event: WheelEvent) => {
      const state = useImageEditorStore.getState();
      const doc = state.documents.find((d) => d.id === state.activeDocId);
      if (!doc) return;
      event.preventDefault();
      const rect = wrapper.getBoundingClientRect();
      const anchor = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      // ctrl-wheel = fine zoom; plain wheel zooms in larger increments.
      const stepFactor = event.ctrlKey || event.metaKey ? 1.05 : 1.15;
      const factor = event.deltaY < 0 ? stepFactor : 1 / stepFactor;
      const next = zoomAround(doc.viewport, anchor, factor);
      state.setViewport(doc.id, next);
      rendererRef.current?.requestRender();
    };

    let spaceHeld = false;
    // Pan + two-finger pinch-zoom. Two fingers always pinch (ahead of single-finger pan),
    // so a pinch can't degrade into the view jumping between fingers. See imageCanvasGestures.
    const gesture = new CanvasViewportGesture({
      getViewport: () => {
        const state = useImageEditorStore.getState();
        return state.documents.find((d) => d.id === state.activeDocId)?.viewport ?? null;
      },
      setViewport: (viewport) => {
        const state = useImageEditorStore.getState();
        if (state.activeDocId) state.setViewport(state.activeDocId, viewport);
      },
      requestRender: () => rendererRef.current?.requestRender(),
      getRect: () => wrapper.getBoundingClientRect(),
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.code === 'Space' && !spaceHeld) {
        spaceHeld = true;
        wrapper.style.cursor = 'grab';
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        spaceHeld = false;
        if (!gesture.isActive()) wrapper.style.cursor = '';
      }
    };
    const onDown = (event: PointerEvent) => {
      const state = useImageEditorStore.getState();
      const handToolActive = state.tool === 'hand';
      const panAllowed = shouldRouteImagePointerToTouchNavigation({
        available: imageTouchNavigationAvailability.available,
        pointerType: event.pointerType,
        settings: imageTouchNavigation,
      }) || event.button === 1 || spaceHeld || (handToolActive && event.button === 0);
      const kind = gesture.pointerDown({
        pointerType: event.pointerType,
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        panAllowed,
      });
      if (kind === 'pinch' || kind === 'pan') {
        event.preventDefault();
        event.stopPropagation();
        try { wrapper.setPointerCapture(event.pointerId); } catch { /* ignore */ }
        wrapper.style.cursor = 'grabbing';
      }
    };
    const onMove = (event: PointerEvent) => {
      const kind = gesture.pointerMove({
        pointerType: event.pointerType,
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
      });
      if (kind === 'pinch' || kind === 'pan') {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const onUp = (event: PointerEvent) => {
      const kind = gesture.pointerUp({ pointerType: event.pointerType, pointerId: event.pointerId });
      if (kind === 'pinch' || kind === 'pan') {
        try { wrapper.releasePointerCapture(event.pointerId); } catch { /* ignore */ }
        wrapper.style.cursor = spaceHeld || useImageEditorStore.getState().tool === 'hand' ? 'grab' : '';
      }
    };

    wrapper.addEventListener('wheel', onWheel, { passive: false });
    wrapper.addEventListener('pointerdown', onDown, { capture: true });
    wrapper.addEventListener('pointermove', onMove, { capture: true });
    wrapper.addEventListener('pointerup', onUp, { capture: true });
    wrapper.addEventListener('pointercancel', onUp, { capture: true });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      wrapper.removeEventListener('wheel', onWheel);
      wrapper.removeEventListener('pointerdown', onDown, { capture: true } as EventListenerOptions);
      wrapper.removeEventListener('pointermove', onMove, { capture: true } as EventListenerOptions);
      wrapper.removeEventListener('pointerup', onUp, { capture: true } as EventListenerOptions);
      wrapper.removeEventListener('pointercancel', onUp, { capture: true } as EventListenerOptions);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [imageTouchNavigation, imageTouchNavigationAvailability.available]);

  void docToScreen; // re-export hint for tooling

  return (
    <div
      ref={wrapperRef}
      className={`theme-surface relative flex-1 ${tool === 'hand' ? 'cursor-grab' : ''}`}
      onDoubleClick={handleCanvasDoubleClick}
      style={{ touchAction: 'none' }}
    >
      <canvas ref={canvasElRef} className="block h-full w-full" style={{ touchAction: 'none' }} />

      {showRulers && activeDoc ? (
        <ImageEditorRulers
          cursor={null}
          onCreateGuide={handleCreateGuide}
          viewport={activeDoc.viewport}
        />
      ) : null}

      {activeTextLayer && activeTextBounds && !editingTextLayer && !activeTextLayer.locked ? (
        <button
          className="pointer-events-auto absolute z-20 inline-flex h-8 items-center gap-1.5 rounded-md border border-cyan-300/25 bg-[#10131b]/95 px-2 text-[11px] font-semibold text-cyan-50 shadow-lg shadow-black/30 hover:border-cyan-300/55"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            startTextEditing(activeTextLayer);
          }}
          style={{
            left: Math.max(8, activeTextBounds.x),
            top: Math.max(8, activeTextBounds.y - 36),
          }}
          title="Edit text on canvas"
          type="button"
        >
          <Pencil size={12} />
          Edit Text
        </button>
      ) : null}

      {activeDoc && editingTextLayer?.text && editingTextBounds ? (
        <ImageTextEditOverlay
          bounds={editingTextBounds}
          draft={editingTextDraft}
          layer={editingTextLayer}
          onCancel={cancelTextEditing}
          onChange={setEditingTextDraft}
          onCommit={commitTextEditing}
          zoom={activeDoc.viewport.zoom}
        />
      ) : null}

      {activeDoc && activeLayer && tool === 'move' && !editingTextLayer ? (
        <ImageLayerTransformOverlay
          doc={activeDoc}
          layer={activeLayer}
          requestRender={() => rendererRef.current?.requestRender()}
          wrapperRef={wrapperRef}
        />
      ) : null}

      {activeDoc && activeVectorPathLayer && !editingTextLayer && (tool === 'move' || tool === 'pen') ? (
        <ImageVectorPathAnchorOverlay
          doc={activeDoc}
          layer={activeVectorPathLayer}
          requestRender={() => rendererRef.current?.requestRender()}
          wrapperRef={wrapperRef}
        />
      ) : null}

      {tool === 'move' && transformPreview && transformPreviewBounds && hasPendingTransformPreview ? (
        <ImageTransformActionOverlay
          bounds={transformPreviewBounds}
          onApply={applyTransformEditing}
          onCancel={cancelTransformEditing}
        />
      ) : null}

      {activeDoc && tool === 'move' && selectionTransformPreview && selectionTransformPreviewBounds && selectionTransformPreviewShape && selectionTransformPreviewScreenBounds ? (
        <>
          <ImageSelectionTransformOverlay
            bounds={selectionTransformPreviewBounds}
            cornerOffsets={selectionTransformPreview.currentCornerOffsets}
            doc={activeDoc}
            mode={selectionTransformPreview.currentMode}
            rotationDeg={selectionTransformPreview.currentRotationDeg}
            requestRender={() => rendererRef.current?.requestRender()}
            skewXDeg={selectionTransformPreview.currentSkewXDeg}
            skewYDeg={selectionTransformPreview.currentSkewYDeg}
            viewport={activeDoc.viewport}
            wrapperRef={wrapperRef}
          />
          <ImageSelectionTransformActionOverlay
            bounds={selectionTransformPreviewScreenBounds}
            onApply={() => applySelectionTransformSession(activeDoc.id, () => rendererRef.current?.requestRender())}
            onCancel={() => cancelSelectionTransformSession(activeDoc.id, () => rendererRef.current?.requestRender())}
          />
        </>
      ) : null}

      {activeDoc && tool === 'crop' && cropPreview ? (
        <ImageCropActionOverlay
          onApply={commitCropEditing}
          onCancel={cancelCropEditing}
          preview={cropPreview}
          viewport={activeDoc.viewport}
        />
      ) : null}

      {activeDoc && showBrushSymmetry ? (
        <ImageBrushSymmetryOverlay
          doc={activeDoc}
          mode={brushSettings.symmetryMode ?? 'none'}
        />
      ) : null}

      {showBrushStatus ? (
        <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2">
          <div className="flex gap-3 rounded-md border border-cyan-300/10 bg-[#1a1b23] px-3 py-1.5 text-xs text-cyan-100/50">
            <span>Brush: {brushSettings.size}px</span>
            <span>|</span>
            <span>Opacity: {Math.round(brushSettings.opacity * 100)}%</span>
            <span>|</span>
            <span>Hardness: {Math.round(brushSettings.hardness * 100)}%</span>
            {brushSettings.symmetryMode && brushSettings.symmetryMode !== 'none' ? (
              <>
                <span>|</span>
                <span>Symmetry: {brushSettings.symmetryMode === 'both' ? 'Four-Way' : brushSettings.symmetryMode === 'vertical' ? 'Vertical' : 'Horizontal'}</span>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function ImageBrushSymmetryOverlay({
  doc,
  mode,
}: {
  doc: ImageDocument;
  mode: 'none' | 'vertical' | 'horizontal' | 'both';
}) {
  if (mode === 'none') return null;

  const verticalX = doc.width / 2;
  const horizontalY = doc.height / 2;
  const verticalScreen = docToScreen({ x: verticalX, y: 0 }, doc.viewport).x;
  const horizontalScreen = docToScreen({ x: 0, y: horizontalY }, doc.viewport).y;
  const left = docToScreen({ x: 0, y: 0 }, doc.viewport).x;
  const top = docToScreen({ x: 0, y: 0 }, doc.viewport).y;
  const right = docToScreen({ x: doc.width, y: 0 }, doc.viewport).x;
  const bottom = docToScreen({ x: 0, y: doc.height }, doc.viewport).y;

  return (
    <div className="pointer-events-none absolute inset-0 z-10" data-image-brush-symmetry-overlay="true">
      {(mode === 'vertical' || mode === 'both') ? (
        <div
          className="absolute border-l border-dashed border-cyan-300/45"
          data-image-brush-symmetry-guide="vertical"
          style={{
            left: verticalScreen,
            top,
            height: Math.max(0, bottom - top),
          }}
        />
      ) : null}
      {(mode === 'horizontal' || mode === 'both') ? (
        <div
          className="absolute border-t border-dashed border-cyan-300/45"
          data-image-brush-symmetry-guide="horizontal"
          style={{
            left,
            top: horizontalScreen,
            width: Math.max(0, right - left),
          }}
        />
      ) : null}
    </div>
  );
}

interface VectorPathAnchorDragState {
  pointerId: number;
  layerId: string;
  pointIndex: number;
  handleKind: ImageVectorPathHandleKind | null;
  beforeLayers: ImageLayer[];
  moved: boolean;
}

export function ImageVectorPathAnchorOverlay({
  doc,
  layer,
  requestRender,
  wrapperRef,
}: {
  doc: ImageDocument;
  layer: ImageLayer;
  requestRender: () => void;
  wrapperRef: RefObject<HTMLDivElement | null>;
}) {
  const dragRef = useRef<VectorPathAnchorDragState | null>(null);
  const shape = getEditableVectorShape(layer);
  const points = shape?.kind === 'path' ? getVectorPathDocumentPoints(layer) : [];

  const pointFromEvent = useCallback((event: ReactPointerEvent<HTMLElement>): Point | null => {
    const wrapper = wrapperRef.current;
    const currentDoc = useImageEditorStore.getState().documents.find((candidate) => candidate.id === doc.id);
    if (!wrapper || !currentDoc) return null;
    const rect = wrapper.getBoundingClientRect();
    return screenToDoc(
      { x: event.clientX - rect.left, y: event.clientY - rect.top },
      currentDoc.viewport,
    );
  }, [doc.id, wrapperRef]);

  const updateAnchorFromEvent = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const point = pointFromEvent(event);
    if (!point) return;
    event.preventDefault();
    event.stopPropagation();

    const state = useImageEditorStore.getState();
    const currentDoc = state.documents.find((candidate) => candidate.id === doc.id);
    const currentLayer = currentDoc?.layers.find((candidate) => candidate.id === drag.layerId);
    if (!currentDoc || !currentLayer) return;

    const nextLayer = drag.handleKind
      ? updateVectorPathLayerHandle(currentLayer, drag.pointIndex, drag.handleKind, point)
      : updateVectorPathLayerPoint(currentLayer, drag.pointIndex, point);
    if (nextLayer === currentLayer) return;
    drag.moved = true;
    state.setLayers(
      currentDoc.id,
      currentDoc.layers.map((candidate) => candidate.id === currentLayer.id ? nextLayer : candidate),
      nextLayer.id,
    );
    requestRender();
  }, [doc.id, pointFromEvent, requestRender]);

  const startAnchorDrag = useCallback((pointIndex: number) => (
    event: ReactPointerEvent<HTMLButtonElement>
  ) => {
    if (!shape || shape.kind !== 'path' || layer.locked) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      layerId: layer.id,
      pointIndex,
      handleKind: null,
      beforeLayers: doc.layers,
      moved: false,
    };
  }, [doc.layers, layer.id, layer.locked, shape]);

  const startBezierHandleDrag = useCallback((
    pointIndex: number,
    handleKind: ImageVectorPathHandleKind,
  ) => (
    event: ReactPointerEvent<HTMLButtonElement>
  ) => {
    if (!shape || shape.kind !== 'path' || layer.locked) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      layerId: layer.id,
      pointIndex,
      handleKind,
      beforeLayers: doc.layers,
      moved: false,
    };
  }, [doc.layers, layer.id, layer.locked, shape]);

  const finishAnchorDrag = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already be released.
    }

    const state = useImageEditorStore.getState();
    const currentDoc = state.documents.find((candidate) => candidate.id === doc.id);
    if (drag.moved && currentDoc) {
      state.pushOperation({
        kind: 'layerOp',
        docId: currentDoc.id,
        before: drag.beforeLayers,
        after: currentDoc.layers,
      });
    }
    dragRef.current = null;
    requestRender();
  }, [doc.id, requestRender]);

  if (!shape || shape.kind !== 'path' || points.length === 0 || !layer.visible || layer.locked) return null;

  const screenPoints = points.map((point) => toScreenVectorPathPoint(point, doc.viewport));
  const pathData = buildScreenVectorPathData(screenPoints, shape.closed);
  const bezierHandles = screenPoints.flatMap((point, pointIndex) => (
    (['inHandle', 'outHandle'] as const)
      .map((handleKind) => {
        const handle = point[handleKind];
        return handle
          ? {
              pointIndex,
              handleKind,
              anchor: point,
              handle,
            }
          : null;
      })
      .filter((handle): handle is {
        pointIndex: number;
        handleKind: ImageVectorPathHandleKind;
        anchor: ImageVectorPathPoint;
        handle: Point;
      } => Boolean(handle))
  ));

  return (
    <div
      className="pointer-events-none absolute inset-0 z-[25]"
      data-image-canvas-interaction-overlay="true"
      data-image-vector-path-anchor-overlay="true"
    >
      <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
        <path
          d={pathData}
          fill="none"
          stroke="rgba(251, 191, 36, 0.92)"
          strokeDasharray="4 3"
          strokeWidth="1.25"
        />
        {bezierHandles.map(({ pointIndex, handleKind, anchor, handle }) => (
          <line
            data-image-vector-path-bezier-line={`${pointIndex}-${handleKind}`}
            key={`${layer.id}-bezier-line-${pointIndex}-${handleKind}`}
            stroke="rgba(34, 211, 238, 0.72)"
            strokeDasharray="3 3"
            strokeWidth="1"
            x1={anchor.x}
            x2={handle.x}
            y1={anchor.y}
            y2={handle.y}
          />
        ))}
      </svg>
      {bezierHandles.map(({ pointIndex, handleKind, handle }) => (
        <button
          aria-label={`Move path anchor ${pointIndex + 1} ${handleKind === 'inHandle' ? 'in' : 'out'} handle`}
          className="pointer-events-auto absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-50 bg-cyan-300 shadow-[0_0_0_1px_rgba(8,11,18,0.95),0_0_10px_rgba(34,211,238,0.35)]"
          data-image-vector-path-bezier-handle={`${pointIndex}-${handleKind}`}
          key={`${layer.id}-bezier-${pointIndex}-${handleKind}`}
          onPointerDown={startBezierHandleDrag(pointIndex, handleKind)}
          onPointerMove={updateAnchorFromEvent}
          onPointerUp={finishAnchorDrag}
          onPointerCancel={finishAnchorDrag}
          style={{
            left: handle.x,
            top: handle.y,
            cursor: 'crosshair',
          }}
          title={`Move ${handleKind === 'inHandle' ? 'in' : 'out'} handle ${pointIndex + 1}`}
          type="button"
        />
      ))}
      {screenPoints.map((point, index) => (
        <button
          aria-label={`Move path anchor ${index + 1}`}
          className="pointer-events-auto absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border border-amber-50 bg-amber-300 shadow-[0_0_0_1px_rgba(8,11,18,0.95),0_0_10px_rgba(251,191,36,0.35)]"
          data-image-vector-path-anchor-handle={index}
          key={`${layer.id}-anchor-${index}`}
          onPointerDown={startAnchorDrag(index)}
          onPointerMove={updateAnchorFromEvent}
          onPointerUp={finishAnchorDrag}
          onPointerCancel={finishAnchorDrag}
          style={{
            left: point.x,
            top: point.y,
            cursor: 'move',
          }}
          title={`Move anchor ${index + 1}`}
          type="button"
        />
      ))}
    </div>
  );
}

function toScreenVectorPathPoint(
  point: ImageVectorPathPoint,
  viewport: ImageDocument['viewport'],
): ImageVectorPathPoint {
  const anchor = docToScreen(point, viewport);
  return {
    ...anchor,
    ...(point.inHandle ? { inHandle: docToScreen(point.inHandle, viewport) } : {}),
    ...(point.outHandle ? { outHandle: docToScreen(point.outHandle, viewport) } : {}),
  };
}

function buildScreenVectorPathData(points: ImageVectorPathPoint[], closed: boolean): string {
  if (points.length === 0) return 'M 0 0';
  const firstPoint = points[0]!;
  const commands = [`M ${firstPoint.x} ${firstPoint.y}`];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]!;
    const point = points[index]!;
    if (previous.outHandle || point.inHandle) {
      const control1 = previous.outHandle ?? previous;
      const control2 = point.inHandle ?? point;
      commands.push(`C ${control1.x} ${control1.y} ${control2.x} ${control2.y} ${point.x} ${point.y}`);
    } else {
      commands.push(`L ${point.x} ${point.y}`);
    }
  }
  if (closed && points.length > 1) {
    const lastPoint = points[points.length - 1]!;
    if (lastPoint.outHandle || firstPoint.inHandle) {
      const control1 = lastPoint.outHandle ?? lastPoint;
      const control2 = firstPoint.inHandle ?? firstPoint;
      commands.push(`C ${control1.x} ${control1.y} ${control2.x} ${control2.y} ${firstPoint.x} ${firstPoint.y}`);
    }
    commands.push('Z');
  }
  return commands.join(' ');
}

export function ImageSelectionTransformOverlay({
  bounds,
  cornerOffsets,
  doc,
  mode,
  rotationDeg,
  requestRender,
  skewXDeg,
  skewYDeg,
  viewport,
  wrapperRef,
}: {
  bounds: SelectionTransformBounds;
  cornerOffsets: SelectionTransformShape['cornerOffsets'];
  doc: ImageDocument;
  mode: SelectionTransformMode;
  rotationDeg: number;
  requestRender: () => void;
  skewXDeg: number;
  skewYDeg: number;
  viewport: ImageDocument['viewport'];
  wrapperRef: RefObject<HTMLDivElement | null>;
}) {
  const dragRef = useRef<SelectionTransformDragState | null>(null);
  const shape: SelectionTransformShape = {
    bounds,
    rotationDeg,
    skewXDeg,
    skewYDeg,
    cornerOffsets,
  };
  const screenCorners = getSelectionTransformScreenCorners(shape, viewport);
  const screenBounds = getSelectionTransformScreenExtents(screenCorners);
  const handlePoints = getSelectionTransformHandlePoints(screenCorners, mode);
  const rotateHandlePoint = getSelectionTransformRotateHandlePoint(screenCorners);
  const relativePoint = useCallback((point: Point) => ({
    x: point.x - screenBounds.x,
    y: point.y - screenBounds.y,
  }), [screenBounds.x, screenBounds.y]);

  const pointFromEvent = useCallback((event: ReactPointerEvent<HTMLElement>): Point | null => {
    const wrapper = wrapperRef.current;
    const currentDoc = useImageEditorStore.getState().documents.find((candidate) => candidate.id === doc.id);
    if (!wrapper || !currentDoc) return null;
    const rect = wrapper.getBoundingClientRect();
    return screenToDoc(
      { x: event.clientX - rect.left, y: event.clientY - rect.top },
      currentDoc.viewport,
    );
  }, [doc.id, wrapperRef]);

  const startMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const startPoint = pointFromEvent(event);
    if (!startPoint) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      kind: 'move',
      pointerId: event.pointerId,
      origin: bounds,
      startPoint,
    };
  }, [bounds, pointFromEvent]);

  const startResize = useCallback((handle: SelectionTransformHandle) => (
    event: ReactPointerEvent<HTMLButtonElement>
  ) => {
    const startPoint = pointFromEvent(event);
    if (!startPoint) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      kind: 'resize',
      pointerId: event.pointerId,
      handle,
      origin: bounds,
      startPoint,
    };
  }, [bounds, pointFromEvent]);

  const startSkew = useCallback((handle: SelectionTransformHandle) => (
    event: ReactPointerEvent<HTMLButtonElement>
  ) => {
    const startPoint = pointFromEvent(event);
    if (!startPoint) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      kind: 'skew',
      pointerId: event.pointerId,
      handle,
      axis: handle === 'n' || handle === 's' ? 'x' : 'y',
      origin: bounds,
      startPoint,
      startSkewXDeg: skewXDeg,
      startSkewYDeg: skewYDeg,
    };
  }, [bounds, pointFromEvent, skewXDeg, skewYDeg]);

  const startDistort = useCallback((corner: SelectionTransformCorner) => (
    event: ReactPointerEvent<HTMLButtonElement>
  ) => {
    const startPoint = pointFromEvent(event);
    if (!startPoint) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      kind: 'distort',
      pointerId: event.pointerId,
      corner,
      originCornerOffsets: cornerOffsets,
      startPoint,
    };
  }, [cornerOffsets, pointFromEvent]);

  const startRotate = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const startPoint = pointFromEvent(event);
    if (!startPoint) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      kind: 'rotate',
      pointerId: event.pointerId,
      center: {
        x: bounds.x + bounds.width / 2,
        y: bounds.y + bounds.height / 2,
      },
      startPoint,
      startRotationDeg: rotationDeg,
    };
  }, [bounds, pointFromEvent, rotationDeg]);

  const continueDrag = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const point = pointFromEvent(event);
    if (!point) return;
    event.preventDefault();
    event.stopPropagation();
    const delta = {
      x: point.x - drag.startPoint.x,
      y: point.y - drag.startPoint.y,
    };
    if (drag.kind === 'rotate') {
      const nextRotation = calculateSelectionRotationDeg({
        center: drag.center,
        startPoint: drag.startPoint,
        point,
        startRotationDeg: drag.startRotationDeg,
        snapToFifteenDegrees: event.shiftKey,
      });
      if (updateSelectionTransformRotation(doc.id, nextRotation)) {
        requestRender();
      }
      return;
    }
    if (drag.kind === 'skew') {
      const nextSkewDeg = calculateSelectionSkewDeg({
        axis: drag.axis,
        origin: drag.origin,
        delta,
        startSkewDeg: drag.axis === 'x' ? drag.startSkewXDeg : drag.startSkewYDeg,
        snapToFifteenDegrees: event.shiftKey,
      });
      if (updateSelectionTransformSkew(doc.id, drag.axis === 'x' ? { skewXDeg: nextSkewDeg } : { skewYDeg: nextSkewDeg })) {
        requestRender();
      }
      return;
    }
    if (drag.kind === 'distort') {
      const nextCornerOffsets = moveSelectionDistortCornerOffset({
        corner: drag.corner,
        originOffsets: drag.originCornerOffsets,
        delta,
      });
      if (updateSelectionTransformDistortCornerOffset(doc.id, drag.corner, nextCornerOffsets[drag.corner])) {
        requestRender();
      }
      return;
    }
    const nextBounds = drag.kind === 'move'
      ? moveSelectionBounds(drag.origin, delta)
      : resizeSelectionBoundsFromHandle({
          handle: drag.handle,
          origin: drag.origin,
        delta,
        keepAspect: event.shiftKey,
      });
    if (updateSelectionTransformBounds(doc.id, nextBounds)) {
      requestRender();
    }
  }, [doc.id, pointFromEvent, requestRender]);

  const endDrag = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = null;
  }, []);

  return (
    <div
      className="pointer-events-none absolute z-20"
      data-image-selection-transform-overlay="true"
      style={{
        left: screenBounds.x,
        top: screenBounds.y,
        width: screenBounds.width,
        height: screenBounds.height,
      }}
    >
      <svg
        className="pointer-events-none absolute inset-0 overflow-visible"
        data-image-selection-transform-rotation-preview="true"
        height={Math.max(1, screenBounds.height)}
        width={Math.max(1, screenBounds.width)}
      >
        <polygon
          fill="rgba(103, 232, 249, 0.08)"
          points={Object.values(screenCorners).map((point) => {
            const relative = relativePoint(point);
            return `${relative.x},${relative.y}`;
          }).join(' ')}
          stroke="rgba(165, 243, 252, 0.9)"
          strokeDasharray="4 3"
          strokeWidth="1"
        />
      </svg>
      <div
        className="pointer-events-auto absolute inset-0 cursor-move"
        data-image-selection-transform-body="true"
        onPointerDown={startMove}
        onPointerMove={continueDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      />
      <button
        aria-label="Rotate selection"
        className="pointer-events-auto absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-50 bg-[#10131b] text-cyan-100 shadow-md shadow-black/40"
        data-image-selection-transform-rotate-handle="true"
        onPointerDown={startRotate}
        onPointerMove={continueDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        style={{
          left: relativePoint(rotateHandlePoint).x,
          top: relativePoint(rotateHandlePoint).y,
        }}
        title="Rotate selection"
        type="button"
      >
        <span className="block h-full w-full rounded-full border border-cyan-300/60" />
      </button>
      {handlePoints.map(({ kind, handle, point, cursor }) => {
        const relative = relativePoint(point);
        const dataProps = kind === 'resize'
          ? { 'data-image-selection-transform-handle': String(handle) }
          : kind === 'skew'
            ? { 'data-image-selection-transform-skew-handle': String(handle) }
            : { 'data-image-selection-transform-distort-handle': String(handle) };
        const pointerDown = kind === 'resize'
          ? startResize(handle as SelectionTransformHandle)
          : kind === 'skew'
            ? startSkew(handle as SelectionTransformHandle)
            : startDistort(handle as SelectionTransformCorner);
        return (
          <button
            aria-label={`${kind === 'resize' ? 'Resize' : kind === 'skew' ? 'Skew' : 'Distort'} selection ${handle}`}
            className="pointer-events-auto absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded border border-cyan-50/80 bg-cyan-300 shadow-[0_0_0_1px_rgba(8,11,18,0.95)]"
            key={`${kind}-${handle}`}
            onPointerDown={pointerDown}
            onPointerMove={continueDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            style={{
              left: relative.x,
              top: relative.y,
              cursor,
            }}
            type="button"
            {...dataProps}
          />
        );
      })}
    </div>
  );
}

export function ImageSelectionTransformActionOverlay({
  bounds,
  onApply,
  onCancel,
}: {
  bounds: { x: number; y: number; width: number; height: number };
  onApply: () => void;
  onCancel: () => void;
}) {
  const top = bounds.y >= 42 ? bounds.y - 38 : bounds.y + bounds.height + 8;
  const left = Math.max(8, bounds.x);

  return (
    <div
      className="pointer-events-auto absolute z-30 flex items-center gap-1 rounded-md border border-cyan-300/25 bg-[#080b12]/95 p-1 shadow-xl shadow-black/40"
      data-image-selection-transform-actions="true"
      onDoubleClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      style={{ left, top }}
    >
      <button
        className="flex h-7 w-7 items-center justify-center rounded border border-cyan-300/25 bg-cyan-300/15 text-cyan-50 hover:border-cyan-300/60"
        onClick={onApply}
        title="Apply selection transform"
        type="button"
      >
        <Check size={14} />
      </button>
      <button
        className="flex h-7 w-7 items-center justify-center rounded border border-rose-300/25 bg-rose-500/15 text-rose-50 hover:border-rose-300/60"
        onClick={onCancel}
        title="Cancel selection transform"
        type="button"
      >
        <X size={14} />
      </button>
    </div>
  );
}

interface SelectionTransformMoveDragState {
  kind: 'move';
  pointerId: number;
  origin: SelectionTransformBounds;
  startPoint: Point;
}

interface SelectionTransformRotateDragState {
  kind: 'rotate';
  pointerId: number;
  center: Point;
  startPoint: Point;
  startRotationDeg: number;
}

interface SelectionTransformResizeDragState {
  kind: 'resize';
  pointerId: number;
  handle: SelectionTransformHandle;
  origin: SelectionTransformBounds;
  startPoint: Point;
}

interface SelectionTransformSkewDragState {
  kind: 'skew';
  pointerId: number;
  handle: SelectionTransformHandle;
  axis: 'x' | 'y';
  origin: SelectionTransformBounds;
  startPoint: Point;
  startSkewXDeg: number;
  startSkewYDeg: number;
}

interface SelectionTransformDistortDragState {
  kind: 'distort';
  pointerId: number;
  corner: SelectionTransformCorner;
  originCornerOffsets: SelectionTransformShape['cornerOffsets'];
  startPoint: Point;
}

type SelectionTransformDragState =
  | SelectionTransformMoveDragState
  | SelectionTransformRotateDragState
  | SelectionTransformResizeDragState
  | SelectionTransformSkewDragState
  | SelectionTransformDistortDragState;

export type { ImageDocument };

function ImageTextEditOverlay({
  bounds,
  draft,
  layer,
  onCancel,
  onChange,
  onCommit,
  zoom,
}: {
  bounds: NonNullable<ReturnType<typeof getImageTextEditOverlayBounds>>;
  draft: string;
  layer: ImageLayer;
  onCancel: () => void;
  onChange: (value: string) => void;
  onCommit: () => void;
  zoom: number;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const text = layer.text;

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.focus();
    textarea.select();
  }, [layer.id]);

  if (!text) return null;

  return (
    <div
      className="pointer-events-auto absolute z-30 rounded-md border border-cyan-300/45 bg-[#080b12]/75 p-1 shadow-2xl shadow-black/40"
      data-image-text-edit-overlay="true"
      onBlurCapture={(event) => {
        const nextTarget = event.relatedTarget;
        if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
        onCommit();
      }}
      onDoubleClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      style={{
        left: bounds.x,
        top: bounds.y,
        width: Math.max(160, bounds.width),
        minHeight: Math.max(48, bounds.height),
        transform: `rotate(${bounds.rotationDeg}deg)`,
        transformOrigin: `${bounds.transformOriginX * 100}% ${bounds.transformOriginY * 100}%`,
      }}
    >
      <div className="mb-1 flex justify-end gap-1">
        <button
          className="flex h-6 w-6 items-center justify-center rounded border border-cyan-300/20 bg-cyan-300/15 text-cyan-50 hover:border-cyan-300/50"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onCommit}
          title="Apply text edit"
          type="button"
        >
          <Check size={13} />
        </button>
        <button
          className="flex h-6 w-6 items-center justify-center rounded border border-rose-300/20 bg-rose-500/10 text-rose-100 hover:border-rose-300/50"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onCancel}
          title="Cancel text edit"
          type="button"
        >
          <X size={13} />
        </button>
      </div>
      <textarea
        className="block w-full resize both rounded border border-cyan-300/25 bg-[#f8fafc] px-2 py-1 outline-none focus:border-cyan-300"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            onCancel();
            return;
          }
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            onCommit();
          }
        }}
        ref={textareaRef}
        spellCheck={false}
        style={{
          color: text.color,
          fontFamily: text.fontFamily,
          fontSize: Math.max(11, text.fontSize * zoom),
          fontStyle: text.fontStyle,
          fontWeight: text.fontWeight,
          letterSpacing: text.letterSpacing * zoom,
          lineHeight: text.lineHeight,
          minHeight: Math.max(36, bounds.height),
          textAlign: text.align === 'justify' ? 'justify' : text.align,
        }}
        value={draft}
      />
    </div>
  );
}

export function ImageCropActionOverlay({
  onApply,
  onCancel,
  preview,
  viewport,
}: {
  onApply: () => void;
  onCancel: () => void;
  preview: CropPreviewRect;
  viewport: ImageDocument['viewport'];
}) {
  const bounds = getCropPreviewScreenBounds(preview, viewport);
  const top = bounds.y >= 42 ? bounds.y - 38 : bounds.y + bounds.height + 8;
  const left = Math.max(8, bounds.x);

  return (
    <div
      className="pointer-events-auto absolute z-30 flex items-center gap-1 rounded-md border border-cyan-300/25 bg-[#080b12]/95 p-1 shadow-xl shadow-black/40"
      data-image-crop-actions="true"
      onDoubleClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      style={{ left, top }}
    >
      <button
        className="flex h-7 w-7 items-center justify-center rounded border border-cyan-300/25 bg-cyan-300/15 text-cyan-50 hover:border-cyan-300/60"
        onClick={onApply}
        title="Apply crop"
        type="button"
      >
        <Check size={14} />
      </button>
      <button
        className="flex h-7 w-7 items-center justify-center rounded border border-rose-300/25 bg-rose-500/15 text-rose-50 hover:border-rose-300/60"
        onClick={onCancel}
        title="Cancel crop"
        type="button"
      >
        <X size={14} />
      </button>
    </div>
  );
}

function getCropPreviewScreenBounds(
  preview: CropPreviewRect,
  viewport: ImageDocument['viewport'],
): { x: number; y: number; width: number; height: number } {
  const rotationDeg = preview.rotationDeg ?? 0;
  const center = {
    x: preview.x + preview.w / 2,
    y: preview.y + preview.h / 2,
  };
  const corners = [
    { x: preview.x, y: preview.y },
    { x: preview.x + preview.w, y: preview.y },
    { x: preview.x + preview.w, y: preview.y + preview.h },
    { x: preview.x, y: preview.y + preview.h },
  ].map((point) => docToScreen(rotateCropPoint(point, center, rotationDeg), viewport));

  const minX = Math.min(...corners.map((point) => point.x));
  const minY = Math.min(...corners.map((point) => point.y));
  const maxX = Math.max(...corners.map((point) => point.x));
  const maxY = Math.max(...corners.map((point) => point.y));
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function rotateCropPoint(point: Point, center: Point, rotationDeg: number): Point {
  if (!Number.isFinite(rotationDeg) || rotationDeg === 0) return point;
  const radians = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

export function ImageTransformActionOverlay({
  bounds,
  onApply,
  onCancel,
}: {
  bounds: { x: number; y: number; width: number; height: number; rotationDeg: number };
  onApply: () => void;
  onCancel: () => void;
}) {
  const top = bounds.y >= 42 ? bounds.y - 38 : bounds.y + bounds.height + 8;
  const left = Math.max(8, bounds.x);

  return (
    <div
      className="pointer-events-auto absolute z-30 flex items-center gap-1 rounded-md border border-cyan-300/25 bg-[#080b12]/95 p-1 shadow-xl shadow-black/40"
      data-image-transform-actions="true"
      onDoubleClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      style={{ left, top }}
    >
      <button
        className="flex h-7 w-7 items-center justify-center rounded border border-cyan-300/25 bg-cyan-300/15 text-cyan-50 hover:border-cyan-300/60"
        onClick={onApply}
        title="Apply transform"
        type="button"
      >
        <Check size={14} />
      </button>
      <button
        className="flex h-7 w-7 items-center justify-center rounded border border-rose-300/25 bg-rose-500/15 text-rose-50 hover:border-rose-300/60"
        onClick={onCancel}
        title="Cancel transform"
        type="button"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function ImageLayerTransformOverlay({
  doc,
  layer,
  requestRender,
  wrapperRef,
}: {
  doc: ImageDocument;
  layer: ImageLayer;
  requestRender: () => void;
  wrapperRef: RefObject<HTMLDivElement | null>;
}) {
  const dragRef = useRef<TransformDragState | null>(null);
  const bounds = getImageLayerTransformBounds(layer, doc.viewport);
  const intrinsicSize = getImageLayerIntrinsicSize(layer);
  const pivot = getImageLayerPivotPoint(layer, intrinsicSize);
  const shape = getImageLayerTransformShape(layer, intrinsicSize);
  const transformPreviewSession = getTransformPreviewSession(doc.id);
  const mode = transformPreviewSession?.currentMode ?? 'resize';
  const canTransform = Boolean(bounds && intrinsicSize && pivot && layer.visible && canMoveImageLayer(layer));
  const screenCorners = shape ? getImageLayerTransformScreenCorners(shape, doc.viewport) : null;
  const borderPoints = shape ? getImageLayerTransformScreenBorderPoints(shape, doc.viewport) : [];
  const screenBounds = shape
    ? getPointExtents(borderPoints.length > 0 ? borderPoints : Object.values(screenCorners ?? {}))
    : null;
  const handlePoints = screenCorners ? getImageLayerTransformHandlePoints(screenCorners, mode) : [];
  const rotateHandlePoint = screenCorners ? getImageLayerTransformRotateHandlePoint(screenCorners) : null;
  const pivotScreenPoint = pivot ? docToScreen({ x: pivot.pivotX, y: pivot.pivotY }, doc.viewport) : null;
  const relativePoint = useCallback((point: Point) => {
    if (!screenBounds) {
      return { x: 0, y: 0 };
    }
    return {
      x: point.x - screenBounds.x,
      y: point.y - screenBounds.y,
    };
  }, [screenBounds]);

  const pointFromEvent = useCallback((event: ReactPointerEvent): Point | null => {
    const wrapper = wrapperRef.current;
    const currentDoc = useImageEditorStore.getState().documents.find((candidate) => candidate.id === doc.id);
    if (!wrapper || !currentDoc) return null;
    const rect = wrapper.getBoundingClientRect();
    return screenToDoc(
      { x: event.clientX - rect.left, y: event.clientY - rect.top },
      currentDoc.viewport,
    );
  }, [doc.id, wrapperRef]);

  const startResize = useCallback((handle: ImageLayerTransformHandle) => (
    event: ReactPointerEvent<HTMLButtonElement>
  ) => {
    if (!canTransform) return;
    const startPoint = pointFromEvent(event);
    const size = getImageLayerIntrinsicSize(layer);
    if (!startPoint || !size) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    markTransformPreviewSessionStructureChange(doc, layer);

    dragRef.current = {
      kind: 'resize',
      pointerId: event.pointerId,
      layerId: layer.id,
      handle,
      beforeLayers: doc.layers,
      origin: {
        x: layer.x,
        y: layer.y,
        width: size.width,
        height: size.height,
      },
      sourceBitmap: layer.bitmap ? cloneBitmap(layer.bitmap) : null,
      sourceMask: layer.mask ? cloneBitmap(layer.mask) : null,
      startPoint,
      textOrigin: layer.text ?? null,
    };
  }, [canTransform, doc.layers, layer, pointFromEvent]);

  const startSkew = useCallback((handle: ImageLayerTransformHandle) => (
    event: ReactPointerEvent<HTMLButtonElement>
  ) => {
    if (!canTransform || !intrinsicSize) return;
    const startPoint = pointFromEvent(event);
    if (!startPoint) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    beginTransformPreviewSession(doc, layer);

    dragRef.current = {
      kind: 'skew',
      pointerId: event.pointerId,
      layerId: layer.id,
      axis: handle === 'n' || handle === 's' ? 'x' : 'y',
      origin: {
        x: layer.x,
        y: layer.y,
        width: intrinsicSize.width,
        height: intrinsicSize.height,
      },
      startPoint,
      startSkewXDeg: layer.skewXDeg ?? 0,
      startSkewYDeg: layer.skewYDeg ?? 0,
    };
  }, [canTransform, doc, intrinsicSize, layer, pointFromEvent]);

  const startDistort = useCallback((corner: 'nw' | 'ne' | 'se' | 'sw') => (
    event: ReactPointerEvent<HTMLButtonElement>
  ) => {
    if (!canTransform || !shape) return;
    const startPoint = pointFromEvent(event);
    if (!startPoint) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    beginTransformPreviewSession(doc, layer);

    dragRef.current = {
      kind: 'distort',
      pointerId: event.pointerId,
      layerId: layer.id,
      corner,
      originCornerOffsets: shape.cornerOffsets,
      startPoint,
    };
  }, [canTransform, doc, layer, pointFromEvent, shape]);

  const startPerspective = useCallback((corner: 'nw' | 'ne' | 'se' | 'sw') => (
    event: ReactPointerEvent<HTMLButtonElement>
  ) => {
    if (!canTransform || !intrinsicSize) return;
    const startPoint = pointFromEvent(event);
    if (!startPoint) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    beginTransformPreviewSession(doc, layer);

    dragRef.current = {
      kind: 'perspective',
      pointerId: event.pointerId,
      layerId: layer.id,
      corner,
      origin: {
        x: layer.x,
        y: layer.y,
        width: intrinsicSize.width,
        height: intrinsicSize.height,
      },
      startPoint,
      startPerspectiveX: layer.perspectiveX ?? 0,
      startPerspectiveY: layer.perspectiveY ?? 0,
    };
  }, [canTransform, doc, intrinsicSize, layer, pointFromEvent]);

  const startWarp = useCallback((handle: 'n' | 'e' | 's' | 'w') => (
    event: ReactPointerEvent<HTMLButtonElement>
  ) => {
    if (!canTransform || !intrinsicSize) return;
    const startPoint = pointFromEvent(event);
    if (!startPoint) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    beginTransformPreviewSession(doc, layer);

    dragRef.current = {
      kind: 'warp',
      pointerId: event.pointerId,
      layerId: layer.id,
      handle,
      origin: {
        x: layer.x,
        y: layer.y,
        width: intrinsicSize.width,
        height: intrinsicSize.height,
      },
      startPoint,
      startWarp: {
        top: layer.warp?.top ?? 0,
        right: layer.warp?.right ?? 0,
        bottom: layer.warp?.bottom ?? 0,
        left: layer.warp?.left ?? 0,
      },
    };
  }, [canTransform, doc, intrinsicSize, layer, pointFromEvent]);

  const startRotate = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!canTransform || !pivot) return;
    const startPoint = pointFromEvent(event);
    if (!startPoint) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const center = { x: pivot.pivotX, y: pivot.pivotY };
    beginTransformPreviewSession(doc, layer);

    dragRef.current = {
      kind: 'rotate',
      pointerId: event.pointerId,
      layerId: layer.id,
      before: getLayerTransformSnapshot(layer),
      center,
      startPointerDeg: calculateLayerRotationDeg(center, startPoint, false),
      startRotationDeg: layer.rotationDeg ?? 0,
    };
  }, [canTransform, layer, pivot, pointFromEvent]);

  const startPivot = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!canTransform || !intrinsicSize) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    beginTransformPreviewSession(doc, layer);

    dragRef.current = {
      kind: 'pivot',
      pointerId: event.pointerId,
      layerId: layer.id,
      before: getLayerTransformSnapshot(layer),
      size: intrinsicSize,
    };
  }, [canTransform, intrinsicSize, layer]);

  const continueTransform = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const point = pointFromEvent(event);
    if (!point) return;
    event.preventDefault();
    event.stopPropagation();

    const state = useImageEditorStore.getState();
    const currentDoc = state.documents.find((candidate) => candidate.id === doc.id);
    const currentLayer = currentDoc?.layers.find((candidate) => candidate.id === drag.layerId);
    if (!currentDoc || !currentLayer) return;

    if (drag.kind === 'rotate') {
      const pointerDeg = calculateLayerRotationDeg(drag.center, point, false);
      const nextRotation = normalizeTransformRotation(
        drag.startRotationDeg + pointerDeg - drag.startPointerDeg,
        event.shiftKey,
      );
      state.updateLayer(currentDoc.id, currentLayer.id, { rotationDeg: nextRotation });
      requestRender();
      return;
    }

    if (drag.kind === 'pivot') {
      const nextOriginX = clampTransformOrigin(
        drag.size.width > 0 ? (point.x - currentLayer.x) / drag.size.width : 0.5,
      );
      const nextOriginY = clampTransformOrigin(
        drag.size.height > 0 ? (point.y - currentLayer.y) / drag.size.height : 0.5,
      );
      state.updateLayer(currentDoc.id, currentLayer.id, {
        transformOriginX: nextOriginX,
        transformOriginY: nextOriginY,
      });
      requestRender();
      return;
    }

    if (drag.kind === 'skew') {
      const nextSkewDeg = calculateLayerSkewDeg({
        axis: drag.axis,
        origin: drag.origin,
        delta: { x: point.x - drag.startPoint.x, y: point.y - drag.startPoint.y },
        startSkewDeg: drag.axis === 'x' ? drag.startSkewXDeg : drag.startSkewYDeg,
        snapToFifteenDegrees: event.shiftKey,
      });
      state.updateLayer(currentDoc.id, currentLayer.id, drag.axis === 'x' ? {
        skewXDeg: nextSkewDeg,
      } : {
        skewYDeg: nextSkewDeg,
      });
      requestRender();
      return;
    }

    if (drag.kind === 'distort') {
      const nextCornerOffsets = moveLayerDistortCornerOffset({
        corner: drag.corner,
        originOffsets: drag.originCornerOffsets,
        delta: { x: point.x - drag.startPoint.x, y: point.y - drag.startPoint.y },
      });
      state.updateLayer(currentDoc.id, currentLayer.id, {
        cornerOffsets: nextCornerOffsets,
      });
      requestRender();
      return;
    }

    if (drag.kind === 'perspective') {
      const delta = { x: point.x - drag.startPoint.x, y: point.y - drag.startPoint.y };
      state.updateLayer(currentDoc.id, currentLayer.id, {
        perspectiveX: calculateLayerPerspectiveValue({
          axis: 'x',
          corner: drag.corner,
          origin: drag.origin,
          delta,
          startPerspective: drag.startPerspectiveX,
        }),
        perspectiveY: calculateLayerPerspectiveValue({
          axis: 'y',
          corner: drag.corner,
          origin: drag.origin,
          delta,
          startPerspective: drag.startPerspectiveY,
        }),
      });
      requestRender();
      return;
    }

    if (drag.kind === 'warp') {
      const delta = { x: point.x - drag.startPoint.x, y: point.y - drag.startPoint.y };
      state.updateLayer(currentDoc.id, currentLayer.id, {
        warp: {
          ...drag.startWarp,
          [drag.handle]: calculateLayerWarpValue({
            handle: drag.handle,
            origin: drag.origin,
            delta,
            startWarp: drag.startWarp[
              drag.handle === 'n'
                ? 'top'
                : drag.handle === 'e'
                  ? 'right'
                  : drag.handle === 's'
                    ? 'bottom'
                    : 'left'
            ],
          }),
        },
      });
      requestRender();
      return;
    }

    const rect = resizeLayerRectFromHandle({
      handle: drag.handle,
      origin: drag.origin,
      delta: { x: point.x - drag.startPoint.x, y: point.y - drag.startPoint.y },
      keepAspect: event.shiftKey,
    });
    const patch: Partial<ImageLayer> = { x: rect.x, y: rect.y };

    if (drag.sourceBitmap) {
      patch.bitmap = resizeBitmapToLayerRect(drag.sourceBitmap, rect);
      if (drag.sourceMask) {
        patch.mask = resizeBitmapToLayerRect(drag.sourceMask, rect);
      }
    } else if (drag.textOrigin) {
      patch.text = {
        ...drag.textOrigin,
        boxWidth: rect.width,
        boxHeight: rect.height,
      };
    }

    state.updateLayer(currentDoc.id, currentLayer.id, patch);
    requestRender();
  }, [doc.id, pointFromEvent, requestRender]);

  const finishTransform = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already be released by the browser.
    }

    const state = useImageEditorStore.getState();
    const currentDoc = state.documents.find((candidate) => candidate.id === doc.id);
    const currentLayer = currentDoc?.layers.find((candidate) => candidate.id === drag.layerId);

    if (currentDoc && currentLayer && !transformPreviewSessionHasPendingChanges(currentDoc)) {
      clearTransformPreviewSession();
    }

    dragRef.current = null;
    requestRender();
  }, [doc.id, requestRender]);

  if (!bounds || !canTransform || !shape || !screenCorners || !screenBounds || !rotateHandlePoint || !pivotScreenPoint) return null;

  const handleProps = {
    onPointerMove: continueTransform,
    onPointerUp: finishTransform,
    onPointerCancel: finishTransform,
  };

  return (
    <div
      className="pointer-events-none absolute z-20"
      data-image-layer-transform-overlay="true"
      style={{
        left: screenBounds.x,
        top: screenBounds.y,
        width: screenBounds.width,
        height: screenBounds.height,
      }}
    >
      <svg
        className="pointer-events-none absolute inset-0 overflow-visible"
        data-image-layer-transform-rotation-preview="true"
        height={Math.max(1, screenBounds.height)}
        width={Math.max(1, screenBounds.width)}
      >
        <polygon
          fill="rgba(103, 232, 249, 0.08)"
          points={(borderPoints.length > 0 ? borderPoints : Object.values(screenCorners)).map((point) => {
            const relative = relativePoint(point);
            return `${relative.x},${relative.y}`;
          }).join(' ')}
          stroke="rgba(165, 243, 252, 0.9)"
          strokeDasharray="4 3"
          strokeWidth="1"
        />
      </svg>
      {handlePoints.map(({ kind, handle, point, cursor }) => {
        const relative = relativePoint(point);
        const dataProps = kind === 'resize'
          ? { 'data-image-layer-transform-handle': String(handle) }
          : kind === 'skew'
            ? { 'data-image-layer-transform-skew-handle': String(handle) }
            : kind === 'distort'
              ? { 'data-image-layer-transform-distort-handle': String(handle) }
              : kind === 'perspective'
                ? { 'data-image-layer-transform-perspective-handle': String(handle) }
                : { 'data-image-layer-transform-warp-handle': String(handle) };
        const pointerDown = kind === 'resize'
          ? startResize(handle as ImageLayerTransformHandle)
          : kind === 'skew'
            ? startSkew(handle as ImageLayerTransformHandle)
            : kind === 'distort'
              ? startDistort(handle as 'nw' | 'ne' | 'se' | 'sw')
              : kind === 'perspective'
                ? startPerspective(handle as 'nw' | 'ne' | 'se' | 'sw')
                : startWarp(handle as 'n' | 'e' | 's' | 'w');
        return (
          <button
            {...handleProps}
            aria-label={`${
              kind === 'resize'
                ? 'Resize'
                : kind === 'skew'
                  ? 'Skew'
                  : kind === 'distort'
                    ? 'Distort'
                    : kind === 'perspective'
                      ? 'Perspective'
                      : 'Warp'
            } layer ${handle}`}
            className="pointer-events-auto absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded border border-cyan-50/80 bg-cyan-300 shadow-[0_0_0_1px_rgba(8,11,18,0.95)]"
            key={`${kind}-${handle}`}
            onPointerDown={pointerDown}
            style={{
              left: relative.x,
              top: relative.y,
              cursor,
            }}
            title={`${
              kind === 'resize'
                ? 'Resize'
                : kind === 'skew'
                  ? 'Skew'
                  : kind === 'distort'
                    ? 'Distort'
                    : kind === 'perspective'
                      ? 'Perspective'
                      : 'Warp'
            } ${String(handle).toUpperCase()}`}
            type="button"
            {...dataProps}
          />
        );
      })}
      <button
        {...handleProps}
        aria-label="Layer pivot"
        className="pointer-events-auto absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border border-amber-100 bg-amber-400/80 shadow-md shadow-black/50"
        data-image-layer-pivot-handle="true"
        onPointerDown={startPivot}
        style={{
          left: relativePoint(pivotScreenPoint).x,
          top: relativePoint(pivotScreenPoint).y,
        }}
        title="Move pivot"
        type="button"
      />
      <button
        {...handleProps}
        aria-label="Rotate layer"
        className="pointer-events-auto absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-50 bg-[#10131b] text-cyan-100 shadow-md shadow-black/40"
        data-image-layer-rotate-handle="true"
        onPointerDown={startRotate}
        style={{
          left: relativePoint(rotateHandlePoint).x,
          top: relativePoint(rotateHandlePoint).y,
        }}
        title="Rotate layer"
        type="button"
      >
        <span className="block h-full w-full rounded-full border border-cyan-300/60" />
      </button>
    </div>
  );
}

type TransformDragState =
  | {
      kind: 'resize';
      pointerId: number;
      layerId: string;
      handle: ImageLayerTransformHandle;
      beforeLayers: ImageLayer[];
      origin: ImageLayerTransformRect;
      sourceBitmap: LayerBitmap | null;
      sourceMask: LayerBitmap | null;
      startPoint: Point;
      textOrigin: ImageLayer['text'] | null;
    }
  | {
      kind: 'rotate';
      pointerId: number;
      layerId: string;
      before: ReturnType<typeof getLayerTransformSnapshot>;
      center: Point;
      startPointerDeg: number;
      startRotationDeg: number;
    }
  | {
      kind: 'pivot';
      pointerId: number;
      layerId: string;
      before: ReturnType<typeof getLayerTransformSnapshot>;
      size: { width: number; height: number };
    }
  | {
      kind: 'skew';
      pointerId: number;
      layerId: string;
      axis: 'x' | 'y';
      origin: ImageLayerTransformRect;
      startPoint: Point;
      startSkewXDeg: number;
      startSkewYDeg: number;
    }
  | {
      kind: 'distort';
      pointerId: number;
      layerId: string;
      corner: 'nw' | 'ne' | 'se' | 'sw';
      originCornerOffsets: NonNullable<ImageLayer['cornerOffsets']>;
      startPoint: Point;
    }
  | {
      kind: 'perspective';
      pointerId: number;
      layerId: string;
      corner: 'nw' | 'ne' | 'se' | 'sw';
      origin: ImageLayerTransformRect;
      startPoint: Point;
      startPerspectiveX: number;
      startPerspectiveY: number;
    }
  | {
      kind: 'warp';
      pointerId: number;
      layerId: string;
      handle: 'n' | 'e' | 's' | 'w';
      origin: ImageLayerTransformRect;
      startPoint: Point;
      startWarp: {
        top: number;
        right: number;
        bottom: number;
        left: number;
      };
    };

function resizeBitmapToLayerRect(source: LayerBitmap, rect: ImageLayerTransformRect): LayerBitmap {
  const bitmap = createBitmap(rect.width, rect.height);
  const ctx = bitmap.getContext('2d');
  if (ctx) {
    ctx.drawImage(source, 0, 0, rect.width, rect.height);
  }
  return bitmap;
}

function normalizeTransformRotation(rotationDeg: number, snapToFifteenDegrees: boolean): number {
  let normalized = rotationDeg;
  if (snapToFifteenDegrees) {
    normalized = Math.round(normalized / 15) * 15;
  }
  while (normalized > 180) normalized -= 360;
  while (normalized <= -180) normalized += 360;
  return Math.round(normalized * 100) / 100;
}

function getLayerTransformSnapshot(layer: ImageLayer) {
  const origin = resolveImageLayerTransformOrigin(layer);
  return {
    x: layer.x,
    y: layer.y,
    rotationDeg: layer.rotationDeg ?? 0,
    transformOriginX: origin.x,
    transformOriginY: origin.y,
  };
}

function getPointExtents(points: Point[]): { x: number; y: number; width: number; height: number } | null {
  if (points.length === 0) return null;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

function clampTransformOrigin(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, Math.round(value * 1000) / 1000));
}
