import { describe, expect, it } from 'vitest';
import {
  flowPaperText,
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
