# Paper KDP export and Soft Proof repair

Date: 2026-07-15

## Outcome

Paper now has an offline, exact-profile path from an editable `.slppr` document to a useful CMYK soft proof and a natively saved KDP-targeted PDF/X-1a. The installed, licensed Sloom Studio build was exercised with the user's normal configured profile against both Signaloom magazine documents.

## Root causes

1. Redistribution-cleared CMYK profiles shipped in `public/icc/`, but the Paper profile manager exposed only file import. Documents therefore had no exact managed output-profile asset.
2. Soft Proof stopped at an unavailable-profile error and did not offer setup in context.
3. Soft Proof passed the durable Paper document directly to the flattened-page renderer. Managed image locators have no runtime URL by design, so image frames silently became their solid frame fill. The KDP path already materialized those assets, which explained why the PDF contained photographs while the original proof did not.
4. KDP preflight treated editable fonts and live opacity as blockers before its own flattened-page output could resolve them.
5. Strict PDF/X delivery used a browser download anchor, so Electron provided no native destination dialog or reliable saved-path feedback.
6. FOGRA39's nominal 300% TAC can quantize to 300.392% in 8-bit CMYK. Treating the single-byte rounding step as substantive over-inking blocked otherwise correct output.

## Implementation

- `paperIccProfiles.ts` and `paperManagedIccProfiles.ts` expose the bundled catalog with exact output-condition metadata and store the selected bytes as a content-addressed managed ICC asset.
- `PaperIccProfileManager.tsx` provides a bundled-profile selector alongside exact user import.
- `PaperSoftProofModal.tsx` embeds that manager in missing/error states, labels `Page N of M`, and distinguishes the current-page preview from the printer handoff file.
- `paperSoftProofBrowser.ts` now materializes content-addressed page artwork before building the proof raster. `paperPageFlattenExport.ts` pre-decodes embedded images and fails closed when an image/document was not materialized instead of silently outputting an empty colored frame.
- `paperPdfxPipeline.ts` supports deliberate full-page flattening for the KDP preset. `paperProductionPreflight.ts` resolves font/transparency constraints through that explicit route while retaining low source PPI as a visible warning.
- `paperInkLimit.ts` corrects only a one-byte converted-CMYK quantization overshoot. Larger TAC excess still fails production validation.
- Electron's preload/main bridge accepts already validated PDF bytes, opens the native PDF save chooser, writes the exact bytes, and returns the saved path/canceled/error state.
- `create-signaloom-magazine-demo.mjs` packages and selects bundled FOGRA39 in both `.slppr` files.
- `native-paper-kdp-soft-proof-smoke.mjs` tests the installed app without replacing its configured user-data directory. It imports a real `.slppr`, verifies a populated soft-proof PNG, exports through the native KDP path, and preserves prior evidence if startup fails.

## Installed-app evidence

Documents:

- `/home/cabewse/Documents/Loom Workspace/Signaloom-Story-English-Magazine.slppr`
- `/home/cabewse/Documents/Loom Workspace/Signaloom-Story-Japanese-Magazine.slppr`

Outputs:

- `/home/cabewse/Documents/Loom Workspace/Signaloom-Story-English-Soft-Proof.png` — 1240×1754; page-one loom photograph present.
- `/home/cabewse/Documents/Loom Workspace/Signaloom-Story-Japanese-Soft-Proof.png` — 1240×1754; page-one loom photograph present.
- `/home/cabewse/Documents/Loom Workspace/Signaloom-Story-English-KDP-interior.pdf` — 2 pages, PDF 1.4 / PDF-X-1a:2003, 17,142,441 bytes.
- `/home/cabewse/Documents/Loom Workspace/Signaloom-Story-Japanese-KDP-interior.pdf` — 2 pages, PDF 1.4 / PDF-X-1a:2003, 16,659,084 bytes.

Both PDFs contain `/OutputIntents`, `/DestOutputProfile`, `/TrimBox`, and `/BleedBox`; `qpdf --check` reports no syntax or stream-encoding errors. Page one contains the loom photograph, and page two contains the Sloan Studio T-shirt/model photograph. The native completion text reports FOGRA39L Coated, 300 DPI, and 0.125-inch bleed.

The demo's placed source images remain 108 effective PPI (hero) and 142 effective PPI (advertisement). KDP output is rasterized at 300 DPI, but this does not invent missing source detail; the warnings remain visible and higher-resolution source art is recommended for a real print run.

## Verification

- TDD red/green coverage for bundled profile installation, actionable Soft Proof setup, managed-artwork proof materialization, fail-closed page flattening, native strict-PDF saving, KDP full-page flattening, low-PPI disclosure, and one-byte TAC quantization.
- `npm test`: 618 test files / 4,833 tests passed after the final managed-artwork regression slice.
- `npm run verify:paper-production`: passed.
- `npm run build`: passed.
- `npm run lint`: 0 errors; 84 pre-existing warnings remain outside this task.
- Installed app rebuilt to `/home/cabewse/.local/opt/signal-loom` while retaining the normal configured profile.

## Caveats

The KDP preset produces a structurally verified, flattened PDF/X-1a interior target; it is not a substitute for the printer/KDP upload review. A commercial job still needs the printer's requested trim, page count, stock, binding, output profile, and proof approval. Standard non-KDP PDF/X export remains the editable/native-content path and continues to require managed production fonts and its stricter preflight constraints.
