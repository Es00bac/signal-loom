# AUD-020 — Ordinary Flattened PDF shape/text double-paint correction

Base (parent, exact): `3d628c858d7c69bff424c61fea9d595bf327b93b`
Branch: `overlap/opus-aud020-flattened-pdf`

Scope: the **shape/text double-paint** half of AUD-020 only. The exact-font half was already
corrected in prior integrated lineages (FBL-005/AUD-020, docs/notes/920) and is untouched here.

## Defect on the parent

The "high-quality flattened PDF" (`pages-raster` and its reader-spread / booklet siblings) was a
hybrid, not a flatten:

1. `buildDefaultRasterPaperPdfRequest` (`src/components/Paper/PaperWorkspaceUtils.ts`) requested the
   page snapshot with `backdropOnly: true`.
2. `paperPageFlattenExport.ts` `backdropOnly` keeps `panel`/`image`/`shape`/`document` frames but
   drops every text frame from the raster.
3. `paperPdfExport.ts` then re-rendered **every** output frame as a live vector overlay
   (`renderPageVectorOverlay`) above the raster `<img>`. CSS suppressed only panel/image imagery, so
   **shapes were painted twice** (once in the raster, once live — the live copy changes
   opacity/compositing on a translucent shape) and **all author text was live vector**, making a mode
   named "raster" dishonest.

## Correction (honest fully-raster contract for every `-raster` mode)

- Removed the default caller's `backdropOnly: true` so the exact-font page snapshot bakes shapes,
  text, and placed content into the page image exactly once.
- `exportPaperRasterPagesToPdfHtml` and `exportPaperRasterSpreadsToPdfHtml` now emit **only** the
  supplied page image(s) plus the structural print layout (`@page`, `.paper-raster-page` /
  `.paper-raster-spread` / `.paper-raster-spread-slot` / `.paper-raster-backdrop` /
  `.paper-raster-blank`). Deleted `renderPageVectorOverlay` and all `.paper-page` / `.frame-*` /
  bubble-tail overlay CSS (deletion over selective `.frame-shape` hiding — the contract is fully
  raster, not another hybrid). Each page image appears exactly once per intended placement; booklet
  imposition still pads with blank slots and places each page once.
- Non-raster `pages` / `reader-spreads` / `booklet-proof` (vector) requests unchanged.
- Managed PDF/X hybrid/vector pipeline (`paperPdfx*`) unchanged.
- Exact managed-font preparation/readiness, placed-document typed guards, linked-source
  revalidation, destination-first chooser ordering, DPI/size, page order/imposition, metadata, and
  cleanup all preserved (the default route still flows through
  `buildPaperDocumentExactManagedFontOutput` + the shared flatten path + the rasterization guard).

## Red proof on the parent

Before the production edits, the new/updated tests fail on `3d628c85`:

```text
node node_modules/vitest/vitest.mjs run --configLoader runner \
  src/lib/paperPdfExport.test.ts src/components/Paper/PaperWorkspaceUtils.test.ts
# Tests  4 failed | 50 passed (54)
```

The 4 red failures (each a distinct facet of the double paint through a real production boundary):

1. `paperPdfExport.test.ts` › "builds a fully-raster page PDF request …" — `pages-raster` HTML still
   contained the live author text `This line must not be reflowed by PDF text layout.` (and
   `class="frame` / `frame-shape` overlay).
2. `paperPdfExport.test.ts` › "builds rasterized reader-spread and booklet …" — spread/booklet raster
   HTML still contained `class="frame` live overlay (and `Do not keep this live in spread PDFs.`).
3. `PaperWorkspaceUtils.test.ts` › "sends flattened page snapshots …" — default-export `pages-raster`
   HTML still contained live `PDF parity text`.
4. `PaperWorkspaceUtils.test.ts` › "bakes a translucent shape and author text …" — the rasterized
   input SVG was **missing** `Baked once into raster` (backdropOnly dropped the text), proving text
   was drawn live, not baked. The translucent shape (`rgba(51, 102, 255, 0.5)`) was present in the
   SVG **and** re-emitted in the overlay — the shape double paint.

## Green after the correction

```text
node node_modules/vitest/vitest.mjs run --configLoader runner \
  src/lib/paperPdfExport.test.ts src/components/Paper/PaperWorkspaceUtils.test.ts
# Test Files  2 passed (2) | Tests  54 passed (54)

# focused Paper PDF / flatten / spreads / webcomic / exact-font / managed-font /
# placed-document / text-composition / print-production / all paperPdfx* suites:
node node_modules/vitest/vitest.mjs run --configLoader runner <20 files>
# Test Files  20 passed (20) | Tests  210 passed (210)

npx tsc -b --force            # exit 0 (forced non-incremental app + node project refs)
npx eslint <4 changed files>  # exit 0
npm run verify:paper-production  # Paper production verification: passed  (PDF/X-1a + PDF/X-4)
git diff --check              # clean
```

Route disposition:
- `pages-raster`, `reader-spreads-raster`, `booklet-proof-raster` → fully raster (fixed here).
- `pages`, `reader-spreads`, `booklet-proof` (browser/vector) → unchanged.
- PDF/X-1a / PDF/X-4 managed hybrid/vector → unchanged; `verify:paper-production` still passes.

## Residual risk

- The fully-raster page snapshot now depends entirely on the exact-font/placed-document raster path
  for text fidelity (already the contract for Source Library / webcomic output; text quality is
  bounded by `outputDpi`). This is intentional — an honest raster — but text is no longer selectable
  in the ordinary flattened PDF (selectable type remains the job of the PDF/X and vector `pages`
  routes).
- `verify:paper-production` writes generated proofs under `artifacts/` (untracked, not committed);
  removed after verification to keep the worktree clean.

## Required independent review

Fresh independent review is mandatory. This author did not self-approve.
