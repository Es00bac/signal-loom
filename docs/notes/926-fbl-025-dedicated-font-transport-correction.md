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

## Follow-up: bridge-authority race correction

The independent Sol final gate found that catalog authorization still had two asynchronous
identity gaps. A delayed positive status from bridge A could initiate a catalog fetch after the
renderer bridge had changed to unavailable bridge B; separately, a response authorized by A could
finish parsing and be returned after B became current. The browser also retained its settled A
catalog/error state across a bridge replacement, allowing a positive B to display A's data without
its own catalog authorization.

`fetchBundledFontCatalog` now confirms that its captured bridge is still
`getSignalLoomNativeBridge()` immediately after the status await and again after JSON parsing,
before returning the catalog. `BundledFontBrowser` scopes catalog and error state to the bridge
identity seen by that render and checks identity again before asynchronous UI publication. Thus a
replacement fails closed immediately; B must complete B's status and B's catalog request, and a
late A completion cannot replace B's UI.

Permanent regressions prove: delayed A-positive → B-negative causes zero fetches; an A-authorized
fetch rejected after B replaces the bridge before parsing/publication; a settled A catalog is
discarded until positive B loads its own catalog; and a late A completion cannot overwrite settled
B state.

## Verification

- Focused bridge-race capability/browser suites: 2 files, 28 tests passed.
- Adjacent managed-font/UI matrix: 16 files, 171 tests passed.
- Forced TypeScript: `npx tsc -b --force --pretty false` passed.
- Touched-file ESLint passed with no output.
- `git diff --check` passed.

This is implementation evidence only; a fresh independent Sol gate remains required.
