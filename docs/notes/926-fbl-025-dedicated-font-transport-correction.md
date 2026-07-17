# 926 — FBL-025 dedicated font-transport capability correction

## Problem corrected

The original FBL-025 renderer gate treated the generic Electron preload shape as proof that
`signal-loom-font://` was usable. Electron exposes that general bridge even when
`resolveBundledFontLibraryRoot()` found no valid library, leaving a visible bundled-font UI whose
catalog requests all returned 404.

## Implementation

- `electron/main.mjs` records the single resolved root used by the font protocol handler and
  exposes `signal-loom:font-library-status` from that exact value. The handler registration is
  idempotent and is removed on `will-quit`.
- `electron/preload.cjs` exposes only the dedicated `bundledFontLibraryStatus()` transport for
  this capability. The renderer does not infer it from any other preload methods.
- `bundledFontLibrary.ts` fails closed while status is pending, when the bridge is old/incomplete,
  when IPC rejects, and when the response is anything other than `{ available: true }`. Capability
  promises are shared per bridge identity without retaining old bridge objects. The React hook
  synchronously treats a replacement bridge as unavailable until its own query resolves.
- Catalog promises are also keyed to the bridge that authorized them, preventing a catalog loaded
  through an old positive bridge from being reused after bridge replacement.
- `BundledFontBrowser` and the Settings publishing-library card both consume the same hook. All
  existing Image, Paper, and Video picker entry points route through that shared browser; ordinary
  online/user-font controls remain unconditional.

## Regression coverage

The focused suites now cover absent and old generic bridges, a complete generic bridge with a
negative dedicated result, pending status, IPC rejection, positive status, one IPC query shared by
multiple consumers, remount/replacement behavior, bridge-scoped catalog loading, Settings, and an
Image caller. The managed-font persistence fixtures now model the explicit positive transport
required by desktop restoration/export flows.

## Verification

- Focused capability/UI/Electron-source matrix: 6 files, 86 tests passed.
- Adjacent managed-font/UI matrix: 11 files, 84 tests passed.
- Forced TypeScript: `npx tsc -b --force --pretty false` passed.
- Touched-file ESLint passed with no output.
- `git diff --check` passed.

This is implementation evidence only; a fresh independent Sol gate remains required.
