/**
 * Baton handoff document snapshots (owner report, 2026-07-03): drawing on the phone, releasing
 * control, and taking over in a served desktop browser showed an EMPTY Image workspace — the
 * baton is a pure lock, and open Image documents never traveled with it.
 *
 * Fix rides entirely on proven machinery: when THIS device loses the baton (release, yield, or
 * force-taken), every open Image document is serialized to layered .slimg bytes and saved into
 * the shared Source Library under the "Baton handoff" envelope with a per-document sourceKey —
 * so repeats replace in place, and the library's existing live sync carries it to the other
 * device. The gaining device's Image workspace offers "Continue" cards for fresh handoff items
 * and opens them with full layers via deserializeSlimg.
 */
import { useEditLockStore } from '../store/editLockStore';
import { useSourceBinStore, type SourceBinLibraryItem } from '../store/sourceBinStore';
import { getLocalDevice } from './deviceIdentity';

export const BATON_HANDOFF_ENVELOPE_ID = 'baton-handoff';
export const BATON_HANDOFF_ENVELOPE_LABEL = 'Baton handoff';
export const BATON_HANDOFF_SOURCE_KEY_PREFIX = 'baton-handoff:';
export const SLIMG_HANDOFF_MIME_TYPE = 'application/x-sloom-slimg';

/** Handoffs older than this stop being offered as "Continue" cards (still in the library). */
const HANDOFF_FRESHNESS_MS = 24 * 60 * 60 * 1000;

export function buildBatonHandoffSourceKey(documentId: string): string {
  return `${BATON_HANDOFF_SOURCE_KEY_PREFIX}${documentId}`;
}

export function bytesToDataUrl(bytes: Uint8Array, mimeType: string): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK));
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

export function dataUrlToBytes(dataUrl: string): Uint8Array | null {
  const comma = dataUrl.indexOf(',');
  if (comma < 0 || !dataUrl.slice(0, comma).includes('base64')) return null;
  try {
    const binary = atob(dataUrl.slice(comma + 1));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    return null;
  }
}

/** Library items that are fresh baton handoffs, newest first. */
export function listFreshBatonHandoffItems(
  items: SourceBinLibraryItem[],
  now = Date.now(),
): SourceBinLibraryItem[] {
  return items
    .filter((item) => item.sourceKey?.startsWith(BATON_HANDOFF_SOURCE_KEY_PREFIX)
      && now - item.createdAt < HANDOFF_FRESHNESS_MS)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Serialize every open Image document into the Source Library. Failures are logged, never
 * thrown — a broken snapshot must not block the baton transfer itself.
 */
async function captureImageHandoffSnapshots(): Promise<void> {
  try {
    const [{ useImageEditorStore }, { serializeSlimg }, { slimgPixelCodec }] = await Promise.all([
      import('../store/imageEditorStore'),
      import('../components/ImageEditor/ImageSlimgFormat'),
      import('../components/ImageEditor/ImageSlimgCodec'),
    ]);
    const documents = useImageEditorStore.getState().documents.slice(0, 8);
    for (const doc of documents) {
      try {
        // A document with no pixel-bearing layers is a shell (e.g. a not-yet-synced remote doc)
        // — snapshotting it would overwrite a good handoff with a hollow one.
        if (!doc.layers.some((layer) => layer.bitmap || layer.bitmapData)) continue;
        const bytes = await serializeSlimg(doc, slimgPixelCodec);
        // Re-handoffs must not stack the suffix onto an already-suffixed title.
        const baseTitle = (doc.title || 'Image').replace(/ — continue on another device/g, '');
        await useSourceBinStore.getState().addAssetItem({
          label: `${baseTitle} — continue on another device`,
          kind: 'image',
          mimeType: SLIMG_HANDOFF_MIME_TYPE,
          dataUrl: bytesToDataUrl(bytes, SLIMG_HANDOFF_MIME_TYPE),
          sourceKey: buildBatonHandoffSourceKey(doc.id),
          envelopeId: BATON_HANDOFF_ENVELOPE_ID,
          envelopeLabel: BATON_HANDOFF_ENVELOPE_LABEL,
        });
      } catch (error) {
        console.warn(`[baton-handoff] snapshot failed for "${doc.title}":`, error);
      }
    }
  } catch (error) {
    console.warn('[baton-handoff] snapshot pass failed:', error);
  }
}

/** Open a handoff item (layered) into the Image editor. Returns false when the bytes are gone. */
export async function openBatonHandoffItem(item: SourceBinLibraryItem): Promise<boolean> {
  try {
    if (!item.assetUrl) return false;
    // The item's bytes may live behind ANY url shape: a data: URL (fresh capture / served
    // hydrate), or a native/capacitor file URL on the device that persisted it. Resolve all.
    let bytes = item.assetUrl.startsWith('data:') ? dataUrlToBytes(item.assetUrl) : null;
    if (!bytes) {
      try {
        const response = await fetch(item.assetUrl);
        if (response.ok) bytes = new Uint8Array(await response.arrayBuffer());
      } catch {
        bytes = null;
      }
    }
    if (!bytes || bytes.length === 0) return false;
    const [{ useImageEditorStore }, { deserializeSlimg }, { slimgPixelCodec }] = await Promise.all([
      import('../store/imageEditorStore'),
      import('../components/ImageEditor/ImageSlimgFormat'),
      import('../components/ImageEditor/ImageSlimgCodec'),
    ]);
    const doc = await deserializeSlimg(bytes, slimgPixelCodec);
    // The handoff LABEL carries the suffix; the document title must not (double-suffix source).
    doc.title = doc.title.replace(/ — continue on another device/g, '');
    useImageEditorStore.getState().openDocument(doc);
    return true;
  } catch (error) {
    console.warn('[baton-handoff] open failed:', error);
    return false;
  }
}

let initialized = false;

/**
 * Watch baton transitions: the instant THIS device stops being the holder, capture snapshots.
 * (The capture is fire-and-forget and races nothing: the library add + its broadcast work the
 * same whether we still hold the baton or not.)
 */
export function initializeBatonHandoffSnapshots(): void {
  if (initialized) return;
  initialized = true;

  let wasHolder = useEditLockStore.getState().lock?.holder?.id === getLocalDevice().id;
  useEditLockStore.subscribe((state) => {
    const isHolder = state.lock?.holder?.id === getLocalDevice().id;
    if (wasHolder && !isHolder) {
      void captureImageHandoffSnapshots();
    }
    wasHolder = isHolder;
  });
}
