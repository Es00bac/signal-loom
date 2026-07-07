import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { addFrameToPaperPage, createDefaultPaperDocument, updatePaperFrame } from './paperDocument';
import { addPaperPage } from './paperDocument';
import type { PaperSwatch } from './paperSwatches';
import {
  bundledProfileForOutputIntent,
  exportPaperDocumentToPdfx,
  isSubstitutedOutputIntent,
  resolvePdfxProfile,
  type PaperPdfxPipelineDeps,
  type RasterizePageOptions,
} from './paperPdfxPipeline';
import { validatePaperPdfx } from './paperPdfxValidate';
import { createRgbToCmykTransform } from './paperIccEngine';

const fogra39 = new Uint8Array(readFileSync('public/icc/FOGRA39L_coated.icc'));

// Deterministic synthetic rasterizer (no canvas needed): opaque mid-gray page at a small size.
function stubRaster(widthPx = 48, heightPx = 64) {
  const rgba = new Uint8Array(widthPx * heightPx * 4);
  for (let i = 0; i < widthPx * heightPx; i += 1) {
    rgba[i * 4] = 128; rgba[i * 4 + 1] = 64; rgba[i * 4 + 2] = 32; rgba[i * 4 + 3] = 255;
  }
  return { rgba, widthPx, heightPx };
}

function deps(): PaperPdfxPipelineDeps {
  return {
    rasterizePage: async () => stubRaster(),
    loadIccBytes: async () => fogra39,
    createTransform: (bytes) => createRgbToCmykTransform(bytes, { intent: 'relative' }),
  };
}

describe('paperPdfxPipeline', () => {
  it('exports a real multi-page PDF/X-4 from a PaperDocument', async () => {
    let document = createDefaultPaperDocument({ title: 'Pipeline test', preset: 'us-letter' });
    document = addPaperPage(document); // 2 pages

    const result = await exportPaperDocumentToPdfx(
      document,
      { standard: 'pdf-x-4', iccProfileId: 'fogra39', outputDpi: 150 },
      deps(),
    );

    expect(result.pageCount).toBe(2);
    expect(result.approximateColor).toBe(false);
    const report = await validatePaperPdfx(result.bytes, { standard: 'pdf-x-4' });
    expect(report.pass, JSON.stringify(report.checks.filter((c) => !c.pass))).toBe(true);
  });

  it('emits a real /Separation spot plate end-to-end and knocks the fill out of the raster', async () => {
    let document = createDefaultPaperDocument({ title: 'Spot pipeline', preset: 'us-letter' });
    const spot: PaperSwatch = { id: 'sw-spot', name: 'Brand', type: 'spot', model: 'cmyk', spotName: 'PANTONE 185 C', rgb: { r: 227, g: 6, b: 19 }, cmyk: { c: 0, m: 90, y: 85, k: 0 } };
    document = { ...document, swatches: [spot], printProduction: { ...document.printProduction, spotColorPolicy: 'preserve-named' } };
    const pageId = document.pages[0].id;
    const added = addFrameToPaperPage(document, pageId, { kind: 'caption', xMm: 20, yMm: 20, widthMm: 60, heightMm: 40, strokeWidthMm: 0, strokeColor: 'transparent', cornerRadiusMm: 0 });
    document = updatePaperFrame(added.document, pageId, added.frameId, { fillColor: '#e30613', fillSwatchId: 'sw-spot' });

    const seen: (RasterizePageOptions | undefined)[] = [];
    const spyDeps: PaperPdfxPipelineDeps = { ...deps(), rasterizePage: async (_id, _dpi, opts) => { seen.push(opts); return stubRaster(); } };

    const result = await exportPaperDocumentToPdfx(document, { standard: 'pdf-x-4', iccProfileId: 'fogra39', outputDpi: 150 }, spyDeps);

    // The spot-fill frame's fill was knocked out of the raster …
    expect(seen[0]?.excludeFrameFillIds).toEqual([added.frameId]);
    // … and the exported PDF carries a real /Separation plate for the colorant.
    const raw = Buffer.from(result.bytes).toString('latin1');
    expect(raw).toContain('/Separation');
    expect(raw).toContain('PANTONE#20185#20C');
    const report = await validatePaperPdfx(result.bytes, { standard: 'pdf-x-4' });
    expect(report.pass, JSON.stringify(report.checks.filter((c) => !c.pass))).toBe(true);
  });

  it('outlines stroked text to vector curves, knocks it out of the raster, and stays valid PDF/X-4', async () => {
    let document = createDefaultPaperDocument({ title: 'Outline pipeline', preset: 'us-letter' });
    const pageId = document.pages[0].id;
    // A stroked caption is otherwise vector-safe → outlined (filled + stroked curves), not rasterized.
    const added = addFrameToPaperPage(document, pageId, {
      kind: 'caption', xMm: 20, yMm: 20, widthMm: 80, heightMm: 30, text: 'BOOM',
      textStrokeWidthMm: 0.6, textStrokeColor: '#ffffff',
      typography: { fontFamily: 'Georgia, serif', fontSizePt: 28, color: '#000000' },
    });
    document = added.document;

    const seen: (RasterizePageOptions | undefined)[] = [];
    const spyDeps: PaperPdfxPipelineDeps = {
      ...deps(),
      rasterizePage: async (_id, _dpi, opts) => { seen.push(opts); return stubRaster(); },
      // Vector/outline text is opt-in and needs a font loader for bundled Liberation faces.
      loadFontBytes: async (url) => new Uint8Array(readFileSync(`public${url}`)),
    };
    const result = await exportPaperDocumentToPdfx(document, { standard: 'pdf-x-4', iccProfileId: 'fogra39', outputDpi: 150, vectorText: true }, spyDeps);

    // The stroked-text frame's text was knocked out of the raster backdrop (drawn as outlines instead).
    expect(seen[0]?.excludeTextFrameIds).toContain(added.frameId);
    // The exported file is still a conformant PDF/X-4.
    const report = await validatePaperPdfx(result.bytes, { standard: 'pdf-x-4' });
    expect(report.pass, JSON.stringify(report.checks.filter((c) => !c.pass))).toBe(true);
  });

  it('maps output-intent selections to bundled ICC profiles', () => {
    expect(bundledProfileForOutputIntent('gracol-2013-coated').id).toBe('gracol-tr006');
    expect(bundledProfileForOutputIntent('swop-coated-v2').id).toBe('swop-tr003');
    // Non-bundled conditions substitute the nearest bundled profile (flagged honestly).
    expect(isSubstitutedOutputIntent('pso-coated-v3-fogra51')).toBe(true);
    expect(bundledProfileForOutputIntent('pso-coated-v3-fogra51').id).toBe('fogra39');
    expect(isSubstitutedOutputIntent('gracol-2013-coated')).toBe(false);
  });

  it('falls back to the default profile for an unknown id', () => {
    expect(resolvePdfxProfile('does-not-exist').id).toBe('fogra39');
  });
});
