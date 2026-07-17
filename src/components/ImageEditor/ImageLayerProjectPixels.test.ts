import { describe, expect, it } from 'vitest';
import {
  decodeImageDocumentSnapshotProjectPixels,
  decodeImageLayerProjectPixels,
  encodeImageDocumentSnapshotProjectPixels,
  encodeImageLayerProjectPixels,
  type ImageLayerPixelCodec,
} from './ImageLayerProjectPixels';
import type { ImageLayer, LayerBitmap } from '../../types/imageEditor';
import { buildImageDocumentSnapshotIntegrity } from './ImageSnapshots';

// Fake bitmaps + a codec that maps bitmap<->string, so the round-trip wiring is tested without a
// real OffscreenCanvas backend (unavailable in the node test environment).
const fakeBitmap = (id: string): LayerBitmap => ({
  __id: id,
  width: 1,
  height: 1,
  getContext: () => ({
    getImageData: () => ({
      width: 1,
      height: 1,
      data: new Uint8ClampedArray(
        Array.from({ length: 4 }, (_, index) => id.charCodeAt(index % id.length)),
      ),
    }),
  }),
} as unknown as LayerBitmap);
const bitmapId = (bitmap: LayerBitmap | null): string | null =>
  bitmap ? (bitmap as unknown as { __id: string }).__id : null;

const stubCodec: ImageLayerPixelCodec = {
  encode: async (bitmap) => `encoded:${bitmapId(bitmap)}`,
  decode: async (dataUrl) => fakeBitmap(dataUrl.replace('encoded:', '')),
};

function baseLayer(overrides: Partial<ImageLayer> = {}): ImageLayer {
  return {
    id: 'layer-1', name: 'Layer 1', type: 'raster', visible: true, locked: false,
    opacity: 1, blendMode: 'normal', x: 0, y: 0, bitmap: null, bitmapVersion: 0, mask: null,
    ...overrides,
  } as ImageLayer;
}

describe('image layer project pixels', () => {
  it('encodes live bitmap + mask into base64 payloads and nulls the live buffers', async () => {
    const encoded = await encodeImageLayerProjectPixels(
      baseLayer({ bitmap: fakeBitmap('px'), mask: fakeBitmap('mk') }),
      stubCodec,
    );
    expect(encoded.bitmap).toBeNull();
    expect(encoded.mask).toBeNull();
    expect(encoded.bitmapData).toBe('encoded:px');
    expect(encoded.maskData).toBe('encoded:mk');
  });

  it('round-trips pixels through JSON serialization — the active canvas survives save -> open', async () => {
    const encoded = await encodeImageLayerProjectPixels(
      baseLayer({ id: 'merged', bitmap: fakeBitmap('canvas'), mask: fakeBitmap('m') }),
      stubCodec,
    );
    const serialized = JSON.parse(JSON.stringify(encoded)) as ImageLayer; // disk round-trip
    const decoded = await decodeImageLayerProjectPixels(serialized, stubCodec);
    expect(bitmapId(decoded.bitmap)).toBe('canvas');
    expect(bitmapId(decoded.mask)).toBe('m');
    expect(decoded.bitmapData).toBeUndefined();
    expect(decoded.maskData).toBeUndefined();
  });

  it('handles an empty layer and throws on a corrupt live-layer payload', async () => {
    const empty = await encodeImageLayerProjectPixels(baseLayer(), stubCodec);
    expect(empty.bitmapData).toBeUndefined();
    expect(empty.maskData).toBeUndefined();

    const throwingCodec: ImageLayerPixelCodec = {
      encode: stubCodec.encode,
      decode: async () => { throw new Error('corrupt'); },
    };
    await expect(decodeImageLayerProjectPixels(
      baseLayer({ bitmapData: 'garbage' }),
      throwingCodec,
    )).rejects.toThrow('corrupt');
  });

  it('round-trips complete named snapshot pixels and rejects corrupt current-format payloads', async () => {
    const snapshotLayers = [baseLayer({ bitmap: fakeBitmap('red'), mask: fakeBitmap('mask') })];
    const snapshot = {
      id: 'snapshot-red',
      name: 'Red',
      createdAt: 1,
      width: 1,
      height: 1,
      layers: snapshotLayers,
      activeLayerId: 'layer-1',
      hasSelection: false,
      selectionVersion: 0,
      pixelState: 'complete' as const,
      integrity: buildImageDocumentSnapshotIntegrity(snapshotLayers),
    };
    const encoded = await encodeImageDocumentSnapshotProjectPixels(snapshot, stubCodec);
    const decoded = await decodeImageDocumentSnapshotProjectPixels(
      JSON.parse(JSON.stringify(encoded)),
      stubCodec,
    );
    expect(decoded.pixelState).toBe('complete');
    expect(bitmapId(decoded.layers[0].bitmap)).toBe('red');
    expect(bitmapId(decoded.layers[0].mask)).toBe('mask');

    await expect(decodeImageDocumentSnapshotProjectPixels(
      { ...encoded, layers: [{ ...encoded.layers[0], bitmapData: 'corrupt' }] },
      {
        encode: stubCodec.encode,
        decode: async (payload) => {
          if (payload === 'corrupt') throw new Error('bad payload');
          return stubCodec.decode(payload);
        },
      },
    )).rejects.toThrow(/integrity/i);
  });

  it('rejects stripped, dimension-mismatched, and selection-incomplete claimed-complete snapshots', async () => {
    const selectionMask = {
      width: 1,
      height: 1,
      data: new Uint8ClampedArray([211]),
    };
    const layers = [baseLayer({ bitmap: fakeBitmap('pixel') })];
    const encoded = await encodeImageDocumentSnapshotProjectPixels({
      id: 'snapshot-proof',
      name: 'Proof',
      createdAt: 1,
      width: 1,
      height: 1,
      layers,
      activeLayerId: 'layer-1',
      hasSelection: true,
      selectionVersion: 2,
      selectionMask,
      pixelState: 'complete',
      integrity: buildImageDocumentSnapshotIntegrity(layers, selectionMask),
    }, stubCodec);

    await expect(decodeImageDocumentSnapshotProjectPixels({
      ...encoded,
      layers: [{ ...encoded.layers[0], bitmapData: undefined }],
    }, stubCodec)).rejects.toThrow(/integrity/i);

    await expect(decodeImageDocumentSnapshotProjectPixels(encoded, {
      ...stubCodec,
      decode: async () => ({ width: 2, height: 1, __id: 'wrong' } as unknown as LayerBitmap),
    })).rejects.toThrow(/integrity/i);

    await expect(decodeImageDocumentSnapshotProjectPixels({
      ...encoded,
      selectionMaskData: undefined,
    }, stubCodec)).rejects.toThrow(/integrity/i);

    const legacyWithoutProof = await decodeImageDocumentSnapshotProjectPixels({
      ...encoded,
      integrity: undefined,
    }, stubCodec);
    expect(legacyWithoutProof.pixelState).toBe('unavailable');

    const legacyVersionOne = await decodeImageDocumentSnapshotProjectPixels({
      ...encoded,
      integrity: { ...encoded.integrity!, version: 1 } as unknown as typeof encoded.integrity,
    }, stubCodec);
    expect(legacyVersionOne.pixelState).toBe('unavailable');
    expect(legacyVersionOne.integrity?.version as number).toBe(1);
  });
});
