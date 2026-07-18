# 927 — FBL-023 requested-value and exception safety

**Branch:** `overlap/opus-fbl023-threaded-rich-story`

**Exact clean starting HEAD:** `70fb3e41356a4551228c1931a7e4c724519eb471`

**Production + permanent tests:** `98d50a5`

## Outcome

This bounded author correction addresses the independently reproduced final-gate
findings in `paperCanvasMeasurer` only. It does not alter the rich-source slicer,
half-open range ownership, paragraph geometry, renderer routing, or durable Paper
data. The complete retained FBL-023 lineage is:

`b5405e9` → `640117f` → `bce471d` → `32e77aa` → `cae987e7` →
`d35c29f` → `f90bd44` → `70fb3e4` → `98d50a5`.

## Correction contract

- Native typography support is decided for each requested value. Named stretch,
  variation, and kerning values use Canvas only after an observable
  alternate-value → requested-value round trip. Percentage stretch always uses
  live CSS layout because property presence or assignment cannot prove Canvas
  applied the percentage to glyph advances.
- Rejected, unobservable, or malformed variation/kerning requests cannot fall
  through to a prior Canvas state. Malformed values are normalized to deterministic
  CSS-safe defaults, while the normalized value, original request identity, and
  fallback mode remain part of the cache key.
- Canvas/context creation, font/property writes and reads, CSS element creation,
  style assignment, attachment, layout, cleanup, `document.fonts`, FontFaceSet
  fields, and `check()` are guarded. Failures return a finite deterministic rough
  width; failed exact measurements are never cached. A later healthy call retries
  without inheriting failed platform state.
- A successfully attached probe is removed in `finally`. An attachment that throws
  after linking the node also triggers best-effort removal without masking the
  failure. No listener or persistent probe is introduced.
- The existing per-measurer, per-document 128-entry LRU, document/font-lifecycle
  invalidation, CSS tracking, Canvas tracking, and px/mm conversion remain intact.

## Exact old-code red evidence

Before editing production at `70fb3e4`, only the permanent regressions were added:

`npx vitest run src/lib/paperCanvasMeasurer.test.ts --reporter=verbose`

- **1 file failed; 5 failed / 5 passed (10 total).**
- An ignored present `fontStretch` percentage returned Canvas width `80` instead
  of CSS width `10`.
- A percentage following a valid named Canvas request returned Canvas width `6`
  instead of CSS width `9`.
- Rejected variation/kerning state returned stale Canvas width `100` instead of
  CSS width `11`.
- `appendChild` and `document.fonts` getter exceptions both escaped the call.

The permanent cases assert observable widths, Canvas/CSS call counts, cache hits,
probe cleanup, finite/non-NaN fallback, and healthy subsequent-call behavior.

## Verification at `98d50a5`

- Focused six-file FBL-023 suite: **6 files, 118 passed**.
- Documented Paper matrix: **17 files, 262 passed**.
- `src/lib/videoTextFlow.test.ts` + `src/lib/paperCanvasMeasurer.test.ts`:
  **2 files, 28 passed**.
- `npx tsc -b --force --pretty false`: exit 0, no diagnostics.
- `npx eslint src/lib/paperCanvasMeasurer.ts src/lib/paperCanvasMeasurer.test.ts`:
  exit 0, no warnings or errors.
- `git diff --check` and `git diff --cached --check`: clean.

Production/test changes are limited to:

- `src/lib/paperCanvasMeasurer.ts`
- `src/lib/paperCanvasMeasurer.test.ts`

## Remaining approximation and review status

When Canvas cannot verifiably represent the request, live CSS layout remains
platform-dependent on the active browser text engine and loaded font bytes. If
the CSS/DOM/font platform itself throws, the finite rough-width fallback is
deterministic but intentionally approximate; it cannot promise exact glyph
metrics while the exact platform is unavailable.

This is author evidence only. Fresh Terra Context Cartographer acceptance against
the final clean commits remains required. No integration, independent approval,
audit closure, merge, or main-branch change is claimed.
