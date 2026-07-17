import { describe, expect, it } from 'vitest';
import type { PaperRichParagraph } from '../types/paper';
import { flattenPaperRichText, normalizePaperRichText, paperRichTextFromPlainText, paperRunsShareStyle, slicePaperRichTextRange } from './paperRichText';
import { addFrameToPaperPage, createDefaultPaperDocument, updatePaperFrame } from './paperDocument';

describe('paperRichText helpers', () => {
  it('flattens runs and paragraphs to plaintext (with list markers)', () => {
    const paras: PaperRichParagraph[] = [
      { runs: [{ text: 'Hello ' }, { text: 'bold', fontWeight: '700' }] },
      { runs: [{ text: 'Item' }], listMarker: '•' },
    ];
    expect(flattenPaperRichText(paras)).toBe('Hello bold\n•\tItem');
  });

  it('normalizes untrusted input: coerces, merges adjacent same-style runs, keeps blank lines', () => {
    const normalized = normalizePaperRichText([
      { runs: [{ text: 'a', fontWeight: '700' }, { text: 'b', fontWeight: '700' }, { text: 'c' }] },
      { runs: [] }, // blank paragraph → preserved as a single empty run
    ]);
    expect(normalized).toBeDefined();
    expect(normalized![0].runs).toEqual([{ text: 'ab', fontWeight: '700' }, { text: 'c' }]);
    expect(normalized![1].runs).toEqual([{ text: '' }]);
  });

  it('returns undefined for content with no real text (falls back to the plain path)', () => {
    expect(normalizePaperRichText([{ runs: [{ text: '' }] }])).toBeUndefined();
    expect(normalizePaperRichText([])).toBeUndefined();
    expect(normalizePaperRichText('nope')).toBeUndefined();
  });

  it('drops invalid style fields but keeps text', () => {
    const normalized = normalizePaperRichText([{ runs: [{ text: 'x', fontStyle: 'slanted', vertAlign: 'baseline', color: '   ' }] }]);
    expect(normalized![0].runs[0]).toEqual({ text: 'x' });
  });

  it('retains exact oblique, stretch, and finite variable coordinates', () => {
    const normalized = normalizePaperRichText([{ runs: [{
      text: 'variable', fontStyle: 'oblique 12deg', fontStretch: '75%',
      fontVariationSettings: { wdth: 75, wght: 640, bad: 12, opsz: Number.NaN },
    }] }]);
    expect(normalized?.[0].runs[0]).toMatchObject({
      text: 'variable', fontStyle: 'oblique 12deg', fontStretch: '75%',
      fontVariationSettings: { wdth: 75, wght: 640 },
    });
  });

  it('paperRunsShareStyle compares style, not text', () => {
    expect(paperRunsShareStyle({ text: 'a', color: '#f00' }, { text: 'b', color: '#f00' })).toBe(true);
    expect(paperRunsShareStyle({ text: 'a', color: '#f00' }, { text: 'a', color: '#0f0' })).toBe(false);
  });

  it('builds single-run paragraphs from plaintext lines', () => {
    expect(paperRichTextFromPlainText('one\ntwo')).toEqual([{ runs: [{ text: 'one' }] }, { runs: [{ text: 'two' }] }]);
  });
});

describe('rich text on frames (createPaperFrame + patchPaperFrame sync)', () => {
  it('keeps frame.text as the flattened plaintext of richText', () => {
    const base = createDefaultPaperDocument({ title: 'Rich' });
    const { document, frameId } = addFrameToPaperPage(base, base.pages[0].id, {
      kind: 'text',
      xMm: 10, yMm: 10, widthMm: 80, heightMm: 25,
      richText: [{ runs: [{ text: 'Plain ' }, { text: 'italic', fontStyle: 'italic' }] }],
    });
    const frame = document.pages[0].frames.find((f) => f.id === frameId)!;
    expect(frame.richText).toBeDefined();
    expect(frame.text).toBe('Plain italic');
  });

  it('editing plain text drops the now-stale rich runs', () => {
    const base = createDefaultPaperDocument({ title: 'Rich' });
    const added = addFrameToPaperPage(base, base.pages[0].id, {
      kind: 'text', xMm: 10, yMm: 10, widthMm: 80, heightMm: 25,
      richText: [{ runs: [{ text: 'was ' }, { text: 'rich', fontWeight: '700' }] }],
    });
    const edited = updatePaperFrame(added.document, added.document.pages[0].id, added.frameId, { text: 'now plain' });
    const frame = edited.pages[0].frames.find((f) => f.id === added.frameId)!;
    expect(frame.text).toBe('now plain');
    expect(frame.richText).toBeUndefined();
  });

  it('patching richText re-syncs the flattened text', () => {
    const base = createDefaultPaperDocument({ title: 'Rich' });
    const added = addFrameToPaperPage(base, base.pages[0].id, { kind: 'text', xMm: 10, yMm: 10, widthMm: 80, heightMm: 25, text: 'plain' });
    const patched = updatePaperFrame(added.document, added.document.pages[0].id, added.frameId, {
      richText: [{ runs: [{ text: 'A' }, { text: 'B', color: '#ff0000' }] }],
    });
    const frame = patched.pages[0].frames.find((f) => f.id === added.frameId)!;
    expect(frame.richText).toBeDefined();
    expect(frame.text).toBe('AB');
  });
});

describe('slicePaperRichTextRange', () => {
  // flatten = 'The quick brown\nfox jumps\n•\tlazy dog'  (offsets below are into that flattened string)
  //            0.............15 16.......25 26........35
  const RICH: PaperRichParagraph[] = [
    { runs: [{ text: 'The ' }, { text: 'quick', fontWeight: '700' }, { text: ' brown' }] },
    { runs: [{ text: 'fox jumps' }], align: 'center' },
    { runs: [{ text: 'lazy', fontStyle: 'italic' }, { text: ' dog', link: 'https://x' }], listMarker: '•' },
  ];

  it('keeps the flatten/slice invariant: flatten(slice(p,s,e)) === flatten(p).slice(s,e)', () => {
    const flat = flattenPaperRichText(RICH);
    for (const [s, e] of [[0, 0], [0, 4], [4, 9], [5, 7], [0, 15], [0, 25], [16, 25], [26, 36], [28, 36], [0, 36], [11, 33]] as const) {
      expect(flattenPaperRichText(slicePaperRichTextRange(RICH, s, e))).toBe(flat.slice(s, e));
    }
  });

  it('slices mid-run and preserves that run\'s styling', () => {
    expect(slicePaperRichTextRange(RICH, 5, 7)).toEqual([{ runs: [{ text: 'ui', fontWeight: '700' }] }]);
  });

  it('slices on an exact run boundary', () => {
    expect(slicePaperRichTextRange(RICH, 0, 4)).toEqual([{ runs: [{ text: 'The ' }] }]);
    expect(slicePaperRichTextRange(RICH, 4, 9)).toEqual([{ runs: [{ text: 'quick', fontWeight: '700' }] }]);
  });

  it('preserves run boundaries when a slice spans several runs in one paragraph', () => {
    expect(slicePaperRichTextRange(RICH, 0, 9)).toEqual([
      { runs: [{ text: 'The ' }, { text: 'quick', fontWeight: '700' }] },
    ]);
  });

  it('splits on a paragraph newline boundary, keeping per-paragraph formatting', () => {
    expect(slicePaperRichTextRange(RICH, 0, 25)).toEqual([
      { runs: [{ text: 'The ' }, { text: 'quick', fontWeight: '700' }, { text: ' brown' }] },
      { runs: [{ text: 'fox jumps' }], align: 'center' },
    ]);
  });

  it('keeps the list marker (and link/italic) when the slice owns the item\'s start', () => {
    expect(slicePaperRichTextRange(RICH, 26, 36)).toEqual([
      { runs: [{ text: 'lazy', fontStyle: 'italic' }, { text: ' dog', link: 'https://x' }], listMarker: '•' },
    ]);
  });

  it('drops the list marker when the slice starts mid-item (continuation of the same bullet)', () => {
    expect(slicePaperRichTextRange(RICH, 30, 36)).toEqual([
      { runs: [{ text: 'zy', fontStyle: 'italic' }, { text: ' dog', link: 'https://x' }] },
    ]);
  });

  it('returns an empty slice for an empty range', () => {
    expect(slicePaperRichTextRange(RICH, 10, 10)).toEqual([]);
  });

  it('treats an overset (end beyond length) range as reaching the end, truthfully', () => {
    expect(slicePaperRichTextRange(RICH, 26, 999)).toEqual([
      { runs: [{ text: 'lazy', fontStyle: 'italic' }, { text: ' dog', link: 'https://x' }], listMarker: '•' },
    ]);
  });

  it('preserves blank-line paragraphs inside the range', () => {
    const withBlank: PaperRichParagraph[] = [{ runs: [{ text: 'A' }] }, { runs: [{ text: '' }] }, { runs: [{ text: 'B' }] }];
    expect(flattenPaperRichText(withBlank)).toBe('A\n\nB');
    expect(slicePaperRichTextRange(withBlank, 0, 4)).toEqual([
      { runs: [{ text: 'A' }] },
      { runs: [{ text: '' }] },
      { runs: [{ text: 'B' }] },
    ]);
  });

  it('disambiguates repeated text purely by offset, not by searching visible text', () => {
    // flatten = 'ababab'; the middle 'ab' is bold, the outer two are plain — identical text, distinct offsets.
    const repeated: PaperRichParagraph[] = [{ runs: [{ text: 'ab' }, { text: 'ab', fontWeight: '700' }, { text: 'ab' }] }];
    expect(slicePaperRichTextRange(repeated, 0, 2)).toEqual([{ runs: [{ text: 'ab' }] }]);
    expect(slicePaperRichTextRange(repeated, 2, 4)).toEqual([{ runs: [{ text: 'ab', fontWeight: '700' }] }]);
    expect(slicePaperRichTextRange(repeated, 4, 6)).toEqual([{ runs: [{ text: 'ab' }] }]);
  });

  it('preserves deterministic paragraph/run ids on kept content', () => {
    const withIds: PaperRichParagraph[] = [{ id: 'p1', runs: [{ id: 'r1', text: 'aa ' }, { id: 'r2', text: 'bb', fontWeight: '700' }] }];
    expect(slicePaperRichTextRange(withIds, 0, 5)).toEqual([
      { id: 'p1', runs: [{ id: 'r1', text: 'aa ' }, { id: 'r2', text: 'bb', fontWeight: '700' }] },
    ]);
  });

  it('never mutates the source paragraphs', () => {
    const snapshot = JSON.parse(JSON.stringify(RICH));
    slicePaperRichTextRange(RICH, 5, 30);
    expect(RICH).toEqual(snapshot);
  });
});
