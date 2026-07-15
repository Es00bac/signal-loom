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

## Task 17: Authorized Live Stability Smoke

The local build and focused Stability suite passed before the UI smoke. The Paper UI was exercised at `http://127.0.0.1:5175` on 2026-07-14 from 20:52:23 through 21:01:02 America/Denver (2026-07-15T02:52:23Z through 03:01:02Z). Provider settings were opened only to confirm the Stability configuration state; no credential value, local-storage record, request header, or authorization data was read, copied, or logged.

A disk-backed PNG was dropped through the Paper image-frame workflow and registered in the Source Library. The fixture was `public/signal-loom-splash.png`, SHA-256 `c1230f5f6b86faffa65c56796b21df4ca2c8946bbff403eb03882420453eeb9d`, source dimensions `1254 x 1254 px`, and the 300 PPI placement target was `2550 x 2550 px` (2.03x). Its Source Library reference was the UI-created `Page 1 imports` envelope; no inline Base64 asset was created.

| Mode | UI plan | Result |
| --- | --- | --- |
| Stability Fast | $0.02 estimate, provider-reported pixels | Submission disabled: `Stability AI API key is not configured.` No endpoint was invoked, so there is no HTTP status, output MIME, output dimensions, output hash, achieved PPI, or replacement asset. |
| Stability Conservative | $0.40 estimate, non-empty preservation prompt, creativity `0.35`, provider-reported pixels | Submission disabled: `Stability AI API key is not configured.` No endpoint was invoked, so there is no HTTP status, output MIME, output dimensions, output hash, achieved PPI, or replacement asset. |

This is an `external-pending` live-provider result, not a failed implementation claim. The UI correctly prevents a paid call without the user-supplied BYOK key. Local provider-contract behavior is verified; the `stability-effective-ppi` ledger entry remains external-pending until a configured account permits a real binary result to be measured and retained.

## Defect Ledger

### `asset-inline-base64`

- Severity/status/commercial: high / reproduced / no.
- Evidence: `PaperImportedFont.dataBase64` and `PaperFrameAsset.src` in `src/types/paper.ts`; encode/decode use in `src/lib/paperFontLibrary.ts`.
- Reproduce: `rg -n "src\\?: string|dataBase64" src/types/paper.ts src/lib/paperFontLibrary.ts`.
- Expected fix: Tasks 2-6 introduce content-addressed binary records, bounded containers, a Paper asset repository, `.slppr` v2 migration, reference-only runtime state, and explicit object-URL lifetimes. JSON snapshots and manifests must contain references, never binary strings.

### `font-system-authority`

- Severity/status/commercial: critical / fixed / yes.
- Evidence: free-form `PaperTypography.fontFamily` in `src/types/paper.ts` and `browserCanCheckFont`/`document.fonts.check` in `src/lib/paperPreflight.ts`.
- Reproduce: `rg -n "fontFamily: string|browserCanCheckFont|document\\?\\.fonts" src/types/paper.ts src/lib/paperPreflight.ts`.
- Expected fix: Tasks 7-10 require vetted, licensed managed faces; exact weight/style selection; deterministic HarfBuzz shaping and composition; and production output from the same positioned glyph runs used for preview.
- Result: Task 14 removes system/browser and Liberation fallback from the PDF/X preflight decision. Every uniform and rich text run must resolve to an authorized exact managed face; missing face, rights, managed asset, or glyph evidence blocks saving. The generated native evidence must contain every expected face before bytes download.
- Verify: `npx vitest run src/lib/paperProductionPreflight.test.ts src/lib/paperProductionReport.test.ts src/lib/paperPreflight.test.ts src/lib/paperPdfxPipelineVectorText.test.ts`.

### `icc-profile-substitution`

- Severity/status/commercial: critical / fixed / yes.
- Evidence: `resolveExactPaperOutputProfile` in `src/lib/paperManagedIccProfiles.ts` resolves only the selected content-addressed profile record; `PaperIccProfileManager` imports and binds `.icc`/`.icm` assets explicitly.
- Verify: `npx vitest run src/lib/paperManagedIccProfiles.test.ts src/features/paper/workspace/PaperIccProfileManager.test.tsx src/lib/paperPdfxPipeline.test.ts src/lib/paperPreflight.test.ts`, then `rg -n "INTENT_TO_BUNDLED|bundledProfileForOutputIntent|isSubstitutedOutputIntent" src/lib src/components/Paper src/features/paper` produces no production matches.
- Result: Missing, invalid, RGB, output-condition-mismatched, and substituted profiles block strict output. The user must import the exact profile supplied or approved by the print provider; Paper does not infer a profile contract from a label or description.

### `process-cmyk-roundtrip`

- Severity/status/commercial: critical / fixed / yes.
- Evidence: `appendPaperNativeContent` in `src/lib/paperPdfxNativeContent.ts` emits authored process paint as `k`/`K`, and `exportPaperDocumentToPdfx` in `src/lib/paperPdfxPipeline.ts` consumes the typed render plan rather than a page-wide raster. `paperInkLimit.ts` now measures and blocks TAC overflow without changing authored CMYK.
- Verify: `npx vitest run src/lib/paperPdfxNativeContent.test.ts src/lib/paperPdfxExport.test.ts src/lib/paperPdfxPipeline.test.ts src/lib/paperPdfxPipelineVectorText.test.ts src/lib/paperInkLimit.test.ts`, then inspect the native fixture stream for `0.12 0.34 0.56 0.78 k`.
- Result: only declared flatten groups and image nodes pass through the exact ICC raster transform. A local Ghostscript `tiffsep` check on the managed spot-text fixture emitted no Cyan/Magenta/Yellow/Black ink for the text and a populated named plate; it is evidence of separations, not Acrobat/ISO certification.

### `spot-rich-text-overclaim`

- Severity/status/commercial: high / fixed / yes.
- Evidence: `collectSpotTextNames` advertises text spots in `src/lib/paperPreflight.ts`, while non-uniform `richText` is rejected by `frameTextIsOutlineable` in `src/lib/paperPdfxVectorTextFrames.ts` and remains in the process raster.
- Reproduce: `rg -n "collectSpotTextNames|paperRichTextIsUniform|frameTextIsOutlineable|richText" src/lib/paperPreflight.ts src/lib/paperPdfxVectorTextFrames.ts src/lib/paperPdfxPipeline.ts`.
- Expected fix: Tasks 12-14 make preflight consume the same render plan as export, emit supported rich text on its named separation, and report a blocker instead of claiming a plate for content that cannot be emitted.
- Result: editable preflight now says that named spots are requested, not already plated. The frozen render plan blocks a requested spot that would flatten, and the generated evidence must list every requested named plate before the download callback can run.
- Verify: `npx vitest run src/lib/paperProductionPreflight.test.ts src/lib/paperProductionReport.test.ts src/lib/paperPdfxNativeContent.test.ts src/lib/paperPdfxSpotFills.test.ts`.

### `overprint-not-emitted`

- Severity/status/commercial: high / fixed / yes.
- Evidence: typed render nodes carry `overprint`, and `graphicsState` in `src/lib/paperPdfxNativeContent.ts` emits `/ExtGState` entries with `OP`, `op`, and `OPM` before native paint/text content.
- Verify: `npx vitest run src/lib/paperPdfxNativeContent.test.ts` inspects `/GSOP1 gs`, `/OP true`, and `/op true` in the emitted PDF stream.
- Result: overprint is no longer only preview metadata. Press-specific separations and trapping remain an external print-provider/Acrobat Preflight validation concern.

### `pdfx-download-after-failure`

- Severity/status/commercial: critical / fixed / yes.
- Evidence: `exportPaperPdfxAndSave` in `src/components/Paper/PaperWorkspaceUtils.ts` invokes `downloadSharedBlob` before branching on `report.pass`.
- Reproduce: `rg -n -C 5 "downloadSharedBlob\\(pdfBlob|report\\.pass" src/components/Paper/PaperWorkspaceUtils.ts`.
- Result: `exportValidatedPaperPdfx` freezes a clone and reachable asset IDs, runs production preflight, generates in memory, validates PDF structure plus native font/spot evidence, and invokes the download adapter only for `saved`. The workspace PDF/X and KDP routes use that transaction without changing the commercial license gate.
- Verify: `npx vitest run src/lib/paperProductionPreflight.test.ts src/lib/paperProductionReport.test.ts src/lib/paperPdfxValidate.test.ts src/components/Paper/PaperWorkspaceUtils.test.ts src/lib/licenseGates.test.ts`.

### `stability-provider-contract`

- Severity/status/commercial: high / fixed / no.
- Evidence: `src/lib/paperStabilityUpscale.ts` validates Fast/Conservative inputs, preserves aspect during binary preparation, validates provider MIME/dimensions, and stores only a hash-addressed result. `src/lib/paperStabilitySource.ts` verifies a managed source record or creates an in-memory binary record from a runtime URL before the request.
- Verify: `npx vitest run src/lib/paperStabilityUpscale.test.ts src/lib/paperStabilitySource.test.ts src/lib/paperImageUpscale.test.ts src/lib/paperPreflight.test.ts`.
- Remaining external evidence: Task 17 runs one credential-free Fast and Conservative smoke through the Paper UI when the user-configured BYOK provider permits it.

### `stability-effective-ppi`

- Severity/status/commercial: critical / fixed / yes.
- Evidence: `buildPaperManagedPrintUpscaledFramePatch` preserves the existing placement/crop/rotation fields while replacing the source with a managed result whose actual provider dimensions and `printUpscale` evidence are stored. The generic Data URL helper no longer accepts a Stability callback. `paperPreflight` displays measured PPI, and strict production preflight still blocks assets below the higher of 300 PPI and document DPI.
- Verify: `rg -n "PaperPrintStabilityUpscale|stabilityResult" src/lib/paperImageUpscale.ts src/features/paper/workspace/PaperWorkspace.tsx`; `npx vitest run src/lib/paperStabilityUpscale.test.ts src/lib/paperImageUpscale.test.ts src/lib/paperPreflight.test.ts`.
- Remaining external evidence: Task 17 records live Fast/Conservative output dimensions and achieved PPI without exposing credentials.

## Task 16 Local Print Verification (2026-07-14)

`src/lib/paperProductionGolden.test.ts` generates byte-stable PDF/X-1a and PDF/X-4 golden files from the same managed, hash-verified FOGRA39 profile, managed serif/sans faces, and managed image asset. The fixture contains mixed rich text, vertical Japanese when an installed CJK face is available, exact process CMYK, full and 50% `PANTONE 185 C` spot tints, emitted overprint, a 300 PPI Stability-upscaled placement, bleed, an ICC-converted sRGB raster, an X-4 live-transparent panel, and the explicit opaque equivalent required for X-1a.

No CJK font is committed or distributed by this fixture. It uses `PAPER_GOLDEN_CJK_FONT` when supplied, otherwise this Linux host's installed `/usr/share/fonts/droid/DroidSansJapanese.ttf`; hosts without an installed CJK face retain managed vertical type but should supply the variable to exercise Japanese glyph coverage.

Run the local structural gate with a caller-controlled artifact directory:

```bash
npm run verify:paper-production -- --output-dir /tmp/sloom-paper-production-verify
```

The command runs the golden fixture, writes `paper-production-golden-pdf-x-1a.pdf`, `paper-production-golden-pdf-x-4.pdf`, and `paper-production-verification.json`, then invokes each available local tool. On this host all installed checks passed for both standards: `qpdf --check`, `pdfinfo`, `pdffonts` (three embedded managed faces), `pdfimages -list` (one ICC-converted 600x399 image placed at 300x300 PPI), and Ghostscript `tiffsep` (Cyan, Magenta, Yellow, Black, and `PANTONE 185 C` separation files). The runner fails when no emitted image meets 300 PPI and records missing tools as `external-pending` rather than passing them.

This is structural and separation evidence only. Adobe Acrobat Pro Preflight is not installed on this Linux host, so Acrobat review, a print-provider RIP check, and a physical proof remain explicitly `external-pending`; neither the runner nor this audit claims certification.

## Status Rules

- `reproduced`: source evidence and a repeatable observation exist, but the defect remains.
- `fixed`: the planned implementation and focused regression test exist.
- `verified`: focused, integration, build, and required external-tool evidence all pass.
- `external-pending`: local implementation is complete but an explicitly required authorized service or external print-tool check remains.

Commercial release claims remain blocked while any commercial entry is `reproduced`, `fixed` without full verification, or `external-pending` where the external result is required for the claim.
