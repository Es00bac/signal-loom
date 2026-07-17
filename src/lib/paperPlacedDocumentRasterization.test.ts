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
import { buildFlattenedPaperPageSvgExport, buildFlattenedPaperPageSvgExportWithEmbeddedAssets } from './paperPageFlattenExport';
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
    expect(html).toContain('PDF-capable print viewer required for Inline reference.pdf');
  });

  it.each(['application/pdf', 'application/x-pdf', 'application/acrobat'] as const)(
    'blocks %s on image frames before any resolver/decode work and keeps it as a live-print object',
    async (mimeType) => {
      const base = createDefaultPaperDocument({ title: 'Image-frame PDF alias' });
      const { document } = addFrameToPaperPage(base, base.pages[0].id, {
        kind: 'image', label: 'Placed artwork', xMm: 10, yMm: 10, widthMm: 50, heightMm: 40,
        asset: { label: 'Placed artwork', kind: 'image', mimeType, locator: { kind: 'external', url: `data:${mimeType};base64,JVBERi0=` } },
      });
      const resolveImageSrc = vi.fn(() => { throw new Error('resolver must not run'); });

      await expect(buildFlattenedPaperPageSvgExportWithEmbeddedAssets(document, document.pages[0].id, { resolveImageSrc }))
        .rejects.toThrow(PaperPlacedDocumentRasterizationError);
      expect(resolveImageSrc).not.toHaveBeenCalled();
      expect(exportPaperDocumentToPrintHtml(document)).toContain(`<object data="data:${mimeType};base64,JVBERi0=" type="application/pdf"`);
    },
  );

  it('detects managed aliases and PDF-labelled missing assets without reading payload bytes or promising a placeholder', () => {
    const base = createDefaultPaperDocument({ title: 'Managed and missing PDFs' });
    const sha256 = 'b'.repeat(64);
    const managed = addFrameToPaperPage(base, base.pages[0].id, {
      kind: 'image', label: 'Misfiled image', xMm: 10, yMm: 10, widthMm: 40, heightMm: 40,
      asset: { label: 'Misfiled image', kind: 'image', locator: { kind: 'managed', ref: {
        id: `sha256:${sha256}` as BinaryAssetId, sha256, mimeType: 'application/acrobat', byteLength: 12,
      } } },
    }).document;
    const document = addFrameToPaperPage(managed, managed.pages[0].id, {
      kind: 'document', label: 'Missing-but-labelled.PDF', xMm: 55, yMm: 10, widthMm: 40, heightMm: 40,
    }).document;

    const issues = collectPaperPlacedDocumentRasterizationIssues(document);
    expect(issues).toHaveLength(2);
    expect(issues.map((issue) => issue.mimeType)).toContain('application/acrobat');
    expect(issues.find((issue) => issue.frameLabel === 'Missing-but-labelled.PDF')?.message).toContain('Restore or relink');
    expect(exportPaperDocumentToPrintHtml(document)).toContain('PDF asset unavailable: relink Missing-but-labelled.PDF');
  });

  it('classifies a bounded data URL header and leaves non-PDF vectors available', () => {
    const base = createDefaultPaperDocument({ title: 'Bounded PDF classification' });
    const hugePayload = `data:application/x-pdf;base64,${'x'.repeat(1024 * 1024)}`;
    const { document } = addFrameToPaperPage(base, base.pages[0].id, {
      kind: 'image', label: 'Huge placed payload', xMm: 10, yMm: 10, widthMm: 40, heightMm: 40,
      asset: { label: 'Huge placed payload', kind: 'image', locator: { kind: 'external', url: hugePayload } },
    });
    expect(collectPaperPlacedDocumentRasterizationIssues(document)[0]).toMatchObject({ mimeType: 'application/x-pdf', isPdf: true });

    const vectorBase = createDefaultPaperDocument({ title: 'SVG remains available' });
    const vector = addFrameToPaperPage(vectorBase, vectorBase.pages[0].id, {
      kind: 'image', label: 'Vector art', xMm: 10, yMm: 10, widthMm: 40, heightMm: 40,
      asset: { label: 'Vector art', kind: 'image', mimeType: 'image/svg+xml', locator: { kind: 'external', url: 'data:image/svg+xml,%3Csvg/%3E' } },
    }).document;
    expect(() => assertPaperDocumentSupportsRasterization(vector)).not.toThrow();
  });

  it('preflights all pages for a selected-page flatten and rejects unknown page ids without falling back', async () => {
    const first = createDefaultPaperDocument({ title: 'Selected page transaction' });
    const second = { ...first.pages[0], id: 'page-2', pageNumber: 2, frames: [] };
    const withSecondPage = { ...first, pages: [first.pages[0], second] };
    const document = addFrameToPaperPage(withSecondPage, second.id, {
      kind: 'document', label: 'Later.pdf', xMm: 10, yMm: 10, widthMm: 50, heightMm: 50,
      asset: { label: 'Later.pdf', kind: 'document', mimeType: 'application/pdf', locator: { kind: 'external', url: 'data:application/pdf;base64,JVBERi0=' } },
    }).document;
    const resolver = vi.fn();

    expect(() => buildFlattenedPaperPageSvgExport(document, document.pages[0].id)).toThrow(PaperPlacedDocumentRasterizationError);
    await expect(buildFlattenedPaperPageSvgExportWithEmbeddedAssets(document, document.pages[0].id, { resolveImageSrc: resolver }))
      .rejects.toThrow(PaperPlacedDocumentRasterizationError);
    expect(resolver).not.toHaveBeenCalled();
    expect(() => buildFlattenedPaperPageSvgExport(first, 'missing-page')).toThrow(/Unknown Paper page id/);
  });
});
