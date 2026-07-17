# AUD-001 Source URL transaction lifetime evidence — 2026-07-17

- Requested clean base: `6ff8aefa04664174fd61f63fb6d0778189d3a4ba`
- Initial production/tests commit: `7f244008044fd55599669feb071e971d09367ee3`
- Terra-rejection correction commit: `91aa71d2d80813937ba1228611764f208cf9458f`
- Final status: **approved by fresh independent Terra review** at exact clean `91aa71d`

## Corrected transaction behavior

Temporary `blob:` Source URLs now use URL-level reference counts rather than independent item-only
release. Distinct items and transaction leases can safely share one URL; it is revoked only when its
last live item or lease disappears. `data:` and native/file URLs never enter the revocation pool.

Project preparation immediately leases every prepared B URL, so a later Flow/Image preparation error
releases B without touching A. Before commit, the transaction adopts runtime ownership for every live
A blob URL and then takes an independent A lease. The ownership adoption is necessary for browser
import/live-sync fallback paths that can place a blob URL directly in Zustand before the handle
registry sees it. It keeps A usable when `assertCanCommit()` rejects a concurrent edit or when the
first Source stage throws before mutation.

Source commit transfers store ownership from A to B while both transaction leases remain. Later
renderer store failures unwind to A before releasing the leases; native commit rejection follows the
same rollback. Successful Open/New finalizes only after native commit and authority adoption, releasing
the superseded A lease and the redundant B preparation lease. Browser restore/reset finalizes after its
synchronous renderer commit. Finalize and rollback are idempotent, and a settled failed transaction
cannot be replayed.

Source publication now completes URL ownership synchronization even when a synchronous Zustand
observer throws after state mutation. Source preparation also journals every newly minted scratch blob
URL and best-effort revokes all of them if preparation itself aborts. Cleanup exceptions cannot mask or
interrupt rollback/finalization.

## Permanent regression surface

The two production commits have a net change across seven tracked production/test files of 504 insertions and 69
deletions. New and strengthened cases cover:

- prepared B cleanup after a later Image preparation failure;
- multiple A/B items, shared URLs, `data:` URLs, and native/file URLs;
- unregistered live A ownership during concurrent pre-commit rejection;
- pre-mutation failure at Source plus every later renderer store (workspaces, Flow, editor, usage,
  Paper, and Image);
- repeated native-stage failures, same item id with a changed URL, shared A/B URLs, successful exact-
  once release, and idempotent finalize/rollback;
- cleanup exceptions and throwing Source observers; and
- URL-level shared-handle release behavior.

## Independent Terra gate

Terra first reviewed exact clean `7f24400` and returned **NOT APPROVED**. Its read-only reproductions
showed that an unregistered live A URL was revoked when the first Source stage failed before mutation,
and again when a concurrent Flow edit made `assertCanCommit()` reject before Source commit. The Sol
author preserved that rejected commit, added `91aa71d`, and requested a new review.

Terra then reviewed exact clean `91aa71d` and returned **APPROVED**. It replayed both prior failures and
confirmed that A remained live/unrevoked, B was released once, and later removal released A once. Its
additional stress combined two A items sharing one URL, an A-only URL, repeated Source failures, an
A/B same-id URL replacement, a B item sharing A's URL, double finalization, successful handoff, and
later removal. Terra reported every obsolete URL released exactly once, no over-retention, clean data/
native behavior, all success/failure caller wiring present, and no remaining blocker. Terra made no
edits or commits.

## Verification on exact corrected production HEAD

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
# 26 files passed; 417 tests passed

npx vitest run --configLoader runner \
  src/lib/electronProjectAuthority.test.ts src/lib/electronMainSource.test.ts \
  src/lib/projectDocumentActions.test.ts src/lib/nativeApp.test.ts \
  src/lib/sourceLibraryNativeSync.test.ts src/lib/sourceLibraryAppSource.test.ts \
  src/store/sourceBinLiveSync.test.ts src/lib/workspaceWindowCommands.test.ts \
  src/store/paperStore.test.ts
# 9 files passed; 181 tests passed

npx vitest run --configLoader runner \
  src/components/ImageEditor/ImageEditorDirtyClose.test.tsx \
  src/lib/projectDocumentActions.test.ts src/store/paperStore.test.ts \
  src/store/imageEditorStore.test.ts src/lib/appRecovery.test.ts \
  src/lib/electronProjectFiles.test.ts src/lib/electronStartupProject.test.ts
# 7 files passed; 163 tests passed

npx vitest run --configLoader runner \
  src/lib/sourceAssetHandlePool.test.ts src/lib/projectDocumentActions.test.ts \
  src/lib/electronProjectAuthority.test.ts
# 3 files passed; 77 tests passed

npm run verify:paper-production
# passed

npm run verify:flow-production
# 9 files / 317 tests passed; audit passed with 63 nodes, 182 model contracts,
# and 178 normal model options

npx tsc -p tsconfig.app.json --noEmit --incremental false --pretty false
npx tsc -p tsconfig.node.json --noEmit --incremental false --pretty false
npx tsc -b --force --pretty false
# all passed with no output

npm run lint
# passed with no errors or warnings

node --check electron/main.mjs
node --check electron/project-authority.cjs
node --check electron/preload.cjs
node --check scripts/generate-flow-node-audit.mjs
node --check scripts/verify-flow-production.mjs
# all passed with no output

git diff --check
# passed with no output

CI=1 npm run build
# passed
```

The test runs retained Node's `module.register()` deprecation and localStorage experimental warnings.
Verifier-generated untracked `artifacts/` directories were moved to trash after each run and were not
committed. No task-created process or temporary path remains.

## Residual authority

No known AUD-001 Source URL lifetime blocker remains. This evidence records the independent Terra
approval; it is not self-approval. No amend, rebase, push, merge, or integration was performed.
