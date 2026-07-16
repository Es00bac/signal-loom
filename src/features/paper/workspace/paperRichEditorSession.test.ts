// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { richTextToEditorHtml, serializeRichEditor } from '../../../lib/paperRichTextDom';
import type { PaperTypography } from '../../../types/paper';
import {
  applyTypographyToActiveRichEditor,
  applyTypographyToDomSelection,
  registerPaperRichEditorSession,
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
