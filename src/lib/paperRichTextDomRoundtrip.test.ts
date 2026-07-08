// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { richTextToEditorHtml, serializeRichEditor, type RichEditorBase } from './paperRichTextDom';
import type { PaperRichParagraph } from '../types/paper';

const BASE: RichEditorBase = { colorHex: '#111111', fontFamily: 'Inter', fontSizePx: 16, zoom: 1 };

/** Seed a contentEditable from paragraphs, then read it back — the exact edit lifecycle. */
function roundTrip(paragraphs: PaperRichParagraph[]): PaperRichParagraph[] {
  const div = document.createElement('div');
  div.innerHTML = richTextToEditorHtml(paragraphs, 1);
  return serializeRichEditor(div, BASE);
}

describe('rich editor paragraph round-trip (edit must not drop paragraph formatting)', () => {
  it('preserves align, spacing, indents, drop cap, shading, and borders across an edit', () => {
    const out = roundTrip([
      {
        runs: [{ text: 'A shaded, bordered, hanging paragraph' }],
        align: 'center',
        spaceBeforeMm: 2,
        spaceAfterMm: 3,
        leftIndentMm: 12.7,
        hangingIndentMm: 12.7,
        dropCapLines: 3,
        shading: '#dddddd',
        borders: { right: { color: '#4472c4', widthPt: 0.5 }, paddingPt: 4 },
      },
    ]);
    expect(out).toHaveLength(1);
    const p = out[0];
    expect(p.align).toBe('center');
    expect(p.spaceBeforeMm).toBeCloseTo(2, 3);
    expect(p.spaceAfterMm).toBeCloseTo(3, 3);
    expect(p.leftIndentMm).toBeCloseTo(12.7, 3);
    expect(p.hangingIndentMm).toBeCloseTo(12.7, 3);
    expect(p.dropCapLines).toBe(3);
    expect(p.shading).toBe('#dddddd');
    expect(p.borders?.right).toMatchObject({ color: '#4472c4', widthPt: 0.5 });
    expect(p.borders?.paddingPt).toBe(4);
    // The text content survives too.
    expect(p.runs.map((run) => run.text).join('')).toBe('A shaded, bordered, hanging paragraph');
  });

  it('keeps a list marker and its paragraph attributes together', () => {
    const out = roundTrip([{ runs: [{ text: 'Bulleted' }], listMarker: '•', align: 'right' }]);
    expect(out[0].listMarker).toBe('•');
    expect(out[0].align).toBe('right');
    expect(out[0].runs.map((run) => run.text).join('')).toBe('Bulleted');
  });

  it('picks up paragraph attributes the toolbar sets on a plain block (align/dropcap/shading authoring)', () => {
    // Mimic what the rich-editor paragraph toolbar does: add data-* to an existing block, then commit.
    const div = document.createElement('div');
    div.innerHTML = richTextToEditorHtml([{ runs: [{ text: 'Authored paragraph' }] }], 1);
    const block = div.querySelector('div');
    if (!block) throw new Error('expected a block');
    block.dataset.align = 'center';
    block.dataset.dc = '3';
    block.dataset.shade = '#ffff00';
    const out = serializeRichEditor(div, BASE);
    expect(out[0].align).toBe('center');
    expect(out[0].dropCapLines).toBe(3);
    expect(out[0].shading).toBe('#ffff00');
    expect(out[0].runs.map((run) => run.text).join('')).toBe('Authored paragraph');
  });

  it('does not invent paragraph formatting for a plain paragraph', () => {
    const out = roundTrip([{ runs: [{ text: 'Just text' }] }]);
    expect(out[0].shading).toBeUndefined();
    expect(out[0].borders).toBeUndefined();
    expect(out[0].align).toBeUndefined();
    expect(out[0].hangingIndentMm).toBeUndefined();
  });
});
