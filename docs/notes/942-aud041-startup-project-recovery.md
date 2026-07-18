# AUD-041 — Remembered project startup recovery

Date: 2026-07-18

Production/tests commits: `7469e81d`, `d5bff0e2`

Status: author correction complete; fresh independent review required before integration or audit closure.

## Outcome

An opted-in remembered project that is missing, temporarily unreadable, corrupt, schema-invalid, or unable to finish native preparation no longer loses its persisted path and silently becomes an unexplained blank project. Electron publishes a typed recovery descriptor while retaining a blank canonical project, and the primary Flow renderer offers four explicit choices:

- **Retry** the exact remembered path.
- **Open Another** through the normal native project chooser.
- **Recover Backup** from the newest-first matching `.sloom.bak-*` files found beside the original.
- **Continue Blank** for this session without changing the persisted remembered path or opt-in preference.

Normal launches remain blank by default. The isolated real-project smoke profile now opts into restoration explicitly instead of relying on a remembered path alone.

## Implementation boundary

- `electron/startup-project.cjs` retains valid `.sloom` paths without requiring immediate existence, classifies read/parse/preparation failures, discovers usable adjacent backups, and exposes an injectable startup preparation boundary.
- `electron/main.mjs` keeps `startupProjectRecovery` separate from canonical project/source state, exposes retry/backup/dismiss IPC, validates backup selection against the discovered list, and clears recovery only on a successful committed project publication or a session-only dismissal.
- `electron/preload.cjs` and `src/lib/nativeApp.ts` carry the typed bridge contract.
- `src/App.tsx` opens the blank authority first and then presents recovery. Retry, alternate-file open, and backup recovery all reuse the same prepared native switch plus Paper/Image loss-prevention transaction as explicit File → Open.
- A later project authority (including an external open) dismisses the now-superseded local startup prompt.
- `StartupProjectRecoveryDialog` shows the original path, exact failure, discovered backup choice, action progress, and a safe blank continuation.

## Permanent coverage

- Normal blank startup does not read the remembered file when reopening is disabled.
- Missing `.sloom` paths remain recoverable instead of resolving to `undefined`.
- Temporarily unreadable files preserve path/error and backups.
- Corrupt JSON and schema-invalid JSON produce distinct typed failures.
- A failed read can succeed on Retry.
- Backup discovery filters by the original filename, ignores vanished entries, and sorts newest-first.
- Retry, Open Another, canceled Open Another, selected-backup recovery, and Continue Blank route to the intended bridge operation.
- Dialog coverage pins all four user choices and the no-backup state.
- Electron source coverage pins path preservation, IPC/preload exposure, session-only dismissal, and opt-in startup.

## Author verification

- Focused plus adjacent Vitest: **7 files / 111 tests passed**, including Electron project authority, App wiring, and delayed native startup replacement.
- Native smoke helper plus startup source cases: **3 files / 82 tests passed**.
- `tsc -p tsconfig.app.json --noEmit --incremental false`: passed.
- `tsc -p tsconfig.node.json --noEmit --incremental false`: passed.
- `node --check` for `electron/main.mjs`, `electron/preload.cjs`, and `electron/startup-project.cjs`: passed.
- ESLint for every touched production/test file: 0 errors, 0 warnings.
- `npm run build`: passed; Vite transformed **3285 modules**.
- Real Electron project smoke with an isolated profile confirmed the explicitly opted-in remembered project path/document, a two-page Paper document, and all four workspace windows load. Its later PDF-export phase stopped at that fixture's pre-existing exact-profile preflight errors, so the unrelated export step is not reported as a full pass.
- The generic native smoke currently stops at its older claim-less clear/save expression under the existing project-authority contract; that pre-existing harness mismatch is not used as AUD-041 evidence.

## Review requirement

A fresh reviewer should inspect `7469e81d` and `d5bff0e2` from a clean worktree, exercise the recovery dialog against a temporarily unavailable project and a matching backup, and verify that Retry/Open Another/Recover Backup only clear the recovery state after a committed guarded switch. This note does not self-approve or claim integration.
