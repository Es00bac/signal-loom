import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SourceBinLibraryItem } from '../store/sourceBinStore';
import { addFrameToPaperPage, createDefaultPaperDocument, updatePaperDocumentSetup, updatePaperFrame } from './paperDocument';
import { PAPER_PREFLIGHT_PROFILES, analyzePaperPreflight, collectPaperLinkedAssets, summarizePaperPreflightStatus, summarizePreflightForExport } from './paperPreflight';
import { buildImportedFont } from './paperFontLibrary';
import { vetFontBytes } from './paperFontVetting';

const LIBERATION_SERIF = resolve(process.cwd(), 'public/fonts/liberation/LiberationSerif-Regular.ttf');
/** A real imported-font record (Liberation Serif — a full Latin face with no CJK glyphs) for coverage tests. */
function importedLiberationSerif() {
  const bytes = new Uint8Array(readFileSync(LIBERATION_SERIF));
  const font = buildImportedFont(vetFontBytes(bytes), bytes, 'lib-serif');
  if (!font) throw new Error('fixture font failed to vet');
  return font;
}

function sourceItem(id = 'image-1'): SourceBinLibraryItem {
  return {
    id,
    label: 'Panel Art',
    kind: 'image',
    assetUrl: 'data:image/png;base64,abc',
    createdAt: 1,
  };
}

describe('paperPreflight', () => {
  it('flags missing image links, empty text, bleed, margin, and comic page-count risks', () => {
    const base = updatePaperDocumentSetup(createDefaultPaperDocument({ title: 'Preflight', preset: 'comic-book' }), {
      bleedMm: 0,
      marginsMm: { top: 3 },
    });
    const pageId = base.pages[0].id;
    const { document: withImage } = addFrameToPaperPage(base, pageId, {
      kind: 'image',
      xMm: 10,
      yMm: 10,
      widthMm: 70,
      heightMm: 50,
      asset: { sourceBinItemId: 'missing-image', label: 'Missing Panel', kind: 'image' },
    });
    const { document } = addFrameToPaperPage(withImage, pageId, {
      kind: 'caption',
      xMm: 10,
      yMm: 70,
      widthMm: 60,
      heightMm: 20,
      text: '',
    });

    const report = analyzePaperPreflight(document, [sourceItem()]);

    expect(report.counts.error).toBe(1);
    expect(report.counts.warning).toBeGreaterThanOrEqual(3);
    expect(report.counts.info).toBeGreaterThanOrEqual(1);
    expect(report.issues.map((issue) => issue.title)).toEqual(expect.arrayContaining([
      'Missing linked asset',
      'Empty text frame',
      'No bleed configured',
      'Margins may be unsafe',
      'Comic page count is not printer-friendly',
    ]));
  });

  it('warns about unknown image resolution even when the linked source exists', () => {
    const base = createDefaultPaperDocument({ title: 'Resolution' });
    const item = sourceItem('image-ok');
    const { document } = addFrameToPaperPage(base, base.pages[0].id, {
      kind: 'image',
      xMm: 10,
      yMm: 10,
      widthMm: 70,
      heightMm: 50,
      asset: { sourceBinItemId: item.id, label: item.label, kind: item.kind, src: item.assetUrl },
    });

    const report = analyzePaperPreflight(document, [item]);

    expect(report.counts.error).toBe(0);
    expect(report.issues).toContainEqual(expect.objectContaining({
      severity: 'info',
      title: 'Image resolution unknown',
    }));
  });

  it('uses Paper frame pixel metadata for effective PPI checks', () => {
    const base = createDefaultPaperDocument({ title: 'Frame PPI' });
    const item = sourceItem('image-ok');
    const { document } = addFrameToPaperPage(base, base.pages[0].id, {
      kind: 'image',
      xMm: 10,
      yMm: 10,
      widthMm: 100,
      heightMm: 80,
      asset: { sourceBinItemId: item.id, label: item.label, kind: item.kind, src: item.assetUrl, pixelWidth: 1200, pixelHeight: 900 },
    });

    const report = analyzePaperPreflight(document, [item]);
    const assets = collectPaperLinkedAssets(document, [item]);

    expect(assets[0]).toEqual(expect.objectContaining({ status: 'ok', effectivePpi: 286, pixelWidth: 1200, pixelHeight: 900 }));
    expect(report.issues.some((issue) => issue.title === 'Image resolution unknown')).toBe(false);
  });

  it('uses Source Bin pixel metadata when frame metadata is absent', () => {
    const base = createDefaultPaperDocument({ title: 'Source PPI' });
    const item = { ...sourceItem('image-ok'), pixelWidth: 400, pixelHeight: 300 } as SourceBinLibraryItem & { pixelWidth: number; pixelHeight: number };
    const { document } = addFrameToPaperPage(base, base.pages[0].id, {
      kind: 'image',
      xMm: 10,
      yMm: 10,
      widthMm: 100,
      heightMm: 80,
      asset: { sourceBinItemId: item.id, label: item.label, kind: item.kind, src: item.assetUrl },
    });

    const report = analyzePaperPreflight(document, [item]);
    const assets = collectPaperLinkedAssets(document, [item]);

    expect(assets[0].effectivePpi).toBe(95);
    expect(report.issues).toContainEqual(expect.objectContaining({
      severity: 'warning',
      title: 'Image resolution is low',
    }));
  });

  it('summarizes export-gate warnings and errors but ignores info-only reports', () => {
    const base = updatePaperDocumentSetup(createDefaultPaperDocument({ title: 'Export Gate' }), { bleedMm: 0 });
    const warningReport = analyzePaperPreflight(base, []);
    const infoOnlyReport = {
      issues: [{ id: 'i', severity: 'info' as const, title: 'FYI', detail: 'Only info.' }],
      counts: { error: 0, warning: 0, info: 1 },
    };

    expect(summarizePreflightForExport(warningReport)).toContain('warning');
    expect(summarizePreflightForExport(infoOnlyReport)).toBeUndefined();
  });

  it('summarizes persistent status for the Paper workspace topbar', () => {
    const base = updatePaperDocumentSetup(createDefaultPaperDocument({ title: 'Topbar Preflight', preset: 'comic-book' }), {
      bleedMm: 0,
    });
    const { document } = addFrameToPaperPage(base, base.pages[0].id, {
      kind: 'image',
      xMm: 10,
      yMm: 10,
      widthMm: 70,
      heightMm: 50,
      asset: { sourceBinItemId: 'missing-image', label: 'Missing Panel', kind: 'image' },
    });

    expect(summarizePaperPreflightStatus(analyzePaperPreflight(document, []))).toEqual(expect.objectContaining({
      tone: 'error',
      label: '1 error',
      detail: expect.stringContaining('Missing linked asset'),
      countsLabel: expect.stringContaining('warning'),
    }));
    expect(summarizePaperPreflightStatus({
      issues: [],
      counts: { error: 0, warning: 0, info: 0 },
    })).toEqual({
      tone: 'ready',
      label: 'Ready',
      detail: 'No Paper preflight issues detected.',
      countsLabel: '0 issues',
    });
  });

  it('returns profile, grouped issues, font inventory, and RGB print color warnings', () => {
    const base = createDefaultPaperDocument({ title: 'Profiled', preset: 'comic-book' });
    const { document } = addFrameToPaperPage(base, base.pages[0].id, {
      kind: 'caption',
      xMm: 10,
      yMm: 10,
      widthMm: 50,
      heightMm: 20,
      text: 'Caption',
      fillColor: '#ff0000',
      typography: { fontFamily: 'Inter', color: '#111111' },
    });

    const report = analyzePaperPreflight(document, [], 'comic-print');

    expect(Object.keys(PAPER_PREFLIGHT_PROFILES)).toEqual(expect.arrayContaining(['generic-pdf', 'comic-print', 'manga-print', 'webtoon']));
    expect(report.profile.id).toBe('comic-print');
    expect(report.groups.map((group) => group.category)).toEqual(expect.arrayContaining(['color']));
    expect(report.fontInventory).toContainEqual(expect.objectContaining({ family: 'Inter' }));
    expect(report.colorInventory).toContainEqual(expect.objectContaining({ value: '#ff0000', rgbLike: true }));
    expect(report.issues).toContainEqual(expect.objectContaining({ title: 'RGB color used for print', category: 'color' }));
  });

  it('accurately describes the real PDF/X export and still flags RGB colors for CMYK proofing', () => {
    const base = updatePaperDocumentSetup(createDefaultPaperDocument({ title: 'Press Target', preset: 'comic-book' }), {
      printProduction: {
        pdfStandard: 'pdf-x-4',
        outputIntentProfileId: 'pso-coated-v3-fogra51',
        totalInkLimitPercent: 280,
        blackPolicy: 'force-100k-text',
        spotColorPolicy: 'convert-process',
        overprintPreview: true,
      },
    });
    const { document } = addFrameToPaperPage(base, base.pages[0].id, {
      kind: 'caption',
      xMm: 10,
      yMm: 10,
      widthMm: 50,
      heightMm: 20,
      text: 'Caption',
      fillColor: '#ff0000',
      typography: { color: '#111111' },
    });

    const report = analyzePaperPreflight(document, [], 'comic-print');

    expect(report.groups.map((group) => group.category)).toEqual(expect.arrayContaining(['production', 'color']));
    // The export is real now — no false "not certified" claim; an accurate info note instead.
    expect(report.issues.some((i) => i.title === 'Browser PDF export is not PDF/X-certified')).toBe(false);
    expect(report.issues).toContainEqual(expect.objectContaining({
      severity: 'info',
      title: 'PDF/X export embeds a real ICC output intent',
      category: 'production',
    }));
    expect(report.issues).toContainEqual(expect.objectContaining({
      severity: 'warning',
      title: 'RGB colors need CMYK proofing',
      category: 'color',
    }));
  });

  it('discloses Liberation font substitution for PDF/X but not for browser PDF', () => {
    const base = updatePaperDocumentSetup(createDefaultPaperDocument({ title: 'Font subst', preset: 'comic-book' }), {
      printProduction: { pdfStandard: 'pdf-x-4', outputIntentProfileId: 'pso-coated-v3-fogra51' },
    });
    const { document } = addFrameToPaperPage(base, base.pages[0].id, {
      kind: 'caption', xMm: 10, yMm: 10, widthMm: 50, heightMm: 20, text: 'Hello',
      typography: { fontFamily: 'Georgia', color: '#111111' },
    });

    const pdfxReport = analyzePaperPreflight(document, []);
    const subst = pdfxReport.issues.find((i) => i.title === 'Fonts embedded as Liberation substitutes');
    expect(subst).toBeDefined();
    expect(subst?.severity).toBe('info');
    expect(subst?.category).toBe('fonts');
    expect(subst?.detail).toContain('Georgia → Liberation Serif');

    // The plain browser-PDF target embeds nothing special, so no substitution disclosure.
    const browserDoc = updatePaperDocumentSetup(document, { printProduction: { pdfStandard: 'browser-pdf' } });
    const browserReport = analyzePaperPreflight(browserDoc, []);
    expect(browserReport.issues.some((i) => i.title === 'Fonts embedded as Liberation substitutes')).toBe(false);
  });

  it('discloses an imported font as embedded-real, not a Liberation substitute', () => {
    const base = updatePaperDocumentSetup(createDefaultPaperDocument({ title: 'Imported', preset: 'comic-book' }), {
      printProduction: { pdfStandard: 'pdf-x-4', outputIntentProfileId: 'pso-coated-v3-fogra51' },
    });
    const { document } = addFrameToPaperPage(base, base.pages[0].id, {
      kind: 'caption', xMm: 10, yMm: 10, widthMm: 50, heightMm: 20, text: 'Hello',
      typography: { fontFamily: 'Georgia', color: '#111111' },
    });
    const withFont: typeof document = {
      ...document,
      importedFonts: [{ id: 'geo', familyName: 'Georgia', bold: false, italic: false, format: 'truetype', embeddable: true, canSubset: true, dataBase64: 'AAAA' }],
    };

    const report = analyzePaperPreflight(withFont, []);
    const real = report.issues.find((i) => i.title === 'Fonts embedded as your imported font');
    expect(real).toBeDefined();
    expect(real?.severity).toBe('info');
    expect(real?.detail).toContain('Georgia');
    // …and it must NOT also be reported as a Liberation substitute.
    expect(report.issues.some((i) => i.title === 'Fonts embedded as Liberation substitutes')).toBe(false);
  });

  it('warns when an imported font is missing glyphs used in the text (they fall back to raster)', () => {
    const font = importedLiberationSerif();
    const base = updatePaperDocumentSetup(createDefaultPaperDocument({ title: 'Missing glyph', preset: 'comic-book' }), {
      printProduction: { pdfStandard: 'pdf-x-4', outputIntentProfileId: 'pso-coated-v3-fogra51' },
    });
    // Text mixes covered Latin with a CJK character Liberation Serif has no glyph for.
    const { document } = addFrameToPaperPage(base, base.pages[0].id, {
      kind: 'caption', xMm: 10, yMm: 10, widthMm: 60, heightMm: 20, text: 'Neko 猫 chan',
      typography: { fontFamily: font.familyName, color: '#111111' },
    });
    const withFont: typeof document = { ...document, importedFonts: [font] };

    const report = analyzePaperPreflight(withFont, []);
    const missing = report.issues.find((i) => i.title === 'Imported font is missing some glyphs');
    expect(missing).toBeDefined();
    expect(missing?.severity).toBe('warning');
    expect(missing?.detail).toContain(font.familyName);
    expect(missing?.detail).toContain('猫');
  });

  it('does not warn about missing glyphs when the imported font covers all of its text', () => {
    const font = importedLiberationSerif();
    const base = updatePaperDocumentSetup(createDefaultPaperDocument({ title: 'Full coverage', preset: 'comic-book' }), {
      printProduction: { pdfStandard: 'pdf-x-4', outputIntentProfileId: 'pso-coated-v3-fogra51' },
    });
    const { document } = addFrameToPaperPage(base, base.pages[0].id, {
      kind: 'caption', xMm: 10, yMm: 10, widthMm: 60, heightMm: 20, text: 'Fully covered Latin text — café.',
      typography: { fontFamily: font.familyName, color: '#111111' },
    });
    const withFont: typeof document = { ...document, importedFonts: [font] };

    const report = analyzePaperPreflight(withFont, []);
    expect(report.issues.some((i) => i.title === 'Imported font is missing some glyphs')).toBe(false);
  });

  it('discloses display fonts as rasterized (not substituted) for PDF/X', () => {
    const base = updatePaperDocumentSetup(createDefaultPaperDocument({ title: 'SFX subst', preset: 'comic-book' }), {
      printProduction: { pdfStandard: 'pdf-x-4', outputIntentProfileId: 'pso-coated-v3-fogra51' },
    });
    const { document: withBody } = addFrameToPaperPage(base, base.pages[0].id, {
      kind: 'caption', xMm: 10, yMm: 10, widthMm: 60, heightMm: 20, text: 'Narration',
      typography: { fontFamily: 'Georgia', color: '#111111' },
    });
    const { document } = addFrameToPaperPage(withBody, withBody.pages[0].id, {
      kind: 'caption', xMm: 10, yMm: 60, widthMm: 60, heightMm: 20, text: 'KA-BOOM',
      typography: { fontFamily: 'Impact, Haettenschweiler, sans-serif', color: '#111111' },
    });

    const report = analyzePaperPreflight(document, []);
    // Impact is disclosed as rasterized, and NOT listed among the Liberation substitutions.
    const raster = report.issues.find((i) => i.title === 'Display fonts kept as raster');
    expect(raster?.severity).toBe('info');
    expect(raster?.detail).toContain('Impact');
    const subst = report.issues.find((i) => i.title === 'Fonts embedded as Liberation substitutes');
    expect(subst?.detail).toContain('Georgia → Liberation Serif');
    expect(subst?.detail ?? '').not.toContain('Impact');
  });

  it('discloses spot colors per policy — real /Separation plates when preservable, else honest conversion', () => {
    const spotSwatch = {
      id: 'spot-1', name: 'PANTONE 485 C', type: 'spot' as const, model: 'cmyk' as const,
      rgb: { r: 218, g: 41, b: 28 }, cmyk: { c: 0, m: 95, y: 100, k: 0 }, spotName: 'PANTONE 485 C',
    };
    const build = (policy: 'preserve-named' | 'convert-process' | 'warn', opts: { useSpot: boolean; plain?: boolean }) => {
      let doc = updatePaperDocumentSetup(createDefaultPaperDocument({ title: 'Spot', preset: 'comic-book' }), {
        printProduction: { pdfStandard: 'pdf-x-4', outputIntentProfileId: 'pso-coated-v3-fogra51', spotColorPolicy: policy },
      });
      doc = { ...doc, swatches: [spotSwatch] };
      const added = addFrameToPaperPage(doc, doc.pages[0].id, {
        kind: 'caption', xMm: 10, yMm: 10, widthMm: 50, heightMm: 20, text: 'Ink',
        strokeWidthMm: opts.plain ? 0 : 0.5, strokeColor: opts.plain ? 'transparent' : '#000000', strokeOpacity: 1, cornerRadiusMm: 0,
      });
      let document = added.document;
      // The durable spot link is fillSwatchId (a fill applied from a spot swatch), not the RGB fillColor.
      if (opts.useSpot) document = updatePaperFrame(document, doc.pages[0].id, added.frameId, { fillColor: '#da291c', fillSwatchId: 'spot-1' });
      return analyzePaperPreflight(document, []).issues.map((i) => i.title);
    };

    // preserve-named + a plain solid spot rectangle → kept as a real /Separation plate.
    expect(build('preserve-named', { useSpot: true, plain: true })).toContain('Spot colors kept as separation plates');
    // preserve-named + spot on a stroked frame (not a faithful rectangle) → converts, disclosed.
    expect(build('preserve-named', { useSpot: true, plain: false })).toContain('Spot colors will convert to process');
    // 'warn' policy → warns that spot converts (with the "preserve named" hint).
    expect(build('warn', { useSpot: true, plain: true })).toContain('Named spot colors will convert to process');
    // 'convert-process' → the user opted into conversion, so no spot noise at all.
    const cp = build('convert-process', { useSpot: true, plain: true });
    expect(cp).not.toContain('Named spot colors will convert to process');
    expect(cp).not.toContain('Spot colors kept as separation plates');
    // Spot swatch defined but unused → no spot issue.
    const unused = build('preserve-named', { useSpot: false, plain: true });
    expect(unused).not.toContain('Spot colors kept as separation plates');
    expect(unused).not.toContain('Spot colors will convert to process');

    // preserve-named + text coloured from a spot swatch (no plateable fill) → the outlined glyphs plate.
    {
      let doc = updatePaperDocumentSetup(createDefaultPaperDocument({ title: 'SpotText', preset: 'comic-book' }), {
        printProduction: { pdfStandard: 'pdf-x-4', outputIntentProfileId: 'pso-coated-v3-fogra51', spotColorPolicy: 'preserve-named' },
      });
      doc = { ...doc, swatches: [spotSwatch] };
      const added = addFrameToPaperPage(doc, doc.pages[0].id, {
        kind: 'caption', xMm: 10, yMm: 10, widthMm: 50, heightMm: 20, text: 'SPOT LOGO',
      });
      const addedTypo = added.document.pages[0].frames.find((f) => f.id === added.frameId)!.typography;
      const withSpotText = updatePaperFrame(added.document, doc.pages[0].id, added.frameId, {
        typography: { ...addedTypo, color: '#da291c', colorSwatchId: 'spot-1' },
      });
      const spotTextIssue = analyzePaperPreflight(withSpotText, []).issues.find((i) => i.title === 'Spot colors kept as separation plates');
      expect(spotTextIssue).toBeDefined();
      expect(spotTextIssue?.detail).toContain('PANTONE 485 C');
      expect(spotTextIssue?.detail).toContain('spot-coloured text');
    }

    // preserve-named + a solid border coloured from a spot swatch → the border plates on the named plate.
    {
      let doc = updatePaperDocumentSetup(createDefaultPaperDocument({ title: 'SpotBorder', preset: 'comic-book' }), {
        printProduction: { pdfStandard: 'pdf-x-4', outputIntentProfileId: 'pso-coated-v3-fogra51', spotColorPolicy: 'preserve-named' },
      });
      doc = { ...doc, swatches: [spotSwatch] };
      const added = addFrameToPaperPage(doc, doc.pages[0].id, {
        kind: 'shape', xMm: 10, yMm: 10, widthMm: 50, heightMm: 30, strokeWidthMm: 2, strokeColor: '#da291c', strokeOpacity: 1, strokeStyle: 'solid',
      });
      const withSpotBorder = updatePaperFrame(added.document, doc.pages[0].id, added.frameId, { strokeColor: '#da291c', strokeSwatchId: 'spot-1' });
      const spotBorderIssue = analyzePaperPreflight(withSpotBorder, []).issues.find((i) => i.title === 'Spot colors kept as separation plates');
      expect(spotBorderIssue).toBeDefined();
      expect(spotBorderIssue?.detail).toContain('PANTONE 485 C');
      expect(spotBorderIssue?.detail).toContain('spot solid borders');
    }
  });

  it('flags invalid PDF/X output intent combinations before export', () => {
    const document = updatePaperDocumentSetup(createDefaultPaperDocument({ title: 'Bad PDFX Target' }), {
      printProduction: {
        pdfStandard: 'pdf-x-4',
        outputIntentProfileId: 'srgb',
      },
    });

    const report = analyzePaperPreflight(document, [], 'comic-print');

    expect(report.issues).toContainEqual(expect.objectContaining({
      severity: 'error',
      title: 'PDF/X target needs a press output intent',
      category: 'production',
    }));
  });
});
