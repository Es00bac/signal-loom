import { readFileSync, writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import { buildPaperPdfx, type PdfxRasterPage, type PdfxStandard } from './paperPdfxExport';
import { validatePaperPdfx } from './paperPdfxValidate';
import { createRgbToCmykTransform } from './paperIccEngine';
import { APPROXIMATE_CMYK_TRANSFORM, type IccCmykTransform } from './paperColorManagement';

/** Inflate the first DeviceCMYK image stream in a PDF back to raw 8-bit CMYK samples. */
async function readDeviceCmykImage(bytes: Uint8Array): Promise<Uint8Array | undefined> {
  const loaded = await PDFDocument.load(bytes);
  for (const [, obj] of loaded.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFRawStream) {
      const cs = obj.dict.get(PDFName.of('ColorSpace'));
      if (cs && cs.toString() === '/DeviceCMYK') {
        return new Uint8Array(inflateSync(Buffer.from(obj.contents)));
      }
    }
  }
  return undefined;
}

/** A transform that paints every pixel at 400% TAC — so ink-limit clamping is observable. */
const MAX_INK_TRANSFORM = {
  kind: 'icc',
  profileName: 'max-ink',
  rgbToCmyk: () => ({ c: 100, m: 100, y: 100, k: 100 }),
  transformRgbBuffer: (_rgb: Uint8Array, pixelCount: number) => new Uint8Array(pixelCount * 4).fill(255),
} as unknown as IccCmykTransform;

const fogra39 = new Uint8Array(readFileSync('public/icc/FOGRA39L_coated.icc'));

// A synthetic page: red band / white band / black band, fully opaque. Exercises real CMYK conversion.
function makePage(pageNumber: number, w = 96, h = 96): PdfxRasterPage {
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      let r = 255, g = 255, b = 255;
      if (y < h / 3) { r = 255; g = 0; b = 0; }          // red
      else if (y >= (2 * h) / 3) { r = 0; g = 0; b = 0; } // black
      rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = 255;
    }
  }
  // 3in × 3in trim (216pt) with 9pt (0.125") bleed.
  return { pageNumber, rgba, widthPx: w, heightPx: h, trimWidthPt: 216, trimHeightPt: 216, bleedPt: 9 };
}

async function fograTransform() {
  return createRgbToCmykTransform(fogra39, { intent: 'relative' });
}

const profile = {
  iccBytes: fogra39,
  outputConditionIdentifier: 'FOGRA39',
  outputCondition: 'Coated FOGRA39 (ISO 12647-2:2004)',
};

describe('buildPaperPdfx', () => {
  it.each<PdfxStandard>(['pdf-x-1a', 'pdf-x-4'])('produces a structurally conformant %s', async (standard) => {
    const transform = await fograTransform();
    const result = await buildPaperPdfx([makePage(1), makePage(2)], {
      standard,
      profile,
      transform,
      title: 'Sloom Studio print test',
      author: 'Sloom Studio',
      docId: '0123456789abcdef0123456789abcdef',
      createdAt: new Date('2026-07-06T00:00:00Z'),
    });

    expect(result.pageCount).toBe(2);
    expect(result.approximateColor).toBe(false);

    const report = await validatePaperPdfx(result.bytes, { standard });
    const failed = report.checks.filter((c) => !c.pass).map((c) => `${c.label}${c.detail ? ` (${c.detail})` : ''}`);
    expect(failed, `failed checks: ${failed.join('; ')}`).toEqual([]);
    expect(report.pass).toBe(true);
    expect(report.standard).toBe(standard);

    // Dump artifacts for external verification (gs/pdfinfo/veraPDF) when requested.
    const outDir = process.env.SLOOM_PDFX_OUT;
    if (outDir) writeFileSync(`${outDir}/sloom-${standard}.pdf`, result.bytes);
  });

  it('enforces the total-ink limit on the exported CMYK raster (makes the preflight promise real)', async () => {
    const base = { standard: 'pdf-x-4' as const, profile, transform: MAX_INK_TRANSFORM, docId: '0123456789abcdef0123456789abcdef' };
    // Without a limit the 400% paint survives to the file …
    const unlimited = await buildPaperPdfx([makePage(1, 8, 8)], base);
    const rawUnlimited = await readDeviceCmykImage(unlimited.bytes);
    expect(rawUnlimited).toBeDefined();
    expect(rawUnlimited![0] + rawUnlimited![1] + rawUnlimited![2] + rawUnlimited![3]).toBe(1020); // 400%

    // … but with a 280% ceiling, EVERY exported pixel is reduced to meet it, K preserved.
    const limited = await buildPaperPdfx([makePage(1, 8, 8)], { ...base, totalInkLimitPercent: 280 });
    const raw = await readDeviceCmykImage(limited.bytes);
    expect(raw).toBeDefined();
    const maxSum = Math.round((280 / 100) * 255) + 1; // 715, w/ rounding tolerance
    let pixels = 0;
    for (let i = 0; i + 3 < raw!.length; i += 4) {
      expect(raw![i] + raw![i + 1] + raw![i + 2] + raw![i + 3]).toBeLessThanOrEqual(maxSum);
      expect(raw![i + 3]).toBe(255); // K channel preserved (UCR)
      pixels += 1;
    }
    expect(pixels).toBe(64);
  });

  it('marks output approximate when using the non-ICC transform (still structurally valid)', async () => {
    const result = await buildPaperPdfx([makePage(1)], {
      standard: 'pdf-x-4',
      profile,
      transform: APPROXIMATE_CMYK_TRANSFORM,
      docId: '0123456789abcdef0123456789abcdef',
    });
    expect(result.approximateColor).toBe(true);
    const report = await validatePaperPdfx(result.bytes);
    expect(report.pass).toBe(true);
  });

  it('rejects an empty document', async () => {
    const transform = await fograTransform();
    await expect(buildPaperPdfx([], { standard: 'pdf-x-4', profile, transform })).rejects.toThrow();
  });
});
