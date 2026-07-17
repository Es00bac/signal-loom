/**
 * Once-per-day claim for the Community startup notice, shared by every window of the app
 * (AUD-015). The claim lives in localStorage under a single day-stamped value; two renderers
 * booting together must not both show the notice, and a claim that never led to a displayed
 * notice can be released so it does not suppress the notice a user never saw.
 *
 * Claiming is atomic where the platform provides Web Locks (Chromium — desktop Electron, the
 * served-browser sessions, and the Android WebView all do). Without locks it degrades to
 * last-writer-wins: write a nonce-tagged stamp, wait a recheck window, and only the window whose
 * write survived shows the notice. That closes every realistic double-show interleaving; two
 * lockless windows whose write→recheck spans overlap adversarially within the recheck window
 * remain a documented residual (localStorage has no cross-process compare-and-swap).
 */

export const NOTICE_DAY_STORAGE_KEY = 'signal-loom-community-notice-day';
const CLAIM_LOCK_NAME = 'signal-loom-community-notice-day-claim';
const FALLBACK_RECHECK_DELAY_MS = 120;

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function readClaimValue(): string | null {
  try {
    return window.localStorage.getItem(NOTICE_DAY_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Returns false when storage is unavailable — the notice then simply may show again next launch. */
function writeClaimValue(value: string): boolean {
  try {
    window.localStorage.setItem(NOTICE_DAY_STORAGE_KEY, value);
    return true;
  } catch {
    return false;
  }
}

/** Covers both this module's nonce-tagged stamps and the legacy plain `YYYY-MM-DD` values. */
function isDayClaimed(day: string): boolean {
  const value = readClaimValue();
  return value !== null && value.startsWith(day);
}

/** The claim value this window last wrote and won; releasable while it is still the stored one. */
let lastLocalClaim: string | null = null;

/**
 * Try to claim today's notice slot for this window. Resolves true when this window won the claim
 * (or storage is unavailable, where showing is the fail-safe direction) and should display the
 * notice; false when another window already holds today's claim.
 */
export async function claimCommunityNoticeDay(): Promise<boolean> {
  const day = todayStamp();
  if (isDayClaimed(day)) {
    return false;
  }
  const claimValue = `${day}#${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (locks?.request) {
    try {
      return await locks.request(CLAIM_LOCK_NAME, async () => {
        if (isDayClaimed(day)) {
          return false;
        }
        if (!writeClaimValue(claimValue)) {
          return true;
        }
        lastLocalClaim = claimValue;
        return true;
      });
    } catch {
      // Locks unavailable after all (partitioned context, shutdown) — degrade below.
    }
  }

  // Storage-only fallback: last writer wins. Whoever's write is still standing after the recheck
  // window shows the notice; everyone else yields to it.
  if (!writeClaimValue(claimValue)) {
    return true;
  }
  await new Promise((resolve) => setTimeout(resolve, FALLBACK_RECHECK_DELAY_MS));
  if (readClaimValue() !== claimValue) {
    return false;
  }
  lastLocalClaim = claimValue;
  return true;
}

/**
 * Give back a claim that never turned into a displayed notice (the deciding window unmounted
 * between claiming and rendering). Only removes the value while it is still this window's own
 * claim — another window's claim is never touched.
 */
export function releaseCommunityNoticeDayClaim(): void {
  if (lastLocalClaim !== null && readClaimValue() === lastLocalClaim) {
    try {
      window.localStorage.removeItem(NOTICE_DAY_STORAGE_KEY);
    } catch {
      // Storage unavailable — nothing to release.
    }
  }
  lastLocalClaim = null;
}
