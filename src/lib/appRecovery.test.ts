import { describe, expect, it, vi } from 'vitest';
import {
  NON_SECRET_RECOVERY_STORAGE_KEYS,
  SECRET_PERSISTED_STORAGE_KEYS,
  safeRemoveLocalStorageKeys,
} from './appRecovery';

describe('appRecovery helpers', () => {
  it('removes requested storage keys without throwing when one key fails', () => {
    const removeItem = vi.fn((key: string) => {
      if (key === 'broken') {
        throw new Error('quota blocked');
      }
    });

    const results = safeRemoveLocalStorageKeys(['flow-canvas-storage', 'broken'], { removeItem });

    expect(removeItem).toHaveBeenCalledWith('flow-canvas-storage');
    expect(removeItem).toHaveBeenCalledWith('broken');
    expect(results).toEqual([
      { key: 'flow-canvas-storage', removed: true },
      { key: 'broken', removed: false, error: 'quota blocked' },
    ]);
  });

  it('keeps provider/API key storage out of non-secret recovery removal', () => {
    for (const secretKey of SECRET_PERSISTED_STORAGE_KEYS) {
      expect(NON_SECRET_RECOVERY_STORAGE_KEYS).not.toContain(secretKey);
    }
  });

  it('reports unavailable storage instead of throwing', () => {
    expect(safeRemoveLocalStorageKeys(['flow-canvas-storage'], null)).toEqual([
      { key: 'flow-canvas-storage', removed: false, error: 'localStorage unavailable' },
    ]);
  });
});
