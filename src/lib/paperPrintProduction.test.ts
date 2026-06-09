import { describe, expect, it } from 'vitest';
import { createDefaultPaperDocument, updatePaperDocumentSetup } from './paperDocument';
import {
  PAPER_OUTPUT_INTENT_PROFILES,
  buildPaperPrintProductionMetadata,
  normalizePaperPrintProductionSpec,
} from './paperPrintProduction';

describe('paperPrintProduction', () => {
  it('normalizes browser proof defaults to an sRGB production intent', () => {
    const normalized = normalizePaperPrintProductionSpec();

    expect(normalized).toEqual({
      pdfStandard: 'browser-pdf',
      outputIntentProfileId: 'srgb',
      customOutputIntentName: '',
      totalInkLimitPercent: 300,
      blackPolicy: 'warn-rich-black',
      spotColorPolicy: 'warn',
      overprintPreview: false,
    });
    expect(PAPER_OUTPUT_INTENT_PROFILES.srgb.colorSpace).toBe('rgb');
  });

  it('builds press metadata for PDF/X CMYK targets without claiming browser export certification', () => {
    const doc = updatePaperDocumentSetup(createDefaultPaperDocument({ title: 'Press Book' }), {
      printProduction: {
        pdfStandard: 'pdf-x-4',
        outputIntentProfileId: 'pso-coated-v3-fogra51',
        totalInkLimitPercent: 280,
        blackPolicy: 'force-100k-text',
        spotColorPolicy: 'convert-process',
        overprintPreview: true,
      },
    });

    const metadata = buildPaperPrintProductionMetadata(doc);

    expect(metadata).toEqual(expect.objectContaining({
      pdfStandard: 'pdf-x-4',
      outputIntentProfileId: 'pso-coated-v3-fogra51',
      outputIntentColorSpace: 'cmyk',
      outputIntentLabel: 'PSO Coated v3 / FOGRA51',
      totalInkLimitPercent: 280,
      blackPolicy: 'force-100k-text',
      spotColorPolicy: 'convert-process',
      overprintPreview: true,
      browserPdfIsPressCertified: false,
    }));
    expect(metadata.limitations).toEqual(expect.arrayContaining([
      'Browser PDF export records the production intent but does not embed ICC output profiles or validate PDF/X conformance.',
    ]));
  });
});
