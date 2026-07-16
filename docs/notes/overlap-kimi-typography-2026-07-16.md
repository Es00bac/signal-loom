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
