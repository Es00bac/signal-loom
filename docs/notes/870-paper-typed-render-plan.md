# Paper Typed Render Plan

Task 12 adds the deterministic semantic layer between Paper documents and production output.

- `paperPrintPaint` resolves authored process CMYK, gray, and named spot swatches directly into typed inks. RGB CSS values remain explicit managed sRGB paint for exact-profile conversion later; no authored CMYK passes through RGB.
- `compilePaperRenderPlan` includes effective parent-page frames, deterministic stacking, page background, native paths, managed image asset references, rich-text composition, spot run paints, frame/image transforms, and bubble-chain paths.
- Unsupported visual features such as gradients, blurred shadows, arcs, skew/scale, text stroke, and linked documents become explicit `flatten-group` nodes with stable reasons. The group bounds include speech-bubble tails that intentionally extend outside their frame.
- Page flattening now supports rendering only selected group frame ids with no page background, so Task 13 can rasterize only deliberate flatten groups instead of repainting native siblings into the CMYK backdrop.
- Creation and preflight now retain and inspect fill/stroke swatch references. TAC overages are described as strict-production blockers rather than a silent export reduction.

Task 13 remains responsible for consuming this plan in the PDF/X emitter, including exact `k`/`K`, gray, spot, overprint, font, and flatten-group output.

Focused verification: `paperPrintPaint`, `paperRenderPlan`, `paperPageFlattenExport`, `paperColorManagement`, Paper document/text/bubble/stacking suites, targeted ESLint, `tsc -b`, and `npm run build`.
