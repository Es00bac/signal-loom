import { describe, expect, it } from 'vitest';
import type { PaperRichParagraph } from '../types/paper';
import { flattenPaperRichText, normalizePaperRichText, paperRichTextFromPlainText, paperRunsShareStyle } from './paperRichText';
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
    const normalized = normalizePaperRichText([{ runs: [{ text: 'x', fontStyle: 'oblique', vertAlign: 'baseline', color: '   ' }] }]);
    expect(normalized![0].runs[0]).toEqual({ text: 'x' });
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
