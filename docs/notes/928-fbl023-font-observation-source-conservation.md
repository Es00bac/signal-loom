# 928 — FBL-023 font observation and source conservation

**Branch:** `overlap/opus-fbl023-threaded-rich-story`

**Exact clean starting HEAD:** `4817391f0e01731a0c785804c322b77fe093dd3a`

**Production + permanent tests:** `1d82c14617f3f6375a6c189bcd5009dea57b204b`

## Outcome

This bounded author correction closes the two defects reproduced by the latest
independent FBL-023 gate while retaining the earlier blank-paragraph,
list-prefix, paragraph-geometry, stretch/variation/kerning, cleanup, and cache
corrections.

- Canvas text measurement now observes the accepted `ctx.font` after every
  requested shorthand assignment. Exact equality stays native; browser-normalized
  equivalents must converge through an independent CSSOM round trip. A missing,
  throwing, unobservable, stale, or inequivalent Canvas value uses the existing
  finite live-CSS fallback instead of measuring with prior font state.
- Rich flattening now reports exact provenance for only the `\n` separators
  inserted between structural paragraphs. Newline bytes authored inside runs,
  including CR, LF, and CRLF, are never inferred to be structural from their value.
- Plain source has no derived separators, so every authored byte belongs to a
  frame or the exact overset tail. Rich flow may omit only a provenance-mapped
  structural paragraph separator; authored spaces and inline delimiters remain
  contiguous and styled across frame boundaries.

Production and permanent tests are limited to seven files under `src/lib`:
`paperCanvasMeasurer`, `paperRichText`, `paperTextFlow`, and `paperThreadFlow`.
No stored Paper document shape or renderer seam changed.

## Exact old-code red evidence

A separate disposable clone was pinned to starting HEAD `4817391`; only the
three final permanent test files were applied, leaving old production intact:

`npx vitest run src/lib/paperCanvasMeasurer.test.ts src/lib/paperTextFlow.test.ts src/lib/paperThreadFlow.test.ts`

- **3 files failed; 29 failed / 69 passed (98 total).**
- Silent Canvas rejection returned stale native width `20` instead of CSS width
  `9`; absent, throwing, and unobservable `font` surfaces also used stale Canvas.
- Plain CR, LF, CRLF, word separators, and overset tails had ownership gaps.
- Rich inline CR, LF, and CRLF disappeared at frame boundaries; styled source
  ranges and mixed-run continuation spaces were not conserved.

The temporary clone was moved to recoverable desktop trash after the proof; no
extra worktree or live branch was created.

## Verification at `1d82c14`

- Focused measurer/flow/thread suite: **3 files, 98 passed**.
- Bounded adjacent Paper matrix: **18 files, 295 passed**.
- Video measurer compatibility plus shipping Paper measurer: **2 files, 36 passed**.
- `npx tsc -b --force --pretty false`: exit 0, no diagnostics.
- ESLint over all seven changed production/test files: exit 0, no warnings or
  errors.
- `npm run verify:paper-production`: **passed**. Generated output is preserved at
  `/mnt/d/work_SPaC3/archived-validation-artifacts/fbl023-20260717-parent-4817391/`.
- `git diff --check` and `git diff --cached --check`: clean.

Permanent cases cover exact and normalized shorthand acceptance, silent stale
state, absent/throwing/unobservable properties, CSS fallback/cache reuse,
document replacement, CR/LF/CRLF exact-fit and overflow ownership, styled
multi-run conservation, blank paragraphs, structural-versus-authored adjacency,
list prefixes, and source immutability.

## Residuals and review status

When neither a requested Canvas state nor live CSS layout is observable, the
existing finite rough-width fallback remains intentionally approximate. A rich
structural paragraph separator may remain outside adjacent render slices because
the paragraph structure itself owns that presentation boundary; authored bytes
are not treated this way.

This is implementation evidence, not self-approval. A fresh different-persona
gate against the final clean two-commit lineage remains required before
integration or FBL-023 closure.
