import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBinaryAssetRecord } from '../../../shared/assets/contentAddressedAsset';
import { MemoryPaperAssetRepository } from './PaperAssetRepository';
import { PaperAssetUrlRegistry } from './PaperAssetUrlRegistry';

describe('Paper asset URL registry', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('revokes an object URL after the final lease releases', async () => {
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:paper-asset');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const repository = new MemoryPaperAssetRepository();
    const record = await createBinaryAssetRecord(new Uint8Array([1]), { mimeType: 'image/png' });
    await repository.put(record);
    const registry = new PaperAssetUrlRegistry(repository);

    const first = await registry.acquire(record.ref.id);
    const second = await registry.acquire(record.ref.id);
    expect(first.url).toBe('blob:paper-asset');
    expect(second.url).toBe(first.url);
    expect(create).toHaveBeenCalledTimes(1);
    first.release();
    expect(revoke).not.toHaveBeenCalled();
    second.release();

    expect(revoke).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledWith('blob:paper-asset');

    second.release();
    expect(revoke).toHaveBeenCalledOnce();
  });
});
