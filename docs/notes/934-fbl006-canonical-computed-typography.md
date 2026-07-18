# 934 — FBL-006 canonical computed typography correction

**Branch:** `audit/fbl006-composer-20260718`
**Base:** `17b2f76e66fef5aa460d259cb7ccad0cde7bd7b5`
**Production + regression commit:** `bc93a7295ac32611a01ef0146f38cc0a6c314f47`
**Gate-correction production + regression commit:** `2d64a9325afba433c51949b980a3a3fb59203ed7`

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

## Independent correction gate and superseding resolution

An independent Context Cartographer gated clean commit `a7661eefb596545af080a417c2c6f7cfc3894c37`.
It confirmed the first correction's four regressions were old-code sensitive and
the candidate remained green, then formally reproduced three additional shipping
defects that superseded the bounded-residual statement above:

- effective run/frame `textOrientation` and `emphasis` survived DOM/flattened HTML
  but disappeared from the shared managed composition, live SVG, render plan, and
  native PDF;
- `smallCaps: false` could not override a true frame value;
- a too-tall first horizontal line, too-wide first vertical column, or overflowing
  line immediately after column rollover could incorrectly report
  `overset: false`.

Commit `2d64a9325afba433c51949b980a3a3fb59203ed7` resolves those reproduced defects:

- resolved composition units now retain `run -> frame` orientation/emphasis;
  mixed vertical Latin is shaped horizontally and rotated clockwise, while
  upright Latin and CJK retain top-to-bottom shaping and vertical OpenType
  features;
- positioned glyph-run rotation and exact `dot`, `open-dot`, `sesame`, and
  `circle` mark styles survive render-plan translation;
- managed SVG and native PDF consume the same rotation and mark semantics,
  including stroked open dots, sesame paths, and a rotated native text matrix;
- an explicit run `smallCaps: false` wins through nullish precedence;
- horizontal and vertical compositions retain explicit layout boxes, and overset
  is checked against the actual first-box and post-rollover geometry.

## Superseding permanent regressions and gates

- Composer + live managed SVG + render plan + native PDF: **4 files, 39 tests
  passed**. The assertions cover shaping requests, positioned rotation, exact
  mark-style order, SVG transforms/shapes, translated render-plan paints, and PDF
  `Tm`/path operators.
- Adjacent Paper rich-text/vector/PDF matrix: **10 files, 108 tests passed**.
- `npx tsc -b --pretty false --force`: **exit 0**.
- ESLint on all seven changed production/test files: **exit 0**.
- `git diff --check`: **clean**.
- `npm run verify:paper-production`: **passed**, including generated PDF/X-1a
  and PDF/X-4 structural/font/image/separation checks.

Fresh verifier outputs are preserved outside the worktree at:

```text
/mnt/d/work_SPaC3/verification-artifacts/fbl006-correction-20260718/
```

Key SHA-256 evidence:

```text
2b9c3ff876317dd709c483cc4e0da749100670d1c732565c19a3ea64e301622f  paper-production-verification.json
43b02b3e873d7db9cb2f2c087bf900b778daa09444270dd1ede5f0791ed83f0b  paper-production-golden-pdf-x-1a.pdf
950f49311ec6b6e744152bb7d4530724faf3e06478df09bab5ec8bba1f4f99bc  paper-production-golden-pdf-x-4.pdf
```

**Ready for a different persona's final gate. Not self-approved.**
