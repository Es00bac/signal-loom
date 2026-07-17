# AUD-001 final correction — transactional authority publication

- Date: 2026-07-16
- Base reviewed: Fable HEAD `1e653a4`
- Production and tests: `11a422a`
- Status: implementation complete; a fresh provider must gate it. This note is evidence, not approval.

## Red reproduction

Before production edits, the new authority source guards were run against Fable HEAD plus
the regression test draft:

```text
npx vitest run --configLoader runner src/lib/electronProjectAuthority.test.ts
# 18 passed, 2 failed
# - save remembered its path after target write/canonical publication
# - renderer reload/navigation/crash did not invalidate its adoption claim
```

The failure checks directly covered the two precondition violations Sol reproduced. Existing
two-renderer cases already covered N/N+1 write counts, switched Save As, Open fan-out,
dialog races, and restart/baton behavior; this correction adds permanent real-gateway cases
for canonical snapshot visibility while Open is in flight, destroyed delayed Save As,
same-`webContents.id` reload epoch invalidation, failed Save As rollback, and dirty Paper
replacement alongside the existing dirty Image coverage.

## Corrected boundary

`electron/project-authority.cjs` now owns the authority descriptor **and** the canonical
document/path/scratch snapshot. Open and Save prepare every awaited operation inside its
mutation queue, rechecking the sender immediately after each handoff. Only a synchronous
`publish` callback can mirror the now-committed snapshot into `main.mjs` globals, after which
the authority event fans out. Adoption reads that coupled gateway snapshot rather than a
separate mutable `startupProject` global.

Main’s save/open preparation never publishes `currentProjectPath` or `startupProject`; it
checks liveness before each I/O phase and before the target write. A remember-path failure now
happens before target write/publication. Save As and Open only publish through
`publishCommittedProjectSnapshot` after gateway commit. Renderer claims include a main-owned
epoch: `did-start-navigation`, `render-process-gone`, and `destroyed` all invalidate adoption,
including reloads that retain the same `webContents.id`.

Project replacement now protects dirty Paper work as well as Image work. The Paper guard is
conservative and uses retained Paper undo history; explicit discard/successful save paths pass
the paired Image/Paper authorization flags and retain the existing restore rollback behavior.

## Verification

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
  src/lib/projectAssets.test.ts src/lib/appRecovery.test.ts
# 20 files, 250 tests passed

npx tsc -b --force                 # passed
npx eslint <8 changed files>       # passed
CI=1 npm run build                 # passed
git diff --check                   # passed
```

`CI=1 npm run verify:flow-production` ran its nine Vitest files successfully (317 tests),
then stopped at the pre-existing generated-artifact failure:
`docs/audits/flow-node-audit-2026-07-15.md` is stale. That verifier was not regenerated in
this AUD-001-only correction.

## Residual risks for the independent gate

- Native filesystem save spans a remembered-path record, backup, and target write; the new
  order prevents the reported remember-path failure from publishing a project, but a sudden
  process/OS failure during the underlying filesystem write remains inherently outside an
  in-memory mutex. The existing overwrite backup remains the recovery path.
- Paper’s current dirty signal is retained undo history. It safely errs toward blocking a
  replacement, but a future per-tab saved-baseline marker would provide more exact dirty
  reporting for inactive Paper tabs.
- A fresh provider should rerun the focused matrices and inspect the Electron runtime behavior;
  this correction makes no approval claim.
