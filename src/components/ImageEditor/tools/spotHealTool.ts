import { cloneBitmap } from '../LayerBitmap';
import {
  applySpotHealToBitmap,
  buildRetouchSampleSource,
  describeRetouchBrushRouteSupport,
  describeRetouchParityChecks,
  describeRetouchPreviewIds,
  describeRetouchToolReadiness,
  describeSpotHealToolWorkflow,
  type RetouchSampleSource,
} from '../ImageRetouch';
import { canEditImageLayerPixels } from '../../../lib/imageLayerLocks';
import { DEFAULT_RETOUCH_TOOL_SETTINGS } from '../../../types/imageEditor';
import { resolveRetouchTargetLayer } from './retouchTargetLayer';
import type { Point, ToolEnv, ToolHandler } from './types';

interface SpotHealStroke {
  layerId: string;
  bitmapBefore: OffscreenCanvas;
  sampleSource: RetouchSampleSource;
  lastPoint: Point;
}

let stroke: SpotHealStroke | null = null;

export const spotHealWorkflowCapabilityDescriptor = describeSpotHealToolWorkflow({
  sampleMode: DEFAULT_RETOUCH_TOOL_SETTINGS.sampleMode,
  size: 25,
  opacity: 1,
});

export const spotHealReadinessDescriptor = describeRetouchToolReadiness({
  tool: 'spotHeal',
  sampleMode: DEFAULT_RETOUCH_TOOL_SETTINGS.sampleMode,
});

export const spotHealRepairOutputParityCheckDescriptor = describeRetouchParityChecks({
  healSampleMode: DEFAULT_RETOUCH_TOOL_SETTINGS.sampleMode,
}).repairOutput;

export const spotHealPreviewIdDescriptor = describeRetouchPreviewIds({
  healSampleMode: DEFAULT_RETOUCH_TOOL_SETTINGS.sampleMode,
}).spotHeal;

export const spotHealRouteSupportDescriptor = describeRetouchBrushRouteSupport({
  tool: 'spotHeal',
  sampleMode: DEFAULT_RETOUCH_TOOL_SETTINGS.sampleMode,
});

export const spotHealTool: ToolHandler = {
  onPointerDown(env, point) {
    const layer = resolveRetouchTargetLayer(env, point);
    if (!canEditImageLayerPixels(layer) || !layer?.bitmap) return;
    const bitmapBefore = cloneBitmap(layer.bitmap);
    const settings = env.retouchToolSettings ?? DEFAULT_RETOUCH_TOOL_SETTINGS;
    stroke = {
      layerId: layer.id,
      bitmapBefore,
      sampleSource: buildRetouchSampleSource({
        doc: env.doc,
        layer,
        layerSnapshot: bitmapBefore,
        sampleMode: settings.sampleMode,
      }),
      lastPoint: point,
    };
    healAt(env, point);
    env.requestRender({ invalidateBitmapCache: true });
  },

  onPointerMove(env, point) {
    if (!stroke) return;
    healBetween(env, stroke.lastPoint, point);
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
  const sourcePoint = stroke.sampleSource.coordinateSpace === 'document'
    ? targetPoint
    : {
        x: targetPoint.x - layer.x,
        y: targetPoint.y - layer.y,
      };
  applySpotHealToBitmap(layer.bitmap, {
    targetPoint: {
      x: targetPoint.x - layer.x,
      y: targetPoint.y - layer.y,
    },
    sourcePoint,
    size: env.brushSettings.size,
    opacity: env.brushSettings.opacity,
    sourceBitmap: stroke.sampleSource.bitmap,
  });
}
