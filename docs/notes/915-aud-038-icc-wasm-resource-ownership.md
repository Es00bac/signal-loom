# AUD-038 — ICC/WASM resource ownership repair

Date: 2026-07-16

Implementation/test commit: `c9863066553da6fa85d088aa516ea9f85a74aced` (`fix(paper): release ICC WASM resources`).

## Scope and ownership ledger

| Resource | Owner / creation point | Borrowed by | Success disposal | Failure disposal |
| --- | --- | --- | --- | --- |
| Shared `LcmsModule` engine instance | `getIccEngine()` lazily instantiates and caches `lcms.wasm` for the renderer/process lifetime | All ICC operations | Deliberately not per-operation disposed; lcms-wasm exposes no engine destroy operation | A failed instantiation remains the existing cached-promise behavior; no LCMS handles exist yet. |
| Temporary profile opened by `describeIccProfile` | `cmsOpenProfileFromMem` in `describeIccProfile` | None | Closed through `usingOwnedPaperResource` after profile metadata is read | The same helper closes it after metadata lookup failure; cleanup-only failure is surfaced. |
| Validation sRGB profile, output CMYK profile, and transform | `validateCmykOutputProfileTransform` | None | Deletes transform, then closes CMYK and sRGB profiles | The identical reverse-order cleanup runs after every initialized allocation step, including invalid space/failed transform construction. |
| Returned RGB→CMYK sRGB profile, output CMYK profile, and transform | `createRgbToCmykTransform` | The caller that received the returned fresh transform | Its required `dispose()` deletes transform, closes CMYK, then closes sRGB exactly once | Partial creation releases all acquired handles before rethrowing the original creation error. |
| PDF/X transform | `PaperPdfxPipelineDeps.createTransform`; its `OwnedPaperPdfxTransform` contract transfers a *fresh*, required-dispose transform to `exportPaperDocumentToPdfx` | `buildPaperPdfx` only during that export; it does not own/delete it | `usingOwnedPaperResource` runs on both ordinary and `flattenAllPages` paths | Rasterization, render-plan, font, or PDF construction failure still releases the fresh transform; borrowed/shared transforms remain only at explicitly non-owning boundaries. |
| Soft-proof sRGB profile, CMYK profile, and proofing transform | `createSoftProofTransform` | `softProofPaperPageInBrowser` only while creating one preview | The returned mandatory `dispose()` deletes the proofing transform and closes both profiles exactly once | Partial creation cleans every acquired handle. Browser materialization/SVG/raster/canvas/proof work uses `usingOwnedPaperResource`, so failure still disposes the proof. |
| ICC byte arrays, RGB/CMYK buffers, page RGBA rasters, and PDF bytes | Their input/calling layer in JavaScript | LCMS reads inputs; conversion returns ordinary typed arrays | No LCMS/native handle deletion applies; normal JS lifetime/GC remains unchanged | No new ownership transfer is introduced. The repair never mutates or retains these buffers. |

`IccCmykTransform.dispose` remains optional only for explicitly borrowed/non-native boundaries (for example the approximate transform used by tests and fallback paths). `createRgbToCmykTransform` and `PaperPdfxPipelineDeps.createTransform` return/require owned required-dispose transforms; direct test callers call them in `finally`, while the PDF/X pipeline owns its dependency-created transform.

`disposeOwnedPaperResources` attempts every cleanup even if an earlier delete/close throws. If work had already failed, object/function primaries retain their identity and are associated with a merged `PaperResourceCleanupError` through `getPaperResourceCleanupError(error)` without mutation; primitive primaries become an explicit cause-bearing aggregate. If work succeeded, the cleanup-only error is thrown.

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
- Cleanup evidence is held out-of-band for object/function primaries, so callers that present or log such failures should query `getPaperResourceCleanupError`; primitive primaries become explicit aggregate errors rather than being silently logged.

## Sol reviewer blocker repair — 2026-07-16

The follow-up review found that the first repair's cleanup attachment still depended on
`Object.defineProperty(primaryError, ...)`. A frozen or non-extensible `Error` therefore became a
new `TypeError`, hiding the actual lcms/export failure. It also allowed nested cleanup records to
overwrite one another, allowed post-dispose calls to enter lcms, and left the PDF/X dependency type
claiming ownership without requiring a disposer.

The repair stores cleanup evidence in a global weak side table keyed by object/function primaries;
it never mutates a thrown value. Frozen and non-extensible `Error` values retain their exact identity
and message. A primitive primary cannot be weakly keyed, so `PaperResourcePrimaryAndCleanupError`
keeps the original value as both `primaryError` and `cause`, alongside the cleanup record. Nested
cleanup records are flattened and appended in resource-disposal order. This applies recursively to
the PDF/X font runtime and transform cleanup, so a conversion/export primary remains primary even
when a shaper destroy and/or transform disposal fails.

`createRgbToCmykTransform` now returns a required-dispose owned transform, and both RGB operations
plus both soft-proof operations fail with `This ICC transform has been disposed.` before invoking
lcms. `PaperPdfxPipelineDeps.createTransform` requires `OwnedPaperPdfxTransform` at compile time
and rejects an optional/borrowed transform at runtime. `buildPaperPdfx` remains a non-owning boundary
and continues to accept the optional-dispose `IccCmykTransform` shape. PDF/X shaper cleanup now uses
the same best-effort resource disposer, clears its cache in `finally`, and tries every shaper.

The tracked-lcms deletion fake now records attempts separately from releases and throws before it
removes a handle from its outstanding set. The regression proves that a failed transform deletion
stays outstanding while both profile closes are still attempted and succeed; repeated transform
disposal attempts every owned handle only once.

### Red/green reproductions covered

- frozen and non-extensible primary `Error` values with a cleanup failure preserve identity/message;
- a primitive thrown primary becomes an explicit cause-bearing aggregate rather than losing cleanup
  evidence;
- two nested cleanup failures plus an outer cleanup failure are retained in deterministic inner-then-
  outer order;
- 100 RGB transform and 100 soft-proof lifecycle iterations, 50 flattened PDF/X iterations, partial
  construction failures, repeated disposal, and all-cleanup-attempted behavior;
- real-lcms RGB and soft-proof public calls after `dispose()` fail at the wrapper boundary;
- PDF/X compile-time and runtime owned-transform enforcement, plus a managed-font PDF/X conversion
  primary with a shaper destroy failure and owned-transform dispose attempt;
- a failing deletion remains outstanding while later profile handles are attempted and released.

### Final commands/results

```text
npx vitest run src/lib/paperIccLifecycle.test.ts src/lib/paperPdfxLifecycle.test.ts src/lib/paperIccEngine.test.ts src/lib/paperSoftProof.test.ts src/lib/paperSoftProofBrowser.test.ts src/lib/paperSoftProofImage.test.ts src/lib/paperPdfxPipeline.test.ts src/lib/paperPdfxPipelineVectorText.test.ts src/lib/paperPdfxExport.test.ts src/lib/paperPdfxVectorText.test.ts src/lib/paperPdfxNativeContent.test.ts src/lib/paperPdfxValidate.test.ts src/lib/paperManagedIccProfiles.test.ts src/lib/bundledFontPdfxIntegration.test.ts src/features/paper/workspace/PaperSoftProofModal.test.tsx src/features/paper/workspace/PaperIccProfileManager.test.tsx --configLoader=runner
Test Files  16 passed (16)
Tests       88 passed (88)

npx tsc -p tsconfig.app.json --noEmit --incremental false --pretty false
exit 0

npx tsc -p tsconfig.node.json --noEmit --incremental false --pretty false
exit 0

npx eslint src/lib/paperColorManagement.ts src/lib/paperIccEngine.ts src/lib/paperPdfxPipeline.ts src/lib/paperIccLifecycle.test.ts src/lib/paperPdfxLifecycle.test.ts src/lib/paperIccEngine.test.ts src/lib/paperSoftProof.test.ts
exit 0

git diff --check
exit 0

npx vite build --configLoader=runner
exit 0
```

### Updated residual risks

- The weak cleanup registry is intentionally process-lifetime metadata, but weak keys do not retain
  thrown objects. Primitive failures require the explicit aggregate wrapper because JavaScript offers
  no primitive identity for a side table.
- This still does not measure browser/Electron WASM heap bytes over a long interactive session or
  prove press/RIP behavior; it proves deterministic handle ownership and failure ordering locally.
