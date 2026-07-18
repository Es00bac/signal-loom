# AUD-031 Source Library durability — 2026-07-18

## Scope and cause

This author correction starts from exact clean main `18f7162ae59cf671f0795df8ed2712b661a76688` and addresses only AUD-031. Source Library asset writes already fell back to a runtime item when IndexedDB, native materialization, or project scratch storage failed, but the fallback was silent. The persistence projection then removed its `data:` or `blob:` payload, and restart sanitization discarded a non-text item with no remaining backing record. The item therefore appeared saved until reload and then vanished.

Production/tests commit: `176700ab` (`fix(source-library): retain assets across storage failures`).

## Correction

- Durable-write failures convert recoverable `Blob`/file inputs to `data:` URLs, mark the item `recovery-inline`, retain those bytes in the persisted Source Library only when no durable backing exists, and publish a visible degraded-storage status naming the affected item.
- If inline recovery bytes exceed browser quota, the guarded storage adapter retries the same state write without those bytes but with the item identity, `unavailable` marker, recovery instruction, and degraded global status. Browser-storage reads, writes, and removals cannot throw through application state actions.
- Persistence sanitization retains explicit unavailable non-text items rather than silently deleting them. Session-only object URLs become unavailable records on persistence. Project snapshot preparation/export/restore and cross-window comparisons retain the durability metadata.
- Successful asset replacement now copies the newly persisted `assetId`; this prevents a reload from resolving the prior asset record after an update and lets byte-free cross-window publication resolve the correct durable record.
- The Source Library saved-assets panel shows an English/Japanese degraded-storage warning. Native and IndexedDB failure tests exercise persistence projection plus sanitization as a restart boundary; quota tests exercise both the compacting helper and the actual Zustand JSON-storage adapter.

## Permanent coverage

- `sourceBinStoreFallback.test.ts`: IndexedDB generated-media failure, native storage failure, import failure, recovery-byte retention, affected-item degraded state, and simulated persisted reload.
- `sourceBinStore.test.ts`: derived-byte exclusion, fallback-byte inclusion, quota compaction, actual quota retry, unavailable storage read/remove containment, and restart sanitization.
- `sourceBinLiveSync.test.ts`: updated durable asset identity and byte-free window publication.
- `FlowSourceBinSidebar.test.tsx`: permanent degraded-state UI and bilingual catalog wiring.

## Author verification

- Focused AUD-031 matrix: **4 files passed; 66 tests passed**.
- Adjacent Source Library/window/persistence matrix: **13 files passed; 225 tests passed**.
- `npm run verify:flow-production`: **9 files passed; 375 tests passed**; static audit passed for **63 nodes, 182 model contracts, and 178 normal model options**.
- `npx tsc -p tsconfig.app.json --noEmit --incremental false` — passed.
- `npx tsc -p tsconfig.node.json --noEmit --incremental false` — passed.
- Touched-file ESLint and `git diff --check` — passed.
- `npm run build` — passed with the established runtime-URL, browser-module externalization, deprecation, and chunk-size warnings.
- Repository-wide Vitest sweep: **717 files / 6,815 tests passed; 6 files / 7 tests failed outside this patch**. The failures were the missing generated font inventory, two pre-existing Paper managed-metadata fixture conflicts, two served-LAN Image expectations, one static App source guard, one smoke timeout, and the Flow stale-run rollback fixture. The Flow failure was reproduced unchanged in a temporary worktree at the exact starting commit `18f7162a`; that temporary worktree was then removed.

## Residual boundary

When every durable backend and browser storage quota are simultaneously unavailable, software cannot preserve the asset bytes across process exit. This correction preserves the item identity and explicit recovery instruction instead of claiming success or deleting it silently; the current-session bytes remain usable until exit. A fresh independent review is required before integration or audit closure.
