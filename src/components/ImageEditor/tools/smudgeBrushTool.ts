import { cloneBitmap } from '../LayerBitmap';
import { applySmudgeBrushToBitmap } from '../ImageRetouch';
import type { Point, ToolEnv, ToolHandler } from './types';

interface SmudgeBrushStroke {
  layerId: string;
  bitmapBefore: OffscreenCanvas;
  lastPoint: Point;
}

let stroke: SmudgeBrushStroke | null = null;

export const smudgeBrushTool: ToolHandler = {
  onPointerDown(env, point) {
    const layer = env.activeLayer;
    if (!layer || layer.locked || !layer.bitmap) return;
    stroke = {
      layerId: layer.id,
      bitmapBefore: cloneBitmap(layer.bitmap),
      lastPoint: point,
    };
  },

  onPointerMove(env, point) {
    if (!stroke) return;
    smudgeBetween(env, stroke.lastPoint, point);
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

function smudgeBetween(env: ToolEnv, from: Point, to: Point): void {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const step = Math.max(1, env.brushSettings.size / 3);
  const steps = Math.max(1, Math.ceil(distance / step));
  let source = from;

  for (let index = 1; index <= steps; index += 1) {
    const amount = index / steps;
    const target = {
      x: from.x + (to.x - from.x) * amount,
      y: from.y + (to.y - from.y) * amount,
    };
    smudgeAt(env, source, target);
    source = target;
  }
}

function smudgeAt(env: ToolEnv, sourcePoint: Point, targetPoint: Point): void {
  if (!stroke) return;
  const layer = env.doc.layers.find((candidate) => candidate.id === stroke?.layerId);
  if (!layer?.bitmap) return;
  applySmudgeBrushToBitmap(layer.bitmap, {
    sourcePoint: {
      x: sourcePoint.x - layer.x,
      y: sourcePoint.y - layer.y,
    },
    targetPoint: {
      x: targetPoint.x - layer.x,
      y: targetPoint.y - layer.y,
    },
    size: env.brushSettings.size,
    strength: env.brushSettings.opacity,
  });
}
