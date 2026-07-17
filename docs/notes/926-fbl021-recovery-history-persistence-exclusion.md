# 926 — FBL-021 gate fix: recovery stacks excluded from persistence

Branch `overlap/fable-fbl021-paper-tab-history`. Correction commit:
`49ae54dec3dda43d33ea44c2f64373e35f76dad9` on top of reviewed HEAD
`95d539f175611d147481f8daab301bd6d068b2fd`.

Supersedes the "pre-existing and unchanged" recovery-persistence claim in note 925: the Terra
final gate correctly ruled that FBL-021 requires **all** history — including recovery-only
stacks — out of persisted project/workspace payloads, and note 925's own change had widened
the leak by capturing inactive tabs' stacks into recovery records.

## Blocker (confirmed at 95d539f)

`projectPersistedPaperWorkspace` forwarded `discardedDocumentRecoveries` unchanged into the
Zustand persisted projection. Per-tab recovery capture (925) now writes an inactive tab's
`undoStack`/`redoStack` into those records, and `sanitizePaperDiscardRecoveries` sanitized and
re-accepted those fields on rehydrate. Reproduction: edit A; create/edit B; switch to A;
`captureDocumentRecovery([B], 'baton-handoff')` → the projection's first recovery record
contained B's history (verified red: `expected '{"document":…' not to contain '"undoStack"'`).
Each history entry embeds a full document snapshot, so this also grew the quota-sensitive
localStorage record.

## Fix (smallest correct)

- `projectPersistedPaperWorkspace` maps recovery records through a destructure that sheds
  `undoStack`/`redoStack`; the document snapshot and all other recovery metadata still persist.
  Live store records are not mutated (new objects per projection).
- `sanitizePaperDiscardRecoveries` no longer reads or emits history fields, so rehydrate
  ignores them even in older or hostile stored records. The now-orphaned
  `sanitizePaperHistory` helper is deleted (its only consumer was this path).
- `PaperDiscardedDocumentRecovery.undoStack` doc comment now states the session-scoped
  contract. In-memory behavior is untouched: `createPaperDiscardRecovery` still captures the
  target tab's own stacks and `restoreDiscardedDocument` still restores them same-session.

## Behavior delta (approved by the gate)

A recovery record rehydrated after an app restart restores the document without undo/redo
continuation (previously, active-tab-captured records restored stacks across restarts).
Same-session deliberate recovery keeps full per-tab history — pinned by both the 925 test and
the new regression test's restore step.

## Red evidence

```
./node_modules/.bin/vitest run src/store/paperStore.test.ts -t 'persisted projection and rehydrate'
  Tests  1 failed | 43 skipped (44)
  AssertionError: expected '{"document":…' not to contain '"undoStack"'
```

## Green evidence

```
./node_modules/.bin/vitest run src/store/paperStore.test.ts
  Tests  44 passed (44)

focused matrix (same 18 files as note 925: paperStore{,.remoteSync}, paperLossPreventionStore,
  PaperDocumentTabs, appRecovery, batonHandoffSnapshot.paper, paperBeforeUnload,
  paperLossPrevention, paperDocumentSave,
  projectDocumentActions{,.composedDirtyClose,.replacementOrdering},
  nativeStartupProjectReplacement, paperSyncChannel, projectPaperPortableAssets,
  imageEditorRecoveryResources, ProjectLibraryModal, ErrorBoundary)
  Test Files  18 passed (18)   Tests  311 passed (311)

./node_modules/.bin/tsc -b --force                                   → exit 0
./node_modules/.bin/eslint src/store/paperStore.ts \
  src/store/paperStore.test.ts src/types/paper.ts                    → exit 0
git diff --check                                                     → clean
```

The new regression test pins, in one flow: the in-memory record retains the inactive tab's
own single-entry history; the exact projection JSON contains no `undoStack`/`redoStack`/
`documentHistories` keys; `mergePersistedPaperWorkspace` over records carrying stacks yields
records without them (snapshot intact); and same-session `restoreDiscardedDocument` still
restores the tab's history and undoes its edit.

## Residual risk

- Post-restart recovery records intentionally lose undo continuation; only their document
  snapshots survive. If cross-restart history continuation is ever wanted, it needs its own
  bounded design — nothing in the current requirements asks for it.
