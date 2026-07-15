# Print Production Status

Updated 2026-07-14 for Paper Project 1 managed-print core.

## Release Position

Paper has a licensed strict print-export path for PDF/X-1a and PDF/X-4. The existing offline commercial entitlement remains the only gate for those exports; this work did not alter the pricing, key verifier, or license behavior.

Strict output is fail-closed. It requires the exact user-managed CMYK ICC profile and managed, rights-cleared fonts selected by the document. Browser/system font availability, generic family fallbacks, profile aliases, and substitute profiles cannot authorize PDF/X or print-ready output. A failing structural or native-content validation does not download bytes and does not label a proof as PDF/X.

The community edition can use the opt-in Font Library to download vetted open-font files directly from their source. Paper does not bundle those font files, and the downloader records the supplied license/source metadata before a downloaded face can be used for strict output.

## What Local Evidence Verifies

- Paper documents, history, snapshots, and `.slppr` v2 manifests retain content-addressed asset references. Legacy Base64 and `data:` values are migration input only; transient object/data URLs are not persisted managed assets.
- The editor and export share deterministic rich-text composition. Strict output embeds the exact managed font faces from the composed glyph runs, including mixed rich text where supported.
- Output intents resolve only to the selected hash-verified managed CMYK ICC asset. Authored CMYK/gray, named spot paints, and supported overprint stay native PDF content; RGB artwork uses the selected exact profile transform.
- PDF/X-1a and PDF/X-4 are generated from the frozen render plan, preflighted and structurally checked in memory, then saved only on a passing transaction.
- The production golden fixture is byte-stable for both standards. On this Linux host, `qpdf`, Poppler, `pdffonts`, `pdfimages`, and Ghostscript `tiffsep` passed. The fixture showed three embedded managed faces, one 600x399 CMYK image at 300x300 PPI, process Cyan/Magenta/Yellow/Black separations, and named `PANTONE 185 C` separation output.
- Stability Fast and Conservative validate binary input/output contracts, record provider-returned dimensions, and calculate achieved placed PPI. The Paper UI does not submit a paid request without the user's configured BYOK key.

## Evidence Commands

```bash
npx vitest run src/shared/assets/contentAddressedAsset.test.ts src/shared/files/ValidatedAssetContainer.test.ts src/features/paper/SlpprFormat.test.ts src/features/paper/assets src/lib/paperFontVetting.test.ts src/lib/paperManagedFonts.test.ts src/lib/paperOpenFontCatalog.test.ts src/lib/paperTextShaper.test.ts src/lib/paperTextComposition.test.ts src/lib/paperManagedIccProfiles.test.ts src/lib/paperRenderPlan.test.ts src/lib/paperPdfxNativeContent.test.ts src/lib/paperProductionPreflight.test.ts src/lib/paperProductionReport.test.ts src/lib/paperStabilityUpscale.test.ts src/lib/paperProductionGolden.test.ts src/lib/paperBubblePaths.test.ts src/lib/paperDocument.test.ts src/components/Paper/PaperWorkspaceUtils.test.ts src/lib/paperProductionAudit.test.ts
npm run verify:paper-production -- --output-dir /tmp/sloom-paper-production-verify-task18-final
node --test scripts/paper-production-verification-lib.node-test.mjs
npm test
npm run lint
npm run build
```

The final run passed 24 focused files / 221 tests, the production verifier, 4 Node verifier tests, 589 repository files / 4,394 tests, ESLint, and the production build.

## Explicit External Gates

This is local structural and separation evidence, not an Adobe or press certification. The following remain external-pending:

- Adobe Acrobat Pro or Enfocus Preflight review.
- A print-provider RIP and physical press proof.
- KDP upload validation and InDesign IDML round-trip.
- A real Stability Fast and Conservative result with a user-configured BYOK account. This machine had no configured key, so both paid UI modes correctly disabled submission before a request.

Do not market these exports as Acrobat-certified, ISO-certified, or press-certified until the relevant external evidence exists. See `docs/audits/paper-workspace-project1.md` and `docs/audits/paper-stability-live-2026-07-14.md` for the full ledger.
