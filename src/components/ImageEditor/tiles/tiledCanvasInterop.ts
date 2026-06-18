import { TILE_SIZE, TiledBitmap } from './TiledBitmap';

/**
 * Materialize a TiledBitmap onto a fresh OffscreenCanvas of the same dimensions.
 * Only non-empty tiles are written (via forEachTile), keeping the fast path cheap.
 */
export function tiledBitmapToCanvas(bitmap: TiledBitmap): OffscreenCanvas {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d')!;
  bitmap.forEachTile((tx, ty) => {
    const x = tx * TILE_SIZE;
    const y = ty * TILE_SIZE;
    const w = Math.min(TILE_SIZE, bitmap.width - x);
    const h = Math.min(TILE_SIZE, bitmap.height - y);
    const region = bitmap.materializeRegion(x, y, w, h);
    ctx.putImageData(region, x, y);
  });
  return canvas;
}

/**
 * Capture the full contents of a canvas into a new TiledBitmap of the same dimensions.
 */
export function canvasToTiledBitmap(canvas: OffscreenCanvas | HTMLCanvasElement): TiledBitmap {
  const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
  const bitmap = new TiledBitmap(canvas.width, canvas.height);
  if (!ctx) return bitmap;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  bitmap.applyRegion(0, 0, imageData);
  return bitmap;
}
