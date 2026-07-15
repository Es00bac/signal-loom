# Signaloom Magazine Editorial Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild both Signaloom magazine editorial halves as presentation-ready contemporary art-and-technology journal spreads while preserving the generated imagery and half-page advertisements.

**Architecture:** Keep `create-signaloom-magazine-demo.mjs` as the single deterministic layout source. Update its shared view defaults and four localized page constructors, lock the visual decisions into Vitest assertions, regenerate both version-2 `.slppr` containers, and verify their actual native Paper render state.

**Tech Stack:** Node.js ESM, TypeScript/Vitest, Sloom Studio Paper version-2 validated asset containers, Electron native Paper renderer.

## Global Constraints

- Preserve the dedicated Flow project and generated raster assets unchanged.
- Preserve A4, 300 dpi, 3 mm bleed, facing spreads, parent pages, six-column geometry, styles, swatches, threaded text, and managed assets.
- Keep article frames at or above the 148.5 mm page-two midpoint and ad frames at or below it.
- Keep both demo/non-product disclaimers unchanged.
- Hide rulers, grids, guides, bleed marks, and frame edges by default without deleting their definitions.
- Keep Japanese right-to-left binding, `vertical-rl`, strict line breaking, mixed orientation, and sesame emphasis.
- Accept only the two known image-resolution warnings in native preflight.

---

### Task 1: Lock the presentation-ready structure in tests

**Files:**
- Modify: `scripts/create-signaloom-magazine-demo.test.ts`

**Interfaces:**
- Consumes: `buildEnglishMagazine(hero, ad, options)` and `buildJapaneseMagazine(hero, ad, options)`.
- Produces: structural regression assertions for the redesigned page constructors.

- [ ] **Step 1: Write failing view assertions**

Add this shared expectation:

```ts
expect(document.view).toMatchObject({
  showRulers: false,
  showGrid: false,
  showGuides: false,
  showFrameEdges: false,
  showBleed: false,
  showSpreads: true,
});
```

- [ ] **Step 2: Write failing editorial assertions**

Assert that no frame label matches `Timeline .* Card`, `Metadata Card`, or `本文カード`; opening panels are at most 66 mm tall; English continuation copy is left-aligned with no column rule; and each page-two article has exactly three unfilled milestone rule frames.

- [ ] **Step 3: Run the test and verify RED**

Run: `npx vitest run scripts/create-signaloom-magazine-demo.test.ts`

Expected: FAIL because the current document opens with production overlays visible and still contains filled timeline/metadata cards and justified copy.

### Task 2: Rebuild the shared defaults and English edition

**Files:**
- Modify: `scripts/create-signaloom-magazine-demo.mjs`
- Test: `scripts/create-signaloom-magazine-demo.test.ts`

**Interfaces:**
- Consumes: existing `frame`, `managedImageAsset`, styles, swatches, and asset records.
- Produces: redesigned `baseDocument`, `englishPageOne`, and `englishPageTwo`.

- [ ] **Step 1: Make the opening view presentation-ready**

Set `showRulers`, `showGrid`, `showGuides`, `showFrameEdges`, and `showBleed` to `false`; retain `showSpreads: true`, snapping, and guide definitions.

- [ ] **Step 2: Recompose English page 1**

Use this geometry:

```text
0–22 mm     quiet masthead rail
26–76 mm    asymmetric two-line feature title
78–104 mm   compact deck
105–117 mm  coral hairline + workspace metadata strip
118–297 mm  full-bleed hero image
198–260 mm  compact opening article panel
150–196 mm  image-integrated pull quote
268–286 mm  caption + folio
```

Remove `en-p1-meta-card` and `en-p1-meta-text`. Add `en-p1-system-rule` and `en-p1-system-line`. Resize the opening panel to no more than 82×62 mm, make opening copy ragged-right, retain one translucent paper panel and one coral quote rule, and remove every other decorative container.

- [ ] **Step 3: Recompose English page 2**

Delete the three filled timeline cards. Add three 0.45 mm milestone rules at x 14, 76, and 138 mm with open text frames below. Place two ragged-right body columns at x 14–126 mm and a larger quote/closing zone at x 136–196 mm. Preserve every frame from `en-p2-divider` onward unchanged.

- [ ] **Step 4: Run the focused test**

Run: `npx vitest run scripts/create-signaloom-magazine-demo.test.ts`

Expected: English expectations pass; Japanese expectations remain red until Task 3.

### Task 3: Rebuild the Japanese edition for RTL/vertical reading

**Files:**
- Modify: `scripts/create-signaloom-magazine-demo.mjs`
- Test: `scripts/create-signaloom-magazine-demo.test.ts`

**Interfaces:**
- Consumes: shared defaults from Task 2.
- Produces: redesigned `japanesePageOne` and `japanesePageTwo`.

- [ ] **Step 1: Recompose Japanese page 1**

Remove `jp-p1-meta-card` and `jp-p1-meta-text`. Add the slim metadata rule/line, start the hero at 118 mm, place a compact vertical article panel on the outer/right side around x 116–196 mm and y 198–262 mm, and place the white vertical pull quote toward the gutter around x 25–102 mm and y 151–218 mm. Keep the side title as the single coral vertical accent.

- [ ] **Step 2: Recompose Japanese page 2**

Replace the three filled milestone cards with open rules and Japanese labels. Preserve three balanced vertical article zones between y 69 and 138 mm, with the pull quote in its own vertical lane. Preserve every frame from `jp-p2-divider` onward unchanged.

- [ ] **Step 3: Run builder/container tests**

Run: `npx vitest run scripts/create-signaloom-magazine-demo.test.ts src/features/paper/SlpprFormat.test.ts src/shared/files/ValidatedAssetContainer.test.ts`

Expected: 3 files and 29 tests pass with zero failures.

### Task 4: Regenerate and inspect actual `.slppr` artifacts

**Files:**
- Rewrite: `/home/cabewse/Documents/Loom Workspace/Signaloom-Story-English-Magazine.slppr`
- Rewrite: `/home/cabewse/Documents/Loom Workspace/Signaloom-Story-Japanese-Magazine.slppr`

**Interfaces:**
- Consumes: final builder and dedicated Flow image assets.
- Produces: two native-openable Paper containers.

- [ ] **Step 1: Regenerate both editions**

Run: `node scripts/create-signaloom-magazine-demo.mjs --assets '/home/cabewse/Documents/Loom Workspace/Signaloom-Magazine-Flow-Assets' --output '/home/cabewse/Documents/Loom Workspace'`

Expected: both `.slppr` paths print and exit 0.

- [ ] **Step 2: Native-open both editions**

For each document inspect page-view count, overset indicators, frame kinds, facing-page x/y positions, and preflight text. Expected: two pages, zero overset, zero shape frames, English 1→2, Japanese 2→1, and only two resolution warnings.

- [ ] **Step 3: Capture clean native renders**

Capture each Paper spread without manually hiding overlays. Confirm the files open clean by default, English spacing is natural, opening panels fit their copy, hierarchy reads at fit-to-spread scale, and the lower-half advertisements are unchanged.

### Task 5: Final verification and documentation

**Files:**
- Modify: `docs/notes/904-signaloom-bilingual-magazine-demo.md`

**Interfaces:**
- Consumes: final artifacts and native inspection evidence.
- Produces: durable handoff and a clean repository commit.

- [ ] **Step 1: Record the redesign outcome**

Document the hidden-overlay defaults, removal of dashboard cards, ragged-right English copy, compact opening panels, native screenshot review, and zero-overset evidence.

- [ ] **Step 2: Run final verification**

Run both `unzip -t` checks, `npm run verify:flow-production`, the 29 magazine/container tests, `npm run build`, and `git diff --check`.

Expected: valid archives, 311 passing Flow tests and 63 node contracts, 29 passing magazine/container tests, successful build, and clean diff.

- [ ] **Step 3: Commit**

Stage the builder, tests, and note, then commit with `refactor(paper): modernize Signaloom magazine spreads`.
