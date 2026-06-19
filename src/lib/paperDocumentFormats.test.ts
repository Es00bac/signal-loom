import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import type { SourceBinLibraryItem } from '../store/sourceBinStore';
import { addFrameToPaperPage, createDefaultPaperDocument } from './paperDocument';
import { analyzePaperPreflight, collectPaperLinkedAssets } from './paperPreflight';
import {
  buildPaperCbzManifestExport,
  buildPaperCbzRasterExport,
  exportPaperIdmlInterchange,
  exportPaperStoryText,
  importPaperIdmlInterchange,
  importTextDocumentIntoPaper,
  parsePaperDocumentImportFile,
  placeDocumentSourceOnPaperPage,
} from './paperDocumentFormats';

describe('paperDocumentFormats', () => {
  it('imports Markdown headings and paragraphs as Paper text frames', async () => {
    const file = new File(['# Page One\n\nPanel caption text.\n\n## Scene Two\n\nMore dialogue.'], 'script.md', { type: 'text/markdown' });
    const imported = await parsePaperDocumentImportFile(file);
    if (!('blocks' in imported)) throw new Error('Expected text document import.');
    expect(imported.blocks.map((block) => block.role)).toEqual(['heading', 'paragraph', 'heading', 'paragraph']);

    const doc = importTextDocumentIntoPaper(imported);
    expect(doc.title).toBe('script');
    expect(doc.pages.flatMap((page) => page.frames).map((frame) => frame.text)).toEqual(expect.arrayContaining(['Page One', 'Panel caption text.']));
    expect(doc.pages[0].frames[0].typography.fontWeight).toBe('700');
  });

  it('extracts paragraph text from DOCX word/document.xml', async () => {
    const base = createDefaultPaperDocument({ title: 'Docx Source' });
    const { document } = addFrameToPaperPage(base, base.pages[0].id, {
      kind: 'text',
      xMm: 10,
      yMm: 10,
      widthMm: 80,
      heightMm: 25,
      text: 'First paragraph\nSecond paragraph',
    });
    const exported = exportPaperStoryText(document, 'docx');
    const file = new File([exported.blob], 'story.docx', { type: exported.mimeType });
    const imported = await parsePaperDocumentImportFile(file);

    expect('blocks' in imported ? imported.blocks.map((block) => block.text) : []).toEqual(expect.arrayContaining(['First paragraph', 'Second paragraph']));
  });

  it('wraps a hyperlinked text frame in an <a> in the HTML story export', () => {
    const base = createDefaultPaperDocument({ title: 'Links' });
    const { document } = addFrameToPaperPage(base, base.pages[0].id, {
      kind: 'text',
      xMm: 10,
      yMm: 10,
      widthMm: 80,
      heightMm: 25,
      text: 'Visit the site',
      hyperlink: 'https://example.com/docs',
    });
    const exported = exportPaperStoryText(document, 'html');
    expect('text' in exported ? exported.text : '').toContain('<a href="https://example.com/docs">Visit the site</a>');
  });

  it('roundtrips IDML-like interchange with setup, pages, styles, links, and guides', () => {
    const item = pdfItem();
    const base = createDefaultPaperDocument({ title: 'Interchange' });
    const placed = placeDocumentSourceOnPaperPage(base, base.pages[0].id, item);
    const json = exportPaperIdmlInterchange(placed.document);
    const roundtripped = importPaperIdmlInterchange(json);
    const parsed = JSON.parse(json) as { manifest: { linkCount: number }; links: unknown[]; guides: unknown[] };

    expect(roundtripped.title).toBe('Interchange');
    expect(roundtripped.pages[0].frames[0].kind).toBe('document');
    expect(parsed.manifest.linkCount).toBe(1);
    expect(parsed.links).toHaveLength(1);
    expect(parsed.guides.length).toBeGreaterThan(0);
  });

  it('builds a CBZ package with zero-padded raster PNG page files', async () => {
    const base = createDefaultPaperDocument({ title: 'Comic Export' });
    const { document } = addFrameToPaperPage(base, base.pages[0].id, {
      kind: 'caption',
      xMm: 10,
      yMm: 10,
      widthMm: 80,
      heightMm: 20,
      text: 'Narration box',
    });
    const exported = await buildPaperCbzRasterExport(document, {
      rasterize: (page) => ({
        pageId: page.pageId,
        pageNumber: page.pageNumber,
        label: page.label,
        widthMm: page.widthMm,
        heightMm: page.heightMm,
        widthPx: page.widthPx,
        heightPx: page.heightPx,
        scale: page.scale,
        includeBleed: page.includeBleed,
        mimeType: 'image/png',
        dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
      }),
    });
    const entries = unzipSync(new Uint8Array(await exported.blob.arrayBuffer()));
    const manifest = JSON.parse(strFromU8(entries['manifest.json'])) as { format: string; pages: Array<{ path: string }> };

    expect(exported.fileName).toBe('Comic-Export.cbz');
    expect(Object.keys(entries)).toEqual(expect.arrayContaining(['manifest.json', 'ComicInfo.xml', 'pages/page-001.png']));
    expect(Object.keys(entries).some((entry) => entry.endsWith('.svg'))).toBe(false);
    expect(entries['pages/page-001.png']).toEqual(Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(manifest.format).toBe('sloom-cbz-raster');
    expect(manifest.pages[0].path).toBe('pages/page-001.png');
  });

  it('keeps the legacy CBZ manifest helper with per-page SVG payloads', async () => {
    const document = createDefaultPaperDocument({ title: 'Legacy CBZ' });
    const exported = buildPaperCbzManifestExport(document);
    const entries = unzipSync(new Uint8Array(await exported.blob.arrayBuffer()));

    expect(Object.keys(entries)).toEqual(expect.arrayContaining(['manifest.json', 'pages/page-001.svg']));
  });

  it('places PDF documents as linked frames with preflight/link tracking', () => {
    const item = pdfItem();
    const base = createDefaultPaperDocument({ title: 'PDF Place' });
    const { document, frameId } = placeDocumentSourceOnPaperPage(base, base.pages[0].id, item, { xMm: 12, yMm: 18 });
    const frame = document.pages[0].frames.find((candidate) => candidate.id === frameId);
    const linked = collectPaperLinkedAssets(document, [item]);
    const report = analyzePaperPreflight(document, [item]);

    expect(frame).toEqual(expect.objectContaining({ kind: 'document', asset: expect.objectContaining({ mimeType: 'application/pdf', sourceBinItemId: item.id }) }));
    expect(linked[0]).toEqual(expect.objectContaining({ sourceId: item.id, status: 'unknown', frameId }));
    expect(report.issues.some((issue) => issue.title === 'Missing linked document')).toBe(false);
  });
});

function pdfItem(): SourceBinLibraryItem {
  return {
    id: 'pdf-1',
    label: 'Reference.pdf',
    kind: 'document',
    mimeType: 'application/pdf',
    assetUrl: 'blob:reference-pdf',
    createdAt: 1,
  };
}
