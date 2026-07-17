import type { PaperFrame } from '../types/paper';

/** PDF MIME types commonly emitted by browsers, DAMs, and older Acrobat integrations. */
export const PAPER_PDF_MIME_TYPES = new Set([
  'application/pdf',
  'application/x-pdf',
  'application/acrobat',
]);

export interface PaperPlacedPdfClassification {
  isPdf: boolean;
  /** A resolved image MIME must use the ordinary Paper image path, even with a stale PDF label. */
  isImage: boolean;
  /** A confirmed or conservatively PDF-like placement must not reach the image-only flatten path. */
  blocksRasterization: boolean;
  mimeType?: string;
  /** A URL-backed placement can be emitted as a real HTML object in live-print HTML. */
  canEmbedForLivePrint: boolean;
}

/**
 * Classify only bounded metadata. In particular, never decode a data URL or inspect its payload:
 * the media type is confined to the short header before its first comma.
 */
export function classifyPaperPlacedPdf(frame: Pick<PaperFrame, 'kind' | 'label' | 'asset'>): PaperPlacedPdfClassification {
  if (frame.kind !== 'document' && frame.kind !== 'image') {
    return { isPdf: false, isImage: false, blocksRasterization: false, canEmbedForLivePrint: false };
  }

  const asset = frame.asset;
  // The managed reference is content-addressed and verified before export materialization. A valid
  // data URL carries the media type of its concrete payload. Both outrank loose asset metadata;
  // all three outrank retained format/name hints from an asset that has since been replaced.
  const resolvedMimeType = [
    normalizeMimeType(asset?.locator?.kind === 'managed' ? asset.locator.ref.mimeType : undefined),
    mimeTypeFromBoundedDataUrl(asset?.locator?.kind === 'external' ? asset.locator.url : undefined),
    normalizeMimeType(asset?.mimeType),
  ].find(isDecisivePlacedAssetMimeType);
  const isImage = isPaperImageMimeType(resolvedMimeType);
  const isPdf = isPaperPdfMimeType(resolvedMimeType)
    || (!resolvedMimeType && (
      normalizeBoundedText(asset?.format) === 'pdf'
      || hasPdfFileLabel(asset?.label)
      || hasPdfFileLabel(frame.label)
    ));

  return {
    isPdf,
    isImage,
    blocksRasterization: isPdf,
    mimeType: resolvedMimeType,
    canEmbedForLivePrint: isPdf && isUsableLivePrintPdfUrl(asset?.locator?.kind === 'external' ? asset.locator.url : undefined),
  };
}

export function isPaperPdfMimeType(value: string | undefined): boolean {
  return Boolean(value && PAPER_PDF_MIME_TYPES.has(value));
}

export function isPaperImageMimeType(value: string | undefined): boolean {
  return Boolean(value && value.startsWith('image/'));
}

function isDecisivePlacedAssetMimeType(value: string | undefined): value is string {
  return isPaperPdfMimeType(value) || isPaperImageMimeType(value);
}

function normalizeMimeType(value: string | undefined): string | undefined {
  const normalized = normalizeBoundedText(value);
  if (!normalized) return undefined;
  return normalized.split(';', 1)[0]?.trim() || undefined;
}

function mimeTypeFromBoundedDataUrl(value: string | undefined): string | undefined {
  if (typeof value !== 'string' || !value.startsWith('data:')) return undefined;
  const boundedHeader = value.slice(0, 512);
  const comma = boundedHeader.indexOf(',');
  // A data URL without a comma is incomplete. Do not bless its claimed media type as resolved
  // content; a PDF-looking label remains a conservative fallback instead.
  if (comma < 0) return undefined;
  const header = boundedHeader.slice(5, comma);
  return normalizeMimeType(header);
}

function isUsableLivePrintPdfUrl(value: string | undefined): boolean {
  if (typeof value !== 'string' || value.length === 0) return false;
  if (/^data:/i.test(value)) return isPaperPdfMimeType(mimeTypeFromBoundedDataUrl(value));
  // Blob/object URLs have no inspectable header. Their MIME was already resolved from the current
  // asset metadata above; retain them for the browser's compatible <object> path.
  return /^(?:blob:|https?:|file:|signal-loom-asset:)/i.test(value);
}

function hasPdfFileLabel(value: string | undefined): boolean {
  const label = normalizeBoundedText(value);
  return Boolean(label && /\.pdf(?:\s|$)/i.test(label));
}

function normalizeBoundedText(value: string | undefined): string | undefined {
  if (typeof value !== 'string') return undefined;
  const bounded = value.slice(0, 512).trim().toLowerCase();
  return bounded || undefined;
}
