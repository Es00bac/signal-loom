# Overlap sprint — Fable 5 Paper repair (FBL-001, FBL-002) — 2026-07-16

- **Baseline commit:** `cef276d8fc8a03d6708f0307cf24f2b5f26bfccd` (branch `overlap/fable-paper`)
- **Fix commit:** `b8b10047d6aaca1986722c03fe3045533c367b21`
- **Scope:** FBL-001 and FBL-002 from `docs/audits/fable-partial-audit-comparison-2026-07-16.md`. FBL-003 was **not attempted** (see end).

## Reproduced failures (deterministic red tests written first)

All ten new regression tests were written before any production change and all failed against the baseline for the audited reason:

1. **FBL-001, end to end** (`src/lib/projectDocumentActions.test.ts`): a legacy project whose Paper frame carried inline bytes plus a `sourceBinItemId` link was restored (the inline bytes migrate into the managed repository because the linked Source Library item has no durable URL yet — a `nativeFilePath` item whose display URL is unresolved). After the item later gained a durable `signal-loom-asset://` URL, save + reopen produced a **blank Paper workspace**: `expected 'Untitled Paper Layout' to be 'Migrated Link'`.
2. **FBL-001, save boundary** (`src/lib/projectMediaReferences.test.ts`): `normalizeProjectMediaReferencesForSave` remapped a frame's managed locator to the external Source Library URL but left the captured tab/top-level `assetIds` containing the now-unreferenced managed id — the exact stale inventory that reopen validation rejects.
3. **FBL-002, validation boundary** (`src/lib/projectValidation.test.ts`): a three-tab snapshot with one malformed tab (`pages` not an array), a tab with an invalid managed ref (`sha256:not-a-hash`), a duplicate tab id, a stale declared inventory, a corrupt denormalized active-document copy, and an all-tabs-corrupt snapshot — every case made `sanitizePaperSnapshot` return `undefined`, i.e. the whole Paper workspace blanked.
4. **FBL-002, end to end** (`src/lib/projectDocumentActions.test.ts`): restoring a saved project with tabs `[valid, corrupt, valid]` left paperStore with only a fresh default document.

## Root causes

**FBL-001.** `buildCurrentProjectDocument` exports the Paper snapshot (whose per-tab `assetIds` come from `collectReachablePaperAssetIds`) *before* `normalizeProjectMediaReferencesForSave` runs. `normalizePaperFrameAsset` spreads `buildPaperFrameAssetFromSourceItem(sourceItem)` over the stored asset, which replaces a `managed` locator with an `external` locator whenever the linked source item has a durable URL. The captured inventory then declares a managed id the document no longer references. On reopen, `sanitizePaperWorkspaceDocumentSnapshot` recomputed reachability, saw the mismatch, returned `undefined`, and the all-or-nothing wrapper discarded the entire snapshot; `paperStore.restoreSnapshot(undefined)` installed the blank default with no error, so the rollback path never fired and the next save could persist the blank state.

**FBL-002.** `sanitizePaperSnapshot` (`src/lib/projectValidation.ts`) applied all-or-nothing rules before paperStore's tolerant store-level sanitizer could run: any single invalid tab, any duplicate tab id, a malformed `documents` value, or even a corrupt denormalized top-level `document` copy blanked every valid tab.

## Design (smallest root-cause shape)

**Save side (FBL-001):** in `normalizePaperMediaReferences`, whenever normalization changes a tab's document, that tab's `assetIds` are recomputed with the same `collectReachablePaperAssetIds` collector paperStore used to capture them, and the top-level union is recomputed from the final tabs — the locator remap and the inventory rewrite are now one atomic step. New saves can no longer be internally inconsistent. (The same recompute runs on the restore-side resolve pass, which is harmless and keeps both directions consistent.)

**Load side (FBL-002, plus FBL-001 for projects saved before this fix):** `sanitizePaperSnapshot` now validates tabs independently:

- Valid tabs are preserved; the requested active tab falls back to the first valid tab.
- Malformed tabs are **quarantined** into a new `recovery` record (`PaperSnapshotRecovery` in `src/types/paper.ts`) with `index`, `id`, `title`, a machine-readable `reason` (`malformed-document` / `invalid-asset-reference`), and the original entry serialized as `payloadJson` so the data remains recoverable.
- Duplicate tab ids are renamed (`id-2`, matching paperStore's live-dedupe semantics) with a repair note, instead of discarding the workspace.
- A stale/malformed *declared* asset inventory is repaired with a note and the recomputed reachability list — the declared list is advisory (the function always returned the recomputed list anyway). **Structural** validation is unchanged and fail-closed: invalid managed refs, inline `data:`/`blob:` locators, and malformed document shapes still reject that document (the existing rejection tests still pass verbatim).
- If every tab is corrupt, the function returns an explicit `{ recovery }` snapshot instead of silently `undefined`; legacy single-document snapshots that were never valid keep the historical `undefined`.
- `recovery` flows into paperStore state (`recovery: PaperSnapshotRecovery | null`), is logged via `console.warn` on restore, and is carried through `exportSnapshot` so a **resave after recovery is not destructive** — the quarantined payload rides along in the project file until the owner acts. `sanitizePaperSnapshotRecovery`/`mergePaperSnapshotRecovery` (new `src/lib/paperSnapshotRecovery.ts`) validate and dedupe the record so repeated round-trips cannot grow it. The record is deliberately **excluded from paperStore's localStorage partialize** (quota-cascade hazard; the project file is the durable channel).

## Files changed (commit `b8b1004`)

- `src/lib/projectMediaReferences.ts` — atomic inventory recompute with locator remap (+ import).
- `src/lib/projectValidation.ts` — per-tab validation, quarantine, duplicate rename, advisory-inventory repair, recovery merge.
- `src/lib/paperSnapshotRecovery.ts` — new: recovery sanitizer + dedupe merge shared by validation and paperStore.
- `src/types/paper.ts` — `PaperQuarantinedDocumentRecovery`, `PaperSnapshotRecovery`, `PaperDocumentSnapshot.recovery?`.
- `src/store/paperStore.ts` — `recovery` state, restore warning, export carry-through.
- Tests: `src/lib/projectValidation.test.ts` (+6), `src/lib/projectMediaReferences.test.ts` (+1), `src/lib/projectDocumentActions.test.ts` (+2 e2e), `src/store/paperStore.test.ts` (+1, and `resetPaperStore` gained `recovery: null`).

## Tests and results

- Red baseline (pre-fix): `npx vitest run` on the four touched suites — **10 failed (all new tests, at the audited symptoms) | 66 passed**.
- Post-fix, same four suites: **76/76 passed**.
- Dependent suites (`projectSyncService`, `paperStore.remoteSync`, `paperSyncChannel`, `paperDocumentNativeSync`, `SlpprFormat`, `PaperDocumentAssets`, `projectAssets`, `paperPackageExport`, `PaperWorkspaceUtils`, `projectSchemaParity`): **86/86 passed**.
- Wide sweep `npx vitest run src/lib/paper src/features/paper src/store/paperStore src/components/Paper src/lib/project`: **121 files, 951/951 passed**.
- Type/build gate `npm run build` (tsc -b + vite, sandbox disabled): **exit 0**.

Required coverage checklist: migrated Source-Library-linked managed image ✔ (e2e test 1, which also asserts the managed-migration precondition); three-tab snapshot with one corrupt tab ✔ and with a duplicate tab ✔; preservation of valid tabs ✔; explicit recovery information (reason + payload) ✔; second save after recovery ✔ (both e2e tests perform a second save/reopen and assert content and recovery survive).

## Remaining risks / follow-ups

- **No UI surface yet for `recovery`.** The diagnostic is explicit at the store/API layer (`usePaperStore.getState().recovery`, `console.warn`, and persisted in the project file), but no banner/dialog renders it in the Paper workspace. A small chip in `PaperDocumentTabs` plus a "restore quarantined tab" action is the natural follow-up (that surface is currently hardcoded English per FBL-032, and the i18n rule is translate-fully-or-not-at-all, so copy/locale decisions belong with the owner).
- **Quarantined payload size is unbounded** in the project file (by design: it is the recovery copy, and it originated from that same file). It is excluded from localStorage persistence, so the earlier quota-cascade failure mode does not apply.
- `collectReachablePaperAssetIds` (store) ignores the legacy `font.assetRef` shape that validation's collector still accepts; if such a document ever reaches save, validation now self-repairs the mismatch with a note instead of blanking, but aligning the two collectors would be cleaner.
- The blanket policy that normalization replaces a `managed` locator with an `external` one when the source item has a durable URL is baseline behavior (asserted by pre-existing tests) and was deliberately not re-litigated; AUD-004 (portable bytes) interacts with it and remains open.

## FBL-003

**Not attempted.** FBL-001/FBL-002 are tested, committed, and the branch is clean, but FBL-003 (dirty-document close confirmation + recovery handoff) spans `PaperDocumentTabs`, per-document dirty tracking in paperStore, project-replacement and app-shutdown paths, and confirm-dialog UX/i18n decisions. That full tested scope did not fit the remaining sprint budget, and a partial implementation would have violated the clean-branch condition.

---

## Follow-up (same day): Project Library modal saved a partial document (K3 finding, FBL-001 class)

- **Fix commit:** `6fb1e1be0e836b424b7c3ba7e065d47c1d3656ed`

**Root cause.** `src/components/Layout/ProjectLibraryModal.tsx` kept a private `buildCurrentProjectDocument` that serialized only `flow`/`flowWorkspaces`/`editor`/`sourceBin`/`fileSystem`. `saveProjectDocument` performs a whole-record IndexedDB put, so every modal save path — Save Current Project, Overwrite Selected, Save Project To Folder, Save To Linked Folder, and Set Scratch Folder (all funnel through `persistCurrentProject`) — overwrote the stored project without `paper`, `imageEditor`, or `usageLedger`; the next reopen restored a blank Paper default. `handleExportProjectJson` was a second divergent partial serializer in the same file, so exported `.sloom` files dropped the same slices.

**Reproduced failures (red first).** New `src/components/Layout/ProjectLibraryModal.test.tsx` drives the real modal UI (jsdom, `DockableDialog` stubbed to a div per the SettingsModal test convention) against `fake-indexeddb` and the real `saveProjectDocument`/`loadProjectDocument`/`restoreProjectDocument`. Before the fix all three tests failed with `record.paper` / folder document `paper` / export payload `paper` = `undefined`. Two harness notes: zustand's persist middleware resolves `localStorage` once at store-module import, so the Map-backed stand-in is installed via `vi.hoisted` before any import (Node's experimental `localStorage` getter is undefined without `--localstorage-file`); and the static "Saved Local Projects" header forced condition-based waits instead of matching "Saved" in status text.

**Design.** The modal's builder now delegates to the canonical `buildCurrentProjectDocument` from `projectDocumentActions` (gaining save-time media normalization for free) and layers only its name/id resolution (`projectName.trim() || selectedProject?.name`, `projectId ?? selectedProjectId` — identical fallback chains to before) and linked-folder `fileSystem` metadata on top. Export downloads the stored record verbatim for a selected project, or the canonical full document with embedded asset data for the current workspace; the hand-picked field subset is deleted, not patched. Create-new-project (`handleCreateBlankProject`) is untouched. Net −19 lines of production code; no new serializer, no circular imports (the modal already imported `projectDocumentActions`).

**Semantic delta worth knowing.** Exporting a *stored* project now writes the record as saved (original `savedAt`, no live-workspace backfill of missing fields) instead of a remixed subset stamped `Date.now()` — more honest, and the import path sanitizes on load as before.

**Tests and gates.** New modal suite 3/3 (red → green at the data-loss assertions). Wide sweep `npx vitest run src/components/Layout src/lib/project src/store/paperStore src/lib/paper src/features/paper src/components/Paper`: **129 files, 978/978 passed**. `npx tsc -b --force` (non-incremental, all project references): exit 0. `npx eslint` on both changed files: clean. `git diff --check`: clean. `npm run build` (sandbox disabled): exit 0, fresh `dist/index.html`.

**Remaining risks.** `handleImportProjectFile` persists the parsed file verbatim (pre-sanitize) — restore validates, but the stored record is the raw import; harmless today, worth a sanitize-before-save later. Modal saves and Electron-native saves still produce records independently (AUD-001 multi-window authority remains open).
