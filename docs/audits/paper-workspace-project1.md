# Paper Workspace Project 1 Production Audit

This is the durable defect and evidence ledger for Project 1, the licensed managed-print core. The machine-readable counterpart is `src/lib/paperProductionAudit.ts`. Every entry begins at `reproduced`; later Project 1 tasks must add focused tests and change status only when the stated fix and verification evidence exist.

## protected-baseline

The protected speech-bubble baseline is commit `b642957` (`feat(paper): improve speech bubble shaping and export parity`). Managed-print work must remain in later commits and must not squash into, amend, or otherwise rewrite this baseline.

The commit owns these nine Paper files:

1. `src/components/Paper/PaperWorkspaceUtils.test.ts`
2. `src/components/Paper/PaperWorkspaceUtils.ts`
3. `src/features/paper/workspace/PaperWorkspace.tsx`
4. `src/lib/paperBubblePaths.test.ts`
5. `src/lib/paperBubblePaths.ts`
6. `src/lib/paperDocument.test.ts`
7. `src/lib/paperDocument.ts`
8. `src/lib/paperPdfExport.ts`
9. `src/types/paper.ts`

Protected invariants:

- Speech and thought bubbles keep one continuous, closed curved outline, including tails that extend outside the frame.
- The curved-tail drag control remains available for speech and thought bubbles: dragging the curve handle updates `bubbleTailCurvePercent` and reshapes the stem independently of the tail point and pinch point.
- Bubble normalization preserves the established model fields and defaults for `bubbleShape`, legacy `bubbleWarp`, `bubblePinchXPercent`, `bubblePinchYPercent`, `bubbleTailWidthPercent`, `bubbleTailCurvePercent`, `tailXPercent`, and `tailYPercent`; the optional per-side warp fields retain their legacy symmetric fallback.
- The full editor handle set remains reachable and behaviorally distinct: tail, curve, pinch, left, right, top, and bottom. Left/right/top/bottom shape only their corresponding edge, and their handle placement tracks that edge through the resolved bubble radii.
- A selected bubble frame remains lifted above ordinary frame stacking and below guide/bleed overlays so all edit handles are reachable even when another frame overlaps it.
- Tail-over-edge stacking remains explicit: the tail handle renders last and above pinch/curve handles, which render above the four edge handles, so an overlapping bottom-edge handle cannot intercept tail dragging.
- Documents without per-side warp fields retain the byte-identical symmetric fallback path.
- Editor and export use the same bubble geometry; captions do not gain a duplicate export border.
- Print export removes the nondeterministic `system-ui` keyword while retaining concrete font-stack fallbacks.

Baseline commands run on 2026-07-14 before Task 1 edits:

```bash
git status --short
git diff --name-only
git log -5 --oneline
npx vitest run src/lib/paperBubblePaths.test.ts src/lib/paperDocument.test.ts src/components/Paper/PaperWorkspaceUtils.test.ts
```

The worktree and diff were empty. The five-commit history was `583732f`, `df9155c`, `f08d717`, `e71cd6a`, and protected commit `b642957`. The focused command passed 3 files and 68 tests. The earlier planning baseline recorded 4 touched-surface files and 75 passing tests followed by a successful production build; that historical count is retained here separately from the current focused result.

Flow and Image paths are concurrently owned and are outside Project 1. None were modified while establishing this ledger.

## Defect Ledger

### `asset-inline-base64`

- Severity/status/commercial: high / reproduced / no.
- Evidence: `PaperImportedFont.dataBase64` and `PaperFrameAsset.src` in `src/types/paper.ts`; encode/decode use in `src/lib/paperFontLibrary.ts`.
- Reproduce: `rg -n "src\\?: string|dataBase64" src/types/paper.ts src/lib/paperFontLibrary.ts`.
- Expected fix: Tasks 2-6 introduce content-addressed binary records, bounded containers, a Paper asset repository, `.slppr` v2 migration, reference-only runtime state, and explicit object-URL lifetimes. JSON snapshots and manifests must contain references, never binary strings.

### `font-system-authority`

- Severity/status/commercial: critical / reproduced / yes.
- Evidence: free-form `PaperTypography.fontFamily` in `src/types/paper.ts` and `browserCanCheckFont`/`document.fonts.check` in `src/lib/paperPreflight.ts`.
- Reproduce: `rg -n "fontFamily: string|browserCanCheckFont|document\\?\\.fonts" src/types/paper.ts src/lib/paperPreflight.ts`.
- Expected fix: Tasks 7-10 require vetted, licensed managed faces; exact weight/style selection; deterministic HarfBuzz shaping and composition; and production output from the same positioned glyph runs used for preview.

### `icc-profile-substitution`

- Severity/status/commercial: critical / reproduced / yes.
- Evidence: `INTENT_TO_BUNDLED`, `bundledProfileForOutputIntent`, and `isSubstitutedOutputIntent` in `src/lib/paperPdfxPipeline.ts`.
- Reproduce: `rg -n "INTENT_TO_BUNDLED|bundledProfileForOutputIntent|isSubstitutedOutputIntent" src/lib/paperPdfxPipeline.ts`.
- Expected fix: Task 11 stores validated CMYK output profiles as managed assets and resolves only the exact profile selected by the document. Missing, invalid, RGB, or substituted profiles must block production output.

### `process-cmyk-roundtrip`

- Severity/status/commercial: critical / reproduced / yes.
- Evidence: the RGBA `rasterizePage` dependency and page-wide raster backdrop in `src/lib/paperPdfxPipeline.ts`, with browser rasterization in `src/lib/paperPdfxBrowser.ts`.
- Reproduce: `rg -n "rasterizePage|PaperPdfxPageRaster|createTransform|rgba" src/lib/paperPdfxPipeline.ts src/lib/paperPdfxBrowser.ts`.
- Expected fix: Tasks 12-13 compile typed print paints/render nodes and emit authored process colors as native PDF `k`/`K` operands. Only explicit flatten groups may pass through the exact ICC raster transform, and total-area-coverage overflow must block rather than silently rewrite authored CMYK.

### `spot-rich-text-overclaim`

- Severity/status/commercial: high / reproduced / yes.
- Evidence: `collectSpotTextNames` advertises text spots in `src/lib/paperPreflight.ts`, while non-uniform `richText` is rejected by `frameTextIsOutlineable` in `src/lib/paperPdfxVectorTextFrames.ts` and remains in the process raster.
- Reproduce: `rg -n "collectSpotTextNames|paperRichTextIsUniform|frameTextIsOutlineable|richText" src/lib/paperPreflight.ts src/lib/paperPdfxVectorTextFrames.ts src/lib/paperPdfxPipeline.ts`.
- Expected fix: Tasks 12-14 make preflight consume the same render plan as export, emit supported rich text on its named separation, and report a blocker instead of claiming a plate for content that cannot be emitted.

### `overprint-not-emitted`

- Severity/status/commercial: high / reproduced / yes.
- Evidence: `PaperPrintProductionSpec.overprintPreview` in `src/types/paper.ts` is normalized and serialized as preview metadata, but the PDF/X writer has no corresponding overprint graphics state.
- Reproduce: run `rg -n "overprintPreview" src/types/paper.ts src/lib/paperPrintProduction.ts src/lib/paperDocument.ts`, then confirm `rg -n "ExtGState|OPM|/OP|/op" src/lib/paperPdfx*.ts` finds no production operator path.
- Expected fix: Tasks 12-13 carry overprint intent on typed render nodes and emit `/ExtGState` entries with `OP`, `op`, and `OPM`, backed by low-level PDF operator tests.

### `pdfx-download-after-failure`

- Severity/status/commercial: critical / reproduced / yes.
- Evidence: `exportPaperPdfxAndSave` in `src/components/Paper/PaperWorkspaceUtils.ts` invokes `downloadSharedBlob` before branching on `report.pass`.
- Reproduce: `rg -n -C 5 "downloadSharedBlob\\(pdfBlob|report\\.pass" src/components/Paper/PaperWorkspaceUtils.ts`.
- Expected fix: Task 14 freezes revision/assets, preflights, generates and validates in memory, and invokes download only for a `saved` result. Failed validation must return stable blocker codes and no bytes may be saved as PDF/X.

### `stability-provider-contract`

- Severity/status/commercial: high / reproduced / no.
- Evidence: Paper calls shared `buildStabilityUpscaleRequest` in `src/features/paper/workspace/PaperWorkspace.tsx` without a Paper-owned input-dimension/aspect planner; `paperImageUpscale` forwards requested target dimensions and creativity.
- Reproduce: `rg -n "buildStabilityUpscaleRequest|sourceDataUrl|stabilityCreativity|targetWidthPx|targetHeightPx" src/features/paper/workspace/PaperWorkspace.tsx src/lib/paperImageUpscale.ts`.
- Expected fix: Task 15 adds a Paper-owned Stability planner/adapter that normalizes Fast and Conservative requests to documented side, pixel-count, aspect, prompt, and creativity limits before any network call, and leaves state unchanged on provider or cancellation failures.

### `stability-effective-ppi`

- Severity/status/commercial: critical / reproduced / yes.
- Evidence: the Stability path in `src/lib/paperImageUpscale.ts` sends provider output through `fitProviderResultToTargetDataUrl`, which crops and locally interpolates to requested target dimensions before returning target metadata.
- Reproduce: `rg -n "fitProviderResultToTargetDataUrl|steppedUpscaleToPngDataUrl|targetWidthPx|targetHeightPx" src/lib/paperImageUpscale.ts`.
- Expected fix: Task 15 stores returned provider bytes without local detail claims, records actual provider dimensions, computes effective placed PPI from achieved pixels, preserves placement/crop/rotation metadata, and marks output print-ready only when achieved PPI meets the requirement.

## Status Rules

- `reproduced`: source evidence and a repeatable observation exist, but the defect remains.
- `fixed`: the planned implementation and focused regression test exist.
- `verified`: focused, integration, build, and required external-tool evidence all pass.
- `external-pending`: local implementation is complete but an explicitly required authorized service or external print-tool check remains.

Commercial release claims remain blocked while any commercial entry is `reproduced`, `fixed` without full verification, or `external-pending` where the external result is required for the claim.
