# 909 — Late hydration must not restore a locally removed license key (AUD-015 residual)

**Branch:** `overlap/fable-license-reviewfix` · **Production/test commit:** `0bdddd1` (parent `ca6d46f`, itself atop AUD-015 repair `d01783f`)
**Scope:** K3 final-gate residual on the AUD-015 lineage. Production surface: `src/store/settingsStore.ts` only (+133/−6). New hostile regression: `src/store/settingsStoreLateHydration.test.ts` (4 tests). Audit verdicts untouched; TASK_LIST untouched; no other worktree touched.

## The residual race (as approved-but-flagged by the K3 gate)

Zustand v5 `persist` guards only `currentVersion !== hydrationVersion` — overlapping *rehydrates* drop the older one before `merge`. Nothing watches **local mutations** that land while a hydration read is in flight: an initial or explicit rehydrate reads + decrypts the old blob asynchronously; the user calls `removeLicenseKey()` (fail-closed in memory, removal write enqueued); the stale decrypt then resolves and `merge` applies the old blob wholesale — `licenseKey` is resurrected, and the post-rehydrate hook canonically re-verifies it, re-licensing a session the user just un-licensed (fail-open), while disk holds the removal. Same shape for activation/import clobbered by an older in-flight hydration.

## Fix: mutation-vs-hydration guard at the persist merge boundary

- Every local write records the top-level state keys it touches (`trackLocalMutationWrites` wraps the creator's persist-provided `set`; the same recorder wraps `useSettingsStore.setState` for the direct-api path; function partials are evaluated through a pass-through so their result keys are recorded too).
- `onRehydrateStorage` arms `hydrationReadInFlight` at the start of every real hydration read. Only an armed `merge` drains the pending keys and applies the keep-override — out-of-band `merge` invocations (the two pre-existing sanitization unit tests in `settingsStore.test.ts`, tooling) keep the plain sanitizing behavior and leave the pending keys protected for the next real hydration.
- An armed merge keeps locally-mutated keys at their current (newer) values; everything else in the snapshot applies exactly as before. Machinery-owned derived fields are excluded: `license` (merge always fail-closes; the post-rehydrate hook re-verifies through the generation-guarded canonical path) and `settingsHydrated` (the latch).
- When a merge kept local mutations, the post-rehydrate hook enqueues one convergence write on the existing serialized write chain so storage converges on the resolved state (the mutating writes captured pre-hydration state).
- Preserved by construction and re-verified by suites: legitimate first-boot hydration, cross-window rehydrate, error/corrupt hydration latch behavior, write serialization, canonical verification semantics, latest-rehydrate-wins (zustand `hydrationVersion` drops superseded rehydrates before merge; untouched fields from the newest rehydrate still apply).

No timers, no license-only post-hoc cleanup: the guard is general over all persisted top-level keys and lives at the single point where a read snapshot becomes authoritative.

## Red/green proof (deterministic; deferred decrypts + deferred verifier, no timers)

**Red on `ca6d46f` (pre-fix):** `npx vitest run src/store/settingsStoreLateHydration.test.ts` → **4 failed / 4**, every failure the exact reported defect:

1. `a late hydration never restores a locally removed license key` — line 169: `expected 'SLOOM-valid-test-key' to be ''` (removed key resurrected by the late merge; boot re-verify then re-licenses it).
2. `a local activation during an in-flight hydration is never clobbered by the stale blob` — line 206: `expected 'SLOOM-valid-test-key' to be 'SLOOM-activated-test-key'`.
3. `a backup import during an in-flight hydration keeps the imported identity` — line 254: `expected 'SLOOM-valid-test-key' to be 'SLOOM-imported-test-key'`.
4. `a newer rehydrate supersedes an older one and still respects local mutations` — line 305: `expected 'SLOOM-valid-test-key' to be ''`.

**Green on `0bdddd1` (post-fix):** same file → **4 passed / 4**. Assertions per case: immediate fail-close on removal; key stays removed / activated / imported after the stale decrypt lands and all post-rehydrate work settles; no stale relicense (`isCommercialExportUnlocked()` false throughout the removal case); activation case fail-closes during canonical re-verification then re-grants; verifier call counts bounded (removed key: zero calls; activated key: ≤2, superseded persisted key never verified); persistence converges on the newer mutation (`enc:` blob's `licenseKey` = `''` / activated / imported); newer rehydrate wins untouched fields (`settingsPanel: 'license'`) while the removal stands.

## Validation matrix (all on `0bdddd1`'s tree)

| Gate | Result |
|---|---|
| New hostile suite `settingsStoreLateHydration` | 4/4 passed |
| Focused license/notice/settings suites (`settingsStoreLicenseRace`, `settingsStoreLicenseCrossWindow`, `settingsStoreLicenseHydration`, `settingsStoreLateHydration`, `communityNoticeDayClaim`, `CommunityStartupNotice`, `settingsStore`) | 7 files, 41/41 passed |
| Neighboring 93-test matrix from the K3 gate (App context menu, ImageEditor panels ×3, Nodes ×4, SettingsModal, bytePlus + HF adapters, useI18n, settingsStore, licenseGates, licenseKey, exportProvenance, localNativeRender) | 17 files, 93/93 passed |
| Combined final run | 23 files, **121/121 passed** |
| `npx tsc -b --force` (root solution → tsconfig.app + tsconfig.node, non-incremental) | exit 0 |
| `npx eslint src/store/settingsStore.ts src/store/settingsStoreLateHydration.test.ts` | 0 errors, 0 warnings |
| `git diff --check` | clean |
| `CI=1 npm run build` (tsc -b + vite) | exit 0 |

## Residual risks (honest edges)

- **Cross-window concurrent identity edits remain last-write-wins on disk.** The guard deliberately protects unconsumed *local* mutations even against a rehydrate carrying another window's newer identity (fail-closed direction; a removed key can never be resurrected locally). Genuine two-window edit battles stay in the documented out-of-scope territory of the cross-window design (no general state sync, AUD-001).
- **Out-of-band `merge` calls during an errored read window:** if a hydration read rejects before merge, `hydrationReadInFlight` stays armed until the next read; a direct (non-zustand) `merge` invocation in that gap would drain+keep. Production never calls `merge` directly; unit tests that do get the plain sanitizing behavior whenever no read is in flight.
- **Convergence-write ordering vs. other windows:** the post-merge convergence write is serialized with this window's own writes only (pre-existing per-window chain); cross-window disk ordering was already last-writer-wins and is unchanged.
- The keep-override is top-level-key granular; sub-key partial conflicts (e.g. one `providerSettings` field edited locally while a stale read carries others) resolve to the locally-mutated top-level object wholesale — the conservative, fail-closed direction for credentials.

Not self-approved: a fresh Sol/Fable final gate follows.
