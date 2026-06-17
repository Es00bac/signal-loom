import { describe, expect, it } from 'vitest';
import { buildEdgeMagnitudeField, snapToStrongestEdge } from './magneticLassoEdge';

/** Build a packed-RGBA buffer where the left `edgeX` columns are black and the
 * rest white — a single vertical edge at column `edgeX`. */
function verticalEdgeImage(width: number, height: number, edgeX: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const o = (y * width + x) * 4;
      const v = x < edgeX ? 0 : 255;
      data[o] = v;
      data[o + 1] = v;
      data[o + 2] = v;
      data[o + 3] = 255;
    }
  }
  return data;
}

describe('buildEdgeMagnitudeField', () => {
  it('puts the strongest gradient at the vertical edge and ~zero in flat regions', () => {
    const w = 9;
    const h = 9;
    const field = buildEdgeMagnitudeField(verticalEdgeImage(w, h, 4), w, h);

    // Flat interior away from the edge is zero.
    expect(field[4 * w + 1]).toBe(0);
    expect(field[4 * w + 7]).toBe(0);
    // The boundary columns carry the strongest edge (normalized to 1).
    const atEdge = Math.max(field[4 * w + 3], field[4 * w + 4]);
    expect(atEdge).toBeCloseTo(1, 5);
  });
});

describe('snapToStrongestEdge', () => {
  const w = 9;
  const h = 9;
  const field = buildEdgeMagnitudeField(verticalEdgeImage(w, h, 4), w, h);

  it('pulls a nearby point onto the edge column', () => {
    const snapped = snapToStrongestEdge(field, w, h, { x: 2, y: 4 }, 3);
    expect([3, 4]).toContain(snapped.x);
    expect(snapped.y).toBe(4);
  });

  it('leaves a point put when no edge clears the contrast threshold', () => {
    const snapped = snapToStrongestEdge(field, w, h, { x: 1, y: 4 }, 1, 0.5);
    expect(snapped).toEqual({ x: 1, y: 4 });
  });

  it('clamps the fallback point inside the image bounds', () => {
    const snapped = snapToStrongestEdge(field, w, h, { x: -5, y: 100 }, 0);
    expect(snapped).toEqual({ x: 0, y: 8 });
  });
});
