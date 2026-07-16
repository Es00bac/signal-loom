import { describe, expect, it } from 'vitest';
import { deserializeSlimg, serializeSlimg, type SlimgCodec } from './ImageSlimgFormat';
import type { ImageDocument, LayerBitmap } from '../../types/imageEditor';

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
