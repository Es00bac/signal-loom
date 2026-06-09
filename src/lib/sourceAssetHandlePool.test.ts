import { describe, expect, it, vi } from 'vitest';
import { createSourceAssetHandlePool } from './sourceAssetHandlePool';

describe('sourceAssetHandlePool', () => {
  it('keeps one object URL alive until the final release', () => {
    const releaseUrl = vi.fn();
    const pool = createSourceAssetHandlePool(releaseUrl);

    pool.acquire('asset-1', 'blob://panel');
    pool.acquire('asset-1', 'blob://panel');
    pool.release('asset-1');

    expect(pool.has('asset-1')).toBe(true);
    expect(releaseUrl).not.toHaveBeenCalled();

    pool.release('asset-1');

    expect(pool.has('asset-1')).toBe(false);
    expect(releaseUrl).toHaveBeenCalledWith('blob://panel');
  });
});
