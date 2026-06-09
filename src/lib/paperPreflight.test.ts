import { describe, expect, it } from 'vitest';
import type { SourceBinLibraryItem } from '../store/sourceBinStore';
import { addFrameToPaperPage, createDefaultPaperDocument, updatePaperDocumentSetup } from './paperDocument';
import { PAPER_PREFLIGHT_PROFILES, analyzePaperPreflight, collectPaperLinkedAssets, summarizePaperPreflightStatus, summarizePreflightForExport } from './paperPreflight';

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

  it('warns honestly when PDF/X and CMYK production targets exceed the browser export path', () => {
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
    expect(report.issues).toContainEqual(expect.objectContaining({
      severity: 'warning',
      title: 'Browser PDF export is not PDF/X-certified',
      category: 'production',
    }));
    expect(report.issues).toContainEqual(expect.objectContaining({
      severity: 'warning',
      title: 'RGB colors need CMYK proofing',
      category: 'color',
    }));
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
