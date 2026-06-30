const DB_NAME = 'flow-local-assets';
const DB_VERSION = 1;
const STORE_NAME = 'assets';

export interface StoredAssetRecord {
  id: string;
  name: string;
  mimeType: string;
  dataUrl?: string;
  blob?: Blob;
  createdAt: number;
}

export interface StoredAssetPayload {
  id: string;
  name: string;
  mimeType: string;
  dataUrl: string;
}

export interface StoredAssetBlobPayload {
  id: string;
  name: string;
  mimeType: string;
  blob: Blob;
}

interface SaveDataUrlAssetInput {
  name: string;
  mimeType: string;
  dataUrl: string;
}

let cachedDatabasePromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (cachedDatabasePromise) {
    return cachedDatabasePromise;
  }

  cachedDatabasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      cachedDatabasePromise = null;
      reject(new Error('Timeout opening local asset database.'));
    }, 3000);

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      clearTimeout(timeoutId);
      cachedDatabasePromise = null;
      reject(request.error ?? new Error('Failed to open the local asset database.'));
    };

    request.onblocked = () => {
      clearTimeout(timeoutId);
      console.warn('IndexedDB database open is blocked.');
      cachedDatabasePromise = null;
      reject(new Error('IndexedDB database open is blocked by another connection.'));
    };

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => {
      clearTimeout(timeoutId);
      resolve(request.result);
    };
  });

  return cachedDatabasePromise;
}

import { isRemoteLanClient } from './projectLibrary';
import { initializeLanServerProxy } from './androidLanServer';
import { isServedLanSession, remoteHostFetch } from './remoteHostClient';

// Phone host: serve assets to a served browser as data URLs (JSON-serializable across the relay), and
// — Phase B — accept additive asset uploads pushed by a served client so a desktop-created image can
// render on the phone. Uploads are append-by-id only; they never touch projects, so there is no
// clobber surface (project writes remain Phase C).
initializeLanServerProxy({
  getAsset: loadImportedAssetAsDataUrl,
  putAsset: async (id, record) => {
    const stored = record as StoredAssetRecord;
    if (!stored || (!stored.dataUrl && !stored.blob)) return;
    await persistAssetRecord({ ...stored, id, createdAt: stored.createdAt ?? Date.now() });
  },
});

export async function persistAssetRecord(record: StoredAssetRecord): Promise<StoredAssetPayload> {
  // On a served (read-only mirror) session there is no write-back to the phone yet (Phase A), so any
  // asset created in the session persists to this browser's own origin storage instead.
  const database = await openDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('Failed to persist the selected asset locally.'));

    store.put(record);
  });

  const payload = materializeStoredAssetPayload(record);

  if (!payload) {
    throw new Error('Failed to materialize the selected asset after saving it locally.');
  }

  return payload;
}

export async function saveImportedAsset(file: File): Promise<StoredAssetPayload> {
  const id = globalThis.crypto?.randomUUID?.() ?? `asset-${Date.now()}`;

  return persistAssetRecord({
    id,
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
    blob: file,
    createdAt: Date.now(),
  });
}

export async function saveDataUrlAsset(input: SaveDataUrlAssetInput): Promise<StoredAssetPayload> {
  const id = globalThis.crypto?.randomUUID?.() ?? `asset-${Date.now()}`;

  return persistAssetRecord({
    id,
    name: input.name,
    mimeType: input.mimeType || 'application/octet-stream',
    blob: await dataUrlToBlob(input.dataUrl, input.mimeType),
    createdAt: Date.now(),
  });
}

export async function loadImportedAsset(id: string): Promise<StoredAssetPayload | undefined> {
  const record = await loadImportedAssetRecord(id);

  if (!record) {
    return undefined;
  }

  return materializeStoredAssetPayload(record);
}

export async function loadImportedAssetAsDataUrl(id: string): Promise<StoredAssetPayload | undefined> {
  const record = await loadImportedAssetRecord(id);

  if (!record) {
    return undefined;
  }

  if (record.dataUrl) {
    return {
      id: record.id,
      name: record.name,
      mimeType: record.mimeType,
      dataUrl: record.dataUrl,
    };
  }

  if (!record.blob) {
    return undefined;
  }

  return {
    id: record.id,
    name: record.name,
    mimeType: record.mimeType,
    dataUrl: await blobToDataUrl(record.blob),
  };
}

/**
 * Resolve an imported asset's bytes to a data URL, with a served-LAN-session fallback to the phone host.
 *
 * On the phone (authority), and on a standalone desktop/web session, the asset lives in this origin's
 * IndexedDB, so the local lookup wins. On a *served* browser session the Flow sync strips the inline
 * `sourceAssetUrl` from every node before shipping it (the multi-MB data URL would bloat every op),
 * sending only the stable `sourceAssetId` — so the bytes never entered this browser's store. When the
 * local lookup misses in a served session we fetch them from the host's `GET /asset/:id` endpoint (the
 * same id space `saveImportedAsset` writes, the same byte path the source library already rides) and
 * cache them into this origin so subsequent reads — and React re-renders — are local and synchronous.
 */
export async function resolveImportedAssetDataUrl(id: string): Promise<string | undefined> {
  if (!id) {
    return undefined;
  }

  const local = await loadImportedAssetAsDataUrl(id).catch(() => undefined);
  if (local?.dataUrl) {
    return local.dataUrl;
  }

  if (!isServedLanSession()) {
    return undefined;
  }

  try {
    const res = await remoteHostFetch(`/asset/${encodeURIComponent(id)}`, { timeoutMs: 15_000 });
    if (!res || !res.ok) {
      return undefined;
    }

    const payload = (await res.json()) as Partial<StoredAssetPayload> | null;
    if (!payload?.dataUrl) {
      return undefined;
    }

    // Cache into this origin so the next read is local; best-effort, since a quota miss must not block display.
    await persistAssetRecord({
      id: payload.id ?? id,
      name: payload.name ?? id,
      mimeType: payload.mimeType ?? 'image/png',
      dataUrl: payload.dataUrl,
      createdAt: Date.now(),
    }).catch(() => undefined);

    return payload.dataUrl;
  } catch {
    return undefined;
  }
}

export async function loadImportedAssetBlob(id: string): Promise<StoredAssetBlobPayload | undefined> {
  const record = await loadImportedAssetRecord(id);

  if (!record) {
    return undefined;
  }

  if (record.blob) {
    return {
      id: record.id,
      name: record.name,
      mimeType: record.mimeType,
      blob: record.blob,
    };
  }

  if (!record.dataUrl) {
    return undefined;
  }

  return {
    id: record.id,
    name: record.name,
    mimeType: record.mimeType,
    blob: await dataUrlToBlob(record.dataUrl, record.mimeType),
  };
}

export async function deleteImportedAsset(id: string): Promise<void> {
  const database = await openDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('Failed to delete the stored local asset.'));

    store.delete(id);
  });
}

export function materializeStoredAssetPayload(
  record: StoredAssetRecord,
  createObjectUrl: (blob: Blob) => string = (blob) => URL.createObjectURL(blob),
): StoredAssetPayload | undefined {
  if (record.dataUrl) {
    return {
      id: record.id,
      name: record.name,
      mimeType: record.mimeType,
      dataUrl: record.dataUrl,
    };
  }

  if (!record.blob) {
    return undefined;
  }

  return {
    id: record.id,
    name: record.name,
    mimeType: record.mimeType,
    dataUrl: createObjectUrl(record.blob),
  };
}

export async function loadImportedAssetRecord(id: string): Promise<StoredAssetRecord | undefined> {
  if (isRemoteLanClient()) {
    // Resolve from the phone host first (authenticated); fall back to this browser's own storage for
    // any asset that was imported locally within the served session.
    try {
      const res = await remoteHostFetch(`/asset/${encodeURIComponent(id)}`);
      if (res && res.ok) {
        const data = await res.json();
        if (data) return data as StoredAssetRecord;
      }
    } catch {
      // fall through to local storage
    }
  }

  const database = await openDatabase();
  const result = await new Promise<StoredAssetRecord | undefined>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result as StoredAssetRecord | undefined);
    request.onerror = () =>
      reject(request.error ?? new Error('Failed to load the stored local asset.'));
  });

  return result;
}

async function dataUrlToBlob(dataUrl: string, fallbackMimeType: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();

  if (blob.type || !fallbackMimeType) {
    return blob;
  }

  return new Blob([blob], { type: fallbackMimeType });
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(reader.error ?? new Error('Failed to convert the asset into a data URL.'));
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('The asset could not be converted into a data URL.'));
        return;
      }

      resolve(reader.result);
    };
    reader.readAsDataURL(blob);
  });
}
