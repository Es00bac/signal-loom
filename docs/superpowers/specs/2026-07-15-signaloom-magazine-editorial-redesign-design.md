# Signaloom Magazine Editorial Redesign

Date: 2026-07-15
Status: Approved

## Objective

Redesign the English and Japanese Signaloom two-page Paper editions so the editorial halves read as a contemporary art-and-technology magazine rather than a layout-system demonstration. Preserve the Flow-generated hero image, Sloan Studio advertisement composite, article subject, bilingual deliverables, half-page page-two ad boundary, and editable Paper capabilities.

## Direction

Use a restrained contemporary journal system: bold asymmetric typography, image-led composition, disciplined whitespace, fine rules, small technical metadata, and a limited cobalt/coral/cyan palette. Avoid dashboard cards, decorative containers without editorial purpose, oversized text boxes containing little copy, and justified columns with visibly stretched word spacing.

The default document view must be presentation-ready. Guides, rulers, grids, bleed marks, and frame edges remain configured and available but open hidden. Facing spreads remain enabled.

## English edition

### Page 1 — Feature opener

- Retain the masthead and issue line as a quiet top rail.
- Set the headline as one strong asymmetric composition with more controlled scale and a compact deck beneath it.
- Replace the isolated blue statistics square with a slim metadata row: `FLOW / IMAGE / VIDEO / PAPER` and one-source-system language.
- Start the hero image higher so it owns roughly the lower two-thirds of the page.
- Replace the oversized white opening card with a compact translucent paper panel sized to the copy.
- Place the pull quote as a deliberate white-on-image display block aligned to the page grid; use one coral rule as its anchor.
- Keep the caption and folio quiet and aligned to the image edge.

### Page 2 — Article continuation

- Replace the three boxed timeline cards with a single open milestone band: oversized numerals, thin top rules, concise labels, and no filled containers.
- Use three intentional reading zones rather than equal dashboard modules: two compact body columns plus one wider closing/pull-quote zone.
- Set English body copy ragged-right with restrained hyphenation to eliminate stretched spacing.
- Integrate the pull quote with the article grid and use whitespace as separation.
- Preserve the exact 148.5 mm advertisement boundary and leave the advertisement design materially unchanged.

## Japanese edition

- Preserve right-to-left binding and page 1 on the right.
- Apply the same visual system without mechanically mirroring English coordinates.
- Use horizontal display typography on the opener with one restrained vertical accent.
- Make the opening article panel compact and use vertical text only where it strengthens the hierarchy.
- Replace boxed milestones with the same open rule-and-number band in Japanese.
- Recompose page-two article columns as balanced vertical reading zones with a clearly separated vertical pull quote.
- Preserve strict Japanese line breaking, mixed glyph orientation, sesame emphasis, and the existing advertisement.

## Paper capabilities retained

- A4, 300 dpi, 3 mm bleed, six-column layout, baseline grid, parent pages, guides, and facing spreads.
- Paragraph, character, and object styles; rich text; threaded article frames; gradients; CMYK/spot swatches; multicolumn text; managed embedded Flow assets.
- The production aids are hidden by default but remain editable and toggleable.

## Acceptance criteria

- Both `.slppr` files open as one facing spread in native Paper.
- No visible triangle/default-polygon frames, overset markers, or unintentionally exposed frame labels.
- No article frame crosses below the 148.5 mm page-two boundary; no ad frame begins above it.
- English body copy has no conspicuous justification gaps.
- The page-one opening panel is visually sized to its copy rather than occupying a large empty rectangle.
- English and Japanese use corresponding editorial logic while respecting their different reading directions.
- Ads and generated images remain intact.
- Native screenshots with production overlays hidden read as contemporary editorial pages at fit-to-spread scale.
- Builder/container tests, Flow production verification, and the production build pass.

## Honest limitations

The Flow images remain below the default print-preflight PPI target at their final placed dimensions. They stay embedded and render correctly; native Paper should report only those two known resolution warnings and no layout, asset, font, or output-intent errors.
