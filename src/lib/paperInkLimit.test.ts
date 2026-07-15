import { describe, expect, it } from 'vitest';
import {
  assertCmykBufferWithinInkLimit,
  findCmykInkLimitViolation,
  measureCmykTotalAreaCoverage,
} from './paperInkLimit';

describe('CMYK total-area coverage measurement', () => {
  it('measures authored ink without altering the process recipe', () => {
    expect(measureCmykTotalAreaCoverage({ c: 0.79, m: 0.70, y: 0.53, k: 0.98 })).toBeCloseTo(3, 6);
  });

  it('finds the first over-limit DeviceCMYK pixel without mutating its bytes', () => {
    const buffer = new Uint8Array([255, 255, 255, 255, 40, 40, 40, 40]);
    expect(findCmykInkLimitViolation(buffer, 280)).toEqual({ pixelIndex: 0, totalInkPercent: 400 });
    expect([...buffer]).toEqual([255, 255, 255, 255, 40, 40, 40, 40]);
  });

  it('blocks an export instead of applying silent UCR to over-limit CMYK', () => {
    const buffer = new Uint8Array([255, 255, 255, 255]);
    expect(() => assertCmykBufferWithinInkLimit(buffer, 280)).toThrow(/400.*280/i);
    expect([...buffer]).toEqual([255, 255, 255, 255]);
  });

  it('treats a 400% ceiling as unrestricted output', () => {
    expect(findCmykInkLimitViolation(new Uint8Array([255, 255, 255, 255]), 400)).toBeUndefined();
  });
});
