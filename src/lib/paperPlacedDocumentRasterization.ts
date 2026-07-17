// Deliberate capability boundary for Paper's browser raster paths.  Paper can place a PDF for
// live/print HTML, but this build does not contain a bounded PDF-page renderer (pdf-lib writes
// PDFs; it does not render pages).  Never hand a placed document to HTMLImageElement and hope it
// decodes: every raster target must stop before it starts a page transaction.

import type { PaperDocument, PaperFrame } from '../types/paper';
import { resolvePaperPageFramesForOutput } from './paperDocument';
import {
  classifyPaperPlacedPdf,
  type PaperPlacedDocumentClassificationOptions,
  type PaperPlacedPdfClassification,
} from './paperPlacedPdf';

export interface PaperPlacedDocumentRasterizationIssue {
  code: 'paper-placed-document-rasterization-unsupported';
  pageId: string;
  pageNumber: number;
  frameId: string;
  frameLabel: string;
  mimeType?: string;
  /** A conservatively detected PDF is useful context; the current capability boundary blocks PDFs. */
  isPdf: boolean;
  message: string;
}

/** Typed, actionable failure shared by PNG/CBZ/KDP/PDF/X and soft-proof raster routes. */
export class PaperPlacedDocumentRasterizationError extends Error {
  readonly code = 'paper-placed-document-rasterization-unsupported' as const;
  readonly issues: readonly PaperPlacedDocumentRasterizationIssue[];

  constructor(issues: readonly PaperPlacedDocumentRasterizationIssue[]) {
    super(formatPlacedDocumentRasterizationIssues(issues));
    this.name = 'PaperPlacedDocumentRasterizationError';
    this.issues = issues;
  }
}

/**
 * Returns every placement that must not be passed through the image-only flatten adapter. Classification
 * is metadata-only and bounded, so this inspection never materializes document bytes.
 */
export function collectPaperPlacedDocumentRasterizationIssues(
  document: PaperDocument,
  pageIds: readonly string[] = document.pages.map((page) => page.id),
  options: PaperPlacedDocumentClassificationOptions = {},
): PaperPlacedDocumentRasterizationIssue[] {
  const requested = validatePaperRasterPageIds(document, pageIds);
  const issues: PaperPlacedDocumentRasterizationIssue[] = [];

  for (const page of document.pages) {
    if (!requested.has(page.id)) continue;
    for (const frame of resolvePaperPageFramesForOutput(document, page)) {
      const classification = classifyPaperPlacedPdf(frame, options);
      if (!classification.blocksRasterization) continue;
      issues.push(createIssue(page.id, page.pageNumber, frame, classification));
    }
  }
  return issues;
}

/** Throws before materialization, fetch, decode, canvas allocation, or a partial multi-page output. */
export function assertPaperDocumentSupportsRasterization(
  document: PaperDocument,
  pageIds?: readonly string[],
  options: PaperPlacedDocumentClassificationOptions = {},
): void {
  // Raster output is transactional. A supplied id proves that the requested page exists, but never
  // narrows the capability pass: a PDF on a later page must block before page one has side effects.
  if (pageIds) validatePaperRasterPageIds(document, pageIds);
  const issues = collectPaperPlacedDocumentRasterizationIssues(document, undefined, options);
  if (issues.length > 0) throw new PaperPlacedDocumentRasterizationError(issues);
}

export function isPaperPlacedDocumentRasterizationError(value: unknown): value is PaperPlacedDocumentRasterizationError {
  return value instanceof PaperPlacedDocumentRasterizationError
    || (Boolean(value) && typeof value === 'object'
      && (value as { code?: unknown }).code === 'paper-placed-document-rasterization-unsupported');
}

function createIssue(
  pageId: string,
  pageNumber: number,
  frame: PaperFrame,
  classification: PaperPlacedPdfClassification,
): PaperPlacedDocumentRasterizationIssue {
  const livePrintRemediation = classification.canEmbedForLivePrint
    ? 'Print HTML/live print will emit this URL-backed PDF as a real <object>; use that route or replace it with a raster image before raster export.'
    : 'Restore or relink this PDF to a URL-backed asset before live print, or replace it with a raster image before raster export.';
  return {
    code: 'paper-placed-document-rasterization-unsupported',
    pageId,
    pageNumber,
    frameId: frame.id,
    frameLabel: frame.asset?.label || frame.label,
    mimeType: classification.mimeType,
    isPdf: true,
    message: `Page ${pageNumber}, frame "${frame.asset?.label || frame.label}" places a PDF that this browser build cannot rasterize. ${livePrintRemediation}`,
  };
}

function validatePaperRasterPageIds(document: PaperDocument, pageIds: readonly string[]): Set<string> {
  const knownPageIds = new Set(document.pages.map((page) => page.id));
  for (const pageId of pageIds) {
    if (!knownPageIds.has(pageId)) {
      throw new Error(`Unknown Paper page id "${pageId}" requested for raster export.`);
    }
  }
  return new Set(pageIds);
}

function formatPlacedDocumentRasterizationIssues(issues: readonly PaperPlacedDocumentRasterizationIssue[]): string {
  const summary = issues.slice(0, 3).map((issue) => issue.message).join(' ');
  const more = issues.length > 3 ? ` ${issues.length - 3} more placed document frame${issues.length === 4 ? '' : 's'} also need a PDF page rasterizer.` : '';
  return `${summary}${more}`;
}
