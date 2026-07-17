# Overlap: Sonnet AUD-016 file-operation error boundary — 2026-07-17

Worktree `flow-overlap-sonnet-aud016-file-operation-errors`, branch
`overlap/sonnet-aud016-file-operation-errors`. Exact base
`3d628c858d7c69bff424c61fea9d595bf327b93b` (clean). Production + test commit `26bb367`
(single commit, per instructions). Scope: AUD-016 only — no other audit findings, no
Flow execution/store, backend-proxy/envelope, Composition, or AUD-011/AUD-013/FBL-019 code
touched.

## Finding re-confirmed before editing

`docs/audits/codebase-correctness-audit-2026-07-16.md` AUD-016 (High/Certain): Project
Save/Save As, media import, scratch-folder selection, and asset export ran with no error
boundary in `src/App.tsx`, while menu/keyboard/navbar/gamepad dispatch all call
`handleAppMenuCommand` via `void` (fire-and-forget). An uncaught rejection anywhere inside
those command bodies became a silent unhandled promise rejection with no user-facing
failure. Re-traced against the current tree (post project-authority/dirty-document work) and
confirmed still reachable exactly as described:

- `file:save` / `file:save-as` (`src/App.tsx`, native branch) had no try/catch around
  `buildNativeSaveProjectDocument`, `bridge.saveProjectFile(As)`, or the post-save mutation
  block (scratch path, Source Library apply, `markDocumentClean`,
  `acknowledgePaperProjectSnapshot`). The browser fallback (`downloadCurrentProjectDocument`)
  was likewise uncaught.
- `file:import-media` ignored a thrown `bridge.importMediaFiles` rejection, ignored the typed
  `result.error` field entirely (only `result.rejected` was read), and left
  `importNativeFiles` (post-picker ingest) uncaught.
- `file:set-scratch-folder` left the browser `pickDirectory`/`migrateAssetsToScratch` path
  uncaught (including a user-cancelled native picker, which rejects with `AbortError` and was
  therefore *also* an unhandled rejection, not a silent cancel), and ignored the native
  bridge's typed `result.error`.
- `file:export-assets` called `exportProjectAssets(nodes)` with no error handling at all.
- The structured stale-project-authority `result.rejected` → `confirmStaleProjectReload()`
  path, and every `result.canceled` short-circuit, were already correct and needed to stay
  byte-for-byte distinct from the new generic failure path.

Adjacent commands (`image:file-save-as`, `paper:file-open`, `paper:file-save(-as)`,
`file:export-project`) already followed a catch → `showAlertDialog({ title, message, tone:
'danger' })` convention; AUD-016's fix reuses that exact shape via one small helper instead of
inventing a new pattern.

## Fix

New `src/lib/fileOperationBoundary.ts`: `runFileOperation(title, operation, fallbackMessage?)`
runs `operation()`, silently returns on `isAbortError` (shared `src/lib/abortSignals.ts`
cancellation check — covers a user-dismissed native/browser picker), and otherwise awaits
`showAlertDialog({ title, message: error instanceof Error ? error.message : fallbackMessage,
tone: 'danger' })`. It never rethrows, so a fire-and-forget `void handleAppMenuCommand(...)`
caller can never observe an unhandled rejection from a wrapped command.

`src/App.tsx` changes (5 call sites, same helper, same title per action pair):

- `file:save` / `file:save-as` — both the browser download fallback and the entire native body
  (document build → bridge call → post-save mutations) now run inside
  `runFileOperation('Save Project Failed', ...)`. The existing `result.rejected` →
  `confirmStaleProjectReload()` and `result.canceled` early-returns are unchanged and sit
  *inside* the wrapped operation, so they still short-circuit before any mutation and never
  reach the new catch.
- `file:import-media` — wrapped in `runFileOperation('Import Media Failed', ...)`; added a
  `if (result.error) throw new Error(result.error)` branch so the previously-ignored typed
  error now surfaces.
- `file:set-scratch-folder` — both browser and native bodies wrapped in
  `runFileOperation('Set Scratch Folder Failed', ...)`; same `result.error` → throw addition
  on the native side.
- `file:export-assets` — wrapped in `runFileOperation('Export Assets Failed', ...)`.

No success-only mutation (`markDocumentClean`, `acknowledgePaperProjectSnapshot`,
`setNativeScratchDirectoryPath`, Source Library apply) moved outside its original
post-success position — they simply now live inside a body that only reaches them after every
prior await succeeds, and any throw before that point skips them entirely by construction
(exception unwind), not by added guards.

## Red/green evidence (permanent, production-path)

Red baseline: `src/App.fileOperationErrors.test.tsx` and `src/lib/fileOperationBoundary.ts`
were written first (TDD); the App-level integration test was run against the **unmodified**
parent `src/App.tsx` (helper module already present, App.tsx untouched):

```
npx vitest run src/App.fileOperationErrors.test.tsx
# 14 failed | 3 passed (17)
```

The 3 pre-existing passes were the paths that were already correct and had to stay that way:
native-save cancellation silence, the structured stale-authority-rejection reload path, and
import-media cancellation silence. Every one of the 14 failures was at the audited symptom:
`showAlertDialog` never called (0 calls) for every throw/typed-error/ingest-failure scenario,
**and**, for every throw-based scenario, a real `process.on('unhandledRejection')` listener
(registered per-test, asserted empty in `afterEach`) captured the exact escaped error object —
proving the defect is a genuine unhandled rejection, not just a missing UI dialog. This
included the browser-cancel scenario (`pickDirectory` rejecting with `AbortError`), confirming
cancellation itself was unhandled pre-fix, not merely unhandled *incorrectly*.

Green after the fix (same command, final tree):

```
npx vitest run src/App.fileOperationErrors.test.tsx src/lib/fileOperationBoundary.test.ts
# 2 files, 23/23 passed
```

## Route-by-route disposition

| Command | Failure mode | Dialog | Cancel/rejected preserved |
| --- | --- | --- | --- |
| `file:save` (native) | doc-build throw, bridge throw, post-save mutation throw | `Save Project Failed` | `result.canceled` silent; `result.rejected` → `confirmStaleProjectReload()` (verified via a mocked `requestConfirmation` spy asserting `'Project Out of Date'` was invoked, and `Save Project Failed` was *not*) |
| `file:save` (browser) | `downloadJsonFile` throw | `Save Project Failed` | n/a (no cancellable picker) |
| `file:save-as` (native + browser) | same as Save | `Save Project Failed` | same as Save |
| `file:import-media` | bridge throw, typed `result.error`, `importNativeFiles` throw | `Import Media Failed` | `result.canceled` silent; `result.rejected` unchanged reload path |
| `file:set-scratch-folder` (native) | bridge throw, typed `result.error` | `Set Scratch Folder Failed` | `result.canceled` silent; `result.rejected` unchanged reload path |
| `file:set-scratch-folder` (browser) | `pickDirectory` throw, `migrateAssetsToScratch` throw | `Set Scratch Folder Failed` | `pickDirectory` `AbortError` (user dismiss) silent |
| `file:export-assets` | `exportProjectAssets` throw | `Export Assets Failed` | n/a |
| Fire-and-forget dispatch | any of the above, invoked exactly as production does (`(command, source) => void handleAppMenuCommand(command, source)`, uncalled/unawaited by the caller) | dialog still shown | dedicated test + suite-wide `afterEach` `process.on('unhandledRejection')` assertion: zero escapes across all 17 App-level scenarios |

`file:export-project` was already correctly wrapped (a prior commit fixed it ahead of this
finding) and was left untouched — out of scope per the instructions, and its existing
behavior is covered by its own pre-existing dialog convention, not by this change.

## Gates

- Helper TDD: `npx vitest run src/lib/fileOperationBoundary.test.ts` — red (module missing) →
  green, **6/6 passed**.
- App integration: `npx vitest run src/App.fileOperationErrors.test.tsx` — red (14/17 failed,
  documented above) → green, **17/17 passed**.
- Focused command/App/project-asset/dialog suite (19 files — the two new files plus
  `App.flowContextMenu`, `appMenuModel`, `appSmoke`, `commandPalette`, `electronMenu`,
  `electronProjectAuthority`, `keyboardShortcuts`, `projectAssets`, `fileSystemWorkspace`,
  `nativeProjectDocument`, `projectDocumentActions` (+ `composedDirtyClose` +
  `replacementOrdering`), `alertDialogStore`, `sourceBinStore` (+ `Fallback`), `AlertDialog`):
  **309 passed** (plus the 23 above — no failures, no skips).
- Forced non-incremental TypeScript: `npx tsc -b --force` (deletes no cache manually, but
  `--force` ignores incremental state) — **exit 0**, no errors in either project reference.
- Changed-file ESLint (`src/App.tsx`, `src/App.fileOperationErrors.test.tsx`,
  `src/lib/fileOperationBoundary.ts`, `src/lib/fileOperationBoundary.test.ts`): **0 errors, 0
  warnings** (one `no-await-in-loop` disable-directive was flagged as unused and removed —
  the loop body is a sequential microtask/macrotask flush by design, not a lint violation).
- `git diff --check`: clean.
- The full repository suite and `npm run build` were deliberately **not** run, per the
  instructions (focused suites + forced typecheck + changed-file lint + diff-check only).

## Residual risks

- `runFileOperation`'s fallback message is generic per call site (e.g. "The current project
  could not be saved."); a thrown non-`Error` value with no useful `message` will show that
  fallback rather than any structured detail it might carry (e.g. a plain object with a
  `code` field). This matches the existing convention at every other adjacent catch site in
  `src/App.tsx` and was not changed.
- The native Save/Save-As post-save mutation block (`markDocumentClean`,
  `acknowledgePaperProjectSnapshot`, Source Library apply) can still partially run if a later
  step in that block throws after an earlier step in the same block succeeded — e.g. the disk
  write genuinely succeeded and `markDocumentClean` ran, but `acknowledgePaperProjectSnapshot`
  then throws. That is by design and unchanged from this fix: the underlying save truly
  happened, so the resulting `Save Project Failed` dialog is reporting a real post-save
  processing failure, not a false negative — this is the same partial-mutation shape the
  pre-existing `saveCurrentProjectForPaperLossPrevention` helper already accepts.
- `file:export-project` was intentionally left alone; it already had its own try/catch and
  `Export Project Failed` dialog before this change and was out of scope.
- The Image/Paper "does not falsely mark clean" regression checks assert via a spy on
  `markDocumentClean` and a mocked `acknowledgePaperProjectSnapshot` (module-level mock), not
  by asserting the on-disk/store byte content — sufficient to prove the control-flow ordering
  this finding is about, but not a substitute for the existing dirty-baseline unit suites
  covering the store logic itself (`imageEditorStore`, `paperLossPrevention`), which were run
  unchanged as part of the focused suite above and stayed green.
