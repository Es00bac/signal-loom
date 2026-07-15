import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultPaperDocument } from './paperDocument';

const mocks = vi.hoisted(() => ({
  buildPage: vi.fn(),
  createProof: vi.fn(),
  materialize: vi.fn(),
  rasterize: vi.fn(),
  resolveProfile: vi.fn(),
  softProof: vi.fn(),
}));

vi.mock('./paperPageFlattenExport', () => ({
  buildFlattenedPaperPageSvgExportWithEmbeddedAssets: mocks.buildPage,
  imageSourceToDataUrl: vi.fn(),
  rasterizeFlattenedPaperPageToRgba: mocks.rasterize,
}));
vi.mock('./paperIccEngine', () => ({ createSoftProofTransform: mocks.createProof }));
vi.mock('./paperManagedIccProfiles', () => ({ resolveExactPaperOutputProfile: mocks.resolveProfile }));
vi.mock('./paperSoftProofImage', () => ({ softProofRgba: mocks.softProof }));
vi.mock('../features/paper/assets/PaperAssetRuntime', () => ({
  materializePaperDocumentAssetUrls: mocks.materialize,
  paperAssetRepository: { get: vi.fn() },
}));
vi.mock('../store/sourceBinStore', () => ({
  useSourceBinStore: { getState: () => ({ getAllItems: () => [{ id: 'source-art' }] }) },
}));

import { softProofPaperPageInBrowser } from './paperSoftProofBrowser';

describe('softProofPaperPageInBrowser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveProfile.mockResolvedValue({ status: 'ready', bytes: new Uint8Array([1, 2, 3]) });
    mocks.createProof.mockResolvedValue({ profileName: 'FOGRA39L Coated', dispose: vi.fn() });
    mocks.buildPage.mockResolvedValue({ widthPx: 1, heightPx: 1 });
    mocks.rasterize.mockResolvedValue({ rgba: new Uint8ClampedArray([20, 30, 40, 255]), widthPx: 1, heightPx: 1 });
    mocks.softProof.mockImplementation((rgba) => rgba);
    const context = {
      createImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
      putImageData: vi.fn(),
    };
    vi.stubGlobal('window', {
      document: {
        createElement: vi.fn(() => ({
          width: 0,
          height: 0,
          getContext: vi.fn(() => context),
          toDataURL: vi.fn(() => 'data:image/png;base64,proof'),
        })),
      },
    });
  });

  it('materializes managed artwork before flattening the page for CMYK simulation', async () => {
    const document = createDefaultPaperDocument({ title: 'Managed artwork proof' });
    const materialized = { ...document, title: 'Materialized artwork proof' };
    mocks.materialize.mockResolvedValue(materialized);

    const result = await softProofPaperPageInBrowser(document, document.pages[0].id);

    expect(mocks.materialize).toHaveBeenCalledWith(document, [{ id: 'source-art' }]);
    expect(mocks.buildPage).toHaveBeenCalledWith(
      materialized,
      document.pages[0].id,
      expect.objectContaining({ includeBleed: false, outputDpi: 150 }),
    );
    expect(result.dataUrl).toBe('data:image/png;base64,proof');
  });
});
