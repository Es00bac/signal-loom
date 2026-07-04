import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ImageDocument, ImageLayer, LayerBitmap } from '../types/imageEditor';
import type { ImageDocumentNativeChange } from './imageDocumentNativeSync';

/**
 * Task #53, increment 3: the Image sync **channel** (policy layer). The pure op model, the store seam, and
 * the out-of-band transport each have their own tests; this verifies the channel that stitches them — that
 * an emit encodes a layer's pixels to the out-of-band store *before* publishing the pointer op, that an
 * inbound pointer op fetches + decodes + flips those pixels in, that a re-applied version is deduped, and
 * that `snapshot` pre-publishes every layer's bytes so a seeding client can fetch them.
 *
 * Canvas is replaced by an injected codec (`encode` → a tag string, `decode` → a sentinel) and an in-memory
 * asset map, so the round-trip runs under jsdom with no `OffscreenCanvas`.
 */

const h = vi.hoisted(() => ({ host: true }));

const notifyLanProjectChange = vi.fn<(channel: string, change: unknown) => void>();

vi.mock('./androidLanServer', () => ({
  isAndroidLanServerAvailable: () => h.host,
  notifyLanProjectChange: (channel: string, change: unknown) => notifyLanProjectChange(channel, change),
  setServedProjectMutationPublisher: () => undefined,
}));
vi.mock('./remoteHostClient', () => ({
  isServedLanSession: () => false,
  remoteHostFetch: vi.fn(),
}));
vi.mock('./projectSyncClient', () => ({
  ensureProjectSyncChannelStarted: vi.fn(async () => undefined),
}));

import { useImageEditorStore } from '../store/imageEditorStore';
import { getProjectSyncChannel } from './projectSyncService';
import {
  IMAGE_SYNC_CHANNEL,
  initializeImageSyncChannel,
  __resetImageSyncChannelForTests,
  __setImageSyncDepsForTests,
  __flushImageSyncEmitForTests,
} from './imageSyncChannel';

// Sentinel "bitmap" — identity/tag is all the fake codec and the assertions care about.
const fakeBitmap = (tag: string): LayerBitmap => ({ __tag: tag } as unknown as LayerBitmap);

const codec = {
  encode: async (bitmap: LayerBitmap) => `enc:${(bitmap as unknown as { __tag: string }).__tag}`,
  decode: async (url: string) => ({ __decoded: url } as unknown as LayerBitmap),
};

// In-memory stand-in for the out-of-band asset store, keyed `${channel}/${assetId}`.
const assets = new Map<string, string>();
const putAsset = vi.fn(async (channel: string, assetId: string, dataUrl: string) => {
  assets.set(`${channel}/${assetId}`, dataUrl);
});
const getAsset = vi.fn(async (channel: string, assetId: string) => assets.get(`${channel}/${assetId}`) ?? null);

function makeLayer(id: string, patch: Partial<ImageLayer> = {}): ImageLayer {
  return {
    id,
    name: id,
    type: 'image',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    x: 0,
    y: 0,
    bitmap: fakeBitmap(`bitmap-${id}`),
    bitmapVersion: 1,
    mask: null,
    ...patch,
  };
}

function makeDocument(layers: ImageLayer[]): ImageDocument {
  return {
    id: 'doc-1',
    title: 'Doc',
    width: 64,
    height: 64,
    layers,
    activeLayerId: layers[0]?.id ?? null,
    hasSelection: false,
    selectionVersion: 0,
    viewport: { zoom: 1, panX: 0, panY: 0 },
    dirty: false,
  };
}

function openDoc(layers: ImageLayer[]): void {
  useImageEditorStore.setState({ documents: [], activeDocId: null });
  useImageEditorStore.getState().openDocument(makeDocument(layers));
}

const activeLayer = (id: string): ImageLayer => {
  const doc = useImageEditorStore.getState().getActiveDocument();
  const layer = doc?.layers.find((l) => l.id === id);
  if (!layer) throw new Error(`no layer ${id}`);
  return layer;
};

beforeEach(() => {
  __resetImageSyncChannelForTests();
  h.host = true;
  notifyLanProjectChange.mockClear();
  putAsset.mockClear();
  getAsset.mockClear();
  assets.clear();
  useImageEditorStore.setState({ documents: [], activeDocId: null });
});

describe('imageSyncChannel emit (outbound)', () => {
  it('PUTs a layer’s encoded pixels before publishing the pixel-pointer op', async () => {
    openDoc([makeLayer('a', { bitmapVersion: 1 })]);
    initializeImageSyncChannel();
    __setImageSyncDepsForTests({ codec, putAsset, getAsset });

    // Establish the baseline at v1, then simulate a local brush stroke committing v2 with new pixels.
    await __flushImageSyncEmitForTests();
    notifyLanProjectChange.mockClear();
    putAsset.mockClear();

    // The pointer op must only go out once its bytes are already in the store.
    let assetPresentAtPublish = false;
    notifyLanProjectChange.mockImplementation(() => {
      assetPresentAtPublish = assets.has(`${IMAGE_SYNC_CHANNEL}/a@2`);
    });

    useImageEditorStore.setState((state) => ({
      documents: state.documents.map((doc) =>
        doc.id === 'doc-1'
          ? { ...doc, layers: doc.layers.map((l) => (l.id === 'a' ? { ...l, bitmap: fakeBitmap('a2'), bitmapVersion: 2 } : l)) }
          : doc,
      ),
    }));
    await __flushImageSyncEmitForTests();

    expect(putAsset).toHaveBeenCalledWith(IMAGE_SYNC_CHANNEL, 'a@2', 'enc:a2');
    expect(assets.get(`${IMAGE_SYNC_CHANNEL}/a@2`)).toBe('enc:a2');
    const op = notifyLanProjectChange.mock.calls.at(-1)?.[1] as ImageDocumentNativeChange;
    expect(op).toMatchObject({ type: 'image-layer-pixels-updated', layerId: 'a', bitmapVersion: 2, hasBitmap: true, hasMask: false });
    expect(assetPresentAtPublish).toBe(true); // bytes-before-pointer ordering
  });

  it('does not emit from a served client until it has synced once (canEmit gate)', async () => {
    h.host = false; // not the authority
    openDoc([makeLayer('a')]);
    initializeImageSyncChannel();
    __setImageSyncDepsForTests({ codec, putAsset, getAsset });

    useImageEditorStore.setState((state) => ({
      documents: state.documents.map((doc) =>
        doc.id === 'doc-1'
          ? { ...doc, layers: doc.layers.map((l) => ({ ...l, bitmap: fakeBitmap('a2'), bitmapVersion: 2 })) }
          : doc,
      ),
    }));
    await __flushImageSyncEmitForTests();

    expect(notifyLanProjectChange).not.toHaveBeenCalled();
    expect(putAsset).not.toHaveBeenCalled();
  });
});

describe('imageSyncChannel apply (inbound)', () => {
  it('fetches + decodes out-of-band bytes and flips a layer’s pixels in', async () => {
    openDoc([makeLayer('a', { bitmapVersion: 1 })]);
    initializeImageSyncChannel();
    __setImageSyncDepsForTests({ codec, putAsset, getAsset });
    assets.set(`${IMAGE_SYNC_CHANNEL}/a@2`, 'enc:a2'); // host already PUT these bytes

    const channel = getProjectSyncChannel(IMAGE_SYNC_CHANNEL)!;
    const change: ImageDocumentNativeChange = {
      type: 'image-layer-pixels-updated', layerId: 'a', bitmapVersion: 2, hasBitmap: true, hasMask: false,
    };
    const changed = await channel.applyRemote(change);

    expect(changed).toBe(true);
    expect(getAsset).toHaveBeenCalledWith(IMAGE_SYNC_CHANNEL, 'a@2');
    const layer = activeLayer('a');
    expect(layer.bitmapVersion).toBe(2);
    expect(layer.bitmap).toEqual({ __decoded: 'enc:a2' });

    // Re-applying the same version is deduped — no second fetch, reported as no change.
    getAsset.mockClear();
    const again = await channel.applyRemote(change);
    expect(again).toBe(false);
    expect(getAsset).not.toHaveBeenCalled();
  });
});

describe('imageSyncChannel snapshot (seed)', () => {
  it('pre-publishes every layer’s bytes so a seeding client can fetch them', async () => {
    openDoc([
      makeLayer('a', { bitmapVersion: 3 }),
      makeLayer('b', { bitmapVersion: 5, mask: fakeBitmap('mask-b') }),
    ]);
    initializeImageSyncChannel();
    __setImageSyncDepsForTests({ codec, putAsset, getAsset });

    const channel = getProjectSyncChannel(IMAGE_SYNC_CHANNEL)!;
    const snap = (await channel.snapshot()) as Extract<ImageDocumentNativeChange, { type: 'image-document-snapshot' }>;

    expect(snap.type).toBe('image-document-snapshot');
    expect(snap.document.layers.map((l) => l.id)).toEqual(['a', 'b']);
    expect(assets.get(`${IMAGE_SYNC_CHANNEL}/a@3`)).toBe('enc:bitmap-a');
    expect(assets.get(`${IMAGE_SYNC_CHANNEL}/b@5`)).toBe('enc:bitmap-b');
    expect(assets.get(`${IMAGE_SYNC_CHANNEL}/b@5:mask`)).toBe('enc:mask-b');
  });
});

// Owner bug (2026-07-03, note 819): a served client with no document open silently dropped the
// authority's seed forever, and one with a DIFFERENT document open had its layers wiped by
// blind-activeDocId reconciliation. Snapshots must create-or-target by wire id; granular ops
// target the tracked synced document; a promised-but-unfetchable pixel never nulls a live bitmap.
describe('imageSyncChannel remote-document targeting (note 819)', () => {
  it('creates the authority document on a client with none open (and shows it)', async () => {
    initializeImageSyncChannel();
    __setImageSyncDepsForTests({ codec, putAsset, getAsset });
    const channel = getProjectSyncChannel(IMAGE_SYNC_CHANNEL)!;
    useImageEditorStore.setState({ documents: [], activeDocId: null, syncedImageDocumentId: null });

    const { toImageDocumentWire } = await import('./imageDocumentNativeSync');
    const wire = toImageDocumentWire(makeDocument([makeLayer('layer-a')]));
    assets.set(`${IMAGE_SYNC_CHANNEL}/layer-a@1`, 'enc:bitmap-layer-a');

    const changed = await channel.applyRemote({ type: 'image-document-snapshot', document: wire });

    expect(changed).toBe(true);
    const state = useImageEditorStore.getState();
    expect(state.documents.map((d) => d.id)).toEqual(['doc-1']);
    expect(state.activeDocId).toBe('doc-1');
    expect(state.syncedImageDocumentId).toBe('doc-1');
    expect(state.documents[0].layers.map((l) => l.id)).toEqual(['layer-a']);
    // pixels arrived out-of-band and flipped in
    expect((state.documents[0].layers[0].bitmap as unknown as { __decoded: string }).__decoded)
      .toBe('enc:bitmap-layer-a');
  });

  it('never wipes an unrelated open document (ops target the synced id, not the active doc)', async () => {
    initializeImageSyncChannel();
    __setImageSyncDepsForTests({ codec, putAsset, getAsset });
    const channel = getProjectSyncChannel(IMAGE_SYNC_CHANNEL)!;

    // The user is editing their OWN document (different id) on this client.
    useImageEditorStore.setState({ documents: [], activeDocId: null, syncedImageDocumentId: null });
    useImageEditorStore.getState().openDocument({
      ...makeDocument([makeLayer('mine-1')]),
      id: 'doc-local',
      title: 'My local doc',
    });

    const { toImageDocumentWire } = await import('./imageDocumentNativeSync');
    const wire = toImageDocumentWire(makeDocument([makeLayer('layer-a')]));
    await channel.applyRemote({ type: 'image-document-snapshot', document: wire });
    await channel.applyRemote({ type: 'image-layer-removed', layerId: 'mine-1' });

    const state = useImageEditorStore.getState();
    const local = state.documents.find((d) => d.id === 'doc-local')!;
    // local document untouched: still active, layers intact
    expect(state.activeDocId).toBe('doc-local');
    expect(local.layers.map((l) => l.id)).toEqual(['mine-1']);
    // the authority's doc exists alongside, tracked as the synced target
    expect(state.documents.some((d) => d.id === 'doc-1')).toBe(true);
    expect(state.syncedImageDocumentId).toBe('doc-1');
  });

  it('does not null a live bitmap when the promised out-of-band bytes are unavailable', async () => {
    initializeImageSyncChannel();
    __setImageSyncDepsForTests({ codec, putAsset, getAsset });
    const channel = getProjectSyncChannel(IMAGE_SYNC_CHANNEL)!;
    useImageEditorStore.setState({ documents: [], activeDocId: null, syncedImageDocumentId: null });

    const { toImageDocumentWire } = await import('./imageDocumentNativeSync');
    const wire = toImageDocumentWire(makeDocument([makeLayer('layer-a')]));
    assets.set(`${IMAGE_SYNC_CHANNEL}/layer-a@1`, 'enc:bitmap-layer-a');
    await channel.applyRemote({ type: 'image-document-snapshot', document: wire });
    const before = useImageEditorStore.getState().documents[0].layers[0].bitmap;
    expect(before).not.toBeNull();

    // a pixel pointer for a version whose bytes never arrive (asset store empty for @2)
    await channel.applyRemote({
      type: 'image-layer-pixels-updated',
      layerId: 'layer-a',
      bitmapVersion: 2,
      hasBitmap: true,
      hasMask: false,
    });

    const after = useImageEditorStore.getState().documents[0].layers[0];
    expect(after.bitmap).toBe(before); // untouched, not nulled
    expect(after.bitmapVersion).toBe(1); // version not advanced past the pixels we hold
  });
});

describe('imageSyncChannel document-switch broadcast (note 819)', () => {
  it('publishes a full snapshot (pixels first) when the authority opens a different document', async () => {
    initializeImageSyncChannel();
    __setImageSyncDepsForTests({ codec, putAsset, getAsset });

    openDoc([makeLayer('layer-a')]); // baseline document
    await __flushImageSyncEmitForTests();
    notifyLanProjectChange.mockClear();
    putAsset.mockClear();

    // The authority opens a DIFFERENT document (the owner's pair-first, draw-second flow).
    useImageEditorStore.getState().openDocument({
      ...makeDocument([makeLayer('layer-b')]),
      id: 'doc-2',
      title: 'Second doc',
    });
    await __flushImageSyncEmitForTests();

    const snapshotCall = notifyLanProjectChange.mock.calls.find(
      ([, change]) => (change as { type: string }).type === 'image-document-snapshot',
    );
    expect(snapshotCall).toBeTruthy();
    const wire = (snapshotCall![1] as { document: { id: string; layers: Array<{ id: string }> } }).document;
    expect(wire.id).toBe('doc-2');
    expect(wire.layers.map((l) => l.id)).toEqual(['layer-b']);
    // pixels published before the pointer op, under the content-addressed id
    expect(putAsset).toHaveBeenCalledWith(IMAGE_SYNC_CHANNEL, 'layer-b@1', 'enc:bitmap-layer-b');
  });
});
