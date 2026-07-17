// Deliberate capability boundary for Paper's browser raster paths.  Paper can place a PDF for
// live/print HTML, but this build does not contain a bounded PDF-page renderer (pdf-lib writes
// PDFs; it does not render pages).  Never hand a placed document to HTMLImageElement and hope it
// decodes: every raster target must stop before it starts a page transaction.

import type { PaperDocument, PaperFrame } from '../types/paper';
import { resolvePaperPageFramesForOutput } from './paperDocument';

export interface PaperPlacedDocumentRasterizationIssue {
  code: 'paper-placed-document-rasterization-unsupported';
  pageId: string;
  pageNumber: number;
  frameId: string;
  frameLabel: string;
  mimeType?: string;
  /** A conservatively detected PDF is useful context; unknown document bytes are blocked too. */
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
 * Returns every placed document that would otherwise be passed through the image-only flatten
 * adapter.  We intentionally block unknown/wrong MIME document records too: a remote URL or
 * mislabeled data URL cannot establish that it is a decodable image, and silently probing it would
 * both be unsafe and reintroduce the late failure this boundary eliminates.
 */
export function collectPaperPlacedDocumentRasterizationIssues(
  document: PaperDocument,
  pageIds: readonly string[] = document.pages.map((page) => page.id),
): PaperPlacedDocumentRasterizationIssue[] {
  const requested = new Set(pageIds);
  const issues: PaperPlacedDocumentRasterizationIssue[] = [];

  for (const page of document.pages) {
    if (!requested.has(page.id)) continue;
    for (const frame of resolvePaperPageFramesForOutput(document, page)) {
      if (frame.kind !== 'document' || !frame.asset) continue;
      issues.push(createIssue(page.id, page.pageNumber, frame));
    }
  }
  return issues;
}

/** Throws before materialization, fetch, decode, canvas allocation, or a partial multi-page output. */
export function assertPaperDocumentSupportsRasterization(
  document: PaperDocument,
  pageIds?: readonly string[],
): void {
  const issues = collectPaperPlacedDocumentRasterizationIssues(document, pageIds);
  if (issues.length > 0) throw new PaperPlacedDocumentRasterizationError(issues);
}

export function isPaperPlacedDocumentRasterizationError(value: unknown): value is PaperPlacedDocumentRasterizationError {
  return value instanceof PaperPlacedDocumentRasterizationError
    || (Boolean(value) && typeof value === 'object'
      && (value as { code?: unknown }).code === 'paper-placed-document-rasterization-unsupported');
}

function createIssue(pageId: string, pageNumber: number, frame: PaperFrame): PaperPlacedDocumentRasterizationIssue {
  // A data URL self-identifies its payload and is more trustworthy than stale imported metadata.
  const mimeType = mimeTypeFromDataUrl(frame.asset?.locator?.kind === 'external' ? frame.asset.locator.url : undefined)
    ?? normalizeMimeType(frame.asset?.mimeType)
    ?? normalizeMimeType(frame.asset?.locator?.kind === 'managed' ? frame.asset.locator.ref.mimeType : undefined);
  const isPdf = mimeType === 'application/pdf';
  const kind = isPdf ? 'PDF' : 'document';
  return {
    code: 'paper-placed-document-rasterization-unsupported',
    pageId,
    pageNumber,
    frameId: frame.id,
    frameLabel: frame.asset?.label || frame.label,
    mimeType,
    isPdf,
    message: `Page ${pageNumber}, frame "${frame.asset?.label || frame.label}" places a ${kind} that this browser build cannot rasterize. Use Print HTML/live print to preserve the placed PDF, or replace it with a raster image before exporting PNG, CBZ/KDP, soft proof, or PDF/X.`,
  };
}

function normalizeMimeType(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.split(';', 1)[0]?.trim().toLowerCase();
  return normalized || undefined;
}

function mimeTypeFromDataUrl(value: string | undefined): string | undefined {
  if (!value || !value.startsWith('data:')) return undefined;
  const comma = value.indexOf(',');
  const header = value.slice(5, comma >= 0 ? comma : undefined);
  return normalizeMimeType(header);
}

function formatPlacedDocumentRasterizationIssues(issues: readonly PaperPlacedDocumentRasterizationIssue[]): string {
  const summary = issues.slice(0, 3).map((issue) => issue.message).join(' ');
  const more = issues.length > 3 ? ` ${issues.length - 3} more placed document frame${issues.length === 4 ? '' : 's'} also need a PDF page rasterizer.` : '';
  return `${summary}${more}`;
}
