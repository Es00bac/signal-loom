# AUD-001 — Versioned desktop project authority (cross-renderer corruption fix)

- **Date:** 2026-07-16
- **Branch / base:** `overlap/fable-project-authority` at reviewed integration `01c1532`
- **Production + tests commit:** `061c31f`
- **Scope:** exactly Critical/Certain AUD-001 from `docs/audits/codebase-correctness-audit-2026-07-16.md` (project open/save/replace identity). The settings-snapshot half of the finding and AUD-015 license-identity sync were intentionally not touched.

## The defect

Electron main held one global `currentProjectPath`, `signal-loom:project-save` wrote whatever
document any renderer sent to that path, and other windows only received a bare
`project-path-changed` string. Opening project B from one window left every other window
holding project A's stores under B's title; saving there serialized A-derived
Flow/Image/Video/Paper state into B. Within one project, an older window could silently
overwrite a newer window's save (last-writer-wins).

## The contract now

**Main (`electron/project-authority.cjs`, wired through `electron/main.mjs`):**

- Every open/switch/Save As/first-path-binding mints an immutable `authorityId`; every
  accepted save advances a monotonic `version`. Startup binding happens via
  `commitStartupProjectAuthority()` after the remembered project loads.
- `saveProject` authorizes the sender twice — once before any destination dialog, and again
  inside a mutation lock immediately before `writeProjectDocument` — against four rejection
  codes: `unopened` (no claim), `switched` (identity no longer current), `stale` (older
  version), `unauthorized` (claim looks current but this webContents never confirmed
  adopting it). Rejections return `{ rejected: { code, message, current } }` and never touch
  disk, never move `currentProjectPath`, and never advance the version.
- All project mutations (open load+commit, save write+commit, clear) serialize through one
  promise-chain mutex, so a save dialog resolving after a project switch is re-validated and
  refused, and a delayed open commits after — and therefore supersedes — an interleaved one.
- A same-path save advances the version and auto-adopts only the writer; a path rebind
  (Save As, first save of a blank project) mints a fresh identity at version 1. Reopening
  the same path also mints a fresh identity, so pre-reopen claims never authorize.
- New IPC: `signal-loom:project-adopt` (pull the canonical snapshot main already retains in
  `startupProject`, no duplicated parsing), `signal-loom:project-confirm-adoption`
  (per-sender adoption record; late confirmations from before a switch return
  `{ ok: false, stale: true }` and record nothing), and the
  `signal-loom:project-authority-changed` broadcast `{ authority, reason, initiatorWebContentsId }`
  emitted inside the commit. The legacy `project-path-changed` string still fires for
  display compatibility but carries no save rights. Destroyed webContents drop their
  adoption records.

**Renderer (`src/lib/projectAuthorityClient.ts`, wired through `src/App.tsx`):**

- Boot, file:open, file:new, and post-save rehydration all confirm adoption through
  `adoptSnapshot(target, hydrate)` on a single per-window adoption queue, so broadcast-driven
  adoption can never interleave with a boot/open restore of the same stores.
- On `reason: 'open' | 'clear'` from another window, the client pulls and hydrates the
  canonical snapshot (through `restoreProjectDocument`/`resetProjectDocument` with the
  dirty-Image guard and the Paper/Image rollback transaction intact). If hydration is
  blocked, the window stays explicitly stale/read-only with a banner — the title alone never
  flips a window to the new project.
- On `reason: 'save' | 'save-as'` the window keeps its unsaved work but is stale-marked; its
  next save is blocked locally before serialization, and main would reject it anyway.
  The conflict dialog ("Project Out of Date") offers an explicit "Reload the latest saved
  project" path; declining leaves the window read-only for project saves. No
  last-writer-wins path remains.
- Save/Save As/Export Project send `{ document, claim }`; a `rejected` result re-uses the
  same honest conflict dialog. Self-initiated broadcast echoes are ignored via the
  webContents id from `get-native-state`.

## Red → green proof

Red (before implementation, gateway scaffolded with today's unguarded semantics so the
corruption failed on assertions, not missing imports):

```text
npx vitest run --configLoader runner src/lib/electronProjectAuthority.test.ts src/lib/electronMainSource.test.ts
# Tests  21 failed | 23 passed (44)
# including: stale save into switched project WROTE to disk, concurrent saves both wrote,
# delayed post-switch dialog wrote, late adoption confirmations accepted, and all
# main.mjs/preload/App wiring guards failing against the then-current sources.
```

Green (same command, final tree): `Tests 44 passed (44)`.

The two-renderer suite drives the real `electron/project-authority.cjs` gateway and the real
`projectAuthorityClient` over a simulated IPC boundary with per-sender ids, deferred dialogs,
and queued broadcast delivery, and asserts exact disk-write call counts (`main.writes`)
around every rejection. Scenarios: open A → open B → stale A-claim save from renderer 2
(0 writes, B intact, version unadvanced); concurrent v1 saves → exactly one write, loser
gets `stale`, reload → rebase → v3; save stale-marks the other window (blocked locally
before IPC, rejected if forced); Save As after failed adoption (read-only + `switched`,
0 writes); delayed Save As dialog resolving after a switch (`switched` inside the lock,
0 writes); delayed open superseding an interleaved open with both windows re-synchronized;
Save As identity minting; reopen-same-path identity minting; renderer reload re-adoption vs
a fabricated current-shaped claim (`unauthorized`) and no claim (`unopened`); late adoption
confirmation ignored; File > New blank identity; blank-project first save binding + the
other window's partial state rejected; a five-way rejection sweep asserting authority, path,
and disk are byte-identical after every rejection code; failed open leaving the initiator
explicitly stale (title change grants nothing); self-echo suppression; legacy raw-document
payload normalization (accepted shape-wise, rejected `unopened`).

Source guards (`electronMainSource.test.ts`, plus preload/App guards in the new suite) pin
the production wiring: gateway import/construction, all five handlers committing through it,
adopt/confirm handlers, authority+webContentsId in native state, `destroyed` →
`dropRenderer`, no direct `writeProjectDocument` returns from save handlers, and
`writeProjectDocument` no longer self-broadcasting (ordering owned by the gateway commit).
One pre-existing guard regex was updated for the save handler's parameter rename
(`currentProjectPath` → `currentFilePath`); the guarded behavior (backup paths are never
overwritten by plain Save) is unchanged and still asserted.

## Verification (final tree)

```text
npx vitest run --configLoader runner src/lib/electronProjectAuthority.test.ts src/lib/electronMainSource.test.ts
# 2 files, 44 tests passed

npx vitest run --configLoader runner <20 neighboring suites: electronProjectFiles,
  electronStartupProject, projectDocumentActions, projectSyncService, projectSyncClient,
  projectEditLock, editLockSync, projectValidation, projectSchemaParity, nativeApp,
  nativeProjectDocument, flowGraphNativeSync, paperDocumentNativeSync,
  imageDocumentNativeSync, sourceLibraryNativeSync, projectMediaReferences, projectAssets,
  App.flowContextMenu, floatingPanelWindow, native-smoke-lib>
# 20 files, 239 tests passed

tsc -b --force                      # exit 0 (forced non-incremental app+node projects)
eslint <8 changed files>            # exit 0
git diff --check                    # clean
CI=1 npm run build                  # tsc -b + vite: exit 0, dist/index.html mtime advanced

CI=1 npx vitest run --configLoader runner   # full suite
# 5083 passed | 1 failed (5084) — see pre-existing failures below
```

**Pre-existing full-suite failures (proved unrelated):** `scripts/verify-flow-production.test.mjs`
("Generated audit artifact is stale: docs/audits/flow-node-audit-2026-07-15.md") and
`src/lib/bundledFontPdfxIntegration.test.ts` (ENOENT `build/font-library/inventory/font-inventory.json`,
a generated artifact this fresh worktree never built) fail with the identical signature in a
scratch worktree at base `01c1532` (2 failed files / 1 failed test). `androidSplashSource.test.ts`
flaked once under full-suite parallelism and passes in isolation.

## Honest residuals

- **Same-project multi-window editing is now safe-but-serialized:** each accepted save
  stale-marks the other windows, which must reload (replacing their unsaved work, after an
  explicit confirmation) before saving. True field-aware per-workspace merge is the follow-up
  the audit names as the alternative repair; this change deliberately implements the
  smallest coherent authority contract instead of a merge engine.
- **Settings snapshots** (the second half of the AUD-001 evidence) still overwrite whole-key
  per window; out of scope here per the AUD-015 separation, and untouched.
- A project switch committed in the narrow window between a booting renderer's
  `get-native-state` and its adoption confirm leaves that window stale with the banner
  (recoverable via one Reload click) rather than auto-converging — honest, never silent.
- Renderer/main version skew (new renderer against a pre-authority main or vice versa)
  degrades to legacy display behavior or `unopened` rejections respectively; the two always
  ship together in the desktop bundle.
- The stale banner and conflict dialogs are English-only, matching the existing dialog and
  splash surfaces (the i18n rule "translate a surface fully or not at all" applies when the
  dialog layer is migrated).
- Browser/Android (no native bridge) are unaffected: saves remain local downloads and the
  client is never constructed with authority methods.
