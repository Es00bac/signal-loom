# Paper native PDF and PNG export repair

Paper's native PDF and page-image exports now choose a destination before doing any expensive page rasterization, keep progress visible outside the Inspector, and finish with the exact saved path plus an `Open PDF` or `Open folder` action.

## Root causes

The apparent no-op had three layers:

1. The renderer built every high-resolution page snapshot before invoking Electron. The native save/folder chooser therefore could not appear until after a potentially long raster pass, and canceling still paid that cost.
2. Progress and completion text lived only in the Inspector status area, so a closed Inspector made the operation look inert.
3. The shared PDF/PNG raster path generated invalid XML whenever a frame's inline `style` attribute contained a quoted font fallback such as `"Liberation Sans"`. Chromium rejected the complete flattened-page SVG with `The source image cannot be decoded`, so neither format wrote a file. Loading the SVG from a Blob URL was tested and rejected because Chromium then tainted the `foreignObject` canvas; the XML-safe `data:` path is the working transport.

## Implementation

- Added chooser-only native bridge calls for PDF files and page-image directories. The existing write handlers accept the already-approved absolute destination while retaining their legacy choose-on-write fallback.
- `exportPaperPdfDocument` and `exportPaperWebcomicImages` now stop immediately on chooser cancellation and rasterize only after a destination is available.
- Added a persistent Paper export notice with live progress, success/cancel/error state, exact destination, dismissal, and native open actions.
- Escaped every dynamic print-render style attribute for XML/HTML safety and replaced the HTML-only named nonbreaking-space entity with its XML-safe numeric form.
- Kept the flattened SVG on an origin-clean data URL so its `foreignObject` result remains exportable through canvas.

## Verification

- Focused native bridge, chooser-order, utility, and Paper status tests: 62 passed.
- Flattened-page, print HTML, typography, and export tests: 85 passed.
- Full repository suite: 617 files and 4,821 tests passed.
- TypeScript plus Vite production build passed. ESLint completed with zero errors and 85 existing warnings.
- The packaged Linux desktop app was refreshed at `~/.local/opt/signal-loom` and relaunched against the existing `/home/cabewse/.config/Sloom Studio` profile. No isolated Community profile was used for the final smoke.
- The real English Signaloom `.slppr` produced:
  - `/home/cabewse/Documents/Loom Workspace/Signaloom-Magazine-Export-Verification.pdf` — PDF 1.7, two A4 pages, 844,547 bytes.
  - `/home/cabewse/Documents/Loom Workspace/Signaloom-Magazine-Page-Images-Verification/Signaloom-Woven-From-Signals-webcomic-png/` — two valid RGBA PNG pages, each 1600×2263.
- The live UI trace showed destination selection first, page-by-page raster progress, `EXPORT COMPLETE`, the exact path, and the appropriate open action for both formats. Both PNG pages were visually inspected and contain the complete article, Flow-generated hero, typography, and Sloan Studio concept advertisement.
