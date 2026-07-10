import { afterEach, describe, expect, it, vi } from 'vitest';
import { computeStageFrameCount, computeStageFrameTimestamps } from './stageFrameExport';

describe('computeStageFrameCount (deterministic stepper)', () => {
  it('is ceil(duration * fps)', () => {
    expect(computeStageFrameCount(2, 30)).toBe(60);
    expect(computeStageFrameCount(2.5, 30)).toBe(75);
    // 2.51 * 30 = 75.3 -> ceil = 76, not a round 75 -- proves this isn't just duration*fps truncated.
    expect(computeStageFrameCount(2.51, 30)).toBe(76);
    expect(computeStageFrameCount(1, 24)).toBe(24);
    expect(computeStageFrameCount(1 / 3, 60)).toBe(20);
  });

  it('floors at 1 frame for a zero or negative duration (never an empty/invalid render)', () => {
    expect(computeStageFrameCount(0, 30)).toBe(1);
    expect(computeStageFrameCount(-5, 30)).toBe(1);
  });

  it('defaults a non-finite or non-positive fps to 30', () => {
    expect(computeStageFrameCount(2, 0)).toBe(computeStageFrameCount(2, 30));
    expect(computeStageFrameCount(2, -10)).toBe(computeStageFrameCount(2, 30));
    expect(computeStageFrameCount(2, Number.NaN)).toBe(computeStageFrameCount(2, 30));
  });

  it('has no wall-clock dependence: identical inputs always produce identical output regardless of "now"', () => {
    const dateNowSpy = vi.spyOn(Date, 'now');
    const performanceNowSpy = vi.spyOn(performance, 'now');

    try {
      dateNowSpy.mockReturnValue(1_000);
      const first = computeStageFrameCount(2.7, 25);
      const firstTimestamps = computeStageFrameTimestamps(2.7, 25);

      dateNowSpy.mockReturnValue(999_999_999);
      performanceNowSpy.mockReturnValue(123_456);
      const second = computeStageFrameCount(2.7, 25);
      const secondTimestamps = computeStageFrameTimestamps(2.7, 25);

      expect(second).toBe(first);
      expect(secondTimestamps).toEqual(firstTimestamps);
    } finally {
      dateNowSpy.mockRestore();
      performanceNowSpy.mockRestore();
    }
  });
});

describe('computeStageFrameTimestamps (deterministic stepper)', () => {
  it('produces t = n / fps for every n in [0, frameCount)', () => {
    const timestamps = computeStageFrameTimestamps(1, 4);
    expect(timestamps).toEqual([0, 0.25, 0.5, 0.75]);
  });

  it('array length always matches computeStageFrameCount for the same inputs', () => {
    for (const [duration, fps] of [[2, 30], [2.5, 30], [2.51, 30], [1, 24], [0, 30]] as const) {
      expect(computeStageFrameTimestamps(duration, fps)).toHaveLength(computeStageFrameCount(duration, fps));
    }
  });

  it('never produces a timestamp at or beyond the total duration', () => {
    for (const [duration, fps] of [[2.51, 30], [0.1, 3], [10 / 3, 29.97]] as const) {
      const timestamps = computeStageFrameTimestamps(duration, fps);
      for (const timestamp of timestamps) {
        expect(timestamp).toBeLessThan(duration + 1e-9);
      }
    }
  });

  it('is independent of requestAnimationFrame / any timer callback ever firing', () => {
    // No rAF/setTimeout stub is installed at all — if the stepper secretly depended on either, this
    // test would hang or throw ReferenceError in this environment rather than returning synchronously.
    const timestamps = computeStageFrameTimestamps(3, 30);
    expect(timestamps).toHaveLength(90);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
