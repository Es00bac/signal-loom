import type { ToolEnv, ToolHandler, Point, Modifiers } from './types';
import { createMask, setFloodFill, type SelectionMask } from '../SelectionMask';
import { SelectionInteraction } from './selectionInteraction';
import { getBitmapImageData, createBitmap } from '../LayerBitmap';

export const magicWandTool: ToolHandler = {
  onPointerDown(env, point, mods) {
    sample(env, point, mods);
  },
};

function sample(env: ToolEnv, point: Point, mods: Modifiers): void {
  const x = Math.floor(point.x);
  const y = Math.floor(point.y);
  if (x < 0 || y < 0 || x >= env.doc.width || y >= env.doc.height) return;

  const sourceImage = compositeAt(env);
  const shape: SelectionMask = createMask(env.doc.width, env.doc.height);
  setFloodFill(
    shape,
    sourceImage,
    x,
    y,
    env.selectionToolSettings.magicWandTolerance,
  );

  const interaction = new SelectionInteraction(env, env.resolveSelectionMode(mods));
  interaction.preview(env, shape);
  interaction.commit(env);
}

/**
 * Build a fresh ImageData of the document composite (visible layers in order).
 * Magic wand samples color from this; using the active layer alone would feel
 * wrong when layers are stacked. We use composite for the sample-source but
 * the resulting selection still applies at document scale.
 */
function compositeAt(env: ToolEnv): ImageData {
  const target = createBitmap(env.doc.width, env.doc.height);
  const ctx = target.getContext('2d');
  if (!ctx) {
    return new ImageData(env.doc.width, env.doc.height);
  }
  for (const layer of env.doc.layers) {
    if (!layer.visible || !layer.bitmap) continue;
    ctx.save();
    ctx.globalAlpha = clamp01(layer.opacity);
    ctx.globalCompositeOperation = layer.blendMode as GlobalCompositeOperation;
    ctx.drawImage(layer.bitmap, layer.x, layer.y);
    ctx.restore();
  }
  return getBitmapImageData(target);
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
