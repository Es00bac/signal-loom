// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { richTextToEditorHtml, serializeRichEditor } from '../../../lib/paperRichTextDom';
import type { PaperTypography } from '../../../types/paper';
import {
  applyTypographyToActiveRichEditor,
  applyTypographyToDomSelection,
  registerPaperRichEditorSession,
  resolvePaperRichEditorTypographyUpdate,
} from './paperRichEditorSession';

const TYPOGRAPHY: PaperTypography = {
  fontFamily: 'Inter', fontSizePt: 12, leadingPt: 15, tracking: 0, fontKerning: 'auto', align: 'left',
  hyphenate: true, color: '#111111', fontWeight: '400', fontStyle: 'normal', numericStyle: 'normal',
};

function editorWith(text: string): HTMLDivElement {
  const editor = document.createElement('div');
  editor.innerHTML = richTextToEditorHtml([{ runs: [{ text }] }], 1);
  document.body.append(editor);
  return editor;
}

function textNodeContaining(root: HTMLElement, value: string): Text {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode() as Text | null;
  while (node) {
    if (node.data.includes(value)) return node;
    node = walker.nextNode() as Text | null;
  }
  throw new Error(`No text node containing ${value}`);
}

afterEach(() => { document.body.replaceChildren(); });

describe('active rich editor Inspector formatting', () => {
  it('retains a range edit while persisting vertical writing on and off', () => {
    const editor = editorWith('Selected rich words');
    const text = textNodeContaining(editor, 'Selected rich words');
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 8);
    const dispose = registerPaperRichEditorSession('vertical-range', {
      applyTypography: (previous, next) => {
        const applied = applyTypographyToDomSelection(editor, range, previous, next, 1);
        if (!applied) return null;
        const richText = serializeRichEditor(editor, {
          colorHex: '#111111', fontFamily: 'Inter', fontSizePx: 12 * 1.333, leadingPx: 15 * 1.333, zoom: 1,
        });
        return { richText, text: 'Selected rich words' };
      },
    });
    const vertical = { ...TYPOGRAPHY, writingMode: 'vertical-rl' as const, align: 'center' as const };

    const enabled = resolvePaperRichEditorTypographyUpdate('vertical-range', TYPOGRAPHY, vertical, [{ runs: [{ text: 'stale' }] }]);
    expect(enabled.typography.writingMode).toBe('vertical-rl');
    expect(enabled.richText?.[0]).toMatchObject({ align: 'center' });
    expect(enabled.richText?.[0].runs.map((run) => run.text).join('')).toBe('Selected rich words');

    const disabled = resolvePaperRichEditorTypographyUpdate('vertical-range', vertical, TYPOGRAPHY, enabled.richText);
    expect(disabled.typography.writingMode).toBeUndefined();
    expect(disabled.richText?.[0].runs.map((run) => run.text).join('')).toBe('Selected rich words');
    dispose();
  });

  it('persists vertical writing at a collapsed caret without discarding current rich content', () => {
    const editor = editorWith('Caret preserves rich text');
    const text = textNodeContaining(editor, 'Caret preserves rich text');
    const caret = document.createRange();
    caret.setStart(text, 3);
    caret.collapse(true);
    const dispose = registerPaperRichEditorSession('vertical-caret', {
      applyTypography: (previous, next) => {
        const applied = applyTypographyToDomSelection(editor, caret, previous, next, 1);
        if (!applied) return null;
        const richText = serializeRichEditor(editor, {
          colorHex: '#111111', fontFamily: 'Inter', fontSizePx: 12 * 1.333, leadingPx: 15 * 1.333, zoom: 1,
        });
        return { richText, text: 'Caret preserves rich text' };
      },
    });
    const next = { ...TYPOGRAPHY, writingMode: 'vertical-rl' as const, align: 'center' as const };

    const result = resolvePaperRichEditorTypographyUpdate('vertical-caret', TYPOGRAPHY, next, [{ runs: [{ text: 'stale' }] }]);
    expect(result.typography.writingMode).toBe('vertical-rl');
    expect(result.richText?.[0]).toMatchObject({ align: 'center' });
    expect(result.richText?.[0].runs.map((run) => run.text).join('')).toBe('Caret preserves rich text');
    dispose();
  });

  it('persists vertical writing on and off with no active editor while preserving saved rich content', () => {
    const richText = [{ runs: [{ text: 'Saved rich content', fontWeight: '700' }] }];
    const vertical = { ...TYPOGRAPHY, writingMode: 'vertical-rl' as const };

    const enabled = resolvePaperRichEditorTypographyUpdate('inactive-frame', TYPOGRAPHY, vertical, richText);
    expect(enabled.typography.writingMode).toBe('vertical-rl');
    expect(enabled.richText).toEqual(richText);
    const disabled = resolvePaperRichEditorTypographyUpdate('inactive-frame', vertical, TYPOGRAPHY, enabled.richText);
    expect(disabled.typography.writingMode).toBeUndefined();
    expect(disabled.richText).toEqual(richText);
  });

  it('authors color, tracking, kerning, and exact size on only the highlighted words', () => {
    const editor = editorWith('Hello selected words');
    const text = textNodeContaining(editor, 'Hello selected words');
    const range = document.createRange();
    range.setStart(text, 6);
    range.setEnd(text, 14);
    const next: PaperTypography = {
      ...TYPOGRAPHY,
      color: '#ef4444',
      tracking: 80,
      fontKerning: 'none',
      fontSizePt: 18,
    };
    const applied = applyTypographyToDomSelection(editor, range, TYPOGRAPHY, next, 1);
    expect(applied?.applied).toBe(true);

    const rich = serializeRichEditor(editor, {
      colorHex: '#111111', fontFamily: 'Inter', fontSizePx: 12 * 1.333, leadingPx: 15 * 1.333,
      fontWeight: '400', fontStyle: 'normal', fontKerning: 'auto', tracking: 0, numericStyle: 'normal', zoom: 1,
    });
    expect(rich[0].runs.map((run) => run.text).join('')).toBe('Hello selected words');
    const selected = rich[0].runs.find((run) => run.text === 'selected');
    expect(selected).toMatchObject({ color: '#ef4444', tracking: 80, fontKerning: 'none' });
    expect(selected?.fontSizePt).toBeCloseTo(18, 1);
    expect(rich[0].runs[0]).toEqual({ text: 'Hello ' });
  });

  it('applies paragraph typesetting at a caret without rewriting character styles', () => {
    const editor = editorWith('Paragraph text');
    const text = textNodeContaining(editor, 'Paragraph text');
    const range = document.createRange();
    range.setStart(text, 4);
    range.collapse(true);
    const next = { ...TYPOGRAPHY, align: 'justify' as const, leadingPt: 19, spaceAfterMm: 3, hyphenate: false };
    const applied = applyTypographyToDomSelection(editor, range, TYPOGRAPHY, next, 1);
    expect(applied?.applied).toBe(true);
    const rich = serializeRichEditor(editor, {
      colorHex: '#111111', fontFamily: 'Inter', fontSizePx: 12 * 1.333, leadingPx: 15 * 1.333, zoom: 1,
    });
    expect(rich[0]).toMatchObject({ align: 'justify', leadingPt: 19, spaceAfterMm: 3, hyphenate: false });
    expect(rich[0].runs).toEqual([{ text: 'Paragraph text' }]);
  });

  it('falls back to frame formatting for a collapsed character selection', () => {
    const editor = editorWith('Caret');
    const text = textNodeContaining(editor, 'Caret');
    const range = document.createRange();
    range.setStart(text, 2);
    range.collapse(true);
    expect(applyTypographyToDomSelection(editor, range, TYPOGRAPHY, { ...TYPOGRAPHY, color: '#ffffff' }, 1)).toBeNull();
  });

  it('registers and removes the active editor by frame id', () => {
    const dispose = registerPaperRichEditorSession('frame-a', {
      applyTypography: () => ({ text: 'updated', richText: [{ runs: [{ text: 'updated' }] }] }),
    });
    expect(applyTypographyToActiveRichEditor('frame-a', TYPOGRAPHY, { ...TYPOGRAPHY, tracking: 20 })?.text).toBe('updated');
    dispose();
    expect(applyTypographyToActiveRichEditor('frame-a', TYPOGRAPHY, { ...TYPOGRAPHY, tracking: 20 })).toBeNull();
  });
});
