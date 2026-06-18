import type { ImageDocument, LayerBitmap } from '../../types/imageEditor';
import { createBitmap } from './LayerBitmap';
import { deserializeSlimg, serializeSlimg, type SlimgCodec } from './ImageSlimgFormat';

/**
 * The real (browser) pixel codec for `.slimg`: layer bitmaps are stored as PNG inside the zip
 * container. This is thin glue over the canvas APIs; the structural serialization it drives
 * (`ImageSlimgFormat`) is unit-tested with an injected codec, so this module just supplies the
 * PNG encode/decode. Runs identically in Electron and Android/ALOS/DeX WebView (OffscreenCanvas +
 * createImageBitmap are available in all of them).
 */
async function encodeBitmapToPng(bitmap: LayerBitmap): Promise<Uint8Array> {
  const blob = await bitmap.convertToBlob({ type: 'image/png' });
  return new Uint8Array(await blob.arrayBuffer());
}

async function decodePngToBitmap(bytes: Uint8Array, width: number, height: number): Promise<LayerBitmap> {
  const blob = new Blob([bytes as BlobPart], { type: 'image/png' });
  const image = await createImageBitmap(blob);
  const canvas = createBitmap(width, height);
  canvas.getContext('2d')?.drawImage(image, 0, 0);
  image.close?.();
  return canvas;
}

export const slimgPixelCodec: SlimgCodec = {
  encode: encodeBitmapToPng,
  decode: decodePngToBitmap,
};

/** Serialize the active Image document to `.slimg` container bytes (ready to write to a file). */
export function saveImageDocumentAsSlimg(doc: ImageDocument): Promise<Uint8Array> {
  return serializeSlimg(doc, slimgPixelCodec);
}

/** Parse `.slimg` container bytes back into a layered ImageDocument. */
export function openSlimgDocument(bytes: Uint8Array): Promise<ImageDocument> {
  return deserializeSlimg(bytes, slimgPixelCodec);
}
