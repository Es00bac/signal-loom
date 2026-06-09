import type { LayerBitmap } from '../../types/imageEditor';
import { getBitmapImageData, putBitmapImageData } from './LayerBitmap';
import type { Point } from './tools/types';

export type ToneBrushMode = 'dodge' | 'burn';
export type SpongeBrushMode = 'saturate' | 'desaturate';

export function resolveCloneStampSourcePoint({
  samplePoint,
  strokeStart,
  targetPoint,
}: {
  samplePoint: Point;
  strokeStart: Point;
  targetPoint: Point;
}): Point {
  return {
    x: samplePoint.x + (targetPoint.x - strokeStart.x),
    y: samplePoint.y + (targetPoint.y - strokeStart.y),
  };
}

export function applyCloneStampToBitmap(
  bitmap: LayerBitmap,
  options: {
    sourcePoint: Point;
    targetPoint: Point;
    size: number;
    opacity: number;
  },
): void {
  const next = applyCloneStampToImageData(getBitmapImageData(bitmap), options);
  putBitmapImageData(bitmap, next);
}

export function applySpotHealToBitmap(
  bitmap: LayerBitmap,
  options: {
    targetPoint: Point;
    size: number;
    opacity: number;
    sourceBitmap?: LayerBitmap;
  },
): void {
  const source = options.sourceBitmap ? getBitmapImageData(options.sourceBitmap) : getBitmapImageData(bitmap);
  const next = applySpotHealToImageData(getBitmapImageData(bitmap), {
    ...options,
    sourceImageData: source,
  });
  putBitmapImageData(bitmap, next);
}

export function applyBlurBrushToBitmap(
  bitmap: LayerBitmap,
  options: {
    targetPoint: Point;
    size: number;
    strength: number;
    sourceBitmap?: LayerBitmap;
  },
): void {
  const source = options.sourceBitmap ? getBitmapImageData(options.sourceBitmap) : getBitmapImageData(bitmap);
  const next = applyBlurBrushToImageData(getBitmapImageData(bitmap), {
    ...options,
    sourceImageData: source,
  });
  putBitmapImageData(bitmap, next);
}

export function applySharpenBrushToBitmap(
  bitmap: LayerBitmap,
  options: {
    targetPoint: Point;
    size: number;
    strength: number;
    sourceBitmap?: LayerBitmap;
  },
): void {
  const source = options.sourceBitmap ? getBitmapImageData(options.sourceBitmap) : getBitmapImageData(bitmap);
  const next = applySharpenBrushToImageData(getBitmapImageData(bitmap), {
    ...options,
    sourceImageData: source,
  });
  putBitmapImageData(bitmap, next);
}

export function applySmudgeBrushToBitmap(
  bitmap: LayerBitmap,
  options: {
    sourcePoint: Point;
    targetPoint: Point;
    size: number;
    strength: number;
  },
): void {
  const next = applySmudgeBrushToImageData(getBitmapImageData(bitmap), options);
  putBitmapImageData(bitmap, next);
}

export function applyToneBrushToBitmap(
  bitmap: LayerBitmap,
  options: {
    mode: ToneBrushMode;
    targetPoint: Point;
    size: number;
    strength: number;
  },
): void {
  const next = applyToneBrushToImageData(getBitmapImageData(bitmap), options);
  putBitmapImageData(bitmap, next);
}

export function applySpongeBrushToBitmap(
  bitmap: LayerBitmap,
  options: {
    mode: SpongeBrushMode;
    targetPoint: Point;
    size: number;
    strength: number;
  },
): void {
  const next = applySpongeBrushToImageData(getBitmapImageData(bitmap), options);
  putBitmapImageData(bitmap, next);
}

export function applyCloneStampToImageData(
  imageData: ImageData,
  options: {
    sourcePoint: Point;
    targetPoint: Point;
    size: number;
    opacity: number;
  },
): ImageData {
  const output = cloneImageData(imageData);
  const radius = Math.max(0, (options.size - 1) / 2);
  const integerRadius = Math.ceil(radius);
  const opacity = clamp01(options.opacity);
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
      if (!contains(imageData, sourceX, sourceY) || !contains(imageData, targetX, targetY)) {
        continue;
      }

      const sourceOffset = (sourceY * imageData.width + sourceX) * 4;
      const targetOffset = (targetY * output.width + targetX) * 4;
      output.data[targetOffset] = mixByte(imageData.data[targetOffset], imageData.data[sourceOffset], opacity);
      output.data[targetOffset + 1] = mixByte(imageData.data[targetOffset + 1], imageData.data[sourceOffset + 1], opacity);
      output.data[targetOffset + 2] = mixByte(imageData.data[targetOffset + 2], imageData.data[sourceOffset + 2], opacity);
      output.data[targetOffset + 3] = mixByte(imageData.data[targetOffset + 3], imageData.data[sourceOffset + 3], opacity);
    }
  }

  return output;
}

export function applySpotHealToImageData(
  imageData: ImageData,
  options: {
    targetPoint: Point;
    size: number;
    opacity: number;
    sourceImageData?: ImageData;
  },
): ImageData {
  const output = cloneImageData(imageData);
  const source = options.sourceImageData ?? imageData;
  const radius = Math.max(0, (options.size - 1) / 2);
  const integerRadius = Math.ceil(radius);
  const sampleRadius = Math.max(integerRadius + 1, Math.ceil(options.size));
  const targetCenterX = Math.round(options.targetPoint.x);
  const targetCenterY = Math.round(options.targetPoint.y);
  const repair = averageSurroundingPixels(source, targetCenterX, targetCenterY, radius, sampleRadius);

  if (!repair) return output;

  const opacity = clamp01(options.opacity);

  for (let y = -integerRadius; y <= integerRadius; y += 1) {
    for (let x = -integerRadius; x <= integerRadius; x += 1) {
      const distance = Math.sqrt(x * x + y * y);
      if (distance > radius + 0.001) continue;

      const targetX = targetCenterX + x;
      const targetY = targetCenterY + y;
      if (!contains(imageData, targetX, targetY)) continue;

      const targetOffset = (targetY * output.width + targetX) * 4;
      output.data[targetOffset] = mixByte(imageData.data[targetOffset], repair[0], opacity);
      output.data[targetOffset + 1] = mixByte(imageData.data[targetOffset + 1], repair[1], opacity);
      output.data[targetOffset + 2] = mixByte(imageData.data[targetOffset + 2], repair[2], opacity);
      output.data[targetOffset + 3] = mixByte(imageData.data[targetOffset + 3], repair[3], opacity);
    }
  }

  return output;
}

export function applyBlurBrushToImageData(
  imageData: ImageData,
  options: {
    targetPoint: Point;
    size: number;
    strength: number;
    sourceImageData?: ImageData;
  },
): ImageData {
  const output = cloneImageData(imageData);
  const source = options.sourceImageData ?? imageData;
  const brushRadius = Math.max(0, (options.size - 1) / 2);
  const integerBrushRadius = Math.ceil(brushRadius);
  const blurRadius = Math.max(1, Math.ceil(options.size));
  const strength = clamp01(options.strength);
  const centerX = Math.round(options.targetPoint.x);
  const centerY = Math.round(options.targetPoint.y);

  for (let y = -integerBrushRadius; y <= integerBrushRadius; y += 1) {
    for (let x = -integerBrushRadius; x <= integerBrushRadius; x += 1) {
      const distance = Math.sqrt(x * x + y * y);
      if (distance > brushRadius + 0.001) continue;

      const targetX = centerX + x;
      const targetY = centerY + y;
      if (!contains(imageData, targetX, targetY)) continue;

      const blurred = averagePixelsInRadius(source, targetX, targetY, blurRadius);
      if (!blurred) continue;

      const targetOffset = (targetY * output.width + targetX) * 4;
      output.data[targetOffset] = mixByte(imageData.data[targetOffset], blurred[0], strength);
      output.data[targetOffset + 1] = mixByte(imageData.data[targetOffset + 1], blurred[1], strength);
      output.data[targetOffset + 2] = mixByte(imageData.data[targetOffset + 2], blurred[2], strength);
      output.data[targetOffset + 3] = mixByte(imageData.data[targetOffset + 3], blurred[3], strength);
    }
  }

  return output;
}

export function applySharpenBrushToImageData(
  imageData: ImageData,
  options: {
    targetPoint: Point;
    size: number;
    strength: number;
    sourceImageData?: ImageData;
  },
): ImageData {
  const output = cloneImageData(imageData);
  const source = options.sourceImageData ?? imageData;
  const brushRadius = Math.max(0, (options.size - 1) / 2);
  const integerBrushRadius = Math.ceil(brushRadius);
  const blurRadius = Math.max(1, Math.ceil(options.size));
  const strength = clamp01(options.strength);
  const centerX = Math.round(options.targetPoint.x);
  const centerY = Math.round(options.targetPoint.y);

  for (let y = -integerBrushRadius; y <= integerBrushRadius; y += 1) {
    for (let x = -integerBrushRadius; x <= integerBrushRadius; x += 1) {
      const distance = Math.sqrt(x * x + y * y);
      if (distance > brushRadius + 0.001) continue;

      const targetX = centerX + x;
      const targetY = centerY + y;
      if (!contains(imageData, targetX, targetY)) continue;

      const blurred = averagePixelsInRadius(source, targetX, targetY, blurRadius);
      if (!blurred) continue;

      const targetOffset = (targetY * output.width + targetX) * 4;
      output.data[targetOffset] = sharpenByte(imageData.data[targetOffset], blurred[0], strength);
      output.data[targetOffset + 1] = sharpenByte(imageData.data[targetOffset + 1], blurred[1], strength);
      output.data[targetOffset + 2] = sharpenByte(imageData.data[targetOffset + 2], blurred[2], strength);
      output.data[targetOffset + 3] = imageData.data[targetOffset + 3];
    }
  }

  return output;
}

export function applySmudgeBrushToImageData(
  imageData: ImageData,
  options: {
    sourcePoint: Point;
    targetPoint: Point;
    size: number;
    strength: number;
  },
): ImageData {
  const output = cloneImageData(imageData);
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
      if (!contains(imageData, sourceX, sourceY) || !contains(imageData, targetX, targetY)) {
        continue;
      }

      const sourceOffset = (sourceY * imageData.width + sourceX) * 4;
      const targetOffset = (targetY * output.width + targetX) * 4;
      output.data[targetOffset] = mixByte(imageData.data[targetOffset], imageData.data[sourceOffset], strength);
      output.data[targetOffset + 1] = mixByte(imageData.data[targetOffset + 1], imageData.data[sourceOffset + 1], strength);
      output.data[targetOffset + 2] = mixByte(imageData.data[targetOffset + 2], imageData.data[sourceOffset + 2], strength);
      output.data[targetOffset + 3] = mixByte(imageData.data[targetOffset + 3], imageData.data[sourceOffset + 3], strength);
    }
  }

  return output;
}

export function applyToneBrushToImageData(
  imageData: ImageData,
  options: {
    mode: ToneBrushMode;
    targetPoint: Point;
    size: number;
    strength: number;
  },
): ImageData {
  const output = cloneImageData(imageData);
  const radius = Math.max(0, (options.size - 1) / 2);
  const integerRadius = Math.ceil(radius);
  const strength = clamp01(options.strength);
  const centerX = Math.round(options.targetPoint.x);
  const centerY = Math.round(options.targetPoint.y);

  for (let y = -integerRadius; y <= integerRadius; y += 1) {
    for (let x = -integerRadius; x <= integerRadius; x += 1) {
      const distance = Math.sqrt(x * x + y * y);
      if (distance > radius + 0.001) continue;

      const targetX = centerX + x;
      const targetY = centerY + y;
      if (!contains(imageData, targetX, targetY)) continue;

      const offset = (targetY * output.width + targetX) * 4;
      output.data[offset] = applyToneChannel(imageData.data[offset], options.mode, strength);
      output.data[offset + 1] = applyToneChannel(imageData.data[offset + 1], options.mode, strength);
      output.data[offset + 2] = applyToneChannel(imageData.data[offset + 2], options.mode, strength);
      output.data[offset + 3] = imageData.data[offset + 3];
    }
  }

  return output;
}

export function applySpongeBrushToImageData(
  imageData: ImageData,
  options: {
    mode: SpongeBrushMode;
    targetPoint: Point;
    size: number;
    strength: number;
  },
): ImageData {
  const output = cloneImageData(imageData);
  const radius = Math.max(0, (options.size - 1) / 2);
  const integerRadius = Math.ceil(radius);
  const strength = clamp01(options.strength);
  const centerX = Math.round(options.targetPoint.x);
  const centerY = Math.round(options.targetPoint.y);

  for (let y = -integerRadius; y <= integerRadius; y += 1) {
    for (let x = -integerRadius; x <= integerRadius; x += 1) {
      const distance = Math.sqrt(x * x + y * y);
      if (distance > radius + 0.001) continue;

      const targetX = centerX + x;
      const targetY = centerY + y;
      if (!contains(imageData, targetX, targetY)) continue;

      const offset = (targetY * output.width + targetX) * 4;
      const red = imageData.data[offset];
      const green = imageData.data[offset + 1];
      const blue = imageData.data[offset + 2];
      const neutral = Math.round((red + green + blue) / 3);

      output.data[offset] = applySpongeChannel(red, neutral, options.mode, strength);
      output.data[offset + 1] = applySpongeChannel(green, neutral, options.mode, strength);
      output.data[offset + 2] = applySpongeChannel(blue, neutral, options.mode, strength);
      output.data[offset + 3] = imageData.data[offset + 3];
    }
  }

  return output;
}

function applySpongeChannel(
  value: number,
  neutral: number,
  mode: SpongeBrushMode,
  strength: number,
): number {
  if (mode === 'desaturate') {
    return mixByte(value, neutral, strength);
  }
  return clampByte(Math.round(neutral + (value - neutral) * (1 + strength)));
}

function applyToneChannel(value: number, mode: ToneBrushMode, strength: number): number {
  return mode === 'dodge'
    ? mixByte(value, 255, strength)
    : mixByte(value, 0, strength);
}

function sharpenByte(value: number, blurred: number, strength: number): number {
  return clampByte(Math.round(value + (value - blurred) * strength));
}

function averagePixelsInRadius(
  imageData: ImageData,
  centerX: number,
  centerY: number,
  radius: number,
): [number, number, number, number] | null {
  let red = 0;
  let green = 0;
  let blue = 0;
  let alpha = 0;
  let count = 0;

  for (let y = -radius; y <= radius; y += 1) {
    for (let x = -radius; x <= radius; x += 1) {
      if (Math.sqrt(x * x + y * y) > radius + 0.001) continue;

      const sourceX = centerX + x;
      const sourceY = centerY + y;
      if (!contains(imageData, sourceX, sourceY)) continue;

      const offset = (sourceY * imageData.width + sourceX) * 4;
      red += imageData.data[offset];
      green += imageData.data[offset + 1];
      blue += imageData.data[offset + 2];
      alpha += imageData.data[offset + 3];
      count += 1;
    }
  }

  if (count === 0) return null;
  return [
    Math.round(red / count),
    Math.round(green / count),
    Math.round(blue / count),
    Math.round(alpha / count),
  ];
}

function averageSurroundingPixels(
  imageData: ImageData,
  centerX: number,
  centerY: number,
  innerRadius: number,
  outerRadius: number,
): [number, number, number, number] | null {
  let red = 0;
  let green = 0;
  let blue = 0;
  let alpha = 0;
  let count = 0;

  for (let y = -outerRadius; y <= outerRadius; y += 1) {
    for (let x = -outerRadius; x <= outerRadius; x += 1) {
      const distance = Math.sqrt(x * x + y * y);
      if (distance <= innerRadius + 0.001 || distance > outerRadius + 0.001) continue;

      const sourceX = centerX + x;
      const sourceY = centerY + y;
      if (!contains(imageData, sourceX, sourceY)) continue;

      const offset = (sourceY * imageData.width + sourceX) * 4;
      if (imageData.data[offset + 3] <= 0) continue;

      red += imageData.data[offset];
      green += imageData.data[offset + 1];
      blue += imageData.data[offset + 2];
      alpha += imageData.data[offset + 3];
      count += 1;
    }
  }

  if (count === 0) return null;
  return [
    Math.round(red / count),
    Math.round(green / count),
    Math.round(blue / count),
    Math.round(alpha / count),
  ];
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

function clampByte(value: number): number {
  if (value <= 0) return 0;
  if (value >= 255) return 255;
  return value;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}
