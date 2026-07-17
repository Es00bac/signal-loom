# 926 — FBL-023 Sol-gate correction

**Branch:** `overlap/opus-fbl023-threaded-rich-story`

**Requested clean starting HEAD:** `640117f64eae5d54c3d3b59f88fa53ae3817e85d`

**Corrected candidate:** `32e77aa9f629c19ed90ae3f212bb3f0374cac9c8`

**Production + permanent tests:** `bce471d`

## Outcome

Closed all four Medium classes returned by the independent Sol gate without merging or rebasing `main`. The requested starting HEAD already contained candidate `b5405e9`; attempting to apply it reported an empty cherry-pick, which was skipped before corrective work began.

The retained behavior remains intact: `PaperRichTextView` receives the computed slice, empty computed slices remain empty, continuation frames stay non-editable, render-only fragments are never written back or serialized, and plain fallback plus authoritative head `richText` storage remain compatible.

## Corrections

### 1. Blank paragraphs at frame boundaries

`flowPaperText` now skips exactly one ordinary inter-frame newline delimiter. When the destination also consumes additional consecutive breaks, those offsets remain in its half-open source range. Thus `A\n\nB` flows as `A` then `\nB`, and `A\n\n\nB` flows as `A` then `\n\nB`, preserving the blank paragraphs in both plain and rich slices.

### 2. Atomic list-prefix coordinates

Rich flow builds protected source spans for every exact `${listMarker}\t` prefix. Tokenization replaces all ordinary tokens overlapping a protected span with one indivisible source token, so no flow range can end between a marker and its tab. Measurement substitutes the renderer-equivalent em space while coordinates remain indexed in the canonical tab-bearing flatten source.

The permanent matrix varies marker length, paragraph count, frame width, frame height, overset, and empty frames. For every produced range it proves:

`flattenPaperRichText(slice) === canonicalSource.slice(sourceStart, sourceEnd)`

It also directly proves that neither endpoint can fall inside any protected prefix.

### 3. Rich metrics and paragraph-fragment ownership

The existing synchronous flow seam now accepts source-aware metrics rather than measuring an entire rich story with the head's uniform typography:

- Each frame carries its own destination typography.
- Run spans override destination family, size, leading, tracking, weight, and style only where authored; unset run values inherit the destination frame.
- Mixed styles inside one unbroken word are measured segment-by-segment without creating a new word-break opportunity.
- Line advance grows to the largest run font size/leading on the line.
- Paragraph alignment, leading, before/after spacing, first-line/left/right/hanging indents, list lane, border padding, and drop-cap reserve participate in capacity and wrapping.
- Frame-level paragraph defaults (`dropCapLines`, `firstLineIndentMm`, `spaceBeforeMm`, `spaceAfterMm`) are inherited per destination frame.

`slicePaperRichTextRange` returns render-only fragments carrying explicit `ownsParagraphStart` and `ownsParagraphEnd`. A non-owning start suppresses list/start decoration, drop cap, first-line/hanging indent, space-before, and top border; a non-owning end suppresses space-after and bottom border. Alignment, leading, side indents, shading, and side borders continue across frames. Boundary-only whitespace does not steal ownership from the fragment containing the first/last real content.

`PaperRichTextView` consumes the ownership flags as a second guard for inherited frame defaults, padding, first/last-line alignment, and border paint. No ownership fields are added to durable `PaperRichParagraph` storage.

Permanent regressions prove no omission for a 36 pt / 44 pt-leading mixed run, a differently styled segment inside source coordinates, unequal continuation typography, paragraph leading/spacing/indent boundary changes, and three-frame continuation ownership.

### 4. Non-mutating rich folios

`resolvePaperRichTextFolios` resolves `{page}`, `{#}`, `{pages}`, and `{##}` across concatenated run coordinates, including a token split across several styled runs. Replacement text inherits the style at the token's first character; all non-token text retains its run style. The helper returns derived paragraphs and never mutates the stored head story.

The workspace applies the transform only to the computed rich render slice using the destination page number/count. Tests cover separate head and continuation page substitutions and confirm the stored source still contains its raw tokens.

## Permanent old-code-sensitive coverage

- Plain and rich `A\n\nB` plus `A\n\n\nB` frame-boundary cases.
- Exhaustive list-prefix source-coordinate property matrix.
- Explicit start/middle/end ownership and decoration suppression, including leading/trailing whitespace.
- Large mixed run font size/leading, paragraph leading/spacing/indent, and unequal destination typography with final-source coverage.
- Split-run rich folios, separate head/continuation page numbers, and source immutability.
- Workspace seam guards for derived rich folios, ownership-aware paint, preserved non-editability, and computed-slice routing.

All of these fail against the uncorrected candidate behavior.

## Verification (exact)

- Focused correction set: 5 files, **73 passed**.
- Focused + bounded Paper neighbors:
  - `paperTextFlow`, `paperThreadFlow`, `paperTextThreads`
  - `paperRichText`, DOM, and DOM round-trip
  - `paperFolios`
  - threaded render seam, plain-frame promotion, editor contrast
  - loss prevention/store, Paper document/save/native sync, Paper store/remote sync
  - Result: **17 files, 228 passed**.
- Forced TypeScript: `npx tsc -b --force --pretty false` — exit 0, no diagnostics.
- Touched-file ESLint — **0 errors**. `PaperWorkspace.tsx` reports the same four pre-existing warnings at lines 1030, 1104, 1685, and 4004; none is in a corrected hunk.
- `git diff --check` and `git diff --cached --check` — clean.

## Review status

Implementation and evidence are complete. A different model must perform the fresh independent gate. No self-approval is claimed.

## Second independent-gate correction — 2026-07-17

Terra returned **CHANGES REQUIRED** against exact clean prior correction state `32e77aa9f629c19ed90ae3f212bb3f0374cac9c8`. This section records the bounded follow-up; it does not claim approval.

**Production + permanent regressions:** `cae987e7a4899eb2e2359094ea1d69fc96b7175c`

- Source ownership now derives from every consumed token and leading separator. One ordinary delimiter is omitted only at an adjacent nonempty-to-nonempty frame boundary; initial, terminal, consecutive, separator-only, and blank-only paragraph ranges remain exact in plain/rich parity.
- Horizontal and vertical placement reserve paragraph start and end spacing, border padding, side/first/hanging indents, and drop-cap width before accepting a line. Exact-fit/one-unit-over and invalid-number regressions prevent false fit, false non-overset, negative width, and NaN progress.
- Frame/run flow specs now carry `fontStretch`, `fontVariationSettings`, and `fontKerning`. The shipping measurer applies supported canvas properties and uses a temporary exact CSS measurement probe when a requested property is unavailable on canvas; durable rich text remains untouched.

Verification at `cae987e7a4899eb2e2359094ea1d69fc96b7175c`:

- Existing five-file focused FBL-023 set plus the new canvas-measurer regressions: **6 files, 107 passed**.
- Documented bounded Paper neighbor matrix: **17 files, 260 passed**.
- Optional `videoTextFlow` caller plus shipping canvas measurer: **2 files, 19 passed**.
- `npx tsc -b --force --pretty false`: exit 0, no diagnostics.
- ESLint over all eight touched production/test files: exit 0, no warnings or errors.
- `git diff --check` and `git diff --cached --check`: clean.

All red reproductions were promoted directly into permanent tests; no disposable probe remains. A fresh different-model final gate is mandatory.
