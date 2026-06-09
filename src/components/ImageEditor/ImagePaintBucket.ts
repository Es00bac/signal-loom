import type { LayerBitmap } from '../../types/imageEditor';
import { getBitmapImageData, putBitmapImageData } from './LayerBitmap';
import type { Point } from './tools/types';

export function fillContiguousColorRegion(
  imageData: ImageData,
  options: {
    seed: Point;
    color: string;
    opacity: number;
    tolerance: number;
  },
): ImageData {
  const output = cloneImageData(imageData);
  const seedX = Math.floor(options.seed.x);
  const seedY = Math.floor(options.seed.y);
  if (!contains(imageData, seedX, seedY)) return output;

  const fill = parseHexColor(options.color);
  const opacity = clamp01(options.opacity);
  const width = imageData.width;
  const height = imageData.height;
  const seedOffset = (seedY * width + seedX) * 4;
  const seed = [
    imageData.data[seedOffset],
    imageData.data[seedOffset + 1],
    imageData.data[seedOffset + 2],
  ] as const;
  const toleranceSquared = Math.max(0, options.tolerance) ** 2;
  const visited = new Uint8Array(width * height);
  const stack: Array<[number, number]> = [[seedX, seedY]];

  while (stack.length > 0) {
    const [x, y] = stack.pop()!;
    if (!contains(imageData, x, y)) continue;
    const index = y * width + x;
    if (visited[index]) continue;
    visited[index] = 1;
    if (!matchesSeed(imageData, index, seed, toleranceSquared)) continue;

    const offset = index * 4;
    output.data[offset] = mixByte(imageData.data[offset], fill[0], opacity);
    output.data[offset + 1] = mixByte(imageData.data[offset + 1], fill[1], opacity);
    output.data[offset + 2] = mixByte(imageData.data[offset + 2], fill[2], opacity);
    output.data[offset + 3] = mixByte(imageData.data[offset + 3], 255, opacity);

    stack.push([x + 1, y]);
    stack.push([x - 1, y]);
    stack.push([x, y + 1]);
    stack.push([x, y - 1]);
  }

  return output;
}

export function fillContiguousColorRegionInBitmap(
  bitmap: LayerBitmap,
  options: {
    seed: Point;
    color: string;
    opacity: number;
    tolerance: number;
  },
): void {
  putBitmapImageData(bitmap, fillContiguousColorRegion(getBitmapImageData(bitmap), options));
}

function matchesSeed(
  imageData: ImageData,
  index: number,
  seed: readonly [number, number, number],
  toleranceSquared: number,
): boolean {
  const offset = index * 4;
  const dr = imageData.data[offset] - seed[0];
  const dg = imageData.data[offset + 1] - seed[1];
  const db = imageData.data[offset + 2] - seed[2];
  return dr * dr + dg * dg + db * db <= toleranceSquared;
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

function contains(imageData: ImageData, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < imageData.width && y < imageData.height;
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
