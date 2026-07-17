import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addFrameToPaperPage, createDefaultPaperDocument } from './paperDocument';
import { PaperPlacedDocumentRasterizationError } from './paperPlacedDocumentRasterization';

const mocks = vi.hoisted(() => ({
  resolveProfile: vi.fn(),
  materialize: vi.fn(),
  exportPdfx: vi.fn(),
  buildPage: vi.fn(),
  rasterize: vi.fn(),
}));

vi.mock('./paperPageFlattenExport', () => ({
  buildFlattenedPaperPageSvgExportWithEmbeddedAssets: mocks.buildPage,
  imageSourceToDataUrl: vi.fn(),
  rasterizeFlattenedPaperPageToRgba: mocks.rasterize,
}));
vi.mock('./paperIccEngine', () => ({ createRgbToCmykTransform: vi.fn() }));
vi.mock('./paperPdfxPipeline', () => ({ exportPaperDocumentToPdfx: mocks.exportPdfx }));
vi.mock('./paperManagedIccProfiles', () => ({ resolveExactPaperOutputProfile: mocks.resolveProfile }));
vi.mock('../features/paper/assets/PaperAssetRuntime', () => ({
  materializePaperDocumentAssetUrls: mocks.materialize,
  paperAssetRepository: { get: vi.fn() },
}));
vi.mock('../store/sourceBinStore', () => ({
  useSourceBinStore: { getState: () => ({ getAllItems: () => [] }) },
}));

import { exportPaperDocumentToPdfxInBrowser } from './paperPdfxBrowser';

describe('exportPaperDocumentToPdfxInBrowser placed-document boundary', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the same typed capability outcome before profile/materialization/raster work', async () => {
    const base = createDefaultPaperDocument({ title: 'PDF/X placed PDF boundary' });
    const { document } = addFrameToPaperPage(base, base.pages[0].id, {
      kind: 'document', label: 'Press reference.pdf', xMm: 10, yMm: 10, widthMm: 60, heightMm: 40,
      asset: { label: 'Press reference.pdf', kind: 'document', mimeType: 'application/pdf', locator: { kind: 'external', url: 'data:application/pdf;base64,JVBERi0=' } },
    });

    await expect(exportPaperDocumentToPdfxInBrowser(document, { standard: 'pdf-x-4' })).rejects.toThrow(PaperPlacedDocumentRasterizationError);
    expect(mocks.resolveProfile).not.toHaveBeenCalled();
    expect(mocks.materialize).not.toHaveBeenCalled();
    expect(mocks.buildPage).not.toHaveBeenCalled();
    expect(mocks.rasterize).not.toHaveBeenCalled();
    expect(mocks.exportPdfx).not.toHaveBeenCalled();
  });
});
