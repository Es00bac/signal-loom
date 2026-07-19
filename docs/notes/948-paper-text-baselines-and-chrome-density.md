# Paper text baselines and chrome-density follow-up

Date: 2026-07-18

## Result

Paper now has a dedicated **Text baselines** top-strip toggle. It affects every text-bearing frame and
is strictly editor chrome: PDF, PNG, flattened-page, package, and print output paths do not render it.
Exact managed typography draws the actual composed horizontal or vertical line origins. While the
browser preview or active rich editor owns paint, Paper draws the frame's own leading rhythm inside
that text box, then yields to the exact overlay when managed composition reports ready.

The same follow-up reclaims scarce horizontal and vertical workspace space:

- the Paper top strip no longer repeats the document title or the static “Paper layout and print
  export” subtitle; it begins immediately with working controls;
- the active document now appears in the native titlebar as `Sloom Studio Paper — <document>`, with a
  redundant leading `Sloom Studio —` removed from older document titles;
- Source Bin no longer repeats “Saved Assets”, “Source Library”, or the explanatory paragraph above
  the controls;
- Source Library / Generated Pool, visible-item count, New Bin, Collapse All, and Expand All share one
  compact 28-pixel header row. The action icons retain localized accessible labels and tooltips.

## Implementation boundary

`PaperManagedTextLayer` owns exact baseline lines because its composition already contains each
line's `originXPt`, `originYPt`, writing mode, and layout bounds. `PaperFrameView` retains a
`managedTextReady` signal so the leading-rhythm fallback remains visible until exact glyph layout has
actually taken ownership; “eligible” alone is deliberately not treated as ready.

The new `PaperDocument.view.showTextBaselines` setting defaults to false and is sanitized on older
documents, so existing `.slppr` and `.sloom` files open unchanged. Both overlay implementations carry
`data-paper-editor-overlay="text-baselines"` and live only in the interactive workspace renderer.

`buildWorkspaceWindowTitle` centralizes the Paper titlebar rule while retaining the existing licensed
and Community titles for Flow, Video, and Image.

## Verification

- Focused and neighboring regression run: 7 test files, 124 tests passed.
- TypeScript: `npx tsc --noEmit` passed.
- Touched-file ESLint: zero errors; four pre-existing `PaperWorkspace.tsx` hook warnings remain.
- `git diff --check` passed.
- Real 1920×1080 browser proof verified the compact toolbar/Source Bin, native-style page title, toggle
  pressed state, and one live `leading-rhythm` overlay inside a newly drawn text frame.
- Visual artifacts and the complete browser-validation session were moved without deletion to
  `/mnt/d/Sloom-Studio-artifacts/2026-07-18-paper-baseline-ui/`; the two final screenshots are under
  its `playwright-screenshots/` directory.
- Production build passed with 3,288 modules.
- Electron packaging verified 116 font families, 430 faces, and 546 payload files before packing, then
  passed the exact bundled face/license request after packing.
- Application Menu build `0.9.12d` was refreshed at `/home/cabewse/.local/opt/signal-loom`.
- Packaged and installed `app.asar` are byte-identical, SHA-256
  `2487b77e4baf0cc63bfb3142edcfa3cd46cd0de5e13b955775335ca6a6736bec`.
- Installed executable SHA-256 remains
  `134b72e0eb5a85ffaf2dfd85d98fd67b9d242b644297b12362ac995b178ff08f`.
- Desktop entry validation passed.

No user project bytes were rewritten by this work.
