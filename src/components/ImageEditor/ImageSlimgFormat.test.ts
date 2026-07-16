import { describe, expect, it } from 'vitest';
import { deserializeSlimg, serializeSlimg, type SlimgCodec } from './ImageSlimgFormat';
import type { ImageDocument, LayerBitmap } from '../../types/imageEditor';
import { buildImageDocumentSnapshotIntegrity } from './ImageSnapshots';

// A fake LayerBitmap: only width/height matter to the serializer. We tag it for round-trip checks.
function fakeBitmap(width: number, height: number, tag: string): LayerBitmap {
  return { width, height, __tag: tag } as unknown as LayerBitmap;
}
const codec: SlimgCodec = {
  // encode: store the tag as UTF-8 bytes so we can assert the round-trip carried the right pixels
  encode: async (b) => new TextEncoder().encode((b as unknown as { __tag: string }).__tag),
  decode: async (bytes, width, height) =>
    ({ width, height, __tag: new TextDecoder().decode(bytes) } as unknown as LayerBitmap),
};

function doc(): ImageDocument {
  return {
    id: 'doc1', name: 'Doc', width: 64, height: 48,
    activeLayerId: 'a',
    layers: [
      { id: 'a', name: 'Painted', type: 'image', visible: true, opacity: 0.5,
        bitmap: fakeBitmap(64, 48, 'A-PIX'), mask: fakeBitmap(64, 48, 'A-MASK') },
      { id: 'b', name: 'Empty', type: 'image', visible: true, opacity: 1,
        bitmap: null, mask: null },
    ],
  } as unknown as ImageDocument;
}

describe('ImageSlimgFormat', () => {
  it('round-trips a document: structure preserved, bitmaps/masks carried as assets', async () => {
    const bytes = await serializeSlimg(doc(), codec);
    const out = await deserializeSlimg(bytes, codec);
    expect(out.width).toBe(64);
    expect(out.height).toBe(48);
    expect(out.activeLayerId).toBe('a');
    expect(out.layers).toHaveLength(2);
    expect(out.layers[0].name).toBe('Painted');
    expect(out.layers[0].opacity).toBe(0.5);
    expect((out.layers[0].bitmap as unknown as { __tag: string }).__tag).toBe('A-PIX');
    expect((out.layers[0].mask as unknown as { __tag: string }).__tag).toBe('A-MASK');
    expect(out.layers[0].bitmap!.width).toBe(64);
    expect(out.layers[1].bitmap).toBeNull();
    expect(out.layers[1].mask).toBeNull();
  });

  it('writes a clean editable baseline without mutating the live dirty document', async () => {
    const live = { ...doc(), dirty: true };

    const bytes = await serializeSlimg(live, codec);
    const out = await deserializeSlimg(bytes, codec);

    expect(out.dirty).toBe(false);
    expect(live.dirty).toBe(true);
  });

  it('round-trips complete named snapshot bitmap and mask assets', async () => {
    const live = doc();
    const snapshotLayers = [{
      ...live.layers[0],
      bitmap: fakeBitmap(64, 48, 'SNAPSHOT-PIX'),
      mask: fakeBitmap(64, 48, 'SNAPSHOT-MASK'),
    }];
    live.snapshots = [{
      id: 'snapshot-red',
      name: 'Red state',
      createdAt: 1,
      width: 64,
      height: 48,
      layers: snapshotLayers,
      activeLayerId: 'a',
      hasSelection: false,
      selectionVersion: 0,
      pixelState: 'complete',
      integrity: buildImageDocumentSnapshotIntegrity(snapshotLayers),
    }];

    const out = await deserializeSlimg(await serializeSlimg(live, codec), codec);

    expect(out.snapshots?.[0]?.pixelState).toBe('complete');
    expect((out.snapshots?.[0]?.layers[0]?.bitmap as unknown as { __tag: string }).__tag).toBe('SNAPSHOT-PIX');
    expect((out.snapshots?.[0]?.layers[0]?.mask as unknown as { __tag: string }).__tag).toBe('SNAPSHOT-MASK');
  });

  it('round-trips exact named-snapshot selection bytes as a native asset', async () => {
    const live = doc();
    const selectionMask = {
      width: 64,
      height: 48,
      data: new Uint8ClampedArray(64 * 48),
    };
    selectionMask.data.set([0, 7, 255, 31, 128], 19);
    const snapshotLayers = [{ ...live.layers[0], bitmap: fakeBitmap(64, 48, 'SELECTED-PIX') }];
    live.snapshots = [{
      id: 'snapshot-selection',
      name: 'Asymmetric selection',
      createdAt: 2,
      width: 64,
      height: 48,
      layers: snapshotLayers,
      activeLayerId: 'a',
      hasSelection: true,
      selectionVersion: 4,
      selectionMask,
      pixelState: 'complete',
      integrity: buildImageDocumentSnapshotIntegrity(snapshotLayers, selectionMask),
    }];

    const out = await deserializeSlimg(await serializeSlimg(live, codec), codec);

    expect(out.snapshots?.[0]?.pixelState).toBe('complete');
    expect(out.snapshots?.[0]?.selectionMask?.data).toEqual(selectionMask.data);
    expect(out.snapshots?.[0]?.selectionMask?.data).not.toBe(selectionMask.data);
  });

  it('fails claimed-complete native snapshots closed when an expected ref, dimensions, or selection asset is missing', async () => {
    const live = doc();
    const selectionMask = { width: 64, height: 48, data: new Uint8ClampedArray(64 * 48) };
    selectionMask.data[44] = 255;
    const snapshotLayers = [{ ...live.layers[0], bitmap: fakeBitmap(64, 48, 'PROVEN') }];
    live.snapshots = [{
      id: 'snapshot-corrupt', name: 'Corrupt me', createdAt: 3, width: 64, height: 48,
      layers: snapshotLayers, activeLayerId: 'a', hasSelection: true, selectionVersion: 1,
      selectionMask, pixelState: 'complete',
      integrity: buildImageDocumentSnapshotIntegrity(snapshotLayers, selectionMask),
    }];
    const { unpackContainer, packContainer } = await import('../../shared/files/SignalLoomContainer');
    const packed = await serializeSlimg(live, codec);
    const { manifest, assets } = unpackContainer(packed);

    const mutateAndOpen = async (mutate: (snapshot: Record<string, unknown>) => void) => {
      const cloned = JSON.parse(JSON.stringify(manifest)) as typeof manifest;
      const document = cloned.document as { snapshots: Array<Record<string, unknown>> };
      mutate(document.snapshots[0]);
      return deserializeSlimg(packContainer(cloned, assets), codec);
    };

    const stripped = await mutateAndOpen((snapshot) => {
      (snapshot.layers as Array<Record<string, unknown>>)[0].bitmap = null;
    });
    expect(stripped.snapshots?.[0]?.pixelState).toBe('unavailable');
    expect(stripped.snapshots?.[0]?.layers[0].bitmap).toBeNull();

    const wrongDimensions = await mutateAndOpen((snapshot) => {
      ((snapshot.layers as Array<Record<string, unknown>>)[0].bitmap as { width: number }).width = 63;
    });
    expect(wrongDimensions.snapshots?.[0]?.pixelState).toBe('unavailable');

    const missingSelection = await mutateAndOpen((snapshot) => {
      snapshot.selectionMask = null;
    });
    expect(missingSelection.snapshots?.[0]?.pixelState).toBe('unavailable');
    expect(missingSelection.snapshots?.[0]?.hasSelection).toBe(false);
  });

  it('deduplicates shared bitmap identities in the native asset table', async () => {
    const live = doc();
    const shared = fakeBitmap(64, 48, 'SHARED');
    live.layers[0].bitmap = shared;
    live.layers[0].mask = shared;

    const { unpackContainer } = await import('../../shared/files/SignalLoomContainer');
    const packed = await serializeSlimg(live, codec);
    const { manifest, assets } = unpackContainer(packed);

    expect(manifest.assets).toHaveLength(1);
    expect(assets.size).toBe(1);
  });

  it('rejects a non-.slimg container', async () => {
    // Build a valid container of a different format via the container core directly.
    const { packContainer } = await import('../../shared/files/SignalLoomContainer');
    const foreign = packContainer({ format: 'signal-loom-paper', formatVersion: 1, kind: 'paper', document: {}, assets: [] }, new Map());
    await expect(deserializeSlimg(foreign, codec)).rejects.toThrow();
  });

  it('throws if an asset entry is missing', async () => {
    const bytes = await serializeSlimg(doc(), codec);
    const { unpackContainer, packContainer } = await import('../../shared/files/SignalLoomContainer');
    const { manifest } = unpackContainer(bytes);
    // repack WITHOUT the assets -> deref must fail
    const stripped = packContainer(manifest, new Map());
    await expect(deserializeSlimg(stripped, codec)).rejects.toThrow();
  });
});
