# Paper KDP and Soft-Proof Profile Repair Design

## Problem

Paper ships redistribution-cleared CMYK output profiles under `public/icc/`, but the production inspector only permits importing a user file. A browser-PDF/sRGB document therefore has no visible route to attach the bundled profiles. Soft Proof opens anyway and fails with “The selected managed CMYK output profile is unavailable.” KDP Print PDF forces the strict PDF/X-1a compiler, which correctly blocks without an exact selected profile, and its successful byte-delivery path still uses a browser download instead of the desktop application's native destination dialog.

The two Signaloom magazine demos were generated as sRGB documents with no `managedIccProfiles` records even though they are the primary production-feature demonstration.

## Constraints

- Preserve the existing fail-closed rule: PDF/X and soft proof may only use the exact profile explicitly selected by the document.
- Do not map a named GRACoL, SWOP, FOGRA, or custom condition to a different ICC file.
- Managed ICC bytes remain content-addressed binary assets; never serialize them as Base64 in document JSON.
- Use only the redistribution-cleared profiles already shipped and documented by `public/icc/README.md`.
- Desktop strict-PDF export must show a native Save dialog and report the exact destination. Browser fallback may use a download.
- Existing configured application data and keys must be preserved during install and verification.

## Design

### Bundled profile installation

Extend each bundled catalog record with its exact output-condition identifier and license metadata. Add a managed-profile installer that fetches the selected bundled URL through `resolveBundledAssetUrl()`, validates the real CMYK printer profile through Little CMS, creates a content-addressed asset record, stores it in the Paper asset repository, and returns a `PaperManagedIccProfile` whose source is `bundled`.

The profile manager adds a bundled-profile selector and an explicit “Use bundled profile” action. Selecting one installs those exact bytes and reports the catalog condition to the document update callback. If that condition does not equal the current named condition, Paper switches the document to `custom` and records the bundled profile's exact condition instead of pretending it is another built-in preset.

### Resolvable Soft Proof

Soft Proof detects the absence of a selected managed profile before starting rasterization. Its dialog presents the same bundled/import setup control in place of the error-only canvas. After explicit selection, the parent updates the document, the dialog receives the new document, and the normal Little CMS preview runs.

### Strict PDF native delivery

Add a dedicated native bridge for validated PDF bytes. The Electron main process accepts only a non-empty byte payload with a PDF header, opens the existing Paper PDF Save dialog unless an automation path is enabled for test runs, writes the validated bytes, and returns the saved path and byte count. PDF/X and KDP use this bridge after preflight and structural validation; browser builds retain the anchor-download fallback. Canceled and failed saves propagate as distinct outcomes so the UI never claims a save that did not happen.

KDP uses an explicit full-page-flatten PDF/X-1a preset. Paper rasterizes each page including bleed at 300 DPI, converts that complete opaque raster through the exact selected ICC transform, and embeds DeviceCMYK page images plus the output intent. This deliberately avoids requiring font embedding rights for already-rasterized type and resolves live transparency before PDF/X-1a compilation. Standard PDF/X exports retain the native managed-font and transparency fail-closed path. Low effective source-image PPI remains a disclosed warning in the KDP report.

### Demo documents

The deterministic magazine builder reads the bundled FOGRA39 profile, packages it beside the two image assets, and gives both English and Japanese documents a `custom` output condition of `FOGRA39` with the exact selected managed-profile record. The two generated `.slppr` files remain editable browser-PDF documents until a strict command is invoked, but Soft Proof has an exact profile and KDP can freeze the same document into PDF/X-1a.

## Verification

- Red/green unit coverage for bundled profile installation and UI exposure.
- Red/green unit coverage proving strict PDF/X/KDP calls the native validated-byte saver and distinguishes cancellation.
- Electron preload/main source guards for the new bridge and PDF-byte validation.
- Magazine-builder tests proving profile metadata and ICC bytes are reachable in both archives.
- Focused tests, TypeScript, lint on touched files, production build, and the Paper production verification gate.
- Packaged-app smoke using the normal configured profile: open both real magazines, render Soft Proof, export KDP PDF through an automation destination, verify PDF magic/page count/output intent, then relaunch normally with no automation overrides.
