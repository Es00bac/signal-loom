// Total-area coverage (TAC) measurement for production CMYK. Export must preserve an authored process
// recipe exactly; it reports a press-limit violation instead of secretly applying under-colour removal.

export interface CmykInkChannels {
  c: number;
  m: number;
  y: number;
  k: number;
}

export interface CmykInkLimitViolation {
  /** Zero-based pixel index in the interleaved sample buffer. */
  pixelIndex: number;
  /** Sum of the four DeviceCMYK channels, expressed as a percentage. */
  totalInkPercent: number;
}

/** Measure one authored CMYK recipe in 0..1 channel units. */
export function measureCmykTotalAreaCoverage(channels: CmykInkChannels): number {
  return channels.c + channels.m + channels.y + channels.k;
}

/** Find the first DeviceCMYK sample that exceeds a press TAC ceiling without modifying the buffer. */
export function findCmykInkLimitViolation(
  buffer: Uint8Array | Uint8ClampedArray,
  maxTotalInkPercent: number | undefined,
): CmykInkLimitViolation | undefined {
  if (maxTotalInkPercent === undefined || !Number.isFinite(maxTotalInkPercent) || maxTotalInkPercent >= 400) return undefined;
  const ceiling = Math.max(0, maxTotalInkPercent);
  for (let offset = 0; offset + 3 < buffer.length; offset += 4) {
    const totalInkPercent = (buffer[offset] + buffer[offset + 1] + buffer[offset + 2] + buffer[offset + 3]) / 255 * 100;
    if (totalInkPercent > ceiling + 0.000001) {
      return { pixelIndex: offset / 4, totalInkPercent: Number(totalInkPercent.toFixed(6)) };
    }
  }
  return undefined;
}

/** Throw an actionable production error while retaining the exact authored DeviceCMYK samples. */
export function assertCmykBufferWithinInkLimit(
  buffer: Uint8Array | Uint8ClampedArray,
  maxTotalInkPercent: number | undefined,
): void {
  const violation = findCmykInkLimitViolation(buffer, maxTotalInkPercent);
  if (!violation) return;
  throw new Error(
    `CMYK total ink ${violation.totalInkPercent.toFixed(3)}% at pixel ${violation.pixelIndex} exceeds the ${maxTotalInkPercent}% production limit.`,
  );
}

/** Assert a native CMYK paint is within its configured total-area-coverage ceiling. */
export function assertCmykPaintWithinInkLimit(
  channels: CmykInkChannels,
  maxTotalInkPercent: number | undefined,
  objectId: string,
): void {
  if (maxTotalInkPercent === undefined || !Number.isFinite(maxTotalInkPercent) || maxTotalInkPercent >= 400) return;
  const totalInkPercent = measureCmykTotalAreaCoverage(channels) * 100;
  if (totalInkPercent <= maxTotalInkPercent + 0.000001) return;
  throw new Error(
    `CMYK total ink ${totalInkPercent.toFixed(3)}% on ${objectId} exceeds the ${maxTotalInkPercent}% production limit.`,
  );
}
