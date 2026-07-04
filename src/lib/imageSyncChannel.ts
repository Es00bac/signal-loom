import { useImageEditorStore } from '../store/imageEditorStore';
import { isAndroidLanServerAvailable, notifyLanProjectChange } from './androidLanServer';
import { isServedLanSession } from './remoteHostClient';
import { ensureProjectSyncChannelStarted } from './projectSyncClient';
import { registerProjectSyncChannel, type ProjectSyncChannel } from './projectSyncService';
import { getProjectSyncAsset, putProjectSyncAsset } from './projectSyncAssets';
import {
  diffImageDocumentNativeChanges,
  toImageDocumentWire,
  type ImageDocumentNativeChange,
  type ImageDocumentWire,
} from './imageDocumentNativeSync';
import {
  defaultImageLayerPixelCodec,
  type ImageLayerPixelCodec,
} from '../components/ImageEditor/ImageLayerProjectPixels';
import type { ImageDocument } from '../types/imageEditor';

/**
 * Image workspace's seat on the unified cross-device op-sync (task #53; design `docs/notes/768`). The
 * **policy** layer wiring the pure op model ([[imageDocumentNativeSync]]) and the live store
 * (`imageEditorStore`) to the shared transport ([[projectSyncService]] + `androidLanServer` +
 * `projectSyncClient`). The Image analog of [[flowSyncChannel]] / [[paperSyncChannel]] — but with the one
 * structural difference that makes Image the hard channel: **a layer's pixels are a live multi-MB
 * `OffscreenCanvas`, non-serializable, so they cannot ride inside the JSON op.**
 *
 * The split (note 768):
 *  - The JSON op stream carries only a pixel **pointer** — `image-layer-pixels-updated` is
 *    `{ layerId, bitmapVersion, hasBitmap, hasMask }`, no bytes.
 *  - The bytes travel **out-of-band**, content-addressed by `${layerId}@${bitmapVersion}` (and a
 *    `:mask` sibling), over [[projectSyncAssets]] (`PUT`/`GET /project/image/asset/:assetId`). Because the
 *    key is the content version, a receiver decodes a given version at most once.
 *
 *  - **Emit (outbound):** one passive `useImageEditorStore.subscribe` that diffs the active document's
 *    canvas-free wire after store changes; for each pixel-bearing op it first encodes + PUTs the layer's
 *    live bitmap/mask, **then** publishes the pointer op (bytes-before-pointer, so a fast receiver always
 *    finds them). Coalesced like Paper — a brush stroke commits a burst of per-move store writes, collapsed
 *    into the final frame plus a max-wait for liveness.
 *  - **Apply (inbound):** `applyRemote` first runs the structural/metadata op through
 *    `applyRemoteImageDocumentChange` (which preserves each surviving layer's live `OffscreenCanvas` by id
 *    and creates null shells for new/seeded layers), then fetches + decodes the out-of-band bytes for each
 *    pixel target and flips them in atomically via `applyRemoteLayerPixels`.
 *  - **Seed:** `snapshot` publishes every current layer's bytes to the out-of-band store *before* returning
 *    the wire, so a freshly-connecting client can fetch them (the host may have loaded the doc from disk and
 *    never drawn, so nothing would be cached otherwise).
 *
 * Echo-loop + authority safety (identical to Flow/Paper):
 *  - `applyingRemote` suppresses the emit our own `applyRemote` provokes.
 *  - `canEmit` starts true only on the phone authority; a served client stays mute until it has applied its
 *    first remote op (the seed), so it can never push its stale local document over the phone's on connect.
 */

export const IMAGE_SYNC_CHANNEL = 'image';

/** Trailing-debounce window — collapses the per-pointer-move writes of a brush stroke into one emit. */
const EMIT_COALESCE_MS = 90;
/** …but never hold a sustained stroke longer than this before streaming an interim op (liveness). */
const EMIT_MAX_WAIT_MS = 220;

/** True while we are applying a remote op — the emit subscription must not re-broadcast it. */
let applyingRemote = false;
/** A served client only earns the right to emit after it has synced from the authority once. */
let canEmit = false;
/** Baseline wire document the subscription diffs against; null until the first observation. */
let lastDocument: ImageDocumentWire | null = null;
let initialized = false;
/** Pending coalesced-emit timer + when the current pending burst began (for the max-wait). */
let emitTimer: ReturnType<typeof setTimeout> | null = null;
let firstPendingAt = 0;
/** Per-layer version we have already decoded inbound, so a re-seed never re-fetches a held version. */
const appliedVersionByLayer = new Map<string, number>();

/** Injectable so the round-trip can be unit-tested without a real canvas backend. */
let codec: ImageLayerPixelCodec = defaultImageLayerPixelCodec;
let putAsset = putProjectSyncAsset;
let getAsset = getProjectSyncAsset;

const bitmapAssetId = (layerId: string, version: number): string => `${layerId}@${version}`;
const maskAssetId = (layerId: string, version: number): string => `${layerId}@${version}:mask`;

function activeDocument(): ImageDocument | null {
  return useImageEditorStore.getState().getActiveDocument() ?? null;
}

function currentWire(): ImageDocumentWire | null {
  const doc = activeDocument();
  return doc ? toImageDocumentWire(doc) : null;
}

/** Cheap predicate: does this client participate in project sync at all? Keeps non-sync sessions free. */
function isImageSyncActive(): boolean {
  return isAndroidLanServerAvailable() || isServedLanSession();
}

/** The layers whose out-of-band pixels an op implies (added layer, pixel update, or a full snapshot). */
type PixelTarget = { layerId: string; version: number; hasBitmap: boolean; hasMask: boolean };

function pixelTargets(change: ImageDocumentNativeChange): PixelTarget[] {
  switch (change.type) {
    case 'image-layer-pixels-updated':
      return [{ layerId: change.layerId, version: change.bitmapVersion, hasBitmap: change.hasBitmap, hasMask: change.hasMask }];
    case 'image-layer-added':
      return change.layer.hasBitmap || change.layer.hasMask
        ? [{ layerId: change.layer.id, version: change.layer.bitmapVersion, hasBitmap: change.layer.hasBitmap, hasMask: change.layer.hasMask }]
        : [];
    case 'image-document-snapshot':
      return change.document.layers
        .filter((layer) => layer.hasBitmap || layer.hasMask)
        .map((layer) => ({ layerId: layer.id, version: layer.bitmapVersion, hasBitmap: layer.hasBitmap, hasMask: layer.hasMask }));
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------------------------------
// Emit (outbound): diff → encode + PUT bytes → publish pointer op
// ---------------------------------------------------------------------------------------------------

/** Encode + PUT a layer's live bitmap/mask under their content-addressed ids (no-op if buffers absent). */
async function publishLayerAssets(doc: ImageDocument, target: PixelTarget): Promise<void> {
  const layer = doc.layers.find((l) => l.id === target.layerId);
  if (!layer) return;
  if (target.hasBitmap && layer.bitmap) {
    await putAsset(IMAGE_SYNC_CHANNEL, bitmapAssetId(target.layerId, target.version), await codec.encode(layer.bitmap));
  }
  if (target.hasMask && layer.mask) {
    await putAsset(IMAGE_SYNC_CHANNEL, maskAssetId(target.layerId, target.version), await codec.encode(layer.mask));
  }
}

function clearPendingEmit(): void {
  if (emitTimer) {
    clearTimeout(emitTimer);
    emitTimer = null;
  }
  firstPendingAt = 0;
}

/**
 * Diff the live document against the baseline and push the minimal ops, encoding+PUTting each pixel op's
 * bytes BEFORE publishing its pointer (so a receiver fetching on the op always finds them). Async, but the
 * baseline + `lastDocument` advance synchronously up front so a concurrent store change can't interleave a
 * stale diff. Resets the coalescer.
 */
async function flushEmit(): Promise<void> {
  clearPendingEmit();
  const liveDoc = activeDocument();
  if (!canEmit || !isImageSyncActive() || !liveDoc) {
    lastDocument = liveDoc ? toImageDocumentWire(liveDoc) : null;
    return;
  }
  const next = toImageDocumentWire(liveDoc);
  // A document switch (different id) is not a delta — reset the baseline rather than emit a remove-all/add-all.
  if (lastDocument === null || lastDocument.id !== next.id) {
    lastDocument = next;
    return;
  }
  const ops = diffImageDocumentNativeChanges(lastDocument, next);
  lastDocument = next;
  for (const op of ops) {
    for (const target of pixelTargets(op)) await publishLayerAssets(liveDoc, target);
    notifyLanProjectChange(IMAGE_SYNC_CHANNEL, op);
  }
}

/** Schedule a coalesced emit: debounce by EMIT_COALESCE_MS, but never wait past EMIT_MAX_WAIT_MS. */
function scheduleEmit(): void {
  const now = Date.now();
  if (!firstPendingAt) firstPendingAt = now;
  if (emitTimer) clearTimeout(emitTimer);
  const delay = Math.max(0, Math.min(EMIT_COALESCE_MS, EMIT_MAX_WAIT_MS - (now - firstPendingAt)));
  emitTimer = setTimeout(() => void flushEmit(), delay);
}

function handleStoreChange(): void {
  if (applyingRemote) {
    // We just synced from the authority. From now on our edits are safe to push, and the baseline must
    // track the applied state so the next user edit diffs against it. Drop any pending local emit.
    canEmit = true;
    lastDocument = currentWire();
    clearPendingEmit();
    return;
  }
  if (!canEmit || !isImageSyncActive()) return;
  scheduleEmit();
}

// ---------------------------------------------------------------------------------------------------
// Apply (inbound): structural op → fetch + decode out-of-band bytes → flip pixels in
// ---------------------------------------------------------------------------------------------------

/** Fetch + decode a target's out-of-band bytes and atomically flip them into the live layer. */
async function applyInboundPixels(target: PixelTarget): Promise<boolean> {
  if (appliedVersionByLayer.get(target.layerId) === target.version) return false; // already hold this version
  let bitmap = null;
  let mask = null;
  if (target.hasBitmap) {
    const url = await getAsset(IMAGE_SYNC_CHANNEL, bitmapAssetId(target.layerId, target.version));
    if (url) { try { bitmap = await codec.decode(url); } catch { bitmap = null; } }
    // The op promised pixels we couldn't fetch/decode — do NOT flip a null over whatever the
    // layer currently shows; leave it for the retry the next op/seed provides.
    if (!bitmap) return false;
  }
  if (target.hasMask) {
    const url = await getAsset(IMAGE_SYNC_CHANNEL, maskAssetId(target.layerId, target.version));
    if (url) { try { mask = await codec.decode(url); } catch { mask = null; } }
    if (!mask) return false;
  }
  const changed = useImageEditorStore.getState().applyRemoteLayerPixels(target.layerId, {
    bitmap,
    mask,
    bitmapVersion: target.version,
  });
  if (changed) appliedVersionByLayer.set(target.layerId, target.version);
  return changed;
}

const imageChannel: ProjectSyncChannel<ImageDocumentNativeChange> = {
  id: IMAGE_SYNC_CHANNEL,
  async applyRemote(change) {
    applyingRemote = true;
    try {
      // 1. Structural/metadata: preserves surviving live bitmaps, null-shells the new/seeded layers.
      //    A pure pixel-pointer op skips this step entirely — applyRemoteLayerPixels flips the
      //    pixels AND the version in one set, so a layer never advertises a version whose bytes
      //    it doesn't hold (e.g. when the out-of-band fetch fails and we keep the old pixels).
      let changed = change.type === 'image-layer-pixels-updated'
        ? false
        : useImageEditorStore.getState().applyRemoteImageDocumentChange(change);
      // 2. Out-of-band pixels: fetch + decode + flip in for each target the op implies.
      for (const target of pixelTargets(change)) {
        if (await applyInboundPixels(target)) changed = true;
      }
      return changed;
    } finally {
      applyingRemote = false;
    }
  },
  async snapshot() {
    const doc = activeDocument();
    if (!doc) {
      return { type: 'image-document-snapshot', document: { layers: [] } as unknown as ImageDocumentWire };
    }
    // Ensure every current layer's bytes are in the out-of-band store so a seeding client can fetch them
    // (the host may have loaded this document from disk and never drawn — nothing cached otherwise).
    const wire = toImageDocumentWire(doc);
    for (const layer of wire.layers) {
      if (layer.hasBitmap || layer.hasMask) {
        await publishLayerAssets(doc, {
          layerId: layer.id,
          version: layer.bitmapVersion,
          hasBitmap: layer.hasBitmap,
          hasMask: layer.hasMask,
        });
      }
    }
    return { type: 'image-document-snapshot', document: wire };
  },
};

/**
 * Register the Image channel and wire its passive (coalesced) emit subscription. Idempotent. Called when
 * `imageEditorStore` loads (channel-init tied to the Image workspace being present, zero app-startup cost),
 * and it asks the client to begin syncing this channel if a served session is already paired.
 */
export function initializeImageSyncChannel(): void {
  if (initialized) return;
  initialized = true;

  registerProjectSyncChannel(imageChannel);
  canEmit = isAndroidLanServerAvailable();
  lastDocument = currentWire();
  useImageEditorStore.subscribe(handleStoreChange);

  void ensureProjectSyncChannelStarted(IMAGE_SYNC_CHANNEL);
}

/** Test-only: reset module state between cases. */
export function __resetImageSyncChannelForTests(): void {
  applyingRemote = false;
  canEmit = false;
  lastDocument = null;
  initialized = false;
  appliedVersionByLayer.clear();
  codec = defaultImageLayerPixelCodec;
  putAsset = putProjectSyncAsset;
  getAsset = getProjectSyncAsset;
  clearPendingEmit();
}

/** Test-only: inject a canvas-free codec + in-memory asset transport so the round-trip runs under jsdom. */
export function __setImageSyncDepsForTests(deps: {
  codec?: ImageLayerPixelCodec;
  putAsset?: typeof putProjectSyncAsset;
  getAsset?: typeof getProjectSyncAsset;
}): void {
  if (deps.codec) codec = deps.codec;
  if (deps.putAsset) putAsset = deps.putAsset;
  if (deps.getAsset) getAsset = deps.getAsset;
}

/** Test-only: force any pending coalesced emit to run now (bypasses the debounce timer). */
export async function __flushImageSyncEmitForTests(): Promise<void> {
  await flushEmit();
}
