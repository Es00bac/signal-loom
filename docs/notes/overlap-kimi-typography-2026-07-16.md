# Overlap / Kimi Typography Repair — 2026-07-16

## Owned findings

- **FBL-012** — Bundled family names must produce valid quoted/escaped Canvas and CSS font declarations.
- **FBL-013** — Image “All Small Caps” must not invalidate Canvas font shorthand.
- **FBL-014** — Video `fontKerning` must survive normalization through preview/export state.
- **AUD-026** — Image and Video must apply the selected bundled face family, weight, and style atomically.

## Baseline

- Branch: `overlap/kimi-typography`
- Baseline commit: `cef276d8fc8a03d6708f0307cf24f2b5f26bfccd`
- Pre-repair: `npm run build` green, full vitest suite green (624 files / 4,871 tests).

## Failures reproduced / confirmed

1. `imageTextCanvasFont` interpolated `style.fontFamily` directly, so families such as `M PLUS 1`, `Source Sans 3`, and `M PLUS Rounded 1c` produced invalid Canvas font shorthands (`normal 400 24px M PLUS 1, sans-serif`).
2. `videoTextFlow.ts`, `mediaComposition.ts`, `ImageComicTools.ts`, and the Video CSS preview did the same for Canvas/CSS.
3. `imageTextCanvasFont` emitted `all-small-caps` into the Canvas `font` shorthand, which Chromium rejects.
4. `normalizeEditorTextTypography` in `manualEditorState.ts` did not copy `fontKerning`, so the user's Video kerning choice was silently dropped before render/export.
5. `BundledFontBrowser` callbacks in Image (`TextFontStackControls`) and Video (stage-object inspector, clip inspector, text-tool dialog) updated only `fontFamily`, discarding the selected `weight`/`style`.

## Design

- Added a single shared serializer `src/lib/formatFontFamily.ts` with `formatFontFamily(stack)` and `formatSingleFontFamily(name)`. It leaves CSS generic keywords (`sans-serif`, `system-ui`, …) unquoted and quotes/escapes every other name. All Canvas/CSS font sites now call it instead of interpolating raw family strings.
- For FBL-013, `imageTextCanvasFont` maps `all-small-caps` to the valid `small-caps` shorthand token, and `getRenderedImageTextContent` lowercases the content so the rendered result approximates all-small-caps. The retained metadata still stores `all-small-caps` so PSD/package intent is preserved.
- For FBL-014, added `fontKerning` normalization in `normalizeEditorTextTypography`.
- For AUD-026:
  - Image `TextFontStackControls` now emits a `{ fontFamily, fontWeight, fontStyle }` patch when a bundled face is selected.
  - Video `EditorTextStageObject` gained `fontWeight`/`fontStyle`; `editorStageObjects.ts` normalizes/defaults them; `drawTextStageObject` uses them.
  - Video text clips now update `textTypography.fontWeight`/`fontStyle` alongside `textFontFamily`.
  - The text-tool dialog draft and `EditorTextDefaults` carry `fontWeight`/`fontStyle`, which are persisted back to assets/clips.
  - Stage-object-to-asset migration propagates weight/style into both `textDefaults` and `textTypography`.

## Files changed

- `src/lib/formatFontFamily.ts` (new)
- `src/lib/formatFontFamily.test.ts` (new)
- `src/components/ImageEditor/ImageTextLayer.ts`
- `src/components/ImageEditor/ImageTextLayer.test.ts`
- `src/components/ImageEditor/ImageComicTools.ts`
- `src/components/ImageEditor/ImageEditorTextLayerControls.tsx`
- `src/components/ImageEditor/ImageEditorTextShapeProperties.tsx`
- `src/lib/videoTextFlow.ts`
- `src/lib/videoTextFlow.test.ts`
- `src/lib/mediaComposition.ts`
- `src/lib/mediaComposition.test.ts`
- `src/lib/manualEditorState.ts`
- `src/lib/manualEditorState.test.ts`
- `src/lib/editorStageObjects.ts`
- `src/lib/editorStageObjects.test.ts`
- `src/lib/editorAssets.ts`
- `src/lib/editorAssets.test.ts`
- `src/features/video/workspace/VideoWorkspace.tsx`
- `src/types/flow.ts`
- `docs/notes/overlap-kimi-typography-2026-07-16.md`

## Test evidence

```text
npx vitest run \
  src/lib/formatFontFamily.test.ts \
  src/lib/manualEditorState.test.ts \
  src/components/ImageEditor/ImageTextLayer.test.ts \
  src/lib/videoTextFlow.test.ts \
  src/lib/mediaComposition.test.ts \
  src/lib/editorStageObjects.test.ts \
  src/lib/editorAssets.test.ts \
  src/components/ImageEditor/ImageEditorTextLayerControls.test.tsx \
  src/components/ImageEditor/ImageEditorTextShapeProperties.test.tsx

Test Files  9 passed (9)
Tests      138 passed (138)
```

```text
npx tsc -b      # exit 0
npm run build   # TypeScript + Vite production build green
```

```text
npx eslint <modified files>  # 0 errors (11 pre-existing warnings in VideoWorkspace.tsx)
```

## Commit

- SHA: `16de26e`
- Message: `fix(overlap-kimi-typography): FBL-012 FBL-013 FBL-014 AUD-026`

## Remaining risks

- Browser-only validation: jsdom accepts some invalid font strings that Chromium rejects. The shared serializer has deterministic unit coverage, but a real Chromium/browser assertion (e.g. `ctx.font` round-trips unchanged for every shipped bundled family) is not wired because Playwright/puppeteer are not installed and adding a browser harness was scoped to not block the lane. This is documented as a follow-up regression gate.
- `all-small-caps` is rendered by lowercasing content + `small-caps`. This matches the OpenType `smcp`+`c2sc` intent encoded in `inferImageTextOpenTypeFeatures` but is an approximation for mixed-case/CJK content; full OpenType `c2sc` would require a renderer that supports per-glyph features on Canvas.
- Video stage text objects previously accepted an optional `typography` field on `drawTextStageObject` for stroke/shadow/arc. That path is preserved as a fallback, but no UI currently sets it; future typography controls for stage text should use `object.fontWeight`/`fontStyle` plus `typography`.
- Bundled font registration across app restart / project transfer (FBL-011) and condensed-width face handling (FBL-010) are outside this lane.


## K2.7 cross-provider review follow-up

Sol's independent review blocked integration of `16de26e`. The following blockers were fixed in a focused follow-up.

### Blockers addressed

1. **FBL-012 — `formatFontFamily` bypasses on normal paths**
   - `ImageEditorCanvas` live text overlay now quotes the font family with `formatFontFamily` and applies `fontVariantCaps`.
   - `editorTextRender` (Video text source-dimension measurement and SVG overlay) now quotes the family before assigning to Canvas/SVG.
   - `VideoWorkspace` straight-line text preview and fallback placeholder now quote the family.
   - `BundledFontBrowser` preview buttons now quote the family.
   - Added focused behavior tests for the overlay, SVG/canvas measurer, monitor preview, and bundled browser preview.

2. **FBL-012 — `formatFontFamily` CSS stack compatibility**
   - Replaced naive comma splitting with a small CSS tokenizer that handles double-quoted and single-quoted names, escaped quotes/backslashes, commas inside quotes, escaped commas in unquoted identifiers, and empty entries.
   - CSS-wide reserved words (`inherit`, `initial`, `unset`, `revert`, `revert-layer`) are now quoted.
   - Recognized generic families remain unquoted.
   - Added compatibility tests before the parser rewrite (red) and after (green).

3. **AUD-026 — text asset-to-timeline placement loses weight/style**
   - Extracted `buildVisualClipFromEditorAsset` from `placeEditorAssetOnTrack`.
   - Text assets now copy `fontWeight`/`fontStyle` into `clip.textTypography` on placement.
   - Added regression tests proving family/weight/style survive placement, normalization, and save/load boundaries.

4. **All-small-caps Unicode mutation**
   - Removed `getRenderedImageTextContent` lowercasing; retained text content is no longer mutated.
   - `imageTextCanvasFont` no longer emits `small-caps` for `all-small-caps`; `applyCanvasTypographySettings` now sets the Canvas `fontVariantCaps` property to `all-small-caps` directly.
   - The live on-canvas editor also applies `font-variant-caps: all-small-caps`.
   - Added tests for mixed-case and expanded Unicode content.

5. **Restored font-weight range safety**
   - Added shared `normalizeFontWeight` helper clamping to CSS numeric range `1`–`1000`.
   - Applied in `manualEditorState`, `editorAssets`, and `editorStageObjects` restoration paths.
   - Preserves legacy projects that lack the fields (falls back to `400`).

### Updated test evidence

```text
npx vitest run \
  src/lib/formatFontFamily.test.ts \
  src/lib/manualEditorState.test.ts \
  src/components/ImageEditor/ImageTextLayer.test.ts \
  src/lib/videoTextFlow.test.ts \
  src/lib/mediaComposition.test.ts \
  src/lib/editorStageObjects.test.ts \
  src/lib/editorAssets.test.ts \
  src/components/ImageEditor/ImageEditorTextLayerControls.test.tsx \
  src/components/ImageEditor/ImageEditorTextShapeProperties.test.tsx \
  src/components/ImageEditor/ImageEditorCanvas.textEdit.test.tsx \
  src/lib/editorTextRender.test.ts \
  src/components/Common/BundledFontBrowser.test.tsx \
  src/features/video/workspace/VideoWorkspace.test.tsx \
  --configLoader=runner

Test Files  13 passed (13)
Tests      186 passed (186)
```

```text
npx tsc -b --force   # exit 0
npm run build        # TypeScript + Vite production build green
```

```text
npx eslint <modified files>  # 0 errors (pre-existing warnings only)
git diff --check             # exit 0
```

### Follow-up commit

- SHA: `cad515c`
- Message: `fix(overlap-kimi-typography): K2.7 review blockers — FBL-012 bypasses, AUD-026 asset placement, all-small-caps, font-weight clamping`

### Updated remaining risks

- The previous `all-small-caps` content-mutation risk is resolved; the remaining caveat is browser support for the Canvas `fontVariantCaps` longhand. Unsupported browsers will render `all-small-caps` as normal case rather than small caps, but retained content stays intact.
- Browser-only validation for the serializer still applies (jsdom does not enforce invalid Canvas font strings).
- FBL-011 (bundled font registration across restart) and FBL-010 (condensed-width faces) remain outside this lane.


## Sol second independent review follow-up

Sol's second review identified four remaining blockers on the typography lane. Each was fixed and covered by tests.

### Blockers addressed

1. **`formatFontFamily` identity preservation (FBL-012)**
   - Rewrote the parser/serializer pair in `src/lib/formatFontFamily.ts` to be standards-conscious about family identity.
   - Preserves whether a family was originally quoted, so `"serif"` stays `"serif"` and does not collapse into the unquoted generic keyword `serif`.
   - Preserves meaningful quoted boundary whitespace (`"  M PLUS 1  "`).
   - Trims only separator whitespace around unquoted names.
   - Handles CSS hex escapes (`\2c`, `\20`, `\000020`), six-digit terminator whitespace consumption, literal escapes (`\,`, `\ `), and escaped newlines as line continuations.
   - Quotes CSS-wide reserved words (`inherit`, `initial`, `unset`, `revert`, `revert-layer`) when they appear as actual family names.
   - Added a dedicated `formatFontFamily standards-conscious identity preservation` describe block with red→green tests.

2. **Image raster measure/draw typography parity (FBL-013)**
   - In `rasterizeImageTextStyle`, `applyCanvasTypographySettings(mctx, style)` is now applied to the measurement context **before** `measureImageTextBlock` is called.
   - This ensures `fontVariantCaps: all-small-caps` influences wrapping/layout metrics, not just the final draw.
   - The existing `FakeTextContext` measurer now returns wider widths for `all-small-caps`, and a new regression test asserts that the resulting block/clip dimensions are larger than the `normal` case.

3. **SVG/XML attribute encoding (FBL-012)**
   - `buildTextOverlaySvgAsset` previously inserted the quoted `font-family` stack into the HTML `style` attribute using only HTML content escaping, so embedded double quotes broke the attribute.
   - Added `escapeXmlAttribute` and applied it to the entire inline `style` attribute value.
   - Added `src/lib/editorTextRender.svgDom.test.ts`, which parses the produced SVG with `DOMParser`, asserts no `parsererror`, and checks the decoded style contains the quoted family stack.

4. **Asset-to-timeline test strength (AUD-026)**
   - `buildVisualClipFromEditorAsset` is now a pure helper exported from `src/lib/editorAssets.ts`.
   - Added tests proving:
     - text asset `fontWeight`/`fontStyle` are copied into `clip.textTypography`;
     - the clip survives persisted-data normalization through `getEditorVisualClips` with typography intact;
     - the export card consumed by `renderTextCard` receives the family/weight/style and builds a Canvas font string containing `italic`, `700`, and `"M PLUS 1"`.

### Files changed in this follow-up

- `src/lib/formatFontFamily.ts`
- `src/lib/formatFontFamily.test.ts`
- `src/components/ImageEditor/ImageTextLayer.ts`
- `src/components/ImageEditor/ImageTextLayer.test.ts`
- `src/lib/editorTextRender.ts`
- `src/lib/editorTextRender.test.ts`
- `src/lib/editorTextRender.svgDom.test.ts` (new)
- `src/lib/editorAssets.ts`
- `src/lib/editorAssets.test.ts`
- `src/features/video/workspace/VideoWorkspace.tsx`
- `src/features/video/workspace/VideoWorkspace.test.tsx`
- `docs/notes/overlap-kimi-typography-2026-07-16.md`

### Updated test evidence

```text
npx vitest run \
  src/lib/formatFontFamily.test.ts \
  src/lib/manualEditorState.test.ts \
  src/components/ImageEditor/ImageTextLayer.test.ts \
  src/lib/videoTextFlow.test.ts \
  src/lib/mediaComposition.test.ts \
  src/lib/editorStageObjects.test.ts \
  src/lib/editorAssets.test.ts \
  src/components/ImageEditor/ImageEditorTextLayerControls.test.tsx \
  src/components/ImageEditor/ImageEditorTextShapeProperties.test.tsx \
  src/components/ImageEditor/ImageEditorCanvas.textEdit.test.tsx \
  src/lib/editorTextRender.test.ts \
  src/lib/editorTextRender.svgDom.test.ts \
  src/components/Common/BundledFontBrowser.test.tsx \
  src/features/video/workspace/VideoWorkspace.test.tsx \
  --configLoader=runner

Test Files  14 passed (14)
Tests      201 passed (201)
```

```text
npx tsc -b --force   # exit 0
npm run build        # TypeScript + Vite production build green
```

```text
npx eslint <modified files>  # 0 errors (11 pre-existing warnings in VideoWorkspace.tsx)
git diff --check             # exit 0
```

### Updated remaining risks

- Browser-only validation for `formatFontFamily` still applies: jsdom does not reject invalid Canvas font strings, so the suite cannot assert Chromium acceptance in Node. A real-browser regression gate remains a follow-up.
- `all-small-caps` rendering depends on the browser's support for the Canvas `fontVariantCaps` longhand; unsupported browsers fall back to normal-case glyphs while retained content stays intact.
- FBL-011 and FBL-010 remain outside this lane.


## Terra real-Chromium review follow-up — FBL-012

Terra's real-Chromium review blocked integration of the previous follow-up because the CSS tokenizer still deviated from Chromium/CSS-Syntax in three ways: hex-escape terminators, CSS comments, and serialization of invalid/escaped code points. This follow-up is **FBL-012 only**; FBL-011 (managed-face persistence across fresh processes) and FBL-010 (stretch/axis identity) remain queued as high tickets and are explicitly not claimed fixed here.

### Blockers addressed

1. **Hex-escape whitespace terminator semantics**
   - CSS Syntax consumes **one** following whitespace terminator after **any** 1–6 digit hex escape, not only after six digits.
   - Updated `consumeCssEscape` accordingly and adjusted all unit expectations.
   - Verified Chromium oracles:
     - `Foo\2c Bar, serif` → family `Foo,Bar` (no invented space)
     - `Foo\41 Bar, serif` → family `FooABar`
     - `Foo\1F600 Bar, serif` → family `Foo😀Bar`

2. **CSS comments are whitespace tokens, not family-name text**
   - Added `skipCssComment` and integrated it into the tokenizer.
   - `Foo/**/Bar, serif` now resolves to a single family `Foo Bar` rather than `Foo/**/Bar`.
   - Multiple consecutive comments/whitespace are collapsed to a single separator space inside unquoted names.

3. **Standards-correct serialization of invalid code points and malformed input**
   - Replaced the conservative ASCII identifier rule with a CSS `<ident-token>` validator (`isIdentStartCodePoint` / `isIdentCodePoint`).
   - C0 controls, DEL, quotes, backslashes, commas, and raw newlines are escaped as CSS hex escapes with explicit terminators when a name must be quoted.
   - NUL escapes decode to U+FFFD, matching Chromium.
   - Unclosed quotes are still serialized as a quoted string (fail-closed: the captured content is escaped and wrapped in double quotes).
   - Generic keywords remain unquoted, CSS-wide keywords and quoted generic-like families keep their quotes, and meaningful quoted boundary whitespace is preserved.

4. **Real-Chromium oracle**
   - Added `scripts/formatFontFamily_chromium_oracle.py`, an optional Python/Playwright script that:
     - serializes each oracle input through the TypeScript module;
     - assigns the result to a real Chromium `font-family` inline style;
     - reads the value back and asserts it round-trips unchanged.
   - Added `src/lib/formatFontFamily.chromium.test.ts`, which invokes the oracle when Playwright/tsx is available and skips cleanly otherwise, so CI does not depend on a downloaded browser.
   - The oracle script and test were both run in this environment and passed.

### Files changed in this follow-up

- `src/lib/formatFontFamily.ts`
- `src/lib/formatFontFamily.test.ts`
- `src/lib/formatFontFamily.chromium.test.ts` (new)
- `scripts/formatFontFamily_chromium_oracle.py` (new)
- `docs/notes/overlap-kimi-typography-2026-07-16.md`

### Chromium oracle results

```text
$ python3.11 scripts/formatFontFamily_chromium_oracle.py
All serializer outputs round-trip unchanged in Chromium.
```

Representative cases:

| Input | Serializer output | Chromium round-trip |
|---|---|---|
| `Foo\2c Bar, serif` | `"Foo,Bar", serif` | `"Foo,Bar", serif` |
| `Foo\41 Bar, serif` | `FooABar, serif` | `FooABar, serif` |
| `Foo\1F600 Bar, serif` | `Foo😀Bar, serif` | `Foo😀Bar, serif` |
| `Foo/**/Bar, serif` | `"Foo Bar", serif` | `"Foo Bar", serif` |
| `Foo/* comment */Bar, serif` | `"Foo Bar", serif` | `"Foo Bar", serif` |
| `inherit, serif` | `"inherit", serif` | `"inherit", serif` |
| `Foo\0 Bar, serif` | `Foo�Bar, serif` | `Foo�Bar, serif` |
| `Foo\7f Bar, serif` | `"Foo\7f Bar", serif` | `"Foo\7f Bar", serif` |
| `Foo\a Bar, serif` | `"Foo\a Bar", serif` | `"Foo\a Bar", serif` |
| `M PLUS 1, Inter, sans-serif` | `"M PLUS 1", Inter, sans-serif` | `"M PLUS 1", Inter, sans-serif` |
| `Source Sans 3, system-ui, sans-serif` | `"Source Sans 3", system-ui, sans-serif` | `"Source Sans 3", system-ui, sans-serif` |

### Updated test evidence

```text
npx vitest run \
  src/lib/formatFontFamily.test.ts \
  src/lib/formatFontFamily.chromium.test.ts \
  src/lib/manualEditorState.test.ts \
  src/components/ImageEditor/ImageTextLayer.test.ts \
  src/lib/videoTextFlow.test.ts \
  src/lib/mediaComposition.test.ts \
  src/lib/editorStageObjects.test.ts \
  src/lib/editorAssets.test.ts \
  src/components/ImageEditor/ImageEditorTextLayerControls.test.tsx \
  src/components/ImageEditor/ImageEditorTextShapeProperties.test.tsx \
  src/components/ImageEditor/ImageEditorCanvas.textEdit.test.tsx \
  src/lib/editorTextRender.test.ts \
  src/lib/editorTextRender.svgDom.test.ts \
  src/components/Common/BundledFontBrowser.test.tsx \
  src/features/video/workspace/VideoWorkspace.test.tsx \
  --configLoader=runner

Test Files  15 passed (15)
Tests      203 passed (203)
```

```text
npx tsc -b --force   # exit 0
npm run build        # TypeScript + Vite production build green
```

```text
npx eslint src/lib/formatFontFamily.ts src/lib/formatFontFamily.test.ts src/lib/formatFontFamily.chromium.test.ts
# 0 errors, 0 warnings
git diff --check    # exit 0
```

### Queued high tickets (explicitly not fixed in this commit)

- **FBL-011** — Fresh-process managed-face persistence / bundled font registration across app restart and project transfer.
- **FBL-010** — Stretch/axis identity for condensed/expanded width faces.

### Updated remaining risks

- Browser-only validation is now partially covered by the optional Chromium oracle, but the oracle is not wired into CI because it requires a Playwright browser. jsdom-only runs still cannot reject invalid Canvas font strings.
- `all-small-caps` rendering still depends on the browser's support for the Canvas `fontVariantCaps` longhand; retained content remains intact.
- FBL-011 and FBL-010 remain outside this lane.
