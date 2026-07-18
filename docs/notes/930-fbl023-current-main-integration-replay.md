# 930 — FBL-023 current-main integration replay

**Integration branch:** `integration/fbl023-20260717`

**Exact base:** `3e78876a04277f60f8ea039aeb215eed8bf781cc`

**Approved source:** `4ee07f798947bfcde586c6d492a0239542f65645`

## Replay audit

The complete twelve-commit FBL-023 lineage from source merge-base `3d628c8`
was replayed, rather than applying only the final two corrections. Current main
had no competing change in any of the seventeen FBL-023 production, regression,
task-list, or evidence paths. `git range-diff` reports every replayed commit as
patch-equivalent (`=`), and the resulting state of all approved paths is exactly
the approved source state. The current-main diff contains no deletion and no
unrelated file.

The replay preserves the full approved contract: authoritative rich slices in
every threaded frame, exact rich/plain half-open source ownership, styled
CR/LF/CRLF conservation, paragraph/list/folio ownership, destination typography
and geometry, observable Canvas font acceptance, bounded live-CSS fallback,
exception-safe probe cleanup, and non-editable continuation rendering.

## Current-main verification

- Exact focused matrix: **6 files, 138 tests passed**.
- Paper neighbor matrix: **18 files, 304 tests passed**. This is nine more tests
  than the approved branch's 295-test result because current main includes the
  integrated FBL-021 document-history regressions.
- Video/Paper canvas compatibility: **2 files, 36 tests passed**.
- `tsc -p tsconfig.app.json --noEmit --incremental false --pretty false` passed.
- `tsc -p tsconfig.node.json --noEmit --incremental false --pretty false` passed.
- ESLint over all twelve changed production/test files passed with zero errors;
  `PaperWorkspace.tsx` retains four warnings outside the replayed hunks.
- `npm run verify:paper-production` passed. Its report is preserved outside the
  worktree at
  `/mnt/d/work_SPaC3/verification-artifacts/fbl023-integration-3e78876-20260717/`
  with report SHA-256
  `59eac3b08916898c4d66145515f01143847c74c8771257de18203c566d09d3b1`.
- Range diff, `git diff --check`, cached diff check, source-path identity audit,
  and final clean-status check passed.

This disposable branch has not changed or merged main. It is ready for the root
integration review; audit closure is not claimed until that review and the
main-branch gate succeed.
