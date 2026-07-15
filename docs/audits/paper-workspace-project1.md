# Paper Workspace Project 1 Production Audit

This is the durable defect and evidence ledger for Project 1, the licensed managed-print core. The machine-readable counterpart is `src/lib/paperProductionAudit.ts`. Entries began at `reproduced`; Project 1 changes status only when the stated implementation and verification evidence exist.

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
| Stability Fast | $0.02 estimate, provider-reported pixels | HTTP 200/SUCCESS; PNG 2552 x 2552, 5,362,548 bytes, SHA-256 `1981875b0ca0d55997f03e9cfbde3a3170a564d1f4f0ab89640628841f876211`; frame replacement succeeded at 300 effective PPI. |
| Stability Conservative | $0.40 estimate, non-empty preservation prompt, creativity `0.35`, provider-reported pixels | HTTP 200/SUCCESS; PNG 3112 x 3112, 9,375,800 bytes, SHA-256 `3f0edeb0557609245ef93ed46d3fdb50e5c720fbd68fe3e38b650d73b3eb13d4`; frame replacement succeeded at 366 effective PPI. |

The initial unconfigured-key check correctly prevented a paid call. After the user configured their BYOK key, both authorized live modes returned binary results and the UI applied and measured them without exposing credential material. The `stability-effective-ppi` ledger entry is now verified. Full credential-free details are in `docs/audits/paper-stability-live-2026-07-14.md`.

## Defect Ledger

### `asset-inline-base64`

- Severity/status/commercial: high / verified / no.
- Evidence: `PaperImportedFont.dataBase64` and `PaperFrameAsset.src` in `src/types/paper.ts`; encode/decode use in `src/lib/paperFontLibrary.ts`.
- Reproduce: `rg -n "src\\?: string|dataBase64" src/types/paper.ts src/lib/paperFontLibrary.ts`.
- Expected fix: Tasks 2-6 introduce content-addressed binary records, bounded containers, a Paper asset repository, `.slppr` v2 migration, reference-only runtime state, and explicit object-URL lifetimes. JSON snapshots and manifests must contain references, never binary strings.
- Result: Persisted Paper document, history, project-snapshot, and `.slppr` manifest state now carries content-addressed references only. Base64 and `data:` values are accepted only as legacy migration input or transient export/runtime boundaries; migration stores their bytes in the repository before saving references.
- Verify: `npx vitest run src/shared/assets/contentAddressedAsset.test.ts src/features/paper/assets src/features/paper/SlpprFormat.test.ts src/lib/paperDocument.test.ts` and the final invariant scan.

### `font-system-authority`

- Severity/status/commercial: critical / verified / yes.
- Evidence: free-form `PaperTypography.fontFamily` in `src/types/paper.ts` and `browserCanCheckFont`/`document.fonts.check` in `src/lib/paperPreflight.ts`.
- Reproduce: `rg -n "fontFamily: string|browserCanCheckFont|document\\?\\.fonts" src/types/paper.ts src/lib/paperPreflight.ts`.
- Expected fix: Tasks 7-10 require vetted, licensed managed faces; exact weight/style selection; deterministic HarfBuzz shaping and composition; and production output from the same positioned glyph runs used for preview.
- Result: Task 14 removes system/browser and Liberation fallback from the PDF/X preflight decision. Every uniform and rich text run must resolve to an authorized exact managed face; missing face, rights, managed asset, or glyph evidence blocks saving. The generated native evidence must contain every expected face before bytes download.
- Verify: `npx vitest run src/lib/paperProductionPreflight.test.ts src/lib/paperProductionReport.test.ts src/lib/paperPreflight.test.ts src/lib/paperPdfxPipelineVectorText.test.ts`.

### `icc-profile-substitution`

- Severity/status/commercial: critical / verified / yes.
- Evidence: `resolveExactPaperOutputProfile` in `src/lib/paperManagedIccProfiles.ts` resolves only the selected content-addressed profile record; `PaperIccProfileManager` imports and binds `.icc`/`.icm` assets explicitly.
- Verify: `npx vitest run src/lib/paperManagedIccProfiles.test.ts src/features/paper/workspace/PaperIccProfileManager.test.tsx src/lib/paperPdfxPipeline.test.ts src/lib/paperPreflight.test.ts`, then `rg -n "INTENT_TO_BUNDLED|bundledProfileForOutputIntent|isSubstitutedOutputIntent" src/lib src/components/Paper src/features/paper` produces no production matches.
- Result: Missing, invalid, RGB, output-condition-mismatched, and substituted profiles block strict output. The user must import the exact profile supplied or approved by the print provider; Paper does not infer a profile contract from a label or description.

### `process-cmyk-roundtrip`

- Severity/status/commercial: critical / verified / yes.
- Evidence: `appendPaperNativeContent` in `src/lib/paperPdfxNativeContent.ts` emits authored process paint as `k`/`K`, and `exportPaperDocumentToPdfx` in `src/lib/paperPdfxPipeline.ts` consumes the typed render plan rather than a page-wide raster. `paperInkLimit.ts` now measures and blocks TAC overflow without changing authored CMYK.
- Verify: `npx vitest run src/lib/paperPdfxNativeContent.test.ts src/lib/paperPdfxExport.test.ts src/lib/paperPdfxPipeline.test.ts src/lib/paperPdfxPipelineVectorText.test.ts src/lib/paperInkLimit.test.ts`, then inspect the native fixture stream for `0.12 0.34 0.56 0.78 k`.
- Result: only declared flatten groups and image nodes pass through the exact ICC raster transform. A local Ghostscript `tiffsep` check on the managed spot-text fixture emitted no Cyan/Magenta/Yellow/Black ink for the text and a populated named plate; it is evidence of separations, not Acrobat/ISO certification.

### `spot-rich-text-overclaim`

- Severity/status/commercial: high / verified / yes.
- Evidence: `collectSpotTextNames` advertises text spots in `src/lib/paperPreflight.ts`, while non-uniform `richText` is rejected by `frameTextIsOutlineable` in `src/lib/paperPdfxVectorTextFrames.ts` and remains in the process raster.
- Reproduce: `rg -n "collectSpotTextNames|paperRichTextIsUniform|frameTextIsOutlineable|richText" src/lib/paperPreflight.ts src/lib/paperPdfxVectorTextFrames.ts src/lib/paperPdfxPipeline.ts`.
- Expected fix: Tasks 12-14 make preflight consume the same render plan as export, emit supported rich text on its named separation, and report a blocker instead of claiming a plate for content that cannot be emitted.
- Result: editable preflight now says that named spots are requested, not already plated. The frozen render plan blocks a requested spot that would flatten, and the generated evidence must list every requested named plate before the download callback can run.
- Verify: `npx vitest run src/lib/paperProductionPreflight.test.ts src/lib/paperProductionReport.test.ts src/lib/paperPdfxNativeContent.test.ts src/lib/paperPdfxSpotFills.test.ts`.

### `overprint-not-emitted`

- Severity/status/commercial: high / verified / yes.
- Evidence: typed render nodes carry `overprint`, and `graphicsState` in `src/lib/paperPdfxNativeContent.ts` emits `/ExtGState` entries with `OP`, `op`, and `OPM` before native paint/text content.
- Verify: `npx vitest run src/lib/paperPdfxNativeContent.test.ts` inspects `/GSOP1 gs`, `/OP true`, and `/op true` in the emitted PDF stream.
- Result: overprint is no longer only preview metadata. Press-specific separations and trapping remain an external print-provider/Acrobat Preflight validation concern.

### `pdfx-download-after-failure`

- Severity/status/commercial: critical / verified / yes.
- Evidence: `exportValidatedPaperPdfx` in `src/lib/paperProductionPreflight.ts` returns `blocked` when `report.pass` is false and calls its download dependency only afterward; `exportPaperPdfxAndSave` supplies the UI download adapter.
- Reproduce: `rg -n -C 5 "if \(!report\.pass\)|dependencies\.download" src/lib/paperProductionPreflight.ts`.
- Result: `exportValidatedPaperPdfx` freezes a clone and reachable asset IDs, runs production preflight, generates in memory, validates PDF structure plus native font/spot evidence, and invokes the download adapter only for `saved`. The workspace PDF/X and KDP routes use that transaction without changing the commercial license gate.
- Verify: `npx vitest run src/lib/paperProductionPreflight.test.ts src/lib/paperProductionReport.test.ts src/lib/paperPdfxValidate.test.ts src/components/Paper/PaperWorkspaceUtils.test.ts src/lib/licenseGates.test.ts`.

### `stability-provider-contract`

- Severity/status/commercial: high / verified / no.
- Evidence: `src/lib/paperStabilityUpscale.ts` validates Fast/Conservative inputs, preserves aspect during binary preparation, validates provider MIME/dimensions, and stores only a hash-addressed result. `src/lib/paperStabilitySource.ts` verifies a managed source record or creates an in-memory binary record from a runtime URL before the request.
- Verify: `npx vitest run src/lib/paperStabilityUpscale.test.ts src/lib/paperStabilitySource.test.ts src/lib/paperImageUpscale.test.ts src/lib/paperPreflight.test.ts`.
- Result: Task 17 first verified that both modes disable submission without a key, then live-verified Fast and Conservative after the user configured BYOK. Both returned HTTP 200/SUCCESS PNG binaries and replaced the frame without reading or logging the key. See `docs/audits/paper-stability-live-2026-07-14.md`.

### `stability-effective-ppi`

- Severity/status/commercial: critical / verified / yes.
- Evidence: `buildPaperManagedPrintUpscaledFramePatch` preserves the existing placement/crop/rotation fields while replacing the source with a managed result whose actual provider dimensions and `printUpscale` evidence are stored. The generic Data URL helper no longer accepts a Stability callback. `paperPreflight` displays measured PPI, and strict production preflight still blocks assets below the higher of 300 PPI and document DPI.
- Verify: `rg -n "PaperPrintStabilityUpscale|stabilityResult" src/lib/paperImageUpscale.ts src/features/paper/workspace/PaperWorkspace.tsx`; `npx vitest run src/lib/paperStabilityUpscale.test.ts src/lib/paperImageUpscale.test.ts src/lib/paperPreflight.test.ts`.
- Result: Conservative returned a 3112 x 3112 PNG and achieved 366 PPI; Fast returned a 2552 x 2552 PNG and achieved 300 PPI. Both managed replacements cleared the original low-resolution warning. Response hashes and byte sizes are recorded in `docs/audits/paper-stability-live-2026-07-14.md`.

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

Commercial entitlement remains the existing offline license gate; this audit does not change the gate, pricing, or verifier. Public claims must not imply that any `external-pending` Acrobat, RIP/press, KDP, InDesign, or live-provider gate has passed.

## Project 1 Closure (2026-07-14)

The final focused suite passed 24 files and 221 tests, including the Project 1 audit-ledger contract. `npm run verify:paper-production -- --output-dir /tmp/sloom-paper-production-verify-task18-final` passed for byte-stable PDF/X-1a and PDF/X-4 fixtures; on this host qpdf, Poppler, pdffonts, pdfimages, and Ghostscript `tiffsep` all passed. The generated PDFs contained three embedded managed faces, a 600x399 CMYK image at 300x300 PPI, process Cyan/Magenta/Yellow/Black separations, and the named `PANTONE 185 C` separation.

The complete repository suite passed 589 files and 4,394 tests. `npm run lint` and `npm run build` also passed. The protected speech-bubble baseline remained green in the focused suite. The final scan found no production profile-substitution path or unsupported PDF/X certification statement; `data:`/Base64 occurrences are legacy migration inputs, transient export/runtime helpers, or test fixtures rather than persisted managed assets.

Project 1 is locally complete and both Stability modes are live-verified. External print gates remain: Adobe Acrobat/Enfocus Preflight, a real RIP/press proof, KDP upload, and InDesign IDML round-trip. Those are evidence gaps, not a reason to bypass the paid PDF/X gate or weaken strict export validation.
