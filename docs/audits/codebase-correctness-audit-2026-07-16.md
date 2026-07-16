# Codebase Correctness Audit — 2026-07-16

> **Post-audit delta:** Recovery and independent verification of an interrupted Fable 5 audit found additional issues and several useful corroborations. See [Fable 5 Partial Audit Recovery and Comparison](fable-partial-audit-comparison-2026-07-16.md). The 44 findings below remain frozen as the original snapshot. In particular, the later comparison supersedes the clean-area statement about bundled-font packaging for clean CI release runners.

## Executive result

This audit found **44 evidence-backed correctness risks** in the current working tree:

- **5 Critical** — credible project corruption/data loss, unintended repeated paid jobs, or a core portability contract that cannot be met.
- **21 High** — a shipped feature is unreachable, returns stale or incomplete results, cannot round-trip its own format, or fails a primary edit/export/sync path.
- **17 Medium** — platform-scoped failures, misleading success states, persistence gaps, resource leaks, or reliability defects with a narrower trigger.
- **1 Low** — a deterministic localization refresh defect.

The repository is not generally broken: the TypeScript/Vite production build succeeds and all **4,871 tests in 624 files pass**. The important conclusion is that the existing suite is strongest at isolated helpers, schemas, and structural contracts, but weak at lifecycle boundaries: asynchronous work crossing workspace switches, multiple Electron renderer windows sharing one project path, submit/poll/cancel provider state, mutable canvas history, clean-profile portability, and pixel-level export parity.

This is a snapshot of the **current, already-dirty working tree** on 2026-07-16. The audit did not modify production code or attempt to overwrite any existing user changes.

## Method and confidence rules

The review followed the repository handoff/task/notes protocol and covered:

- Flow node reachability, typed inputs, execution planning, retries, cancellation, providers, backend proxying, workspace switching, result reuse, usage, and Source Library persistence.
- Image document lifecycle, tabs, undo/redo, named snapshots, selections, font selection, history limits, and project persistence.
- Video timeline duration, motion-comic assets, browser/native export paths, reusable assets, font selection, and FFmpeg lifecycle.
- Paper tabs, managed images/fonts/ICC profiles, `.slppr`, `.sloom`, JSON import/export, cross-device sync, soft proof, PDF/PDF-X/KDP flattening, and print packaging.
- Electron multi-window state, project open/save, startup recovery, settings/license hydration, launcher behavior, local upscaling, and user-visible error handling.

A finding is included only when the review established a concrete call path and failure mode. “Certain” means the path is direct and deterministic from the code or was reproduced with an in-memory probe. “High” means the failure depends on timing/platform behavior but every required condition is present. Planning-only features and explicitly disclosed unsupported behavior were not reported as defects.

## Critical findings

### AUD-001 — Independent Electron renderers can overwrite a project with stale state

**Severity / confidence:** Critical / Certain

**Contract:** Multiple workspace windows should represent one authoritative project, and Save must never serialize unrelated or stale state into the current project path.

**Evidence:**

- Opening another workspace creates another renderer instance: `src/App.tsx:1201-1206`; window creation is in `electron/main.mjs:947-983`.
- Open restores Zustand stores only in the renderer that initiated it: `src/App.tsx:1233-1249`.
- The Electron main process holds one global `currentProjectPath`, then broadcasts only that path: `electron/main.mjs:549-554`, `electron/main.mjs:1308-1320`.
- Other renderers merely update their displayed path: `src/App.tsx:1930-1935`.
- Save serializes every workspace from the focused renderer's local stores: `src/App.tsx:1259-1275`, `src/lib/projectDocumentActions.ts:20-48`.
- Electron writes that payload to the one global path: `electron/main.mjs:2592-2604`.
- Settings have the same architecture: every renderer persists a full snapshot under the same key (`src/store/settingsStore.ts:67,359-565`) with no native cross-window merge.

**Failure:** Open project A in Flow and Paper windows, then open project B from one window. The other window keeps A's stores but receives B's path. Saving there writes A-derived state into B. Even without changing projects, edits made in one renderer can be overwritten by another renderer's stale copy. A stale settings write can likewise undo a key, license, locale, or shortcut changed in another window.

**Verification recipe:** Open A, create Flow and Paper windows, open B from Paper, focus Flow, press Save, then reopen B and compare all workspace state. Repeat with different settings changes in each window.

**Repair / regression test:** Put the authoritative project and settings snapshot in the main process (or implement versioned, field-aware synchronization), associate every save with a project identity/version, reject stale writers, and add a real two-window open/edit/save/switch test.

### AUD-002 — A Flow run can finish into the wrong workspace

**Severity / confidence:** Critical / Certain

**Contract:** An asynchronous run belongs to the workspace and node revision that started it.

**Evidence:**

- Workspace switching snapshots and replaces the one global Flow store: `src/App.tsx:768-790`.
- Run completion looks up and patches whichever nodes are in `get()` after the await: `src/store/flowStore.ts:3212-3224,3313-3326`.
- Usage attribution also resolves the active workspace at completion: `src/store/flowStore.ts:207-220,3228-3234`.
- Duplicating a workspace preserves node IDs: `src/store/flowWorkspaceStore.ts:102-123`.

**Failure:** Start a slow generation in workspace A and switch to B. If B has no matching node, A's result is lost instead of being committed to A's stored snapshot. If B is a duplicate, the completion can overwrite B's same-ID node and attribute usage to B.

**Verification recipe:** Duplicate a Flow workspace, start a delayed fake-provider run in the original, switch to the duplicate before resolving the response, and inspect both workspace snapshots and the usage ledger.

**Repair / regression test:** Give every run an immutable `{workspaceId, nodeId, inputRevision, runId}` owner and commit through the workspace store rather than the currently hydrated canvas. Add completion-after-switch, same-ID duplicate, cancellation, and usage-attribution tests.

### AUD-003 — Generic retry can resubmit paid jobs and wait more than eight hours on permanent errors

**Severity / confidence:** Critical / Certain

**Contract:** Retry only transient, idempotent operations; a polling failure must resume the existing job, and validation/auth failures must fail immediately.

**Evidence:**

- One exponential-backoff wrapper surrounds the complete provider operation: `src/lib/flowExecution.ts:268-312`.
- Atlas submission and polling are inside that same operation: `src/lib/flowExecution.ts:1413-1437,1523-1563`; the same shape exists for BFL at `1790-1810,2030-2059` and Gemini video at `2718-2728,3860-3917`.
- Defaults permit ten retries: `src/lib/providerCatalog.ts:102-103`.
- Backoff retries ordinary `Error` values and doubles the 30-second base: `src/lib/exponentialBackoff.ts:39-78`. Ten waits total **30,690 seconds (8h31m30s)**.
- Several permanent validation/configuration failures are still plain errors, and `extractErrorBody` can discard an HTTP 4xx status when the provider supplies a JSON message: `src/lib/flowExecution.ts:4187-4197`.

**Failure:** If submission succeeds and a later poll returns a transient 503, the retry repeats submission and can create up to eleven paid jobs. Conversely, a missing prompt or JSON-bodied 400 can enter hours of backoff before the user sees the final error.

**Verification recipe:** Use a fake provider that returns a job ID, then one poll 503, then success. Assert the create endpoint is called once. Separately run a no-prompt node with fake timers and inspect retry state.

**Repair / regression test:** Model submit, poll, and materialize as separate persisted states. Retry polling by prediction ID, require idempotency keys for retried submissions, classify by HTTP status/error code instead of message text, cap total elapsed time, and test every provider's create-count under poll/download faults.

### AUD-004 — Portable `.sloom` and “Package for print” omit Paper's required bytes

**Severity / confidence:** Critical / Certain

**Contract:** A portable `.sloom` is documented as self-contained, and Package is described as consolidating all layout assets for print.

**Evidence:**

- The user guide promises the whole project and a self-contained portable export: `docs/userguide/03-projects-and-files.md:3-10,31-33,58-60`.
- Project building embeds Source Library data but stores only Paper's reference snapshot: `src/lib/projectDocumentActions.ts:20-48`.
- Paper snapshots contain `assetIds`, not asset records: `src/types/paper.ts:589-606`, `src/store/paperStore.ts:910-924`.
- Managed images, fonts, license texts, and profiles live separately in renderer IndexedDB: `src/features/paper/assets/PaperAssetRuntime.ts:10-13`, `src/features/paper/assets/PaperIndexedDbAssetRepository.ts:61-85`.
- Electron writes plain project JSON: `electron/main.mjs:1266-1271`; missing records later fail materialization/export at `src/features/paper/assets/PaperAssetRuntime.ts:53-65`.
- Package says “Consolidate all layout assets for print”: `src/lib/i18n.ts:123`, but the ZIP contains JSON inventories only: `src/lib/paperPackageExport.ts:38-64,91-108`. Runtime data/blob URLs are explicitly removed at `src/lib/paperPackageExport.ts:124-131`.

**Failure:** A portable project works only while the original profile's IndexedDB still contains the records. On another profile/machine, artwork can disappear, fonts can fall back, and ICC-dependent export can fail. The print package handed to a printer contains link metadata but not the linked art/fonts/profiles needed to reproduce the document.

**Verification recipe:** Import a managed image, exact font, license text, and ICC profile; export both portable `.sloom` and Package; open in a clean profile and inspect the ZIP entries.

**Repair / regression test:** Add a validated content-addressed asset section/container to portable projects and print packages, enforce license policy per face, import records before restoring Paper, and run a clean-profile round-trip that renders and exports without the source IndexedDB. `.slppr` v2 already provides a sound model and is not affected by this finding.

### AUD-005 — Closing a dirty Image tab discards the document without confirmation

**Severity / confidence:** Critical / Certain

**Contract:** Closing unsaved editable work must prompt, save, or offer recovery.

**Evidence:**

- The tab displays a dirty dot but calls `closeDocument` unconditionally: `src/components/ImageEditor/ImageEditorTabs.tsx:107-140`.
- `closeDocument` immediately removes the document and both history stacks: `src/store/imageEditorStore.ts:330-345`.
- The visible/flattened Source Library export marks the editable document clean: `src/components/ImageEditor/ImageEditorAssetBar.tsx:100-128`, although layered PSD/XCF saving is a distinct format path at `src/components/ImageEditor/ImageDocumentSave.ts:286-307`.

**Failure:** Clicking a dirty tab's X permanently drops the layered document and history. A flattened export can also remove the warning even though it did not save the editable layer state, increasing the chance of a silent destructive close.

**Verification recipe:** Edit a layered document, observe the dirty indicator, click X, and inspect open documents/history. Repeat after a flattened PNG/Source Library export.

**Repair / regression test:** Track editable-document save state separately from flattened exports, require Save/Discard/Cancel on dirty close, and add tab-level tests for every close path including linked edits and application shutdown.

## High findings

### AUD-006 — API Requester has an executor but cannot run in the application

**Severity / confidence:** High / Certain

- `ApiFetchNode` gives `BaseNode` no `onRun`/`isRunning`: `src/components/Nodes/ApiFetchNode.tsx:47-57`.
- `canRunNode` excludes `apiFetchNode`: `src/store/flowStore.ts:344-362`; dependency discovery and recursive execution therefore skip it at `804-855,2938-2943`.
- The executor exists at `src/lib/flowExecution.ts:306-307`, but only direct helper tests reach it.

**Failure / repro:** Add a valid URL. There is no Run button, and connecting the node to Run Me or downstream logic never sends a request.

**Repair / test:** Make it runnable, wire progress/cancel, and test through the rendered node and graph executor. `src/lib/flowExecutionApiFetch.test.ts:23-63` currently bypasses the broken reachability path.

### AUD-007 — Collapsed reusable functions return frozen provider results

**Severity / confidence:** High / Certain

- Collapse promises a reusable function: `src/features/flow/workspace/FlowWorkspaceShell.tsx:309-313`.
- Function execution only evaluates synchronous signals: `src/lib/functionNodes.ts:840-862,897-944`.
- Generator signals read stored `node.data.result`: `src/lib/flowSignals.ts:207-227`; execution reports zero provider spend at `src/lib/flowExecution.ts:342-365`.

**Failure / repro:** Collapse Prompt → Image, change the function input, and run. No provider call occurs; the old result (or nothing) is returned.

**Repair / test:** Execute an isolated internal subgraph with proper run ownership, provider accounting, cancellation, and input/output bindings. Existing tests prepopulate internal result fields (`src/lib/functionNodes.test.ts:79-86`) and mask the defect.

### AUD-008 — Cancel does not abort most provider work

**Severity / confidence:** High / Certain

- `executeNodeRequest` receives a signal but does not pass it into text/image/video/audio/vision/API provider functions: `src/lib/flowExecution.ts:243-312`.
- Atlas fetch/poll/sleep (`1413-1420,1533-1560,4322-4325`), BFL polling (`2030-2059`), and Gemini polling (`3860-3917`) are unabortable.
- Cancel only aborts the store controller: `src/store/flowStore.ts:2641-2652`.

**Failure / repro:** Cancel a long Atlas/Gemini job. Provider-side work and polling continue until completion/timeout; the UI may only discard the eventual result.

**Repair / test:** Propagate one signal through every fetch, sleep, upload, poll, and download; call provider cancel endpoints where available; add fake long-poll cancellation tests. Backend proxy fetch is a working exception.

### AUD-009 — Run Me reuses stale upstream outputs after inputs change

**Severity / confidence:** High / Certain

- Any truthy media/composition/function output is considered reusable: `src/store/flowStore.ts:336-342`.
- The recursive executor returns before checking dependencies: `src/store/flowStore.ts:2911-2913`.
- Configuration edits do not invalidate result provenance: `src/store/flowStore.ts:2568-2584`.
- The node promises to execute the entire upstream chain: `src/components/Nodes/RunMeNode.tsx:28-34`.

**Failure / repro:** Run Prompt P1 → Image once, edit to P2, then click Run Me. P1's image is silently reused.

**Repair / test:** Store a normalized input/dependency hash with every output and reuse only on an exact match; add dirty-propagation tests across direct, routed, list/envelope, and function inputs.

### AUD-010 — Resume/cache hashes include their own previous outputs

**Severity / confidence:** High / Certain

- Hashing uses complete node data: `src/lib/flowExecution.ts:334-339`.
- Cache lookup is at `src/store/flowStore.ts:3078-3090,3180-3209`.
- Result/history/usage/selection fields are written back into node data: `src/store/flowStore.ts:3276-3286,3313-3326`.

**Failure / repro:** Run a node twice without changing authored inputs. The second hash includes the first output/history; every completion changes it again, so the previous envelope fails to match and the provider is called again.

**Repair / test:** Hash only a versioned allowlist of authored parameters and resolved upstream content identities. Add a run-twice test asserting the second execution resumes without a provider request.

### AUD-011 — Text/JSON reference descriptions lose their numbered image association

**Severity / confidence:** High / Certain

- Reference handles correctly accept image, text, and JSON: `src/lib/flowNodeContracts.ts:141-145,560-569,588-592`.
- Runtime reduces images to a flat URL list: `src/store/flowStore.ts:1208-1216`.
- Text from all handles is globally concatenated without slot labels: `src/lib/flowSignals.ts:274-304`; the execution context is also flat at `src/lib/flowExecution.ts:148-166`.

**Failure / repro:** Put shirt art + “preserve logo” on Reference 1 and a face + “preserve identity” on Reference 2. The provider sees two images and an unassociated prompt, so it cannot know which description belongs to which image.

**Repair / test:** Carry structured `{slot, images, descriptions, json}` reference groups to provider adapters, then test two slots with distinct descriptors. Text is not rejected or wholly lost; the defect is the discarded slot association.

### AUD-012 — Backend proxy requests disclose nested credentials

**Severity / confidence:** High / Certain

- `src/lib/backendProxy.ts:34-48` omits top-level `apiKeys` but sends the complete `providerSettings` object.
- That object includes `vertexServiceAccountJson`, local native render tokens, generic/local authorization headers, and Android tokens/PINs: `src/types/flow.ts:789-824`.

**Failure / repro:** Configure one of those values, enable a remote backend proxy, and inspect the request JSON; the supposedly excluded secret is nested under `providerSettings`.

**Repair / test:** Build a dedicated, allowlisted proxy DTO containing only execution-safe values; assert every credential-like field is absent with recursive redaction tests.

### AUD-013 — Backend proxy responses discard valid outputs and metadata

**Severity / confidence:** High / Certain

- A full result can include MIME type, extension, filename, metadata, Blob, and additional results: `src/lib/flowExecution.ts:205-218`.
- Proxy reconstruction retains only primary result/type/status/usage: `src/lib/flowExecution.ts:477-525`.
- The store relies on `additionalResults` and metadata: `src/store/flowStore.ts:3236-3266,3313-3325`.

**Failure / repro:** Proxy a sequential multi-image job. Only the first image survives; supplementary outputs and file metadata disappear.

**Repair / test:** Version a serializable result-envelope schema, transfer all fields (or explicit binary asset references), and add direct-vs-proxy parity tests for single, multi-output, file, and Blob results.

### AUD-014 — BytePlus API keys never survive persistence

**Severity / confidence:** High / Certain

- `ApiKeys` and Settings expose BytePlus: `src/types/flow.ts:778-787`, `src/components/Settings/SettingsModal.tsx:354-358`.
- The provider-copy list omits it: `src/store/settingsStore.ts:59-60`.
- Sanitization initializes `byteplus` empty but never copies the supplied value: `src/store/settingsStore.ts:113-131`.
- Hydration and backup import use that sanitizer: `src/store/settingsStore.ts:566-568,674-682`.

**Failure / repro:** Save a BytePlus key, relaunch, or export/import settings. It returns empty and the provider is unconfigured.

**Repair / test:** Derive credential keys from the `ApiKeys` schema or a single provider registry instead of parallel lists; add a non-empty round-trip test for every credential field.

### AUD-015 — Commercial-license validation can race settings hydration

**Severity / confidence:** High / High

- Encrypted settings storage hydrates asynchronously: `src/store/settingsStore.ts:318-349,565`.
- Merge resets `licensed` to false pending validation: `src/store/settingsStore.ts:658-661`.
- Startup validation runs once behind `decidedRef`, without waiting for hydration: `src/components/Layout/CommunityStartupNotice.tsx:43-63`.
- Revalidation exits when the currently visible key is empty: `src/store/settingsStore.ts:554-560`; later hydration does not retrigger it (`src/components/Layout/CommunityStartupNotice.tsx:73-78`).

**Failure / repro:** Delay decrypt/IndexedDB hydration. Startup validates the initial empty key, marks the decision complete, then hydrates the real key while leaving commercial gates locked for the session.

**Repair / test:** Expose an explicit hydration state, validate after it completes, and rerun when the persisted license identity changes. Add delayed-hydration and failed-decrypt startup tests.

### AUD-016 — Project save/import/export failures can be silent

**Severity / confidence:** High / Certain

- Project Save/Save As have no catch: `src/App.tsx:1259-1297`; media import, scratch-folder selection, project export, and asset export are also uncaught at `1398-1454`.
- Menu/keyboard dispatch intentionally drops the promises: `src/App.tsx:1776-1783,1930-1932`.
- Main save can reject on mkdir, backup, materialization, write, or remembered-path update: `electron/main.mjs:1266-1280`.
- Image/Paper save commands nearby do catch and display errors: `src/App.tsx:1322-1347,1375-1395`.

**Failure / repro:** Save to an unwritable destination, fill the disk, or remove a source during materialization. The command becomes an unhandled rejection with no reliable user-facing failure, so the user may close assuming it saved.

**Repair / test:** Wrap every user command in a common operation/result boundary with progress, final status, and actionable error dialogs; inject bridge rejections in command-level tests.

### AUD-017 — Paper's JSON export cannot round-trip through its own import picker

**Severity / confidence:** High / Certain

- Export emits `.sloom-paper.json`: `src/features/paper/workspace/PaperWorkspace.tsx:1531-1533`.
- Import accepts that extension and can replace the active document: `src/features/paper/workspace/PaperWorkspace.tsx:2250-2283,3966-3975`.
- Format inference recognizes `.sloom-idml.json` but not `.sloom-paper.json`, so it falls through to TXT: `src/lib/paperDocumentFormats.ts:926-938`.
- The default parser turns the JSON source into text blocks: `src/lib/paperDocumentFormats.ts:171-193`.

**Failure / repro:** Export Paper JSON and immediately import it. The serialized JSON becomes visible page text and may replace the original layout.

**Repair / test:** Route the extension/content signature to `deserializePaperDocument`, validate before replacement, and add export→import structural/pixel parity tests.

### AUD-018 — Placed PDF frames break raster exports and soft proof

**Severity / confidence:** High / Certain

- PDF placement stores an `application/pdf` data URL in a document frame: `src/features/paper/workspace/PaperWorkspace.tsx:2253-2268`.
- Live/print HTML uses `<object>`: `src/lib/paperDocument.ts:1569-1574`.
- Page flattening sends every asset through `new Image()` and treats decode failure as fatal: `src/lib/paperPageFlattenExport.ts:159-215`.
- Soft proof and browser PDF-X depend on that flattening: `src/lib/paperSoftProofBrowser.ts:54-64`, `src/lib/paperPdfxBrowser.ts:47-67`.
- Preflight reports the linked document but does not block an unsupported flatten path: `src/lib/paperPreflight.ts:266-282`.

**Failure / repro:** Place a PDF, then export PNG/CBZ/KDP full-page output or run Soft Proof. `HTMLImageElement` cannot decode the PDF data URL, so output fails.

**Repair / test:** Rasterize PDF pages through a PDF renderer at target resolution, preserve vector placement in compatible PDF output, or fail preflight before export with an actionable message.

### AUD-019 — Paper sync is single-document metadata-only despite managed assets and tabs

**Severity / confidence:** High / Certain for bytes; High for tab corruption

- Paper snapshots include reachable `assetIds` and claim bytes travel on an asset channel: `src/lib/paperDocumentNativeSync.ts:178-185`.
- The reducer ignores those IDs: `src/lib/paperDocumentNativeSync.ts:50-57`; `paperSyncChannel` neither imports nor calls `projectSyncAssets`: `src/lib/paperSyncChannel.ts:1-10,57-79`.
- Actual byte transfer is used only by Image sync: `src/lib/imageSyncChannel.ts:6,200-270`.
- Paper state now contains a document catalog and active ID, but sync publishes only the active bare document: `src/types/paper.ts:589-606`, `src/lib/paperSyncChannel.ts:57-78`.
- Remote apply changes only `state.document`, not `documents`/`activeDocumentId`: `src/store/paperStore.ts:937-944`.

**Failure / repro:** A peer receives refs without image/font/profile records. With two tabs, switching documents sends unrelated full snapshots that can replace the peer's active body while its tab IDs/catalog remain stale.

**Repair / test:** Synchronize a versioned Paper workspace envelope containing document IDs/tab state; upload/fetch verified managed records by hash before applying a document; test two tabs with custom art/fonts/ICC on a clean receiver.

### AUD-020 — “Flattened PDF” is hybrid, can double-paint shapes, and can substitute fonts

**Severity / confidence:** High / Certain for duplicate drawing, High for font fallback

- The UI calls this a high-quality flattened PDF: `src/lib/i18n.ts:118`.
- Backdrop generation uses `backdropOnly: true`: `src/components/Paper/PaperWorkspaceUtils.ts:1165-1193`, but shape frames remain in that backdrop: `src/lib/paperPageFlattenExport.ts:377-383`.
- PDF HTML overlays every frame again: `src/lib/paperPdfExport.ts:198-216,334-339`; CSS suppresses image/panel imagery but not shapes at `283-330`.
- Imported fonts are registered in the live document only: `src/features/paper/workspace/PaperWorkspace.tsx:694-696`; export HTML supplies no equivalent managed `@font-face` source and opens in a separate window: `electron/main.mjs:1807-1828`, `electron/paper-pdf-export.cjs:36-83`.

**Failure / repro:** A 50%-opacity shape is rasterized, then drawn again, changing its appearance. An exact imported font may fall back/reflow in the isolated export window.

**Repair / test:** Choose one honest model: fully rasterize all page content once, or render each frame once with embedded exact fonts. Add page-pixel comparison and PDF font inspection; the current test checks text presence, not parity (`src/lib/paperPdfExport.test.ts:51-82`).

### AUD-021 — Layer-operation undo holds live canvases and can resurrect later paint

**Severity / confidence:** High / Certain; reproduced in memory

- Layer insertion records `before`/`after` arrays by reference: `src/components/ImageEditor/imageLayerInsert.ts:20-29`.
- Brush painting mutates layer canvases in place: `src/components/ImageEditor/tools/brushTool.ts:275-290,309-324`.
- Layer-op undo restores the recorded live objects without cloning: `src/components/ImageEditor/undoRedoApply.ts:54-65`.

**Failure / repro:** Add a layer, paint an existing layer, undo paint, then undo the layer addition. The supposedly older layer snapshot contains the later mutation and the stroke reappears.

**Repair / test:** Store immutable bitmap snapshots/content versions (or copy-on-write pixel stores) for every history operation, dispose them with history eviction, and add cross-operation chronology tests. Current undo tests do not mutate a captured bitmap later.

### AUD-022 — Named Image snapshots do not freeze pixels and lose pixels on project save

**Severity / confidence:** High / Certain; reproduced in memory

- Snapshot creation assigns `layers: doc.layers`: `src/components/ImageEditor/ImageSnapshots.ts:91-106`.
- Restore reuses those objects: `src/components/ImageEditor/ImageSnapshots.ts:120-159`.
- Project save deliberately strips bitmap/mask data from named snapshots: `src/store/imageEditorStore.ts:1072-1085,1359-1363`.

**Failure / repro:** Create a snapshot, paint the same layer, restore the snapshot; the new stroke remains because both point at one canvas. After save/reopen, restore can change metadata only and substitutes current pixels.

**Repair / test:** Persist immutable pixel snapshot records or explicitly rename/reframe the feature as metadata-only. Test mutation-after-snapshot and project round-trip. `src/components/ImageEditor/ImageSnapshots.test.ts:47-54` currently permits the shallow alias.

### AUD-023 — Image project state can say a selection exists when no mask exists

**Severity / confidence:** High / Certain; reproduced in memory

- The actual mask lives only in module-level registries: `src/components/ImageEditor/selectionRegistry.ts:3-19`.
- Project validation persists `hasSelection`: `src/lib/projectValidation.ts:513-547`.
- Restore neither reconstructs nor clears registry masks: `src/store/imageEditorStore.ts:1052-1106`.
- Closing a document does not clear registry entries: `src/store/imageEditorStore.ts:330-345`; UI actions trust `hasSelection`, e.g. `src/components/ImageEditor/ImageEditorLayersPanel.tsx:903-909`.

**Failure / repro:** Save with an active selection and reopen: UI state says selected, but no mask exists. Closed documents retain large masks, and a reused ID can see stale selection data.

**Repair / test:** Serialize the mask or clear `hasSelection` on restore; make registry lifecycle follow document open/close; test save/restart, close, and reused IDs.

### AUD-024 — Motion-comic clips resolve from authored four seconds to zero duration

**Severity / confidence:** High / Certain; reproduced with the timeline resolver

- Comics are authored with four seconds: `src/lib/manualEditorState.ts:237-252`, `src/features/video/workspace/VideoWorkspace.tsx:1751-1779`.
- Timeline duration treats image/text/shape as stills but omits comic: `src/lib/manualEditorTimeline.ts:62-80`.
- Stage visibility uses the zero range: `src/components/Editor/ManualEditorWorkspaceUtils.tsx:383-403`.
- The inspector omits comic from its still-duration control: `src/features/video/workspace/VideoWorkspace.tsx:9308-9345`.

**Failure / repro:** Add Speech, Thought, or Caption. It draws a minimum-width block but appears only at its exact start, contributes nothing to sequence length, and has no useful duration control.

**Repair / test:** Include comic in still-duration resolution and inspector editing; test timeline end, visibility across the interval, trim, split, and export.

### AUD-025 — Browser/legacy comic export emits the comic for only one frame

**Severity / confidence:** High / Certain, platform-scoped

- Legacy composition renders a comic to one PNG: `src/lib/mediaComposition.ts:786-792`.
- Still-input arguments loop image/text/shape but omit comic: `src/lib/mediaComposition.ts:878-893`.
- Overlay uses `eof_action=pass`: `src/lib/mediaComposition.ts:1872-1877`.
- Export duration still assigns four seconds: `src/lib/mediaComposition.ts:831-847`.

**Failure / repro:** Force the browser/legacy or image-sequence export path and export a four-second comic. Only the first encoded frame contains it; tail animation keyframes are absent.

**Scope / repair:** Native frame-server export samples comics correctly (`src/lib/stageFrameExport.ts:607-619`). Loop static comics or render per-frame animation in fallback paths and add comic alongside the existing image/text/shape tests.

### AUD-026 — Exact bundled font-face selection is discarded in Image and Video

**Severity / confidence:** High / Certain

- The shared browser returns exact family, weight, and style: `src/components/Common/BundledFontBrowser.tsx:25-33,160-172`.
- Image applies only `family.family`: `src/components/ImageEditor/ImageEditorTextLayerControls.tsx:25-53,319-327`.
- Video's stage text, clip, and text-tool consumers also apply only the family: `src/features/video/workspace/VideoWorkspace.tsx:8720-8724,9870-9875,11215-11219`.

**Failure / repro:** Select a bundled 700 Italic face. Family changes, but weight/style remain old or 400, so preview/export may synthesize or fall back instead of using the selected face.

**Repair / test:** Apply the exact face tuple atomically and verify computed typography plus rendered/exported font identity in Image and Video integration tests.

## Medium findings

| ID | Area | Evidence-backed failure | Primary evidence | Repair / missing test |
|---|---|---|---|---|
| **AUD-027** | Flow tabs | A rapid B→C switch while B is restoring can leave the selector on C and canvas on B; the in-flight guard drops C and does not drain it. | `src/App.tsx:768-794`; `src/store/flowWorkspaceStore.ts:176-198` | Queue/coalesce the newest requested workspace and test delayed asset hydration with three rapid selections. |
| **AUD-028** | Usage | Successful HF text/image/video/audio, BytePlus image, and Atlas video executions can return no `usage`; the ledger drops them entirely instead of recording an unknown-rate actual run. | `src/lib/projectUsageRecording.ts:22-41`; `src/lib/flowExecution.ts:869-896,1095-1165,2742-2763,2828-2834,3460-3481`; `src/lib/helpContent.ts:109-115` | Always emit an actual execution record, even when cost/tokens are unknown; test every provider route. |
| **AUD-029** | Media chaining | A raw provider CDN URL may display but fail as a downstream reference because renderer fetch has no native fallback/`response.ok` check; expired HTML error bodies can be base64-encoded as media. | `src/lib/flowExecution.ts:1673-1705,4076-4144`; compare the correct check at `2403-2410` | Centralize materialization with CORS/native fallback, status/MIME validation, and expired-URL tests. |
| **AUD-030** | Provider scheduling | The rate limiter holds its queue lock through minutes of polling, and Atlas/BytePlus/local/function routes share `default`; one long job blocks unrelated work. | `src/lib/flowExecution.ts:268-312`; `src/lib/providerRateLimiter.ts:10-47` | Rate-limit request starts, not entire lifetimes; give providers/routes separate policies and concurrency tests. |
| **AUD-031** | Source Library | Broad durable-persistence failures silently fall back; later sanitization can remove non-text fallback items, so an asset that appeared saved may vanish. | `src/store/sourceBinStore.ts:2344-2368,2048-2062` | Surface degraded durability, retain recoverable bytes, and test quota/IndexedDB/native failures through restart. |
| **AUD-032** | Run Me UX | The trigger promises chain execution but never owns `isRunning` or a controller, so it offers no direct progress/cancel; users must find the active upstream node. | `src/components/Nodes/RunMeNode.tsx:14-34`; `src/store/flowStore.ts:344-362,2918-2924` | Track a root run record/controller and test progress/cancel from the trigger. |
| **AUD-033** | Typed results | Vision Verify advertises Boolean but records `resultType: "text"`; signal routing compensates, while history/generic consumers see the wrong runtime type. | `src/lib/flowNodeContracts.ts:320-325`; `src/components/Nodes/VisionVerifyNode.tsx:125-127`; `src/lib/flowExecution.ts:610-645` | Emit a Boolean result consistently and add executor-to-port contract parity tests. |
| **AUD-034** | Image memory | The 768 MiB history cap estimates direct bitmap-shaped values only; `layerOp` arrays count as zero and multilayer document snapshots are severely undercounted. | `src/store/imageEditorStore.ts:67-93`; `src/types/imageEditor.ts:874-913` | Traverse unique bitmap/mask identities, count shared buffers once, dispose evicted snapshots, and stress-test 4K/8K histories. |
| **AUD-035** | Video comics | Re-placing a saved comic asset ignores its stored `comicDefaults`, losing kind, text, colors, stroke, and tail. | `src/lib/editorAssets.ts:90-105,136-140`; `src/features/video/workspace/VideoWorkspace.tsx:1751-1779,1923-1951,3961-3968` | Apply comic defaults like text/shape defaults and add reusable-asset placement tests. |
| **AUD-036** | Browser FFmpeg | The first rejected FFmpeg load remains cached; failure paths lack `finally` cleanup, reuse virtual filenames, and omit overwrite flags, so retries can remain broken or collide with stale files. | `src/lib/mediaComposition.ts:255,357-433,569-624,735-747,895-931` | Clear rejected cache entries, use per-run names/`-y`, and cleanup in `finally`; inject loader/exec/read/delete failures. |
| **AUD-037** | Browser Paper PDF | If `window.open` is blocked, the fallback downloads HTML but the caller still reports that a browser PDF print dialog opened. | `src/components/Paper/PaperWorkspaceUtils.ts:820-831,855-863` | Return a typed outcome (`print-dialog`, `html-fallback`, `failed`) and test popup-blocked/Android behavior. |
| **AUD-038** | ICC/WASM | RGB→CMYK/PDF-X and soft-proof code does not symmetrically delete all LCMS profiles/transforms, accumulating native/WASM resources over repeated exports. | `src/lib/paperColorManagement.ts:29-41`; `src/lib/paperIccEngine.ts:107-145,174-213`; `src/lib/paperPdfxPipeline.ts:203-228,254-296` | Add disposable ownership with `try/finally` and instrument create/delete balance tests. |
| **AUD-039** | Local upscale | UI/help promise “Local CPU AI” and “CPU only,” but install/runtime is `realesrgan-ncnn-vulkan`; its own wrapper says the pinned build rejects CPU-only `-g -1`. CPU-only systems therefore cannot provide the advertised fallback. | `src/lib/paperImageUpscale.ts:522-535`; `src/lib/helpContent.ts:208`; `electron/main.mjs:3239-3258`; `ops/local-upscaler/local-upscaler.mjs:120-142` | Rename/capability-detect it as local Vulkan, or ship a true CPU backend; test a no-Vulkan environment. |
| **AUD-040** | Desktop lifecycle | There is no single-instance lock, so launcher clicks can create processes sharing userData/fixed services. The Linux `.desktop` advertises `%U`, but `launcher.cjs` consumes only `--dev` and `getElectronLaunchArgs` drops file/URL arguments; main has no external-open handler. | `electron/main.mjs:3412-3447`; `scripts/install-desktop-launcher.sh:69-83`; `electron/launcher.cjs:65-83`; `electron/linux-windowing.cjs:152-174` | Add `requestSingleInstanceLock`/`second-instance`, route argv/open-file/open-url, and test `.sloom`/`.slppr` launch plus concurrent invocation. |
| **AUD-041** | Startup recovery | Any read/parse/schema/preparation error for the remembered project is caught, its path is forgotten, and a blank project opens without a recovery prompt. | `electron/main.mjs:908-933,2552-2561`; `src/App.tsx:1898-1916` | Preserve the path/error, offer Retry/Open Another/Recover Backup, and test corrupt and temporarily unreadable existing files. |
| **AUD-042** | Settings backup | “Encrypted settings backup” claims editor preferences, but its schema/export/import omit locale, locale-choice state, density, menu style, default image model, and font-library preferences. | `src/lib/i18n.ts:815-817`; `src/store/settingsStore.ts:199-267,507-520,674-706` | Generate backup fields from a declared portable-settings schema or label it partial; test schema completeness. |
| **AUD-043** | First run | Community notice (`z-[1200]`) can cover the language gate (`z-[200]`) and is hardcoded English, so first-run locale selection can be obscured and Japanese users still see English notice copy. | `src/App.tsx:2332-2359`; `src/components/Layout/FirstRunLanguageGate.tsx:25-30`; `src/components/Layout/CommunityStartupNotice.tsx:43-62,86-124` | Sequence startup gates after hydration/locale choice and move copy to i18n; add a composed first-run test. |

## Low finding

### AUD-044 — Flow context-menu labels retain the previous locale

`handlePaneContextMenu` reads `locale` while omitting it from its `useCallback` dependencies (`src/App.tsx:2004-2069`). Changing language alone leaves the callback closed over the old locale, so category/node labels remain in the previous language until an unrelated dependency changes. Add `locale` and a switch-locale-then-right-click test.

## Why the green suite did not catch these

Several tests validate an implementation fragment while bypassing the feature boundary users invoke:

- API Requester tests call the executor directly, bypassing its missing run/reachability wiring.
- Function tests seed internal provider results, so synchronous signal evaluation looks correct without ever making a new request.
- Snapshot tests compare immediate object shape and thereby accept the same live `layers` reference they should reject.
- Print-package tests explicitly assert that image data is absent even though the UI says all print assets are consolidated.
- PDF tests search generated text/markup rather than comparing rendered page pixels or inspecting embedded fonts.
- Workspace tests switch synchronously and do not let an async provider or asset restore complete after another workspace becomes active.
- Settings tests use one store instance and do not model two Electron renderers writing the same encrypted snapshot.

The generated Flow port audit is useful for connection compatibility, but “an implementation case exists” is not the same as “the node is reachable through `canRunNode`, runtime callbacks, and dependency execution.”

## Highest-value regression gates to add

1. **Two-window native project gate:** edit different workspaces in two renderers, switch projects from either window, save from either window, and prove version-consistent state with no stale writer.
2. **Workspace-owned Flow run gate:** complete, fail, retry, and cancel a delayed run after switching to an unrelated and a duplicated workspace.
3. **Provider state-machine gate:** fake submit success plus poll/download faults; assert one paid submission, resumable prediction ID, bounded retry time, and immediate 4xx/validation failure.
4. **Clean-profile portability gate:** export portable `.sloom` and print package with managed image/font/license/ICC records; delete IndexedDB; import and compare a rendered page plus strict export.
5. **Paper two-tab sync gate:** synchronize two managed-asset documents to an empty receiver and prove tab identity, exact fonts, image bytes, and ICC records.
6. **Image destructive-lifecycle gate:** close dirty tabs, mutate pixels after layer/history/snapshot capture, save/reopen named snapshots, and validate selection-mask lifecycle.
7. **Motion-comic duration/export gate:** assert editor visibility and output frames across the full authored interval in native and browser fallback paths.
8. **Settings startup gate:** delayed encrypted hydration, license revalidation, every provider key round-trip, backup completeness, and concurrent renderer writes.
9. **Paper visual parity gate:** compare editor pixels against ordinary PDF, flattened PNG, soft proof, and strict PDF-X for translucent shapes, managed fonts, and placed PDFs.

## Recommended repair order

1. **Stop corruption and unintended spend:** AUD-001 through AUD-005, plus credential disclosure AUD-012.
2. **Restore core Flow truthfulness:** AUD-006 through AUD-011 and proxy parity AUD-013.
3. **Make saved/synchronized publications complete:** AUD-017 through AUD-020, then clean-profile gates.
4. **Make Image/Video state trustworthy:** AUD-021 through AUD-026.
5. **Close lifecycle and platform gaps:** AUD-014 through AUD-016 and AUD-027 through AUD-044.

## Verification baseline

Commands run against the current worktree:

```text
npx vitest run --reporter=dot
# 624 files, 4,871 tests passed

npm run build
# TypeScript + Vite production build passed

npx eslint src electron scripts --format stylish
# exit 0; 84 warnings, 0 errors
```

Focused evidence runs also passed:

- Flow connection/runtime subset: **8 files, 138 tests**.
- Paper/package/sync/export subset: **6 files, 35 tests**.
- In-memory Image probes reproduced live snapshot aliasing, layer-op chronology corruption, and persisted selection-without-mask.

Build warnings remain for large chunks and browser externalization of `module` from HarfBuzz/LCMS dependencies; they were not promoted to defects without a demonstrated runtime failure.

## Reviewed paths not reported as broken

- Base typed-port validation is strong, and reference handles do accept text and JSON. AUD-011 is specifically about losing per-slot association.
- `.slppr` v2 packages reachable managed records and verifies hashes correctly.
- Electron preload channel names match the corresponding main-process handlers.
- Native Paper save dialogs now choose a destination and return the saved path before/after the expensive operation as appropriate.
- Bundled font and ICC resource packaging/protocol resolution appears coherent; the failures above are project/package/sync/export-boundary issues.
- Native frame-server comic export samples comics dynamically; AUD-025 is explicitly the browser/legacy fallback.
- Unsupported raw IDML import is communicated rather than silently pretending to support it.
- Native overwrite backups exist, although they do not prevent stale-renderer corruption.
