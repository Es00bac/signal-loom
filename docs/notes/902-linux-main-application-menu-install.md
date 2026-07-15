# 902 — Local main Application Menu install

## Outcome

The integrated local `main` source was built with Vite/TypeScript, packaged with Electron Builder's Linux directory target, and installed to `~/.local/opt/signal-loom`. The user launcher at `~/.local/share/applications/signal-loom.desktop` points directly to that packaged executable, and the desktop/icon caches are refreshed by the existing installer.

## Launcher correction

`desktop-file-validate` reported that the generated launcher selected both `AudioVideo` and `Graphics` as top-level categories, which can make an application appear more than once in some menus. The shell installer and TypeScript launcher plan now match the canonical packaging entry: `AudioVideo` is the single top-level category and `AudioVideoEditing` remains the specific additional category.

`electronDesktopInstall.test.ts` reads both templates and prevents this drift from returning. The test was observed failing against the old categories before the two templates were corrected.

## Verification

- Focused launcher test: 2 tests passed.
- Full Vitest suite after the timeout correction: 614 files, 4,713 tests passed.
- Production TypeScript/Vite build: passed during the local installer.
- Electron Builder Linux directory package: produced `release/linux-unpacked`.
- Installed `app.asar` SHA-256 matched the final freshly packaged archive: `f839daaf9bfba8b71308b09bfd05689841924907b7781307080d5265f97f5654`.
- `desktop-file-validate` completed with no output after the category correction.
- The installed executable stayed active for the full 12-second isolated-profile smoke window and exported the native panel-menu service. Existing non-fatal Wayland/Vulkan color-management advisories were emitted.
- The first full test run exposed a repeatable full-suite-only timeout in the Paper production golden: PDF/X-1a took 5.1–5.2 seconds against Vitest's five-second default while passing alone. Its sibling repeated-generation golden already used a 30-second budget, so the single-generation case now uses the same budget rather than failing under normal suite contention.
- Application Menu entry: `~/.local/share/applications/signal-loom.desktop`.
