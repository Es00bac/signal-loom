import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { Check, Pencil, X } from 'lucide-react';
import { useImageEditorStore } from '../../store/imageEditorStore';
import { useSourceBinStore } from '../../store/sourceBinStore';
import { CompositeRenderer } from './CompositeRenderer';
import { bitmapFromUrl } from './LayerBitmap';
import { docToScreen, fitToContainer, panBy, screenToDoc, zoomAround } from './viewport';
import { getSelection } from './selectionRegistry';
import { useToolDispatcher } from './tools/dispatcher';
import type { ImageDocument, ImageLayer } from '../../types/imageEditor';
import {
  getImageTextEditOverlayBounds,
  imageTextLayerContainsPoint,
} from './ImageTextPresets';
import { updateTextLayerFromStyle } from './ImageTextLayer';

export function ImageEditorCanvas() {
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<CompositeRenderer | null>(null);

  useToolDispatcher({ wrapperRef, rendererRef });

  const activeDoc = useImageEditorStore((s) =>
    s.documents.find((d) => d.id === s.activeDocId) ?? null,
  );
  const brushSettings = useImageEditorStore((s) => s.brushSettings);
  const tool = useImageEditorStore((s) => s.tool);
  const setViewport = useImageEditorStore((s) => s.setViewport);
  const setViewportContainerSize = useImageEditorStore((s) => s.setViewportContainerSize);
  const setDocumentDimensions = useImageEditorStore((s) => s.setDocumentDimensions);
  const addLayer = useImageEditorStore((s) => s.addLayer);
  const setActiveLayer = useImageEditorStore((s) => s.setActiveLayer);
  const updateLayer = useImageEditorStore((s) => s.updateLayer);
  const pushOperation = useImageEditorStore((s) => s.pushOperation);
  const [editingTextLayerId, setEditingTextLayerId] = useState<string | null>(null);
  const [editingTextDraft, setEditingTextDraft] = useState('');

  const activeTextLayer = useMemo(() => {
    if (!activeDoc?.activeLayerId) return null;
    const layer = activeDoc.layers.find((candidate) => candidate.id === activeDoc.activeLayerId) ?? null;
    return layer?.text && layer.metadata?.editableText !== false ? layer : null;
  }, [activeDoc]);

  const activeTextBounds = activeTextLayer && activeDoc
    ? getImageTextEditOverlayBounds(activeTextLayer, activeDoc.viewport)
    : null;
  const editingTextLayer = activeDoc?.layers.find((layer) => layer.id === editingTextLayerId) ?? null;
  const editingTextBounds = editingTextLayer && activeDoc
    ? getImageTextEditOverlayBounds(editingTextLayer, activeDoc.viewport)
    : null;

  const startTextEditing = useCallback((layer: ImageLayer) => {
    if (!layer.text || layer.locked) return;
    setEditingTextLayerId(layer.id);
    setEditingTextDraft(layer.text.content);
  }, []);

  const cancelTextEditing = useCallback(() => {
    setEditingTextLayerId(null);
    setEditingTextDraft('');
  }, []);

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
    const nextLayer = updateTextLayerFromStyle(layer, { content: editingTextDraft });
    const after = doc.layers.map((candidate) => candidate.id === layer.id ? nextLayer : candidate);
    pushOperation({ kind: 'layerOp', docId: doc.id, before, after });
    updateLayer(doc.id, layer.id, nextLayer);
    cancelTextEditing();
    rendererRef.current?.requestRender();
  }, [cancelTextEditing, editingTextDraft, editingTextLayerId, pushOperation, updateLayer]);

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

    let panning = false;
    let panStart: { x: number; y: number } | null = null;
    let panOrigin: { panX: number; panY: number } | null = null;
    let spaceHeld = false;

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
        if (!panning) wrapper.style.cursor = '';
      }
    };
    const onDown = (event: PointerEvent) => {
      const state = useImageEditorStore.getState();
      const handToolActive = state.tool === 'hand';
      // Middle button, space-held, or the dedicated Hand tool activates pan.
      if (event.button === 1 || spaceHeld || (handToolActive && event.button === 0)) {
        const doc = state.documents.find((d) => d.id === state.activeDocId);
        if (!doc) return;
        event.preventDefault();
        event.stopPropagation();
        panning = true;
        panStart = { x: event.clientX, y: event.clientY };
        panOrigin = { panX: doc.viewport.panX, panY: doc.viewport.panY };
        wrapper.setPointerCapture(event.pointerId);
        wrapper.style.cursor = 'grabbing';
      }
    };
    const onMove = (event: PointerEvent) => {
      if (!panning || !panStart || !panOrigin) return;
      event.preventDefault();
      event.stopPropagation();
      const state = useImageEditorStore.getState();
      const doc = state.documents.find((d) => d.id === state.activeDocId);
      if (!doc) return;
      const dx = event.clientX - panStart.x;
      const dy = event.clientY - panStart.y;
      const next = panBy(
        { zoom: doc.viewport.zoom, panX: panOrigin.panX, panY: panOrigin.panY },
        dx,
        dy,
      );
      state.setViewport(doc.id, next);
      rendererRef.current?.requestRender();
    };
    const onUp = (event: PointerEvent) => {
      if (!panning) return;
      panning = false;
      panStart = null;
      panOrigin = null;
      try {
        wrapper.releasePointerCapture(event.pointerId);
      } catch {
        // ignore
      }
      wrapper.style.cursor = spaceHeld || useImageEditorStore.getState().tool === 'hand' ? 'grab' : '';
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
  }, []);

  void docToScreen; // re-export hint for tooling

  return (
    <div
      ref={wrapperRef}
      className={`theme-surface relative flex-1 ${tool === 'hand' ? 'cursor-grab' : ''}`}
      onDoubleClick={handleCanvasDoubleClick}
    >
      <canvas ref={canvasElRef} className="block h-full w-full" />

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

      <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2">
        <div className="flex gap-3 rounded-md border border-cyan-300/10 bg-[#1a1b23] px-3 py-1.5 text-xs text-cyan-100/50">
          <span>Brush: {brushSettings.size}px</span>
          <span>|</span>
          <span>Opacity: {Math.round(brushSettings.opacity * 100)}%</span>
          <span>|</span>
          <span>Hardness: {Math.round(brushSettings.hardness * 100)}%</span>
        </div>
      </div>
    </div>
  );
}

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
        transformOrigin: 'top left',
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
