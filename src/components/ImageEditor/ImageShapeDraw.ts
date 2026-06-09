import type { LayerBitmap } from '../../types/imageEditor';
import { getBitmapImageData, putBitmapImageData } from './LayerBitmap';
import type { Point } from './tools/types';

interface ShapeDrawOptions {
  from: Point;
  to: Point;
  color: string;
  opacity: number;
  sourceImageData?: ImageData;
}

export function drawFilledRectOnBitmap(bitmap: LayerBitmap, options: ShapeDrawOptions): void {
  const source = options.sourceImageData ?? getBitmapImageData(bitmap);
  putBitmapImageData(bitmap, drawFilledRectOnImageData(source, options));
}

export function drawFilledEllipseOnBitmap(bitmap: LayerBitmap, options: ShapeDrawOptions): void {
  const source = options.sourceImageData ?? getBitmapImageData(bitmap);
  putBitmapImageData(bitmap, drawFilledEllipseOnImageData(source, options));
}

export function drawFilledRectOnImageData(imageData: ImageData, options: ShapeDrawOptions): ImageData {
  const output = cloneImageData(imageData);
  const color = parseHexColor(options.color);
  const opacity = clamp01(options.opacity);
  const bounds = normalizeBounds(options.from, options.to);

  for (let y = bounds.y0; y < bounds.y1; y += 1) {
    for (let x = bounds.x0; x < bounds.x1; x += 1) {
      paintPixel(output, imageData, x, y, color, opacity);
    }
  }

  return output;
}

export function drawFilledEllipseOnImageData(imageData: ImageData, options: ShapeDrawOptions): ImageData {
  const output = cloneImageData(imageData);
  const color = parseHexColor(options.color);
  const opacity = clamp01(options.opacity);
  const bounds = normalizeBounds(options.from, options.to);
  const width = Math.max(1, bounds.x1 - bounds.x0);
  const height = Math.max(1, bounds.y1 - bounds.y0);
  const cx = bounds.x0 + width / 2;
  const cy = bounds.y0 + height / 2;
  const rx = width / 2;
  const ry = height / 2;

  for (let y = bounds.y0; y < bounds.y1; y += 1) {
    for (let x = bounds.x0; x < bounds.x1; x += 1) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) {
        paintPixel(output, imageData, x, y, color, opacity);
      }
    }
  }

  return output;
}

function normalizeBounds(from: Point, to: Point): { x0: number; y0: number; x1: number; y1: number } {
  return {
    x0: Math.floor(Math.min(from.x, to.x)),
    y0: Math.floor(Math.min(from.y, to.y)),
    x1: Math.ceil(Math.max(from.x, to.x)),
    y1: Math.ceil(Math.max(from.y, to.y)),
  };
}

function paintPixel(
  output: ImageData,
  source: ImageData,
  x: number,
  y: number,
  color: [number, number, number],
  opacity: number,
): void {
  if (x < 0 || y < 0 || x >= output.width || y >= output.height) return;
  const offset = (y * output.width + x) * 4;
  output.data[offset] = mixByte(source.data[offset], color[0], opacity);
  output.data[offset + 1] = mixByte(source.data[offset + 1], color[1], opacity);
  output.data[offset + 2] = mixByte(source.data[offset + 2], color[2], opacity);
  output.data[offset + 3] = mixByte(source.data[offset + 3], 255, opacity);
}

function parseHexColor(color: string): [number, number, number] {
  const hex = color.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    return [
      parseInt(hex[0] + hex[0], 16),
      parseInt(hex[1] + hex[1], 16),
      parseInt(hex[2] + hex[2], 16),
    ];
  }
  if (/^[0-9a-f]{6}$/i.test(hex)) {
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
    ];
  }
  return [0, 0, 0];
}

function cloneImageData(imageData: ImageData): ImageData {
  return {
    width: imageData.width,
    height: imageData.height,
    data: new Uint8ClampedArray(imageData.data),
  } as ImageData;
}

function mixByte(before: number, after: number, amount: number): number {
  return Math.round(before + (after - before) * amount);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}
