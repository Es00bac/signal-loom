# FBL-033 multi-window locale authority — 2026-07-18

## Outcome

Production/tests commit `8187092c` replaces renderer-last-message-wins locale handling with one revisioned locale authority owned by the Electron main process. All live windows and all Electron-owned menus now derive from the same accepted state, so two windows cannot retain different interface languages or leave the native menu in a third state.

Blank/default startup remains English and unchosen. After settings hydration, the first renderer seeds the authority from the persisted preference. A later window adopts the established process state instead of overwriting it from its own startup snapshot.

## Ownership and broadcast model

- `electron/interface-locale-authority.cjs` owns `{ locale, localeChosen, revision }` for the lifetime of the Electron process. Window focus and closure do not transfer or reset that ownership.
- A renderer proposes an explicit settings intent against the revision it has adopted. The authority accepts an up-to-date change, rejects a stale conflicting change with the current state, and treats an exact same-preference proposal as idempotent even if its revision is old.
- Every accepted state transition is broadcast to every live window. Renderers ignore older broadcasts and older startup responses, adopt newer authority state without echoing it as a new local intent, and stop applying updates after teardown.
- The application menu, global menu, and panel menus read the authority's locale. They rebuild only when an accepted transition actually changes language; selecting the already-active language can still propagate the first-run `localeChosen` state without needless menu work.
- Browser-only use retains the existing persisted settings behavior and has no Electron-owned menu to synchronize.

## Permanent coverage

- `electronInterfaceLocaleAuthority.test.ts` covers the explicit main-process owner, blank/default state, changes initiated by either window, stale rejection, writer closure, exact idempotence, same-language first-run state, invalid requests, and menu/broadcast source wiring.
- `nativeLocaleSync.test.ts` covers hydration seeding, later-window adoption, a newer broadcast arriving before an older startup response, changes in both directions, stale requests, out-of-order messages, closure, new-window hydration, and same-language first-run propagation without a menu rebuild.
- `settingsStore.test.ts` preserves the boundary between explicit user/import locale intents and direct authority adoption, preventing feedback loops.

## Changed production and test files

- `electron/globalMenu/globalMenuController.cjs`
- `electron/interface-locale-authority.cjs`
- `electron/main.mjs`
- `electron/preload.cjs`
- `src/App.tsx`
- `src/lib/electronInterfaceLocaleAuthority.test.ts`
- `src/lib/nativeApp.ts`
- `src/lib/nativeLocaleSync.test.ts`
- `src/lib/nativeLocaleSync.ts`
- `src/store/settingsStore.test.ts`
- `src/store/settingsStore.ts`

## Author verification

- Focused authority/renderer/settings matrix: **3 files passed; 27 tests passed**.
- Locale/menu/settings adjacent matrix: **15 files passed; 184 tests passed**.
- Startup/default adjacent matrix: **5 files passed; 28 tests passed**.
- App adjacent matrix: **2 files passed; 18 tests passed**.
- `npx tsc -p tsconfig.app.json --noEmit --incremental false --pretty false` — passed.
- `npx tsc -p tsconfig.node.json --noEmit --incremental false --pretty false` — passed.
- Touched-file ESLint — passed with zero warnings or errors.
- `node --check` for the new authority, global-menu controller, Electron main entry, and preload — passed.
- `git diff --check` — passed.
- `npm run build` — passed; only the repository's established warnings and chunk-size notice remained.

## Residuals and integration boundary

- Authority state is intentionally process-local rather than separately persisted. Each launch begins English/unselected, and the first fully hydrated renderer seeds the encrypted renderer settings. A brief English native menu can therefore exist before hydration completes.
- Simultaneous explicit choices are serialized by the main process and revision check. A stale conflicting proposal must reconcile to the accepted state before a later explicit retry can win.
- This branch starts from the requested base `18f7162ae59cf671f0795df8ed2712b661a76688`. Main later gained AUD-043 startup-mount work; integration must preserve both that `StartupInteractionSequence` mounting and the FBL-033 locale synchronization lifecycle in `src/App.tsx`.

This is author implementation evidence only. Fresh independent review remains required; no approval, integration, or audit closure is claimed.
