import { describe, expect, it, vi } from 'vitest';
import type { BinaryAssetRef } from '../shared/assets/contentAddressedAsset';
import type { PaperManagedIccProfile } from '../types/paper';
import { addFrameToPaperPage, createDefaultPaperDocument, updatePaperDocumentSetup, updatePaperFrame } from './paperDocument';
import type { PdfxExportResult } from './paperPdfxExport';
import type { PdfxValidationReport } from './paperPdfxValidate';
import type { PaperRenderPlan } from './paperRenderPlan';
import { exportValidatedPaperPdfx, preflightPaperProduction } from './paperProductionPreflight';

const SHA = 'a'.repeat(64);

function assetRef(mimeType = 'application/vnd.iccprofile'): BinaryAssetRef {
  return { id: `sha256:${SHA}`, sha256: SHA, mimeType, byteLength: 8 };
}

function exactProfile(): PaperManagedIccProfile {
  const asset = assetRef();
  return {
    id: asset.id,
    asset,
    description: 'Exact FOGRA51 profile',
    deviceClass: 'prtr',
    colorSpace: 'CMYK',
    pcs: 'Lab ',
    outputConditionId: 'FOGRA51',
    source: { kind: 'user-import' },
  };
}

function productionDocument(standard: 'pdf-x-1a' | 'pdf-x-4' = 'pdf-x-4') {
  const profile = exactProfile();
  return updatePaperDocumentSetup(createDefaultPaperDocument({ title: 'Production gate' }), {
    printProduction: {
      pdfStandard: standard,
      outputIntentProfileId: 'pso-coated-v3-fogra51',
      outputIntentProfileAssetId: profile.id,
      spotColorPolicy: 'preserve-named',
      totalInkLimitPercent: 300,
    },
    managedIccProfiles: [profile],
  });
}

function generatedPdf(): PdfxExportResult {
  return {
    bytes: new Uint8Array([1, 2, 3]),
    standard: 'pdf-x-4',
    pageCount: 1,
    profileName: 'Exact FOGRA51 profile',
    approximateColor: false,
    nativeEvidence: {
      processObjectIds: [],
      spotPlates: [],
      embeddedFontIds: [],
      outlinedObjectIds: [],
      flattenedObjectIds: [],
      overprintObjectIds: [],
    },
  };
}

function validation(pass = true): PdfxValidationReport {
  return {
    standard: 'pdf-x-4',
    headerVersion: '1.6',
    pass,
    checks: [{ id: 'no-rgb', label: 'No RGB color', pass }],
  };
}

function planFor(document: { id: string; updatedAt: number }, nodes: PaperRenderPlan['pages'][number]['nodes']): PaperRenderPlan {
  return {
    documentId: document.id,
    revision: document.updatedAt,
    pages: [{
      pageId: 'page-1',
      pageNumber: 1,
      trimWidthPt: 100,
      trimHeightPt: 100,
      bleedPt: 0,
      nodes,
    }],
  };
}

describe('Paper production preflight', () => {
  it('does not download bytes when PDF/X validation fails', async () => {
    const document = productionDocument();
    const download = vi.fn();
    const generate = vi.fn(async () => generatedPdf());

    const result = await exportValidatedPaperPdfx(document, {
      standard: 'pdf-x-4',
      generate,
      validate: async () => validation(false),
      download,
    });

    expect(result.status).toBe('blocked');
    expect(generate).toHaveBeenCalledOnce();
    expect(download).not.toHaveBeenCalled();
  });

  it('freezes the document passed to the generator before generating bytes', async () => {
    const document = productionDocument();
    const generate = vi.fn(async (frozenDocument) => {
      expect(frozenDocument).not.toBe(document);
      expect(frozenDocument.printProduction).toEqual(document.printProduction);
      return generatedPdf();
    });

    const result = await exportValidatedPaperPdfx(document, {
      standard: 'pdf-x-4',
      generate,
      validate: async () => validation(),
      download: vi.fn(),
    });

    expect(result.status).toBe('saved');
  });

  it('blocks missing exact managed profile and asset records before generation', async () => {
    const missingProfile = createDefaultPaperDocument({ title: 'Missing profile' });
    const profileReport = await preflightPaperProduction(missingProfile, { standard: 'pdf-x-4' });
    expect(profileReport.issues).toContainEqual(expect.objectContaining({ code: 'MISSING_EXACT_PROFILE', severity: 'blocker' }));

    const assetReport = await preflightPaperProduction(productionDocument(), {
      standard: 'pdf-x-4',
      assetExists: async () => false,
    });
    expect(assetReport.issues).toContainEqual(expect.objectContaining({ code: 'MISSING_MANAGED_ASSET', severity: 'blocker' }));
  });

  it('blocks browser fallback faces, including rich text run faces', async () => {
    const base = productionDocument();
    const { document } = addFrameToPaperPage(base, base.pages[0].id, {
      kind: 'caption',
      xMm: 10,
      yMm: 10,
      widthMm: 60,
      heightMm: 20,
      text: 'Managed type only',
      richText: [{ runs: [{ text: 'Managed ', fontFamily: 'Unmanaged Display' }, { text: 'type', fontFamily: 'Another Missing Face' }] }],
    });

    const report = await preflightPaperProduction(document, { standard: 'pdf-x-4' });
    expect(report.issues.filter((issue) => issue.code === 'MISSING_MANAGED_FONT')).toHaveLength(2);
  });

  it('blocks a requested spot that the render plan would flatten instead of plate', async () => {
    const base = productionDocument();
    const { document: added, frameId } = addFrameToPaperPage(base, base.pages[0].id, {
      kind: 'shape',
      xMm: 10,
      yMm: 10,
      widthMm: 50,
      heightMm: 30,
    });
    const document = updatePaperFrame({
      ...added,
      swatches: [{
        id: 'spot-red',
        name: 'PANTONE 185 C',
        type: 'spot',
        model: 'cmyk',
        rgb: { r: 228, g: 0, b: 43 },
        cmyk: { c: 0, m: 100, y: 81, k: 4 },
        spotName: 'PANTONE 185 C',
      }],
    }, added.pages[0].id, frameId, { fillSwatchId: 'spot-red', fillColor: '#e4002b' });
    const report = await preflightPaperProduction(document, {
      standard: 'pdf-x-4',
      renderPlan: planFor(document, [{
        kind: 'flatten-group',
        objectId: frameId,
        sourceFrameIds: [frameId],
        reasonCodes: ['unsupported-fill-paint'],
        boundsPt: { x: 0, y: 0, width: 100, height: 100 },
        children: [],
      }]),
    });

    expect(report.issues).toContainEqual(expect.objectContaining({ code: 'UNPLATEABLE_REQUESTED_SPOT', severity: 'blocker' }));
  });

  it('blocks a render plan from a different frozen revision of the same document', async () => {
    const document = productionDocument();
    const stalePlan = {
      ...planFor(document, []),
      revision: document.updatedAt + 1,
    } as unknown as PaperRenderPlan;

    const report = await preflightPaperProduction(document, {
      standard: 'pdf-x-4',
      renderPlan: stalePlan,
    });

    expect(report.issues).toContainEqual(expect.objectContaining({ code: 'STALE_RENDER_PLAN', severity: 'blocker' }));
  });

  it('blocks authored TAC overages and insufficient image resolution', async () => {
    const document = productionDocument();
    const tacReport = await preflightPaperProduction(document, {
      standard: 'pdf-x-4',
      renderPlan: planFor(document, [{
        kind: 'path',
        objectId: 'rich-panel',
        path: 'M 0 0 L 1 0 L 1 1 Z',
        fill: { kind: 'process-cmyk', c: 1, m: 1, y: 1, k: 1, tint: 1 },
        opacity: 1,
        fillOpacity: 1,
        strokeOpacity: 0,
        strokeWidthPt: 0,
        strokeStyle: 'solid',
        overprint: false,
        boundsPt: { x: 0, y: 0, width: 1, height: 1 },
      }]),
    });
    expect(tacReport.issues).toContainEqual(expect.objectContaining({ code: 'TOTAL_INK_LIMIT_EXCEEDED', severity: 'blocker' }));

    const image = assetRef('image/png');
    const { document: withImage } = addFrameToPaperPage(document, document.pages[0].id, {
      kind: 'image',
      xMm: 10,
      yMm: 10,
      widthMm: 100,
      heightMm: 100,
      asset: {
        label: 'Low resolution art',
        kind: 'image',
        locator: { kind: 'managed', ref: image },
        pixelWidth: 100,
        pixelHeight: 100,
      },
    });
    const ppiReport = await preflightPaperProduction(withImage, { standard: 'pdf-x-4' });
    expect(ppiReport.issues).toContainEqual(expect.objectContaining({ code: 'INSUFFICIENT_PPI', severity: 'blocker' }));
  });

  it('blocks live transparency for PDF/X-1a before generation', async () => {
    const base = productionDocument('pdf-x-1a');
    const { document } = addFrameToPaperPage(base, base.pages[0].id, {
      kind: 'shape',
      xMm: 10,
      yMm: 10,
      widthMm: 20,
      heightMm: 20,
      opacity: 0.5,
    });

    const report = await preflightPaperProduction(document, { standard: 'pdf-x-1a' });
    expect(report.issues).toContainEqual(expect.objectContaining({ code: 'PDFX1A_TRANSPARENCY_UNSUPPORTED', severity: 'blocker' }));
  });
});
