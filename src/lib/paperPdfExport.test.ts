import { describe, expect, it } from 'vitest';
import { addFrameToPaperPage, createDefaultPaperDocument } from './paperDocument';
import { buildPaperBookletProofPdfExportRequest, buildPaperPdfExportRequest, buildPaperRasterBookletProofPdfExportRequest, buildPaperRasterPdfExportRequest, buildPaperRasterReaderSpreadPdfExportRequest, buildPaperReaderSpreadHtmlExportRequest, buildPaperReaderSpreadPdfExportRequest, safePaperHtmlFileName, safePaperPdfFileName } from './paperPdfExport';

describe('paperPdfExport', () => {
  it('builds a native PDF export request from a Paper document', () => {
    let doc = createDefaultPaperDocument({
      title: 'Comic Issue #1 / Final',
      preset: 'comic-book',
      dpi: 600,
    });
    doc = addFrameToPaperPage(doc, doc.pages[0].id, {
      kind: 'caption',
      xMm: 10,
      yMm: 12,
      widthMm: 80,
      heightMm: 20,
      text: 'Narration box',
    }).document;

    const request = buildPaperPdfExportRequest(doc);

    expect(request.title).toBe('Comic Issue #1 / Final');
    expect(request.fileName).toBe('Comic-Issue-1-Final.pdf');
    expect(request.page).toEqual({
      widthMm: 170,
      heightMm: 260,
      bleedMm: 3.175,
      dpi: 600,
    });
    expect(request.production).toEqual(expect.objectContaining({
      pdfStandard: 'browser-pdf',
      outputIntentProfileId: 'srgb',
      browserPdfIsPressCertified: false,
    }));
    expect(request.html).toContain('@page');
    expect(request.html).toContain('size: 170mm 260mm');
    expect(request.html).toContain('bleed: 3.175mm');
    expect(request.html).toContain('left: 0mm;');
    expect(request.html).toContain('top: 0mm;');
    expect(request.html).toContain('data-bleed="3.175mm"');
    expect(request.html).toContain('Narration box');
  });

  it('sanitizes unsafe PDF filenames and always adds the PDF extension', () => {
    expect(safePaperPdfFileName('  My/Layout: Final?  ')).toBe('My-Layout-Final.pdf');
    expect(safePaperPdfFileName('')).toBe('paper-document.pdf');
    expect(safePaperPdfFileName('cover.pdf')).toBe('cover.pdf');
  });

  it('builds a raster page PDF request so final PDF text is the flattened editor snapshot', () => {
    let doc = createDefaultPaperDocument({
      title: 'Raster Text Proof',
      preset: 'comic-book',
      dpi: 300,
    });
    doc = addFrameToPaperPage(doc, doc.pages[0].id, {
      kind: 'speechBubble',
      xMm: 20,
      yMm: 25,
      widthMm: 58,
      heightMm: 28,
      text: 'This line must not be reflowed by PDF text layout.',
    }).document;

    const request = buildPaperRasterPdfExportRequest(doc, [{
      pageId: doc.pages[0].id,
      pageNumber: 1,
      widthMm: doc.page.widthMm,
      heightMm: doc.page.heightMm,
      widthPx: 2008,
      heightPx: 3071,
      dataUrl: 'data:image/png;base64,flattened-page',
    }]);

    expect(request.mode).toBe('pages-raster');
    expect(request.html).toContain('data-signal-loom-paper-raster-pdf="true"');
    expect(request.html).toContain('src="data:image/png;base64,flattened-page"');
    expect(request.html).toContain('width: 170mm;');
    expect(request.html).toContain('height: 260mm;');
    expect(request.html).toContain('This line must not be reflowed by PDF text layout.');
  });

  it('builds a browser-safe reader-spread HTML export request', () => {
    const doc = createDefaultPaperDocument({ title: 'Issue 01: Proof', preset: 'comic-book' });

    const request = buildPaperReaderSpreadHtmlExportRequest(doc);

    expect(request.mode).toBe('reader-spreads');
    expect(request.fileName).toBe('Issue-01-Proof-reader-spreads.html');
    expect(request.html).toContain('signal-loom-paper-export');
    expect(request.html).toContain('reader-spreads');
  });

  it('builds PDF requests for reader spreads and booklet proofs without changing page PDF default', () => {
    const doc = createDefaultPaperDocument({ title: 'Issue Proof', preset: 'comic-book' });

    const pages = buildPaperPdfExportRequest(doc);
    const spreads = buildPaperReaderSpreadPdfExportRequest(doc);
    const booklet = buildPaperBookletProofPdfExportRequest(doc);

    expect(pages.mode).toBe('pages');
    expect(pages.page.widthMm).toBe(170);
    expect(spreads.mode).toBe('reader-spreads');
    expect(spreads.page.widthMm).toBe(340);
    expect(booklet.mode).toBe('booklet-proof');
    expect(booklet.html).toContain('booklet-proof');
  });

  it('builds rasterized reader-spread and booklet PDF requests from page snapshots', () => {
    let doc = createDefaultPaperDocument({ title: 'Raster Proof', preset: 'comic-book' });
    doc = addFrameToPaperPage(doc, doc.pages[0].id, {
      kind: 'caption',
      xMm: 10,
      yMm: 12,
      widthMm: 60,
      heightMm: 16,
      text: 'Do not keep this live in spread PDFs.',
    }).document;
    doc = {
      ...doc,
      pages: [
        doc.pages[0],
        { ...doc.pages[0], id: 'page-2', pageNumber: 2, frames: [] },
      ],
    };
    const pages = [
      { pageId: doc.pages[0].id, pageNumber: 1, widthMm: 170, heightMm: 260, widthPx: 2008, heightPx: 3071, dataUrl: 'data:image/png;base64,page-one' },
      { pageId: doc.pages[1].id, pageNumber: 2, widthMm: 170, heightMm: 260, widthPx: 2008, heightPx: 3071, dataUrl: 'data:image/png;base64,page-two' },
    ];

    const spreads = buildPaperRasterReaderSpreadPdfExportRequest(doc, pages);
    const booklet = buildPaperRasterBookletProofPdfExportRequest(doc, pages);

    expect(spreads.mode).toBe('reader-spreads-raster');
    expect(spreads.page.widthMm).toBe(340);
    expect(spreads.html).toContain('data-signal-loom-paper-raster-pdf="reader-spreads"');
    expect(spreads.html).toContain('data:image/png;base64,page-one');
    expect(spreads.html).toContain('data:image/png;base64,page-two');
    expect(spreads.html).not.toContain('paper-raster-gutter');
    expect(spreads.html).not.toContain('rgba(239, 68, 68');
    expect(spreads.html).not.toContain('Blank left');
    expect(booklet.mode).toBe('booklet-proof-raster');
    expect(booklet.html).toContain('data-signal-loom-paper-raster-pdf="booklet-proof"');
    expect(booklet.html).not.toContain('paper-raster-gutter');
    expect(booklet.html).not.toContain('aria-label="Fold"');
    expect(booklet.html).not.toContain('>Blank<');
    expect(booklet.html).toContain('Do not keep this live in spread PDFs.');
  });

  it('sanitizes unsafe HTML filenames and always adds the HTML extension', () => {
    expect(safePaperHtmlFileName('  My/Layout: Spreads?  ')).toBe('My-Layout-Spreads.html');
    expect(safePaperHtmlFileName('')).toBe('paper-document.html');
    expect(safePaperHtmlFileName('spreads.htm')).toBe('spreads.htm');
  });
});
