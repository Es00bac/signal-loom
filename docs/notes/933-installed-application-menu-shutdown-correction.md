# Installed Application Menu build and shutdown correction

## Outcome

The current Sloom Studio `0.9.12` checkout was rebuilt, packaged with Electron Builder's Linux
directory target, and installed through `npm run install:linux`. The user Application Menu entry at
`/home/cabewse/.local/share/applications/signal-loom.desktop` points to the packaged executable at
`/home/cabewse/.local/opt/signal-loom/signal-loom` and retains the Sloom Studio name, icon, MIME
associations, and `AudioVideo;AudioVideoEditing;` categories.

## Shutdown correction

The first installed-build check deliberately ended an isolated Electron process after a bounded
startup window. That exposed an existing teardown race: the Flow window's `closed` listener read
`workspaceWindow.webContents` after Electron had already destroyed the `BrowserWindow`, producing
`TypeError: Object has been destroyed` in the main process.

`createWorkspaceWindow` now captures the window's `WebContents` while the `BrowserWindow` is live and
uses that stable reference for renderer-authority invalidation, external-open revocation, lifecycle
listeners, and final window teardown. A permanent source guard verifies both sides of the contract:
the `closed` listener uses the captured reference and does not dereference the destroyed window.

## Verification

- `src/lib/electronMainSource.test.ts`: **49 tests passed**.
- ESLint over `electron/main.mjs` and `src/lib/electronMainSource.test.ts`: passed.
- `git diff --check`: passed.
- `npm run install:linux`: TypeScript/Vite build, bundled-font preparation, Electron packaging,
  installed-file sync, icon refresh, and Application Menu refresh passed.
- `desktop-file-validate /home/cabewse/.local/share/applications/signal-loom.desktop`: passed with no
  output.
- Fresh package and installed `app.asar` SHA-256 both equal
  `9f1fc4389e36c21b9ab37d74b60185bd767cebebcb06ad663251df85344cf2c5`.
- The installed archive contains the captured-`WebContents` correction and no destroyed-window
  dereference in the `closed` listener.
- An isolated installed-app run reached a live renderer, exported `org.signalloom.PanelMenu`, closed
  through the DevTools `Browser.close` application path, and exited with code `0`, no signal, and no
  destroyed-object/main-process exception.

Electron still reports the existing non-fatal KDE Wayland/Vulkan and color-management advisories;
they did not prevent startup, rendering readiness, panel-menu export, or clean shutdown.
