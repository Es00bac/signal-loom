# Signal Loom — Complete Feature Breakdown (Desktop & Android)

> **Source of truth:** This document was produced by auditing the **code**, not prior docs.
> Every capability below is traced to a type union, store action, menu command, node-catalog
> entry, provider descriptor, or native plugin in the repository. File references are given so
> each claim can be re-verified. Last audited against the tree on the
> `feature/provider-catalog-mask-painting` branch (app version **0.9.6**, Android `versionCode 8`).

Signal Loom is a four-workspace generative-media suite that ships as **one codebase** across three
runtimes:

| Runtime | Shell | Notes |
|---|---|---|
| **Desktop** | Electron (`electron/main.mjs`, `electron/menu.cjs`) | Native menus, native file dialogs, multi-window, native FFmpeg + Vertex bridges, OS keychain encryption. |
| **Android / DeX** | Capacitor (`android/…/MainActivity.java` + 3 native plugins) | Touch + S-Pen, volume-key modifiers, file-manager intents, on-device LAN app server + NPU/GPU upscaler. |
| **Web** | Plain browser build (`dist/`) | Same UI; falls back to download/`<input type=file>` for I/O, WebCrypto for key encryption. |

All four workspaces share **one project document** (`.sloom`) and **one Source Library**, so any
asset generated or imported anywhere is reusable everywhere without re-importing.

---

## 1. Workspaces at a glance

`WorkspaceView = 'flow' | 'editor' | 'image' | 'paper'` (`src/types/flow.ts:193`). The four are
switchable from the top bar, the `View` menu, or `Ctrl+1…4`.

| # | Workspace | Internal id | What it is | Primary file |
|---|---|---|---|---|
| 1 | **Flow** | `flow` | Node-graph orchestration of AI generation + logic | `src/features/flow/workspace/FlowWorkspaceShell.tsx` |
| 2 | **Video** (Editor) | `editor` | Multitrack timeline editor / finisher | `src/components/Editor/ManualEditorWorkspace.tsx` |
| 3 | **Image** | `image` | Photoshop-class raster editor | `src/components/ImageEditor/ImageEditorWorkspace.tsx` |
| 4 | **Paper** | `paper` | InDesign-class page-layout / DTP & comics | `src/features/paper/workspace/PaperWorkspace.tsx` |

**Platform availability legend** used in tables below: ✅ full · ◐ present but reduced/adapted ·
🚫 not available · 🔌 requires setup.

---

## 2. App-wide systems (all workspaces)

| System | What it does | Desktop | Android | Web | Source |
|---|---|:---:|:---:|:---:|---|
| **Project document** | Single `.sloom` (JSON) document spanning all 4 workspaces; optional per-project scratch dir for media | ✅ | ✅ | ✅ | `src/lib/nativeProjectDocument.ts`, `projectDocumentActions.ts` |
| **Source Library** | Global, shared asset pool; main-process-authoritative on desktop, reconciled into every window | ✅ | ✅ | ✅ | `src/store/sourceBinStore.ts`, `electron/main.mjs` (`source-library-*`) |
| **Provider/API-key settings** | Per-provider keys + default models + execution config | ✅ | ✅ | ✅ | `src/store/settingsStore.ts`, `src/lib/providerCatalog.ts` |
| **API-key encryption at rest** | OS keychain (Electron `safeStorage`) / WebCrypto (web + Android) | ✅ safeStorage | ✅ WebCrypto | ✅ WebCrypto | `electron/main.mjs` (`secret-encrypt/decrypt`), note 731 |
| **Command palette** | Fuzzy command + node search/run | ✅ | ◐ | ✅ | `src/lib/commandPalette.ts`, `src/components/Common/CommandPalette.tsx` |
| **Keyboard shortcuts** | Remappable map of every menu command | ✅ | ◐ (hardware kbd/DeX) | ✅ | `src/lib/keyboardShortcuts.ts` |
| **Gamepad bindings** | Controller navigation/input | ✅ | ◐ | ✅ | `src/lib/gamepadBindings.ts`, `GamepadInputManager.tsx` |
| **Workspace layouts** | Reset / Balanced / Focus / All-panels presets | ✅ | ◐ | ✅ | `src/store/workspaceLayoutStore.ts` |
| **Dockable panels** | Float/dock/resize side panels | ✅ | ◐ | ✅ | `src/store/dockablePanelStore.ts` |
| **Activity trail** | Recent-action/event log | ✅ | ✅ | ✅ | `src/store/activityTrailStore.ts` |
| **Cost estimation + usage telemetry** | Per-node spend estimate + measured/heuristic usage | ✅ | ✅ | ✅ | `src/lib/costEstimation*`, `projectUsageStore.ts` |
| **Recovery** | Crash/data-loss recovery surface | ✅ | ✅ | ✅ | `src/components/Recovery/` |
| **In-app help** | Documentation / Tutorial / Feature help / Shortcuts / About | ✅ | ✅ | ✅ | `src/lib/helpContent.ts` |
| **Mobile interface store** | Phone/tablet adaptation + touch navigation | 🚫 | ✅ | ◐ | `src/store/mobileInterfaceStore.ts`, `touchNavigationStore.ts` |

### 2.1 File formats (`AndroidManifest.xml` intents + Electron IPC)

| Extension | Contents | Open/Save surface |
|---|---|---|
| `.sloom` | Whole project (JSON) — all workspaces, source-bin refs | Desktop native dialog · Android file-manager intent · web open/download. Legacy `.signal-loom.json`/`.json` still open. |
| `.slimg` | Single Image-workspace document | `image:file-open` / `image:file-save-as` |
| `.slppr` | Single Paper-workspace document | `paper:file-open` / `paper:file-save-as` (`src/features/paper/SlpprFormat.ts`) |

### 2.2 Platform-exclusive integrations

**Desktop only** (Electron IPC handlers in `electron/main.mjs`):
native Open/Save/Save-As dialogs · `import-media` batch normalize · **multi-window** workspace launch
(`open-workspace-window`) · **native FFmpeg render** (CPU + AMD VAAPI GPU) · **Google Vertex AI** bridge
(image/text/video generate, `vertex-login`, ADC detect, project list) · screenshot capture ·
clipboard-image read · OS keychain secrets · global app menu.

**Android only** (3 registered Capacitor plugins, `MainActivity.java:24-26`):
`SignalLoomSystemUiPlugin` (immersive system UI + **volume-key interception** used as brush-size and
Ctrl-equivalent modifiers) · `SignalLoomLanServerPlugin` (NanoHTTPD **LAN app server** — serve the app
to a desktop browser, methods `start/stop/status/respond`) · `SignalLoomImageUpscalerPlugin` (on-device
**NPU/GPU upscaler**) · `.sloom/.slimg/.slppr` **file-manager open intents** · CapacitorHttp native
request stack (bypasses WebView CORS for provider calls).

---

## 3. Flow workspace — every node

Flow is the orchestration graph (`@xyflow/react`). The canonical node registry is `FLOW_NODE_TYPES`
(`src/types/flow.ts`, **60 types**); the user-facing palette + descriptions live in
`src/lib/nodeCatalog.ts`, organized into **10 categories**. Below is the complete catalog.

### 3.1 Generate (4)
| Node | Type | What it does |
|---|---|---|
| Image | `imageGen` | Generate or edit images with the selected image provider |
| Video | `videoGen` | Generate video from prompts, frames, references, or source clips |
| Audio | `audioGen` | Generate speech, sound effects, or voice-changed audio |
| Composition | `composition` | Combine video/audio/timeline assets into a rendered sequence |

### 3.2 Inputs & Data (8)
| Node | Type | What it does |
|---|---|---|
| Text Prompt | `textNode` | Write a prompt or generate text downstream |
| Value | `valueNode` | Typed primitive: text, number, boolean, or JSON |
| Color Swatch | `colorSwatchNode` | Reusable palette guiding image/video color consistency |
| Doodle | `doodleNode` | Blue-pencil sketch + description packaged for an Image node |
| Crop Image | `cropImageNode` | Crop a connected image locally, output cropped image |
| Number | `numberNode` | Legacy numeric value node |
| Source Bin | `sourceBin` | Expose project Source-Library assets onto the canvas |
| Asset Package | `packageNode` | Bundle an image/media asset with descriptive text |

### 3.3 Lists & Envelopes (5)
| Node | Type | What it does |
|---|---|---|
| Typed List | `list` | Collect connected items into a typed batch list |
| Envelope | `envelope` | Build/collect a typed list of output items |
| Expander | `expander` | Select one item from a list/envelope |
| List Flattener | `arrayFlatNode` | Flatten nested lists into one |
| List Length | `listLengthNode` | Count items in a list/envelope |

### 3.4 Flow Control (6)
| Node | Type | What it does |
|---|---|---|
| RUN ME | `runMeNode` | Explicit run-trigger waypoint |
| Simple Loop | `loopNode` | Repeat a connected item N times |
| While Gate | `loopGateNode` | Gate/repeat while a condition stays true |
| Stop When | `loopBreakNode` | Break a batch/list loop when a condition becomes true |
| On/Off Switch | `switchNode` | Pass or block a signal |
| Fork Switch | `forkSwitchNode` | Choose one of two branch outputs |

### 3.5 Logic & Math (17)
| Node | Type | What it does |
|---|---|---|
| Boolean Logic | `logicNode` | AND / OR / XOR / NOT |
| If / Else | `conditionalNode` | Choose between two values on a condition |
| Compare | `comparisonNode` | Compare text/numbers → boolean |
| Switch Case | `switchCaseNode` | Route values by matching a case |
| Math | `mathNode` | Arithmetic on numeric values |
| Fallback Selector | `fallbackSelectorNode` | First usable value from candidates |
| JavaScript Script | `javascriptNode` | Run custom JS with inputs A/B/C |
| JSON Query | `jsonQueryNode` | Extract from JSON via JS/JSONata paths |
| Regex Parse | `regexParseNode` | Extract match groups via regex |
| Python Script | `pythonNode` | Python-like script/expression with A/B/C |
| JSON Builder | `jsonBuilderNode` | Build a JSON object from inputs A–E |
| HTML Sandbox | `htmlSandboxNode` | Render HTML/CSS/JS in an interactive iframe |
| API Requester | `apiFetchNode` | GET/POST any URL with headers + body |
| SQL Query | `sqlQueryNode` | SELECT/JOIN over arrays A and B |
| CSV Interop | `csvParserNode` | CSV ↔ JSON lists |
| Math Expression | `mathExpressionNode` | Multi-variable algebraic formulas/functions |
| XML/YAML Interop | `xmlYamlNode` | Convert JSON ↔ XML ↔ YAML |

### 3.6 Text Tools (5)
| Node | Type | What it does |
|---|---|---|
| String Template | `stringTemplateNode` | Render text from `{A}`,`{B}`,`{C}` placeholders |
| Regex Replace | `regexReplaceNode` | Replace text via regex |
| Prompt Joiner | `promptsJoinerNode` | Join prompt fragments with a delimiter |
| Negative Prompt | `negativePromptNode` | Combine exclusions/negative fragments |
| Prompt Mixer | `promptMixerNode` | Mix prompt variations for story/art |

### 3.7 Story Tools (5)
| Node | Type | What it does |
|---|---|---|
| Story State | `storyStateNode` | Store/reuse a named story variable |
| Seed Sequencer | `seedSequencerNode` | Repeatable seed sequences |
| Sentiment Analyzer | `textSentimentAnalysisNode` | Sentiment for routing/scene logic |
| Image Feature Extractor | `imageFeatureExtractorNode` | Extract features for consistency checks |
| Dialogue Splitter | `dialogueScriptSplitterNode` | Split dialogue/script into story chunks |

### 3.8 Reuse & Layout (7)
| Node | Type | What it does |
|---|---|---|
| Function | `functionNode` | Reusable collapsed-graph function |
| Group | `groupNode` | Visually group nodes |
| Function Input Marker | `functionInputNode` | Define a function entry/input handle |
| Function Output Marker | `functionOutputNode` | Define a function exit/output handle |
| Virtual Alias | `virtual` | Reuse an upstream output without moving the node |
| Portal Pair | `portal` | Paired waypoints for long-distance wiring |
| Image Editor | `advancedImageEditor` | Open an image-editing workspace node |

### 3.9 Monitor & Debug (2) · 3.10 Settings (1)
| Node | Type | What it does |
|---|---|---|
| Value Monitor | `valueMonitorNode` | Inspect a connected signal/list/envelope/media |
| Vision Verify | `visionVerifyNode` | Ask a vision model to verify an image vs a prompt |
| Config | `settings` | Configure execution defaults for connected nodes |

### 3.11 Flow canvas features (not nodes)
Viewport-centered node placement · function collapse/expand · portals/virtual aliases for wiring ·
bookmarks + fullscreen · pinch-zoom (touch) · drag-and-drop media import onto the canvas
(`useFlowCanvasDropImport.ts`) · per-node execution telemetry + cost · cycle-safe video-frame edges ·
multiple Flow workspaces with source-bin syncing. **Function ports** carry a 27-step transform language
(`TransformKind` — trim, set, default, coalesce, slice/split/join, map/filter, jsonPath, template, …)
and 3 expression languages (`mustache | jsonata | javascript`).

---

## 4. Video (Editor) workspace — every capability

The Editor is a multitrack timeline finisher. Logic lives in `src/lib/manualEditorState.ts`,
`manualEditorSequence.ts`, `editorKeyframes.ts`, `mediaComposition.ts`; layout in
`src/store/editorStore.ts`; a Premiere-parity descriptor in `src/lib/videoPremiereParity.ts`.

### 4.1 Sources, tracks & clips
- **Source kinds** (`EditorSourceKind`): text, image, video, audio, composition, document, subtitle, package.
- **Tracks**: visual lane(s) + up to **4 audio tracks** with independent volumes (`getEditorAudioTrackVolumes`, default trackCount 4); resizable track heights (visual 60–220px, audio 44–220px).
- **Clip ops**: trim, **cut/split** at playhead, slip, ripple gaps, snapping, non-destructive trim, clip property copy/paste (`editorClipPropertyClipboard.ts`).
- **Dual monitors**: Source monitor + Program monitor with split control.

### 4.2 Visual clip styling
| Capability | Values | Source |
|---|---|---|
| Transitions | none, fade, slide-left/right/up/down | `VisualClipTransition` |
| Fit modes | contain, cover, stretch | `EditorVisualFitMode` |
| Clip filters | brightness, contrast, saturation, blur, grayscale, sepia, invert, hue-rotate | `EditorClipFilterKind` |
| Text effects | none, shadow, glow, outline | `TextClipEffect` |
| Stage objects | text, rectangle | `EditorStageObjectKind` |
| Stage blend modes | normal, screen, multiply, overlay, lighten, darken, color-dodge, color-burn | `EditorStageBlendMode` |

### 4.3 Keyframe animation
Authoritative keyframe system (`editorKeyframes.ts`) animating transform (position/scale/rotation),
opacity, crop, and **audio volume/level** automation. Shortcuts: `K` add/update keyframe,
`[`/`]` previous/next keyframe.

### 4.4 Render / export presets (10) — `VideoExportPresetId`
Review H.264 1080p · Social Vertical H.264 · Archive High Quality · WebM VP9+Opus · Animated GIF
Preview · ProRes 422 HQ MOV · HEVC/H.265 MP4 · HEVC/H.265 MOV · PNG Image Sequence · JPEG Image
Sequence. **Render backends** (`RenderBackendPreference`): auto → AMD VAAPI GPU → native CPU → browser
FFmpeg (native paths are Electron-only; browser FFmpeg works everywhere).

| Capability | Desktop | Android | Web |
|---|:---:|:---:|:---:|
| Timeline editing / keyframes | ✅ | ◐ (mobile shell) | ✅ |
| Browser-FFmpeg render | ✅ | ◐ | ✅ |
| Native CPU / AMD-VAAPI render | ✅ | 🚫 | 🚫 |
| Mobile shell (`VideoWorkspaceMobileShell.tsx`) | 🚫 | ✅ | ◐ |

---

## 5. Image workspace — every tool & capability

Photoshop-class editor. Tool union `EditorTool` (`src/types/imageEditor.ts`) = **26 tools**.

### 5.1 Tools (26)
| Group | Tools |
|---|---|
| Navigate/transform | hand, move, crop, eyedropper |
| Selection | marquee (rect/ellipse), lasso (freehand/polygonal/magnetic), magicWand, pen |
| Paint | brush, eraser, backgroundEraser, magicEraser, paintBucket, gradientTool |
| Retouch | cloneStamp, spotHeal, blurBrush, sharpenBrush, smudgeBrush, dodgeBrush, burnBrush, spongeSaturate, spongeDesaturate |
| Vector/type | rectShape, ellipseShape, text |

### 5.2 Selections & masking
Selection modes: replace/add/subtract/intersect · **Quick Mask** (masked/selected view) · **Select &
Mask** room (preview onBlack/onWhite/blackWhite; output → selection/quickMask/layerMask/newAlphaChannel)
· saved selection channels · spot channels (`ImageSpotChannel`) · per-channel editing (rgb/red/green/blue).

### 5.3 Layers
Layer types (`LayerType`): image, mask, text, adjustment, vector, group · color labels (8) · locks ·
**16 blend modes** (`BlendMode`: normal, multiply, screen, overlay, darken, lighten, color-dodge,
color-burn, hard/soft-light, difference, exclusion, hue, saturation, color, luminosity) · opacity ·
transforms incl. corner-pin and **warp mesh** (`WarpMesh`, NxN control points).

### 5.4 Layer effects (9) — `LayerEffectKind`
stroke · drop shadow · inner shadow · outer glow · inner glow · color overlay · satin · pattern overlay
(checker/diagonal/dots/grid) · gradient overlay.

### 5.5 Non-destructive adjustment layers (8) — `AdjustmentLayerKind`
brightness/contrast · hue/saturation · black & white · invert · exposure · temperature/tint · levels ·
curves. (Also available as direct menu adjustments: `image:adjust-*`.)

### 5.6 Destructive filters (7) — `LayerFilterKind`
blur · sharpen · grayscale · sepia · invert · noise · pixelate.

### 5.7 Brush engine — `BrushSettings`
size, opacity, hardness, flow · pressure/tilt/rotation stylus dynamics · FG→BG color dynamics ·
**symmetry** (none/vertical/horizontal/four-way) · response curves (linear/soft/hard/s-shape or custom
points) · 3D tip preview. **Android:** volume keys = brush size by default (`androidBrushControls`);
draggable/collapsible quick control with size/opacity/hardness sliders.

### 5.8 Gradient & shape tools
Gradient modes: linear, radial, angle, reflected, diamond · color modes:
foreground→transparent / foreground→background / multi-stop · presets. Shape presets: rect, line,
triangle, diamond, polygon, star (`ShapeToolPresetKind`); full vector paths (`ImageVectorShape`:
rect/ellipse/path) with stroke/fill style.

### 5.9 Type, crop, artboards & color proofing
Text layers with OpenType features + **text-on-path** layout (`TextLayerPathLayout`) · crop presets +
guide overlays (thirds/grid) · **artboards** with page presets (US Letter/Legal/Tabloid/A4/A5/Comic) ·
**soft proofing**: RGB / grayscale-soft-proof / **CMYK-soft-proof** with rendering intents.

### 5.10 Model-in-the-loop AI (generative fill) — `ImageModelOperation`
text-to-image · image-edit · **mask-inpaint** · outpaint · erase · search-replace · search-recolor ·
remove-background · replace-background-relight · upscale · local-open-edit. Capabilities are gated
**per model** (`src/lib/imageProviderCapabilities.ts`) — e.g. only models that truly accept an alpha
mask expose mask-inpaint; Atlas source fields are resolved per-model
(`images`/`image`/`image_urls`). Providers: Gemini, OpenAI, Atlas, Hugging Face, BFL, Stability,
Local/Open, Android accelerator.

### 5.11 History, macros, export
Undo/redo history panel · quick-action macros (`ImageQuickActionMacro`) · panels (Tools, Brushes,
Layers, Channels, Paths, Properties, History, Assets) · export **visible → PNG** and **→ PSD**; save as
`.slimg`; results return to the Source Library.

---

## 6. Paper workspace — every tool & capability

InDesign-class layout + comics DTP. Tools `PaperTool` (`src/types/paper.ts`) = **16**; frames
`PaperFrameKind` = 8.

### 6.1 Tools (16)
select · hand · text · image · speech · thought · caption · panel · shape · line · ellipse · triangle ·
pentagon · hexagon · eyedropper · **gutterKnife** (split panels along gutters).

### 6.2 Pages & layout
Page presets (`PaperPagePreset`): custom, US Letter, US Legal, Tabloid, A4, A5, Square-8, Comic-book,
Manga-digest, Webtoon-panel · margins · multi-column with gutters · **document grid** + **baseline
grid** · rulers, guides, snap-to-guides/grid · **spreads** (reader spreads, start-on-right) · multi-page
documents.

### 6.3 Frames (8) — `PaperFrameKind`
text · image · document · speechBubble · thoughtBubble · caption · panel · shape.
Frames reshape into arbitrary polygons via control points (desktop **Ctrl** / Android **Volume Down**
held = vertex-edit modifier).

### 6.4 Text & typography
Threaded text flow across real columns/frames · **text wrap / runaround** (incl. SVG/free-form) ·
paragraph composition · baseline-grid alignment · OpenType features · hyphenation · drop caps ·
align (left/center/right/justify) + last-line align · numeric styles (oldstyle/lining/tabular) ·
vertical align · **paragraph / character / object styles** (`PaperStyleKind`) · **find/change** ·
**hyperlinks** · **tables** (`PaperTableSpec`) · auto page numbers.

### 6.5 Comics
Speech/thought bubbles with shapes (oval/organic/squircle/cloud), connector styles
(line/tail/thought-dots/**bridge** for same-speaker), connector anchors · captions · panels + gutter
knife · **Comic SFX Designer** (`comicSfxDesignerStore.ts`, `paperComicSfx.ts`).

### 6.6 Color & print production
Swatches incl. **CMYK + spot** (`PaperSwatch`) · backgrounds (solid/linear/radial gradient) ·
**print production** (`PaperPrintProductionSpec`): PDF standard (browser-pdf / **PDF/X-4** / **PDF/X-1a**),
output-intent ICC profiles (GRACoL, SWOP, PSO Coated/Uncoated FOGRA, custom), total-ink-limit, black
policy (warn-rich-black / force-100K-text / allow-rich-black), spot-color policy, **overprint preview** ·
**preflight** panel · DTP-parity panel.

### 6.7 Export formats (`paper:export-*` menu commands)
PDF · KDP assets · reader-spreads PDF · booklet-proof PDF · webcomic images · HTML · reader-spreads HTML
· booklet-proof HTML · **package for print** · **IDML** · stories (TXT/HTML/RTF/DOCX) · **CBZ** ·
JSON (+ import JSON). Print upscale via local browser / Stability / Vertex Imagen / Android accelerator
(`paperImageUpscale.ts`).

---

## 7. How the workspaces work together

```
                         ┌──────────────────────────┐
                         │     SOURCE LIBRARY        │  one shared, authoritative pool
                         │  (images, video, audio,   │  (main process on desktop; reconciled
                         │   envelopes, packages)    │   into every window/device)
                         └─────────────┬────────────┘
        generate/import   ▲   ▲   ▲    │ read/place    ▲
                          │   │   │    ▼               │
   ┌───────────┐   ┌──────┴──┐│┌──┴────────┐   ┌───────┴────┐
   │   FLOW    │──▶│  IMAGE  │││  VIDEO    │   │   PAPER    │
   │ graph/AI  │   │ raster  │││ timeline  │   │  layout    │
   └─────┬─────┘   └────┬────┘│└─────┬─────┘   └─────┬──────┘
         │ Image Editor │ .slimg     │ Composition    │ .slppr
         │ node ────────┘ doc        │ node ──────────┘ linked frames
         └──────────── all serialize into one .sloom ─────────────┘
```

- **Flow → everywhere:** Flow `Image`/`Video`/`Audio`/`Composition` nodes write results into the Source
  Library; `sourceBin` nodes read it back. The Flow `Image Editor` node (`advancedImageEditor`) embeds an
  Image-workspace document; the `Composition` node feeds the Video timeline.
- **Image ↔ Flow/Paper:** Image documents (`.slimg`) export to the Source Library; Paper places them as
  linked image frames; Flow can edit/regenerate them with model-in-the-loop AI.
- **Video ← Flow/Source:** the timeline assembles Source-Library media + Flow compositions; renders go
  back out as new sources.
- **Paper ← everything:** linked frames pull from the Source Library and stay live; print/KDP/HTML/CBZ
  export is the publishing endpoint.
- **One document:** all four serialize into the single `.sloom` project; per-project scratch holds the
  heavy media so the JSON stays portable.

---

## 8. Providers & models

Provider labels (`PROVIDER_LABELS`) and capability map (`CAPABILITY_PROVIDERS`) — `src/lib/providerCatalog.ts`:

| Capability | Providers |
|---|---|
| **Text** | Google Gemini · OpenAI/compatible · Hugging Face |
| **Image** | Gemini · OpenAI · **Atlas Cloud** · Hugging Face · Black Forest Labs · Stability AI · Local/Open · **Android Accelerator** |
| **Video** | Gemini (Veo) · Hugging Face · Atlas Cloud |
| **Audio** | Gemini · **ElevenLabs** · Hugging Face |

Live model lists are fetched per provider (the generated catalog ships empty and is populated at
runtime). Default models per provider are defined in `DEFAULT_MODELS`. Audio supports speech, sound
effect, and **voice change** modes (`AudioGenerationMode`). Vertex AI (Imagen/Gemini/Veo) runs through
the **desktop-only** Electron bridge with `gcloud` user login or ADC/service-account auth.

---

## 9. Desktop vs Android — capability matrix

| Area | Desktop (Electron) | Android (Capacitor) | Web |
|---|:---:|:---:|:---:|
| All 4 workspaces | ✅ | ◐ (Flow has no phone shell) | ✅ |
| Native Open/Save/Save-As dialogs | ✅ | ◐ (intents + download fallback) | 🚫 (download/upload) |
| Open `.sloom/.slimg/.slppr` from file manager | ◐ (assoc.) | ✅ (intents) | 🚫 |
| Multi-window workspaces | ✅ | 🚫 | 🚫 |
| Native FFmpeg render (CPU/VAAPI) | ✅ | 🚫 | 🚫 |
| Browser-FFmpeg render | ✅ | ✅ | ✅ |
| Vertex AI generation | ✅ | 🚫 | 🚫 |
| Provider calls (Gemini/OpenAI/Atlas/…) | ✅ | ✅ (CapacitorHttp) | ◐ (CORS-limited) |
| API-key encryption | ✅ safeStorage | ✅ WebCrypto | ✅ WebCrypto |
| LAN app server (serve app to desktop browser) | 🚫 | ✅ | 🚫 |
| On-device NPU/GPU upscaler | 🚫 | ✅ | 🚫 |
| Volume-key modifiers (brush size, Paper Ctrl) | n/a | ✅ | n/a |
| Stylus tilt/pressure/rotation | ✅ (pen tablets) | ✅ (S-Pen) | ◐ |
| Global menu + remappable shortcuts | ✅ | ◐ (HW kbd/DeX) | ◐ |
| Phone-adapted UI (collapsible toolbars, touch nav) | 🚫 | ✅ | ◐ |

---

## 10. Keyboard shortcuts (defaults)

Full remappable map in `src/lib/keyboardShortcuts.ts`. Highlights:

| Scope | Shortcut | Action |
|---|---|---|
| Workspace | `Ctrl/Cmd+1…4` | Flow / Video / Image / Paper |
| App | `Ctrl/Cmd+Z`, `Ctrl+Shift+Z`/`Ctrl+Y` | Undo / Redo |
| App | `F1` or `Shift+/` | Help · `Esc` close |
| Timeline | `V/S/H/M` | Select / Slip / Hand / Snap-marker |
| Timeline | `C` | Cut clip at playhead / cut mode |
| Timeline | `K`, `[`/`]` | Add keyframe, prev/next keyframe |
| Timeline | `←/→`, `Shift+←/→` | Scrub 0.1s / 1s |
| Image | `[`/`]`, `Shift+[`/`]` | Brush size / brush hardness |
| Image/Paper | tool hotkeys | Per-workspace; suppressed while typing in fields |

---

## Appendix — source-of-truth map

| Domain | Authoritative file(s) |
|---|---|
| Workspace switch | `src/types/flow.ts` (`WorkspaceView`) |
| Flow nodes | `src/types/flow.ts` (`FLOW_NODE_TYPES`), `src/lib/nodeCatalog.ts` |
| Menu/command surface | `src/lib/nativeApp.ts` (`NATIVE_MENU_COMMANDS`) |
| Image tools/layers/AI | `src/types/imageEditor.ts`, `src/lib/imageProviderCapabilities.ts` |
| Video/timeline | `src/lib/manualEditorState.ts`, `editorKeyframes.ts`, `videoPremiereParity.ts`, `src/store/editorStore.ts` |
| Paper | `src/types/paper.ts`, `src/features/paper/`, `src/lib/paper*.ts` |
| Providers | `src/lib/providerCatalog.ts`, `src/lib/imageProviderCapabilities.ts` |
| Desktop integration | `electron/main.mjs`, `electron/menu.cjs` |
| Android integration | `android/app/src/main/java/studio/sloom/signalloom/*.java`, `android/app/src/main/AndroidManifest.xml`, `capacitor.config.ts` |
