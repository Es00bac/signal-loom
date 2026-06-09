import type { LayerBitmap } from '../../types/imageEditor';
import { getBitmapImageData, putBitmapImageData } from './LayerBitmap';
import type { Point } from './tools/types';

export function applyLinearGradientToBitmap(
  bitmap: LayerBitmap,
  options: {
    from: Point;
    to: Point;
    color: string;
    opacity: number;
    sourceImageData?: ImageData;
  },
): void {
  const source = options.sourceImageData ?? getBitmapImageData(bitmap);
  putBitmapImageData(bitmap, applyLinearGradientToImageData(source, options));
}

export function applyLinearGradientToImageData(
  imageData: ImageData,
  options: {
    from: Point;
    to: Point;
    color: string;
    opacity: number;
  },
): ImageData {
  const output = cloneImageData(imageData);
  const color = parseHexColor(options.color);
  const opacity = clamp01(options.opacity);
  const dx = options.to.x - options.from.x;
  const dy = options.to.y - options.from.y;
  const lengthSquared = dx * dx + dy * dy;

  for (let y = 0; y < output.height; y += 1) {
    for (let x = 0; x < output.width; x += 1) {
      const projection = lengthSquared <= 0
        ? 0
        : ((x - options.from.x) * dx + (y - options.from.y) * dy) / lengthSquared;
      const amount = opacity * (1 - clamp01(projection));
      if (amount <= 0) continue;

      const offset = (y * output.width + x) * 4;
      output.data[offset] = mixByte(imageData.data[offset], color[0], amount);
      output.data[offset + 1] = mixByte(imageData.data[offset + 1], color[1], amount);
      output.data[offset + 2] = mixByte(imageData.data[offset + 2], color[2], amount);
      output.data[offset + 3] = mixByte(imageData.data[offset + 3], 255, amount);
    }
  }

  return output;
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
