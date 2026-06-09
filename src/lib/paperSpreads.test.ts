import { describe, expect, it } from 'vitest';
import { createDefaultPaperDocument, addPaperPage } from './paperDocument';
import {
  buildLivePaperSpreadLayout,
  buildPaperBookletImposition,
  buildPaperSpreads,
  exportPaperDocumentToBookletProofHtml,
  exportPaperDocumentToReaderSpreadHtml,
} from './paperSpreads';

describe('paperSpreads', () => {
  it('preserves single-page behavior when spreads are disabled', () => {
    const doc = addPaperPage(createDefaultPaperDocument({ title: 'Single View' }));

    const spreads = buildPaperSpreads(doc.pages, { enabled: false, startOnRight: true });

    expect(spreads).toHaveLength(2);
    expect(spreads[0].slots).toEqual([
      expect.objectContaining({ page: doc.pages[0], label: 'Single page', side: 'right' }),
    ]);
    expect(spreads[1].slots).toEqual([
      expect.objectContaining({ page: doc.pages[1], label: 'Single page', side: 'left' }),
    ]);
  });

  it('pairs pages as facing spreads with page one starting on the right', () => {
    let doc = createDefaultPaperDocument({ title: 'Right Start' });
    doc = addPaperPage(addPaperPage(addPaperPage(doc)));

    const spreads = buildPaperSpreads(doc.pages, { enabled: true, startOnRight: true });

    expect(spreads).toHaveLength(3);
    expect(spreads[0].slots.map((slot) => [slot.side, slot.page?.pageNumber ?? null, slot.label])).toEqual([
      ['left', null, 'Blank left'],
      ['right', 1, 'Right page'],
    ]);
    expect(spreads[1].slots.map((slot) => [slot.side, slot.page?.pageNumber ?? null, slot.label])).toEqual([
      ['left', 2, 'Left page'],
      ['right', 3, 'Right page'],
    ]);
    expect(spreads[2].slots.map((slot) => [slot.side, slot.page?.pageNumber ?? null, slot.label])).toEqual([
      ['left', 4, 'Left page'],
      ['right', null, 'Blank right'],
    ]);
  });

  it('pairs page one on the left when start-on-right is disabled', () => {
    const doc = addPaperPage(createDefaultPaperDocument({ title: 'Left Start' }));

    const spreads = buildPaperSpreads(doc.pages, { enabled: true, startOnRight: false });

    expect(spreads).toHaveLength(1);
    expect(spreads[0].slots.map((slot) => [slot.side, slot.page?.pageNumber ?? null])).toEqual([
      ['left', 1],
      ['right', 2],
    ]);
  });

  it('builds connected live spread geometry with no interior pasteboard gap', () => {
    let doc = createDefaultPaperDocument({ title: 'Connected Spread', preset: 'comic-book' });
    doc = addPaperPage(addPaperPage(doc));
    const spread = buildPaperSpreads(doc.pages, { enabled: true, startOnRight: true })[1];

    const layout = buildLivePaperSpreadLayout(spread, doc.page, { pasteboardMm: 12 });

    expect(layout.widthMm).toBe(364);
    expect(layout.heightMm).toBe(284);
    expect(layout.slots.map((slot) => [slot.side, slot.page?.pageNumber ?? null, slot.xMm, slot.yMm])).toEqual([
      ['left', 2, 12, 12],
      ['right', 3, 182, 12],
    ]);
    expect(layout.slots[1].xMm).toBe(layout.slots[0].xMm + doc.page.widthMm);
  });

  it('exports reader-spread HTML with side and gutter labels without changing page PDF behavior', () => {
    const doc = addPaperPage(createDefaultPaperDocument({ title: 'Spread Export', preset: 'comic-book' }));

    const html = exportPaperDocumentToReaderSpreadHtml(doc);

    expect(html).toContain('content="reader-spreads"');
    expect(html).toContain('data-side="left"');
    expect(html).toContain('data-side="right"');
    expect(html).toContain('Spread gutter');
    expect(html).toContain('Blank left');
    expect(html).toContain('Right page 1');
    expect(html).toContain('@page { size: 340mm 260mm; margin: 0; }');
  });

  it('builds booklet imposition order with blanks padded to four-page signatures', () => {
    expect(buildPaperBookletImposition(6)).toEqual([
      { sheetNumber: 1, front: [null, 1], back: [2, null] },
      { sheetNumber: 2, front: [6, 3], back: [4, 5] },
    ]);
  });

  it('exports booklet proof HTML using imposed sheet sides', () => {
    let doc = createDefaultPaperDocument({ title: 'Booklet', preset: 'comic-book' });
    doc = addPaperPage(addPaperPage(doc));

    const html = exportPaperDocumentToBookletProofHtml(doc);

    expect(html).toContain('content="booklet-proof"');
    expect(html).toContain('data-sheet="1"');
    expect(html).toContain('data-side="front"');
    expect(html).toContain('Fold');
  });
});
