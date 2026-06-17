import { useEffect, useRef } from 'react';
import { useImageEditorStore } from '../../../store/imageEditorStore';
import { screenToDoc as screenToDocMath, docToScreen as docToScreenMath } from '../viewport';
import type { CompositeRenderer } from '../CompositeRenderer';
import type { EditorTool } from '../../../types/imageEditor';
import type { ToolEnv, ToolHandler, Point, Modifiers } from './types';
import { modsFrom, resolveModeFromMods } from './types';
import { moveTool } from './moveTool';
import { brushTool, eraserTool, backgroundEraserTool, magicEraserTool, brushKeyResize } from './brushTool';
import { cloneStampTool } from './cloneStampTool';
import { spotHealTool } from './spotHealTool';
import { blurBrushTool } from './blurBrushTool';
import { sharpenBrushTool } from './sharpenBrushTool';
import { smudgeBrushTool } from './smudgeBrushTool';
import { burnBrushTool, dodgeBrushTool } from './toneBrushTool';
import { spongeDesaturateBrushTool, spongeSaturateBrushTool } from './spongeBrushTool';
import { paintBucketTool } from './paintBucketTool';
import { gradientTool } from './gradientTool';
import { ellipseShapeTool, rectShapeTool } from './shapeTool';
import { marqueeTool } from './marqueeTool';
import { lassoTool, lassoIsPolygonalActive, lassoPolygonalDoubleClick } from './lassoTool';
import { magicWandTool } from './magicWandTool';
import { penTool, commitActivePenPath } from './penTool';
import { eyedropperTool } from './eyedropperTool';
import { cropTool } from './cropTool';
import { textTool } from './textTool';

const handTool: ToolHandler = {};

const HANDLERS: Record<EditorTool, ToolHandler> = {
  hand: handTool,
  move: moveTool,
  marquee: marqueeTool,
  lasso: lassoTool,
  magicWand: magicWandTool,
  pen: penTool,
  brush: brushTool,
  eraser: eraserTool,
  backgroundEraser: backgroundEraserTool,
  magicEraser: magicEraserTool,
  cloneStamp: cloneStampTool,
  spotHeal: spotHealTool,
  blurBrush: blurBrushTool,
  sharpenBrush: sharpenBrushTool,
  smudgeBrush: smudgeBrushTool,
  dodgeBrush: dodgeBrushTool,
  burnBrush: burnBrushTool,
  spongeSaturateBrush: spongeSaturateBrushTool,
  spongeDesaturateBrush: spongeDesaturateBrushTool,
  paintBucket: paintBucketTool,
  gradientTool,
  rectShape: rectShapeTool,
  ellipseShape: ellipseShapeTool,
  crop: cropTool,
  text: textTool,
  eyedropper: eyedropperTool,
};

/**
 * Tools where holding Ctrl temporarily acts as the eyedropper — quick colour
 * sampling without switching tools (à la Photoshop/GIMP's Alt-pick).
 */
export const EYEDROPPER_MODIFIER_TOOLS = new Set<EditorTool>([
  'brush', 'eraser', 'paintBucket', 'gradientTool', 'rectShape', 'ellipseShape', 'pen',
]);

export function shouldUseEyedropperOverride(tool: EditorTool, mods: Pick<Modifiers, 'ctrl'>): boolean {
  return mods.ctrl && EYEDROPPER_MODIFIER_TOOLS.has(tool);
}

/**
 * Tools whose stroke repeatedly mutates the active layer's bitmap in place across pointer-moves.
 * While one of these is dragging, the compositor uses the fast cached-backdrop preview path.
 */
export const STROKE_PAINT_TOOLS = new Set<EditorTool>([
  'brush', 'eraser', 'backgroundEraser', 'cloneStamp', 'spotHeal',
  'blurBrush', 'sharpenBrush', 'smudgeBrush', 'dodgeBrush', 'burnBrush',
  'spongeSaturateBrush', 'spongeDesaturateBrush',
]);

export type ImageToolDispatcherMethod = 'pointerDown' | 'pointerMove' | 'pointerUp' | 'keyDown' | 'cancel';
export type ImageToolDispatcherSupportStatus = 'full' | 'partial' | 'inactive';

export interface ImageToolDispatcherSupportItem {
  tool: EditorTool;
  support: ImageToolDispatcherSupportStatus;
  methods: ImageToolDispatcherMethod[];
  caveat: string;
}

export interface ImageToolDispatcherSupportDescriptor {
  descriptorId: 'image-tool-dispatcher-support:v1';
  version: 1;
  tools: ImageToolDispatcherSupportItem[];
  unsupportedTools: EditorTool[];
  partialTools: EditorTool[];
  signature: string;
}

const DISPATCHER_METHOD_ORDER: ImageToolDispatcherMethod[] = [
  'pointerDown',
  'pointerMove',
  'pointerUp',
  'keyDown',
  'cancel',
];

function listDispatcherMethods(handler: ToolHandler): ImageToolDispatcherMethod[] {
  const methods: ImageToolDispatcherMethod[] = [];
  if (handler.onPointerDown) methods.push('pointerDown');
  if (handler.onPointerMove) methods.push('pointerMove');
  if (handler.onPointerUp) methods.push('pointerUp');
  if (handler.onKeyDown) methods.push('keyDown');
  if (handler.onCancel) methods.push('cancel');
  return methods;
}

function describeDispatcherSupport(methods: ImageToolDispatcherMethod[]): ImageToolDispatcherSupportStatus {
  if (methods.length === 0) return 'inactive';
  return DISPATCHER_METHOD_ORDER.every((method) => methods.includes(method)) ? 'full' : 'partial';
}

export function describeImageToolDispatcherSupport(): ImageToolDispatcherSupportDescriptor {
  const tools = (Object.entries(HANDLERS) as Array<[EditorTool, ToolHandler]>).map(([tool, handler]) => {
    const methods = listDispatcherMethods(handler);
    const support = describeDispatcherSupport(methods);
    return {
      tool,
      support,
      methods,
      caveat:
        support === 'inactive'
          ? 'Toolbar/shortcut selection exists, but no canvas ToolHandler callbacks are registered.'
          : support === 'partial'
            ? 'Tool has a canvas handler, but not every pointer/key/cancel callback is registered.'
            : 'Tool has pointer, keyboard, and cancel canvas handler callbacks registered.',
    };
  });

  return {
    descriptorId: 'image-tool-dispatcher-support:v1',
    version: 1,
    tools,
    unsupportedTools: tools.filter((tool) => tool.support === 'inactive').map((tool) => tool.tool),
    partialTools: tools.filter((tool) => tool.support === 'partial').map((tool) => tool.tool),
    signature: tools
      .map((tool) => `${tool.tool}:${tool.methods.length ? tool.methods.join(',') : 'none'}`)
      .join('|'),
  };
}

interface DispatcherOptions {
  wrapperRef: React.RefObject<HTMLDivElement | null>;
  rendererRef: React.RefObject<CompositeRenderer | null>;
}

export const IMAGE_CANVAS_INTERACTION_OVERLAY_ATTRIBUTE = 'data-image-canvas-interaction-overlay';

export function shouldIgnoreImageCanvasToolEvent(event: Event): boolean {
  const target = event.target;
  return target instanceof Element && target.closest(`[${IMAGE_CANVAS_INTERACTION_OVERLAY_ATTRIBUTE}="true"]`) !== null;
}

/**
 * The sub-frame pointer samples the OS batched into one `pointermove`. High-rate styli (Wacom
 * Cintiq, S Pen) and trackpads emit several samples per display frame; `getCoalescedEvents()`
 * exposes them so a fast stroke is sampled accurately instead of as straight segments between
 * frame-spaced points. Falls back to the event itself where the API is unavailable (older WebKit)
 * or returns nothing.
 */
export function coalescedPointerEvents(event: PointerEvent): PointerEvent[] {
  const getter = (event as PointerEvent & { getCoalescedEvents?: () => PointerEvent[] }).getCoalescedEvents;
  if (typeof getter !== 'function') return [event];
  const samples = getter.call(event);
  return samples && samples.length > 0 ? samples : [event];
}

/**
 * Wires pointer/keyboard events on the canvas wrapper to the active tool's
 * handler. Builds a ToolEnv per-event with the current store snapshot.
 */
export function useToolDispatcher({ wrapperRef, rendererRef }: DispatcherOptions): void {
  const lastToolRef = useRef<EditorTool | null>(null);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    const buildEnv = (): ToolEnv | null => {
      const state = useImageEditorStore.getState();
      const doc = state.documents.find((d) => d.id === state.activeDocId);
      if (!doc) return null;
      const activeLayer = doc.layers.find((l) => l.id === doc.activeLayerId) ?? null;
      const viewport = doc.viewport;
      const requestRender: ToolEnv['requestRender'] = (options) => {
        rendererRef.current?.requestRender(options);
      };
      return {
        doc,
        activeLayer,
        backgroundColor: state.backgroundColor,
        brushSettings: state.brushSettings,
        cropToolSettings: state.cropToolSettings,
        gradientToolSettings: state.gradientToolSettings,
        retouchToolSettings: state.retouchToolSettings,
        shapeToolSettings: state.shapeToolSettings,
        selectionToolSettings: state.selectionToolSettings,
        screenToDoc: (point: Point) => screenToDocMath(point, viewport),
        docToScreen: (point: Point) => docToScreenMath(point, viewport),
        pushOperation: state.pushOperation,
        store: state,
        requestRender,
        resolveSelectionMode: (mods: Modifiers) =>
          resolveModeFromMods(state.selectionToolSettings.mode, mods),
      };
    };

    // Cache the canvas client rect for the duration of a gesture. `getBoundingClientRect()` can
    // force a synchronous layout, and calling it on every (120-240Hz) stylus sample is pure
    // overhead since the canvas position is stable during a stroke. Refresh on pointer-down and
    // invalidate on scroll/resize so it stays correct.
    let cachedRect: DOMRect | null = null;
    const getRect = (): DOMRect => (cachedRect ??= el.getBoundingClientRect());
    const invalidateRect = (): void => {
      cachedRect = null;
    };
    const screenPoint = (event: PointerEvent): Point => {
      const rect = getRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };

    // True for the duration of a Ctrl-held stroke that started on a paint tool —
    // the whole interaction samples colour (eyedropper) instead of painting.
    let eyedropperOverride = false;
    const onDown = (event: PointerEvent) => {
      if (shouldIgnoreImageCanvasToolEvent(event)) return;
      invalidateRect(); // start of a gesture — re-measure once, then reuse for every move
      const env = buildEnv();
      if (!env) return;
      const docPoint = env.screenToDoc(screenPoint(event));
      const mods = modsFrom(event);
      el.setPointerCapture(event.pointerId);
      if (shouldUseEyedropperOverride(useImageEditorStore.getState().tool, mods)) {
        eyedropperOverride = true;
        eyedropperTool.onPointerDown?.(env, docPoint, mods, event);
        return;
      }
      eyedropperOverride = false;
      if (STROKE_PAINT_TOOLS.has(useImageEditorStore.getState().tool)) {
        env.store.setPaintingStroke(true);
      }
      currentHandler().onPointerDown?.(env, docPoint, mods, event);
    };
    const onMove = (event: PointerEvent) => {
      if (shouldIgnoreImageCanvasToolEvent(event)) return;
      const env = buildEnv();
      if (!env) return;
      const mods = modsFrom(event);
      if (eyedropperOverride) {
        // Continuous sampling while Ctrl-dragging — a single sample is enough for colour pick.
        eyedropperTool.onPointerDown?.(env, env.screenToDoc(screenPoint(event)), mods, event);
        return;
      }
      // Replay every sub-frame pointer sample the browser batched into this event. On a 120-240Hz
      // stylus (Cintiq / S Pen) the OS coalesces several moves per frame; feeding each one (with its
      // own pressure/tilt/timestamp) keeps fast strokes smooth instead of cutting corners into
      // polygons. The composite is still rAF-coalesced downstream, so this adds dab accuracy, not
      // extra repaints.
      const handler = currentHandler();
      const onPointerMove = handler.onPointerMove;
      if (!onPointerMove) return;
      for (const sample of coalescedPointerEvents(event)) {
        onPointerMove.call(handler, env, env.screenToDoc(screenPoint(sample)), mods, sample);
      }
    };
    const onUp = (event: PointerEvent) => {
      if (shouldIgnoreImageCanvasToolEvent(event)) return;
      const env = buildEnv();
      if (!env) return;
      const docPoint = env.screenToDoc(screenPoint(event));
      try {
        el.releasePointerCapture(event.pointerId);
      } catch {
        // ignore: pointer was already released or never captured
      }
      if (eyedropperOverride) {
        eyedropperOverride = false;
        return;
      }
      const wasStroke = STROKE_PAINT_TOOLS.has(useImageEditorStore.getState().tool);
      currentHandler().onPointerUp?.(env, docPoint, modsFrom(event), event);
      // Leave the fast preview path and force one normal full-quality render of the committed
      // result. Always clearing is safe (idempotent) even if the gesture wasn't a paint stroke.
      env.store.setPaintingStroke(false);
      if (wasStroke) rendererRef.current?.requestRender();
    };
    const onDouble = (event: MouseEvent) => {
      if (shouldIgnoreImageCanvasToolEvent(event)) return;
      // Polygonal lasso: double-click closes the polygon.
      if (lassoIsPolygonalActive()) {
        const fakeEnv = buildEnv();
        if (fakeEnv) lassoPolygonalDoubleClick(fakeEnv);
        return;
      }
      // Pen: double-click finishes (commits) the path in progress — the familiar finish gesture, so
      // users aren't stuck pressing Escape to get out of path creation.
      if (useImageEditorStore.getState().tool === 'pen') {
        const env = buildEnv();
        if (env) commitActivePenPath(env);
      }
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return;
      if (event.target instanceof HTMLTextAreaElement) return;
      const env = buildEnv();
      if (!env) return;
      const handler = currentHandler();
      const mods = modsFrom(event);
      // brush size shortcuts apply globally during brush-like tools
      const tool = useImageEditorStore.getState().tool;
      if (
        (tool === 'brush' ||
          tool === 'eraser' ||
          tool === 'backgroundEraser' ||
          tool === 'cloneStamp' ||
          tool === 'spotHeal' ||
          tool === 'blurBrush' ||
          tool === 'sharpenBrush' ||
          tool === 'smudgeBrush' ||
          tool === 'dodgeBrush' ||
          tool === 'burnBrush' ||
          tool === 'spongeSaturateBrush' ||
          tool === 'spongeDesaturateBrush') &&
        brushKeyResize(env, event.key)
      ) {
        event.preventDefault();
        return;
      }
      handler.onKeyDown?.(env, event.key, mods, event);
    };

    function currentHandler(): ToolHandler {
      const state = useImageEditorStore.getState();
      const tool = state.tool;
      if (lastToolRef.current && lastToolRef.current !== tool) {
        // Switching tools mid-stroke — cancel the previous one cleanly.
        const env = (() => {
          const doc = state.documents.find((d) => d.id === state.activeDocId);
          if (!doc) return null;
          return {
            doc,
            activeLayer: doc.layers.find((l) => l.id === doc.activeLayerId) ?? null,
            backgroundColor: state.backgroundColor,
            brushSettings: state.brushSettings,
            cropToolSettings: state.cropToolSettings,
            gradientToolSettings: state.gradientToolSettings,
            retouchToolSettings: state.retouchToolSettings,
            shapeToolSettings: state.shapeToolSettings,
            selectionToolSettings: state.selectionToolSettings,
            screenToDoc: (point: Point) => screenToDocMath(point, doc.viewport),
            docToScreen: (point: Point) => docToScreenMath(point, doc.viewport),
            pushOperation: state.pushOperation,
            store: state,
            requestRender: (options) => rendererRef.current?.requestRender(options),
            resolveSelectionMode: (mods: Modifiers) =>
              resolveModeFromMods(state.selectionToolSettings.mode, mods),
          } as ToolEnv;
        })();
        if (env) HANDLERS[lastToolRef.current].onCancel?.(env);
      }
      lastToolRef.current = tool;
      return HANDLERS[tool];
    }

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('dblclick', onDouble);
    window.addEventListener('keydown', onKey);
    // Scrolling or resizing can move the canvas; drop the cached rect so it re-measures lazily.
    window.addEventListener('scroll', invalidateRect, { capture: true, passive: true });
    window.addEventListener('resize', invalidateRect);

    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('dblclick', onDouble);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', invalidateRect, { capture: true } as EventListenerOptions);
      window.removeEventListener('resize', invalidateRect);
    };
  }, [wrapperRef, rendererRef]);
}
