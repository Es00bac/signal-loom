# FBL-025 current-main replay gate

Date: 2026-07-17 MDT

## Authority

- Approved source candidate: `dd19d608cd8a9af96686035fbfe8f6c9a71fc572`
- Approved source merge-base: `c208e578c7d02a62795b06b4b47b672a0e98bbb1`
- Current-main replay base: `909cc97e534fe7d11a167e410ee9ea09a38e102f`
- Replay implementation head before this evidence note: `7928bf22`
- Disposable replay branch: `integration/fbl025-20260717`

The replay contains all eleven approved production-and-test commits. `git range-diff` reports the
first ten as patch-equivalent. The eleventh differs only because the current main already imports
`capturePaperWorkspaceAuthorization` and `projectPersistedPaperWorkspace` in
`paperStore.test.ts`; the conflict resolution retained those current-main imports and added the
approved Inspector epoch imports. The eight candidate evidence/TASK_LIST-only commits were not
replayed. Two FBL-025 notes that were coupled to production commits remain in the replay.

## Scope audit

- 22 production/test paths and two related evidence notes differ from replay base.
- No path is deleted or renamed.
- The production/test path set exactly matches the approved FBL-025 lineage.
- Current-main Functions, FBL-021, and FBL-023 behavior remains in the replay base and was not
  replaced by stale candidate files.

## Current-main verification

- Decisive browser/library/picker/Inspector/rich-editor/store matrix: **6 files / 98 tests passed**.
  The approved candidate gate recorded 85 tests; the replay includes additional current-main tests.
- Cross-surface Settings/Image/Video/Paper/Electron/library matrix: **18 files / 191 tests passed**.
- Paper exact-font/rich-DOM/round-trip/document/transform/source/session/store matrix:
  **11 files / 205 tests passed**.
- `npx tsc -p tsconfig.app.json --noEmit --incremental false --pretty false`: passed.
- `npx tsc -p tsconfig.node.json --noEmit --incremental false --pretty false`: passed.
- Changed-lineage ESLint: zero errors and four established `PaperWorkspace.tsx` hook warnings.
- `npm run verify:paper-production`: passed.
- `git diff --check`, source/range/path audit, and clean-status checks: passed.

The verifier produced 15 files. They were inspected and moved out of the disposable worktree to
`/mnt/d/work_SPaC3/verification-artifacts/fbl025-integration-7928bf2-paper-production-verification-20260717-2024`.
The report SHA-256 is `f769c558cf6e9c6be39b44345f0a42ca3634c59266165bc0c47b80f60286dcb0`.

This note records an integration replay gate. The replay does not modify main and does not itself
claim main landing or final closure.
