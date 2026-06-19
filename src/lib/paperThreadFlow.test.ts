import { describe, expect, it } from 'vitest';
import type { PaperFrame } from '../types/paper';
import { computePaperThreadSlices } from './paperThreadFlow';
import type { PaperTextMeasurer } from './paperTextFlow';

const measure: PaperTextMeasurer = (text) => text.length * 2;

const typography = {
  fontFamily: 'Test', fontSizePt: 10, leadingPt: 12, tracking: 0,
  align: 'left' as const, hyphenate: false, color: '#000', fontWeight: '400', fontStyle: 'normal' as const,
};

const textFrame = (patch: Partial<PaperFrame>): PaperFrame => ({
  id: 'f', kind: 'text', xMm: 0, yMm: 0, widthMm: 12, heightMm: 5, columns: 1, text: '', typography, ...patch,
} as PaperFrame);

describe('computePaperThreadSlices', () => {
  it('flows the head story across thread members', () => {
    const frames = [
      textFrame({ id: 'head', threadId: 't1', threadOrder: 1, text: 'aa bb cc dd' }),
      textFrame({ id: 'tail', threadId: 't1', threadOrder: 2 }),
    ];
    const slices = computePaperThreadSlices(frames, measure);
    expect(slices.get('head')?.sourceText).toBe('aa bb');
    expect(slices.get('head')?.isHead).toBe(true);
    expect(slices.get('tail')?.sourceText).toBe('cc dd');
    expect(slices.get('tail')?.isHead).toBe(false);
    expect(slices.get('tail')?.isOverset).toBe(false);
  });

  it('flags overset on the last frame when the story does not fit the thread', () => {
    const frames = [
      textFrame({ id: 'head', threadId: 't1', threadOrder: 1, text: 'aa bb cc dd ee ff' }),
      textFrame({ id: 'tail', threadId: 't1', threadOrder: 2 }),
    ];
    expect(computePaperThreadSlices(frames, measure).get('tail')?.isOverset).toBe(true);
  });

  it('ignores single-frame threads and non-threaded frames', () => {
    const frames = [
      textFrame({ id: 'solo', threadId: 't1', threadOrder: 1, text: 'aa bb' }),
      textFrame({ id: 'plain', text: 'cc dd' }),
    ];
    expect(computePaperThreadSlices(frames, measure).size).toBe(0);
  });
});
