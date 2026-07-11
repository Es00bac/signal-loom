import { describe, expect, it } from 'vitest';
import { applyInkLimitToCmykBuffer, limitTotalAreaCoverage } from './paperInkLimit';

describe('limitTotalAreaCoverage', () => {
  it('leaves colours within the limit untouched', () => {
    expect(limitTotalAreaCoverage(0.5, 0.3, 0.2, 0.4, 2.8)).toEqual({ c: 0.5, m: 0.3, y: 0.2, k: 0.4 });
    // exactly at the ceiling is fine (not "over")
    expect(limitTotalAreaCoverage(0.7, 0.7, 0.7, 0.7, 2.8)).toEqual({ c: 0.7, m: 0.7, y: 0.7, k: 0.7 });
  });

  it('reduces an over-limit rich black to the ceiling, preserving K and CMY hue', () => {
    // 300% rich black under a 280% ceiling (0..1 units → max 2.8).
    const out = limitTotalAreaCoverage(0.79, 0.70, 0.53, 0.98, 2.8);
    expect(out.c + out.m + out.y + out.k).toBeCloseTo(2.8, 6); // meets the ceiling exactly
    expect(out.k).toBe(0.98); // black channel preserved (density / crisp edges)
    // CMY scaled by the same factor → hue ratio unchanged.
    expect(out.c / out.m).toBeCloseTo(0.79 / 0.70, 6);
    expect(out.m / out.y).toBeCloseTo(0.70 / 0.53, 6);
    expect(out.c).toBeLessThan(0.79); // and it really was reduced
  });

  it('drops CMY and clamps K when K alone exceeds a (sub-100%) ceiling', () => {
    expect(limitTotalAreaCoverage(0.3, 0.3, 0.3, 0.8, 0.5)).toEqual({ c: 0, m: 0, y: 0, k: 0.5 });
  });

  it('is unit-agnostic (works in 0..255 sample units too)', () => {
    // 4×255 = 1020 total (400%); ceiling 714 (280%).
    const out = limitTotalAreaCoverage(255, 255, 255, 255, 714);
    expect(out.c + out.m + out.y + out.k).toBeCloseTo(714, 4);
    expect(out.k).toBe(255);
  });
});

describe('applyInkLimitToCmykBuffer', () => {
  it('clamps only the over-limit pixels of an interleaved DeviceCMYK buffer', () => {
    // pixel 0: 255,255,255,255 (400%); pixel 1: 40,40,40,40 (≈63%).
    const buf = new Uint8Array([255, 255, 255, 255, 40, 40, 40, 40]);
    applyInkLimitToCmykBuffer(buf, 280);
    const max = (280 / 100) * 255; // 714
    expect(buf[0] + buf[1] + buf[2] + buf[3]).toBeLessThanOrEqual(Math.round(max) + 1);
    expect(buf[3]).toBe(255); // K preserved on the reduced pixel
    // The in-limit pixel is untouched.
    expect([buf[4], buf[5], buf[6], buf[7]]).toEqual([40, 40, 40, 40]);
  });

  it('is a no-op at a 400% ceiling (the 4-channel maximum)', () => {
    const buf = new Uint8Array([255, 255, 255, 255]);
    applyInkLimitToCmykBuffer(buf, 400);
    expect([...buf]).toEqual([255, 255, 255, 255]);
  });
});
