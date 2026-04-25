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

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(request.error ?? new Error('Failed to open the local asset database.'));
    };

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };
  });
}

async function persistAssetRecord(record: StoredAssetRecord): Promise<StoredAssetPayload> {
  const database = await openDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('Failed to persist the selected asset locally.'));

    store.put(record);
  });

  database.close();

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

  database.close();
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

async function loadImportedAssetRecord(id: string): Promise<StoredAssetRecord | undefined> {
  const database = await openDatabase();
  const result = await new Promise<StoredAssetRecord | undefined>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result as StoredAssetRecord | undefined);
    request.onerror = () =>
      reject(request.error ?? new Error('Failed to load the stored local asset.'));
  });

  database.close();
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
