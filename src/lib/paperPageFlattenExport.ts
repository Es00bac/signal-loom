import type { SourceBinLibraryItem } from '../store/sourceBinStore';
import type { PaperDocument, PaperPage } from '../types/paper';
import {
  exportPaperDocumentToPrintHtml,
  paperPixelsFromMm,
  updatePaperDocumentSetup,
} from './paperDocument';

export interface PaperPageExportDimensions {
  widthMm: number;
  heightMm: number;
  widthPx: number;
  heightPx: number;
  scale: number;
  includeBleed: boolean;
}

export interface FlattenedPaperPageSvgExport extends PaperPageExportDimensions {
  pageId: string;
  pageNumber: number;
  label: string;
  mimeType: 'image/svg+xml';
  svg: string;
  dataUrl: string;
}

export interface FlattenedPaperPageRasterExport extends Omit<FlattenedPaperPageSvgExport, 'mimeType' | 'svg' | 'dataUrl'> {
  mimeType: 'image/png';
  dataUrl: string;
}

export interface PaperPageFlattenExportOptions {
  includeBleed?: boolean;
  outputDpi?: number;
  outputWidthPx?: number;
  outputHeightPx?: number;
  /** Drop ALL text-kind frames (they're drawn as vector on top of this raster). */
  backdropOnly?: boolean;
  /**
   * Drop only these specific text-kind frames (the ones drawn as vector on top). Other text frames —
   * e.g. display-font SFX with no faithful vector substitute — stay baked into the raster. Takes
   * precedence over `backdropOnly` when both are set.
   */
  excludeTextFrameIds?: string[];
}

export interface PaperPageEmbeddedAssetExportOptions extends PaperPageFlattenExportOptions {
  resolveImageSrc?: (src: string, context: { frameId: string; pageId: string }) => Promise<string | undefined> | string | undefined;
}

export interface PaperPageSourcePayloadOptions extends PaperPageFlattenExportOptions {
  dataUrl?: string;
  mimeType?: string;
  envelopeId?: string;
  envelopeLabel?: string;
  envelopeIndex?: number;
}

export interface FlattenedPaperPageSourcePayload {
  id?: string;
  label: string;
  kind: Exclude<SourceBinLibraryItem['kind'], 'text'>;
  mimeType: string;
  dataUrl: string;
  sourceKey?: string;
  originNodeId?: string;
  envelopeId?: string;
  envelopeLabel?: string;
  envelopeIndex?: number;
}

export function getPaperPageExportDimensions(
  document: Pick<PaperDocument, 'page'>,
  options: PaperPageFlattenExportOptions = {},
): PaperPageExportDimensions {
  const includeBleed = options.includeBleed ?? true;
  const bleedMm = includeBleed ? document.page.bleedMm : 0;
  const widthMm = Number((document.page.widthMm + bleedMm * 2).toFixed(3));
  const heightMm = Number((document.page.heightMm + bleedMm * 2).toFixed(3));
  const requestedWidthPx = positiveInteger(options.outputWidthPx);
  const requestedHeightPx = positiveInteger(options.outputHeightPx);
  const outputDpi = positiveNumber(options.outputDpi) ?? document.page.dpi;
  const widthPx = requestedWidthPx
    ?? (requestedHeightPx ? Math.max(1, Math.round(requestedHeightPx * (widthMm / heightMm))) : paperPixelsFromMm(widthMm, outputDpi));
  const heightPx = requestedHeightPx
    ?? (requestedWidthPx ? Math.max(1, Math.round(requestedWidthPx * (heightMm / widthMm))) : paperPixelsFromMm(heightMm, outputDpi));
  const cssPxPerMm = 96 / 25.4;
  const exportPxPerMm = widthPx / widthMm;

  return {
    widthMm,
    heightMm,
    widthPx,
    heightPx,
    scale: Number((exportPxPerMm / cssPxPerMm).toFixed(6)),
    includeBleed,
  };
}

export function buildFlattenedPaperPageSvgExport(
  document: PaperDocument,
  pageId: string,
  options: PaperPageFlattenExportOptions = {},
): FlattenedPaperPageSvgExport {
  const page = findPaperPage(document, pageId);
  const dimensions = getPaperPageExportDimensions(document, options);
  const onePageDocument = buildOnePageExportDocument(document, page, options);
  const html = exportPaperDocumentToPrintHtml(onePageDocument, {
    mediaBox: dimensions.includeBleed ? 'bleed' : 'trim',
    includeScreenGuides: false,
  });
  const body = extractHtmlSection(html, 'body');
  const style = extractHtmlSection(html, 'style');
  const label = `${document.title || 'Paper Layout'} - Page ${page.pageNumber}`;
  const sheetCssWidthPx = dimensions.widthPx / dimensions.scale;
  const sheetCssHeightPx = dimensions.heightPx / dimensions.scale;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${dimensions.widthPx}" height="${dimensions.heightPx}" viewBox="0 0 ${dimensions.widthPx} ${dimensions.heightPx}">
  <foreignObject width="${dimensions.widthPx}" height="${dimensions.heightPx}">
    <div xmlns="http://www.w3.org/1999/xhtml" style="width:${formatPx(sheetCssWidthPx)};height:${formatPx(sheetCssHeightPx)};overflow:hidden;transform:scale(${dimensions.scale});transform-origin:top left;background:#d1d5db;">
      <style>${escapeCdata(style)}</style>
      ${body}
    </div>
  </foreignObject>
</svg>`;

  return {
    ...dimensions,
    pageId: page.id,
    pageNumber: page.pageNumber,
    label,
    mimeType: 'image/svg+xml',
    svg,
    dataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
  };
}

export async function buildFlattenedPaperPageSvgExportWithEmbeddedAssets(
  document: PaperDocument,
  pageId: string,
  options: PaperPageEmbeddedAssetExportOptions = {},
): Promise<FlattenedPaperPageSvgExport> {
  if (!options.resolveImageSrc) {
    return buildFlattenedPaperPageSvgExport(document, pageId, options);
  }

  const page = findPaperPage(document, pageId);
  const frames = await Promise.all(page.frames.map(async (frame) => {
    if (!frame.asset?.src) return frame;
    const resolvedSrc = await Promise.resolve(options.resolveImageSrc?.(frame.asset.src, {
      frameId: frame.id,
      pageId: page.id,
    })).catch(() => undefined);
    if (!resolvedSrc || resolvedSrc === frame.asset.src) return frame;
    return {
      ...frame,
      asset: {
        ...frame.asset,
        src: resolvedSrc,
      },
    };
  }));
  const embeddedDocument: PaperDocument = {
    ...document,
    pages: document.pages.map((candidate) => candidate.id === page.id
      ? { ...candidate, frames }
      : candidate),
  };

  return buildFlattenedPaperPageSvgExport(embeddedDocument, page.id, options);
}

export function buildFlattenedPaperPageSourcePayload(
  document: PaperDocument,
  pageId: string,
  options: PaperPageSourcePayloadOptions = {},
): FlattenedPaperPageSourcePayload {
  const exported = buildFlattenedPaperPageSvgExport(document, pageId, options);

  return {
    label: exported.label,
    kind: 'image',
    mimeType: options.mimeType ?? exported.mimeType,
    dataUrl: options.dataUrl ?? exported.dataUrl,
    sourceKey: `paper-page:${document.id}:${pageId}:${exported.widthPx}x${exported.heightPx}:${exported.includeBleed ? 'bleed' : 'trim'}`,
    envelopeId: options.envelopeId,
    envelopeLabel: options.envelopeLabel,
    envelopeIndex: options.envelopeIndex,
  };
}

export async function rasterizeFlattenedPaperPageToPng(
  exported: FlattenedPaperPageSvgExport,
  browserDocument: Document = globalThis.document,
): Promise<FlattenedPaperPageRasterExport> {
  if (!browserDocument) {
    throw new Error('Paper page raster export needs a browser document.');
  }

  const image = new Image();
  image.decoding = 'async';
  image.src = exported.dataUrl;
  await decodeImage(image);

  const canvas = browserDocument.createElement('canvas');
  canvas.width = exported.widthPx;
  canvas.height = exported.heightPx;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Paper page raster export could not create a canvas context.');
  }
  context.drawImage(image, 0, 0, exported.widthPx, exported.heightPx);

  return {
    pageId: exported.pageId,
    pageNumber: exported.pageNumber,
    label: exported.label,
    widthMm: exported.widthMm,
    heightMm: exported.heightMm,
    widthPx: exported.widthPx,
    heightPx: exported.heightPx,
    scale: exported.scale,
    includeBleed: exported.includeBleed,
    mimeType: 'image/png',
    dataUrl: canvas.toDataURL('image/png'),
  };
}

export interface FlattenedPaperPageRgbaExport extends PaperPageExportDimensions {
  pageId: string;
  pageNumber: number;
  label: string;
  /** Interleaved RGBA, row-major top-to-bottom (canvas order). Length = widthPx*heightPx*4. */
  rgba: Uint8ClampedArray;
}

/**
 * Rasterize a flattened page SVG to raw RGBA pixels (for the real PDF/X exporter, which converts them
 * to CMYK through an ICC profile). Same canvas path as the PNG raster, minus the PNG encode.
 */
export async function rasterizeFlattenedPaperPageToRgba(
  exported: FlattenedPaperPageSvgExport,
  browserDocument: Document = globalThis.document,
): Promise<FlattenedPaperPageRgbaExport> {
  if (!browserDocument) {
    throw new Error('Paper page raster export needs a browser document.');
  }
  const image = new Image();
  image.decoding = 'async';
  image.src = exported.dataUrl;
  await decodeImage(image);

  const canvas = browserDocument.createElement('canvas');
  canvas.width = exported.widthPx;
  canvas.height = exported.heightPx;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Paper page raster export could not create a canvas context.');
  }
  context.drawImage(image, 0, 0, exported.widthPx, exported.heightPx);
  const { data } = context.getImageData(0, 0, exported.widthPx, exported.heightPx);

  return {
    pageId: exported.pageId,
    pageNumber: exported.pageNumber,
    label: exported.label,
    widthMm: exported.widthMm,
    heightMm: exported.heightMm,
    widthPx: exported.widthPx,
    heightPx: exported.heightPx,
    scale: exported.scale,
    includeBleed: exported.includeBleed,
    rgba: data,
  };
}

function positiveNumber(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

function positiveInteger(value: number | undefined): number | undefined {
  const numericValue = positiveNumber(value);
  return numericValue ? Math.max(1, Math.round(numericValue)) : undefined;
}

export async function imageSourceToDataUrl(src: string): Promise<string> {
  if (src.startsWith('data:')) return src;
  const response = await fetch(src);
  if (!response.ok) {
    throw new Error(`Could not embed Paper image asset (${response.status}).`);
  }
  const blob = await response.blob();
  return blobToDataUrl(blob);
}

function buildOnePageExportDocument(
  document: PaperDocument,
  page: PaperPage,
  options: PaperPageFlattenExportOptions,
): PaperDocument {
  const includeBleed = options.includeBleed ?? true;
  let exportPage = page;
  const excluded = options.excludeTextFrameIds ? new Set(options.excludeTextFrameIds) : undefined;
  if (excluded) {
    // Frame-level: keep art frames and any text frame NOT being drawn as vector on top.
    exportPage = { ...page, frames: page.frames.filter((frame) => !excluded.has(frame.id)) };
  } else if (options.backdropOnly) {
    exportPage = {
      ...page,
      frames: page.frames.filter((frame) => {
        return frame.kind === 'panel' || frame.kind === 'image' || frame.kind === 'shape' || frame.kind === 'document';
      }),
    };
  }
  const exportDocument = {
    ...document,
    pages: [exportPage],
  };

  if (includeBleed) return exportDocument;

  return updatePaperDocumentSetup(exportDocument, { bleedMm: 0 });
}

function findPaperPage(document: PaperDocument, pageId: string): PaperPage {
  const page = document.pages.find((candidate) => candidate.id === pageId) ?? document.pages[0];
  if (!page) {
    throw new Error('Paper page export needs at least one page.');
  }
  return page;
}

function extractHtmlSection(html: string, tagName: 'style' | 'body'): string {
  const pattern = new RegExp(`<${tagName}[^>]*>([\\s\\S]*)<\\/${tagName}>`, 'i');
  return pattern.exec(html)?.[1]?.trim() ?? '';
}

function escapeCdata(value: string): string {
  return value.replaceAll('</style>', '<\\/style>');
}

function formatPx(value: number): string {
  return `${Number(value.toFixed(3))}px`;
}

function decodeImage(image: HTMLImageElement): Promise<void> {
  if (typeof image.decode === 'function') {
    return image.decode();
  }
  return new Promise((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Paper page SVG could not be loaded for raster export.'));
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Paper image asset could not be embedded as a data URL.'));
      }
    };
    reader.onerror = () => reject(new Error('Paper image asset could not be read for embedding.'));
    reader.readAsDataURL(blob);
  });
}
