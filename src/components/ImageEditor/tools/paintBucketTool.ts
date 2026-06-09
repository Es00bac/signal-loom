import type { ImageLayer } from '../../../types/imageEditor';
import { cloneBitmap, createBitmap } from '../LayerBitmap';
import { fillContiguousColorRegionInBitmap } from '../ImagePaintBucket';
import type { ToolEnv, ToolHandler } from './types';

export const paintBucketTool: ToolHandler = {
  onPointerDown(env, point) {
    const layer = ensureLayer(env);
    if (!layer || layer.locked) return;
    const bitmap = ensureBitmap(env, layer);
    const before = cloneBitmap(bitmap);
    fillContiguousColorRegionInBitmap(bitmap, {
      seed: {
        x: point.x - layer.x,
        y: point.y - layer.y,
      },
      color: env.brushSettings.color,
      opacity: env.brushSettings.opacity,
      tolerance: env.selectionToolSettings.magicWandTolerance,
    });
    env.pushOperation({
      kind: 'paint',
      docId: env.doc.id,
      layerId: layer.id,
      before,
      after: cloneBitmap(bitmap),
    });
    env.store.bumpLayerBitmapVersion(env.doc.id, layer.id);
    env.store.markDocumentDirty(env.doc.id);
    env.requestRender();
  },
};

function ensureLayer(env: ToolEnv): ImageLayer | null {
  return env.activeLayer;
}

function ensureBitmap(env: ToolEnv, layer: ImageLayer): OffscreenCanvas {
  if (layer.bitmap) return layer.bitmap;
  const bitmap = createBitmap(env.doc.width, env.doc.height);
  env.store.updateLayer(env.doc.id, layer.id, { bitmap });
  return bitmap;
}
