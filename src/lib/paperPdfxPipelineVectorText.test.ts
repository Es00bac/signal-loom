import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDefaultPaperDocument, updatePaperDocumentSetup } from './paperDocument';
import type { PaperDocument, PaperFrame } from '../types/paper';
import { exportPaperDocumentToPdfx } from './paperPdfxPipeline';
import { createRgbToCmykTransform } from './paperIccEngine';
import { validatePaperPdfx } from './paperPdfxValidate';

const fogra39 = new Uint8Array(readFileSync('public/icc/FOGRA39L_coated.icc'));
const FRAME_TEXT = 'Vector text through the whole pipeline';

function textDoc(): PaperDocument {
  let doc = createDefaultPaperDocument({ title: 'Pipeline vec', preset: 'us-letter' });
  doc = updatePaperDocumentSetup(doc, { bleedMm: 3 });
  const template = doc.pages[0].frames[0];
  const frame = {
    ...(template ?? ({} as PaperFrame)),
    id: 'f0', kind: 'text', label: 'f0',
    xMm: 15, yMm: 20, widthMm: 120, heightMm: 60, rotationDeg: 0, locked: false,
    fit: 'contain', imageScale: 1, imageOffsetXPercent: 0, imageOffsetYPercent: 0, imageRotationDeg: 0,
    columns: 1, fillColor: 'transparent', fillOpacity: 1, strokeColor: 'transparent', strokeOpacity: 1,
    strokeWidthMm: 0, strokeStyle: 'solid', cornerRadiusMm: 0, opacity: 1,
    text: FRAME_TEXT,
    typography: { fontFamily: 'Georgia', fontSizePt: 14, leadingPt: 18, tracking: 0, hyphenate: false, align: 'left', color: '#000000', fontWeight: 'normal', fontStyle: 'normal' },
  } as PaperFrame;
  return { ...doc, pages: doc.pages.map((p, i) => (i === 0 ? { ...p, frames: [frame] } : p)) };
}

function poppler(tool: string, args: string[]): string | null {
  try {
    return execFileSync(tool, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
}

describe('exportPaperDocumentToPdfx with vectorText', () => {
  it('rasterizes backdrop-only and embeds the document text as real vector', async () => {
    const doc = textDoc();
    let backdropOnlyRequested = false;

    const result = await exportPaperDocumentToPdfx(
      doc,
      { standard: 'pdf-x-4', vectorText: true, outputDpi: 96, iccProfileId: 'fogra39' },
      {
        loadIccBytes: async () => fogra39,
        createTransform: (bytes) => createRgbToCmykTransform(bytes, { intent: 'relative' }),
        loadFontBytes: async (url) => new Uint8Array(readFileSync(`public${url}`)),
        rasterizePage: async (_pageId, _dpi, opts) => {
          if (opts?.backdropOnly) backdropOnlyRequested = true;
          // Backdrop-only white page (text excluded → drawn as vector on top).
          return { rgba: new Uint8Array(96 * 124 * 4).fill(255), widthPx: 96, heightPx: 124 };
        },
      },
    );

    // The pipeline asked for a backdrop-only raster (so text isn't double-drawn).
    expect(backdropOnlyRequested).toBe(true);

    const report = await validatePaperPdfx(result.bytes, { standard: 'pdf-x-4' });
    expect(report.pass, report.checks.filter((c) => !c.pass).map((c) => c.label).join('; ')).toBe(true);

    const asText = Buffer.from(result.bytes).toString('latin1');
    expect(asText).toContain('/FontFile2');
    expect(asText).toMatch(/LiberationSerif/);

    const dir = mkdtempSync(join(tmpdir(), 'sloom-pipe-'));
    const pdfPath = join(dir, 'pipe.pdf');
    writeFileSync(pdfPath, result.bytes);
    const extracted = poppler('pdftotext', [pdfPath, '-']);
    if (extracted !== null) {
      expect(extracted.replace(/\s+/g, ' ')).toContain(FRAME_TEXT);
    }
  });

  it('falls back to a full raster (no fonts) when vectorText is off', async () => {
    const doc = textDoc();
    const result = await exportPaperDocumentToPdfx(
      doc,
      { standard: 'pdf-x-4', outputDpi: 96 },
      {
        loadIccBytes: async () => fogra39,
        createTransform: (bytes) => createRgbToCmykTransform(bytes, { intent: 'relative' }),
        rasterizePage: async () => ({ rgba: new Uint8Array(96 * 124 * 4).fill(255), widthPx: 96, heightPx: 124 }),
      },
    );
    expect(Buffer.from(result.bytes).toString('latin1')).not.toContain('/FontFile2');
  });

  it('falls back to a full raster when a frame uses a feature the vector engine cannot reproduce', async () => {
    // vectorText is ON, but the frame uses letter-spacing (tracking) which the linear engine doesn't
    // reproduce → the whole page must be rasterized (never a wrong vector layout), yet still a valid PDF/X.
    const base = textDoc();
    const gatedFrame = { ...base.pages[0].frames[0], typography: { ...base.pages[0].frames[0].typography, tracking: 60 } } as PaperFrame;
    const doc: PaperDocument = { ...base, pages: base.pages.map((p, i) => (i === 0 ? { ...p, frames: [gatedFrame] } : p)) };

    let backdropOnlyRequested = false;
    const result = await exportPaperDocumentToPdfx(
      doc,
      { standard: 'pdf-x-4', vectorText: true, outputDpi: 96, iccProfileId: 'fogra39' },
      {
        loadIccBytes: async () => fogra39,
        createTransform: (bytes) => createRgbToCmykTransform(bytes, { intent: 'relative' }),
        loadFontBytes: async (url) => new Uint8Array(readFileSync(`public${url}`)),
        rasterizePage: async (_pageId, _dpi, opts) => {
          if (opts?.backdropOnly) backdropOnlyRequested = true;
          return { rgba: new Uint8Array(96 * 124 * 4).fill(255), widthPx: 96, heightPx: 124 };
        },
      },
    );

    // No backdrop-only request → the page was fully flattened (text baked into the raster, not vectorized).
    expect(backdropOnlyRequested).toBe(false);
    expect(Buffer.from(result.bytes).toString('latin1')).not.toContain('/FontFile2');
    // …and it's still a conformant PDF/X.
    const report = await validatePaperPdfx(result.bytes, { standard: 'pdf-x-4' });
    expect(report.pass, report.checks.filter((c) => !c.pass).map((c) => c.label).join('; ')).toBe(true);
  });
});
