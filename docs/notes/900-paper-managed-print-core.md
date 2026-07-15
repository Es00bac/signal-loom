# Paper Managed Print Core

## Scope

Project 1 completes Paper's managed hybrid print core without changing the offline commercial entitlement, license verifier, pricing, or PDF/X feature gate. The protected speech-bubble baseline remains commit `b642957`; its focused tests passed in the Project 1 suite.

## Asset Architecture

Paper binary content is content-addressed with SHA-256 references. The repository owns immutable bytes, browser object URLs are reference-counted runtime views, and `.slppr` v2 stores bytes in bounded content-addressed ZIP entries. Persisted Paper document, history, project-snapshot, and manifest state keeps references only. Legacy Base64 or `data:` values are migration input: their bytes are imported into the repository and stripped before a managed document is saved.

## Fonts And Text

Strict PDF/X and print-ready output requires an exact managed font face with recorded identity, source, and embedding-rights evidence. The editor and export consume deterministic HarfBuzz-backed rich-text composition, so strict export does not authorize a browser/system fallback or a Liberation substitute. Missing managed faces, unsuitable rights, unresolved glyphs, and unavailable assets block strict output.

The Font Library offers an explicit, user-initiated Fontsource download path for vetted open faces. It does not distribute bundled font files with the application and records provenance/license metadata for the downloaded face. The downloader is available to Community users; the strict PDF/X gate remains commercial.

## Color And PDF/X

Strict export requires the exact selected managed CMYK ICC asset. Output-condition aliases and fallback profiles are rejected. The shared render plan preserves authored CMYK/gray, named spots, and supported overprint as native PDF content; managed RGB artwork is transformed through the selected profile. Unsupported effects either resolve through declared flattening or block when they would invalidate strict output.

PDF/X-1a and PDF/X-4 exports freeze document/assets, preflight the exact render plan, generate in memory, validate structural and native-content evidence, and call the download adapter only for a passing transaction. The golden fixture covers embedded managed fonts, mixed rich text, CMYK, named `PANTONE 185 C`, overprint, managed RGB artwork, 300 PPI placement, bleed, X-4 transparency, and the X-1a opaque equivalent.

## Stability

The Stability adapter accepts and returns binary data, validates Fast and Conservative provider constraints, stores only content-addressed result assets, and calculates achieved PPI from provider-reported output dimensions and physical placement. It does not describe local fitting as generated detail; strict output blocks inadequate achieved PPI.

The Task 17 UI smoke opened both paid modes. This machine had no user-configured Stability key, so Fast and Conservative both disabled submission before a paid call. No credential, request, header, or provider output was read or logged. Local provider-contract behavior is verified; live provider-result MIME, dimensions, hash, and achieved-PPI evidence remains external-pending in `docs/audits/paper-stability-live-2026-07-14.md`.

## Verification

The final commands and results were:

- Focused Project 1 suite: 24 files, 221 tests passed.
- `npm run verify:paper-production -- --output-dir /tmp/sloom-paper-production-verify-task18-final`: passed. qpdf, Poppler, pdffonts, pdfimages, and Ghostscript `tiffsep` passed locally for both PDF/X standards.
- `node --test scripts/paper-production-verification-lib.node-test.mjs`: 4 passed.
- `npm test`: 589 files, 4,394 tests passed.
- `npm run lint`: passed.
- `npm run build`: passed. Existing Vite externalization/chunk-size warnings remain non-failing build warnings.

The production verifier observed three embedded managed faces, one 600x399 CMYK image placed at 300x300 PPI, process Cyan/Magenta/Yellow/Black separations, and `PANTONE 185 C` separation output. This is local structural/separation evidence, not Acrobat, ISO, or press certification.

## External Gates And Handoff

Still external-pending: Acrobat/Enfocus Preflight, a print-provider RIP/physical proof, KDP upload, InDesign IDML round-trip, and a configured Stability provider result. These do not weaken the existing paid gate or strict local validation.

Project 2 should carry the Layout/Interoperability handoff, Project 3 the Document Integrity/container coordination across workspaces, and Project 4 Runtime Quality. Preserve the content-addressed Paper asset boundary and strict managed-font/ICC requirements when those projects integrate with Flow or Image.
