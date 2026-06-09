import type { ImageLayer, LayerBitmap } from '../../types/imageEditor';
import { createBitmap } from './LayerBitmap';

type Canvas2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface RasterizedLayer {
  bitmap: LayerBitmap;
  left: number;
  top: number;
}

export function drawLayerBitmapTransformed(
  ctx: Canvas2D,
  bitmap: CanvasImageSource,
  layer: Pick<ImageLayer, 'x' | 'y' | 'rotationDeg'>,
  offsetX = 0,
  offsetY = 0,
): void {
  const rotation = normalizeDegrees(layer.rotationDeg ?? 0);
  const left = layer.x + offsetX;
  const top = layer.y + offsetY;
  const width = imageWidth(bitmap);
  const height = imageHeight(bitmap);

  if (rotation === 0) {
    ctx.drawImage(bitmap, left, top);
    return;
  }

  ctx.save();
  ctx.translate(left + width / 2, top + height / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.drawImage(bitmap, -width / 2, -height / 2);
  ctx.restore();
}

export function rasterizeLayerBitmapTransformed(
  bitmap: LayerBitmap,
  layer: Pick<ImageLayer, 'x' | 'y' | 'rotationDeg'>,
  offsetX = 0,
  offsetY = 0,
): RasterizedLayer {
  const rotation = normalizeDegrees(layer.rotationDeg ?? 0);
  if (rotation === 0) {
    return {
      bitmap,
      left: Math.round(layer.x + offsetX),
      top: Math.round(layer.y + offsetY),
    };
  }

  const radians = (rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  const width = Math.max(1, Math.ceil(bitmap.width * cos + bitmap.height * sin));
  const height = Math.max(1, Math.ceil(bitmap.width * sin + bitmap.height * cos));
  const output = createBitmap(width, height);
  const ctx = output.getContext('2d');
  if (!ctx) throw new Error('Could not rasterize rotated image layer.');
  ctx.translate(width / 2, height / 2);
  ctx.rotate(radians);
  ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);

  return {
    bitmap: output,
    left: Math.round(layer.x + offsetX + bitmap.width / 2 - width / 2),
    top: Math.round(layer.y + offsetY + bitmap.height / 2 - height / 2),
  };
}

function normalizeDegrees(degrees: number): number {
  if (!Number.isFinite(degrees)) return 0;
  const normalized = ((degrees % 360) + 360) % 360;
  return Math.abs(normalized) < 0.001 ? 0 : normalized;
}

function imageWidth(image: CanvasImageSource): number {
  return (image as { width?: number }).width ?? 0;
}

function imageHeight(image: CanvasImageSource): number {
  return (image as { height?: number }).height ?? 0;
}
