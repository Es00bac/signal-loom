# FBL-022 Paper run-leading inheritance correction

## Outcome

Paper rich-editor extraction no longer materializes an inherited paragraph `leadingPt` onto every
text run. A highlighted selection can now author an explicit run leading below the paragraph value,
retain that distinction through DOM splitting/merging, serialization, reopen, and deterministic
composition, while a caret-only leading edit continues to target the paragraph.

Production and permanent tests are commit `84977682e0695effdc42f4f88536a12458a36771`, based exactly
on `b0597e23508014c7536a540fcbda34b0cf39db4b`.

## Correction

- Generated run spans carry `data-paper-leading` only when the source run explicitly owns leading.
- Serialization treats the closest paragraph `data-lead` as inherited context. Computed line height
  equal to that context is omitted from the run; a durable explicit-run marker wins and preserves the
  authored point value without CSS pixel-rounding drift.
- A non-collapsed leading edit is a character/run edit. A collapsed leading edit remains a paragraph
  edit, preserving the existing Inspector caret contract.
- A block's sole `<br>` is recognized as its empty-content placeholder, preventing one styled blank
  paragraph from serializing as two paragraphs.
- FBL-006 composition semantics are unchanged: the paragraph leading remains the shared line-box
  floor, while a larger explicit run may raise that line box.

## Permanent regression evidence

- `paperRichTextDomRoundtrip.test.ts` covers browser-equivalent inherited computed leading, an
  explicit lower run, exact authored-unit recovery, and a styled blank paragraph between text.
- `paperRichEditorSession.test.ts` covers highlighted-run split, a second adjacent edit, canonical
  merge, paragraph-leading preservation, and reopen.
- `paperRichTextLeadingPipeline.test.ts` exercises the production chain from editor HTML through
  selection editing, serialization, reopen, exact managed-font composition, and line-box geometry.
- `paperTextComposition.test.ts` keeps the FBL-006 paragraph-strut floor explicit for a lower run.

Before the production correction, the initial three-suite run reported **39 passed / 2 failed**:
the highlighted leading edit replaced paragraph `22` with paragraph `11` and retained one unstyled
run, while explicit run leading also returned the rounded CSS-derived value rather than exact `11`.
A separately added blank-paragraph regression then reported **24 passed / 1 failed**, exposing the
extra empty paragraph created by the placeholder `<br>`.

## Verification

- Focused and adjacent Vitest run: **6 files / 80 tests passed**.
- `npx tsc -b --pretty false --force`: passed for the app and Node project references.
- ESLint over all touched production/test TypeScript paths: passed.
- `npm run build`: passed.
- `npm run verify:paper-production -- --output-dir /mnt/d/work_SPaC3/verification-artifacts/fbl022-leading-inheritance-20260718`: passed.
- `git diff --check`: passed.

The recoverable Paper verifier report is outside the worktree at
`/mnt/d/work_SPaC3/verification-artifacts/fbl022-leading-inheritance-20260718/`; its JSON report
SHA-256 is `e2b60f7035cf87a587c84ef0f6d64edd8f3f782da3162af9c01a471fcd11c223`.

This is author evidence only. It does not claim independent approval, integration, release closure,
or native-platform visual certification.
