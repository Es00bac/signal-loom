import { cloneBitmap } from '../LayerBitmap';
import {
  applyBlurBrushToBitmap,
  buildRetouchSampleSource,
  describeRetouchBrushToolPlan,
  describeRetouchToolReadiness,
  type RetouchSampleSource,
} from '../ImageRetouch';
import { canEditImageLayerPixels } from '../../../lib/imageLayerLocks';
import { DEFAULT_RETOUCH_TOOL_SETTINGS } from '../../../types/imageEditor';
import { resolveRetouchTargetLayer } from './retouchTargetLayer';
import type { Point, ToolEnv, ToolHandler } from './types';

interface BlurBrushStroke {
  layerId: string;
  bitmapBefore: OffscreenCanvas;
  sampleSource: RetouchSampleSource;
  lastPoint: Point;
}

let stroke: BlurBrushStroke | null = null;

export const blurBrushCapabilityDescriptor = describeRetouchBrushToolPlan({
  tool: 'blur',
  size: 25,
  strength: 0.5,
});

export const blurBrushReadinessDescriptor = describeRetouchToolReadiness({
  tool: 'blur',
  sampleMode: DEFAULT_RETOUCH_TOOL_SETTINGS.sampleMode,
});

export const blurBrushFinishingReadinessSignature = blurBrushReadinessDescriptor.actionReadiness.signature;

export const blurBrushTool: ToolHandler = {
  onPointerDown(env, point) {
    const layer = resolveRetouchTargetLayer(env, point);
    if (!canEditImageLayerPixels(layer) || !layer?.bitmap) return;
    const bitmapBefore = cloneBitmap(layer.bitmap);
    const retouchSettings = env.retouchToolSettings ?? DEFAULT_RETOUCH_TOOL_SETTINGS;
    stroke = {
      layerId: layer.id,
      bitmapBefore,
      sampleSource: buildRetouchSampleSource({
        doc: env.doc,
        layer,
        layerSnapshot: bitmapBefore,
        sampleMode: retouchSettings.sampleMode,
      }),
      lastPoint: point,
    };
    blurAt(env, point);
    env.requestRender({ invalidateBitmapCache: true });
  },

  onPointerMove(env, point) {
    if (!stroke) return;
    blurBetween(env, stroke.lastPoint, point);
    stroke.lastPoint = point;
    env.requestRender({ invalidateBitmapCache: true });
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
      env.requestRender({ invalidateBitmapCache: true });
    }
    stroke = null;
  },

  onCancel(env) {
    if (!stroke) return;
    const layer = env.doc.layers.find((candidate) => candidate.id === stroke?.layerId);
    if (layer?.bitmap) {
      layer.bitmap.getContext('2d')?.drawImage(stroke.bitmapBefore, 0, 0);
      env.requestRender({ invalidateBitmapCache: true });
    }
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
  const targetLayerPoint = {
    x: targetPoint.x - layer.x,
    y: targetPoint.y - layer.y,
  };
  applyBlurBrushToBitmap(layer.bitmap, {
    targetPoint: targetLayerPoint,
    sourcePoint: stroke.sampleSource.coordinateSpace === 'document' ? targetPoint : targetLayerPoint,
    size: env.brushSettings.size,
    strength: env.brushSettings.opacity,
    sourceBitmap: stroke.sampleSource.bitmap,
  });
}
