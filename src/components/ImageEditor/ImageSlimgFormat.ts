import { packContainer, unpackContainer } from '../../shared/files/SignalLoomContainer';
import type { ImageDocument, ImageLayer, LayerBitmap } from '../../types/imageEditor';

export interface SlimgCodec {
  encode: (bitmap: LayerBitmap) => Promise<Uint8Array>;
  decode: (bytes: Uint8Array, width: number, height: number) => Promise<LayerBitmap>;
}

interface AssetRef {
  asset: string;
  width: number;
  height: number;
}

function isAssetRef(v: unknown): v is AssetRef {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as Record<string, unknown>).asset === 'string' &&
    typeof (v as Record<string, unknown>).width === 'number' &&
    typeof (v as Record<string, unknown>).height === 'number'
  );
}

export const SLIMG_FORMAT = 'signal-loom-image';
export const SLIMG_FORMAT_VERSION = 1;

/** Serialize an ImageDocument to .slimg container bytes. Layer bitmaps/masks become PNG asset
 *  entries; the rest of the doc is stored structurally in the manifest. */
export async function serializeSlimg(doc: ImageDocument, codec: SlimgCodec): Promise<Uint8Array> {
  const assets = new Map<string, Uint8Array>();
  let counter = 0;

  const mappedLayers = await Promise.all(
    doc.layers.map(async (layer) => {
      let bitmapField: AssetRef | null = null;
      let maskField: AssetRef | null = null;

      if (layer.bitmap !== null) {
        const id = `bmp-${counter++}.png`;
        assets.set(id, await codec.encode(layer.bitmap));
        bitmapField = { asset: id, width: layer.bitmap.width, height: layer.bitmap.height };
      }

      if (layer.mask !== null) {
        const id = `mask-${counter++}.png`;
        assets.set(id, await codec.encode(layer.mask));
        maskField = { asset: id, width: layer.mask.width, height: layer.mask.height };
      }

      return { ...layer, bitmap: bitmapField, mask: maskField };
    }),
  );

  const documentManifest = { ...doc, layers: mappedLayers };

  return packContainer(
    {
      format: SLIMG_FORMAT,
      formatVersion: SLIMG_FORMAT_VERSION,
      kind: 'image',
      document: documentManifest,
      assets: [...assets.keys()],
    },
    assets,
  );
}

/** Inverse of serializeSlimg. Throws if the container is not a .slimg or an asset is missing. */
export async function deserializeSlimg(bytes: Uint8Array, codec: SlimgCodec): Promise<ImageDocument> {
  const { manifest, assets } = unpackContainer(bytes);

  if (manifest.format !== SLIMG_FORMAT) {
    throw new Error('Not a .slimg container: ' + manifest.format);
  }

  const rawDoc = manifest.document as {
    layers: Array<Record<string, unknown>>;
    [k: string]: unknown;
  };

  const restoredLayers = await Promise.all(
    rawDoc.layers.map(async (rawLayer): Promise<ImageLayer> => {
      let bitmap: LayerBitmap | null = null;
      let mask: LayerBitmap | null = null;

      if (isAssetRef(rawLayer.bitmap)) {
        const ref = rawLayer.bitmap;
        const data = assets.get(ref.asset);
        if (!data) throw new Error('.slimg missing asset ' + ref.asset);
        bitmap = await codec.decode(data, ref.width, ref.height);
      }

      if (isAssetRef(rawLayer.mask)) {
        const ref = rawLayer.mask;
        const data = assets.get(ref.asset);
        if (!data) throw new Error('.slimg missing asset ' + ref.asset);
        mask = await codec.decode(data, ref.width, ref.height);
      }

      return { ...rawLayer, bitmap, mask } as unknown as ImageLayer;
    }),
  );

  return { ...rawDoc, layers: restoredLayers } as unknown as ImageDocument;
}
