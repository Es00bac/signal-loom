import '../../store/test-setup-window';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  claimCommunityNoticeDay,
  NOTICE_DAY_STORAGE_KEY,
  releaseCommunityNoticeDayClaim,
} from './communityNoticeDayClaim';

/**
 * AUD-015: the once-per-day Community notice claim is shared by every window of the app through
 * localStorage. Claiming must be atomic where the platform allows (Web Locks) and last-writer-wins
 * with a recheck window elsewhere, so two renderers starting together never both show the notice —
 * and a claim that never led to a displayed notice can be released rather than suppressing it.
 */

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

/** A LockManager stand-in that serializes callbacks the way the real Web Locks API does. */
function createSerializingLockManager(): { request: (name: string, callback: () => Promise<unknown>) => Promise<unknown> } {
  let chain: Promise<unknown> = Promise.resolve();
  return {
    request: (_name: string, callback: () => Promise<unknown>) => {
      const run = chain.then(() => callback());
      chain = run.catch(() => undefined);
      return run;
    },
  };
}

beforeEach(() => {
  window.localStorage.clear();
  // Node exposes a global navigator without Web Locks; pin that shape so these tests always
  // exercise the storage-only fallback unless a test stubs locks in explicitly.
  vi.stubGlobal('navigator', {});
});

afterEach(() => {
  releaseCommunityNoticeDayClaim();
  vi.unstubAllGlobals();
});

describe('community notice day claim (AUD-015)', () => {
  it('claims the day exactly once', async () => {
    await expect(claimCommunityNoticeDay()).resolves.toBe(true);
    expect(window.localStorage.getItem(NOTICE_DAY_STORAGE_KEY)?.startsWith(todayStamp())).toBe(true);
    await expect(claimCommunityNoticeDay()).resolves.toBe(false);
  });

  it('yields to a legacy plain-day stamp already stored for today', async () => {
    window.localStorage.setItem(NOTICE_DAY_STORAGE_KEY, todayStamp());
    await expect(claimCommunityNoticeDay()).resolves.toBe(false);
  });

  it('claims over a stamp from a previous day', async () => {
    window.localStorage.setItem(NOTICE_DAY_STORAGE_KEY, '2020-01-01');
    await expect(claimCommunityNoticeDay()).resolves.toBe(true);
    expect(window.localStorage.getItem(NOTICE_DAY_STORAGE_KEY)?.startsWith(todayStamp())).toBe(true);
  });

  it('releasing an undisplayed claim restores claimability', async () => {
    await expect(claimCommunityNoticeDay()).resolves.toBe(true);
    releaseCommunityNoticeDayClaim();
    expect(window.localStorage.getItem(NOTICE_DAY_STORAGE_KEY)).toBeNull();
    await expect(claimCommunityNoticeDay()).resolves.toBe(true);
  });

  it('release never removes a claim owned by another window', async () => {
    await expect(claimCommunityNoticeDay()).resolves.toBe(true);
    const foreignClaim = `${todayStamp()}#other-window`;
    window.localStorage.setItem(NOTICE_DAY_STORAGE_KEY, foreignClaim);
    releaseCommunityNoticeDayClaim();
    expect(window.localStorage.getItem(NOTICE_DAY_STORAGE_KEY)).toBe(foreignClaim);
  });

  it('exactly one of two concurrent claimers wins under Web Locks', async () => {
    vi.stubGlobal('navigator', { locks: createSerializingLockManager() });
    const results = await Promise.all([claimCommunityNoticeDay(), claimCommunityNoticeDay()]);
    expect(results.filter(Boolean).length).toBe(1);
  });

  it('a storage-fallback claimer yields when another window claims during its recheck window', async () => {
    const pendingClaim = claimCommunityNoticeDay();
    // Another window's claim lands while ours is inside its recheck delay.
    window.localStorage.setItem(NOTICE_DAY_STORAGE_KEY, `${todayStamp()}#other-window`);
    await expect(pendingClaim).resolves.toBe(false);
    // The other window's claim survives untouched.
    expect(window.localStorage.getItem(NOTICE_DAY_STORAGE_KEY)).toBe(`${todayStamp()}#other-window`);
  });
});
