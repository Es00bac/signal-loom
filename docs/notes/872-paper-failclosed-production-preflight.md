# Paper Fail-Closed Production Preflight

Task 14 adds the strict save transaction for licensed Paper PDF/X output.

## Behavior

- `paperProductionPreflight.ts` freezes a cloned Paper revision and its reachable content-addressed asset IDs before any PDF/X bytes are generated. The generated render plan carries that revision and is rejected when it does not match.
- Strict preflight blocks missing exact CMYK profile, missing or mismatched managed asset, browser/system font fallback, missing managed glyph, unplateable requested spot, TAC overflow, insufficient placed PPI, and PDF/X-1a live transparency.
- `exportValidatedPaperPdfx` generates only into memory, rechecks the render plan when the pipeline returns it, runs the internal structural validator, compares native font and spot evidence, and calls its download adapter only for a saved result.
- `paperProductionReport.ts` labels a passing file as structurally verified by Sloom Studio's internal checks. It does not claim Acrobat, RIP, Enfocus, ISO, or press certification.
- The legacy editable preflight now describes spots as requested native plates. It no longer claims a plate before generated evidence exists, and it no longer describes Liberation/browser substitution or display-text rasterization as production fallback.
- `PaperWorkspaceUtils` uses the transaction for PDF/X and KDP PDF/X-1a. The workspace preserves the existing commercial license calls and passes the original content-addressed document into the frozen transaction.

## Verification

Focused Task 14 suite passed locally:

```bash
npx vitest run src/lib/paperManagedIccProfiles.test.ts src/lib/paperPdfxExport.test.ts src/lib/paperPdfxNativeContent.test.ts src/lib/paperPdfxPipeline.test.ts src/lib/paperPdfxPipelineVectorText.test.ts src/lib/paperPdfxSpotFills.test.ts src/lib/paperPdfxValidate.test.ts src/lib/paperPdfxVectorText.test.ts src/lib/paperPdfxVectorTextFrames.test.ts src/lib/paperPreflight.test.ts src/lib/paperProductionAudit.test.ts src/lib/paperProductionPreflight.test.ts src/lib/paperProductionReport.test.ts src/lib/paperRenderPlan.test.ts src/lib/paperTextComposition.test.ts src/components/Paper/PaperWorkspaceUtils.test.ts
```

This is internal structural and evidence validation, not a replacement for an authorized Acrobat Preflight, Enfocus, RIP, or printer review.
