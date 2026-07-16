import { packContainer, unpackContainer } from '../../shared/files/SignalLoomContainer';
import type { ImageDocument, ImageDocumentSnapshot, ImageLayer, LayerBitmap } from '../../types/imageEditor';

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
  const encodedBitmaps = new Map<LayerBitmap, Promise<AssetRef>>();
  let counter = 0;

  const encodeBitmap = async (bitmap: LayerBitmap | null, prefix: string): Promise<AssetRef | null> => {
    if (!bitmap) return null;
    const existing = encodedBitmaps.get(bitmap);
    if (existing) return existing;
    const id = `${prefix}-${counter++}.png`;
    const ref = { asset: id, width: bitmap.width, height: bitmap.height };
    const pending = codec.encode(bitmap).then((bytes) => {
      assets.set(id, bytes);
      return ref;
    });
    encodedBitmaps.set(bitmap, pending);
    return pending;
  };
  const encodeLayer = async (layer: ImageLayer, prefix: string) => ({
    ...layer,
    bitmap: await encodeBitmap(layer.bitmap, `${prefix}-bmp`),
    mask: await encodeBitmap(layer.mask, `${prefix}-mask`),
  });

  const mappedLayers = await Promise.all(doc.layers.map((layer) => encodeLayer(layer, 'layer')));
  const mappedSnapshots = await Promise.all((doc.snapshots ?? []).map(async (snapshot) => ({
    ...snapshot,
    layers: snapshot.pixelState === 'complete'
      ? await Promise.all(snapshot.layers.map((layer) => encodeLayer(layer, 'snapshot')))
      : snapshot.layers.map((layer) => ({ ...layer, bitmap: null, mask: null })),
    pixelState: snapshot.pixelState === 'complete' ? 'complete' as const : 'unavailable' as const,
  })));

  // The container itself is the editable layered save baseline. Do not persist the live
  // pre-save warning into a file that has just been saved successfully.
  const documentManifest = { ...doc, dirty: false, layers: mappedLayers, snapshots: mappedSnapshots };

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
    snapshots?: Array<Record<string, unknown>>;
    [k: string]: unknown;
  };

  const decodeLayer = async (rawLayer: Record<string, unknown>): Promise<ImageLayer> => {
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
  };

  const restoredLayers = await Promise.all(rawDoc.layers.map(decodeLayer));
  const restoredSnapshots = await Promise.all((rawDoc.snapshots ?? []).map(async (rawSnapshot, index) => {
    const rawLayers = Array.isArray(rawSnapshot.layers)
      ? rawSnapshot.layers.filter((layer): layer is Record<string, unknown> => typeof layer === 'object' && layer !== null)
      : [];
    const pixelState = rawSnapshot.pixelState === 'complete' ? 'complete' : 'unavailable';
    return {
      ...rawSnapshot,
      id: typeof rawSnapshot.id === 'string' ? rawSnapshot.id : `image-snapshot-${index}`,
      layers: pixelState === 'complete' ? await Promise.all(rawLayers.map(decodeLayer)) : rawLayers.map((layer) => ({
        ...layer,
        bitmap: null,
        mask: null,
      })) as ImageLayer[],
      pixelState,
    } as ImageDocumentSnapshot;
  }));

  return { ...rawDoc, layers: restoredLayers, snapshots: restoredSnapshots } as unknown as ImageDocument;
}
