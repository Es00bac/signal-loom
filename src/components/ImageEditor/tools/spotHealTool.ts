import { cloneBitmap } from '../LayerBitmap';
import { applySpotHealToBitmap } from '../ImageRetouch';
import type { Point, ToolEnv, ToolHandler } from './types';

interface SpotHealStroke {
  layerId: string;
  bitmapBefore: OffscreenCanvas;
  lastPoint: Point;
}

let stroke: SpotHealStroke | null = null;

export const spotHealTool: ToolHandler = {
  onPointerDown(env, point) {
    const layer = env.activeLayer;
    if (!layer || layer.locked || !layer.bitmap) return;
    stroke = {
      layerId: layer.id,
      bitmapBefore: cloneBitmap(layer.bitmap),
      lastPoint: point,
    };
    healAt(env, point);
    env.requestRender();
  },

  onPointerMove(env, point) {
    if (!stroke) return;
    healBetween(env, stroke.lastPoint, point);
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

function healBetween(env: ToolEnv, from: Point, to: Point): void {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const step = Math.max(1, env.brushSettings.size / 3);
  const steps = Math.max(1, Math.ceil(distance / step));
  for (let index = 1; index <= steps; index += 1) {
    const amount = index / steps;
    healAt(env, {
      x: from.x + (to.x - from.x) * amount,
      y: from.y + (to.y - from.y) * amount,
    });
  }
}

function healAt(env: ToolEnv, targetPoint: Point): void {
  if (!stroke) return;
  const layer = env.doc.layers.find((candidate) => candidate.id === stroke?.layerId);
  if (!layer?.bitmap) return;
  applySpotHealToBitmap(layer.bitmap, {
    targetPoint: {
      x: targetPoint.x - layer.x,
      y: targetPoint.y - layer.y,
    },
    size: env.brushSettings.size,
    opacity: env.brushSettings.opacity,
    sourceBitmap: stroke.bitmapBefore,
  });
}
