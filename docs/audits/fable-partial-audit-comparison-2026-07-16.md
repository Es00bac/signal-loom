# Fable 5 Partial Audit Recovery and Comparison — 2026-07-16

## Executive result

The unfinished Fable 5 audit contains useful work that should not be discarded. Its checked-in draft is only a 380-byte placeholder, but the interrupted Claude session and its subagent transcripts retain the finder reports, several independent verifier reports, empirical browser probes, and a Paper corruption reproduction.

After recovering those artifacts and checking the claims independently against the current working tree, the comparison found:

- a substantial set of new or materially broader correctness findings, led by a new Paper save-time blanking chain, managed-font failures across flattened print exports, font/runtime defects in Image and Video, and dynamic Flow contract failures;
- strong independent corroboration for several findings already in the Codex audit, especially Paper tab synchronization, generic retry behavior, resume hashing, Vision Verify result typing, ordinary Paper PDF rendering, and exact face-chip persistence;
- a small number of claims that should not enter the repair queue as written because current provider documentation refutes or narrows them; and
- several plausible leads for a later pass that did not receive enough independent verification before Fable exhausted its session.

This document is an addendum, not a rewrite of docs/audits/codebase-correctness-audit-2026-07-16.md. The original 44 IDs remain frozen so the two audits can still be compared directly. No production code was changed during this comparison.

## Recovery and verification method

Evidence was recovered from:

- the parent Claude transcript at /home/cabewse/.claude/projects/-home-cabewse-work-SPaC3-flow/bfb9c1d9-52e8-45df-bb0d-408ca8cfd89d.jsonl;
- its subagent transcripts under the matching bfb9c1d9-52e8-45df-bb0d-408ca8cfd89d/subagents directory;
- its scratch records under /tmp/claude-1000/-home-cabewse-work-SPaC3-flow/bfb9c1d9-52e8-45df-bb0d-408ca8cfd89d; and
- the incomplete placeholder at docs/audits/claude-broken-feature-audit-2026-07-16.md, which was left unchanged.

The recovered run contained 82 raw finder leads and 34 recorded verifier verdicts. Those are not treated as 82 defects: duplicated root causes were merged, unsupported statements were removed, and current code was inspected again in three independent passes covering Paper/typesetting, media/fonts, and transcript recovery/triage. Focused probes reproduced the Flow token and list-order behavior, Chromium font-shorthand rejection, managed-font width mismatch, and the Paper save/tab failure chains.

Severity means the same thing as in the Codex audit: Critical is a credible silent corruption/data-loss or uncontrolled-spend path; High breaks a primary contract; Medium is narrower or recoverable; Low is deterministic but limited.

## New and materially broader findings

### FBL-001 — Paper can silently reopen blank after media normalization invalidates captured asset IDs

**Severity: Critical**

Paper first captures a snapshot containing managed asset IDs. Project save normalization can then replace a linked Source Library item's managed locator with an external signal-loom-asset locator without updating those already captured Paper asset IDs. On load, project validation recomputes references, sees a mismatch, discards the entire Paper snapshot, and paperStore restores its blank default. No exception reaches the rollback path; the next save can persist the blank state.

Evidence: src/lib/projectDocumentActions.ts:20-48; src/lib/projectMediaReferences.ts:161-257; src/lib/projectValidation.ts:356-422,453-511,989; src/store/paperStore.ts:913,927-935,968-1007. Fable's dedicated throwaway reproduction passed eight variants, including migrated frames that retain sourceBinItemId.

Repair direction: normalize referenced media before exporting the Paper snapshot, or atomically rewrite the snapshot's asset IDs with the same remap. Validation must report a recoverable document error rather than silently substitute a blank workspace. Add save/reopen tests for managed images, linked Source Library items, migrated frames, and a second save after failure.

### FBL-002 — One malformed or duplicate Paper tab invalidates the entire Paper snapshot

**Severity: High**

The project validator applies all-or-nothing tab validation before paperStore's more tolerant filtering. One invalid tab or duplicate document ID therefore makes sanitizePaperSnapshot return undefined and restores a blank Paper workspace instead of retaining valid tabs and surfacing the bad entry.

Evidence: src/lib/projectValidation.ts:356-394,989; src/store/paperStore.ts:968-1007.

Repair direction: validate documents independently, preserve the valid set, quarantine invalid entries with diagnostics, and refuse destructive resave until the owner chooses recovery. Add a three-tab fixture with one corrupt and one duplicate entry.

### FBL-003 — Closing a Paper tab has no dirty-document confirmation or recovery handoff

**Severity: High**

PaperDocumentTabs closes the selected document directly through paperStore. There is no per-document dirty state, confirmation, recovery copy, or distinction between a newly imported standalone .slppr and a saved project tab.

Evidence: src/features/paper/workspace/PaperDocumentTabs.tsx:53-58; src/store/paperStore.ts:392.

Repair direction: track dirty state per Paper document, block or confirm close, and preserve a recoverable snapshot. Test close by tab button, middle click if supported, project replacement, and app shutdown.

### FBL-004 — Bubble-warp edge controls are stripped during ordinary Paper tab/save normalization

**Severity: High**

createPaperFrame copies bubbleWarp but omits the per-edge left, right, top, and bottom warp fields. Any route that recreates or sanitizes a frame can silently collapse an asymmetric authored warp to its base value. The recovered reproduction changed {left: 0.5, right: -0.2, top: 0.4, bottom: -0.3} into a frame containing only bubbleWarp.

Evidence: src/lib/paperDocument.ts:1058-1141.

Repair direction: make frame construction exhaustive against the PaperFrame type and add a round-trip test that assigns a unique non-default value to every geometry/effect field.

### FBL-005 — Flattened Paper exports can substitute managed fonts, while KDP skips the font gate

**Severity: High; materially broadens AUD-020**

The shared page flattener serializes authored HTML into an SVG foreignObject and loads that SVG as an image, but the isolated SVG does not contain the managed font's @font-face data. Fonts that happened to be registered in the editor document are therefore not guaranteed inside the rasterization document. This affects KDP PDF/X-1a pages, soft proof, PNG/webcomic output, and PDF/X-4 flatten groups, not only the ordinary PDF path described by AUD-020. KDP additionally skips managed-font preflight for a fully flattened page under the assumption that rasterization has already preserved the glyphs.

Evidence: src/lib/paperPageFlattenExport.ts:121-215; src/lib/paperProductionPreflight.ts:454-472; src/features/paper/workspace/PaperWorkspaceUtils.ts:1058.

Repair direction: inject exact managed font bytes into the isolated SVG, wait on its own document.fonts readiness, and fail if the requested face cannot be resolved. Remove the KDP exemption. Compare editor pixels and text metrics with soft proof, PNG, KDP, and PDF/X using a bundled font unavailable to the operating system.

### FBL-006 — The managed Paper composer drops rich leading and advanced run/paragraph properties

**Severity: High**

paperTextComposition derives line height from the frame/default style and does not apply rich paragraph or run leading to layout. It also drops several properties represented by the rich editor, including run kerning, numeric spacing, emphasis/orientation fields, paragraph align-last, and strict line-break behavior. The native managed-font/PDF-X route can therefore wrap and position text differently from the rich editor and flattened route.

Evidence: src/lib/paperTextComposition.ts:278-289,918-1015,1047-1087.

Repair direction: define one canonical computed typography model and make DOM editing, canvas composition, flattened export, and native PDF consume it. Add mixed-range fixtures whose leading, kerning, orientation, and paragraph rules produce distinct measurable geometry.

### FBL-007 — Changing zoom during rich editing mutates explicit type size and leading

**Severity: High**

Rich-editor DOM values are written in pixels at the zoom active when the editor opens, then divided by the zoom active when the edit is committed. If zoom changes mid-session, a 24-point run opened at 100% and committed at 200% can become 12 points. Leading is affected through the same conversion.

Evidence: src/features/paper/workspace/PaperWorkspace.tsx:9827-9869,9987-10044; src/lib/paperRichTextDom.ts:247-253.

Repair direction: store the editor session's opening scale and use it for all reverse conversion, or keep authored units in data attributes. Add zoom-during-edit tests for mixed run sizes and explicit leading.

### FBL-008 — Vertical-writing changes can be lost while a rich editor is active

**Severity: High**

The manga-bubble vertical-writing control enters a rich-edit branch that applies paragraph alignment and returns without persisting writingMode. The checkbox appears actionable, but the selected frame can retain its old writing direction.

Evidence: src/features/paper/workspace/PaperWorkspace.tsx:10870-10876,12196.

Repair direction: route writing direction through the same retained selection transaction as other frame/rich properties and add tests with active text selection, collapsed caret, and no active editor.

### FBL-009 — CI-produced desktop installers can omit the entire bundled font library

**Severity: High; supersedes one clean-area statement in the Codex audit**

Release CI runs install, build, and electron-builder, but does not stage the external font collection. build/font-library is ignored, the source font collection is outside the repository, and Electron's extraResources entry is silently absent if that directory was not prepared. Locally prepared installers can work while official CI artifacts return 404 from the bundled-font protocol.

Evidence: .github/workflows/release.yml:48-55; package.json:21,40,45-49,143-154; .gitignore:65; electron/bundled-font-library.cjs:17-30; electron/main.mjs:1922-1928.

Repair direction: make font staging an explicit, fail-closed release step with a redistributable source artifact, manifest/hash verification, and an installer smoke test that requests a known face. The original audit's statement that font resource packaging appeared coherent applies only to a locally staged build and is not true for CI as configured.

### FBL-010 — Condensed and other non-normal-width managed fonts cannot resolve for strict Paper output

**Severity: High**

Font vetting records OS/2 width class as stretchPercent, but Paper requests omit stretch and normalize to 100. Exact face selection then rejects a valid 75%-width face. This affects the checked collection's IBM Plex Sans Condensed faces and many Inconsolata static faces. Canvas can display the family through browser matching while strict PDF/X preflight blocks it or a draft path embeds a fallback.

Evidence: src/lib/paperFontVetting.ts:146-159,247-250; src/lib/paperFontLibrary.ts:84-107,114-147; src/lib/paperManagedFonts.ts:123-159; src/lib/paperProductionPreflight.ts:454-472; src/lib/paperPdfxNativeContent.ts:442-445.

Repair direction: persist/request stretch as part of the exact face key, expose width where a family has alternatives, and add condensed-face preview/native-PDF/preflight tests.

### FBL-011 — Bundled fonts selected in Image or Video are session-only after restart

**Severity: High; extends AUD-026**

The shared browser registers a font only when the user clicks it. Image and Video persist a raw family name, not font bytes or a stable managed-face reference. After app restart or project transfer, the browser registration is gone; preview and export can silently use a system fallback. Bare family names do not trigger the stronger missing-face warnings.

Evidence: src/lib/bundledFontLibrary.ts:216-244; src/components/Common/BundledFontBrowser.tsx:72-77; src/features/video/workspace/VideoWorkspace.tsx:8720,9870,11215; src/components/ImageEditor/ImageEditorTextLayerControls.tsx:47-53; src/components/ImageEditor/ImageTextLayer.ts:1668-1686,1813-1825.

Repair direction: persist a stable face ID and package/register the required face during project restore and every export worker. Add a fresh-process test rather than selecting and exporting in one renderer session.

### FBL-012 — Several bundled family names generate invalid canvas/CSS font declarations

**Severity: High**

Image and Video interpolate the family directly into font shorthand without quoting names. Families such as M PLUS 1, M PLUS 2, M PLUS Rounded 1c, Source Sans 3, and Source Serif 4 are parsed as malformed shorthand in Chromium. The browser rejects the assignment and retains its prior default font.

Evidence: src/components/ImageEditor/ImageTextLayer.ts:714-716; src/lib/videoTextFlow.ts:339-341; src/lib/mediaComposition.ts:1293-1296; src/features/video/workspace/VideoWorkspace.tsx:8342-8348; src/components/ImageEditor/ImageComicTools.ts:380.

Repair direction: use a shared CSS family serializer that quotes/escapes every non-generic family, and assert the computed browser font for every shipped family whose name contains whitespace or digits.

### FBL-013 — Image “All Small Caps” produces an invalid canvas font shorthand

**Severity: High**

The UI exposes all-small-caps and the preset stores it, but Canvas font shorthand does not accept that token in the position used by ImageTextLayer. Chromium rejects the entire assignment; ordinary small-caps does not have the same failure.

Evidence: src/components/ImageEditor/ImageTextLayer.ts:714-716; src/components/ImageEditor/ImageEditorTextLayerControls.tsx:343-355; src/components/ImageEditor/ImageEditorTextShapeProperties.tsx:221-231; src/components/ImageEditor/ImageTextPresets.ts:200-210.

Repair direction: implement all-small-caps through text transformation/OpenType features supported by the chosen renderer rather than inserting it into Canvas shorthand. Add a real Chromium canvas test because jsdom accepts syntax Chromium rejects.

### FBL-014 — Video's advertised kerning control is discarded before preview and export

**Severity: High**

The type and UI expose fontKerning, but normalizeManualEditorState omits it. Reads normalize the state again, so the user's choice disappears before downstream layout/export can use it.

Evidence: src/types/flow.ts:513-516; src/features/video/workspace/VideoWorkspace.tsx:643-645,8409-8419,9248-9255; src/lib/manualEditorState.ts:26-112,530-578; src/store/flowStore.ts:1335.

Repair direction: make the normalizer exhaustive and add a control-to-persisted-state-to-rendered-frame test for every Video typography field.

### FBL-015 — Local Flow template tokens are diagnosed as undeclared and double braces are corrupted

**Severity: High**

The local token allowlist uses uppercase names while parsed token names are lowercased, so local forms such as {{A}} can receive a run-blocking undeclared-variable diagnostic. Separately, replacement processes the single-brace form before the double-brace form, turning {{A}} into {value}.

Evidence: src/lib/flowVariables.ts:60,255-270,313-340; src/lib/flowSignals.ts:1136-1141.

Repair direction: canonicalize both sides to one case and replace the longest delimiter form first with a tokenizing parser. Test A/B/C, case variants, mixed single/double syntax, and literal braces.

### FBL-016 — List inputs follow edge insertion order instead of numbered slot order

**Severity: High**

Flow signal aggregation for list nodes iterates incoming edges directly. Reconnecting or loading edges in a different array order can produce slot B before slot A even though the node's numbered handles promise deterministic ordering. The separate list execution helper already contains a slot-aware sort but the signal path does not use it.

Evidence: src/lib/flowSignals.ts:834-853; compare src/lib/listNodes.ts:49-70.

Repair direction: centralize ordered list-input resolution and use it for signals, execution, previews, and cache hashing. Add shuffled-edge fixtures.

### FBL-017 — allCombinations fails when a list arrives through textual Flow signals

**Severity: High**

Combination count is calculated from expanded list cardinality, while prompt batching retains a different cardinality for text-carried list values. Execution later requires the two counts to match and fails rather than running the Cartesian product.

Evidence: src/store/flowStore.ts:1878-1892,2842-2885; src/lib/listExecution.ts:100-153.

Repair direction: represent list-valued signals structurally through planning and expand once. Test two lists arriving as direct list edges, interpolated prompt values, and mixed sources.

### FBL-018 — Switch Case outputs are typed unknown even when runtime passes through a concrete value

**Severity: High**

The Switch Case contract declares unknown outputs. Runtime clones and routes the selected input value, but connection validation has no Switch-specific passthrough inference, so typed downstream consumers can reject a connection that runtime could satisfy.

Evidence: src/lib/flowNodeContracts.ts:345; src/lib/flowConnectionContracts.ts:173-203; src/lib/flowSignals.ts:579-597.

Repair direction: infer output types from the switched value input, constrain all case branches to a compatible union, and test text/image/JSON pass-through.

### FBL-019 — Composition's visible legacy audio tracks and declared audio ports can disagree

**Severity: High**

The Composition UI can grow visible audio tracks based on connected legacy handles, while the contract exposes only the configured count. Its attempted self-heal compares highestConnectedIndex with a visible count that already includes that same maximum, making the repair branch unreachable.

Evidence: src/lib/flowNodeContracts.ts:598-607; src/components/Nodes/CompositionNode.tsx:86-97.

Repair direction: derive visible handles and connection contracts from one normalized track model, migrate legacy handles before validation, and test reopen/reconnect of projects with higher-numbered tracks.

### FBL-020 — Reusable functions advertise multiple outputs but execute only the first binding

**Severity: High**

The function-node contract declares every configured output. Execution evaluates outputBindings[0], and signal lookup does not distinguish sourceHandle, so secondary outputs can display as connectable while returning the first output or no distinct value.

Evidence: src/lib/flowNodeContracts.ts:624-630; src/lib/functionNodes.ts:840-862; src/lib/flowSignals.ts:219-228.

Repair direction: return a handle-keyed result map and route/cache each output independently. Add a function whose two outputs have different types and values.

## Secondary confirmed findings

| ID | Severity | Finding | Evidence / repair direction |
|---|---|---|---|
| FBL-021 | Medium | Paper undo/redo history is global and cleared on every tab switch, so switching documents destroys otherwise valid edit history. | src/store/paperStore.ts:377 and adjacent tab actions. Give each document its own bounded history and test A→B→A. |
| FBL-022 | Medium | Paragraph leading is copied into every run during DOM extraction, after which a selected run cannot reliably reduce it below the paragraph value. | src/lib/paperRichTextDom.ts:224-254. Preserve inheritance rather than materializing it into each run. |
| FBL-023 | Medium | The head frame of a threaded rich story computes a slice but renders the complete richText payload, allowing duplicated or missing text at thread boundaries. | src/features/paper/workspace/PaperWorkspace.tsx:7174-7189,9231-9251. Render the computed rich slice and test three linked frames. |
| FBL-024 | Medium | Print HTML omits each-line text indent, adding another editor/export typesetting mismatch beyond FBL-006. | src/lib/paperDocument.ts:1391-1412. Carry the property into canonical paragraph CSS and pixel tests. |
| FBL-025 | Medium | The bundled-font browser is exposed in non-Electron LAN/web/Android renderers even though signal-loom-font is registered only by Electron. Selection there points at an unavailable resource. | src/components/Settings/FontLibrarySection.tsx:113-123; src/lib/bundledFontLibrary.ts:199-202; Electron protocol registration in electron/main.mjs. Gate it or provide a platform transport. |
| FBL-026 | Medium | A Paper font installed as bundled provenance reloads as user-import, weakening attribution/license provenance even though bytes remain usable. | src/features/paper/assets/PaperDocumentAssets.ts:163-172; src/lib/bundledFontLibrary.ts:327-331. Round-trip provenance and license evidence. |
| FBL-027 | Medium | Persisted edge contract annotations remain stale after node configuration changes because patchNodeData updates nodes but does not renormalize connected edges. | src/lib/flowConnectionContracts.ts:121-146; src/store/flowStore.ts:669-675,2568-2585. Recompute on contract-affecting changes and reject/migrate incompatible edges. |
| FBL-028 | Medium | ElevenLabs music output mp3_48000_192 is exposed and selected by the UI, but the sanitizer only retains mp3_44100_64 or pcm_44100 and silently changes all other choices to mp3_44100_128. | src/lib/providerCatalog.ts:222-227,713-719; src/components/Nodes/AudioNode.tsx:592. Validate against the provider's actual enum and preserve supported values. |
| FBL-029 | Medium | ElevenLabs PCM responses are returned as raw signed PCM bytes while the app can label/treat them as audio/wav; only the Gemini path wraps raw PCM in a WAV container. | src/lib/flowExecution.ts:3279,3326,3355,3396,4216 and sibling ElevenLabs branches. Either preserve the correct raw MIME/metadata or wrap with an exact WAV header. |
| FBL-030 | Medium | BytePlus image requests omit the provider's watermark control; the provider default can therefore watermark output despite Sloom's generated-image expectations. | src/lib/imageEditorAi/bytePlusImage.ts:34-41; [BytePlus Image generation API](https://docs.byteplus.com/en/docs/ModelArk/1541523). Send the documented value explicitly and add request-shape coverage. |
| FBL-031 | Medium | Opening a standalone .slppr locally bypasses the pointer-only edit-baton checks used by project loads; the host prevents remote corruption, but local state can still be replaced outside that coordination path. | src/App.tsx:1233-1364,1776-1806; src/store/paperStore.ts:345-360. Route imports through the same ownership transaction. |
| FBL-032 | Medium | Major new typography surfaces are hardcoded in English, including the rich type inspector, Paper document tabs, and bundled-font browser; one translated kerning label also has hardcoded option text. | src/features/paper/workspace/PaperWorkspace.tsx:9721-9800,11759; src/features/paper/workspace/PaperDocumentTabs.tsx:14-80; src/components/Common/BundledFontBrowser.tsx:97-170. Move copy to the locale catalog and add Japanese UI snapshots. |
| FBL-033 | Medium | Locale changes update one renderer's store while the native application menu is global, so multiple windows can disagree about locale/menu state. | src/App.tsx:1961-1965; src/store/settingsStore.ts:438; electron/main.mjs:3059. Define one ownership/broadcast model and test two windows. |
| FBL-034 | Low | The bundled-font sample string is explicitly styled with font-sans before selection, so “Ag あア” does not preview the face it asks users to choose. | src/components/Common/BundledFontBrowser.tsx:53-77,142-153. Register a preview subset or render server-provided specimens. |
| FBL-035 | Low | The desktop packaging readiness checklist can report the font resource ready without checking that staged font bytes exist. | src/lib/desktopPackaging.ts:243-271. Verify manifest count/hash and fail release readiness when absent. |

## Findings that corroborate or refine the Codex audit

| Existing ID | Fable contribution |
|---|---|
| AUD-003 | Independent review confirmed the generic retry classifier loses or fails to recognize common SDK status shapes, strengthening the resubmission/permanent-error analysis. |
| AUD-010 | Independent review reached the same self-invalidating resume/cache hash behavior. |
| AUD-019 | Fable reproduced the tab-sync corruption and missing managed-asset transfer independently. Its .slppr baton finding is a narrower extension, recorded as FBL-031. |
| AUD-020 | Fable confirmed ordinary PDF double-paint/hidden-window font substitution and broadened the font-isolation issue to all flattened export consumers in FBL-005. |
| AUD-026 | Exact Image/Video face chips still discard weight/style. Fable reasonably rated the chip defect Medium because separate weight/style controls exist; FBL-011 and FBL-014 are distinct persistence/no-op failures. |
| AUD-033 | The Vision Verify Boolean-versus-text mismatch was independently identified. |

The corroboration increases confidence in those root causes but does not create duplicate repair tickets.

## Claims corrected or rejected

### Gemini IMAGE-only response modality is not a general bug

One recovered provider finding claimed that requesting IMAGE without TEXT is categorically invalid. Current Google documentation explicitly demonstrates image-only response modalities for supported Gemini image models. The code still needs per-model capability tests, but this claim should not be filed without a model-specific failing request.

Reference: [Google Gemini image-generation documentation](https://ai.google.dev/gemini-api/docs/generate-content/image-generation)

### mp3_48000_192 is a real ElevenLabs format

Fable correctly found that Sloom's sanitizer discards the value, but one report called the format fictional. Current ElevenLabs music documentation lists mp3_48000_192. The actionable bug is FBL-028: a valid selected value is silently coerced.

Reference: [ElevenLabs music API](https://elevenlabs.io/docs/api-reference/music/compose/)

### Bundled-font registration failure handling is deliberate, not a swallowed-error defect

The browser's catch path implements test-pinned graceful degradation and does not present a contradictory success state. That lead was explicitly refuted by Fable's own verifier and is not included above.

## Plausible leads not yet promoted

These survived finder reports but did not receive enough independent reproduction to enter the confirmed queue:

- formatting a subrange inside ruby source such as 漢字《かんじ》 may expose the literal annotation syntax;
- DOCX story export may flatten retained rich styling;
- rich folio markers such as {page} and {pages} may not be substituted;
- paragraph shading may round-trip as run highlight;
- explicit superscript/subscript size may be discarded;
- Crop/Composition object-URL lifecycle may retain stale or revoked blob URLs; and
- the origin-zine generator has lower-priority demo-fixture concerns around duplicate guide IDs, declared PNG dimensions, shared thread IDs, and tests that bypass the full project validator.

These should receive minimal focused reproductions before code changes. They are deliberately excluded from the repair order below.

## Why the original audit missed these

The two audits emphasized different failure boundaries:

- The Codex audit checked .slppr v2 packaging directly; Fable followed the earlier save-normalization step that can invalidate an otherwise valid Paper snapshot before packaging.
- The Codex audit inspected font face persistence and ordinary PDF output; Fable tested fresh-process registration, Chromium's real font parser, non-normal width classes, isolated foreignObject rasterization, and CI staging.
- The Codex Flow pass emphasized reachability, typed inputs, provider state, and workspace ownership; Fable exercised dynamic output contracts, edge reconfiguration, slot ordering, local token syntax, and multi-output functions.
- A local configured desktop build had staged fonts, so it did not reveal that a clean CI runner lacks the external source collection.
- jsdom accepts several font strings that Chromium rejects, and shape/markup assertions do not prove the selected face rendered.

This is complementary coverage rather than evidence that either audit's validated findings are unreliable.

## Consolidated repair order

1. Stop Paper blanking and deletion: FBL-001, FBL-002, FBL-003, then AUD-001/AUD-019 ownership and sync work.
2. Make print output deterministic: FBL-005, FBL-009, FBL-010, FBL-011, then AUD-017 through AUD-020.
3. Repair dynamic Flow truthfulness: FBL-015 through FBL-020 and FBL-027 alongside AUD-006 through AUD-011.
4. Unify typography behavior: FBL-004, FBL-006 through FBL-008, FBL-012 through FBL-014, then FBL-021 through FBL-024.
5. Correct provider output contracts: FBL-028 through FBL-030 alongside AUD-003.
6. Close platform and localization gaps: FBL-025, FBL-026, FBL-031 through FBL-035.

The first regression gate should combine FBL-001 and FBL-002: save and reopen a three-tab Paper project containing a migrated Source Library-linked managed image, one intentionally malformed tab, custom bubble warp, and a managed condensed font. The expected result is two preserved valid tabs, an explicit recoverable diagnostic for the invalid one, unchanged media/font hashes, and no blank fallback.
