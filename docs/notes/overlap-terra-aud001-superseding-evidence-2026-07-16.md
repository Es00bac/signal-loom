# AUD-001 superseding correction evidence — 2026-07-16

- Required base retained: `dee2430528d422a32c8d791253ac8b548544906b`
- Earlier correction retained: `a286a914e0fdbb487755f49857952dc75b25ad77`
- Production code and permanent regressions: `d8c0baa`
- Status: **not approved**. This note is correction evidence only; fresh independent Sol approval is mandatory.

## Corrected behavior

The pure authority gateway now awaits staged rollback on every sender-loss and
exceptional pre-commit exit for Open, Save/Save As, and New. The regression
drives each operation through async preparation, destroys the sender before
the closed commit, and asserts the staged rollback ran while canonical native
authority remains unchanged.

Native save/open preparation now carries an exact scratch-target journal.
Before a materialized scratch asset is copied or written it records the prior
bytes (or absence). Rollback restores those bytes, removes targets created by
the attempt, restores the staged startup/target/backup state, and removes a
newly-created scratch directory only if it is still empty. The journal is
awaited by the gateway rollback path, including post-commit publication
failure rollback; it does not recursively remove a directory that another
writer populated.

Renderer Source events and startup snapshot replies now require an exact
authority descriptor matching the current renderer claim. Missing authority is
rejected, and the listener restarts on claim identity/version changes. Renderer
New no longer blindly restores the full old project after a late Source reset
failure: it conditionally restores a store only when that store still equals
the reset transaction's own post-state. The regression injects a late Source
failure and a concurrent Flow edit and proves the concurrent edit remains.

## Verification

```text
npx vitest run --configLoader runner \
  src/lib/electronProjectAuthority.test.ts src/lib/electronMainSource.test.ts \
  src/lib/electronProjectFiles.test.ts src/lib/electronStartupProject.test.ts \
  src/lib/projectDocumentActions.test.ts src/lib/projectSyncService.test.ts \
  src/lib/projectSyncClient.test.ts src/lib/projectEditLock.test.ts \
  src/lib/editLockSync.test.ts src/lib/projectValidation.test.ts \
  src/lib/projectSchemaParity.test.ts src/lib/nativeApp.test.ts \
  src/lib/nativeProjectDocument.test.ts src/lib/flowGraphNativeSync.test.ts \
  src/lib/paperDocumentNativeSync.test.ts src/lib/imageDocumentNativeSync.test.ts \
  src/lib/sourceLibraryNativeSync.test.ts src/lib/projectMediaReferences.test.ts \
  src/lib/projectAssets.test.ts src/lib/appRecovery.test.ts \
  src/store/sourceBinLiveSync.test.ts src/lib/workspaceWindowCommands.test.ts \
  src/store/paperStore.test.ts src/store/imageEditorStore.test.ts src/store/flowStore.test.ts
# 25 files, 376 tests passed

npx tsc -b --force                 # passed
npx eslint electron/project-authority.cjs electron/main.mjs src/App.tsx \
  src/lib/projectDocumentActions.ts src/lib/electronProjectAuthority.test.ts \
  src/lib/projectDocumentActions.test.ts  # passed
node --check electron/main.mjs     # passed
node --check electron/project-authority.cjs # passed
git diff --check                   # passed
CI=1 npm run build                 # passed
```

The new gateway tests are red on `dee2430`: that revision returns sender-gone
after prepare without calling staged rollback. The conditional reset regression
is red on `dee2430`: its catch block blindly calls `restoreProjectDocument` and
replaces the injected concurrent Flow edit with the prior snapshot.

## Mandatory residual gate work

This correction does **not** claim to close the entire Sol BLOCK matrix. In
particular, Open/New still need a true two-phase renderer authorization and
transactional hydration/reset protocol before the native authority commits;
the current UI can still reach a native Open/New commit before a fallible
renderer replacement completes. Source native mutation handlers also need a
serialized post-await authority revalidation plus cancellation/epoch guards
for capability registration/replacement, with exact version-preserving
publication rollback. Conditional rollback is presently implemented for the
reset transaction's synchronous Flow/Editor/Usage/Paper phases; an independent
gate must still prove equivalent concurrent-edit preservation for Source and
Image, as well as the full external-open/reload/crash/retry matrix.

No live Electron smoke was run in this correction pass. No disposable paths,
probes, or processes were created. This author does not self-approve.
