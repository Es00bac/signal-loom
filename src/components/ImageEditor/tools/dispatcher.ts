import { useEffect, useRef } from 'react';
import { useImageEditorStore } from '../../../store/imageEditorStore';
import { screenToDoc as screenToDocMath, docToScreen as docToScreenMath } from '../viewport';
import type { CompositeRenderer } from '../CompositeRenderer';
import type { EditorTool } from '../../../types/imageEditor';
import type { ToolEnv, ToolHandler, Point, Modifiers } from './types';
import { modsFrom, resolveModeFromMods } from './types';
import { moveTool } from './moveTool';
import { brushTool, eraserTool, brushKeyResize } from './brushTool';
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
  brush: brushTool,
  eraser: eraserTool,
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

interface DispatcherOptions {
  wrapperRef: React.RefObject<HTMLDivElement | null>;
  rendererRef: React.RefObject<CompositeRenderer | null>;
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
      const requestRender = () => {
        rendererRef.current?.requestRender();
      };
      return {
        doc,
        activeLayer,
        brushSettings: state.brushSettings,
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

    const screenPoint = (event: PointerEvent): Point => {
      const rect = el.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };

    const onDown = (event: PointerEvent) => {
      const env = buildEnv();
      if (!env) return;
      const handler = currentHandler();
      const docPoint = env.screenToDoc(screenPoint(event));
      el.setPointerCapture(event.pointerId);
      handler.onPointerDown?.(env, docPoint, modsFrom(event), event);
    };
    const onMove = (event: PointerEvent) => {
      const env = buildEnv();
      if (!env) return;
      const handler = currentHandler();
      const docPoint = env.screenToDoc(screenPoint(event));
      handler.onPointerMove?.(env, docPoint, modsFrom(event), event);
    };
    const onUp = (event: PointerEvent) => {
      const env = buildEnv();
      if (!env) return;
      const handler = currentHandler();
      const docPoint = env.screenToDoc(screenPoint(event));
      try {
        el.releasePointerCapture(event.pointerId);
      } catch {
        // ignore: pointer was already released or never captured
      }
      handler.onPointerUp?.(env, docPoint, modsFrom(event), event);
    };
    const onDouble = () => {
      // Polygonal lasso: double-click closes the polygon.
      if (lassoIsPolygonalActive()) {
        const fakeEnv = buildEnv();
        if (fakeEnv) lassoPolygonalDoubleClick(fakeEnv);
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
            brushSettings: state.brushSettings,
            selectionToolSettings: state.selectionToolSettings,
            screenToDoc: (point: Point) => screenToDocMath(point, doc.viewport),
            docToScreen: (point: Point) => docToScreenMath(point, doc.viewport),
            pushOperation: state.pushOperation,
            store: state,
            requestRender: () => rendererRef.current?.requestRender(),
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

    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('dblclick', onDouble);
      window.removeEventListener('keydown', onKey);
    };
  }, [wrapperRef, rendererRef]);
}
