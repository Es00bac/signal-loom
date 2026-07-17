import { describe, expect, it } from 'vitest';
import {
  flowPaperText,
  type PaperTextFlowExclusion,
  type PaperTextFlowFrame,
  type PaperTextFlowTypeSpec,
  type PaperTextMeasurer,
} from './paperTextFlow';

// Deterministic measurer: 2mm per character of the joined line string.
const measure: PaperTextMeasurer = (text) => text.length * 2;

const spec: PaperTextFlowTypeSpec = {
  fontFamily: 'Test',
  fontSizePt: 10,
  leadingPt: 12, // ≈4.233 mm per line
  tracking: 0,
  align: 'left',
};

const col = (xMm: number, yMm: number, widthMm: number, heightMm: number) => ({ xMm, yMm, widthMm, heightMm });
const frame = (id: string, ...columns: PaperTextFlowFrame['columns']): PaperTextFlowFrame => ({ id, columns });

describe('flowPaperText', () => {
  it('greedily wraps words to the column width and reports no overset when it fits', () => {
    const result = flowPaperText('aa bb cc', spec, [frame('f1', col(0, 0, 10, 12))], measure);
    expect(result.fits).toBe(true);
    expect(result.overset).toBe('');
    expect(result.frames[0].lines.map((line) => line.text)).toEqual(['aa bb', 'cc']);
  });

  it('returns the unfit remainder as overset (faithful slice of the original text)', () => {
    const result = flowPaperText('aa bb cc', spec, [frame('f1', col(0, 0, 10, 5))], measure);
    expect(result.frames[0].lines.map((line) => line.text)).toEqual(['aa bb']);
    expect(result.fits).toBe(false);
    expect(result.overset).toBe('cc');
  });

  it('flows the overset from one frame into the next (threading)', () => {
    const result = flowPaperText(
      'aa bb cc dd',
      spec,
      [frame('f1', col(0, 0, 10, 5)), frame('f2', col(0, 0, 10, 5))],
      measure,
    );
    expect(result.frames[0].lines.map((line) => line.text)).toEqual(['aa bb']);
    expect(result.frames[1].lines.map((line) => line.text)).toEqual(['cc dd']);
    expect(result.overset).toBe('');
  });

  it('reports the contiguous source slice that flowed into each frame (threaded rendering)', () => {
    const result = flowPaperText(
      'aa bb cc dd',
      spec,
      [frame('f1', col(0, 0, 10, 5)), frame('f2', col(0, 0, 10, 5))],
      measure,
    );
    expect(result.frames[0].sourceText).toBe('aa bb');
    expect(result.frames[1].sourceText).toBe('cc dd');
  });

  it('exposes authoritative source start/end offsets that reproduce each frame slice', () => {
    const text = 'aa bb cc dd';
    const result = flowPaperText(
      text,
      spec,
      [frame('f1', col(0, 0, 10, 5)), frame('f2', col(0, 0, 10, 5))],
      measure,
    );
    const [f0, f1] = result.frames;
    // Offsets index into the ORIGINAL story and reproduce the frame's slice exactly.
    expect(text.slice(f0.sourceStart, f0.sourceEnd)).toBe(f0.sourceText);
    expect(text.slice(f1.sourceStart, f1.sourceEnd)).toBe(f1.sourceText);
    expect(f0.sourceStart).toBe(0);
    // Slices are ordered and non-overlapping (the boundary whitespace is the inter-frame separator).
    expect(f1.sourceStart).toBeGreaterThanOrEqual(f0.sourceEnd);
    expect(f1.sourceEnd).toBe(text.length);
  });

  it('gives an empty [start,end) range for a frame that receives no text', () => {
    const result = flowPaperText(
      'aa bb',
      spec,
      [frame('f1', col(0, 0, 10, 5)), frame('f2', col(0, 0, 10, 5))],
      measure,
    );
    const empty = result.frames[1];
    expect(empty.sourceText).toBe('');
    expect(empty.sourceStart).toBe(empty.sourceEnd);
  });

  it('fills column one before column two within a frame', () => {
    const result = flowPaperText(
      'aa bb cc dd',
      spec,
      [frame('f1', col(0, 0, 10, 5), col(20, 0, 10, 5))],
      measure,
    );
    const [line1, line2] = result.frames[0].lines;
    expect(line1).toMatchObject({ text: 'aa bb', xMm: 0 });
    expect(line2).toMatchObject({ text: 'cc dd', xMm: 20 });
    expect(result.overset).toBe('');
  });

  it('forces a new line at explicit paragraph breaks', () => {
    const result = flowPaperText('aa\nbb', spec, [frame('f1', col(0, 0, 100, 30))], measure);
    expect(result.frames[0].lines.map((line) => line.text)).toEqual(['aa', 'bb']);
    expect(result.overset).toBe('');
  });

  it.each([
    { text: 'A\n\nB', tailHeightMm: 9, expectedTail: '\nB' },
    { text: 'A\n\n\nB', tailHeightMm: 13, expectedTail: '\n\nB' },
  ])('retains blank paragraphs after the ordinary inter-frame delimiter in $text', ({ text, tailHeightMm, expectedTail }) => {
    const result = flowPaperText(
      text,
      spec,
      [frame('head', col(0, 0, 100, 5)), frame('tail', col(0, 0, 100, tailHeightMm))],
      measure,
    );
    expect(result.frames[0].sourceText).toBe('A');
    expect(result.frames[1].sourceText).toBe(expectedTail);
    expect(text.slice(result.frames[1].sourceStart, result.frames[1].sourceEnd)).toBe(expectedTail);
    expect(result.frames[1].lines.map((line) => line.text)).toEqual([
      ...Array(expectedTail.lastIndexOf('B')).fill(''),
      'B',
    ]);
  });

  it('right-aligns and centers lines using the measured width', () => {
    const right = flowPaperText('aa', { ...spec, align: 'right' }, [frame('f1', col(0, 0, 10, 12))], measure);
    expect(right.frames[0].lines[0].xMm).toBeCloseTo(10 - 4); // width 'aa' = 4mm, right edge 10
    const center = flowPaperText('aa', { ...spec, align: 'center' }, [frame('f1', col(0, 0, 10, 12))], measure);
    expect(center.frames[0].lines[0].xMm).toBeCloseTo((10 - 4) / 2);
  });

  it('places a single over-wide word alone rather than looping forever', () => {
    const result = flowPaperText('aaaaaaaa bb', spec, [frame('f1', col(0, 0, 6, 30))], measure);
    expect(result.frames[0].lines.map((line) => line.text)).toEqual(['aaaaaaaa', 'bb']);
    expect(result.overset).toBe('');
  });
});

describe('flowPaperText Japanese line breaking (no inter-character spaces)', () => {
  it('breaks CJK text per character instead of treating a paragraph as one giant word', () => {
    // 2mm/char: a 5mm-wide column holds 2 chars per line (4mm), a 3rd would be 6mm.
    const result = flowPaperText('あいうえお', spec, [frame('f1', col(0, 0, 5, 30))], measure);
    expect(result.frames[0].lines.map((line) => line.text)).toEqual(['あい', 'うえ', 'お']);
    expect(result.overset).toBe('');
  });

  it('does not start a line with closing punctuation (行頭禁則 → 追い込み)', () => {
    // Without kinsoku the 。would begin line 2; instead it is pulled up onto line 1 (slight overflow).
    const result = flowPaperText('あい。う', spec, [frame('f1', col(0, 0, 5, 30))], measure);
    expect(result.frames[0].lines.map((line) => line.text)).toEqual(['あい。', 'う']);
  });

  it('does not end a line with an opening bracket (行末禁則 → push down)', () => {
    // The 「 would otherwise end line 1; it is pushed down to open line 2 next to its quote.
    const result = flowPaperText('あ「いう', spec, [frame('f1', col(0, 0, 5, 30))], measure);
    expect(result.frames[0].lines.map((line) => line.text)).toEqual(['あ', '「い', 'う']);
  });

  it('still wraps Latin words on spaces (kinsoku only bites CJK punctuation)', () => {
    const result = flowPaperText('aa bb cc', spec, [frame('f1', col(0, 0, 10, 12))], measure);
    expect(result.frames[0].lines.map((line) => line.text)).toEqual(['aa bb', 'cc']);
  });
});

describe('flowPaperText vertical writing (縦書き) capacity + overset', () => {
  const vspec: PaperTextFlowTypeSpec = { ...spec, vertical: true };

  it('bounds a line by the frame HEIGHT and advances lines across the WIDTH (right-to-left)', () => {
    // leading ≈4.233mm/line. Height 5mm → 2 chars per line; width 9mm → 2 lines fit → 'お' is overset.
    const result = flowPaperText('あいうえお', vspec, [frame('f1', col(0, 0, 9, 5))], measure);
    expect(result.frames[0].lines.map((line) => line.text)).toEqual(['あい', 'うえ']);
    expect(result.fits).toBe(false);
    expect(result.overset).toBe('お');
  });

  it('fits when the frame is wide enough for every text-line', () => {
    // Width 15mm → 3 lines fit; height 5mm → 2 chars each → all of あいうえお lands.
    const result = flowPaperText('あいうえお', vspec, [frame('f1', col(0, 0, 15, 5))], measure);
    expect(result.frames[0].lines.map((line) => line.text)).toEqual(['あい', 'うえ', 'お']);
    expect(result.fits).toBe(true);
    expect(result.overset).toBe('');
  });

  it('marches successive text-lines leftward from the right edge (vertical-rl)', () => {
    const result = flowPaperText('あいうえ', vspec, [frame('f1', col(0, 0, 15, 5))], measure);
    const [first, second] = result.frames[0].lines;
    // First line sits at the right; the second is one leading to its left.
    expect(first.xMm).toBeGreaterThan(second.xMm);
  });
});

describe('flowPaperText runaround (text wrap)', () => {
  // Obstacle covering the left 20mm of the column for the first line band only (y ≈ 0..4.23mm).
  const leftObstacle: PaperTextFlowExclusion = {
    points: [
      { xMm: 0, yMm: -10 },
      { xMm: 20, yMm: -10 },
      { xMm: 20, yMm: 4 },
      { xMm: 0, yMm: 4 },
    ],
  };

  it('flows text into the widest clear band beside a left-side obstacle', () => {
    const result = flowPaperText(
      'aa bb cc dd ee ff gg hh ii jj kk',
      spec,
      [frame('f1', col(0, 0, 40, 100))],
      measure,
      [leftObstacle],
    );
    const [first, second] = result.frames[0].lines;
    // First band is narrowed to [20,40]; the line shifts right and holds fewer words.
    expect(first).toMatchObject({ text: 'aa bb cc', xMm: 20 });
    // Below the obstacle the full 40mm column returns.
    expect(second.xMm).toBe(0);
    expect(second.text.startsWith('dd')).toBe(true);
  });

  it('skips a fully blocked band so text resumes below a full-width obstacle (jump object)', () => {
    const fullWidth: PaperTextFlowExclusion = {
      points: [
        { xMm: -5, yMm: -10 },
        { xMm: 45, yMm: -10 },
        { xMm: 45, yMm: 4 },
        { xMm: -5, yMm: 4 },
      ],
    };
    const result = flowPaperText('aa bb cc', spec, [frame('f1', col(0, 0, 40, 100))], measure, [fullWidth]);
    const [first] = result.frames[0].lines;
    expect(first.yMm).toBeCloseTo(4.2333, 2); // pushed down past the blocked first band
    expect(first.text).toBe('aa bb cc');
  });

  it('keeps a standoff gap between the text and the obstacle', () => {
    const withStandoff: PaperTextFlowExclusion = {
      points: [
        { xMm: 0, yMm: -10 },
        { xMm: 10, yMm: -10 },
        { xMm: 10, yMm: 4 },
        { xMm: 0, yMm: 4 },
      ],
      standoffMm: 5,
    };
    const result = flowPaperText('aa bb', spec, [frame('f1', col(0, 0, 40, 100))], measure, [withStandoff]);
    expect(result.frames[0].lines[0].xMm).toBe(15); // obstacle right edge 10 + 5mm standoff
  });
});
