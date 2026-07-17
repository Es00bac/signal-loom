# FBL-005 / AUD-020 Terra exact-font reconciliation

Base: `0bfc97b62e46f32baefcfc87d04ca65a79031cc8`.

This reconciliation deliberately inspected `3973586` rather than cherry-picking it. The old
branch's portable project implementation predates the current `PaperPortableAssets` section and
the Project Library's canonical full-project builder, so neither stale path was restored.

## Delivered

- Exact Paper face identity now carries an optional oblique angle; selection, duplicate replacement,
  live `FontFace` registration, rich text composition, and preflight use weight, style, angle, and
  stretch together. Relative `bolder`/`lighter` run weights resolve against the frame style.
- Isolated browser output gets digest-derived managed-family aliases, complete `@font-face`
  descriptors, and a manifest. Print waits for bounded `FontFaceSet.load()` results whose returned
  face has the requested alias and loaded status, plus `check()`; an unrelated returned face cannot
  trigger `print()`.
- The current portable section now compares record MIME type and safe filename as well as id/hash/
  length against the document reference. Digest-correct but mismatched metadata is rejected before
  staging. Managed Paper references without a `paperAssets` section fail closed; explicit policy
  exclusions remain diagnostic-only and cannot become fallback production paint.
- Project Library save/open/export remains on `buildCurrentProjectDocument`; no partial save route
  was reintroduced. It continues to retain Paper, Image, usage ledger, and portable Paper assets.

## Evidence

Focused matrix passed: 6 files / 133 tests:

```text
npx vitest run src/lib/paperExactManagedFonts.test.ts src/lib/paperManagedFonts.test.ts \
  src/lib/paperTextComposition.test.ts src/lib/projectPaperPortableAssets.test.ts \
  src/lib/projectValidation.test.ts src/components/Paper/PaperWorkspaceUtils.test.ts \
  --configLoader=runner
```

`npx tsc -b --force`, `CI=1 npm run build`, changed-lineage ESLint, `git diff --check`, and
`npm run verify:paper-production` passed. The verifier's generated proofs were removed.

## Required independent review

Fresh Sol approval remains mandatory. This author did not self-approve. Residual review focus:
the current integration has several legacy raster/soft-proof helpers that consume an already
materialized Paper document; review should confirm their caller-specific exact-alias payloads where
they create a new isolated browsing context.
