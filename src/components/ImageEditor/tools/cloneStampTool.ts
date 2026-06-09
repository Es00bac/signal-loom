import { cloneBitmap } from '../LayerBitmap';
import { applyCloneStampToBitmap, resolveCloneStampSourcePoint } from '../ImageRetouch';
import type { Point, ToolEnv, ToolHandler } from './types';

interface CloneStampStroke {
  layerId: string;
  bitmapBefore: OffscreenCanvas;
  samplePoint: Point;
  strokeStart: Point;
  lastPoint: Point;
}

let samplePoint: Point | null = null;
let stroke: CloneStampStroke | null = null;

export const cloneStampTool: ToolHandler = {
  onPointerDown(env, point, mods) {
    if (mods.alt) {
      samplePoint = point;
      return;
    }

    const layer = env.activeLayer;
    if (!layer || layer.locked || !layer.bitmap || !samplePoint) return;
    stroke = {
      layerId: layer.id,
      bitmapBefore: cloneBitmap(layer.bitmap),
      samplePoint,
      strokeStart: point,
      lastPoint: point,
    };
    stampAt(env, point);
    env.requestRender();
  },

  onPointerMove(env, point) {
    if (!stroke) return;
    stampBetween(env, stroke.lastPoint, point);
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

export function hasCloneStampSample(): boolean {
  return Boolean(samplePoint);
}

function stampBetween(env: ToolEnv, from: Point, to: Point): void {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const step = Math.max(1, env.brushSettings.size / 3);
  const steps = Math.max(1, Math.ceil(distance / step));
  for (let index = 1; index <= steps; index += 1) {
    const amount = index / steps;
    stampAt(env, {
      x: from.x + (to.x - from.x) * amount,
      y: from.y + (to.y - from.y) * amount,
    });
  }
}

function stampAt(env: ToolEnv, targetPoint: Point): void {
  if (!stroke) return;
  const layer = env.doc.layers.find((candidate) => candidate.id === stroke?.layerId);
  if (!layer?.bitmap) return;
  const sourcePoint = resolveCloneStampSourcePoint({
    samplePoint: {
      x: stroke.samplePoint.x - layer.x,
      y: stroke.samplePoint.y - layer.y,
    },
    strokeStart: {
      x: stroke.strokeStart.x - layer.x,
      y: stroke.strokeStart.y - layer.y,
    },
    targetPoint: {
      x: targetPoint.x - layer.x,
      y: targetPoint.y - layer.y,
    },
  });
  applyCloneStampToBitmap(layer.bitmap, {
    sourcePoint,
    targetPoint: {
      x: targetPoint.x - layer.x,
      y: targetPoint.y - layer.y,
    },
    size: env.brushSettings.size,
    opacity: env.brushSettings.opacity,
  });
}
