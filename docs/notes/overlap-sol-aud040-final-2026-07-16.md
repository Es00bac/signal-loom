# AUD-040 final correction — transactional external-open intents

Base: exact Fable HEAD `08264ea`. Production/tests commit: `050c03d`.

## Correctness repair

- Replaced the destructive renderer drain with a main-owned intent state machine:
  `pending → offered → accepted → committed`, with explicit rejection and renderer revocation.
- Main authorizes only the live Flow window's `webContents`; every authorization gets a new epoch.
  Secondary windows and stale epochs cannot offer, accept, reject, commit, or release an intent.
- Project offers only read, parse, and prepare. The renderer runs the dirty Image-document guard
  before acceptance. Main stages canonical roots/source/startup state only after acceptance, rolls
  it back on reject/apply failure/reload/crash, and publishes source/path state only on commit.
- Startup restores the remembered project before offering an incoming project, so cancel/reject
  retains the prior baton instead of replacing it with blank or incoming state.
- Renderer apply is serialized. An accepted intent returned after an interrupted commit is
  commit-only and is never applied twice. Flow reload/crash/destroy revokes the epoch, rolls back
  uncommitted staging, and re-offers the intent to the next authorized renderer.
- Committed keys remain in a bounded 64-entry receipt set for 1.5 seconds. Immediate duplicate OS
  delivery is suppressed after drain/commit; expiry permits a genuinely later open. Rejected
  intents create no receipt, so a deliberate retry remains possible.
- Existing validation remains intact for Linux/macOS/Windows argv, `open-file`, `open-url`, local
  file URLs, relative working directories, spaces, Unicode, supported extensions, and deep links.

## Red-first evidence

Against untouched `08264ea`, the permanent protocol tests produced **6 failures / 57 tests**:

- missing authorize/accept/reject/commit queue behavior and post-commit idempotency;
- main offered projects through the mutating open transaction before renderer acceptance;
- preload/main had no designated-renderer or epoch authorization.

## Final verification

- Focused main/renderer/native/project-replacement set: **13 files, 186 tests, all passing**.
- `tsc -b --force tsconfig.app.json tsconfig.node.json`: pass.
- ESLint on every changed JS/MJS/TS/TSX file: pass, no output.
- Node syntax checks for main, queue, preload, and lifecycle probe: pass.
- `git diff --check 08264ea --`: pass.
- `CI=1 npm run build`: pass; 3,252 modules transformed and `dist/index.html` refreshed.
- Real Electron 41.3.0 under Xvfb: `npm run probe:electron-single-instance` passed. The winner
  stayed alive, a loser exited 0, and `Comic 週刊.sloom` reached the winner through native argv,
  renderer acceptance, and canonical commit.

The earlier claimed Electron 41 `additionalData` crash was not used as evidence. The lock remains
bare solely because the deterministic real-app probe proves native argv/working-directory relay is
sufficient; no extra payload is needed.

## Residual platform evidence

- Linux/Xvfb has real two-process lifecycle evidence. macOS `open-file`/`open-url` and Windows argv
  remain permanently covered by classification, bridge, lifecycle, and source-wiring tests but were
  not live-run on those operating systems in this workspace.
- The idempotency receipt is intentionally process-local and time-bounded: a new app session or a
  later open is a new user intent, while immediate duplicate delivery in the live session collapses.
