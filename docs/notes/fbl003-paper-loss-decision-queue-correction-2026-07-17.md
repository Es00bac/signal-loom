# FBL-003 Paper loss-decision queue correction — 2026-07-17

The preserved FBL-003/AUD-001 integration now treats every Paper loss-prevention
invocation as a distinct FIFO entry. A shared routing key no longer coalesces
workspace content, messages, promises, or save callbacks. Visible actions carry
the request id they were rendered for, so a stale click cannot settle or save the
next dialog.

The queue retains at most 32 requests. An excess caller fails closed as Cancel
without displacing any earlier entry. Request projections copy and freeze the
document-title list, settlement is idempotent, and application unmount/reset
cancels and releases the active and queued entries. A save already in flight may
finish its own callback, but its late result cannot advance or mutate the reset
queue.

Permanent regressions cover the production project-replacement caller with two
overlapping same-key workspaces, same-key callback pairing and order,
failure/retry/reset, stale visible request ids, bounded overflow, and dialog
unmount. Verification completed without rerunning the repository-wide suite:

- Focused queue/loss-prevention/native-startup/project-document matrix: 8 files,
  200 tests passed.
- Fresh nonincremental `tsconfig.app.json` and `tsconfig.node.json` checks passed.
- ESLint passed for all 53 changed or untracked JavaScript/TypeScript files with
  0 errors and 4 existing `PaperWorkspace.tsx` hook warnings.
- Unstaged and staged `git diff --check` passed.

No commit or external worktree operation was performed. The prior 5,633-pass
repository sweep and its sole external Chromium font-oracle `EAI_AGAIN` failure
remain the repository-wide evidence for this integration.
