# 925 — FBL-023: threaded rich-story slice parity

**Branch:** `overlap/opus-fbl023-threaded-rich-story` · **Base:** `3d628c8`
**Production+tests commit:** `b5405e9`

## Defect (audit FBL-023, Medium)

`fable-partial-audit-comparison-2026-07-16.md`: *"The head frame of a threaded
rich story computes a slice but renders the complete richText payload, allowing
duplicated or missing text at thread boundaries."*

Reachable failure confirmed in code before the fix:

- Paper canvas computes authoritative per-frame thread slices
  (`computePaperThreadSlices`) and passes `displayText` to `PaperFrameView`.
- The rich-text branch of `PaperInlineText`
  (`if (frame.richText && frame.richText.length > 0)`) **ignored the slice** and
  re-rendered the whole stored `frame.richText`, so the head duplicated the
  entire story.
- Continuation frames carry no `richText` of their own (only the head does), so
  they fell to the plaintext else-branch (`{displayText ?? frame.text}`) and
  **lost bold/italic/link/paragraph/list formatting**.
- Existing thread-flow tests covered plaintext only; no production render
  regression protected rich threading.

## Fix — one source-range contract (no substring search of visible text)

1. **`paperTextFlow.ts`** — `PaperTextFlowFrameResult` now exposes token-precise
   `sourceStart`/`sourceEnd` (half-open) with `text.slice(start,end) ===
   sourceText`. The window spans the frame's first→last **word** token, so a
   leading paragraph break and trailing separator are owned by neither frame
   (the intentional inter-frame separator policy). Offsets are token-derived, so
   repeated words never make a slice ambiguous.
2. **`paperRichText.ts`** — new pure `slicePaperRichTextRange(paragraphs,s,e)`.
   Offsets index the **flatten** coordinate space (runs concatenated, list paras
   prefixed `${listMarker}\t`, paragraphs joined by `\n`). Invariant, by
   construction:
   `flatten(slice(p,s,e)) === flatten(p).slice(s,e)`.
   Preserves paragraph/run styling, links, run/paragraph ids and blank lines;
   keeps a list marker **only** when the slice owns the item's start (no
   re-bulleting a continued item); empty range → `[]`; overset (end past length)
   reaches the end; **never mutates or fragments the source**.
3. **`paperThreadFlow.ts`** — rich heads flow over `flatten(head.richText)` so the
   offsets index exactly the string the slicer flattens; `PaperThreadSlice` now
   carries `sourceStart`/`sourceEnd` and a `richText` slice (undefined for plain
   threads).
4. **`PaperWorkspace.tsx`** — render `effectiveRichText = displayRichText ??
   frame.richText`, passing explicit `paragraphs` to `PaperRichTextView`. The head
   shows only its slice; a read-only rich continuation is routed through the rich
   renderer via `richThreadContinuation` **without** becoming editable
   (`editableTextFrame` still excludes `isThreadContinuation`/tables). Stored head
   `richText` is never mutated to render slices. Plain-text threads,
   unthreaded rich frames, folio handling and the overset indicator are untouched.

## Slice-boundary cases proven (red-first, then green)

`slicePaperRichTextRange`: mid-run, exact run boundary, multi-run span, paragraph
newline boundary, list-marker kept-at-start vs dropped-mid-item, empty range,
overset (end beyond length), blank-line preservation, repeated identical text
disambiguated purely by offset, deterministic id preservation, no source mutation,
and the `flatten(slice)===flatten.slice` invariant across 11 ranges.

Thread boundary: a three linked-frame mixed-format story proves each visible frame
owns exactly its contiguous slice once (head bold, continuation italic+link, third
paragraph) with no duplication/loss; a mid-paragraph run split keeps the bold run
formatted in both frames (once each) with the split space owned by neither; the
non-overset slices flatten back to the whole story (separators accounted for); the
stored head `richText` is unchanged (same reference). Flow offsets: `sourceText`
reproduction, ordering/coverage, and empty-frame `sourceStart===sourceEnd`.

## Commands & outcomes (exact)

- **Red baseline** (pre-implementation) —
  `vitest run paperRichText.test.ts paperTextFlow.test.ts paperThreadFlow.test.ts PaperWorkspace.threadRichSlice.test.ts`
  → **21 failed | 34 passed (55)** (13 slicer + 1 flow-offset + 3 thread + 4 render-seam).
- **Green** (post-implementation), focused + neighbors —
  `vitest run` over paperRichText, paperTextFlow, paperThreadFlow, paperTextThreads,
  paperRichTextDom(+roundtrip), PaperWorkspace.threadRichSlice/plainFramePromotion/editorContrast,
  paperLossPrevention, paperDocument(+Save/NativeSync), paperStore(+remoteSync)
  → **15 files, 205 passed**.
- **Forced TypeScript** — `tsc -b --force` (sandbox disabled) → **exit 0, no errors**.
- **ESLint** (touched files) → **0 errors**; `PaperWorkspace.tsx` has 4
  **pre-existing** warnings (lines 1029/1103/1684/4003, none in the changed hunks).
- **`git diff --check`** (staged + unstaged) → clean.

## Residual risks / out of scope

- Folio placeholder substitution runs on plaintext `displayText`; a threaded
  **rich** frame that also contains a folio token would not get folio replacement
  inside its rich slice. Folios are standalone page-number frames in practice; not
  extended here (out of the FBL-023 scope: no typography composition / PDF export /
  Paper sync changes).
- `sourceText` for a continuation that begins on a paragraph break no longer
  includes the leading `\n` separator (previously it could). The only production
  consumer is the thread-slice `displayText` (grep-verified); this removes a latent
  leading-blank-line on plain continuations and is covered by the flow-offset tests.
- Render seam is guarded by an old-code-sensitive source-string test (the
  established pattern for the un-exported `PaperInlineText`/`PaperRichTextView`),
  not a DOM render assertion.

**Ready for an independent final gate.** Not self-approved.
