import { packContainer, unpackContainer } from '../../shared/files/SignalLoomContainer';
import type { PaperDocument } from '../../types/paper';

export const SLPPR_FORMAT = 'signal-loom-paper';
export const SLPPR_FORMAT_VERSION = 1;

// ---------------------------------------------------------------------------
// Pure base64 helpers — no Buffer, no DOM (works in Node 18+, browsers, WebView)
// ---------------------------------------------------------------------------

export function b64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function bytesToB64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// ---------------------------------------------------------------------------
// Asset reference type (stored in manifest JSON in place of data-URLs)
// ---------------------------------------------------------------------------

interface SlpprAssetRef {
  $slpprAsset: string;
  mime: string;
}

function isAssetRef(v: unknown): v is SlpprAssetRef {
  return (
    typeof v === 'object' &&
    v !== null &&
    '$slpprAsset' in v &&
    'mime' in v
  );
}

// ---------------------------------------------------------------------------
// Generic deep walk
// ---------------------------------------------------------------------------

/** Walk and REPLACE data-URLs → asset refs. Mutates `assets` and `counter`. */
function walkExtract(
  value: unknown,
  assets: Map<string, Uint8Array>,
  counter: { n: number },
): unknown {
  if (typeof value === 'string' && value.startsWith('data:') && value.includes(';base64,')) {
    const semicolonIdx = value.indexOf(';base64,');
    const mime = value.slice('data:'.length, semicolonIdx);
    const b64 = value.slice(semicolonIdx + ';base64,'.length);
    const id = `asset-${counter.n++}.bin`;
    assets.set(id, b64ToBytes(b64));
    const ref: SlpprAssetRef = { $slpprAsset: id, mime };
    return ref;
  }
  if (Array.isArray(value)) {
    return value.map((item) => walkExtract(item, assets, counter));
  }
  if (typeof value === 'object' && value !== null) {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>)) {
      result[key] = walkExtract((value as Record<string, unknown>)[key], assets, counter);
    }
    return result;
  }
  return value;
}

/** Walk and RESTORE asset refs → data-URLs. */
function walkRestore(value: unknown, assets: Map<string, Uint8Array>): unknown {
  if (isAssetRef(value)) {
    const bytes = assets.get(value.$slpprAsset);
    if (!bytes) {
      throw new Error(`SlpprFormat: missing asset "${value.$slpprAsset}"`);
    }
    return `data:${value.mime};base64,${bytesToB64(bytes)}`;
  }
  if (Array.isArray(value)) {
    return value.map((item) => walkRestore(item, assets));
  }
  if (typeof value === 'object' && value !== null) {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>)) {
      result[key] = walkRestore((value as Record<string, unknown>)[key], assets);
    }
    return result;
  }
  return value;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function serializeSlppr(doc: PaperDocument): Uint8Array {
  const assets = new Map<string, Uint8Array>();
  const counter = { n: 0 };
  const documentManifest = walkExtract(doc, assets, counter);
  return packContainer(
    {
      format: SLPPR_FORMAT,
      formatVersion: SLPPR_FORMAT_VERSION,
      kind: 'paper',
      document: documentManifest,
      assets: [...assets.keys()],
    },
    assets,
  );
}

export function deserializeSlppr(bytes: Uint8Array): PaperDocument {
  const { manifest, assets } = unpackContainer(bytes);
  if (manifest.format !== SLPPR_FORMAT) {
    throw new Error('Not a .slppr container: ' + manifest.format);
  }
  const restored = walkRestore(manifest.document, assets);
  return restored as unknown as PaperDocument;
}
