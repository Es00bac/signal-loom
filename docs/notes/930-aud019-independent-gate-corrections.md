# AUD-019 independent-gate corrections

## Scope

This follow-up keeps the schema-v1 multi-tab Paper workspace implementation from `d8c763c9` and
corrects the three failures reproduced by the independent gate. Production and permanent regression
coverage are in `c55b94c`.

## Corrections

- A snapshot that contains `workspace` is always treated as an envelope claim. An unsupported
  `schemaVersion` now fails closed instead of falling through to the historical active-document path.
- Receiver publication now stages and authenticates the complete record set, uses an explicit atomic
  batch in the memory and IndexedDB repositories, and retains a compensating baseline rollback for
  older repository implementations. A later failed write restores/removes every earlier write and
  leaves the Paper workspace unchanged, including when records pre-existed the operation.
- Every resolved record is bound to its authored role before repository or store publication: image
  frames require image MIME records, managed faces require font records, linked licenses require text
  records, and managed color profiles require ICC profile records. One digest cannot masquerade across
  incompatible roles.
- The LAN inventory is now staged separately from the last accepted inventory. Only a successfully
  applied envelope replaces/prunes the accepted inventory, and an authority mutate that returns no
  state change is not appended to the shared event log.

## Permanent regressions

`paperSyncChannel.workspace.test.ts` covers the independent 3/3 red probe directly:

1. unsupported workspace schema leaves both the tab catalog and repository at baseline;
2. injected failure on the second repository write rolls back the first while preserving an exact
   managed record and an unrelated pre-existing record;
3. a correctly hashed font record substituted into an image-frame role is rejected before publication.

The success fixture now also round-trips a linked font-license record alongside managed art, font, and
ICC bytes. Project-sync service and LAN tests prove staged inventory preservation and rejected-change
log behavior.

## Verification

- Focused/adjacent Paper sync, Paper store, LAN, project-sync, repository, and asset matrix: **13 files,
  145 tests passed**.
- Final blocker-focused matrix after the last sequencing edit: **4 files, 45 tests passed**.
- `tsc -p tsconfig.app.json --noEmit --incremental false`: passed.
- `tsc -p tsconfig.node.json --noEmit --incremental false`: passed.
- ESLint over all nine touched production/test files: passed.
- `git diff --check`: passed.
- `npm run verify:paper-production`: passed against exact production/tests commit `c55b94c`.
- Generated verification outputs were moved off the candidate worktree, retained at
  `/mnt/d/work_SPaC3/verification-artifacts/aud019-paper-sync-c55b94c-20260717-2114`, and verified by
  its `SHA256SUMS` manifest. The earlier verification run remains separately preserved at
  `/mnt/d/work_SPaC3/verification-artifacts/aud019-paper-sync-20260717-2112`.

This is author correction evidence only. It does not claim independent approval, integration, archive,
or audit closure.
