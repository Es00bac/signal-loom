import type { BrushDab, Rect } from './backend';

export interface SmudgeKernelParams extends Pick<BrushDab, 'from' | 'to' | 'size' | 'strength'> {
  rect: Rect;
}

export interface NeighborhoodKernelParams {
  size: number;
  strength: number;
  rect: Rect;
}

function clampByte(value: number): number {
  return value < 0 ? 0 : value > 255 ? 255 : Math.round(value);
}

function mixByte(a: number, b: number, t: number): number {
  return clampByte(a + (b - a) * t);
}

/** Clamp-edge sample of one channel from an ImageData. */
function sample(data: Uint8ClampedArray, width: number, height: number, x: number, y: number, channel: number): number {
  const cx = x < 0 ? 0 : x >= width ? width - 1 : x;
  const cy = y < 0 ? 0 : y >= height ? height - 1 : y;
  return data[(cy * width + cx) * 4 + channel] ?? 0;
}

/** Radial brush falloff (1 at the dab center, 0 at the edge) for a pixel. */
function falloff(x: number, y: number, rect: Rect, size: number): number {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const radius = Math.max(0.5, size / 2);
  const dist = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
  return Math.max(0, 1 - dist / radius);
}

/**
 * Sample-and-blend smudge: pulls the colour from the drag origin (`from`) into pixels near `to`,
 * reading from `source` (the stroke-start snapshot) so writes never feed back. Bounded to `rect`.
 */
export function smudgeRegion(target: ImageData, source: ImageData, params: SmudgeKernelParams): void {
  const { width, height } = target;
  // Match the existing tool: uniform strength within a hard disc of radius (size-1)/2,
  // integer-centered on `to`, sampling `source` displaced by round(from) - round(to).
  const radius = Math.max(0, (params.size - 1) / 2);
  const t = params.strength;
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

/** Box-blur neighbourhood op over `rect`, reading from a bounded snapshot so it doesn't self-feed. */
export function blurRegion(target: ImageData, params: NeighborhoodKernelParams): void {
  applyNeighborhood(target, params, (center, blurred, t) => mixByte(center, blurred, t));
}

/** Unsharp-mask sharpen over `rect`: center + (center - blurred) * strength * falloff. */
export function sharpenRegion(target: ImageData, params: NeighborhoodKernelParams): void {
  applyNeighborhood(target, params, (center, blurred, t) => clampByte(center + (center - blurred) * t));
}

function applyNeighborhood(
  target: ImageData,
  params: NeighborhoodKernelParams,
  combine: (center: number, blurred: number, t: number) => number,
): void {
  const { width, height } = target;
  const radius = Math.max(1, Math.round(params.size / 2));
  const rect = params.rect;
  // Bounded read snapshot: rect expanded by `radius`, clamped to the image.
  const x0 = Math.max(0, rect.x - radius);
  const y0 = Math.max(0, rect.y - radius);
  const x1 = Math.min(width, rect.x + rect.width + radius);
  const y1 = Math.min(height, rect.y + rect.height + radius);
  const sw = Math.max(0, x1 - x0);
  const sh = Math.max(0, y1 - y0);
  if (sw === 0 || sh === 0) return;
  const snap = new Uint8ClampedArray(sw * sh * 4);
  for (let y = 0; y < sh; y += 1) {
    for (let x = 0; x < sw; x += 1) {
      const srcOffset = ((y0 + y) * width + (x0 + x)) * 4;
      snap.set(target.data.subarray(srcOffset, srcOffset + 4), (y * sw + x) * 4);
    }
  }

  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    if (y < 0 || y >= height) continue;
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      if (x < 0 || x >= width) continue;
      const f = falloff(x, y, rect, params.size);
      if (f <= 0) continue;
      const t = params.strength * f;
      const offset = (y * width + x) * 4;
      for (let c = 0; c < 4; c += 1) {
        let sum = 0;
        let count = 0;
        for (let ky = -radius; ky <= radius; ky += 1) {
          for (let kx = -radius; kx <= radius; kx += 1) {
            sum += sample(snap, sw, sh, x - x0 + kx, y - y0 + ky, c);
            count += 1;
          }
        }
        const blurred = sum / count;
        const center = target.data[offset + c] ?? 0;
        target.data[offset + c] = combine(center, blurred, t);
      }
    }
  }
}
