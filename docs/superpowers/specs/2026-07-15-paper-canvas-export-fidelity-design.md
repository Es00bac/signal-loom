# Paper canvas/export fidelity repair

Date: 2026-07-15

## Outcome

Paper's flattened PNG, Soft Proof, and full-page PDF/X paths must reproduce the authored page rather than a visually similar reconstruction. Parent-page artwork, ordinary negative-z artwork, transparency, line wrapping, and column typography must occupy the same relative stack and geometry as the live canvas.

The Signaloom bilingual demo will also preserve the user's intended translucent black pull-quote backing as durable document artwork and use contrast-safe running-head text over its cobalt parent-page band.

## Considered approaches

1. **Dim parent artwork in both editor and export.** This would reproduce the old screen appearance but would silently alter authored opacity in production output. Rejected.
2. **Use authored opacity everywhere and normalize only the local CSS stacking context.** Parent ownership remains visible through the existing Parent badge; the artwork itself stays WYSIWYG. Running-head colors in the demo become contrast-safe. Selected.
3. **Screenshot the live editor DOM for every output.** This risks exporting guides, selection chrome, lazy image state, and viewport-dependent geometry. Rejected.

## Rendering design

- Continue to resolve parent and local frames through `resolvePaperPageFramesForOutput`.
- Map the sorted frame list through the same positive local stacking model used by the canvas before generating print HTML. This preserves relative order while preventing negative CSS z-indices from falling behind the opaque page background.
- Render inherited frames at their authored opacity in the live canvas. Parent badges and locking communicate ownership without changing page appearance.
- Mirror the live typography properties currently omitted by print HTML: `text-wrap-style`, first-line indent, last-line alignment, caps/numeric variants, per-frame column gutter, balance mode, and column rule.
- Preserve solid-fill alpha as RGBA plus frame opacity. The existing SVG-to-canvas raster then composites the translucent frame over the photograph before CMYK conversion.

## Demo design

- Keep the cobalt running-head parent band.
- Set running-head copy that crosses the band to warm-paper/white for durable contrast.
- Add a translucent blue-black rectangular panel behind the page-one pull quote in both English and Japanese documents. It remains subordinate to the coral rule and quote typography.
- Regenerate both `.slppr` packages from the deterministic builder, then regenerate Soft Proof and KDP PDF evidence from the installed configured application.

## Verification

- Unit regression: inherited and negative-z translucent panels serialize to positive local layers while retaining alpha.
- Unit regression: print HTML contains the same wrapping, indent, numeric, and column CSS as the canvas.
- Installed-app proof: page-one parent band, running head, translucent pull-quote backing, loom photograph, and matching line breaks are visible.
- PDF inspection: both pages render, including the page-two model advertisement; PDF/X and bleed metadata remain intact.
- Repository gates: focused tests, Paper production verification, full tests, TypeScript/build, lint on touched files, and `git diff --check`.
