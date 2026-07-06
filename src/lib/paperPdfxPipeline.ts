// Orchestration for real PDF/X export from a PaperDocument (docs/notes/836). Ties the page rasterizer,
// the ICC output profile, and the conformant PDF/X writer (`buildPaperPdfx`) together. Kept pure with
// injected dependencies (rasterizer, ICC loader, transform factory) so it is unit-testable in Node and
// reused by the browser adapter (`paperPdfxBrowser.ts`) unchanged.

import { buildPaperPdfx, type PdfxExportResult, type PdfxRasterPage, type PdfxStandard } from './paperPdfxExport';
import type { IccCmykTransform } from './paperColorManagement';
import type { PaperDocument } from '../types/paper';
import type { PaperOutputIntentProfileId } from '../types/paper';
import {
  DEFAULT_CMYK_PROFILE_ID,
  findBundledProfile,
  type IccProfileRef,
} from './paperIccProfiles';

const PT_PER_MM = 72 / 25.4;

export interface PaperPdfxPageRaster {
  rgba: Uint8Array | Uint8ClampedArray;
  widthPx: number;
  heightPx: number;
}

export interface PaperPdfxPipelineOptions {
  standard: PdfxStandard;
  /** Bundled ICC profile id (see `paperIccProfiles`). Defaults to FOGRA39. */
  iccProfileId?: string;
  /** Export resolution; defaults to 300 DPI (print minimum). */
  outputDpi?: number;
  title?: string;
  createdAt?: Date;
}

export interface PaperPdfxPipelineDeps {
  /** Rasterize one page INCLUDING bleed to RGBA at the given DPI. */
  rasterizePage: (pageId: string, outputDpi: number) => Promise<PaperPdfxPageRaster>;
  /** Load the raw ICC bytes for the chosen profile. */
  loadIccBytes: (profile: IccProfileRef) => Promise<Uint8Array>;
  /** Build an sRGB→CMYK transform from ICC bytes (real lcms2 backend in the app). */
  createTransform: (bytes: Uint8Array) => Promise<IccCmykTransform>;
}

/**
 * Map the document's chosen output-intent profile to the closest **bundled** (redistributable) ICC
 * profile we can actually embed. The 5-option intent enum names conditions we don't ship exact ICCs for
 * (FOGRA51/52, GRACoL 2013); we embed the nearest bundled condition and report it, so the PDF truthfully
 * carries the profile it embeds. (A full bundled/system/custom picker is the tracked follow-up.)
 */
const INTENT_TO_BUNDLED: Record<PaperOutputIntentProfileId, string> = {
  'gracol-2013-coated': 'gracol-tr006',
  'swop-coated-v2': 'swop-tr003',
  'pso-coated-v3-fogra51': 'fogra39',
  'pso-uncoated-v3-fogra52': 'fogra47',
  srgb: DEFAULT_CMYK_PROFILE_ID,
  custom: DEFAULT_CMYK_PROFILE_ID,
};

/** Resolve a bundled ICC profile ref from either an explicit id or a document output-intent id. */
export function resolvePdfxProfile(iccProfileId?: string): IccProfileRef {
  const id = iccProfileId ?? DEFAULT_CMYK_PROFILE_ID;
  return findBundledProfile(id) ?? findBundledProfile(DEFAULT_CMYK_PROFILE_ID)!;
}

/** The bundled ICC profile that best matches a document's output-intent selection. */
export function bundledProfileForOutputIntent(intentId: PaperOutputIntentProfileId): IccProfileRef {
  return resolvePdfxProfile(INTENT_TO_BUNDLED[intentId] ?? DEFAULT_CMYK_PROFILE_ID);
}

/** True when the chosen output intent has no exact bundled ICC and a nearest match will be substituted. */
export function isSubstitutedOutputIntent(intentId: PaperOutputIntentProfileId): boolean {
  return intentId === 'pso-coated-v3-fogra51'
    || intentId === 'pso-uncoated-v3-fogra52'
    || intentId === 'srgb'
    || intentId === 'custom';
}

/** Build a real PDF/X (X-1a or X-4) from a PaperDocument via injected rasterizer + ICC loader. */
export async function exportPaperDocumentToPdfx(
  document: PaperDocument,
  options: PaperPdfxPipelineOptions,
  deps: PaperPdfxPipelineDeps,
): Promise<PdfxExportResult> {
  if (document.pages.length === 0) throw new Error('This document has no pages to export.');
  const profile = resolvePdfxProfile(options.iccProfileId);
  const iccBytes = await deps.loadIccBytes(profile);
  const transform = await deps.createTransform(iccBytes);
  const dpi = options.outputDpi && options.outputDpi > 0 ? options.outputDpi : 300;

  const bleedPt = document.page.bleedMm * PT_PER_MM;
  const trimWidthPt = document.page.widthMm * PT_PER_MM;
  const trimHeightPt = document.page.heightMm * PT_PER_MM;

  const pages: PdfxRasterPage[] = [];
  for (const page of document.pages) {
    const raster = await deps.rasterizePage(page.id, dpi);
    pages.push({
      pageNumber: page.pageNumber,
      rgba: raster.rgba,
      widthPx: raster.widthPx,
      heightPx: raster.heightPx,
      trimWidthPt,
      trimHeightPt,
      bleedPt,
    });
  }

  return buildPaperPdfx(pages, {
    standard: options.standard,
    profile: {
      iccBytes,
      outputConditionIdentifier: profile.displayName,
      outputCondition: profile.description,
      registryName: 'http://www.color.org',
    },
    transform,
    title: options.title ?? document.title,
    createdAt: options.createdAt,
  });
}
