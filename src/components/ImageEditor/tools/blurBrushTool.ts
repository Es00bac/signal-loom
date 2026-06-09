import { cloneBitmap } from '../LayerBitmap';
import { applyBlurBrushToBitmap } from '../ImageRetouch';
import type { Point, ToolEnv, ToolHandler } from './types';

interface BlurBrushStroke {
  layerId: string;
  bitmapBefore: OffscreenCanvas;
  lastPoint: Point;
}

let stroke: BlurBrushStroke | null = null;

export const blurBrushTool: ToolHandler = {
  onPointerDown(env, point) {
    const layer = env.activeLayer;
    if (!layer || layer.locked || !layer.bitmap) return;
    stroke = {
      layerId: layer.id,
      bitmapBefore: cloneBitmap(layer.bitmap),
      lastPoint: point,
    };
    blurAt(env, point);
    env.requestRender();
  },

  onPointerMove(env, point) {
    if (!stroke) return;
    blurBetween(env, stroke.lastPoint, point);
    stroke.lastPoint = point;
    env.requestRender();
  },

  onPointerUp(env) {
    if (!stroke) return;
    const layer = env.doc.layers.find((candidate) => candidate.id === stroke?.layerId);
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

function blurBetween(env: ToolEnv, from: Point, to: Point): void {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const step = Math.max(1, env.brushSettings.size / 3);
  const steps = Math.max(1, Math.ceil(distance / step));
  for (let index = 1; index <= steps; index += 1) {
    const amount = index / steps;
    blurAt(env, {
      x: from.x + (to.x - from.x) * amount,
      y: from.y + (to.y - from.y) * amount,
    });
  }
}

function blurAt(env: ToolEnv, targetPoint: Point): void {
  if (!stroke) return;
  const layer = env.doc.layers.find((candidate) => candidate.id === stroke?.layerId);
  if (!layer?.bitmap) return;
  applyBlurBrushToBitmap(layer.bitmap, {
    targetPoint: {
      x: targetPoint.x - layer.x,
      y: targetPoint.y - layer.y,
    },
    size: env.brushSettings.size,
    strength: env.brushSettings.opacity,
    sourceBitmap: stroke.bitmapBefore,
  });
}
