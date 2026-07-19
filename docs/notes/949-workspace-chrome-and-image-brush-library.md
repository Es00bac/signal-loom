# Workspace chrome and Image brush-library follow-up

## Outcome

Internal build `0.9.12e` corrects workspace identity and reclaims working space across Sloom Studio. Native windows now identify the workspace that is actually pinned to that window:

- `Sloom Studio Flow`
- `Sloom Studio Image`
- `Sloom Studio Paper` (followed by the active Paper document when available)
- `Sloom Studio Video`

The important behavioral correction is that a Flow window no longer inherits Paper's title from shared cross-window workspace state. `App.tsx` derives the title from `activeWorkspaceView`, which prefers the workspace encoded in the native window URL.

## Shared chrome

The decorative product icon was removed from the shared top toolbar while the functional application menu and workspace switcher remain. Flow, Image, and Paper use the shared compact Source Bin header. Video's separate production and fallback Source Bin implementations now use the same compact principle: tabs, item count, visibility, and collapse/expand controls share one row, while redundant titles, descriptions, and statistics rows are removed.

## Image brush library

Image now includes 173 built-in brushes in 22 collapsible sets, up from 29 brushes. The 144 new media-oriented presets cover graphite, charcoal, pastel, ink, marker, watercolor, gouache, oils, acrylics, dry media, airbrush, digital paint, texture, organic marks, comics, light effects, and blending.

The presets exercise capabilities already supported by the brush engine rather than introducing a second engine: pressure, tilt, twist/rotation, color dynamics, opacity, flow, scale, angle and roundness variation, dry-load falloff, texture and dual-brush behavior, wet mixing, spectral mixing, smearing, and velocity response. Collapsed families do not render their preview grids, keeping the expanded collection navigable.

## Verification

- 24 focused tests passed for workspace titles, shared top chrome, Video Source Bin chrome, brush inventory, and brush palette behavior.
- The broader focused run for the complete change set passed 64 tests.
- TypeScript, selected-file ESLint, and `git diff --check` passed.
- The production Vite build completed after transforming 3,289 modules.
- Electron packaging verified the bundled font artifact: 116 families, 430 faces, and 546 payload files; the post-package exact-face-and-license request passed.
- Installed runtime inspection reported separate `Sloom Studio Flow` and `Sloom Studio Image` native targets from the packaged Application Menu build.

Installed location: `/home/cabewse/.local/opt/signal-loom`

Application Menu entry: `/home/cabewse/.local/share/applications/signal-loom.desktop`
