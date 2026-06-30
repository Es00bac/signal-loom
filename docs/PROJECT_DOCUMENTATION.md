# Signal Loom Project Documentation

Signal Loom is a four-workspace generative-media suite from one codebase, running as an **Electron
desktop app**, an **Android/DeX app** (Capacitor), and a plain **browser app**. All workspaces share
one project document (`.sloom`) and one Source Library, so any asset generated or imported anywhere is
reusable everywhere without re-importing.

> **Exhaustive, code-audited reference:** see [`FEATURE_BREAKDOWN.md`](./FEATURE_BREAKDOWN.md) — every
> node, tool, capability, provider, and Desktop/Android availability, each traced to its source file.
> This page is the orientation summary; the breakdown is the complete inventory.

## Architecture snapshot

- **Project format**: `.sloom` (JSON), plus per-document `.slimg` (Image) and `.slppr` (Paper), with
  optional per-project scratch directories for heavy media.
- **Workspaces** (`WorkspaceView`): `Flow`, `Video` (internal id `editor`), `Image`, `Paper`.
- **Desktop integrations**: native file dialogs, multi-window launch, native FFmpeg render
  (CPU + AMD VAAPI), Vertex AI bridge, OS-keychain key encryption, global menu.
- **Android integrations**: file-manager open intents, volume-key modifiers, on-device LAN app server,
  on-device NPU/GPU upscaler, CapacitorHttp native provider calls.
- **Cross-workspace flow**: media/envelopes in the Source Library are synchronized across all
  workspaces and windows; Flow executions, image edits, editor renders, and Paper assets stay
  discoverable without manual re-linking.

## Workspace suite

### Flow workspace — orchestration graph
A node graph (`@xyflow/react`) of **60 node types** across 10 categories (`src/lib/nodeCatalog.ts`):
Generate (Image/Video/Audio/Composition), Inputs & Data, Lists & Envelopes, Flow Control, Logic & Math
(JS/Python/SQL/regex/JSON/HTTP/CSV/XML-YAML/math), Text Tools, Story Tools, Reuse & Layout
(functions/groups/portals/aliases), Monitor & Debug, and Settings. Provider-specific model settings,
per-node cost estimation + execution telemetry, function transform language, and multi-workspace
source-bin syncing.

### Video workspace — multitrack timeline
Source + program monitors; visual lane plus up to 4 audio tracks; trim/cut/slip/ripple/snap; transitions
(fade/slides), per-clip filters (8), text effects, stage objects with blend modes; keyframe animation of
transform/opacity/crop and audio volume; **10 render presets** (H.264/HEVC/ProRes/VP9/GIF/PNG-JPEG
sequences) over auto → AMD-VAAPI → native-CPU → browser-FFmpeg backends.

### Image workspace — raster editor
**26 tools** (selection, paint, retouch, vector, type); selection modes + Quick Mask + Select & Mask;
layers with **16 blend modes**, **9 layer effects**, **8 non-destructive adjustment layers**, **7
filters**; full brush engine (pressure/tilt/rotation, symmetry, response curves); gradients and vector
shapes; artboards + CMYK soft-proofing; **model-in-the-loop AI** (text-to-image, edit, mask-inpaint,
outpaint, erase, search-replace/recolor, remove-background, relight, upscale) gated per model; export to
PNG/PSD and `.slimg`.

### Paper workspace — page layout & comics DTP
**16 tools**, **8 frame kinds**; page presets (Letter→Webtoon), columns, document + baseline grids,
guides/snap, spreads; threaded text with runaround, OpenType, hyphenation, drop caps, paragraph/
character/object styles, find/change, hyperlinks, tables; comic bubbles (shapes + same-speaker bridge),
captions, panels, gutter knife, Comic SFX Designer; CMYK/spot swatches and **PDF/X-4 / X-1a** print
production with ICC output intents, ink limits, overprint preview, preflight; export to PDF, KDP,
reader-spreads, booklet, webcomic, HTML, IDML, CBZ, stories (TXT/HTML/RTF/DOCX), and JSON.

## Providers

| Capability | Providers |
|---|---|
| Text | Google Gemini · OpenAI/compatible · Hugging Face |
| Image | Gemini · OpenAI · Atlas Cloud · Hugging Face · Black Forest Labs · Stability AI · Local/Open · Android Accelerator |
| Video | Gemini (Veo) · Hugging Face · Atlas Cloud |
| Audio | Gemini · ElevenLabs · Hugging Face (speech, sound-effect, voice-change) |

Model lists are fetched live per provider; defaults live in `DEFAULT_MODELS`
(`src/lib/providerCatalog.ts`). Vertex AI (Imagen/Gemini/Veo) is desktop-only via the Electron bridge.

## Typical workflow

1. **Create or open** a project (`File > New`/`Open`; Electron uses the native `.sloom` bridge, which
   reconnects the per-project scratch directory before restoring source-bin media).
2. **Move between workspaces** via the top bar or `Ctrl+1…4`; project state, snapshots, and Source
   Library stay connected.
3. **Generate / import** with Flow nodes or Image/Paper actions; import from the OS file manager or
   drag-and-drop.
4. **Finish & export** — timeline render in Video, page output in Paper, PNG/PSD in Image; outputs
   return to the Source Library.

## Keyboard shortcuts (defaults)

Remappable map in `src/lib/keyboardShortcuts.ts`. Common: `Ctrl+1…4` workspaces · `Ctrl+Z`/`Ctrl+Shift+Z`
undo/redo · `F1` help. Timeline: `V/S/H/M` tools, `C` cut, `K` keyframe, `[`/`]` prev/next keyframe,
`←/→` scrub. Image: `[`/`]` brush size, `Shift+[`/`]` hardness. Tool hotkeys are suppressed while typing
in fields.

## Native desktop notes

The Electron launcher is `electron/launcher.cjs`. On KDE Wayland it starts through XWayland for Plasma
globalmenu integration; set `SIGNAL_LOOM_ELECTRON_NATIVE_WAYLAND=1` to prefer native Wayland instead.
`.sloom` files are JSON; legacy `.signal-loom.json`/`.json` still open.

## Android notes

The app registers three native plugins (`MainActivity.java`): immersive system UI + volume-key
interception, a NanoHTTPD LAN app server (serve the app to a desktop browser), and an on-device NPU/GPU
upscaler. `.sloom/.slimg/.slppr` open via file-manager VIEW intents; provider calls use CapacitorHttp to
bypass WebView CORS. Volume keys act as brush-size control (Image) and a Ctrl-equivalent reshape
modifier (Paper).
