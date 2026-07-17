# 908 — License verification race hardening (AUD-015 review repair)

**Branch:** `overlap/fable-license-reviewfix` · **Production/test commit:** `d01783f` (parent `93139a4`)
**Scope:** Sol's six independent blockers on the original AUD-015 hydration fix. Production surface: `src/store/settingsStore.ts`, `src/components/Layout/CommunityStartupNotice.tsx`, new `src/components/Layout/communityNoticeDayClaim.ts`, one App effect. Audit verdicts untouched; proxy lane untouched.

## Blockers → what shipped

1. **Stale async verification could fail open.** A verification of key A left in flight could resolve after a removal/import/rehydrate installed identity B and unconditionally write `licensed: true`, which the commercial gates trust directly. Now every license-identity mutation (remove, activate, import, every applied rehydrate `merge`) bumps a module-level generation; `revalidateLicense` is the single canonical path — it fail-closes before awaiting the verifier, coalesces identical concurrent triggers onto one in-flight verification, converts verifier rejections into a fail-closed reasoned verdict, and applies a result only while both the captured key and the generation are still current. Anything stale is discarded.
2. **Same-key rehydrate left gates locked.** `merge` fail-closes `license` on every rehydrate, but the old key-change subscription never fired when the key string was unchanged. The subscription is gone; the persist post-rehydrate hook (`onRehydrateStorage`'s returned callback, which zustand v5 fires once per completed rehydrate) now re-verifies through the canonical path — exactly once, including same-key cases. Zustand's internal hydration versioning drops superseded overlapping rehydrates before `merge`/callback, so only the last writer re-verifies.
3. **Import was detached and could double-verify.** `importSettingsBackup` now bumps the generation, applies the sanitized payload fail-closed, and **awaits** the canonical verification: when it resolves, `license` deterministically reflects the verifier's verdict on the imported key, and the imported key is verified exactly once.
4. **Cross-window invalidation.** New `installLicenseCrossWindowSync()` (installed from an App effect, returns the listener cleanup). Mutating windows arm a broadcast that the storage layer posts on a dedicated `BroadcastChannel` only after the persist write carrying the new identity lands — encrypted settings writes are now serialized on a promise chain, which also stops parallel encryptions from landing out of order. Receivers run `persist.rehydrate()`: merge fail-closes, the post-rehydrate hook re-verifies. Deliberately scoped to license identity/rehydration — no general state sync (explicitly avoiding AUD-001 territory).
5. **Startup notice unmount + shared daily claim.** The decide effect is cancellable: unmounting mid-decision claims nothing and shows nothing, and a claim raced by an unmount before display is released (never suppress a notice nobody saw). The once-per-day slot moved to `communityNoticeDayClaim.ts`: atomic under Web Locks where available (Chromium everywhere we ship), else a nonce-tagged last-writer-wins write with a 120 ms recheck; reads accept legacy plain `YYYY-MM-DD` stamps. StrictMode's same-instance remount re-decides (the one-shot ref resets in cleanup).
6. **`settingsHydrated` semantics.** Documented as the one-shot *initial* latch it is: stays true across later rehydrates, intentionally does not model "rehydration in progress" (no caller needs it); later-rehydrate license consistency is owned by the generation guard, not this flag.

## TDD evidence

Red first, then green — all failures were the exact reported defects, not setup noise:

- **Red run (pre-fix):** 9 behavioral failures — removed-key stale verification flipped `licensed` back to `true` (fail-open), superseded-key verification resolving last failed open, same-key rehydrate never re-verified (gates stuck locked), import resolved before entitlement settled, no fail-close during re-verification and verifier rejection leaked, stale verdict clobbered a fresh activation, both cross-window sims (`installLicenseCrossWindowSync` absent), notice unmount claimed the day (`2026-07-16` written, nothing displayed) — plus `communityNoticeDayClaim` failing wholesale by module absence. 4 passed as expected (2 original notice tests, the two-roots single-show regression, and the overlapping-rehydrate regression that guards zustand's internal versioning we now rely on).
- **Green run (post-fix):** 5 suites / **24 passed, 0 failed** — `settingsStoreLicenseRace` (7), `settingsStoreLicenseCrossWindow` (2), `settingsStoreLicenseHydration` (4, pre-existing, untouched), `communityNoticeDayClaim` (7), `CommunityStartupNotice` (4). Race tests drive deferred verifier promises and deferred decrypts, and assert `isCommercialExportUnlocked()` (the real gate) through every transition window.

## Validation matrix (all on `d01783f`'s tree)

| Gate | Result |
|---|---|
| Focused license/notice suites | 5 files, 24/24 passed |
| Neighboring store-dependent suites (every test importing settingsStore / license libs: App context menu, ImageEditor panels ×3, Nodes ×4, SettingsModal, bytePlus + HF adapters, useI18n, settingsStore, licenseGates, licenseKey, exportProvenance, localNativeRender) | 17 files, 93/93 passed |
| `npx tsc -b --force` (root solution → tsconfig.app.json + tsconfig.node.json, non-incremental) | exit 0 |
| `npx eslint` on all 8 changed files | 0 errors; 1 warning (`react-hooks/set-state-in-effect` at the licensed-while-open dismissal effect) — pre-existing, byte-identical code present at `93139a4` line 79 |
| `git diff --check` | clean |
| `npm run build` (tsc -b + vite, unsandboxed) | exit 0, `dist/index.html` mtime advanced (20:58:49) |

## Residual risks (honest edges)

- **Lockless double-show window:** without Web Locks the day claim is last-writer-wins with a 120 ms recheck; two windows whose write→recheck spans interleave adversarially inside that window could still both show. localStorage has no cross-process CAS; every shipping platform (Electron, served Chromium browsers, Android WebView) has Web Locks, so the fallback is for exotic embedders only.
- **BroadcastChannel availability:** on an opaque-origin context that refuses the channel the constructor is caught and sync degrades to exactly the pre-fix behavior (consistency restored at next rehydrate/boot; each window still self-fail-closes). Worth a two-real-windows smoke test on the installed Electron build (file:// origin) when convenient.
- **Activation semantics:** `setLicenseKey` is completion-order-wins by design — a paste that finishes verifying after a concurrent remove/import writes its verifier-backed grant (and bumps the generation so nothing stale follows it). Defensible either way; flagged for the reviewer.
- **Import-before-hydration:** an import racing initial hydration can still lose non-license fields to the hydrating snapshot (pre-existing persist behavior, unreachable from the Settings UI); the generation guard keeps `license`↔`licenseKey` consistent regardless.
- The serialized write chain fixes out-of-order encrypted writes for persist writes; the legacy plaintext→encrypted migration write in `getItem` still bypasses the chain (first-read-only path, pre-existing).
