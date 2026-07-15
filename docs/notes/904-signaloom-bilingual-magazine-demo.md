# 904 — Signaloom bilingual magazine demo

Date: 2026-07-15

## Outcome

Created two standalone, native Paper version-2 `.slppr` magazine spreads about developing Signaloom:

- `/home/cabewse/Documents/Loom Workspace/Signaloom-Story-English-Magazine.slppr`
- `/home/cabewse/Documents/Loom Workspace/Signaloom-Story-Japanese-Magazine.slppr`

Both are A4 two-page facing spreads with 3 mm bleed, a six-column editorial grid, baseline grid, guides, parent-page furniture, threaded text, paragraph/character/object styles, managed embedded images, gradients, swatches, rich text, multicolumn copy, column rules, and a lower-half page-two Sloan Studio T-shirt concept advertisement. The advertisement is explicitly marked as a demo/non-product in each language.

The Japanese edition is a full localization rather than an English layout with translated labels. It uses right-to-left binding, vertical `vertical-rl` text, mixed glyph orientation, strict Japanese line breaking, and sesame emphasis. With the document configured as a facing spread, page 1 appears on the right and page 2 on the left.

## Dedicated Flow asset project

All generated media lives in a dedicated project outside the repository:

- `/home/cabewse/Documents/Loom Workspace/Signaloom-Magazine-Flow-Assets.sloom`
- `/home/cabewse/Documents/Loom Workspace/Signaloom-Magazine-Flow-Assets.signal-loom-scratch/`
- `/home/cabewse/Documents/Loom Workspace/Signaloom-Magazine-Flow-Assets/`

The Flow graph contains 15 nodes and 13 edges. It imports the official Sloom Studio logo and builds separate hero, T-shirt, model, environment, and final advertisement outputs. The T-shirt and final composite image nodes each receive both image references and typed Text descriptions on their numbered reference ports; the final composite has three image-plus-description reference groups (garment, model, environment). This is a live demonstration of the repaired multi-type reference contract, not a hand-authored container bypass.

Atlas FLUX.2 Pro generated the editorial hero, T-shirt reference, model reference, environment reference, and final model-wearing-shirt composite. The `.sloom` project and source-library records preserve the generated results. The original unrelated active project was not saved over or modified.

## Builder

`scripts/create-signaloom-magazine-demo.mjs` deterministically builds both localized Paper documents and packages the Flow images as content-addressed managed assets. It uses the same version-2 validated asset-container shape as the Paper serializer. `scripts/create-signaloom-magazine-demo.test.ts` asserts the spread/page geometry, localization, half-page ad boundary, threaded/rich/multicolumn typography, embedded asset references, and container structure.

The demo targets the normal browser-PDF path rather than strict PDF/X. Strict PDF/X would require exact authorized managed font faces and a managed CMYK output-intent profile; claiming that target without those assets would produce production preflight errors. Spot swatches, overprint-preview intent, 300 dpi document setup, and bleed remain represented in the editable document.

## Native verification

Both finished files were opened through the installed Sloom Studio Paper file router and rendered as two-page facing spreads. A visual review also replaced the builder's unintended default polygon callouts with rectangular editorial panels, preventing the former triangle shapes from crowding their text. Native checks confirmed:

- two Paper page views per document;
- English left-to-right order and Japanese right-to-left order;
- zero overset text indicators in either edition;
- no container, managed-asset, font, or output-intent errors;
- the article remains above the 148.5 mm page-two midpoint and every ad frame begins at or below it;
- both embedded Flow images render in Paper;
- two expected resolution warnings remain (the generated 896×1200 hero and 1536×1024 ad are enlarged beyond the default print-preflight PPI target).

The resolution warnings are truthful metadata, not missing pixels or links. The assets are embedded and render correctly; a later print-production variant can route the same Flow outputs through the existing Stability/local upscale workflow before packaging.

## Verification

- `npx vitest run scripts/create-signaloom-magazine-demo.test.ts src/features/paper/SlpprFormat.test.ts src/shared/files/ValidatedAssetContainer.test.ts` — passed: 3 files / 29 tests.
- Both generated archives pass ZIP integrity checks and native `.slppr` deserialization.
- Final repository-wide Flow gate and production build are recorded in the task completion commit.
