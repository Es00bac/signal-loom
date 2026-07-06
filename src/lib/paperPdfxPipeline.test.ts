import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createDefaultPaperDocument } from './paperDocument';
import { addPaperPage } from './paperDocument';
import {
  bundledProfileForOutputIntent,
  exportPaperDocumentToPdfx,
  isSubstitutedOutputIntent,
  resolvePdfxProfile,
  type PaperPdfxPipelineDeps,
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
