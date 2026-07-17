import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BinaryAssetId } from '../shared/assets/contentAddressedAsset';
import { addFrameToPaperPage, createDefaultPaperDocument, exportPaperDocumentToPrintHtml } from './paperDocument';
import { buildPaperCbzRasterExport } from './paperDocumentFormats';
import { buildPaperKdpImageArchiveExport } from './paperKdpExport';
import {
  assertPaperDocumentSupportsRasterization,
  collectPaperPlacedDocumentRasterizationIssues,
  PaperPlacedDocumentRasterizationError,
} from './paperPlacedDocumentRasterization';
import { buildFlattenedPaperPageSvgExportWithEmbeddedAssets } from './paperPageFlattenExport';
import { buildPaperWebcomicImageDataPages } from './paperWebcomicExport';

afterEach(() => vi.unstubAllGlobals());

function placedDocument(
  kind: 'inline' | 'managed' | 'source' | 'remote-wrong-mime' = 'inline',
) {
  const base = createDefaultPaperDocument({ title: 'Placed PDF boundary' });
  const sha256 = 'a'.repeat(64);
  const asset = kind === 'managed'
    ? {
        label: 'Managed reference.pdf', kind: 'document' as const, mimeType: 'application/pdf',
        locator: { kind: 'managed' as const, ref: {
          id: `sha256:${sha256}` as BinaryAssetId, sha256, mimeType: 'application/pdf', byteLength: 4,
        } },
      }
    : kind === 'source'
      ? { label: 'Source reference.pdf', kind: 'document' as const, sourceBinItemId: 'source-pdf', mimeType: 'application/pdf' }
      : kind === 'remote-wrong-mime'
        ? { label: 'Remote unknown.pdf', kind: 'document' as const, locator: { kind: 'external' as const, url: 'https://example.invalid/reference.pdf' }, mimeType: 'application/octet-stream' }
        : { label: 'Inline reference.pdf', kind: 'document' as const, locator: { kind: 'external' as const, url: 'data:application/pdf;base64,JVBERi0=' }, mimeType: 'application/pdf' };
  return addFrameToPaperPage(base, base.pages[0].id, {
    kind: 'document', label: asset.label, xMm: 11, yMm: 12, widthMm: 80, heightMm: 45,
    rotationDeg: 17, fit: 'cover', imageOffsetXPercent: 25, imageOffsetYPercent: 75, asset,
  }).document;
}

describe('placed-document rasterization capability boundary', () => {
  it.each(['inline', 'managed', 'source', 'remote-wrong-mime'] as const)(
    'reports %s records before fetch, decode, or canvas work',
    (record) => {
      const document = placedDocument(record);
      const [issue] = collectPaperPlacedDocumentRasterizationIssues(document);

      expect(issue).toMatchObject({
        code: 'paper-placed-document-rasterization-unsupported', pageNumber: 1,
        frameLabel: expect.stringContaining('.pdf'),
      });
      expect(() => assertPaperDocumentSupportsRasterization(document)).toThrow(PaperPlacedDocumentRasterizationError);
      expect(() => assertPaperDocumentSupportsRasterization(document)).toThrow(/Print HTML\/live print|replace it with a raster image/);
    },
  );

  it('blocks corrupt/wrong-MIME inline data and missing source records before resolver/decode cancellation can begin', async () => {
    const wrongMime = placedDocument('inline');
    const wrongMimeFrame = wrongMime.pages[0].frames.find((frame) => frame.kind === 'document')!;
    const corruptInline = {
      ...wrongMime,
      pages: wrongMime.pages.map((page) => ({
        ...page,
        frames: page.frames.map((frame) => frame.id === wrongMimeFrame.id ? {
          ...frame,
          asset: { ...frame.asset!, mimeType: 'image/png', locator: { kind: 'external' as const, url: 'data:application/pdf;base64,corrupt' } },
        } : frame),
      })),
    };
    const missingSource = placedDocument('source');
    const resolveImageSrc = vi.fn(() => { throw new Error('resolver must not run'); });
    class DecodeMustNotRun {
      decoding = '';
      set src(_value: string) { throw new Error('decode must not run'); }
    }
    vi.stubGlobal('Image', DecodeMustNotRun);

    await expect(buildFlattenedPaperPageSvgExportWithEmbeddedAssets(corruptInline, corruptInline.pages[0].id, { resolveImageSrc }))
      .rejects.toThrow(PaperPlacedDocumentRasterizationError);
    await expect(buildFlattenedPaperPageSvgExportWithEmbeddedAssets(missingSource, missingSource.pages[0].id, { resolveImageSrc }))
      .rejects.toThrow(PaperPlacedDocumentRasterizationError);
    expect(resolveImageSrc).not.toHaveBeenCalled();
  });

  it('blocks every flattened multi-page transaction before the first raster, including later-page PDFs', async () => {
    const first = createDefaultPaperDocument({ title: 'Mixed pages' });
    const second = { ...first.pages[0], id: 'page-2', pageNumber: 2, frames: [] };
    const withSecondPage = { ...first, pages: [first.pages[0], second] };
    const document = addFrameToPaperPage(withSecondPage, second.id, {
      kind: 'document', label: 'Page two.pdf', xMm: 10, yMm: 10, widthMm: 50, heightMm: 50,
      asset: { label: 'Page two.pdf', kind: 'document', mimeType: 'application/pdf', locator: { kind: 'external', url: 'data:application/pdf;base64,JVBERi0=' } },
    }).document;
    const rasterize = vi.fn();

    await expect(buildPaperWebcomicImageDataPages(document, { rasterize })).rejects.toThrow(PaperPlacedDocumentRasterizationError);
    await expect(buildPaperCbzRasterExport(document, { rasterize })).rejects.toThrow(PaperPlacedDocumentRasterizationError);
    await expect(buildPaperKdpImageArchiveExport(document, { rasterize })).rejects.toThrow(PaperPlacedDocumentRasterizationError);
    expect(rasterize).not.toHaveBeenCalled();
  });

  it('keeps compatible vector/live-print HTML available with the native PDF object placement', () => {
    const document = placedDocument();
    const html = exportPaperDocumentToPrintHtml(document);

    expect(html).toContain('<object data="data:application/pdf;base64,JVBERi0=" type="application/pdf"');
    expect(html).toContain('Linked PDF: Inline reference.pdf');
  });
});
