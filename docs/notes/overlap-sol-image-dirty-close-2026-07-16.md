# AUD-005 Image dirty-close repair — 2026-07-16

## Outcome

AUD-005 is repaired at the Image document/store boundary.

- `imageEditorStore.closeDocument` now refuses to remove a dirty editable document. The new
  `discardDocument` action is the only deliberate destructive tab-close primitive and clears both
  history stacks only after the caller has an explicit Discard decision.
- `ImageEditorTabs` presents an accessible Save / Discard / Cancel dialog for dirty tabs. Cancel
  and Escape preserve the document, active document/selection state, undo history, and redo
  history. Save and Discard buttons are disabled while a save is in flight, preventing duplicate
  dialogs and double return/close races.
- Save serializes the native editable `.slimg` workfile before closing. A canceled native chooser
  or a thrown/returned write failure leaves the tab open and dirty. Dirty Flow-linked `.slimg`
  edits overwrite their authorized layered workfile once before closing. Paper-linked close first
  saves an editable `.slimg` workfile, then applies the flattened linked return; either failure
  keeps the tab open.
- Clean linked and standalone documents close directly. Linked closes retain their established
  return-workspace navigation.
- Source Library, Flow, and Video handoffs share the flattened Source Library export helper and no
  longer clear layered dirty state. Visible downloads likewise remain exports. PSD/XCF downloads
  retain their existing layered-save semantics and still clear dirty state only after successful
  blob creation/download dispatch.
- `.slimg` and project serialization write `dirty: false` into the saved layered baseline without
  mutating the live pre-save document. The Image File > Save As path clears live dirty state only
  after the native chooser succeeds (or the existing non-native download dispatch completes).

## Destructive lifecycle coverage

Project restore and project reset now fail closed if a dirty Image document is open. Callers can
authorize replacement only after a successful project save or an explicit existing discard
confirmation. New-project actions carry that explicit authorization; project open/import paths do
not and therefore leave the current project intact with an actionable error when dirty Image work
is present. Recovery reset carries explicit replacement authorization because recovery itself is
the destructive operator action.

Application/window shutdown installs a `beforeunload` guard whenever any layered Image document is
dirty. Browser/Electron shutdown cannot safely await the asynchronous native `.slimg` chooser from
that event, so this boundary deliberately uses the platform leave/cancel confirmation instead of
inventing an unreliable Save promise.

## Red evidence

All Vitest commands used `--configLoader runner`.

1. Initial component/store boundary run:
   `npx vitest run --configLoader runner src/components/ImageEditor/ImageEditorDirtyClose.test.tsx src/store/imageEditorStore.test.ts`
   — **2 files failed; 7 tests failed, 50 passed (57 total)**. Evidence included implicit dirty
   removal, absent Discard primitive/dialog, and flattened Source Library export clearing dirty.
2. Project replacement run:
   `npx vitest run --configLoader runner src/lib/projectDocumentActions.test.ts`
   — **1 file failed; 3 tests failed, 11 passed (14 total)**. Dirty restore/reset proceeded and the
   saved project snapshot retained `dirty: true`.
3. Editable workfile baseline run:
   `npx vitest run --configLoader runner src/components/ImageEditor/ImageSlimgFormat.test.ts`
   — **1 file failed; 1 test failed, 3 passed (4 total)**. A newly saved `.slimg` reopened dirty.

The first attempted test command did not execute because this isolated worktree initially had no
`node_modules`; `npm ci` restored the lockfile-pinned dependency tree before the recorded red runs.

## Green evidence

- Focused contract plus save/project neighbors:
  `npx vitest run --configLoader runner src/components/ImageEditor/ImageEditorDirtyClose.test.tsx src/store/imageEditorStore.test.ts src/components/ImageEditor/ImageSlimgFormat.test.ts src/components/ImageEditor/ImageSlimgCodec.test.ts src/components/ImageEditor/ImageDocumentSave.test.ts src/lib/imageLinkedEdit.test.ts src/lib/projectDocumentActions.test.ts`
  — **7 files passed; 93 tests passed**.
- Neighboring project/platform/PSD/XCF/export suites:
  `npx vitest run --configLoader runner src/components/Layout/ProjectLibraryModal.test.tsx src/lib/electronMainSource.test.ts src/components/ImageEditor/ImageDocumentExport.test.ts src/components/ImageEditor/ImagePsdInterop.test.ts src/lib/electronMenu.test.ts src/lib/projectValidation.test.ts src/components/ImageEditor/ImageXcfInterop.test.ts src/lib/appRecovery.test.ts`
  — **8 files passed; 119 tests passed**.
- `npx tsc -p tsconfig.app.json --noEmit --incremental false` — passed.
- `npx tsc -p tsconfig.node.json --noEmit --incremental false` — passed.
- Changed-file ESLint — passed with **0 errors and 0 warnings**.
- `git diff --check` — passed.
- `npm run build` — passed. Vite emitted only the repository's existing module-externalization,
  runtime URL, and large-chunk warnings.

## Residual boundaries

- `beforeunload` provides the platform's Leave/Cancel guard, not the tab dialog's asynchronous Save
  option. Project replacement is stricter: it fails closed until the dirty Image work is handled.
- On browser/Capacitor builds without the Electron bridge, the existing `.slimg` download handoff
  has no synchronous OS acknowledgment comparable to Electron's `{ canceled, path }` result. A
  synchronous dispatch failure keeps the tab open, but a later platform storage failure cannot be
  observed by the close transaction. Electron's native chooser/write path is fully covered.
- Standalone `.slimg` save locations are not retained on `ImageDocument`, so a later Close > Save
  uses Save As again. Flow-linked `.slimg` documents do retain and overwrite their authorized path.

