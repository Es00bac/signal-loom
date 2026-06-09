import { cloneBitmap } from '../LayerBitmap';
import { applySpongeBrushToBitmap, type SpongeBrushMode } from '../ImageRetouch';
import type { Point, ToolEnv, ToolHandler } from './types';

interface SpongeBrushStroke {
  layerId: string;
  bitmapBefore: OffscreenCanvas;
  lastPoint: Point;
}

function makeSpongeBrushTool(mode: SpongeBrushMode): ToolHandler {
  let stroke: SpongeBrushStroke | null = null;

  const spongeAt = (env: ToolEnv, targetPoint: Point) => {
    if (!stroke) return;
    const layer = env.doc.layers.find((candidate) => candidate.id === stroke?.layerId);
    if (!layer?.bitmap) return;
    applySpongeBrushToBitmap(layer.bitmap, {
      mode,
      targetPoint: {
        x: targetPoint.x - layer.x,
        y: targetPoint.y - layer.y,
      },
      size: env.brushSettings.size,
      strength: env.brushSettings.opacity,
    });
  };

  const spongeBetween = (env: ToolEnv, from: Point, to: Point) => {
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const step = Math.max(1, env.brushSettings.size / 3);
    const steps = Math.max(1, Math.ceil(distance / step));
    for (let index = 1; index <= steps; index += 1) {
      const amount = index / steps;
      spongeAt(env, {
        x: from.x + (to.x - from.x) * amount,
        y: from.y + (to.y - from.y) * amount,
      });
    }
  };

  return {
    onPointerDown(env, point) {
      const layer = env.activeLayer;
      if (!layer || layer.locked || !layer.bitmap) return;
      stroke = {
        layerId: layer.id,
        bitmapBefore: cloneBitmap(layer.bitmap),
        lastPoint: point,
      };
      spongeAt(env, point);
      env.requestRender();
    },

    onPointerMove(env, point) {
      if (!stroke) return;
      spongeBetween(env, stroke.lastPoint, point);
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
}

export const spongeSaturateBrushTool = makeSpongeBrushTool('saturate');
export const spongeDesaturateBrushTool = makeSpongeBrushTool('desaturate');
