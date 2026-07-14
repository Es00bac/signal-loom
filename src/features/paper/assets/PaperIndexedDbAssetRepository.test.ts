import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBinaryAssetRecord } from '../../../shared/assets/contentAddressedAsset';
import {
  decodePaperAssetDbRecord,
  encodePaperAssetDbRecord,
  IndexedDbPaperAssetRepository,
  PaperAssetStorageUnavailableError,
} from './PaperIndexedDbAssetRepository';

describe('Paper IndexedDB asset repository', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('encodes and decodes database records without sharing mutable storage', async () => {
    const sourceBytes = new Uint8Array([9, 1, 2, 8]);
    const record = await createBinaryAssetRecord(sourceBytes.subarray(1, 3), {
      mimeType: 'image/png',
      fileName: 'panel.png',
    });

    const encoded = encodePaperAssetDbRecord(record);
    expect(encoded.ref).toEqual(record.ref);
    expect(encoded.ref).not.toBe(record.ref);
    expect(encoded.bytes).toBeInstanceOf(ArrayBuffer);
    expect(new Uint8Array(encoded.bytes)).toEqual(new Uint8Array([1, 2]));

    record.bytes[0] = 7;
    record.ref.fileName = 'changed.png';
    expect(new Uint8Array(encoded.bytes)).toEqual(new Uint8Array([1, 2]));
    expect(encoded.ref.fileName).toBe('panel.png');

    const decoded = decodePaperAssetDbRecord(encoded);
    expect(decoded.ref).toEqual(encoded.ref);
    expect(decoded.ref).not.toBe(encoded.ref);
    expect(decoded.bytes).toEqual(new Uint8Array([1, 2]));

    new Uint8Array(encoded.bytes)[1] = 6;
    expect(decoded.bytes).toEqual(new Uint8Array([1, 2]));
  });

  it('throws a typed error when IndexedDB is unavailable', () => {
    vi.stubGlobal('indexedDB', undefined);

    expect(() => new IndexedDbPaperAssetRepository()).toThrow(PaperAssetStorageUnavailableError);
  });

  it('persists records across close and reopen, then deletes them', async () => {
    const factory = new IDBFactory();
    const record = await createBinaryAssetRecord(new Uint8Array([4, 5, 6]), {
      mimeType: 'image/png',
      fileName: 'spread.png',
    });
    const first = new IndexedDbPaperAssetRepository(factory);

    await expect(first.put(record)).resolves.toEqual(record.ref);
    await expect(first.has(record.ref.id)).resolves.toBe(true);
    await expect(first.listRefs()).resolves.toEqual([record.ref]);
    await first.close();

    const reopened = new IndexedDbPaperAssetRepository(factory);
    await expect(reopened.get(record.ref.id)).resolves.toEqual(record);
    await reopened.delete(record.ref.id);
    await expect(reopened.get(record.ref.id)).resolves.toBeUndefined();
    await expect(reopened.has(record.ref.id)).resolves.toBe(false);
    await expect(reopened.listRefs()).resolves.toEqual([]);
    await reopened.close();
  });
});
