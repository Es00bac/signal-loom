# AUD-041 — Startup recovery authority-ordering correction

Date: 2026-07-18

Production/tests commit: `830efd9e`

Status: correction complete; fresh independent review required before integration or audit closure.

## Corrected review findings

The first AUD-041 candidate retained the typed main-process recovery descriptor but tested only source wiring. In a real isolated Electron profile, the Flow renderer adopted the canonical blank authority before presenting recovery. That expected adoption advanced the renderer authority epoch, so the old delayed-startup guard suppressed the dialog even though the native state still held the exact path, typed error, and adjacent backup.

Recovery presentation now validates the exact post-adoption authority identity instead of requiring the pre-adoption epoch to remain unchanged. A separate committed-authority event epoch prevents a delayed startup response from appearing after any newer canonical commit. This preserves blank-by-default startup and accepts recovery only for the explicitly opted-in remembered path attached to the authority the renderer actually adopted.

The renderer also now clears its local recovery state after every successful canonical project transition:

- shared prepared Open, Retry, and backup transactions;
- File → New, including a blank project with no file path;
- committed authority notifications from another window, including blank replacement;
- session-only Continue Blank dismissal.

Canceled and rejected prepared switches do not run the committed transition and retain the recovery choices. Main-process path/error retention, bounded backup selection, and Paper/Image replacement authorization remain unchanged.

## Permanent behavioral coverage

- Exact blank-authority adoption presents recovery even though adoption advances the request epoch.
- A mismatched newer authority cannot publish delayed recovery.
- Canceled and rejected prepared switches retain recovery.
- A committed same-window switch clears recovery.
- A committed another-window blank authority clears recovery despite having no file path.
- App source wiring pins exact adopted-state validation, committed-event clearing, and the shared guarded switch transaction.

## Verification

- Focused and adjacent startup/project Vitest: **7 files / 117 tests passed**.
- Native helper/startup/source Vitest: **3 files / 82 tests passed**.
- `tsc -p tsconfig.app.json --noEmit --incremental false`: passed.
- `tsc -p tsconfig.node.json --noEmit --incremental false`: passed.
- Electron syntax checks for main, preload, and startup helper: passed.
- ESLint for every touched production/test file: 0 errors, 0 warnings.
- `git diff --check`: passed.
- Production build: passed; Vite transformed **3285 modules**.
- Isolated real Electron recovery check: passed. An unreadable remembered `.sloom` produced the dialog after onboarding with the exact path, typed `unreadable` error, matching adjacent backup, and all four choices. Retry retained the same recovery state, and Recover Backup committed the selected backup and closed recovery.
- The generic native smoke still stops at its older source-item save assertion; the identical result was reproduced on exact base `c438735d`, so it is not attributed to this correction.

No approval or integration is claimed by this author correction.
