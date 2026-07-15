# Signaloom Bilingual Magazine Demo Design

## Outcome

Create two standalone, self-contained Signal Loom Paper documents in `/home/cabewse/Documents/Loom Workspace`:

- `Signaloom-Story-English-Magazine.slppr`
- `Signaloom-Story-Japanese-Magazine.slppr`

Each document is a two-page A4 portrait magazine spread about the development of Signaloom. The Japanese document is a full editorial localization with right-to-left binding and Japanese typesetting, not an English layout with token Japanese copy. The lower half of page two is reserved for a Sloan Studio T-shirt concept advertisement. The product and advertisement must be unmistakably labeled as a demo and not a real product or offer.

## Editorial Direction

Use a modern Swiss-tech visual system: an off-white paper field, near-black editorial typography, deep cobalt structure, electric cyan signal accents, and one restrained warm coral accent. The layouts should feel like a design and technology magazine rather than product documentation.

The shared visual language includes:

- a strong modular grid and visible alignment logic;
- large, tightly tracked display typography;
- compact folios, running labels, issue metadata, and captions;
- fine rules, color chips, numbered milestones, and asymmetric blocks;
- editorial imagery that suggests woven signals, node graphs, and a creative system becoming tangible;
- a distinct lower-half advertisement zone on page two, separated from the article by an explicit rule and an `ADVERTISEMENT / DEMO` marker.

## Spread Architecture

### Page One — Feature Opening

Page one opens with the magazine identity, issue line, and a large feature headline. A Flow-generated hero image occupies roughly the lower half of the page and may bleed to selected edges. The deck, byline, opening paragraph, pull quote, caption, and modular metadata establish a deliberate hierarchy.

English headline: **WOVEN FROM SIGNALS**  
Japanese headline: **シグナルを織る**

The English title uses horizontal display type with balanced wrapping. The Japanese title combines bold horizontal display type with a vertical side label and strict Japanese line breaking.

### Page Two — Article and Advertisement

The top half continues the article in editorial columns, including a compact milestone timeline and a pull quote. The article ends before the midpoint boundary.

The bottom half is a standalone Sloan Studio T-shirt advertisement. It contains a Flow-generated editorial product image, a short slogan, product name, and the exact disclaimer language appropriate to each edition:

- English: `CONCEPT DEMO — NOT A REAL PRODUCT — NOT FOR SALE`
- Japanese: `コンセプトデモ／実在しない商品です／非売品`

The ad must remain visually separate from the article and occupy approximately 50% of page two.

## Story and Copy

The article tells a grounded development story based on the repository itself:

1. Signaloom began as a node-based generative-media Flow canvas.
2. A graph was not enough; creative work also needed places to edit images, cut video, and typeset finished pages.
3. The product expanded into connected Flow, Image, Video, and Paper workspaces with one source library.
4. Provider variety, bring-your-own credentials, typed connections, reproducible state, and cross-device behavior became design constraints rather than afterthoughts.
5. Paper closes the loop by turning generated material into deliberate publication design.
6. This magazine spread is itself the proof: assets originate in Flow and become a finished bilingual artifact in Paper.

The voice is editorial and reflective. It should avoid unsupported claims, invented people, invented dates, and claims that the Sloan Studio item is commercially available.

## Paper Capabilities to Demonstrate

Both `.slppr` documents will deliberately exercise:

- facing-page spread view, bleed, margins, guides, document grid, and baseline grid;
- modular multicolumn composition with column gutters and rules;
- threaded article text across frames;
- paragraph, character, and object styles;
- rich text runs with weight, italic, small caps, tracking, color, and highlight variation;
- drop cap, first-line indent, paragraph spacing, balanced/pretty line breaking, and justified text;
- layered shapes, gradients, opacity, corner radius, fine strokes, and rotated accents;
- linked managed image assets embedded into the `.slppr` container;
- named document swatches and print-oriented document settings;
- page folios, captions, running labels, and hierarchy at display, deck, body, caption, and microcopy scales.

The Japanese edition additionally demonstrates:

- `Noto Sans CJK JP` / system Japanese fallbacks;
- vertical-rl text for selected editorial labels and pull copy;
- strict kinsoku line breaking and mixed CJK/Latin orientation;
- Japanese punctuation and localized measure, rhythm, and line lengths;
- right-to-left binding metadata.

## Flow-Generated Assets

Create two source assets in Signal Loom’s Flow workspace using the Atlas Cloud provider and its already-configured in-app credential:

1. **Signal weave hero** — abstract editorial technology image, dark field, luminous cobalt/cyan filaments forming a subtle node graph and woven loom structure, generous negative space, no legible text, no logo, no watermark.
2. **Sloan Studio T-shirt concept** — premium editorial studio photograph of a simple black or bone T-shirt with an abstract woven-signal graphic, neutral architectural setting, magazine lighting, no legible branding or sales copy, no watermark.

Use the same generated assets in both language editions so that the typography and localized composition—not the underlying illustration—are the variables. Preserve the generated assets in the Flow/source-library path long enough to place them in Paper, and embed their bytes in each `.slppr` so the deliverables remain self-contained.

The API key must remain inside Signal Loom's existing credential storage. Do not print it, copy it into repository files, or embed it in either `.slppr` deliverable.

## Verification

Verification is complete only when:

- both requested files exist at the exact destination paths;
- both deserialize as valid Signal Loom Paper containers;
- each contains exactly two pages and embedded managed image assets;
- page two keeps all article frames above the midpoint and all advertisement frames in the lower half;
- the English edition contains the English disclaimer and Japanese edition contains the Japanese disclaimer;
- the Japanese edition contains vertical Japanese typography and right-to-left binding metadata;
- both open in the Paper workspace without a recovery boundary or missing-asset warning;
- visual inspection confirms readable hierarchy, no material overlap, and a professional double-page composition.

## Scope Boundaries

This is a demonstration artifact, not a product launch. Do not add pricing, sizes, purchase links, QR codes, real offers, or claims of availability. Do not change the Paper or Flow application implementation unless a verified application defect blocks artifact creation.

## Approval Record

The user approved the recommended Swiss-tech direction and explicitly asked for implementation without further design questions. They later required that all visual assets be generated in the Flow workspace; that requirement supersedes use of an external image-generation path.
