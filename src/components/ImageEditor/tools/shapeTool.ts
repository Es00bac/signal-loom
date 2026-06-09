import type { ImageLayer } from '../../../types/imageEditor';
import { cloneBitmap, createBitmap, getBitmapImageData } from '../LayerBitmap';
import { drawFilledEllipseOnBitmap, drawFilledRectOnBitmap } from '../ImageShapeDraw';
import type { Point, ToolEnv, ToolHandler } from './types';

type ShapeKind = 'rect' | 'ellipse';

interface ShapeStroke {
  layerId: string;
  bitmapBefore: OffscreenCanvas;
  start: Point;
}

function makeShapeTool(kind: ShapeKind): ToolHandler {
  let stroke: ShapeStroke | null = null;

  const previewShape = (env: ToolEnv, end: Point) => {
    if (!stroke) return;
    const layer = env.doc.layers.find((candidate) => candidate.id === stroke?.layerId);
    if (!layer?.bitmap) return;
    const draw = kind === 'rect' ? drawFilledRectOnBitmap : drawFilledEllipseOnBitmap;
    draw(layer.bitmap, {
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
  };

  return {
    onPointerDown(env, point) {
      const layer = env.activeLayer;
      if (!layer || layer.locked) return;
      const bitmap = ensureBitmap(env, layer);
      stroke = {
        layerId: layer.id,
        bitmapBefore: cloneBitmap(bitmap),
        start: point,
      };
      previewShape(env, point);
    },

    onPointerMove(env, point) {
      previewShape(env, point);
    },

    onPointerUp(env, point) {
      if (!stroke) return;
      previewShape(env, point);
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

function ensureBitmap(env: ToolEnv, layer: ImageLayer): OffscreenCanvas {
  if (layer.bitmap) return layer.bitmap;
  const bitmap = createBitmap(env.doc.width, env.doc.height);
  env.store.updateLayer(env.doc.id, layer.id, { bitmap });
  return bitmap;
}

export const rectShapeTool = makeShapeTool('rect');
export const ellipseShapeTool = makeShapeTool('ellipse');
