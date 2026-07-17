# AUD-040 — Desktop single-instance lock + external `.sloom`/`.slppr` open repair

Branch `overlap/fable-single-instance`, based at `4ad12e8`. Scope: exactly the AUD-040 finding in
`docs/audits/codebase-correctness-audit-2026-07-16.md:415` — no single-instance lock, Linux `%U`
arguments dropped by `launcher.cjs`/`getElectronLaunchArgs`, and no `second-instance`/`open-file`/
`open-url` route in the Electron main process.

## What shipped

**One validated exactly-once queue for every external-open source.**

- `electron/external-open.cjs` (new, pure, fs-injected): `classifyExternalOpenTarget` allowlists
  local absolute `.sloom`/`.slppr` files (case-insensitive extension; spaces/non-ASCII preserved;
  relative paths resolved against the invoking cwd; local `file://` URLs percent-decoded with
  remote hosts rejected) plus the already-defined `signal-loom://workspace/<view>` deep links
  (`src/lib/nativeApp.ts` `NATIVE_WORKSPACE_STANDALONE_ENTRY_POINTS`). Everything else is rejected
  (remote schemes, unsupported extensions, control characters, oversized values, malformed URLs,
  UNC paths) or ignored as launcher noise (switches, `.`, exec/app path). `createExternalOpenQueue`
  enforces existing-regular-file at enqueue, pending-dedupe, a bounded queue, and atomic
  `take*` — each request is delivered exactly once.
- `electron/main.mjs`:
  - `app.requestSingleInstanceLock()` is acquired immediately after the
    `SIGNAL_LOOM_ELECTRON_USER_DATA_DIR` override (the lock keys on userData) and **before every
    shared side effect**. The GPU-fallback sentinel IO, privileged scheme registration, external
    open handlers, `whenReady` boot, and lifecycle handlers all moved inside the winner branch. A
    loser runs `app.quit(); app.exit(0);` and dies in ~3.5 s without windows, services, or
    sentinel writes.
  - Initial argv, `second-instance` (relayed argv + workingDirectory), and macOS
    `open-file`/`open-url` (registered before ready, with `preventDefault`) all funnel into the
    queue. Rejected values log one warning each. A second launch always focuses/restores the
    existing window, even with no valid targets.
  - `signal-loom:external-open-take` IPC fulfils drained requests: projects run the **same
    canonical `openProjectDocumentFromPath` transaction as the Open dialog** (prepare, asset
    roots, source-library sync, remember, broadcast); paper targets are read as bytes for the
    renderer's canonical import. No new parsing/restoration exists in main; the renderer can
    never pass arbitrary paths — take() has no arguments.
  - Boot passes `{ skipRemembered: externalOpenQueue.hasPending('project') }` to
    `loadRememberedStartupProject`, so an externally requested project owns the startup restore
    (the remembered path is kept and re-remembered by the canonical open on success).
  - `app.setAsDefaultProtocolClient('signal-loom')` for packaged builds only.
- `electron/preload.cjs` + `src/lib/nativeApp.ts`: minimal typed bridge —
  `takeExternalOpenRequests()` + `onExternalOpenPending()`.
- `src/lib/nativeExternalOpen.ts` (new): renderer consumer. Subscribes to the pending channel
  before the initial drain, serializes overlapping drains, applies batches even across disposal
  races (entries are already consumed), and reports failures per entry.
- `src/App.tsx`: registers the consumer only after the native startup restore settles
  (`nativeStartupSettled`), then routes: project entries through the exact `file:open`
  completion (`resetSourceLibraryNativeSyncTracking` → `restoreProjectDocument` →
  `setNativeProjectPath`), paper entries through the canonical `.slppr` import
  (`deserializeSlppr` → `usePaperStore.openDocumentJson` → `setWorkspaceView('paper')`), and
  errors through the canonical alert dialogs.
- Launch chain: `scripts/signal-loom-electron` exports `SIGNAL_LOOM_LAUNCH_CWD` before `cd`;
  `launcher.cjs` `getLauncherForwardedOpenTargets` filters flags (keeping `--dev` semantics),
  pins relative paths to the invoking cwd, passes URLs untouched;
  `linux-windowing.cjs` `getElectronLaunchArgs(env, platform, openTargets)` appends targets
  after the app path. Packaged binaries receive argv natively (`.desktop` `%U`).
- Packaging: electron-builder `fileAssociations` (.sloom/.slppr) + `protocols` (signal-loom) so
  macOS gets CFBundleDocumentTypes/CFBundleURLTypes and Linux gets MimeType entries; the local
  install script's `.desktop` now advertises
  `MimeType=application/x-sloom;application/x-slppr;x-scheme-handler/signal-loom;`.

## TDD evidence

Red first: 43 failing tests across 5 files (22 `electronExternalOpen`, 9 `nativeExternalOpen`
(suite unresolvable), 6 `externalOpenWiring`, 3 new launcher, 11 new main-source guards), each
failing for missing modules/source shapes; all pre-existing tests stayed green. Then green:
the same suites pass. Two more red→green cycles came out of live verification (below): the
loser-exit guard (`app.exit(0)`) and the bare-lock guard.

Final: the touched + neighbor set (`electronExternalOpen`, `nativeExternalOpen`,
`electronLauncher`, `electronMainSource`, `electronLinuxWindowing`, `electronStartupProject`,
`externalOpenWiring`, `nativeApp`, `electronProjectFiles`, `nativeProjectDocument`,
`paperStore`, `SlpprFormat`, `appSmoke`, `sourceBinLiveSync`) = **14 files, 188 tests, all
passing** with `--configLoader runner`.

## Live verification found two real Electron-level bugs

Runs used the built app, `node_modules/electron/dist/electron .`, isolated
`SIGNAL_LOOM_ELECTRON_USER_DATA_DIR`, and a fixture at `/tmp/sl-aud040/My Comic 週刊.sloom`
(spaces + Japanese). Later runs used Xvfb + `SIGNAL_LOOM_ELECTRON_DISABLE_GPU=1` to keep the
owner's desktop clean.

1. **`app.quit()` alone leaves the loser alive.** The first live loser hung for 30 s until
   `timeout` killed it. Fixed with `app.quit(); app.exit(0);` (guard test updated red→green).
2. **`requestSingleInstanceLock(additionalData)` gets the running app killed on Linux.** With a
   payload, Electron 41's POSIX singleton logs `process_singleton_posix.cc: additional_data_size
   exceeds payload length` in the running instance, never acknowledges, and the *connecting*
   instance **SIGKILLs the running app and takes over** (`xvfb-run: … Killed`). Every early
   "handoff" was actually the second instance killing the first and opening the file itself via
   the initial-argv path. Fixed by acquiring the lock **bare** and consuming the natively
   relayed second-instance argv (additionalData is now parsed only defensively). Guard test
   updated red→green.

Final controlled headless run (fixed code):

- Winner A boots and holds the lock (probe instance loses, exits fast).
- Loser B with the fixture: **exit 0 in 3.6 s**, no windows, no side effects; A stays alive and
  its `startup-project.json` updates to the fixture path within ~3 s — i.e. relayed argv →
  validated queue → focus/wake → renderer drain → canonical open → remembered, end to end.
- Loser with `/tmp/sl-aud040/evil.txt` + `https://example.com/x.sloom`: exit 0, remembered state
  untouched (both rejected).
- Menu-smoke boot (`SIGNAL_LOOM_ELECTRON_MENU_SMOKE=1`) with a file argument: clean exit 0
  through the restructured winner path.

## Gates

- `vitest run --configLoader runner` (14 files): 188/188 pass.
- `tsc -b --force tsconfig.app.json tsconfig.node.json`: exit 0 (an earlier run caught real type
  errors in the new test file — `tail` had masked the exit code; re-run with `pipefail`).
- ESLint on all changed files: exit 0.
- `git diff --check`: clean.
- `CI=1 npm run build`: exit 0, `dist/index.html` mtime advanced.

## Residuals / follow-ups

- The `additionalData` singleton kill is an upstream Electron 41 defect worth re-testing on a
  future Electron upgrade; the bare-lock design does not depend on it either way.
- Deep-link workspace opens and the macOS `open-file`/`open-url` events are covered by unit and
  source-guard tests only (no macOS hardware here); the Linux argv path is live-verified.
- Local "Open with" menus need shared-mime-info XML for `application/x-sloom`/`application/x-slppr`
  to be *known* types on dev installs; packaged deb/AppImage builds get this from electron-builder.
- Multi-window edge: if several workspace windows are open, whichever renderer drains first
  applies the document (main targets the flow/main window for the wake; drains are atomic, so
  delivery stays exactly-once).
- AUD-041 (startup recovery prompts for the remembered project) is intentionally untouched;
  external-open failures surface through the canonical error dialogs.
