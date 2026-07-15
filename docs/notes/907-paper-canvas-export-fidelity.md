# Paper canvas/export visual fidelity repair

Date: 2026-07-15

## Outcome

Paper's live canvas, flattened PNG, CMYK Soft Proof, and KDP full-page PDF/X path now share the same visible frame order and the relevant typography rules. The bilingual Signaloom demo outputs retain the cobalt parent-page running band, contrast-safe running heads, balanced pull-quote wrapping, and a deliberately translucent blue-black callout over the page-one photograph.

The installed licensed/configured Sloom Studio build was rebuilt and exercised against both real `.slppr` packages without replacing its normal user-data profile.

## Root causes

1. Parent-page frames use very low document z-indices so they sort beneath local page frames. The live canvas remapped the sorted list into a positive local stacking context, but print HTML emitted the raw negative values. Chromium therefore painted the parent artwork behind the opaque `.paper-page` background.
2. The live canvas dimmed every inherited frame to at most 72% opacity as an ownership affordance. That made the editor itself non-WYSIWYG and accidentally kept same-cobalt demo text legible over the hidden/dimmed cobalt band.
3. Print HTML omitted several typography properties used by the live canvas, most visibly `text-wrap-style: balance`. It also ignored per-frame column gutters/balance/rules. Pull quotes consequently wrapped differently even when their frame geometry matched.
4. The user's translucent pull-quote backing was not present in the deterministic demo source package. It is now first-class document artwork in both editions.

## Implementation

- `renderPrintPage` maps resolved output frames through `buildPaperCanvasFrameLayers` before serializing them. Relative ordering is unchanged, but every CSS z-index is safely above the page background.
- `resolvePaperCanvasFrameOpacity` keeps canvas artwork at its authored opacity; the existing Parent badge and locking communicate master ownership without altering the design.
- Print text CSS now mirrors first-line indent, last-line alignment, caps/numeric variants, balanced/pretty wrapping, per-frame column gutter, column balance, and column rule.
- The deterministic magazine builder adds `en-p1-pull-backdrop` and `jp-p1-pull-backdrop` as 62%-fill / 92%-frame-opacity blue-black panels below the quote copy.
- English and Japanese page-one mastheads/issues and page-two running heads use warm-paper text over the cobalt parent band.

## Installed-app evidence

Editable documents:

- `/home/cabewse/Documents/Loom Workspace/Signaloom-Story-English-Magazine.slppr`
- `/home/cabewse/Documents/Loom Workspace/Signaloom-Story-Japanese-Magazine.slppr`

Soft proofs:

- `Signaloom-Story-English-Soft-Proof.png` — 1240×1754; parent band, running heads, translucent callout, loom photograph, and matched quote wrapping visible.
- `Signaloom-Story-Japanese-Soft-Proof.png` — 1240×1754; the same parity points plus Japanese vertical text visible.

Production PDFs:

- `Signaloom-Story-English-KDP-interior.pdf` — 2 pages, 16,941,151 bytes.
- `Signaloom-Story-Japanese-KDP-interior.pdf` — 2 pages, 16,116,781 bytes.

Both PDF page-one rasters contain the corrected parent artwork, translucent quote backing, and loom photograph. Both page-two rasters contain the full Sloan Studio model/T-shirt advertisement. The Japanese page-two raster retains vertical article typography and furigana. `qpdf --check` reports no syntax or stream-encoding errors for either file; `pdfinfo` reports two 613.276×859.89-point pages and PDF 1.4.

## Verification

- TDD red/green regressions for positive parent/local stacking, authored inherited opacity, alpha retention, text wrapping/indent/variants, per-frame columns, and bilingual demo callout/contrast.
- `npm test`: 618 files / 4,836 tests passed.
- `npm run verify:paper-production`: passed.
- `npm run build`: passed.
- ESLint on all touched implementation/test files: 0 errors; four pre-existing `PaperWorkspace.tsx` hook warnings remain.
- `git diff --check`: clean.
- Installed-app smoke: both editions opened as two-page Paper documents, produced FOGRA39L Coated 1240×1754 Soft Proof previews, and saved KDP-targeted PDF/X-1a files at 300 DPI with 0.125-inch bleed.

## Caveats

The source hero and advertisement artwork remains below 300 effective PPI at its placed size. Full-page output is rasterized at 300 DPI, but that does not create missing source detail. A commercial print run should use higher-resolution source photography and the printer's requested output profile/stock specification.
