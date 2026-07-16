# Terra quickwins repair sprint — 2026-07-16

## Status

The sprint was blocked after the first focused regression passed because this
worktree's Git metadata is outside the writable sandbox. `git commit` could
not create `/home/cabewse/work_SPaC3/flow/.git/worktrees/flow-overlap-terra/index.lock`
(`EROFS`). The requested per-finding commit boundary therefore prevents moving
to a subsequent finding without leaving the first one uncommitted.

| Finding | Status | Commit | Test evidence | Residual risk |
| --- | --- | --- | --- | --- |
| AUD-014 | Blocked pending commit permission; implementation and regression are present but uncommitted. | None | Red: `npx vitest run --configLoader runner src/store/settingsStore.test.ts` failed because `byteplus` sanitized to `''`. Green: same command, 1 file / 13 tests passed. | Until the staged change is committed, a rebase/reset/worktree cleanup can discard the repair. |
| AUD-044 | Blocked by required prior commit boundary; not attempted. | None | Not run. | Flow context-menu locale callback remains stale. |
| AUD-017 | Blocked by required prior commit boundary; not attempted. | None | Not run. | Paper JSON export/import round trip remains broken. |
| FBL-015 | Blocked by required prior commit boundary; not attempted. | None | Not run. | Local Flow token replacement/casing corruption remains. |
| FBL-016 | Blocked by required prior commit boundary; not attempted. | None | Not run. | List inputs may retain edge insertion ordering. |
| FBL-028 | Blocked by required prior commit boundary; not attempted. | None | Not run. | Valid ElevenLabs `mp3_48000_192` choice remains coerced. |
| FBL-035 | Blocked by required prior commit boundary; not attempted. | None | Not run. | Packaging readiness may not verify staged font bytes. |

## AUD-014 implementation pending commit

`src/store/settingsStore.ts` now includes `byteplus` in the shared API-key
provider list. That makes persistence sanitization, redaction, and storage
status use the same registry. `src/store/settingsStore.test.ts` asserts the
user-facing hydration sanitization boundary preserves a supplied BytePlus key.

Focused Vitest needed `--configLoader runner`: the default bundled-config
loader also tries to write under the read-only shared `node_modules` target.
