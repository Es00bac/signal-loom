# AUD-035 reusable comic default placement

Date: 2026-07-18

Author lane: Product Mechanic implementation

Base: `cdcb79cee2a379e67a778940ed38fbf3c157b632`

Production/tests commit: `39c0934327b7f8e5e9c79f62d9cd7d809ef846fa`

## Status

AUD-035 is implemented and locally verified. This is an author candidate and still requires an
independent gate and integration decision.

## Contract

A comic editor asset remains reusable after its persisted data is normalized. Every new placement
copies the saved `EditorComicDefaults` fields into a fresh comic timeline clip:

- comic kind;
- text, family, size, and text color;
- fill, stroke color, and stroke width;
- tail angle and length;
- line height, letter spacing, and alignment.

Intentional empty text/family strings and zero-valued comic fields survive. Each placement owns a
new clip identity and never mutates the saved asset. Placement-time track, start, and duration are
applied after asset styling and remain authoritative. Legacy comic assets without a
`comicDefaults` object receive the already-declared speech-bubble defaults.

## Route inventory

Both Editor Asset cards and their context-menu track actions converge on
`VideoWorkspace.placeEditorAssetOnTrack`, which calls `buildVisualClipFromEditorAsset`. The shared
builder now projects text, shape, and comic defaults through one function before applying the
caller's placement values.

`getEditorAssets` is the persisted composition-data boundary used to build the Video Workspace's
reusable asset list. It now normalizes `kind: 'comic'` rather than dropping those entries. Comic
normalization preserves valid stored values without truthiness fallback and uses
`createComicDefaults` only for absent or invalid legacy fields.

No new comic fields or storage schema were introduced.

## Red proof

The permanent AUD-035 tests were run against the old implementation before the production change:

- both saved speech/caption cases failed because normalization returned no comic asset;
- the legacy missing-default case likewise returned no asset;
- result: 3 failed, 14 passed in `src/lib/editorAssets.test.ts`.

## Green verification

- Focused reusable asset suite: `src/lib/editorAssets.test.ts` — 17 tests passed.
- Adjacent comic/video/timeline/compositor suite: 8 files, 105 tests passed.
- Forced app TypeScript — passed.
- Forced Node TypeScript — passed.
- Touched-file ESLint — passed with zero errors or warnings.
- `git diff --check` — passed.
- Production build — passed, 3,280 modules transformed.

The focused regressions cover saved speech and caption variants, every declared comic default,
empty strings, zeros, repeated placement, distinct clip identities, exact caller-owned placement
values, legacy missing defaults, and no mutation of the saved asset.

## Residual risk

The asset schema still contains only the legacy polar tail defaults (`tailAngleDeg` and
`tailLengthPx`). Newer Bezier tail-tip clip fields are intentionally not invented on the saved
asset. If those become reusable asset defaults later, they require an explicit schema addition and
migration rather than inference in this fix.
