import type { PaperFrame } from '../types/paper';

/** PDF MIME types commonly emitted by browsers, DAMs, and older Acrobat integrations. */
export const PAPER_PDF_MIME_TYPES = new Set([
  'application/pdf',
  'application/x-pdf',
  'application/acrobat',
]);

export interface PaperPlacedPdfClassification {
  isPdf: boolean;
  mimeType?: string;
  /** A URL-backed placement can be emitted as a real HTML object in live-print HTML. */
  canEmbedForLivePrint: boolean;
}

/**
 * Classify only bounded metadata. In particular, never decode a data URL or inspect its payload:
 * the media type is confined to the short header before its first comma.
 */
export function classifyPaperPlacedPdf(frame: Pick<PaperFrame, 'kind' | 'label' | 'asset'>): PaperPlacedPdfClassification {
  if (frame.kind !== 'document' && frame.kind !== 'image') return { isPdf: false, canEmbedForLivePrint: false };

  const asset = frame.asset;
  const dataUrlMime = mimeTypeFromBoundedDataUrl(asset?.locator?.kind === 'external' ? asset.locator.url : undefined);
  const mimeTypes = [
    dataUrlMime,
    normalizeMimeType(asset?.mimeType),
    normalizeMimeType(asset?.locator?.kind === 'managed' ? asset.locator.ref.mimeType : undefined),
  ];
  const mimeType = mimeTypes.find(isPaperPdfMimeType);
  const isPdf = Boolean(mimeType)
    || normalizeBoundedText(asset?.format) === 'pdf'
    || hasPdfFileLabel(asset?.label)
    || hasPdfFileLabel(frame.label);

  return {
    isPdf,
    mimeType,
    canEmbedForLivePrint: isPdf && Boolean(asset?.locator?.kind === 'external' && asset.locator.url),
  };
}

export function isPaperPdfMimeType(value: string | undefined): boolean {
  return Boolean(value && PAPER_PDF_MIME_TYPES.has(value));
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
  const header = boundedHeader.slice(5, comma >= 0 ? comma : undefined);
  return normalizeMimeType(header);
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
