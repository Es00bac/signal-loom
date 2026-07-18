# FBL-026 bundled Paper font provenance correction

## Outcome

Paper no longer rewrites a managed bundled face to `user-import` while normalizing or reopening a
document. Exact bundled identity, catalog face metadata, content-addressed font and license
references, attribution, and source version now survive direct normalization, standalone `.slppr`
save/open, and portable `.sloom` project reopen.

The normalizer retains bundled trust only for the canonical application resource shape:

- an exact `signal-loom-font://library/...` `.ttf` or `.otf` URL without credentials, query,
  fragment, traversal, or URL-parser rewriting;
- a non-empty bounded source version;
- a non-empty license id and attribution URL; and
- a non-empty content-addressed `text/plain` license record.

Malformed bundled provenance fails closed to `user-import`. Existing `open-catalog`, `user-import`,
and legacy inline-font migration behavior remains in place. Managed variation coordinates are now
also normalized and retained with their catalog axes instead of being dropped by the same boundary.

Version-2 `.slppr` open now runs the same canonical document normalizer used by saves, legacy opens,
Paper store loads, and `.sloom` migration. This removes the prior split where a valid version-2
manifest could bypass the shared load sanitizer.

## Permanent regression evidence

The tests were added before the production change. On commit `17b2f76e`, the focused run failed in
all three new round-trip cases: each restored source was `{ kind: 'user-import' }`, variation
coordinates were absent, and the unknown-rights face's packaging decision no longer matched its
bundled pre-save decision.

After code commit `2164e20`:

- `PaperDocumentAssets.test.ts` proves direct exact normalization, input/source/license/reference
  non-aliasing, unchanged packaging rights, and fail-closed handling of a foreign bundled URL.
- `SlpprFormat.test.ts` proves real version-2 package serialization and reopen with the exact font
  and license records restored.
- `projectPaperPortableAssets.test.ts` proves strict portable project save, clean-profile reopen,
  exact face metadata, exact dependencies, and an unchanged packaging verdict.

## Verification

- Focused Vitest run: **37 tests passed** across the three suites above.
- `npx tsc -b --pretty false`: passed.
- ESLint over all five changed TypeScript files: passed.
- `npm run verify:paper-production`: passed.
- `npm run build`: passed (TypeScript build and Vite production build).
- `git diff --check`: passed.

The Paper verifier's generated binary artifacts were not added to git; they were moved intact to
`/mnt/d/work_SPaC3/generated-artifacts-fbl026-20260718` so the worktree remains clean and the output
is still recoverable.
