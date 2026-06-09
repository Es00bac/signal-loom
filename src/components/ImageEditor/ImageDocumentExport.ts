import type { ImageDocument, LayerBitmap } from '../../types/imageEditor';
import { inferMimeTypeFromFile } from '../../lib/mediaFormatRegistry';
import { getBitmapImageData } from './LayerBitmap';
import { maskToCanvas, type SelectionMask } from './SelectionMask';
import { renderImageDocumentLayersToBitmap } from './ImageAdjustmentLayer';
import {
  IMAGE_BMP_MIME_TYPE,
  IMAGE_GIF_MIME_TYPE,
  IMAGE_SVG_MIME_TYPE,
  IMAGE_TIFF_MIME_TYPE,
  encodeImageDataToBmp,
  encodeImageDataToStaticGif,
  encodeImageDataToTiff,
} from './ImageFileFormats';

export interface ImageExportFormat {
  label: string;
  mimeType: string;
  extension: string;
}

const IMAGE_VISIBLE_EXPORT_EXTENSIONS = ['png', 'jpg', 'webp', 'avif', 'bmp', 'gif', 'tif', 'svg'] as const;

export const IMAGE_EXPORT_FORMATS: ImageExportFormat[] = IMAGE_VISIBLE_EXPORT_EXTENSIONS.map((extension) => ({
  label: extension === 'jpg' ? 'JPEG' : extension === 'tif' ? 'TIFF' : extension.toUpperCase(),
  mimeType: inferMimeTypeFromFile(`image.${extension}`, 'image') ?? 'image/png',
  extension,
}));

const DEFAULT_IMAGE_EXPORT_MIME_TYPE = 'image/png';

export function normalizeImageExportMimeType(mimeType: string | undefined): string {
  return mimeType && IMAGE_EXPORT_FORMATS.some((format) => format.mimeType === mimeType)
    ? mimeType
    : DEFAULT_IMAGE_EXPORT_MIME_TYPE;
}

export function getImageExportFormat(mimeType: string | undefined): ImageExportFormat {
  const normalized = normalizeImageExportMimeType(mimeType);
  return IMAGE_EXPORT_FORMATS.find((format) => format.mimeType === normalized) ?? IMAGE_EXPORT_FORMATS[0];
}

export function flattenImageDocumentToBitmap(doc: ImageDocument): LayerBitmap {
  return renderImageDocumentLayersToBitmap(doc);
}

export function renderSelectionMaskToBitmap(mask: SelectionMask): LayerBitmap {
  return maskToCanvas(mask) as LayerBitmap;
}

export async function imageDocumentToDataUrl(
  doc: ImageDocument,
  mimeType = 'image/png',
): Promise<string> {
  return blobToDataUrl(await imageDocumentToBlob(doc, mimeType));
}

export async function imageDocumentToBlob(
  doc: ImageDocument,
  mimeType = 'image/png',
): Promise<Blob> {
  const normalized = normalizeImageExportMimeType(mimeType);
  if (normalized === IMAGE_TIFF_MIME_TYPE) {
    const imageData = getBitmapImageData(flattenImageDocumentToBitmap(doc));
    const bytes = encodeImageDataToTiff(imageData);
    const body = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(body).set(bytes);
    return new Blob([body], { type: IMAGE_TIFF_MIME_TYPE });
  }
  if (normalized === IMAGE_BMP_MIME_TYPE) {
    const imageData = getBitmapImageData(flattenImageDocumentToBitmap(doc));
    const bytes = encodeImageDataToBmp(imageData);
    const body = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(body).set(bytes);
    return new Blob([body], { type: IMAGE_BMP_MIME_TYPE });
  }
  if (normalized === IMAGE_GIF_MIME_TYPE) {
    const imageData = getBitmapImageData(flattenImageDocumentToBitmap(doc));
    const bytes = encodeImageDataToStaticGif(imageData);
    const body = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(body).set(bytes);
    return new Blob([body], { type: IMAGE_GIF_MIME_TYPE });
  }
  if (normalized === IMAGE_SVG_MIME_TYPE) {
    const raster = await bitmapToDataUrl(flattenImageDocumentToBitmap(doc), 'image/png');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${doc.width}" height="${doc.height}" viewBox="0 0 ${doc.width} ${doc.height}"><title>${escapeXml(doc.title || 'Image export')}</title><image href="${raster}" width="${doc.width}" height="${doc.height}" preserveAspectRatio="none" /></svg>`;
    return new Blob([svg], { type: IMAGE_SVG_MIME_TYPE });
  }
  return bitmapToBlob(flattenImageDocumentToBitmap(doc), normalized);
}

export async function selectionMaskToDataUrl(
  mask: SelectionMask,
  mimeType = 'image/png',
): Promise<string> {
  return bitmapToDataUrl(renderSelectionMaskToBitmap(mask), mimeType);
}

export function buildImageDocumentExportLabel({
  doc,
  sourceLabel,
  existingItems,
  suffix,
}: {
  doc: Pick<ImageDocument, 'title'>;
  sourceLabel?: string;
  existingItems: Array<{ label: string }>;
  suffix: 'edit' | 'mask';
}): string {
  const base = stripImageExtension(sourceLabel || doc.title || 'Image').trim() || 'Image';
  const first = `${base} ${suffix}`;
  const existingLabels = new Set(existingItems.map((item) => item.label.trim().toLowerCase()));

  if (!existingLabels.has(first.toLowerCase())) {
    return first;
  }

  for (let index = 2; index < 10_000; index += 1) {
    const candidate = `${first} ${index}`;
    if (!existingLabels.has(candidate.toLowerCase())) {
      return candidate;
    }
  }

  return `${first} ${Date.now()}`;
}

function stripImageExtension(label: string): string {
  return label.replace(/\.(png|jpe?g|webp|gif|avif|bmp|tiff?)$/i, '');
}

async function bitmapToDataUrl(bitmap: LayerBitmap, mimeType: string): Promise<string> {
  const blob = await bitmapToBlob(bitmap, mimeType);
  return blobToDataUrl(blob);
}

async function bitmapToBlob(bitmap: LayerBitmap, mimeType: string): Promise<Blob> {
  return bitmap.convertToBlob({ type: mimeType });
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  if (typeof FileReader !== 'undefined') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error ?? new Error('Failed to export image data.'));
      reader.onload = () => {
        if (typeof reader.result !== 'string') {
          reject(new Error('The exported image could not be converted into a data URL.'));
          return;
        }
        resolve(reader.result);
      };
      reader.readAsDataURL(blob);
    });
  }

  const bytes = new Uint8Array(await blob.arrayBuffer());
  const chunkSize = 0x8000;
  let binary = '';

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
  }

  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(binary)}`;
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char] ?? char);
}
