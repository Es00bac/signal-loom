import { cloneBitmap } from '../LayerBitmap';
import {
  describeRetouchBrushToolPlan,
  describeRetouchToolReadiness,
} from '../ImageRetouch';
import { canEditImageLayerPixels } from '../../../lib/imageLayerLocks';
import { DEFAULT_RETOUCH_TOOL_SETTINGS } from '../../../types/imageEditor';
import { resolveRetouchTargetLayer } from './retouchTargetLayer';
import { BrushStrokeController } from '../../../lib/brushEngine';
import { createRetouchStrokeController } from './retouchBrushEngine';
import type { ToolHandler } from './types';

interface BlurBrushStroke {
  layerId: string;
  bitmapBefore: OffscreenCanvas;
  controller: BrushStrokeController;
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
    const controller = createRetouchStrokeController(env, layer, bitmapBefore, 'blur');
    controller.moveTo({ x: point.x - layer.x, y: point.y - layer.y });
    controller.previewInto(layer.bitmap);
    stroke = { layerId: layer.id, bitmapBefore, controller };
    env.requestRender({ invalidateBitmapCache: true });
  },

  onPointerMove(env, point) {
    if (!stroke) return;
    const layer = env.doc.layers.find((candidate) => candidate.id === stroke?.layerId);
    if (!layer?.bitmap) return;
    stroke.controller.moveTo({ x: point.x - layer.x, y: point.y - layer.y });
    stroke.controller.previewInto(layer.bitmap);
    env.requestRender({ invalidateBitmapCache: true });
  },

  onPointerUp(env) {
    if (!stroke) return;
    const layer = env.doc.layers.find((candidate) => candidate.id === stroke?.layerId);
    if (layer?.bitmap) {
      stroke.controller.commit(layer.bitmap);
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
    stroke.controller.cancel();
    const layer = env.doc.layers.find((candidate) => candidate.id === stroke?.layerId);
    if (layer?.bitmap) {
      layer.bitmap.getContext('2d')?.drawImage(stroke.bitmapBefore, 0, 0);
      env.requestRender({ invalidateBitmapCache: true });
    }
    stroke = null;
  },
};
