# AUD-040 desktop external-open final correction

Production/tests commit: `f3a4ad2`

## Correction

- A second-instance delivery retains one stable event identity from receipt through acceptance, so the same
  delivered event cannot be applied twice under newly minted IDs.
- The selected external file is read through one stable descriptor before queueing, preventing path
  replacement between identity capture and byte consumption.
- Dirty Paper and Image documents participate in the same explicit Save / Discard / Cancel replacement
  decision before an accepted external open can replace project state.
- Local Open, New, Save, and accepted external transitions share a serialized project-lifecycle boundary,
  preventing two accepted transitions from interleaving.

## Author verification

- Focused desktop/external-open matrix: 7 files, 109 tests passed.
- Neighboring project-library, Paper, native-file, preload, and Electron-main matrix: 13 files,
  175 tests passed.
- Forced app, node, and root TypeScript passed.
- Changed-lineage lint, four Electron syntax checks, and diff check passed.
- CI build passed with 3,255 modules.
- Electron 41 two-instance probe produced exactly one committed project event and left no process or
  temporary-directory residue.

This note records author evidence only. A fresh independent Terra check is still required before
integration.
