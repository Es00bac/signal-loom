import type { ImageLayer } from '../../../types/imageEditor';
import { cloneBitmap, createBitmap, getBitmapImageData } from '../LayerBitmap';
import { applyLinearGradientToBitmap } from '../ImageGradientFill';
import type { Point, ToolEnv, ToolHandler } from './types';

interface GradientStroke {
  layerId: string;
  bitmapBefore: OffscreenCanvas;
  start: Point;
  last: Point;
}

let stroke: GradientStroke | null = null;

export const gradientTool: ToolHandler = {
  onPointerDown(env, point) {
    const layer = env.activeLayer;
    if (!layer || layer.locked) return;
    const bitmap = ensureBitmap(env, layer);
    stroke = {
      layerId: layer.id,
      bitmapBefore: cloneBitmap(bitmap),
      start: point,
      last: point,
    };
    previewGradient(env, point);
  },

  onPointerMove(env, point) {
    if (!stroke) return;
    stroke.last = point;
    previewGradient(env, point);
  },

  onPointerUp(env, point) {
    if (!stroke) return;
    stroke.last = point;
    previewGradient(env, point);
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

function previewGradient(env: ToolEnv, end: Point): void {
  if (!stroke) return;
  const layer = env.doc.layers.find((candidate) => candidate.id === stroke?.layerId);
  if (!layer?.bitmap) return;
  applyLinearGradientToBitmap(layer.bitmap, {
    from: {
      x: stroke.start.x - layer.x,
      y: stroke.start.y - layer.y,
    },
    to: {
      x: end.x - layer.x,
      y: end.y - layer.y,
    },
    color: env.brushSettings.color,
    opacity: env.brushSettings.opacity,
    sourceImageData: getBitmapImageData(stroke.bitmapBefore),
  });
  env.requestRender();
}

function ensureBitmap(env: ToolEnv, layer: ImageLayer): OffscreenCanvas {
  if (layer.bitmap) return layer.bitmap;
  const bitmap = createBitmap(env.doc.width, env.doc.height);
  env.store.updateLayer(env.doc.id, layer.id, { bitmap });
  return bitmap;
}
