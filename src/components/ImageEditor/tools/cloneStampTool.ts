import { cloneBitmap } from '../LayerBitmap';
import {
  applyCloneStampToBitmap,
  buildRetouchSampleSource,
  describeCloneStampToolWorkflow,
  describeRetouchBrushRouteSupport,
  describeRetouchParityChecks,
  describeRetouchPreviewIds,
  describeRetouchToolReadiness,
  resolveCloneStampSourcePoint,
  type RetouchSampleSource,
} from '../ImageRetouch';
import { canEditImageLayerPixels } from '../../../lib/imageLayerLocks';
import { DEFAULT_RETOUCH_TOOL_SETTINGS } from '../../../types/imageEditor';
import { resolveRetouchTargetLayer } from './retouchTargetLayer';
import type { Point, ToolEnv, ToolHandler } from './types';

interface CloneStampStroke {
  layerId: string;
  bitmapBefore: OffscreenCanvas;
  samplePoint: Point;
  strokeStart: Point;
  sampleSource: RetouchSampleSource;
  lastPoint: Point;
}

let samplePoint: Point | null = null;
let alignedOffset: Point | null = null;
let stroke: CloneStampStroke | null = null;

export const cloneStampWorkflowCapabilityDescriptor = describeCloneStampToolWorkflow({
  sampleMode: DEFAULT_RETOUCH_TOOL_SETTINGS.sampleMode,
  aligned: DEFAULT_RETOUCH_TOOL_SETTINGS.aligned,
  hasSamplePoint: false,
  size: 25,
  opacity: 1,
});

export const cloneStampReadinessDescriptor = describeRetouchToolReadiness({
  tool: 'cloneStamp',
  sampleMode: DEFAULT_RETOUCH_TOOL_SETTINGS.sampleMode,
  hasSamplePoint: false,
  aligned: DEFAULT_RETOUCH_TOOL_SETTINGS.aligned,
});

export const cloneStampParityCheckDescriptor = describeRetouchParityChecks({
  cloneSampleMode: DEFAULT_RETOUCH_TOOL_SETTINGS.sampleMode,
  cloneAligned: DEFAULT_RETOUCH_TOOL_SETTINGS.aligned,
  cloneHasSamplePoint: false,
}).cloneSource;

export const cloneStampPreviewIdDescriptor = describeRetouchPreviewIds({
  cloneSampleMode: DEFAULT_RETOUCH_TOOL_SETTINGS.sampleMode,
  cloneAligned: DEFAULT_RETOUCH_TOOL_SETTINGS.aligned,
  cloneHasSamplePoint: false,
}).cloneStamp;

export const cloneStampRouteSupportDescriptor = describeRetouchBrushRouteSupport({
  tool: 'cloneStamp',
  sampleMode: DEFAULT_RETOUCH_TOOL_SETTINGS.sampleMode,
  hasSamplePoint: false,
});

export const cloneStampTool: ToolHandler = {
  onPointerDown(env, point, mods) {
    if (mods.alt) {
      samplePoint = point;
      alignedOffset = null;
      return;
    }

    const layer = resolveRetouchTargetLayer(env, point);
    if (!canEditImageLayerPixels(layer) || !layer?.bitmap || !samplePoint) return;
    const bitmapBefore = cloneBitmap(layer.bitmap);
    const settings = env.retouchToolSettings ?? DEFAULT_RETOUCH_TOOL_SETTINGS;
    if (settings.aligned && !alignedOffset) {
      alignedOffset = {
        x: samplePoint.x - point.x,
        y: samplePoint.y - point.y,
      };
    }
    stroke = {
      layerId: layer.id,
      bitmapBefore,
      samplePoint,
      strokeStart: point,
      sampleSource: buildRetouchSampleSource({
        doc: env.doc,
        layer,
        layerSnapshot: bitmapBefore,
        sampleMode: settings.sampleMode,
      }),
      lastPoint: point,
    };
    stampAt(env, point);
    env.requestRender({ invalidateBitmapCache: true });
  },

  onPointerMove(env, point) {
    if (!stroke) return;
    stampBetween(env, stroke.lastPoint, point);
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
  const settings = env.retouchToolSettings ?? DEFAULT_RETOUCH_TOOL_SETTINGS;
  const sourceDocPoint = settings.aligned && alignedOffset
    ? {
        x: targetPoint.x + alignedOffset.x,
        y: targetPoint.y + alignedOffset.y,
      }
    : resolveCloneStampSourcePoint({
        samplePoint: stroke.samplePoint,
        strokeStart: stroke.strokeStart,
        targetPoint,
      });
  const sourcePoint = stroke.sampleSource.coordinateSpace === 'document'
    ? sourceDocPoint
    : {
        x: sourceDocPoint.x - layer.x,
        y: sourceDocPoint.y - layer.y,
      };
  applyCloneStampToBitmap(layer.bitmap, {
    sourcePoint,
    targetPoint: {
      x: targetPoint.x - layer.x,
      y: targetPoint.y - layer.y,
    },
    size: env.brushSettings.size,
    opacity: env.brushSettings.opacity,
    sourceBitmap: stroke.sampleSource.bitmap,
  });
}
