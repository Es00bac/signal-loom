import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDefaultPaperDocument, updatePaperDocumentSetup } from './paperDocument';
import type { PaperDocument, PaperFrame } from '../types/paper';
import { createBinaryAssetRecord } from '../shared/assets/contentAddressedAsset';
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
  it('loads imported vector text from its managed record and keeps missing-glyph text in the raster', async () => {
    const fontBytes = new Uint8Array(readFileSync('public/fonts/liberation/LiberationSans-Regular.ttf'));
    const record = await createBinaryAssetRecord(fontBytes, { mimeType: 'font/ttf' });
    const base = textDoc();
    const importedFrame = {
      ...base.pages[0].frames[0],
      typography: { ...base.pages[0].frames[0].typography, fontFamily: 'Managed Test Face' },
    } as PaperFrame;
    const managedDoc: PaperDocument = {
      ...base,
      importedFonts: [{
        id: 'managed-test', familyName: 'Managed Test Face', bold: false, italic: false,
        format: 'truetype', embeddable: true, canSubset: true, assetRef: record.ref,
      }],
      pages: base.pages.map((page, index) => index === 0 ? { ...page, frames: [importedFrame] } : page),
    };
    let excludedTextFrameIds: string[] | undefined;
    const deps = {
      loadIccBytes: async () => fogra39,
      createTransform: (bytes: Uint8Array) => createRgbToCmykTransform(bytes, { intent: 'relative' }),
      loadManagedFontBytes: async (ref: typeof record.ref) => {
        expect(ref).toEqual(record.ref);
        return fontBytes;
      },
      rasterizePage: async (_pageId: string, _dpi: number, options?: { excludeTextFrameIds?: string[] }) => {
        excludedTextFrameIds = options?.excludeTextFrameIds;
        return { rgba: new Uint8Array(96 * 124 * 4).fill(255), widthPx: 96, heightPx: 124 };
      },
    };

    const result = await exportPaperDocumentToPdfx(
      managedDoc,
      { standard: 'pdf-x-4', vectorText: true, outputDpi: 96, iccProfileId: 'fogra39' },
      deps,
    );
    expect(excludedTextFrameIds).toEqual(['f0']);
    expect(Buffer.from(result.bytes).toString('latin1')).toContain('/FontFile2');

    const cjkFrame = { ...importedFrame, text: 'Managed 日本語' };
    excludedTextFrameIds = ['sentinel'];
    const cjkResult = await exportPaperDocumentToPdfx(
      { ...managedDoc, pages: managedDoc.pages.map((page, index) => index === 0 ? { ...page, frames: [cjkFrame] } : page) },
      { standard: 'pdf-x-4', vectorText: true, outputDpi: 96, iccProfileId: 'fogra39' },
      deps,
    );
    expect(excludedTextFrameIds).toBeUndefined();
    expect(Buffer.from(cjkResult.bytes).toString('latin1')).not.toContain('/FontFile2');
  });

  it('excludes the text frame from the raster and embeds the document text as real vector', async () => {
    const doc = textDoc();
    let excludedTextFrameIds: string[] | undefined;

    const result = await exportPaperDocumentToPdfx(
      doc,
      { standard: 'pdf-x-4', vectorText: true, outputDpi: 96, iccProfileId: 'fogra39' },
      {
        loadIccBytes: async () => fogra39,
        createTransform: (bytes) => createRgbToCmykTransform(bytes, { intent: 'relative' }),
        loadFontBytes: async (url) => new Uint8Array(readFileSync(`public${url}`)),
        rasterizePage: async (_pageId, _dpi, opts) => {
          excludedTextFrameIds = opts?.excludeTextFrameIds;
          // White page with the text frame excluded → text drawn as vector on top.
          return { rgba: new Uint8Array(96 * 124 * 4).fill(255), widthPx: 96, heightPx: 124 };
        },
      },
    );

    // The pipeline excluded exactly the vectorized frame from the raster (so text isn't double-drawn).
    expect(excludedTextFrameIds).toEqual(['f0']);

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

  it('falls back to a full raster when a frame uses a feature neither vector nor outline can reproduce', async () => {
    // vectorText is ON, but the frame uses ARC (on-a-curve) text — which neither the selectable-text path
    // nor the outline path reproduces yet → its text stays baked into the raster (never a wrong layout),
    // still valid PDF/X. (Tracking/stroke/rotation are no longer such features: they draw as vector curves.)
    const base = textDoc();
    const gatedFrame = { ...base.pages[0].frames[0], textArcPercent: 40 } as PaperFrame;
    const doc: PaperDocument = { ...base, pages: base.pages.map((p, i) => (i === 0 ? { ...p, frames: [gatedFrame] } : p)) };

    let excludedTextFrameIds: string[] | undefined = ['sentinel'];
    const result = await exportPaperDocumentToPdfx(
      doc,
      { standard: 'pdf-x-4', vectorText: true, outputDpi: 96, iccProfileId: 'fogra39' },
      {
        loadIccBytes: async () => fogra39,
        createTransform: (bytes) => createRgbToCmykTransform(bytes, { intent: 'relative' }),
        loadFontBytes: async (url) => new Uint8Array(readFileSync(`public${url}`)),
        rasterizePage: async (_pageId, _dpi, opts) => {
          excludedTextFrameIds = opts?.excludeTextFrameIds;
          return { rgba: new Uint8Array(96 * 124 * 4).fill(255), widthPx: 96, heightPx: 124 };
        },
      },
    );

    // Nothing excluded → the gated frame's text stayed baked into the full raster (not vectorized).
    expect(excludedTextFrameIds).toBeUndefined();
    expect(Buffer.from(result.bytes).toString('latin1')).not.toContain('/FontFile2');
    // …and it's still a conformant PDF/X.
    const report = await validatePaperPdfx(result.bytes, { standard: 'pdf-x-4' });
    expect(report.pass, report.checks.filter((c) => !c.pass).map((c) => c.label).join('; ')).toBe(true);
  });

  it('keeps a rich-text frame (per-run styling) out of the vector-text layer so it rasters with full formatting', async () => {
    // A bold mid-paragraph run is non-uniform richText — the single-style linear layout engine can't draw
    // it (it would flatten every run to the frame's one style and lose the bold run), so it must stay
    // raster, where the print/flatten render now draws every run correctly (docs/notes/850, task #56).
    const base = textDoc();
    const richFrame = {
      ...base.pages[0].frames[0],
      richText: [{ runs: [{ text: 'Plain ' }, { text: 'bold', fontWeight: '700' }] }],
    } as PaperFrame;
    const doc: PaperDocument = { ...base, pages: base.pages.map((p, i) => (i === 0 ? { ...p, frames: [richFrame] } : p)) };

    let excludedTextFrameIds: string[] | undefined = ['sentinel'];
    const result = await exportPaperDocumentToPdfx(
      doc,
      { standard: 'pdf-x-4', vectorText: true, outputDpi: 96, iccProfileId: 'fogra39' },
      {
        loadIccBytes: async () => fogra39,
        createTransform: (bytes) => createRgbToCmykTransform(bytes, { intent: 'relative' }),
        loadFontBytes: async (url) => new Uint8Array(readFileSync(`public${url}`)),
        rasterizePage: async (_pageId, _dpi, opts) => {
          excludedTextFrameIds = opts?.excludeTextFrameIds;
          return { rgba: new Uint8Array(96 * 124 * 4).fill(255), widthPx: 96, heightPx: 124 };
        },
      },
    );

    // Nothing excluded → the rich frame's text stayed baked into the full raster (not vectorized).
    expect(excludedTextFrameIds).toBeUndefined();
    expect(Buffer.from(result.bytes).toString('latin1')).not.toContain('/FontFile2');
    const report = await validatePaperPdfx(result.bytes, { standard: 'pdf-x-4' });
    expect(report.pass, report.checks.filter((c) => !c.pass).map((c) => c.label).join('; ')).toBe(true);
  });

  it('vectorizes body text but keeps a display-font SFX frame in the raster (same page)', async () => {
    // The real comic case: Inter dialogue + an Impact SFX on ONE page. The body must become selectable
    // vector; the SFX must stay raster (Liberation is not a faithful Impact substitute) — its real glyphs
    // are preserved instead of silently becoming plain sans.
    const base = textDoc();
    const bodyFrame = base.pages[0].frames[0]; // id 'f0', Georgia serif → vector-safe
    const sfxFrame = {
      ...bodyFrame,
      id: 'sfx', label: 'sfx', xMm: 15, yMm: 90, widthMm: 100, heightMm: 30,
      text: 'KA-BOOM',
      typography: { ...bodyFrame.typography, fontFamily: 'Impact, Haettenschweiler, sans-serif', fontWeight: '700' },
    } as PaperFrame;
    const doc: PaperDocument = { ...base, pages: base.pages.map((p, i) => (i === 0 ? { ...p, frames: [bodyFrame, sfxFrame] } : p)) };

    let excludedTextFrameIds: string[] | undefined;
    const result = await exportPaperDocumentToPdfx(
      doc,
      { standard: 'pdf-x-4', vectorText: true, outputDpi: 96, iccProfileId: 'fogra39' },
      {
        loadIccBytes: async () => fogra39,
        createTransform: (bytes) => createRgbToCmykTransform(bytes, { intent: 'relative' }),
        loadFontBytes: async (url) => new Uint8Array(readFileSync(`public${url}`)),
        rasterizePage: async (_pageId, _dpi, opts) => {
          excludedTextFrameIds = opts?.excludeTextFrameIds;
          return { rgba: new Uint8Array(96 * 124 * 4).fill(255), widthPx: 96, heightPx: 124 };
        },
      },
    );

    // Only the body frame is excluded from the raster (vectorized); the Impact SFX stays baked in.
    expect(excludedTextFrameIds).toEqual(['f0']);
    const asText = Buffer.from(result.bytes).toString('latin1');
    expect(asText).toContain('/FontFile2'); // the body text is real embedded vector
    const report = await validatePaperPdfx(result.bytes, { standard: 'pdf-x-4' });
    expect(report.pass, report.checks.filter((c) => !c.pass).map((c) => c.label).join('; ')).toBe(true);
  });
});
