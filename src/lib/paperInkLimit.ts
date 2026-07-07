// Total-Area-Coverage (TAC / total-ink) limiting for CMYK export. A press has a maximum total ink it can
// lay down (e.g. ~300% coated, ~240% newsprint); a file that exceeds it smears, offsets, or is rejected.
// The document carries a `totalInkLimitPercent`, and the preflight promises over-limit colours "will be
// reduced on export" — this module makes that promise real by clamping the actual exported CMYK.
//
// Reduction strategy = UCR (under-colour removal): KEEP the black (K) channel and pull C, M, Y down
// proportionally until the total meets the ceiling. Preserving K holds the neutral density / shadow
// detail and keeps text/edges crisp, while scaling CMY together preserves hue. Because the limit is
// always ≥ 100% and K ≤ 100%, there is always room to keep K and reduce CMY. Reducing ink is the safe
// direction for a file that is over the press ceiling.

/**
 * Reduce a CMYK colour so C+M+Y+K ≤ `maxTotal`, unit-agnostic: the channels and `maxTotal` must share
 * units (all 0..1, or all 0..255, or all 0..100). Returns the input unchanged when already within limit.
 */
export function limitTotalAreaCoverage(
  c: number,
  m: number,
  y: number,
  k: number,
  maxTotal: number,
): { c: number; m: number; y: number; k: number } {
  const total = c + m + y + k;
  if (!(total > maxTotal)) return { c, m, y, k }; // already within limit (or NaN/negative guard)

  // Keep K; give CMY whatever headroom remains under the ceiling.
  const allowedCmy = maxTotal - k;
  if (allowedCmy <= 0) {
    // K alone meets/exceeds the ceiling (only possible for a sub-100% limit): drop CMY, clamp K.
    return { c: 0, m: 0, y: 0, k: Math.min(k, maxTotal) };
  }
  const cmy = c + m + y;
  if (cmy <= 0) return { c, m, y, k };
  const scale = allowedCmy / cmy;
  return { c: c * scale, m: m * scale, y: y * scale, k };
}

/**
 * Clamp an interleaved 8-bit DeviceCMYK buffer (4 bytes/pixel, 0–255) in place to a total-ink ceiling
 * given as a percent (100–400; e.g. 280 = 280%). A limit ≥ 400 is a no-op (400% is the 4-channel max).
 * Returns the same buffer for convenience.
 */
export function applyInkLimitToCmykBuffer<T extends Uint8Array | Uint8ClampedArray>(
  buffer: T,
  maxTotalPercent: number,
): T {
  if (!(maxTotalPercent < 400)) return buffer; // no ceiling below the 400% theoretical max → nothing to do
  const maxTotal = (maxTotalPercent / 100) * 255; // percent → 0..1020 sample-sum units
  for (let i = 0; i + 3 < buffer.length; i += 4) {
    const c = buffer[i];
    const m = buffer[i + 1];
    const y = buffer[i + 2];
    const k = buffer[i + 3];
    if (c + m + y + k <= maxTotal) continue;
    const limited = limitTotalAreaCoverage(c, m, y, k, maxTotal);
    buffer[i] = Math.round(limited.c);
    buffer[i + 1] = Math.round(limited.m);
    buffer[i + 2] = Math.round(limited.y);
    buffer[i + 3] = Math.round(limited.k);
  }
  return buffer;
}
