import type { LayerBitmap } from '../../types/imageEditor';

/**
 * Thin wrappers over OffscreenCanvas for use as raster layer buffers.
 * These delegate directly to the native API; they exist to give the rest of
 * the editor a single import surface and to keep test code free of
 * `OffscreenCanvas` references when not strictly needed.
 */

export function createBitmap(width: number, height: number): LayerBitmap {
  return new OffscreenCanvas(Math.max(1, Math.floor(width)), Math.max(1, Math.floor(height)));
}

export function cloneBitmap(src: LayerBitmap): LayerBitmap {
  const dest = createBitmap(src.width, src.height);
  const ctx = getCtx(dest);
  ctx.drawImage(src, 0, 0);
  return dest;
}

export function clearBitmap(bitmap: LayerBitmap): void {
  const ctx = getCtx(bitmap);
  ctx.clearRect(0, 0, bitmap.width, bitmap.height);
}

export function fillBitmap(bitmap: LayerBitmap, color: string): void {
  const ctx = getCtx(bitmap);
  ctx.save();
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, bitmap.width, bitmap.height);
  ctx.restore();
}

export function getBitmapImageData(bitmap: LayerBitmap): ImageData {
  return getCtx(bitmap).getImageData(0, 0, bitmap.width, bitmap.height);
}

export function putBitmapImageData(
  bitmap: LayerBitmap,
  imageData: ImageData,
  dx = 0,
  dy = 0,
): void {
  getCtx(bitmap).putImageData(imageData, dx, dy);
}

export function blitInto(
  dest: LayerBitmap,
  src: CanvasImageSource,
  dx = 0,
  dy = 0,
): void {
  getCtx(dest).drawImage(src, dx, dy);
}

export async function bitmapToBlob(
  bitmap: LayerBitmap,
  type: string = 'image/png',
): Promise<Blob> {
  return bitmap.convertToBlob({ type });
}

/**
 * Encode a layer bitmap to a base64 PNG data URL for serialization into a project file
 * (.sloom / .slimg). Chunked base64 so multi-megabyte 4K layers don't blow the call stack.
 * Decode the result back into a live bitmap with `bitmapFromUrl`.
 */
export async function bitmapToPngDataUrl(bitmap: LayerBitmap): Promise<string> {
  const blob = await bitmap.convertToBlob({ type: 'image/png' });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return `data:image/png;base64,${btoa(binary)}`;
}

export async function bitmapFromImageSource(image: CanvasImageSource): Promise<LayerBitmap> {
  const width = (image as { width?: number }).width ?? 0;
  const height = (image as { height?: number }).height ?? 0;
  const bitmap = createBitmap(width || 1, height || 1);
  getCtx(bitmap).drawImage(image, 0, 0);
  return bitmap;
}

export async function bitmapFromUrl(url: string): Promise<LayerBitmap> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
  }
  const blob = await response.blob();
  const imageBitmap = await createImageBitmap(blob);
  try {
    return await bitmapFromImageSource(imageBitmap);
  } finally {
    imageBitmap.close();
  }
}

function getCtx(bitmap: LayerBitmap): OffscreenCanvasRenderingContext2D {
  const ctx = bitmap.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to acquire 2D context for layer bitmap');
  }
  return ctx;
}
