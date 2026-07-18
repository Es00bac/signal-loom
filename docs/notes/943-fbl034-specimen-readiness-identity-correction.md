# FBL-034 specimen readiness identity correction

## Review disposition and authority

- Date: 2026-07-18
- Reviewed author tip: `b369b41906f53828a96118f2a252ae60fd901af0`
- Correction commit: `57bc21a8`
- Finding: FBL-034
- Fresh review disposition: **CHANGES REQUIRED**
- This remains author correction evidence. It does not self-approve, integrate, or claim closure.

This note supersedes the specimen-readiness portion of
`942-fbl032-fbl034-typography-localization-exact-specimens.md`. The approved FBL-032 localization
behavior and its evidence remain unchanged.

## Reviewed defect

The first implementation stored only a generic ready/loading/error state. If one mounted family row
had finished registering exact face A and then received unseen face B, React could commit B's row
props before the passive effect reset the old state. During that interval, the sample was marked ready
and rendered A's managed family alias while its row described B.

## Correction

Specimen state now owns both:

- the exact native bridge that authorized registration; and
- the canonical managed-face identity signature for the current face, including face ID, family,
  weight, style/oblique identity, stretch, sorted variable-axis defaults, collection index, full hash,
  and byte length.

Render derives a fail-closed current state before passive effects run. If either authority differs,
the row immediately renders a localized not-ready status with no managed family style. Registration
may publish ready/error state only for its captured bridge and exact face identity. Ready rendering
still uses the registered content-addressed alias plus exact weight, style, stretch, and variation CSS.

The two remaining non-`Error` catalog/selection fallbacks now come from explicit English/Japanese
catalog entries. Japanese component coverage exercises both paths instead of allowing a static English
detail to appear inside a localized error shell.

## Permanent regression matrix

One state-continuity test keeps the same mounted row while exercising:

1. exact face A reaches ready and publishes A's managed alias;
2. the row changes to unseen face B and immediately becomes not-ready with no A alias;
3. B registration starts but remains delayed, still with no A alias;
4. B registration fails, remaining not-ready with no managed alias; and
5. B retries successfully, becoming ready only with B's distinct managed alias and exact
   weight/style/stretch identity.

A separate Japanese selection test rejects `FontFace.load()` with a non-`Error` value and requires the
localized selection fallback. The Japanese catalog-error case rejects catalog transport with a
non-`Error` value and requires the localized catalog fallback.

## Correction verification

- Focused browser, i18n, Paper tab/rich-panel, source-contract, and bundled-font suites:
  **6 files / 63 tests passed**.
- Adjacent settings, Image text, Video font gate, managed-font persistence, Paper document/save/native
  sync/formats, font resolution, rich-text round-trip/leading, text composition, and threading suites:
  **16 files / 186 tests passed**.
- `npx tsc -p tsconfig.app.json --noEmit --incremental false --pretty false`: passed.
- `npx tsc -p tsconfig.node.json --noEmit --incremental false --pretty false`: passed.
- ESLint over all four correction files: passed with no output.
- `git diff --check`: passed.
- `npm run verify:paper-production`: passed.
- `npx vite build --configLoader=runner`: passed; Vite transformed 3,283 modules. Existing
  browser-externalization and large-chunk warnings remain non-fatal.

Correction verification outputs were retained at
`/mnt/d/work_SPaC3/build-artifacts/fbl032-fbl034-typography-ui-20260718/paper-production-verification-correction`
rather than deleted.

## Re-review handoff

A fresh reviewer should hold face A ready, replace it with a same-row face B behind a dormant
intersection observer, and confirm the committed render already contains no A alias before B is
observed. It should then delay, reject, and retry B registration and confirm that only the final
successful exact B identity becomes ready. Only that independent clean-tip approval may authorize
integration.
