# AUD-001 atomic authority correction — 2026-07-16

- Base: clean `18b585d60a65ca99de525f20126c6c0c1664c98a`
- Production and permanent regressions: `a286a914e0fdbb487755f49857952dc75b25ad77`
- Status: correction evidence only. A fresh K3 or Sol provider must gate this tree.

## Transaction boundary

`electron/main.mjs` now stages the serialized target in its destination directory,
the prior target bytes, the startup record, and a prospective overwrite backup before
the gateway commits. The synchronous closed commit writes the backup, renames the
staged target, and replaces the startup record before the gateway advances its single
canonical authority/document snapshot. A failed startup/target/publication path restores
the target and startup record and removes the created backup/stage.

There is intentionally no sender-liveness callback after that closed target commit: a
renderer destroyed immediately after the atomic rename receives a successful committed
operation rather than a rejected IPC paired with old authority. Open and New similarly
stage startup/reset effects; they do not mutate Source/startup globals during preparation.

Publication now mirrors the canonical snapshot into the main globals and Source snapshot
as one synchronous operation. Individual BrowserWindow sends are guarded, the authority
gateway isolates a throwing broadcast listener, and a throwing publication invokes the
previous canonical mirror plus staged rollback before returning a rejection.

## Renderer and Source binding

- Native Source snapshot sync and delta IPC require the current adopted authority claim and
  renderer epoch. Snapshot/event responses carry their authority for renderer-side rejection.
- BroadcastChannel workspace commands carry the same claim; receivers discard missing, stale,
  unrelated, and self-originated commands before any workspace mutation.
- Paper replacement uses a saved baseline per document tab rather than the active tab's shared
  undo stack. An edited inactive tab now blocks replacement.
- New waits for native clear success before touching renderer stores. `resetProjectDocument`
  captures a full Flow/Video/Source/Paper/Image project snapshot and restores it if any late
  reset phase fails.

## Regression sensitivity and verification

The permanent gateway regressions cover a sender dying inside the closed target commit,
throwing publication rollback, and a throwing observer that must not reject a successful
save. Against the previous gateway these are meaningful red cases: it did not invoke staged
commit/rollback and a thrown observer escaped the operation. The inactive-Paper-tab and stale
workspace-command regressions likewise fail the former active-undo-only and claimless designs.

```text
npx vitest run --configLoader runner \
  src/lib/electronProjectAuthority.test.ts src/lib/electronMainSource.test.ts \
  src/lib/electronProjectFiles.test.ts src/lib/electronStartupProject.test.ts \
  src/lib/projectDocumentActions.test.ts src/lib/projectSyncService.test.ts \
  src/lib/projectSyncClient.test.ts src/lib/projectEditLock.test.ts src/lib/editLockSync.test.ts \
  src/lib/projectValidation.test.ts src/lib/projectSchemaParity.test.ts src/lib/nativeApp.test.ts \
  src/lib/nativeProjectDocument.test.ts src/lib/flowGraphNativeSync.test.ts \
  src/lib/paperDocumentNativeSync.test.ts src/lib/imageDocumentNativeSync.test.ts \
  src/lib/sourceLibraryNativeSync.test.ts src/lib/projectMediaReferences.test.ts \
  src/lib/projectAssets.test.ts src/lib/appRecovery.test.ts src/store/sourceBinLiveSync.test.ts \
  src/lib/workspaceWindowCommands.test.ts src/store/paperStore.test.ts \
  src/store/imageEditorStore.test.ts src/store/flowStore.test.ts
# 25 files, 373 tests passed

npx tsc -b --force                 # passed
npx eslint <changed lineage>       # passed
CI=1 npm run build                 # passed
git diff --check                   # passed
```

Residuals for the independent gate: native scratch materialization still creates recoverable
scratch files while staging a project, and renderer reset failure after a successful native
clear is made safe by retaining/restoring the old renderer snapshot but leaves that renderer
stale against the newly committed blank authority until it reloads. A provider should exercise
the actual Electron filesystem with injected target/startup/backup/source failures and inspect
the stated rollback behavior before approval.
