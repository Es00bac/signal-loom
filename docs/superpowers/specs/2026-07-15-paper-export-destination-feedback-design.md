# Paper export destination and feedback design

Date: 2026-07-15

## Problem

Native Paper PDF and page-image exports currently rasterize every page before invoking Electron's destination chooser. Progress and completion text are written only to the Inspector status line. A high-resolution document therefore appears inert after export is confirmed, and the user cannot tell whether anything is running, where it will be saved, or whether it failed. No file is written until the late chooser completes.

## Required behavior

- In the configured desktop application, PDF export opens a native Save As chooser before page rasterization.
- Page-image export opens a native directory chooser before page rasterization.
- Canceling either chooser stops before raster work and reports a visible canceled state.
- After destination selection, Paper shows an always-visible progress notice independent of the Inspector.
- Success keeps the exact file or directory path visible and offers an action to open that target.
- Failure remains visible with the actual error text.
- Existing automation paths and older native bridge callers remain supported.
- Browser-only ZIP/print fallbacks remain unchanged.
- License keys, API credentials, and persisted application configuration are neither migrated nor modified.

## Architecture

Electron gains two chooser-only IPC methods. The renderer calls them with lightweight export metadata, then rasterizes only after a destination is approved. The existing write IPC methods accept the already approved absolute destination and retain their legacy choose-on-write fallback for automation and older callers.

Paper export utilities return a small outcome object in addition to reporting progress. `PaperWorkspace` uses one export-notice state for both PDF and page images. The notice classifies progress, success, cancellation, and failure; successful file exports can open the PDF and successful directory exports can open the folder through the existing native `openPath` bridge.

## Tests

- Unit tests prove chooser invocation precedes canvas creation/rasterization for PDF and page images.
- Cancellation tests prove zero raster work and zero write calls.
- Native source-guard tests prove preload and main expose both chooser IPC methods and preserve legacy fallback behavior.
- Workspace render tests prove export status is visible outside the Inspector with an accessible live region and target action.
- A configured-profile native smoke exports the real Signaloom spread to chosen automation paths and validates PDF/PNG bytes without reading or displaying secrets.

## Self-review

The design contains no placeholders. It addresses the common PDF/PNG root cause, keeps browser and automation compatibility explicit, and does not broaden into unrelated print-production or credential work.
