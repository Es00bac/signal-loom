import { describe, expect, it } from 'vitest';
import type { PaperFrame, PaperRichParagraph } from '../types/paper';
import { computePaperThreadSlices } from './paperThreadFlow';
import { flattenPaperRichText } from './paperRichText';
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

  it('leaves plain (non-rich) thread slices without a rich payload', () => {
    const frames = [
      textFrame({ id: 'head', threadId: 't1', threadOrder: 1, text: 'aa bb cc dd' }),
      textFrame({ id: 'tail', threadId: 't1', threadOrder: 2 }),
    ];
    const slices = computePaperThreadSlices(frames, measure);
    expect(slices.get('head')?.richText).toBeUndefined();
    expect(slices.get('tail')?.richText).toBeUndefined();
  });
});

describe('computePaperThreadSlices — rich (formatted) stories', () => {
  // Head richText whose flatten is 'Hello bold\nitalic link\nthird para': each ~one-line paragraph fills one
  // single-line frame, so the story flows head → mid → tail with a paragraph break at each frame boundary.
  const richHeadStory: PaperRichParagraph[] = [
    { runs: [{ text: 'Hello ' }, { text: 'bold', fontWeight: '700' }] },
    { runs: [{ text: 'italic', fontStyle: 'italic' }, { text: ' link', link: 'https://u' }] },
    { runs: [{ text: 'third para' }] },
  ];
  const wideLine = (patch: Partial<PaperFrame>): PaperFrame =>
    textFrame({ widthMm: 40, heightMm: 5, columns: 1, ...patch });

  it('flows a three-frame mixed-format story so each visible frame owns exactly its contiguous rich slice', () => {
    const frames = [
      wideLine({ id: 'head', threadId: 't', threadOrder: 1, richText: richHeadStory, text: flattenPaperRichText(richHeadStory) }),
      wideLine({ id: 'mid', threadId: 't', threadOrder: 2 }),
      wideLine({ id: 'tail', threadId: 't', threadOrder: 3 }),
    ];
    const slices = computePaperThreadSlices(frames, measure);

    // Head keeps its bold; continuations keep italic + link, and the plain third paragraph.
    expect(slices.get('head')?.richText).toEqual([{ runs: [{ text: 'Hello ' }, { text: 'bold', fontWeight: '700' }] }]);
    expect(slices.get('mid')?.richText).toEqual([{ runs: [{ text: 'italic', fontStyle: 'italic' }, { text: ' link', link: 'https://u' }] }]);
    expect(slices.get('tail')?.richText).toEqual([{ runs: [{ text: 'third para' }] }]);
    expect(slices.get('head')?.isHead).toBe(true);
    expect(slices.get('mid')?.isHead).toBe(false);
    expect(slices.get('tail')?.isHead).toBe(false);
  });

  it('flattens the non-overset slices back to the whole story with no duplication or loss', () => {
    const frames = [
      wideLine({ id: 'head', threadId: 't', threadOrder: 1, richText: richHeadStory, text: flattenPaperRichText(richHeadStory) }),
      wideLine({ id: 'mid', threadId: 't', threadOrder: 2 }),
      wideLine({ id: 'tail', threadId: 't', threadOrder: 3 }),
    ];
    const slices = computePaperThreadSlices(frames, measure);
    const story = flattenPaperRichText(richHeadStory);
    const ordered = ['head', 'mid', 'tail'].map((id) => slices.get(id)!);

    // Each slice reproduces exactly its authoritative offset window...
    for (const slice of ordered) {
      expect(flattenPaperRichText(slice.richText!)).toBe(story.slice(slice.sourceStart, slice.sourceEnd));
    }
    // ...windows are ordered, disjoint (no duplication), and cover the whole story; the only gaps are the
    // inter-frame separators (a single '\n' paragraph break here), which is the intentional separator policy.
    expect(ordered[0].sourceStart).toBe(0);
    expect(ordered[2].sourceEnd).toBe(story.length);
    for (let i = 0; i < ordered.length - 1; i += 1) {
      expect(ordered[i].sourceEnd).toBeLessThanOrEqual(ordered[i + 1].sourceStart);
      expect(story.slice(ordered[i].sourceEnd, ordered[i + 1].sourceStart)).toMatch(/^\s*$/);
    }
  });

  it('keeps a run split across a frame boundary formatted in both frames, once each (mid-paragraph)', () => {
    // Single paragraph 'aa bb cc' where 'bb cc' is bold; the narrow single-line frames split it as
    // 'aa bb' | 'cc', so the bold run appears trimmed in the head and again (only its tail) in the continuation.
    const midRunStory: PaperRichParagraph[] = [{ runs: [{ text: 'aa ' }, { text: 'bb cc', fontWeight: '700' }] }];
    const frames = [
      textFrame({ id: 'head', threadId: 't2', threadOrder: 1, widthMm: 12, heightMm: 5, columns: 1, richText: midRunStory, text: flattenPaperRichText(midRunStory) }),
      textFrame({ id: 'tail', threadId: 't2', threadOrder: 2, widthMm: 12, heightMm: 5, columns: 1 }),
    ];
    const slices = computePaperThreadSlices(frames, measure);
    expect(slices.get('head')?.richText).toEqual([{ runs: [{ text: 'aa ' }, { text: 'bb', fontWeight: '700' }] }]);
    expect(slices.get('tail')?.richText).toEqual([{ runs: [{ text: 'cc', fontWeight: '700' }] }]);
    // No duplication: the space at the split belongs to neither frame.
    const story = flattenPaperRichText(midRunStory);
    const head = slices.get('head')!;
    const tail = slices.get('tail')!;
    expect(story.slice(head.sourceEnd, tail.sourceStart)).toBe(' ');
  });

  it('never mutates or fragments the stored head richText while computing slices', () => {
    const frames = [
      wideLine({ id: 'head', threadId: 't', threadOrder: 1, richText: richHeadStory, text: flattenPaperRichText(richHeadStory) }),
      wideLine({ id: 'mid', threadId: 't', threadOrder: 2 }),
      wideLine({ id: 'tail', threadId: 't', threadOrder: 3 }),
    ];
    const snapshot = JSON.parse(JSON.stringify(richHeadStory));
    computePaperThreadSlices(frames, measure);
    expect(frames[0].richText).toEqual(snapshot);
    expect(frames[0].richText).toBe(richHeadStory); // same reference — not replaced
  });
});
