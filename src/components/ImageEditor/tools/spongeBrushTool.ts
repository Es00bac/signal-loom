import { cloneBitmap } from '../LayerBitmap';
import {
  applySpongeBrushToBitmap,
  describeRetouchBrushToolPlan,
  resolveRetouchStrokeDensityStep,
  type SpongeBrushMode,
} from '../ImageRetouch';
import { canEditImageLayerPixels } from '../../../lib/imageLayerLocks';
import { createRetouchOutputLayer, insertRetouchOutputLayer, type RetouchOutputLayerTool } from './retouchOutputLayer';
import { resolveRetouchTargetLayer } from './retouchTargetLayer';
import { brushStraightLineStart, recordBrushStrokeAnchor } from './brushLineAnchor';
import type { Point, ToolEnv, ToolHandler } from './types';

interface SpongeBrushStroke {
  layerId: string;
  sourceLayerId: string;
  targetLayer: NonNullable<ToolEnv['activeLayer']>;
  bitmapBefore: OffscreenCanvas | null;
  layersBefore: ToolEnv['doc']['layers'];
  outputMode: 'activeLayer' | 'newLayer';
  lastPoint: Point;
}

export const spongeBrushCapabilityDescriptor = describeRetouchBrushToolPlan({
  tool: 'sponge',
  mode: 'saturate',
  size: 25,
  strength: 0.5,
  spongeVibrance: 0.65,
  spongePreserveLuminosity: true,
});

function makeSpongeBrushTool(mode: SpongeBrushMode): ToolHandler {
  let stroke: SpongeBrushStroke | null = null;
  const toolKey = mode === 'saturate' ? 'spongeSaturateBrush' : 'spongeDesaturateBrush';

  const spongeAt = (env: ToolEnv, targetPoint: Point) => {
    if (!stroke) return;
    const layer = stroke.targetLayer;
    if (!layer?.bitmap) return;
    applySpongeBrushToBitmap(layer.bitmap, {
      mode,
      targetPoint: {
        x: targetPoint.x - layer.x,
        y: targetPoint.y - layer.y,
      },
      size: env.brushSettings.size,
      strength: env.brushSettings.opacity,
      vibrance: env.retouchToolSettings?.spongeVibrance ?? 0.65,
      preserveLuminosity: env.retouchToolSettings?.spongePreserveLuminosity ?? true,
    });
  };

  const spongeBetween = (env: ToolEnv, from: Point, to: Point) => {
    const airbrush = env.retouchToolSettings?.airbrush ?? false;
    const rate = env.retouchToolSettings?.rate ?? 0.5;
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const step = resolveRetouchStrokeDensityStep({
      size: env.brushSettings.size,
      airbrush,
      rate,
    });
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
    onPointerDown(env, point, mods) {
      const layer = resolveRetouchTargetLayer(env, point);
      if (!canEditImageLayerPixels(layer) || !layer?.bitmap) return;
      // Shift straight-line: sponge a straight segment from the previous stroke's end to this point.
      const lineStart = brushStraightLineStart(toolKey, env.doc.id, mods) ?? point;
      const outputMode = env.retouchToolSettings?.outputMode ?? 'activeLayer';
      const layersBefore = [...env.doc.layers];
      const targetLayer = outputMode === 'newLayer'
        ? createRetouchOutputLayer(layer, spongeModeToRetouchOutputTool(mode))
        : layer;
      if (outputMode === 'newLayer') {
        env.store.setLayers(
          env.doc.id,
          insertRetouchOutputLayer(layersBefore, layer.id, targetLayer),
          targetLayer.id,
        );
      }
      stroke = {
        layerId: targetLayer.id,
        sourceLayerId: layer.id,
        targetLayer,
        bitmapBefore: outputMode === 'newLayer' ? null : cloneBitmap(layer.bitmap),
        layersBefore,
        outputMode,
        lastPoint: lineStart,
      };
      if (lineStart !== point) {
        spongeBetween(env, lineStart, point);
      } else {
        spongeAt(env, point);
      }
      stroke.lastPoint = point;
      env.requestRender({ invalidateBitmapCache: true });
    },

    onPointerMove(env, point) {
      if (!stroke) return;
      spongeBetween(env, stroke.lastPoint, point);
      stroke.lastPoint = point;
      env.requestRender({ invalidateBitmapCache: true });
    },

    onPointerUp(env) {
      if (!stroke) return;
      recordBrushStrokeAnchor(toolKey, env.doc.id, stroke.lastPoint);
      const layer = stroke.targetLayer;
      if (layer?.bitmap && stroke.outputMode === 'newLayer') {
        const afterLayers = insertRetouchOutputLayer(stroke.layersBefore, stroke.sourceLayerId, layer);
        env.store.setLayers(env.doc.id, afterLayers, layer.id);
        env.pushOperation({
          kind: 'layerOp',
          docId: env.doc.id,
          before: stroke.layersBefore,
          after: afterLayers,
        });
        env.store.bumpLayerBitmapVersion(env.doc.id, layer.id);
        env.store.markDocumentDirty(env.doc.id);
        env.requestRender({ invalidateBitmapCache: true });
      } else if (layer?.bitmap && stroke.bitmapBefore) {
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
      const layer = stroke.targetLayer;
      if (stroke.outputMode === 'newLayer') {
        env.store.setLayers(env.doc.id, stroke.layersBefore, stroke.sourceLayerId);
        env.requestRender({ invalidateBitmapCache: true });
      } else if (layer?.bitmap && stroke.bitmapBefore) {
        layer.bitmap.getContext('2d')?.drawImage(stroke.bitmapBefore, 0, 0);
        env.requestRender({ invalidateBitmapCache: true });
      }
      stroke = null;
    },
  };
}

export const spongeSaturateBrushTool = makeSpongeBrushTool('saturate');
export const spongeDesaturateBrushTool = makeSpongeBrushTool('desaturate');

function spongeModeToRetouchOutputTool(mode: SpongeBrushMode): RetouchOutputLayerTool {
  return mode === 'saturate' ? 'spongeSaturate' : 'spongeDesaturate';
}
