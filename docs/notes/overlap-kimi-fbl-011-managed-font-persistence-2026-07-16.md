# FBL-011 fresh-process bundled-font persistence

Date: 2026-07-16
Branch: `overlap/kimi-managed-font-identity`
Integration base: `fbdad282e5edd107c479fe6babe03175824f07c2`
Production/tests commit: `34ba7f36016c17ece6a97556b817527d1d1afd9f`

## Scope

This lane implements only FBL-011. It does not change Paper strict-output face resolution or the FBL-010 Paper stretch lane. The integrated FBL-012/FBL-013/FBL-014/AUD-026 behavior and the optional Chromium family-serialization oracle remain intact.

## Red evidence

Before implementation, the new fresh-process regression was run directly:

```text
npx vitest run src/lib/managedBundledFontPersistence.test.ts
```

Both tests failed deterministically because the canonical face-reference constructor/resolver contract did not exist (`createBundledFontFaceReference` was absent). This established that a saved Image/Video family string could not recover audited bytes in a fresh renderer.

## Implementation

- Added the serializable `ManagedBundledFontFaceReference`: `kind`, stable audited `faceId`, exact family, numeric weight, style, and stretch percentage.
- Added backward-compatible normalization to Image text styles and Video reusable text assets, visual-clip typography, and text stage objects. Legacy content without a reference retains its previous family-based behavior; a mismatched reference is not presented as exact.
- Preserved the reference through Image project pixels/snapshots and layer duplication, plus Video asset-to-clip migration, stage migration, sequence/history copies, cache signatures, and project validation.
- Centralized fresh-renderer resolution in `bundledFontLibrary.ts`. It loads the existing Electron `signal-loom-font://library/...` transport, checks byte length and SHA-256, vets the real face/collection index, derives static stretch from the actual OS/2 face, and registers `FontFace` from an `ArrayBuffer` with exact style/weight/stretch descriptors.
- Registered a deterministic face-ID runtime family alias for managed Image/Video rendering. This prevents an installed system face with the same human family name from winning font matching. A second human-family registration is retained for existing bundled-browser/Paper live-preview behavior; Paper's strict output path was not changed.
- Project restore resolves every referenced Image/Video face before mutating stores. Image blob exports, Video card/stage renderers, stage-frame export, and legacy/native sequence boundaries resolve again before rendering; caches are only an optimization.
- Video exposes a blocking, actionable `Missing font` readiness state. Missing/unauthorized catalog or byte transport, integrity failure, face mismatch, or stretch mismatch rejects preview/export instead of silently accepting a system fallback.

## Fresh-process regression

`src/lib/managedBundledFontPersistence.test.ts` authors and saves:

- an Image text layer and its duplicated copy;
- a reusable Video text asset;
- a Video text clip;
- a Video text stage object.

It JSON-transfers the project, calls `vi.resetModules()` to create a new module graph with empty registration/catalog promises, sanitizes and restores both editors, and serves the real checked-in `LiberationSans-Regular.ttf` bytes. The test proves:

- all five authored references survive save/transfer/normalization;
- project open fetches the audited byte URL in the fresh graph;
- the bytes reach `FontFace` as `ArrayBuffer` data;
- the exact `normal`/`400`/`100%` descriptors are registered;
- managed preview/export uses the face-ID alias, not the bare `Liberation Sans` system family;
- Image and Video canvas paths retain exact identity and stretch;
- a 403 byte response fails closed with reinstall/enable guidance.

## Verification

- Focused affected matrix: 21 files, 265 tests passed.
- Adjacent Electron transport, project schema/files, Flow composition, stage compositor, Image text editing, and Video workspace matrix: 14 files, 132 tests passed.
- Final alias/render-boundary matrix: 8 files, 113 tests passed.
- Prepared-library follow-up: `bundledFontPdfxIntegration.test.ts` and `verify-flow-production.test.mjs`, 3 tests passed while the generated audit was temporarily refreshed for diagnosis.
- Forced app TypeScript: `npx tsc -p tsconfig.app.json --noEmit --incremental false --pretty false` passed.
- Forced node TypeScript: `npx tsc -p tsconfig.node.json --noEmit --incremental false --pretty false` passed.
- Forced project references: `npx tsc -b --force --pretty false` passed.
- Changed-file ESLint passed with zero errors. It reports existing warnings in the large Image/Video workspace files (31 on the final alias-only changed set; no new managed-font warning remains).
- Optional real-Chromium oracle: `python3.11 scripts/formatFontFamily_chromium_oracle.py` passed all 17 CSSOM round trips.
- Production build: `npm run build` passed (3,251 modules transformed); existing chunk-size/externalized-module warnings remain.
- `git diff --check` passed.

The full repository run reached 632 passing files / 4,997 passing tests. Two repository-wide gate prerequisites were then isolated: the unprepared ignored `build/font-library` caused the PDF/X bundled-font suite to fail until `npm run prepare:font-library` was run, and the checked-in Flow audit was already stale for an unrelated `switchCaseNode` port row. Regenerating that audit changed only the unrelated switch-case row, so it was deliberately not included in this FBL-011 lane. The affected FBL-011 suites are green.

## Residual risks

- Licensing/authorization: exact rendering requires the audited 116-family/430-face external font pack to be installed and authorized through the desktop protocol. The resolver now blocks when it is absent; it cannot grant rights for a font pack the user is not licensed to use. Real bytes are also rejected when OS/2 vetting says they are not safely embeddable.
- Browser oracle coverage: the fresh-process test uses real font bytes and the real parser/hash pipeline, but stubs the browser `FontFace` and Canvas objects. The retained Chromium oracle validates family serialization, not end-to-end `FontFace(ArrayBuffer)` loading or percentage `fontStretch`. A packaged-Electron restart/transfer oracle on each shipping OS remains valuable.
- Platform behavior: current audited inventory contains 430 standalone TTF faces and no TTC/OTC collection faces. If a future pack introduces collections, the browser `FontFace` API's lack of an explicit collection-index descriptor needs a real-browser qualification before those faces can be claimed exact.
- Canvas percentage stretch is newer than the baseline Canvas typings and is assigned through a guarded runtime property. Older engines that omit it still use the uniquely registered face bytes, but width-axis/stretch visual parity should be qualified per supported browser platform.
