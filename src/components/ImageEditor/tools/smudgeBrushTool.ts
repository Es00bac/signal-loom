import { cloneBitmap, getBitmapImageData, putBitmapImageData } from '../LayerBitmap';
import {
  applySmudgeBrushToBitmap,
  buildRetouchSampleSource,
  describeRetouchBrushToolPlan,
  type RetouchSampleSource,
} from '../ImageRetouch';
import { canEditImageLayerPixels } from '../../../lib/imageLayerLocks';
import { DEFAULT_RETOUCH_TOOL_SETTINGS, type LayerBitmap, type RetouchSampleMode } from '../../../types/imageEditor';
import { resolveRetouchTargetLayer } from './retouchTargetLayer';
import type { Point, ToolEnv, ToolHandler } from './types';

interface SmudgeBrushStroke {
  layerId: string;
  bitmapBefore: OffscreenCanvas;
  sampleSource: RetouchSampleSource;
  sampleMode: RetouchSampleMode;
  lastPoint: Point;
}

let stroke: SmudgeBrushStroke | null = null;

export const smudgeBrushCapabilityDescriptor = describeRetouchBrushToolPlan({
  tool: 'smudge',
  size: 25,
  strength: 0.5,
});

export interface SmudgeBrushReadinessDescriptor {
  descriptorId: 'image-smudge-brush-readiness:v1';
  version: 1;
  tool: 'smudge';
  readiness: 'ready' | 'blocked';
  implemented: string[];
  unsupported: string[];
  compositeSampling: {
    requested: RetouchSampleMode;
    applied: RetouchSampleMode;
    supported: true;
    supportedModes: RetouchSampleMode[];
    bounded: true;
    source: 'previous-stroke-point-current-layer' | 'previous-stroke-point-live-composite';
    coordinateSpace: RetouchSampleSource['coordinateSpace'];
    caveat: string;
  };
  routeSafety: {
    activeLayerEditable: boolean;
    activeTarget: 'layer' | 'mask';
    canPaint: boolean;
    blockers: string[];
  };
  actionReadiness: {
    label: 'Smudge brush stroke';
    deterministic: true;
    recordable: true;
    requiresSamplePoint: false;
    signature: string;
  };
  previewSignature: string;
}

export function describeSmudgeBrushReadiness({
  sampleMode = DEFAULT_RETOUCH_TOOL_SETTINGS.sampleMode,
  activeLayerEditable = true,
  activeTarget = 'layer',
  requestedChannel = 'rgb',
  output = 'activeLayer',
}: {
  sampleMode?: RetouchSampleMode;
  activeLayerEditable?: boolean;
  activeTarget?: 'layer' | 'mask';
  requestedChannel?: string;
  output?: 'activeLayer';
} = {}): SmudgeBrushReadinessDescriptor {
  const blockers = [
    ...(!activeLayerEditable ? ['active-layer-not-editable'] : []),
    ...(activeTarget !== 'layer' ? ['layer-mask-target-unsupported'] : []),
    ...(requestedChannel !== 'rgb' ? ['channel-target-unsupported'] : []),
  ];
  const coordinateSpace: RetouchSampleSource['coordinateSpace'] = sampleMode === 'currentLayer' ? 'layer' : 'document';
  const actionSignature = buildSmudgeFinishingReadinessSignature({ sampleMode, output });
  const descriptor: SmudgeBrushReadinessDescriptor = {
    descriptorId: 'image-smudge-brush-readiness:v1',
    version: 1,
    tool: 'smudge',
    readiness: blockers.length === 0 ? 'ready' : 'blocked',
    implemented: [
      'previous-stroke-point-current-layer-smudge',
      'bounded-current-and-below-composite-sampling',
      'bounded-all-layers-composite-sampling',
      'live-composite-resampling-between-dabs',
      'undoable-active-layer-pixel-output',
    ],
    unsupported: [
      'editable-non-destructive-smudge-layer',
      'single-channel-smudge-routing',
      'finger-paint-start-color',
    ],
    compositeSampling: {
      requested: sampleMode,
      applied: sampleMode,
      supported: true,
      supportedModes: ['currentLayer', 'currentAndBelow', 'allLayers'],
      bounded: true,
      source: sampleMode === 'currentLayer'
        ? 'previous-stroke-point-current-layer'
        : 'previous-stroke-point-live-composite',
      coordinateSpace,
      caveat: 'Composite smudge sampling is bounded to the document and resamples the current visible composite between drag dabs.',
    },
    routeSafety: {
      activeLayerEditable,
      activeTarget,
      canPaint: blockers.length === 0,
      blockers,
    },
    actionReadiness: {
      label: 'Smudge brush stroke',
      deterministic: true,
      recordable: true,
      requiresSamplePoint: false,
      signature: actionSignature,
    },
    previewSignature: '',
  };

  descriptor.previewSignature = `image-smudge-brush-readiness:v1:${JSON.stringify({
    sampleMode,
    coordinateSpace,
    activeTarget,
    requestedChannel,
    output,
    blockers,
  })}`;

  return descriptor;
}

export const smudgeBrushReadinessDescriptor = describeSmudgeBrushReadiness();
export const smudgeBrushFinishingReadinessSignature = smudgeBrushReadinessDescriptor.actionReadiness.signature;

export const smudgeBrushTool: ToolHandler = {
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
      sampleMode: retouchSettings.sampleMode,
      lastPoint: point,
    };
  },

  onPointerMove(env, point) {
    if (!stroke) return;
    smudgeBetween(env, stroke.lastPoint, point);
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
  const sourceLayerPoint = {
    x: sourcePoint.x - layer.x,
    y: sourcePoint.y - layer.y,
  };
  const targetLayerPoint = {
    x: targetPoint.x - layer.x,
    y: targetPoint.y - layer.y,
  };
  if (stroke.sampleSource.coordinateSpace === 'document') {
    const liveSampleSource = buildRetouchSampleSource({
      doc: env.doc,
      layer,
      layerSnapshot: cloneBitmap(layer.bitmap),
      sampleMode: stroke.sampleMode,
    });
    applySmudgeBrushToBitmapWithSource(layer.bitmap, {
      sourceBitmap: liveSampleSource.bitmap,
      sourcePoint,
      targetPoint: targetLayerPoint,
      size: env.brushSettings.size,
      strength: env.brushSettings.opacity,
    });
    return;
  }
  applySmudgeBrushToBitmap(layer.bitmap, {
    sourcePoint: sourceLayerPoint,
    targetPoint: targetLayerPoint,
    size: env.brushSettings.size,
    strength: env.brushSettings.opacity,
  });
}

function applySmudgeBrushToBitmapWithSource(
  bitmap: LayerBitmap,
  options: {
    sourceBitmap: LayerBitmap;
    sourcePoint: Point;
    targetPoint: Point;
    size: number;
    strength: number;
  },
): void {
  const next = applySmudgeBrushWithSourceImageData(
    getBitmapImageData(bitmap),
    getBitmapImageData(options.sourceBitmap),
    options,
  );
  putBitmapImageData(bitmap, next);
}

function applySmudgeBrushWithSourceImageData(
  targetImageData: ImageData,
  sourceImageData: ImageData,
  options: {
    sourcePoint: Point;
    targetPoint: Point;
    size: number;
    strength: number;
  },
): ImageData {
  const output = cloneImageData(targetImageData);
  const radius = Math.max(0, (options.size - 1) / 2);
  const integerRadius = Math.ceil(radius);
  const strength = clamp01(options.strength);
  const sourceCenterX = Math.round(options.sourcePoint.x);
  const sourceCenterY = Math.round(options.sourcePoint.y);
  const targetCenterX = Math.round(options.targetPoint.x);
  const targetCenterY = Math.round(options.targetPoint.y);

  for (let y = -integerRadius; y <= integerRadius; y += 1) {
    for (let x = -integerRadius; x <= integerRadius; x += 1) {
      const distance = Math.sqrt(x * x + y * y);
      if (distance > radius + 0.001) continue;

      const sourceX = sourceCenterX + x;
      const sourceY = sourceCenterY + y;
      const targetX = targetCenterX + x;
      const targetY = targetCenterY + y;
      if (!contains(sourceImageData, sourceX, sourceY) || !contains(targetImageData, targetX, targetY)) continue;

      const sourceOffset = (sourceY * sourceImageData.width + sourceX) * 4;
      const targetOffset = (targetY * output.width + targetX) * 4;
      output.data[targetOffset] = mixByte(targetImageData.data[targetOffset], sourceImageData.data[sourceOffset], strength);
      output.data[targetOffset + 1] = mixByte(targetImageData.data[targetOffset + 1], sourceImageData.data[sourceOffset + 1], strength);
      output.data[targetOffset + 2] = mixByte(targetImageData.data[targetOffset + 2], sourceImageData.data[sourceOffset + 2], strength);
      output.data[targetOffset + 3] = mixByte(targetImageData.data[targetOffset + 3], sourceImageData.data[sourceOffset + 3], strength);
    }
  }

  return output;
}

function buildSmudgeFinishingReadinessSignature({
  sampleMode,
  output,
}: {
  sampleMode: RetouchSampleMode;
  output: 'activeLayer';
}): string {
  return `image-retouch-action-readiness:v1:${JSON.stringify({
    tool: 'smudge',
    sampleMode,
    output,
    recordable: true,
    requiresSamplePoint: false,
    compositeSampling: 'bounded',
  })}`;
}

function cloneImageData(imageData: ImageData): ImageData {
  return {
    width: imageData.width,
    height: imageData.height,
    data: new Uint8ClampedArray(imageData.data),
  } as ImageData;
}

function contains(imageData: ImageData, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < imageData.width && y < imageData.height;
}

function mixByte(from: number | undefined, to: number | undefined, amount: number): number {
  return Math.round((from ?? 0) + ((to ?? 0) - (from ?? 0)) * amount);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
