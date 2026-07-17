# AUD-001 final superseding correction evidence — 2026-07-16

- Requested clean base: `097fa37805f85d9df219bea78240006ba8a25b42`
- Retained earlier corrections: `11a422aef1c2a87f6111cf577615abb1e96cc0cb`, `a286a914e0fdbb487755f49857952dc75b25ad77`, and `d8c0baa387d0ed059a480d358659a276e670c627`
- Production code and permanent regressions: `247d07e1fe03caff202a7cb6bbc1563e0f64e0a3`
- Status: correction complete, **not approved**. Fresh independent Terra approval is mandatory.

## Superseding behavior

Open and New now reserve a native prepare token under the project mutation lease while authority,
durable target, startup state, Source version, and capability maps remain on project A. The renderer
performs every fallible migration, Source hydration, Flow asset restoration, Image pixel decode, and
dirty Paper/Image authorization before entering a claim-withholding transition barrier. Only then are
the prepared renderer stores and native staged result committed. Tokens are sender/renderer-epoch/base-
claim bound, replay-safe, cancelable, and invalidated with rollback on reload, crash, or destruction.

Renderer rollback is per-store and conditional. Each Source, Flow workspace, Flow, Editor, usage,
Paper, and Image stage records its own post-commit identity and inverse. A store action that throws
before mutation aborts and unwinds prior transaction-owned stages; a throwing Zustand observer after
mutation cannot strand later stores. Concurrent edits make only that store's inverse decline, so the
edit survives while the other transaction-owned stages return to A. Save and Save As no longer run a
fallible whole-project restore after native authority advances; unchanged Image objects and exact Paper
signatures alone become clean, while edits made during the save remain dirty.

Source snapshot reads, deltas, automation commands, materialization, imports, and scratch selection now
require exact adopted authority. Native async preparation is serialized and reauthorized at commit.
Renderer Source publication, repair, materialization, and hydration capture the authority epoch and
discard old completions after a switch. Capability replacement is prepared off-state and committed with
the Source snapshot. Publication failure restores the exact prior Source snapshot/version and capability
maps without a republish increment. Source materialization journals prior scratch bytes and restores them
on rejection or sender loss.

The accepted external-open boundary uses the same prepared token: an invalid caller cannot consume it,
authority stays on A, and the owning renderer can retry only the closed commit without repeating disk
load/preparation. The permanent regression proves one load, no half-authority observation, and replay
rejection after success. Dirty inactive Paper tabs and dirty Image documents remain explicitly authorized
or recoverable; no FBL-003 branch implementation was copied.

The Flow production verifier exposed a one-row stale generated audit already present at the requested
base. `scripts/generate-flow-node-audit.mjs` regenerated the Switch Case input row from the current
contracts; the verifier then passed.

## Permanent regression surface

The production commit changes 22 tracked files by 2,037 insertions and 478 deletions. It adds or rewrites
20 `it`/`it.each` declarations, representing 32 concrete matrix cases after the two seven-store tables
expand. Coverage includes prepared Open/New commit/cancel/replay/sender loss, commit-only external retry,
serialized Source switch races, missing/stale authority, renderer epoch barriers, exact Source version,
scratch rollback, throwing observers, dirty Paper/Image authorization, preparation failures, and both
seven-store concurrent-edit and seven-store stage-failure/inverse matrices.

Old-code sensitivity was measured in a disposable in-repository `git archive` of `097fa37` with the
current authority test file. Result: 31 tests ran, 5 failed. The base lacks `prepareOpenProject`,
`prepareClearProject`, and `runAuthorizedMutation`; it also retains the fallible post-save
`restoreProjectDocument(savedDocument...)` path. The archive was removed after the run.

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
  src/lib/sourceLibraryNativeSync.test.ts src/lib/sourceLibraryAppSource.test.ts \
  src/lib/projectMediaReferences.test.ts src/lib/projectAssets.test.ts \
  src/lib/appRecovery.test.ts src/store/sourceBinLiveSync.test.ts \
  src/lib/workspaceWindowCommands.test.ts src/store/paperStore.test.ts \
  src/store/imageEditorStore.test.ts src/store/flowStore.test.ts
# 26 files passed; 405 tests passed

npx vitest run --configLoader runner \
  src/lib/electronProjectAuthority.test.ts src/lib/electronMainSource.test.ts \
  src/lib/projectDocumentActions.test.ts src/lib/nativeApp.test.ts \
  src/lib/sourceLibraryNativeSync.test.ts src/lib/sourceLibraryAppSource.test.ts \
  src/store/sourceBinLiveSync.test.ts src/lib/workspaceWindowCommands.test.ts \
  src/store/paperStore.test.ts
# 9 files passed; 169 tests passed

npx vitest run --configLoader runner \
  src/components/ImageEditor/ImageEditorDirtyClose.test.tsx \
  src/lib/projectDocumentActions.test.ts src/store/paperStore.test.ts \
  src/store/imageEditorStore.test.ts src/lib/appRecovery.test.ts \
  src/lib/electronProjectFiles.test.ts src/lib/electronStartupProject.test.ts
# 7 files passed; 151 tests passed

npm run verify:paper-production
# passed

npm run verify:flow-production
# 9 files / 317 tests passed; audit passed with 63 nodes, 182 model contracts,
# and 178 normal model options

npx tsc -p tsconfig.app.json --noEmit --incremental false --pretty false
npx tsc -p tsconfig.node.json --noEmit --incremental false --pretty false
npx tsc -b --force --pretty false
# all passed with no output

npx eslint <all changed CJS/MJS/TS/TSX lineage files>
# passed with no output

node --check electron/main.mjs
node --check electron/project-authority.cjs
node --check electron/preload.cjs
node --check scripts/generate-flow-node-audit.mjs
node --check scripts/verify-flow-production.mjs
# all passed with no output

git diff --check
# passed with no output

CI=1 npm run build
# passed; 3,255 modules transformed
```

The build retained existing non-fatal warnings for runtime-resolved `new URL("./", import.meta.url)`,
browser-externalized `module` imports in HarfBuzz/LCMS, and large chunks. The test runs retained Node's
`module.register()` deprecation and localStorage experimental warnings. No correction-specific errors,
temporary paths, verifier artifacts, or task-created processes remain.

## Residual authority

No known gate-critical implementation residual is admitted by this correction. Live Electron UI
observation was not substituted for the deterministic sender-loss/reload/crash/disk/recovery matrices,
and external press/provider/platform behavior remains outside AUD-001. The required residual action is
fresh independent Terra review; this Sol author does not self-approve, merge, push, or integrate.
