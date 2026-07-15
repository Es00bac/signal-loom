# Paper Canvas/Export Fidelity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Paper's flattened proof/PDF rendering match the live canvas for parent artwork, transparency, line wrapping, and column typography, then refresh both Signaloom magazine demos.

**Architecture:** Keep the existing print-HTML/foreignObject raster path, but normalize its relative frame order through the canvas stacking helper before CSS serialization. Mirror the omitted CSS typography fields and keep canvas artwork at authored opacity. The deterministic magazine builder owns the contrast and translucent callout changes so both `.slppr` packages remain reproducible.

**Tech Stack:** React 19, TypeScript, Vitest, Electron, Chromium SVG `foreignObject`, lcms-wasm, PDF/X pipeline, Node deterministic package builder.

## Global Constraints

- Do not replace the configured installed-app user-data directory.
- Do not hardcode or expose license/API credentials.
- Preserve the existing FOGRA39 managed profile, two-page A4 geometry, Japanese furigana, and page-two advertisement.
- Treat low source-image PPI as a warning rather than hiding it.
- Preserve unrelated `.superpowers/` workspace content.

---

### Task 1: Positive local output stacking and authored canvas opacity

**Files:**
- Modify: `src/lib/paperDocument.ts`
- Modify: `src/lib/paperCanvasStacking.ts`
- Modify: `src/features/paper/workspace/PaperWorkspace.tsx`
- Test: `src/lib/paperDocument.test.ts`
- Test: `src/lib/paperCanvasStacking.test.ts`

**Interfaces:**
- Consumes: `buildPaperCanvasFrameLayers(frames: PaperFrame[]): PaperCanvasFrameLayer[]`
- Produces: `resolvePaperCanvasFrameOpacity(frame: Pick<PaperFrame, 'opacity'>): number`

- [x] **Step 1: Add a failing print-output test** proving inherited `zIndex: -100000` and local negative-z translucent panels must serialize to positive local layers while retaining `rgba(0, 0, 0, 0.45)` and frame opacity.
- [x] **Step 2: Run `npm test -- src/lib/paperDocument.test.ts`** and observe the expected missing `z-index: 100` failure.
- [x] **Step 3: Map resolved output frames through `buildPaperCanvasFrameLayers`** before calling `renderPrintFrame`.
- [x] **Step 4: Add a failing canvas-opacity test** proving inherited frames use their authored opacity.
- [x] **Step 5: Implement `resolvePaperCanvasFrameOpacity` and use it in `PaperFrameView`.**
- [x] **Step 6: Run the focused tests** and confirm all 47 tests pass.

### Task 2: Typography and column CSS parity

**Files:**
- Modify: `src/lib/paperDocument.ts`
- Test: `src/lib/paperDocument.test.ts`

**Interfaces:**
- Consumes: `PaperTypography`, `resolvePaperColumnGutterMm(frame)`
- Produces: print CSS for `text-wrap-style`, `text-indent`, `text-align-last`, `font-variant-caps`, `font-variant-numeric`, `column-gap`, `column-fill`, and `column-rule`

- [x] **Step 1: Add a failing typography regression** with balanced wrapping, a 3mm first-line indent, centered last line, small caps, tabular figures, two balanced columns, a 7mm gutter, and a rule.
- [x] **Step 2: Run the test and observe the missing `text-wrap-style: balance` failure.**
- [x] **Step 3: Extend `textStyle` and add `printFrameColumnStyle`.**
- [x] **Step 4: Run focused tests, TypeScript, and production build.**

### Task 3: Make the bilingual demo contrast-safe and persist the translucent callout

**Files:**
- Modify: `scripts/create-signaloom-magazine-demo.mjs`
- Modify: `scripts/create-signaloom-magazine-demo.test.ts`

**Interfaces:**
- Consumes: deterministic `frame(...)` builder and existing `COLORS` palette
- Produces: English/Japanese page-one documents with warm-paper running-head text over cobalt and a blue-black translucent pull-quote panel below quote copy

- [x] **Step 1: Add failing assertions** that both page-one manifests contain a translucent blue-black pull-quote backing below the quote and that running-head text crossing the parent band uses a contrasting color.
- [x] **Step 2: Run `npm test -- scripts/create-signaloom-magazine-demo.test.ts`** and verify those assertions fail because the backing frame/contrast is absent.
- [x] **Step 3: Add the English and Japanese backing panels** with `fillColor: COLORS.blueBlack`, `fillOpacity: 0.62`, `opacity: 0.92`, and z-index below the coral rule/quote.
- [x] **Step 4: Change band-crossing running-head copy to `COLORS.paper`** on both pages/languages.
- [x] **Step 5: Re-run the fixture test and confirm it passes.**

### Task 4: Regenerate and inspect installed-app outputs

**Files:**
- Regenerate: `/home/cabewse/Documents/Loom Workspace/Signaloom-Story-English-Magazine.slppr`
- Regenerate: `/home/cabewse/Documents/Loom Workspace/Signaloom-Story-Japanese-Magazine.slppr`
- Regenerate: the two Soft Proof PNGs and two KDP PDF/X files beside them

**Interfaces:**
- Consumes: `scripts/create-signaloom-magazine-demo.mjs`, `scripts/native-paper-kdp-soft-proof-smoke.mjs`
- Produces: installed-app visual evidence using the normal configured user-data profile

- [x] **Step 1: Run the deterministic magazine builder** and confirm both packages contain the new frames and the existing managed profile/assets.
- [x] **Step 2: Run `npm run install:linux`.**
- [x] **Step 3: Run the installed-app smoke once per language on separate CDP ports.**
- [x] **Step 4: Inspect both proof PNGs and rasterized PDF pages** for the parent band, contrasting running head, translucent callout, matching quote wrapping, photographs, Japanese typography/furigana, and advertisement.
- [x] **Step 5: Check both PDFs with `qpdf --check` and `pdfinfo`.**

### Task 5: Production verification and documentation

**Files:**
- Modify: `docs/TASK_LIST.md`
- Create: `docs/notes/907-paper-canvas-export-fidelity.md`

- [x] **Step 1: Run `npm test`.** Expected: all repository tests pass.
- [x] **Step 2: Run `npm run verify:paper-production` and `npm run build`.** Expected: both exit 0.
- [x] **Step 3: Run ESLint on touched source/test files and `git diff --check`.** Expected: zero errors and no whitespace failures.
- [x] **Step 4: Write note 907** with root causes, implementation, visual evidence, outputs, and caveats.
- [x] **Step 5: Mark the task complete in `docs/TASK_LIST.md` and commit the implementation.**
