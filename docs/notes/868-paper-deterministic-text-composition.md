# Paper Deterministic Text Composition

Date: 2026-07-14

Task 10 of the managed-print core adds a shared Paper text composition contract. `composePaperTextFrame()` resolves every rich run to an exact managed face, shapes it through HarfBuzz, and returns positioned glyph outlines, caret coordinates, missing-face/glyph data, overset state, ruby/emphasis annotations, paragraph boxes, and decoration data.

The compositor owns horizontal and vertical Japanese layout, strict kinsoku boundaries, columns, paragraph spacing, indents, hanging list markers, drop-cap lanes, justification/last-line alignment, tracking, baseline shifts, basic mixed RTL ordering, and bubble vertical alignment. Rich paragraph shading and borders now use the same physical frame geometry as the editor and print HTML.

`PaperManagedTextLayer` draws only managed SVG glyph paths. It verifies font asset hashes before creating a HarfBuzz shaper, clears stale asynchronous state before paint, destroys owned shapers on cleanup, and intentionally paints nothing when an exact face or glyph is unavailable. Browser text remains the editable draft surface only; it no longer chooses line breaks for managed preview output.

Current deliberate limit: text arcs and browser-only text stroke/shadow effects retain the draft preview rather than being represented by managed SVG text. Later render-plan/PDF tasks must either emit equivalent native output or flatten those effects; strict production preflight will not treat the browser preview as print authority.

Verification:

- `npx vitest run src/lib/paperTextComposition.test.ts src/features/paper/workspace/PaperManagedTextLayer.test.tsx src/lib/paperDocument.test.ts src/lib/paperTextLayout.test.ts src/lib/paperJapaneseText.test.ts src/features/paper/workspace/PaperWorkspace.richTextShortcuts.test.ts` - 81 passed.
- `npx tsc -b` - passed.
- `npm run build` - passed, with existing Vite warnings about runtime `new URL`, browser-externalized WASM package shims, and chunk size.
