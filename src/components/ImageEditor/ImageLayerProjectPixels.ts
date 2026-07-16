import type { ImageDocumentSnapshot, ImageLayer, LayerBitmap } from '../../types/imageEditor';
import { bitmapFromUrl, bitmapToPngDataUrl } from './LayerBitmap';

/**
 * Pixel codec used to move an image layer's live OffscreenCanvas buffers (`bitmap`/`mask`)
 * in and out of the serializable base64 payloads stored in a project file. Injectable so the
 * round-trip wiring can be tested without a real canvas backend.
 */
export interface ImageLayerPixelCodec {
  encode: (bitmap: LayerBitmap) => Promise<string>;
  decode: (dataUrl: string) => Promise<LayerBitmap>;
}

export const defaultImageLayerPixelCodec: ImageLayerPixelCodec = {
  encode: bitmapToPngDataUrl,
  decode: bitmapFromUrl,
};

/**
 * Encode a layer's live `bitmap`/`mask` into serializable `bitmapData`/`maskData` (base64 PNG)
 * and null the live buffers. This is how the active image canvas is persisted into a `.sloom`
 * (and `.slimg`) — previously the bitmaps were stripped to null with no persistence, silently
 * wiping the image on the next open.
 */
export async function encodeImageLayerProjectPixels(
  layer: ImageLayer,
  codec: ImageLayerPixelCodec = defaultImageLayerPixelCodec,
): Promise<ImageLayer> {
  const bitmapData = layer.bitmap ? await codec.encode(layer.bitmap) : undefined;
  const maskData = layer.mask ? await codec.encode(layer.mask) : undefined;
  return { ...layer, bitmap: null, mask: null, bitmapData, maskData };
}

/**
 * Rebuild a layer's live `bitmap`/`mask` from its serialized `bitmapData`/`maskData`, then clear
 * the payload fields. A failed decode leaves that buffer null rather than throwing, so one bad
 * layer can't abort the whole project restore.
 */
export async function decodeImageLayerProjectPixels(
  layer: ImageLayer,
  codec: ImageLayerPixelCodec = defaultImageLayerPixelCodec,
): Promise<ImageLayer> {
  let bitmap = layer.bitmap;
  let mask = layer.mask;
  if (layer.bitmapData) {
    try { bitmap = await codec.decode(layer.bitmapData); } catch { bitmap = null; }
  }
  if (layer.maskData) {
    try { mask = await codec.decode(layer.maskData); } catch { mask = null; }
  }
  return { ...layer, bitmap, mask, bitmapData: undefined, maskData: undefined };
}

/** Persist a bounded named snapshot through the same lossless PNG layer transport as the live document. */
export async function encodeImageDocumentSnapshotProjectPixels(
  snapshot: ImageDocumentSnapshot,
  codec: ImageLayerPixelCodec = defaultImageLayerPixelCodec,
): Promise<ImageDocumentSnapshot> {
  if (snapshot.pixelState !== 'complete') {
    return { ...snapshot, pixelState: 'unavailable' };
  }
  return {
    ...snapshot,
    layers: await Promise.all(snapshot.layers.map((layer) => encodeImageLayerProjectPixels(layer, codec))),
    pixelState: 'complete',
  };
}

/** Decode snapshot pixels and fail the snapshot closed if any advertised payload is corrupt. */
export async function decodeImageDocumentSnapshotProjectPixels(
  snapshot: ImageDocumentSnapshot,
  codec: ImageLayerPixelCodec = defaultImageLayerPixelCodec,
): Promise<ImageDocumentSnapshot> {
  if (snapshot.pixelState !== 'complete') {
    return { ...snapshot, pixelState: 'unavailable' };
  }
  let decodeFailed = false;
  const layers = await Promise.all(snapshot.layers.map(async (layer) => {
    const expectedBitmap = Boolean(layer.bitmapData);
    const expectedMask = Boolean(layer.maskData);
    const decoded = await decodeImageLayerProjectPixels(layer, codec);
    if ((expectedBitmap && !decoded.bitmap) || (expectedMask && !decoded.mask)) decodeFailed = true;
    return decoded;
  }));
  return {
    ...snapshot,
    layers,
    pixelState: decodeFailed ? 'unavailable' : 'complete',
  };
}
