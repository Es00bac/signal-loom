import { packContainer, unpackContainer } from '../../shared/files/SignalLoomContainer';
import type { ImageDocument, ImageDocumentSnapshot, ImageLayer, LayerBitmap, SelectionMaskSnapshot } from '../../types/imageEditor';
import {
  buildImageDocumentSnapshotIntegrity,
  disposeImageDocumentSnapshotResources,
  inspectImageDocumentSnapshotIntegrity,
  markImageDocumentSnapshotOwned,
} from './ImageSnapshots';
import { getSelection } from './selectionRegistry';

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
  const encodeSelection = (selection: SelectionMaskSnapshot | undefined, prefix: string): AssetRef | null => {
    if (!selection) return null;
    const id = `${prefix}-${counter++}.alpha`;
    assets.set(id, new Uint8Array(selection.data));
    return { asset: id, width: selection.width, height: selection.height };
  };

  const liveSelection = doc.hasSelection ? getSelection(doc.id) ?? doc.selectionMask : undefined;
  const persistLiveSelection = Boolean(
    liveSelection
    && liveSelection.width === doc.width
    && liveSelection.height === doc.height
    && liveSelection.data.byteLength === doc.width * doc.height
    && liveSelection.data.some((value) => value !== 0),
  );

  const mappedLayers = await Promise.all(doc.layers.map((layer) => encodeLayer(layer, 'layer')));
  const mappedSnapshots = await Promise.all((doc.snapshots ?? []).map(async (snapshot) => {
    const complete = inspectImageDocumentSnapshotIntegrity(snapshot).complete;
    return {
      ...snapshot,
      layers: complete
        ? await Promise.all(snapshot.layers.map((layer) => encodeLayer(layer, 'snapshot')))
        : snapshot.layers.map((layer) => ({ ...layer, bitmap: null, mask: null })),
      hasSelection: complete ? snapshot.hasSelection : false,
      selectionMask: complete ? encodeSelection(snapshot.selectionMask, 'snapshot-selection') : null,
      selectionMaskData: undefined,
      pixelState: complete ? 'complete' as const : 'unavailable' as const,
      ...(complete
        ? { integrity: buildImageDocumentSnapshotIntegrity(snapshot.layers, snapshot.selectionMask) }
        : {}),
    };
  }));

  // The container itself is the editable layered save baseline. Do not persist the live
  // pre-save warning into a file that has just been saved successfully.
  const documentManifest = {
    ...doc,
    dirty: false,
    layers: mappedLayers,
    snapshots: mappedSnapshots,
    hasSelection: persistLiveSelection,
    selectionMask: encodeSelection(persistLiveSelection ? liveSelection : undefined, 'document-selection'),
    selectionMaskData: undefined,
  };

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
    try {
      if (rawLayer.bitmap !== null && rawLayer.bitmap !== undefined && !isAssetRef(rawLayer.bitmap)) {
        throw new Error('.slimg invalid bitmap asset reference');
      }
      if (isAssetRef(rawLayer.bitmap)) {
        const ref = rawLayer.bitmap;
        const data = assets.get(ref.asset);
        if (!data) throw new Error('.slimg missing asset ' + ref.asset);
        bitmap = await codec.decode(data, ref.width, ref.height);
        if (bitmap.width !== ref.width || bitmap.height !== ref.height) {
          throw new Error('.slimg decoded bitmap dimensions do not match ' + ref.asset);
        }
      }

      if (rawLayer.mask !== null && rawLayer.mask !== undefined && !isAssetRef(rawLayer.mask)) {
        throw new Error('.slimg invalid mask asset reference');
      }
      if (isAssetRef(rawLayer.mask)) {
        const ref = rawLayer.mask;
        const data = assets.get(ref.asset);
        if (!data) throw new Error('.slimg missing asset ' + ref.asset);
        mask = await codec.decode(data, ref.width, ref.height);
        if (mask.width !== ref.width || mask.height !== ref.height) {
          throw new Error('.slimg decoded mask dimensions do not match ' + ref.asset);
        }
      }

      return { ...rawLayer, bitmap, mask } as unknown as ImageLayer;
    } catch (error) {
      for (const decoded of new Set([bitmap, mask].filter((value): value is LayerBitmap => Boolean(value)))) {
        if (decoded.width !== 0 || decoded.height !== 0) {
          decoded.width = 0;
          decoded.height = 0;
        }
      }
      throw error;
    }
  };

  const decodeSelection = (raw: unknown): SelectionMaskSnapshot | undefined => {
    if (raw === null || raw === undefined) return undefined;
    if (!isAssetRef(raw)) throw new Error('.slimg invalid selection asset reference');
    const data = assets.get(raw.asset);
    if (!data) throw new Error('.slimg missing asset ' + raw.asset);
    if (raw.width <= 0 || raw.height <= 0 || data.byteLength !== raw.width * raw.height) {
      throw new Error('.slimg selection dimensions do not match ' + raw.asset);
    }
    return { width: raw.width, height: raw.height, data: new Uint8ClampedArray(data) };
  };

  const unavailableSnapshot = (
    rawSnapshot: Record<string, unknown>,
    rawLayers: Record<string, unknown>[],
    index: number,
  ): ImageDocumentSnapshot => ({
    ...rawSnapshot,
    id: typeof rawSnapshot.id === 'string' ? rawSnapshot.id : `image-snapshot-${index}`,
    layers: rawLayers.map((layer) => ({ ...layer, bitmap: null, mask: null })) as ImageLayer[],
    hasSelection: false,
    selectionMask: undefined,
    selectionMaskData: undefined,
    pixelState: 'unavailable',
  } as ImageDocumentSnapshot);

  const restoredLayers: ImageLayer[] = [];
  const restoredSnapshots: ImageDocumentSnapshot[] = [];
  try {
    for (const rawLayer of rawDoc.layers) restoredLayers.push(await decodeLayer(rawLayer));
    for (const [index, rawSnapshot] of (rawDoc.snapshots ?? []).entries()) {
      const rawLayers = Array.isArray(rawSnapshot.layers)
        ? rawSnapshot.layers.filter((layer): layer is Record<string, unknown> => typeof layer === 'object' && layer !== null)
        : [];
      const pixelState = rawSnapshot.pixelState === 'complete' ? 'complete' : 'unavailable';
      if (
        pixelState !== 'complete'
        || typeof rawSnapshot.integrity !== 'object'
        || rawSnapshot.integrity === null
        || (rawSnapshot.integrity as { version?: unknown }).version !== 2
      ) {
        restoredSnapshots.push(unavailableSnapshot(rawSnapshot, rawLayers, index));
        continue;
      }
      const decodedLayers: ImageLayer[] = [];
      try {
        for (const rawLayer of rawLayers) decodedLayers.push(await decodeLayer(rawLayer));
        const decoded = {
          ...rawSnapshot,
          id: typeof rawSnapshot.id === 'string' ? rawSnapshot.id : `image-snapshot-${index}`,
          layers: decodedLayers,
          selectionMask: decodeSelection(rawSnapshot.selectionMask),
          selectionMaskData: undefined,
          pixelState: 'complete' as const,
        } as ImageDocumentSnapshot;
        if (!inspectImageDocumentSnapshotIntegrity(decoded).complete) {
          throw new Error('.slimg snapshot integrity proof failed');
        }
        restoredSnapshots.push(markImageDocumentSnapshotOwned(decoded));
      } catch (error) {
        const unique = new Set<LayerBitmap>();
        for (const layer of decodedLayers) {
          if (layer.bitmap) unique.add(layer.bitmap);
          if (layer.mask) unique.add(layer.mask);
        }
        for (const bitmap of unique) {
          if (bitmap.width !== 0 || bitmap.height !== 0) {
            bitmap.width = 0;
            bitmap.height = 0;
          }
        }
        throw new Error('.slimg snapshot content integrity verification failed', { cause: error });
      }
    }
    const selectionMask = decodeSelection(rawDoc.selectionMask);
    const hasSelection = Boolean(
      rawDoc.hasSelection
      && selectionMask
      && selectionMask.width === rawDoc.width
      && selectionMask.height === rawDoc.height
      && selectionMask.data.some((value) => value !== 0),
    );

    return {
      ...rawDoc,
      layers: restoredLayers,
      snapshots: restoredSnapshots,
      hasSelection,
      selectionMask: hasSelection ? selectionMask : undefined,
      selectionMaskData: undefined,
    } as unknown as ImageDocument;
  } catch (error) {
    for (const snapshot of restoredSnapshots) disposeImageDocumentSnapshotResources(snapshot);
    const unique = new Set<LayerBitmap>();
    for (const layer of restoredLayers) {
      if (layer.bitmap) unique.add(layer.bitmap);
      if (layer.mask) unique.add(layer.mask);
    }
    for (const bitmap of unique) {
      if (bitmap.width !== 0 || bitmap.height !== 0) {
        bitmap.width = 0;
        bitmap.height = 0;
      }
    }
    throw error;
  }
}
