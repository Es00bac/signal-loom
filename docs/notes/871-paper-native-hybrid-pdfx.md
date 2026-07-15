# Paper Native Hybrid PDF/X

Task 13 changes Paper PDF/X from a page-wide browser raster path into a managed hybrid print pipeline.

- `paperPdfxNativeContent.ts` writes typed render-plan paths as native DeviceCMYK/DeviceGray operators, named spot inks as `/Separation` color spaces, and real `/ExtGState` overprint state. Repeated spot names with different alternate CMYK recipes are rejected.
- Managed rich text uses the same HarfBuzz-positioned glyph runs that the managed preview composes. The writer loads only the document's content-addressed managed font bytes, embeds the exact face, preserves an upright font matrix after Canvas-to-PDF coordinate conversion, and never asks the browser or host OS to resolve a production font.
- PDF/X-1a rejects live transparency; PDF/X-4 retains supported opacity state. Deliberate flatten groups and managed images are isolated RGB selections converted through the selected exact ICC profile and embedded as DeviceCMYK image XObjects. They never repaint native siblings into a page-wide backdrop.
- Total-area coverage is now measured as a blocker. The old silent UCR-style rewriting path was removed, so authored CMYK recipes are not changed during export.
- The legacy raster/vector-spec interfaces remain available for proof/backward-compatible callers, but the Paper browser adapter now drives the managed render-plan export path and has no bundled browser-font loader.

Focused verification completed locally:

```bash
npx vitest run src/lib/paperPdfxNativeContent.test.ts src/lib/paperPdfxExport.test.ts src/lib/paperPdfxPipeline.test.ts src/lib/paperPdfxPipelineVectorText.test.ts src/lib/paperPdfxSpotFills.test.ts src/lib/paperPdfxVectorTextFrames.test.ts src/lib/paperPdfxVectorText.test.ts src/lib/paperInkLimit.test.ts
npm run build
```

An additional local Poppler smoke rendered the managed-text artifact upright and extracted `Managed text extraction` with `pdftotext`. Ghostscript `tiffsep` emitted blank CMYK process plates and a nonblank `PANTONE 185 C` plate for a managed spot-text fixture. Acrobat Pro is unavailable on this Linux machine, so none of this is represented as Acrobat or ISO certification.

Task 14 remains necessary: it moves production preflight to the same plan/evidence model, blocks unsupported X-1a transparency, freezes export inputs, and prevents PDF/X download when validation fails.
