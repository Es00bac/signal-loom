import { cloneBitmap } from '../LayerBitmap';
import { describeRetouchBrushToolPlan, type RetouchSampleSource } from '../ImageRetouch';
import { canEditImageLayerPixels } from '../../../lib/imageLayerLocks';
import { DEFAULT_RETOUCH_TOOL_SETTINGS, type RetouchSampleMode } from '../../../types/imageEditor';
import { resolveRetouchTargetLayer } from './retouchTargetLayer';
import { BrushStrokeController } from '../../../lib/brushEngine';
import { createRetouchStrokeController } from './retouchBrushEngine';
import type { ToolHandler } from './types';

interface SmudgeBrushStroke {
  layerId: string;
  bitmapBefore: OffscreenCanvas;
  controller: BrushStrokeController;
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
    const controller = createRetouchStrokeController(env, layer, bitmapBefore, 'smudge');
    controller.anchor({ x: point.x - layer.x, y: point.y - layer.y });
    stroke = { layerId: layer.id, bitmapBefore, controller };
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

