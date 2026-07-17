# 925 — FBL-021: per-document Paper undo/redo ownership

Branch `overlap/fable-fbl021-paper-tab-history`, base `3d628c858d7c69bff424c61fea9d595bf327b93b`.
Production/tests commit: `64e3de41b0bc6c0b0dd6b561d8f03da73203c43d`.

## Defect

`src/store/paperStore.ts` kept one global `undoStack`/`redoStack` for the whole Paper
workspace and replaced both with `[]` inside `createNewDocument`, `openDocumentJson`,
`importDocumentJson`, `replaceDocument`, `setActiveDocument`, and `closeDocument`. Editing A,
creating/editing B, then switching back to A silently destroyed A's undo/redo; switching again
destroyed B's. `createPaperDiscardRecovery` captured history only for the active tab
(`wasActive && state.undoStack.length`), so loss-prevention capture of an inactive dirty tab
recorded no history at all.

## Fix shape

- New runtime-only state `documentHistories: Record<tabId, { undoStack; redoStack }>` holding
  stacks for open but **inactive** tabs. The active tab's history stays on the existing
  top-level `undoStack`/`redoStack` (unchanged compatibility surface; `undo`/`redo` untouched).
- Centralized helpers (no scattered copies): `stashActivePaperDocumentHistory` (focus leaves),
  `restorePaperDocumentHistoryPatch` (focus arrives; entry promoted and removed from the map),
  `freshPaperDocumentHistoryPatch` (created/opened/imported/replaced documents start empty and
  drop any stale entry), `removePaperDocumentHistory` (close/replace of an inactive tab),
  `paperHistoryForDocument` (a tab's own history wherever it lives — used by recovery capture).
- `createPaperDiscardRecovery` now records the target tab's own stacks even when inactive;
  `restoreDiscardedDocument` stashes the outgoing active tab before focusing the restored one.
- `sanitizePaperSnapshot` returns `documentHistories: {}`, so whole-workspace restore
  (`restoreSnapshot`) and persist rehydrate (`mergePersistedPaperWorkspace`) always reinitialize
  runtime history truth — restart behavior is unchanged.
- The persist `partialize` closure became the named export `projectPersistedPaperWorkspace`
  (field-for-field identical projection), mirroring the already-exported merge half so tests can
  pin the persisted projection directly — required because in node tests zustand's default
  storage is unavailable and the `.persist` API is deliberately unattached (see the existing
  explanation at `src/store/sourceBinStore.ts:165-168`).
- `src/types/paper.ts`: recovery `undoStack` doc comment updated from "Active-tab history" to
  "The tab's own history" (shape unchanged).
- Test fixtures `resetPaperStore()`/`seedStackedFrames()` now reset `documentHistories: {}`.

## Red evidence (before implementation)

```
./node_modules/.bin/vitest run src/store/paperStore.test.ts -t 'per-document undo'
  Tests  8 failed | 35 skipped (43)
```

All 8 new tests failed at the ownership assertions (history length 0 after an A→B→A switch;
`recovery.undoStack` undefined for an inactive capture) — feature missing, not test errors.
One probe was revised before green: the persisted-projection test first reached for
`usePaperStore.persist.getOptions().partialize`, which failed with
`TypeError: Cannot read properties of undefined (reading 'getOptions')` because persist never
attaches without storage in node; it was rewired to the exported
`projectPersistedPaperWorkspace` seam plus a hostile-record `mergePersistedPaperWorkspace`
round-trip, which still failed red until the export existed.

## Green evidence (after implementation)

```
./node_modules/.bin/vitest run src/store/paperStore.test.ts
  Tests  43 passed (43)

./node_modules/.bin/vitest run src/store/paperStore.test.ts \
  src/store/paperStore.remoteSync.test.ts src/store/paperLossPreventionStore.test.ts
  Tests  55 passed (55)

./node_modules/.bin/vitest run <18 focused files: the 3 above + PaperDocumentTabs,
  appRecovery, batonHandoffSnapshot.paper, paperBeforeUnload, paperLossPrevention,
  paperDocumentSave, projectDocumentActions{,.composedDirtyClose,.replacementOrdering},
  nativeStartupProjectReplacement, paperSyncChannel, projectPaperPortableAssets,
  imageEditorRecoveryResources, ProjectLibraryModal, ErrorBoundary>
  Test Files  18 passed (18)   Tests  310 passed (310)

./node_modules/.bin/tsc -b --force        → exit 0
./node_modules/.bin/eslint src/store/paperStore.ts src/store/paperStore.test.ts \
  src/types/paper.ts                      → exit 0
git diff --check                          → clean
```

`npm run verify:paper-production` was **not** run: `scripts/verify-paper-production.mjs` drives
the PDF/X golden print pipeline (`paperProductionGolden.test.ts` + ghostscript/poppler tooling)
and does not exercise the store tab/history boundary — running it would be exactly the
unrelated full sweep the ticket excludes. No full repository test sweep or app build was run.

## Serialization proof

- `projectPersistedPaperWorkspace` (the exact partialize) is pinned by test to contain no
  `undoStack`/`redoStack`/`documentHistories` keys.
- With populated histories in two tabs, `JSON.stringify(exportSnapshot())` is asserted to
  contain none of those keys, so `.sloom`/`.slppr` project snapshots and cross-device payloads
  built from it carry no history.
- A hostile persisted record carrying history payloads merged through
  `mergePersistedPaperWorkspace` yields `undoStack: []`, `redoStack: []`,
  `documentHistories: {}` — storage cannot resurrect history at boot.
- Pre-existing and unchanged: `discardedDocumentRecoveries` (deliberate-recovery records) may
  carry bounded history and are persisted; that channel existed before this change and remains
  capped at 8 batches with ≤50 entries per stack.

## Behavior deltas (intended)

- Switching tabs preserves each tab's undo **and** redo stacks; per-tab cap stays 50.
- Closing the active tab now promotes the neighbouring tab's own stashed history instead of
  blanking it; closing/replacing a tab removes only that tab's history; a reused document id
  starts clean (all tested).
- Deliberate recovery (`captureDocumentRecovery` → shutdown/baton-handoff/replacement paths)
  now preserves an inactive tab's own history, and restoring never leaks another tab's stacks.

## Residual risks

- Memory: each open inactive tab can now retain up to 50+50 history snapshots. Snapshots are
  reference-shares of prior document states (no cloning), the same cost the active tab always
  paid, bounded by open-tab count and freed on close; no new unbounded nesting.
- Recovery records for inactive dirty tabs grow when those tabs have history (previously
  omitted entirely); bounded by the existing batch/entry caps and the same persistence channel.
- Replacing the **active** tab's content (import/replace) still intentionally clears that tab's
  history; the recovery record remains the path back to prior content + history.
- The `.persist` API remains unattached in node tests by design; the projection is pinned via
  the named export, so a future hand-edited partialize that bypasses
  `projectPersistedPaperWorkspace` would need its own test.
