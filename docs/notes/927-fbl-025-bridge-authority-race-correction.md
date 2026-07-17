# 927 — FBL-025 bridge-authority race correction

## Scope

This follow-up addresses the independent Sol final-gate Medium finding against the dedicated
bundled-font transport correction. It changes only the catalog authority boundary and the shared
browser's bridge-owned state; desktop, Settings, Image, Video, Paper, online-font, and user-font
paths retain their established routing.

## Correction

- The catalog loader captures the native bridge, awaits that bridge's dedicated capability status,
  then verifies the captured object is still the current bridge before issuing the protocol fetch.
- It verifies the same object again after response JSON has parsed and before returning the parsed
  catalog, rejecting an old in-flight result rather than caching or returning it.
- `BundledFontBrowser` records loaded catalog and error state with the bridge identity. A render
  against another bridge hides those values synchronously, and async state publication requires the
  same bridge to remain current. A positive replacement bridge therefore performs its own status
  check and authorized catalog request.

## Permanent regression coverage

- Delayed A-positive followed by B-negative makes no catalog fetch and rejects A's result.
- A catalog fetch authorized by A but replaced before JSON parsing/publication rejects rather than
  returning a stale catalog.
- A settled A browser catalog is discarded on positive B; B must query its own capability and
  catalog before rendering data.
- A late A catalog completion cannot overwrite B's rendered catalog.

## Verification

- `npx vitest run --configLoader runner src/lib/bundledFontLibrary.test.ts src/components/Common/BundledFontBrowser.test.tsx` — 2 files, 28 tests passed.
- `npx vitest run --configLoader runner src/components/Common/BundledFontBrowser.test.tsx src/components/ImageEditor/ImageTextLayer.test.ts src/features/paper/workspace/PaperWorkspace.richTextShortcuts.test.ts src/features/video/workspace/useManagedFontRegistrationGate.test.tsx src/lib/bundledFontLibrary.test.ts src/lib/electronBundledFontLibrary.test.ts src/lib/electronMainSource.test.ts src/lib/managedBundledFontPersistence.test.ts src/lib/paperFontResolution.test.ts src/lib/stageFrameExport.test.ts src/lib/videoRenderCache.test.ts src/lib/videoRenderSegments.test.ts src/components/Settings/FontLibrarySection.test.tsx src/components/Settings/SettingsModal.test.tsx src/components/ImageEditor/ImageEditorTextLayerControls.test.tsx src/features/video/workspace/VideoWorkspace.paperStoryboardFonts.test.ts` — 16 files, 171 tests passed.
- `npx tsc -b --force --pretty false` — passed.
- Touched-file ESLint and `git diff --check` — passed.

The full repository test sweep was not run, per the bounded verification requirement.

## Residual risk

The renderer cannot receive an event when arbitrary code replaces `window.signalLoomNative`; this
correction observes identity at render and at each async authority/publication boundary. A bridge
that is replaced must therefore be followed by a React render or another catalog operation before
its UI changes, but no stale catalog can be fetched or published through the guarded async paths.
Fresh independent final review remains required.
