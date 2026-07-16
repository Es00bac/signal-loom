# AUD-038 — ICC/WASM resource ownership repair

Date: 2026-07-16

Implementation/test commit: `c9863066553da6fa85d088aa516ea9f85a74aced` (`fix(paper): release ICC WASM resources`).

## Scope and ownership ledger

| Resource | Owner / creation point | Borrowed by | Success disposal | Failure disposal |
| --- | --- | --- | --- | --- |
| Shared `LcmsModule` engine instance | `getIccEngine()` lazily instantiates and caches `lcms.wasm` for the renderer/process lifetime | All ICC operations | Deliberately not per-operation disposed; lcms-wasm exposes no engine destroy operation | A failed instantiation remains the existing cached-promise behavior; no LCMS handles exist yet. |
| Temporary profile opened by `describeIccProfile` | `cmsOpenProfileFromMem` in `describeIccProfile` | None | Closed through `usingOwnedPaperResource` after profile metadata is read | The same helper closes it after metadata lookup failure; cleanup-only failure is surfaced. |
| Validation sRGB profile, output CMYK profile, and transform | `validateCmykOutputProfileTransform` | None | Deletes transform, then closes CMYK and sRGB profiles | The identical reverse-order cleanup runs after every initialized allocation step, including invalid space/failed transform construction. |
| Returned RGB→CMYK sRGB profile, output CMYK profile, and transform | `createRgbToCmykTransform` | The caller that received the returned fresh transform | The returned optional `dispose()` deletes transform, closes CMYK, then closes sRGB exactly once | Partial creation releases all acquired handles before rethrowing the original creation error. |
| PDF/X transform | `PaperPdfxPipelineDeps.createTransform`; contract now explicitly transfers a *fresh* transform to `exportPaperDocumentToPdfx` | `buildPaperPdfx` only during that export; it does not own/delete it | `usingOwnedPaperResource` runs on both ordinary and `flattenAllPages` paths | Rasterization, render-plan, font, or PDF construction failure still releases the fresh transform; a borrowed/shared transform must omit `dispose()` and is never deleted. |
| Soft-proof sRGB profile, CMYK profile, and proofing transform | `createSoftProofTransform` | `softProofPaperPageInBrowser` only while creating one preview | The returned mandatory `dispose()` deletes the proofing transform and closes both profiles exactly once | Partial creation cleans every acquired handle. Browser materialization/SVG/raster/canvas/proof work uses `usingOwnedPaperResource`, so failure still disposes the proof. |
| ICC byte arrays, RGB/CMYK buffers, page RGBA rasters, and PDF bytes | Their input/calling layer in JavaScript | LCMS reads inputs; conversion returns ordinary typed arrays | No LCMS/native handle deletion applies; normal JS lifetime/GC remains unchanged | No new ownership transfer is introduced. The repair never mutates or retains these buffers. |

`IccCmykTransform.dispose` is optional precisely to represent borrowed/non-native transforms (for example the approximate transform used by tests and fallback paths). Newly created LCMS transforms expose it; direct test callers now call it in `finally`, while the PDF/X pipeline is the explicit owner of its dependency-created transform.

`disposeOwnedPaperResources` attempts every cleanup even if an earlier delete/close throws. If work had already failed, the original error remains the thrown error and a `PaperResourceCleanupError` is attached under `getPaperResourceCleanupError(error)`. If work succeeded, the cleanup-only error is thrown. This preserves the causal work error without silently discarding native cleanup trouble.

## Deterministic red-to-green evidence

Before production changes, the newly added tracked-LCMS lifecycle suite failed exactly as expected:

```text
npx vitest run src/lib/paperIccLifecycle.test.ts --configLoader=runner
Test Files  1 failed (1)
Tests       6 failed (6)
```

The failures showed:

- 4 leaked RGB→CMYK transforms after four successful conversions;
- one leaked sRGB profile for each soft-proof partial-init failure (`open-cmyk`, wrong CMYK space, and proofing-transform creation);
- 4 leaked sRGB profiles after four successful soft proofs; and
- one still-owned transform after the first repeated flattened PDF/X export.

`src/lib/paperIccLifecycle.test.ts` now provides deterministic LCMS fakes that count profile/transform creates, close/delete calls, and outstanding handles. It covers 100 RGB→CMYK iterations, 100 soft-proof iterations, 50 PDF/X flattened exports, every meaningful post-allocation RGB/validation/soft-proof construction failure, cleanup continuation after every delete/close throws, primary-error preservation with retained cleanup failure, and PDF/X raster failure after transform creation. The browser soft-proof adapter suite separately covers repeated previews plus failures in materialization, SVG build, rasterization, and proof application.

Final neighboring Paper ICC/PDF-X/soft-proof suite:

```text
npx vitest run src/lib/paperIccLifecycle.test.ts src/lib/paperIccEngine.test.ts src/lib/paperSoftProof.test.ts src/lib/paperSoftProofBrowser.test.ts src/lib/paperSoftProofImage.test.ts src/lib/paperPdfxPipeline.test.ts src/lib/paperPdfxPipelineVectorText.test.ts src/lib/paperPdfxExport.test.ts src/lib/paperPdfxVectorText.test.ts src/lib/paperPdfxNativeContent.test.ts src/lib/paperPdfxValidate.test.ts src/lib/paperManagedIccProfiles.test.ts src/lib/bundledFontPdfxIntegration.test.ts src/features/paper/workspace/PaperSoftProofModal.test.tsx src/features/paper/workspace/PaperIccProfileManager.test.tsx --configLoader=runner
Test Files  15 passed (15)
Tests       79 passed (79)
```

The initially missing ignored generated font inventory was restored with the existing deterministic `npm run prepare:font-library` command before running the bundled-font neighboring test. It produced no tracked source change.

Static and delivery checks passed:

```text
npx tsc -p tsconfig.app.json --noEmit --incremental false --pretty false
exit 0

npx tsc -p tsconfig.node.json --noEmit --incremental false --pretty false
exit 0

npx eslint src/lib/paperColorManagement.ts src/lib/paperIccEngine.ts src/lib/paperPdfxPipeline.ts src/lib/paperSoftProofBrowser.ts src/lib/paperIccLifecycle.test.ts src/lib/paperIccEngine.test.ts src/lib/paperPdfxExport.test.ts src/lib/paperPdfxVectorText.test.ts src/lib/paperSoftProofBrowser.test.ts
exit 0

git diff --check
exit 0

npx vite build --configLoader=runner
3251 modules transformed; built in 1.39s; exit 0
```

The production build retained its existing `new URL("./", import.meta.url)`, browser-externalized `module` (Harfbuzz/lcms), and large-chunk warnings.

## Residual risks

- This proves lcms profile/transform ownership with deterministic fakes and preserves real ICC color-output tests, but it does not measure actual browser/Electron WASM heap bytes over a long interactive session. A platform profiler/RIP run remains useful external evidence.
- The cached lcms engine remains process-lifetime state by design. This audit repairs per-operation handles only; it cannot force an engine-level destructor that lcms-wasm does not expose.
- A cleanup exception after a primary work failure is attached to the primary error rather than replacing it. Callers that present or log such failures should preserve that attached detail; primitive thrown values are exceptionally handled by `console.error` to keep cleanup visible.
