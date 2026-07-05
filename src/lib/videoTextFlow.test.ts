import { describe, expect, it } from 'vitest';
import {
  computeArcTextGlyphs,
  layoutVideoText,
  type VideoTextFont,
  type VideoTextMeasurer,
} from './videoTextFlow';

/** Deterministic fake measurer: 10px per character, plus any letter-spacing between characters —
 *  makes wrap points and widths trivially predictable without touching a real canvas. */
const fakeMeasure: VideoTextMeasurer = (text, font) =>
  text.length * 10 + Math.max(0, text.length - 1) * font.letterSpacingPx;

describe('layoutVideoText', () => {
  it('word-wraps to fit a bounded width, matching a greedy line-fill', () => {
    const result = layoutVideoText(
      { text: 'alpha beta gamma delta', fontFamily: 'Inter', fontSizePx: 20, maxWidthPx: 130 },
      fakeMeasure,
    );

    expect(result.lines.map((line) => line.text)).toEqual(['alpha beta', 'gamma delta']);
    expect(result.lines[0].widthPx).toBe(100);
    expect(result.lines[1].widthPx).toBe(110);
    expect(result.contentWidthPx).toBe(130);
    expect(result.contentHeightPx).toBe(result.lines.length * result.lineHeightPx);
  });

  it('only breaks on explicit newlines when unbounded (auto-width title/caption)', () => {
    const result = layoutVideoText(
      { text: 'a very long line that would wrap if bounded', fontFamily: 'Inter', fontSizePx: 20 },
      fakeMeasure,
    );

    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].text).toBe('a very long line that would wrap if bounded');
  });

  it('honors manual paragraph breaks even when a line could hold more text', () => {
    const result = layoutVideoText(
      { text: 'ab\nabcdefghij', fontFamily: 'Inter', fontSizePx: 20, maxWidthPx: 1000 },
      fakeMeasure,
    );

    expect(result.lines.map((line) => line.text)).toEqual(['ab', 'abcdefghij']);
  });

  it('aligns left/center/right relative to the widest natural line when unbounded', () => {
    const base = { text: 'ab\nabcdefghij', fontFamily: 'Inter', fontSizePx: 20 };

    const left = layoutVideoText({ ...base, typography: { textAlign: 'left' } }, fakeMeasure);
    expect(left.contentWidthPx).toBe(100);
    expect(left.lines.map((line) => line.xPx)).toEqual([0, 0]);

    const center = layoutVideoText({ ...base, typography: { textAlign: 'center' } }, fakeMeasure);
    expect(center.lines.map((line) => line.xPx)).toEqual([40, 0]);

    const right = layoutVideoText({ ...base, typography: { textAlign: 'right' } }, fakeMeasure);
    expect(right.lines.map((line) => line.xPx)).toEqual([80, 0]);
  });

  it('stretches justified lines with per-word gaps, but never the last line', () => {
    const result = layoutVideoText(
      {
        text: 'alpha beta gamma delta',
        fontFamily: 'Inter',
        fontSizePx: 20,
        maxWidthPx: 130,
        typography: { textAlign: 'justify' },
      },
      fakeMeasure,
    );

    expect(result.lines[0].isLastLine).toBe(false);
    expect(result.lines[0].words).toEqual([
      { text: 'alpha', xPx: 0, widthPx: 50 },
      { text: 'beta', xPx: 90, widthPx: 40 },
    ]);
    // Last line of justified text is left-aligned, not stretched.
    expect(result.lines[1].isLastLine).toBe(true);
    expect(result.lines[1].words).toBeUndefined();
    expect(result.lines[1].xPx).toBe(0);
  });

  it('does not justify a single-word line (nothing to stretch)', () => {
    const result = layoutVideoText(
      { text: 'alpha', fontFamily: 'Inter', fontSizePx: 20, maxWidthPx: 200, typography: { textAlign: 'justify' } },
      fakeMeasure,
    );

    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].words).toBeUndefined();
  });

  it('threads letter-spacing into the measurer and widens the measured text', () => {
    const seen: VideoTextFont[] = [];
    const recordingMeasure: VideoTextMeasurer = (text, font) => {
      seen.push(font);
      return fakeMeasure(text, font);
    };

    const result = layoutVideoText(
      {
        text: 'ab',
        fontFamily: 'Inter',
        fontSizePx: 20,
        typography: { letterSpacingPx: 5, fontWeight: 700, fontStyle: 'italic' },
      },
      recordingMeasure,
    );

    expect(seen[0]).toMatchObject({ fontWeight: 700, fontStyle: 'italic', letterSpacingPx: 5 });
    expect(result.lines[0].widthPx).toBe(2 * 10 + 1 * 5); // 'ab' + one gap of letter-spacing
    expect(result.letterSpacingPx).toBe(5);
  });

  it('scales line height from lineHeightPercent', () => {
    const result = layoutVideoText(
      { text: 'a\nb', fontFamily: 'Inter', fontSizePx: 100, typography: { lineHeightPercent: 150 } },
      fakeMeasure,
    );

    expect(result.lineHeightPx).toBe(150);
    expect(result.lines[1].yPx).toBe(150);
  });

  it('returns no lines for empty text', () => {
    const result = layoutVideoText({ text: '', fontFamily: 'Inter', fontSizePx: 20 }, fakeMeasure);
    expect(result.lines).toEqual([]);
    expect(result.contentHeightPx).toBe(0);
  });
});

describe('computeArcTextGlyphs', () => {
  it('lays out glyphs straight (no curvature) when arcPercent is 0', () => {
    const glyphs = computeArcTextGlyphs('abc', 30, 0, () => 10);
    expect(glyphs.map((g) => g.yPx)).toEqual([0, 0, 0]);
    expect(glyphs.map((g) => g.rotationDeg)).toEqual([0, 0, 0]);
    expect(glyphs.map((g) => g.xPx)).toEqual([-10, 0, 10]);
  });

  it('bows the center higher than the ends for a positive arcPercent', () => {
    const glyphs = computeArcTextGlyphs('abc', 30, 50, () => 10);
    const [left, center, right] = glyphs;

    // Center sits on the curve's high point: no vertical offset, no tilt.
    expect(center.yPx).toBeCloseTo(0, 6);
    expect(center.rotationDeg).toBeCloseTo(0, 6);

    // Ends droop symmetrically below the center (positive y = lower, in canvas coordinates).
    expect(left.yPx).toBeGreaterThan(0);
    expect(right.yPx).toBeCloseTo(left.yPx, 6);

    // Ends tilt away from the center in opposite directions.
    expect(left.rotationDeg).toBeLessThan(0);
    expect(right.rotationDeg).toBeCloseTo(-left.rotationDeg, 6);
  });

  it('flips the bow for a negative arcPercent', () => {
    const positive = computeArcTextGlyphs('abc', 30, 50, () => 10);
    const negative = computeArcTextGlyphs('abc', 30, -50, () => 10);

    expect(negative[0].yPx).toBeCloseTo(-positive[0].yPx, 6);
    expect(negative[0].rotationDeg).toBeCloseTo(-positive[0].rotationDeg, 6);
  });

  it('clamps arcPercent to +/-100', () => {
    const clamped = computeArcTextGlyphs('abc', 30, 250, () => 10);
    const atMax = computeArcTextGlyphs('abc', 30, 100, () => 10);
    expect(clamped).toEqual(atMax);
  });

  it('returns an empty array for empty text', () => {
    expect(computeArcTextGlyphs('', 30, 50, () => 10)).toEqual([]);
  });
});
