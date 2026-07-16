import { describe, expect, it } from 'vitest';
import {
  decodeImageDocumentSnapshotProjectPixels,
  decodeImageLayerProjectPixels,
  encodeImageDocumentSnapshotProjectPixels,
  encodeImageLayerProjectPixels,
  type ImageLayerPixelCodec,
} from './ImageLayerProjectPixels';
import type { ImageLayer, LayerBitmap } from '../../types/imageEditor';

// Fake bitmaps + a codec that maps bitmap<->string, so the round-trip wiring is tested without a
// real OffscreenCanvas backend (unavailable in the node test environment).
const fakeBitmap = (id: string): LayerBitmap => ({ __id: id } as unknown as LayerBitmap);
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

  it('handles an empty layer (no payload) and never throws on a corrupt payload', async () => {
    const empty = await encodeImageLayerProjectPixels(baseLayer(), stubCodec);
    expect(empty.bitmapData).toBeUndefined();
    expect(empty.maskData).toBeUndefined();

    const throwingCodec: ImageLayerPixelCodec = {
      encode: stubCodec.encode,
      decode: async () => { throw new Error('corrupt'); },
    };
    const decoded = await decodeImageLayerProjectPixels(baseLayer({ bitmapData: 'garbage' }), throwingCodec);
    expect(decoded.bitmap).toBeNull();
    expect(decoded.bitmapData).toBeUndefined();
  });

  it('round-trips complete named snapshot pixels and marks corrupt snapshot payloads unavailable', async () => {
    const snapshot = {
      id: 'snapshot-red',
      name: 'Red',
      createdAt: 1,
      width: 1,
      height: 1,
      layers: [baseLayer({ bitmap: fakeBitmap('red'), mask: fakeBitmap('mask') })],
      activeLayerId: 'layer-1',
      hasSelection: false,
      selectionVersion: 0,
      pixelState: 'complete' as const,
    };
    const encoded = await encodeImageDocumentSnapshotProjectPixels(snapshot, stubCodec);
    const decoded = await decodeImageDocumentSnapshotProjectPixels(
      JSON.parse(JSON.stringify(encoded)),
      stubCodec,
    );
    expect(decoded.pixelState).toBe('complete');
    expect(bitmapId(decoded.layers[0].bitmap)).toBe('red');
    expect(bitmapId(decoded.layers[0].mask)).toBe('mask');

    const corrupt = await decodeImageDocumentSnapshotProjectPixels(
      { ...encoded, layers: [{ ...encoded.layers[0], bitmapData: 'corrupt' }] },
      {
        encode: stubCodec.encode,
        decode: async (payload) => {
          if (payload === 'corrupt') throw new Error('bad payload');
          return stubCodec.decode(payload);
        },
      },
    );
    expect(corrupt.pixelState).toBe('unavailable');
  });
});
