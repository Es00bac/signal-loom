import type { ToolEnv, ToolHandler, Point } from './types';
import type { ImageLayer } from '../../../types/imageEditor';
import { cloneBitmap, createBitmap } from '../LayerBitmap';
import { getSelection } from '../selectionRegistry';
import { maskToCanvas } from '../SelectionMask';
import {
  buildBrushDabs,
  normalizeBrushSettings,
  paintBrushDab,
  readBrushPressure,
  smoothBrushPoint,
} from '../ImageBrushEngine';

interface StrokeState {
  layerId: string;
  bitmapBefore: OffscreenCanvas;
  lastPoint: Point;
  isEraser: boolean;
  dabIndex: number;
  seed: number;
}

let stroke: StrokeState | null = null;

function ensureLayer(env: ToolEnv): ImageLayer | null {
  if (env.activeLayer) return env.activeLayer;
  return null;
}

function ensureBitmap(env: ToolEnv, layer: ImageLayer): OffscreenCanvas {
  if (layer.bitmap) return layer.bitmap;
  const bitmap = createBitmap(env.doc.width, env.doc.height);
  env.store.updateLayer(env.doc.id, layer.id, { bitmap });
  return bitmap;
}

function makeBrushTool(isEraser: boolean): ToolHandler {
  return {
    onPointerDown(env, point, _mods, event) {
      const layer = ensureLayer(env);
      if (!layer || layer.locked) return;
      const bitmap = ensureBitmap(env, layer);
      const before = cloneBitmap(bitmap);
      stroke = {
        layerId: layer.id,
        bitmapBefore: before,
        lastPoint: point,
        isEraser,
        dabIndex: 0,
        seed: Date.now() % 100000,
      };
      paintStrokeSegment(env, layer, bitmap, point, point, readBrushPressure(event));
      env.requestRender();
    },

    onPointerMove(env, point, _mods, event) {
      if (!stroke) return;
      const layer = env.doc.layers.find((l) => l.id === stroke!.layerId);
      if (!layer || !layer.bitmap) return;
      const settings = normalizeBrushSettings(env.brushSettings);
      const pressure = readBrushPressure(event);
      const smoothedPoint = smoothBrushPoint(stroke.lastPoint, point, settings.smoothing);
      paintStrokeSegment(env, layer, layer.bitmap, stroke.lastPoint, smoothedPoint, pressure);
      stroke.lastPoint = smoothedPoint;
      env.requestRender();
    },

    onPointerUp(env) {
      if (!stroke) return;
      const layer = env.doc.layers.find((l) => l.id === stroke!.layerId);
      if (layer?.bitmap) {
        env.pushOperation({
          kind: 'paint',
          docId: env.doc.id,
          layerId: layer.id,
          before: stroke.bitmapBefore,
          after: cloneBitmap(layer.bitmap),
        });
        env.store.bumpLayerBitmapVersion(env.doc.id, layer.id);
        env.store.markDocumentDirty(env.doc.id);
      }
      stroke = null;
    },

    onCancel() {
      stroke = null;
    },
  };
}

function paintStrokeSegment(
  env: ToolEnv,
  layer: ImageLayer,
  bitmap: OffscreenCanvas,
  from: Point,
  to: Point,
  pressure: number,
): void {
  const ctx = bitmap.getContext('2d');
  if (!ctx) return;
  const settings = normalizeBrushSettings(env.brushSettings);
  const color = stroke?.isEraser ? 'rgba(0,0,0,1)' : settings.color;
  const dabs = buildBrushDabs(from, to, settings, pressure, {
    seed: stroke?.seed ?? 0,
    startIndex: stroke?.dabIndex ?? 0,
  });

  if (stroke) {
    stroke.dabIndex += dabs.length;
  }

  // If a selection exists, restrict painting to its mask.
  const selection = getSelection(env.doc.id);
  if (selection) {
    const temp = createBitmap(bitmap.width, bitmap.height);
    const tempCtx = temp.getContext('2d');
    if (!tempCtx) return;
    const maskCanvas = maskToCanvas(selection, 255, 255, 255);
    paintDabs(tempCtx, dabs, layer, color, 'source-over');
    tempCtx.save();
    tempCtx.globalCompositeOperation = 'destination-in';
    tempCtx.translate(-layer.x, -layer.y);
    tempCtx.drawImage(maskCanvas, 0, 0);
    tempCtx.restore();

    ctx.save();
    ctx.globalCompositeOperation = stroke?.isEraser ? 'destination-out' : 'source-over';
    ctx.drawImage(temp, 0, 0);
    ctx.restore();
  } else {
    paintDabs(ctx, dabs, layer, color, stroke?.isEraser ? 'destination-out' : 'source-over');
  }
}

export const brushTool: ToolHandler = makeBrushTool(false);
export const eraserTool: ToolHandler = makeBrushTool(true);

// Used by tablet integration to enable pressure modulation without writing
// back to the store (avoiding the historical feedback loop).
export function readPressure(event: PointerEvent): number {
  return readBrushPressure(event);
}

// Touch-up modifier handler — `[` / `]` adjust brush size.
export function brushKeyResize(env: ToolEnv, key: string): boolean {
  if (key === '[') {
    env.store.setBrushSettings({
      size: Math.max(1, env.brushSettings.size - 2),
    });
    return true;
  }
  if (key === ']') {
    env.store.setBrushSettings({
      size: Math.min(512, env.brushSettings.size + 2),
    });
    return true;
  }
  return false;
}

function paintDabs(
  context: OffscreenCanvasRenderingContext2D,
  dabs: ReturnType<typeof buildBrushDabs>,
  layer: ImageLayer,
  color: string,
  compositeOperation: GlobalCompositeOperation,
): void {
  context.save();
  context.translate(-layer.x, -layer.y);
  for (const dab of dabs) {
    paintBrushDab(context, dab, color, compositeOperation);
  }
  context.restore();
}
