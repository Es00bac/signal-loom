import type { BrushDab, Rect } from './backend';

export interface SmudgeKernelParams extends Pick<BrushDab, 'from' | 'to' | 'size' | 'strength'> {
  rect: Rect;
}

export interface NeighborhoodKernelParams {
  to: { x: number; y: number };
  size: number;
  strength: number;
  rect: Rect;
}

function clampByte(value: number): number {
  return value < 0 ? 0 : value > 255 ? 255 : Math.round(value);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function mixByte(a: number, b: number, t: number): number {
  return clampByte(a + (b - a) * t);
}

function sharpenByte(value: number, blurred: number, strength: number): number {
  return clampByte(value + (value - blurred) * strength);
}

/** Clamp-edge sample of one channel from an ImageData (used by smudge's drag offset). */
function sample(data: Uint8ClampedArray, width: number, height: number, x: number, y: number, channel: number): number {
  const cx = x < 0 ? 0 : x >= width ? width - 1 : x;
  const cy = y < 0 ? 0 : y >= height ? height - 1 : y;
  return data[(cy * width + cx) * 4 + channel] ?? 0;
}

function contains(imageData: ImageData, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < imageData.width && y < imageData.height;
}

/** Circular-disc average (skips out-of-bounds samples), matching the existing retouch tools. */
function averageDisc(source: ImageData, centerX: number, centerY: number, radius: number): [number, number, number, number] | null {
  let red = 0;
  let green = 0;
  let blue = 0;
  let alpha = 0;
  let count = 0;
  for (let y = -radius; y <= radius; y += 1) {
    for (let x = -radius; x <= radius; x += 1) {
      if (Math.sqrt(x * x + y * y) > radius + 0.001) continue;
      const sx = centerX + x;
      const sy = centerY + y;
      if (!contains(source, sx, sy)) continue;
      const offset = (sy * source.width + sx) * 4;
      red += source.data[offset] ?? 0;
      green += source.data[offset + 1] ?? 0;
      blue += source.data[offset + 2] ?? 0;
      alpha += source.data[offset + 3] ?? 0;
      count += 1;
    }
  }
  if (count === 0) return null;
  return [Math.round(red / count), Math.round(green / count), Math.round(blue / count), Math.round(alpha / count)];
}

/**
 * Sample-and-blend smudge: pulls the colour from the drag origin (`from`) into pixels near `to`,
 * reading from `source` (the stroke-start snapshot) so writes never feed back. Uniform strength
 * within a hard disc of radius (size-1)/2, integer-centered, matching the existing tool. Bounded to `rect`.
 */
export function smudgeRegion(target: ImageData, source: ImageData, params: SmudgeKernelParams): void {
  const { width, height } = target;
  const radius = Math.max(0, (params.size - 1) / 2);
  const t = clamp01(params.strength);
  const targetCx = Math.round(params.to.x);
  const targetCy = Math.round(params.to.y);
  const dx = Math.round(params.from.x) - targetCx;
  const dy = Math.round(params.from.y) - targetCy;
  const rect = params.rect;
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    if (y < 0 || y >= height) continue;
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      if (x < 0 || x >= width) continue;
      if (Math.hypot(x - targetCx, y - targetCy) > radius + 0.001) continue;
      const offset = (y * width + x) * 4;
      for (let c = 0; c < 4; c += 1) {
        const origin = sample(source.data, source.width, source.height, x + dx, y + dy, c);
        target.data[offset + c] = mixByte(target.data[offset + c] ?? 0, origin, t);
      }
    }
  }
}

/** Blur neighbourhood op: averages `source` in a disc of radius max(1, ceil(size)), blended by strength. */
export function blurRegion(target: ImageData, source: ImageData, params: NeighborhoodKernelParams): void {
  applyNeighborhood(target, source, params, (orig, avg, strength) => mixByte(orig, avg, strength), true);
}

/** Sharpen (unsharp mask) neighbourhood op: orig + (orig - blurred) * strength; alpha untouched. */
export function sharpenRegion(target: ImageData, source: ImageData, params: NeighborhoodKernelParams): void {
  applyNeighborhood(target, source, params, (orig, avg, strength) => sharpenByte(orig, avg, strength), false);
}

function applyNeighborhood(
  target: ImageData,
  source: ImageData,
  params: NeighborhoodKernelParams,
  combine: (orig: number, avg: number, strength: number) => number,
  includeAlpha: boolean,
): void {
  const { width, height } = target;
  const brushRadius = Math.max(0, (params.size - 1) / 2);
  const blurRadius = Math.max(1, Math.ceil(params.size));
  const strength = clamp01(params.strength);
  const targetCx = Math.round(params.to.x);
  const targetCy = Math.round(params.to.y);
  const rect = params.rect;
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    if (y < 0 || y >= height) continue;
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      if (x < 0 || x >= width) continue;
      if (Math.hypot(x - targetCx, y - targetCy) > brushRadius + 0.001) continue;
      const avg = averageDisc(source, x, y, blurRadius);
      if (!avg) continue;
      const offset = (y * width + x) * 4;
      target.data[offset] = combine(target.data[offset] ?? 0, avg[0], strength);
      target.data[offset + 1] = combine(target.data[offset + 1] ?? 0, avg[1], strength);
      target.data[offset + 2] = combine(target.data[offset + 2] ?? 0, avg[2], strength);
      if (includeAlpha) {
        target.data[offset + 3] = combine(target.data[offset + 3] ?? 0, avg[3], strength);
      }
    }
  }
}
