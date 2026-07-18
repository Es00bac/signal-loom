# 934 — FBL-006 canonical computed typography correction

**Branch:** `audit/fbl006-composer-20260718`  
**Base:** `17b2f76e66fef5aa460d259cb7ccad0cde7bd7b5`  
**Production + regression commit:** `bc93a7295ac32611a01ef0146f38cc0a6c314f47`

## Confirmed production defects

The exact managed-font composer is shared by the live `PaperManagedTextLayer` and
the native render/PDF plan. Before this correction it computed only part of the
rich typography those consumers receive:

- line boxes used the frame leading for every paragraph and run;
- HarfBuzz features used frame kerning and numeric style even when a run had an
  explicit override;
- `alignLast` ignored the rich paragraph and used only the frame value;
- strict Japanese breaking was computed once for the frame, so a rich paragraph
  could not override it.

These were reachable production-path mismatches, not serializer-only metadata.

## Correction

- Every resolved run now carries effective leading with the precedence
  `run -> paragraph -> frame`; horizontal line boxes and vertical column advance
  take the largest non-drop-cap font size/leading touched by the line.
- Managed shaping resolves `fontKerning` and `numericStyle` per run before
  constructing OpenType features. Distinct rich runs therefore receive the
  requested `kern`, `lnum`, `onum`, or `tnum` feature set.
- Rich paragraph `alignLast` now overrides the frame value.
- Each composition paragraph carries its own computed strict-breaking value with
  precedence `paragraph -> frame -> vertical default`. `PaperTextRun` has no
  strict-breaking field, so there is no unsupported run-level value to invent.
- Existing exact face selection, vertical shaping, ruby placement, and inline
  emphasis-mark paths are unchanged.

## Permanent red-to-green regressions

Four regressions were written before the production edit. Against the old code:

```text
npx vitest run src/lib/paperTextComposition.test.ts
Test Files  1 failed (1)
Tests       4 failed | 11 passed (15)
```

The failures measured the actual defects: mixed run feature requests did not
separate, paragraph leading remained `14` instead of `22`, a run leading of `31`
did not enlarge the shared line box, final-line centering stayed at the left edge,
and paragraph-relaxed kinsoku did not override a strict frame.

After the correction, the same suite passed **15/15**. The strict-breaking test
also proves the opposite precedence direction: a strict paragraph overrides a
relaxed frame and never starts a managed vertical line with `、`.

## Shipping-consumer and production gates

- Focused composer + live managed layer + render plan + native content:
  **4 files, 35 tests passed**.
- Adjacent vector/PDF export matrix:
  **4 files, 37 tests passed**.
- `npx tsc -b --force --pretty false`: **exit 0**.
- ESLint on both changed files: **exit 0**.
- `git diff --check`: **clean**.
- `npm run verify:paper-production`: **passed**, including its PDF/X-1a and
  PDF/X-4 structural/font/image/separation checks.

Verifier outputs were kept out of the candidate worktree and preserved at:

```text
/mnt/d/work_SPaC3/verification-artifacts/fbl006-composer-20260718/
```

That directory contains the verifier JSON, both generated PDFs, separation TIFFs,
and `SHA256SUMS` for all 15 generated files (3.2 MiB total).

## Bounded residual / gate note

This correction does not invent a new managed-composer interpretation of the
model's per-run `textOrientation` or `emphasis` fields. The existing composer
behavior for vertical text, ruby, and inline emphasis is preserved and remains
covered, while DOM/flatten serialization of those explicit run fields is
unchanged. An independent gate should decide whether the audit's broader wording
requires a distinct follow-up for managed per-run orientation/emphasis; this
author lane does not self-approve or close that question.

**Ready for independent final gate. Not self-approved.**
