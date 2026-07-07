import { describe, expect, it } from 'vitest';
import {
  addFrameToPaperPage,
  createDefaultPaperDocument,
  updatePaperDocumentSetup,
} from './paperDocument';
import {
  buildFlattenedPaperPageSourcePayload,
  buildFlattenedPaperPageSvgExport,
  buildFlattenedPaperPageSvgExportWithEmbeddedAssets,
  getPaperPageExportDimensions,
} from './paperPageFlattenExport';

describe('paperPageFlattenExport', () => {
  it('builds a selected-page SVG export at document DPI with bleed included', () => {
    let doc = updatePaperDocumentSetup(createDefaultPaperDocument({
      title: 'Issue 01',
      preset: 'custom',
      dpi: 300,
    }), {
      widthMm: 100,
      heightMm: 150,
      bleedMm: 5,
      background: {
        type: 'linear-gradient',
        fromColor: '#fef3c7',
        toColor: '#67e8f9',
        angleDeg: 135,
      },
    });
    const firstPageId = doc.pages[0].id;
    doc = addFrameToPaperPage(doc, firstPageId, {
      kind: 'caption',
      xMm: 10,
      yMm: 12,
      widthMm: 80,
      heightMm: 20,
      text: 'First page only',
    }).document;

    const second = addFrameToPaperPage({ ...doc, pages: [...doc.pages, { ...doc.pages[0], id: 'page-2', pageNumber: 2, frames: [] }] }, 'page-2', {
      kind: 'caption',
      xMm: 10,
      yMm: 12,
      widthMm: 80,
      heightMm: 20,
      text: 'Second page hidden',
    }).document;

    const exported = buildFlattenedPaperPageSvgExport(second, firstPageId);

    expect(exported.label).toBe('Issue 01 - Page 1');
    expect(exported.mimeType).toBe('image/svg+xml');
    expect(exported.widthPx).toBe(1299);
    expect(exported.heightPx).toBe(1890);
    expect(exported.svg).toContain('foreignObject');
    expect(exported.svg).toContain('linear-gradient(135deg, #fef3c7, #67e8f9)');
    expect(exported.svg).toContain('First page only');
    expect(exported.svg).not.toContain('Second page hidden');
    expect(exported.dataUrl).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
  });

  it('can build source-library payloads with envelope metadata for flattened page groups', () => {
    const doc = createDefaultPaperDocument({ title: 'Manga Layout', preset: 'manga-digest', dpi: 600 });
    const payload = buildFlattenedPaperPageSourcePayload(doc, doc.pages[0].id, {
      envelopeId: 'paper-envelope-1',
      envelopeLabel: 'Chapter 3 pages',
      envelopeIndex: 2,
    });

    expect(payload).toMatchObject({
      label: 'Manga Layout - Page 1',
      kind: 'image',
      mimeType: 'image/svg+xml',
      envelopeId: 'paper-envelope-1',
      envelopeLabel: 'Chapter 3 pages',
      envelopeIndex: 2,
    });
    expect(payload.dataUrl).toContain('data:image/svg+xml');
  });

  it('produces a stable per-page sourceKey so re-sending the same page replaces rather than duplicates the library item', () => {
    const doc = createDefaultPaperDocument({ title: 'Motion Comic', preset: 'comic-book', dpi: 300 });
    const pageId = doc.pages[0].id;

    const first = buildFlattenedPaperPageSourcePayload(doc, pageId);
    const second = buildFlattenedPaperPageSourcePayload(doc, pageId, {
      envelopeId: 'paper-envelope-9',
      envelopeLabel: 'Chapter pages',
      envelopeIndex: 0,
    });

    expect(first.sourceKey).toMatch(new RegExp(`^paper-page:${doc.id}:${pageId}:\\d+x\\d+:(bleed|trim)$`));
    // Identity is anchored on the document/page (not envelope grouping), so the
    // dedupe key stays constant across re-exports and addAssetItem replaces in place.
    expect(second.sourceKey).toBe(first.sourceKey);
  });

  it('can inline placed image assets before building the flattened SVG snapshot', async () => {
    const doc = createDefaultPaperDocument({ title: 'Inline Assets' });
    const pageId = doc.pages[0].id;
    const { document: withImage, frameId } = addFrameToPaperPage(doc, pageId, {
      kind: 'image',
      xMm: 10,
      yMm: 20,
      widthMm: 40,
      heightMm: 30,
      label: 'Blob-backed panel',
    });
    const sourceDoc = {
      ...withImage,
      pages: withImage.pages.map((page) => page.id === pageId
        ? {
            ...page,
            frames: page.frames.map((frame) => frame.id === frameId
              ? {
                  ...frame,
                  asset: {
                    sourceBinItemId: 'image-1',
                    label: 'Blob-backed panel',
                    kind: 'image' as const,
                    src: 'blob:http://127.0.0.1:5175/panel-art',
                    mimeType: 'image/png',
                  },
                }
              : frame),
          }
        : page),
    };

    const exported = await buildFlattenedPaperPageSvgExportWithEmbeddedAssets(sourceDoc, pageId, {
      resolveImageSrc: async (src) => src === 'blob:http://127.0.0.1:5175/panel-art'
        ? 'data:image/png;base64,embedded'
        : src,
    });

    expect(exported.svg).toContain('data:image/png;base64,embedded');
    expect(exported.svg).not.toContain('blob:http://127.0.0.1:5175/panel-art');
  });

  it('does not bake screen-only margin guides into flattened page snapshots', () => {
    const doc = createDefaultPaperDocument({
      title: 'Clean Snapshot',
      preset: 'comic-book',
      dpi: 300,
    });

    const exported = buildFlattenedPaperPageSvgExport(doc, doc.pages[0].id, {
      includeBleed: false,
    });

    expect(exported.svg).not.toContain('.paper-page::after');
    expect(exported.svg).not.toContain('rgba(6, 182, 212');
  });

  it('excludes only the named text frames from the raster (keeps display-font frames baked in)', () => {
    const base = createDefaultPaperDocument({ title: 'Mixed', preset: 'comic-book', dpi: 150 });
    const pageId = base.pages[0].id;
    const withBody = addFrameToPaperPage(base, pageId, {
      kind: 'caption', xMm: 10, yMm: 10, widthMm: 60, heightMm: 20, text: 'SELECTABLE-BODY',
      typography: { fontFamily: 'Georgia', color: '#111111' },
    }).document;
    const withSfx = addFrameToPaperPage(withBody, pageId, {
      kind: 'caption', xMm: 10, yMm: 60, widthMm: 60, heightMm: 20, text: 'RASTER-SFX',
      typography: { fontFamily: 'Impact, Haettenschweiler, sans-serif', color: '#111111' },
    }).document;
    const bodyId = withSfx.pages[0].frames.find((frame) => frame.text === 'SELECTABLE-BODY')!.id;

    // The vectorized body frame is dropped from the raster; the display SFX frame stays baked in.
    const exported = buildFlattenedPaperPageSvgExport(withSfx, pageId, { excludeTextFrameIds: [bodyId] });
    expect(exported.svg).not.toContain('SELECTABLE-BODY');
    expect(exported.svg).toContain('RASTER-SFX');

    // With no exclusion both are present (default full raster).
    const full = buildFlattenedPaperPageSvgExport(withSfx, pageId);
    expect(full.svg).toContain('SELECTABLE-BODY');
    expect(full.svg).toContain('RASTER-SFX');
  });

  it('knocks the fill out of excludeFrameFillIds frames (spot fill drawn as a plate on top)', () => {
    const base = createDefaultPaperDocument({ title: 'SpotKnock', preset: 'comic-book', dpi: 150 });
    const pageId = base.pages[0].id;
    const added = addFrameToPaperPage(base, pageId, {
      kind: 'caption', xMm: 10, yMm: 10, widthMm: 60, heightMm: 20, text: 'ON-SPOT', fillColor: '#e30613',
    });
    const frameId = added.frameId;

    // Full raster keeps the fill colour; the knockout removes it (paper) but keeps the frame's text.
    expect(buildFlattenedPaperPageSvgExport(added.document, pageId).svg).toContain('#e30613');
    const knocked = buildFlattenedPaperPageSvgExport(added.document, pageId, { excludeFrameFillIds: [frameId] });
    expect(knocked.svg).not.toContain('#e30613');
    expect(knocked.svg).toContain('ON-SPOT');
  });

  it('can compute export dimensions with or without bleed', () => {
    const doc = updatePaperDocumentSetup(createDefaultPaperDocument({ preset: 'custom', dpi: 300 }), {
      widthMm: 25.4,
      heightMm: 50.8,
      bleedMm: 3,
    });

    expect(getPaperPageExportDimensions(doc, { includeBleed: true })).toMatchObject({
      widthPx: 371,
      heightPx: 671,
      widthMm: 31.4,
      heightMm: 56.8,
    });
    expect(getPaperPageExportDimensions(doc, { includeBleed: false })).toMatchObject({
      widthPx: 300,
      heightPx: 600,
      widthMm: 25.4,
      heightMm: 50.8,
    });
  });
});
