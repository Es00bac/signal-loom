# Signal Loom Project Documentation

Signal Loom is a multi-app AI media suite that runs as a browser app and as an Electron desktop app. It shares one project format and one Source Library across all workspaces so generated and imported assets remain usable without duplicate imports.

## Architecture Snapshot

- **Project format**: `.sloom` (JSON-backed project documents), with optional project scratch directories for local media.
- **Active workspaces**: `Flow`, `Video`, `Image`, `Paper`.
- **Desktop/runtime integrations**: Native file dialogs, native workspace-window launch, and optional native menu commands from Electron.
- **Cross-workspace source flow**: Media and envelopes written to the Source Library are synchronized between all workspaces. Flow executions, imported images, editor outputs, and Paper assets stay discoverable without manual re-linking.

## Workspace Suite

### Flow Workspace

Build prompt chains and multimodal pipelines. Flow is the graph composer and orchestration center.

What Flow handles:

- Text, image, video, audio, settings, source-bin, composition, and control nodes.
- Generation chaining with provider-specific model settings.
- Source-bin placement and envelope creation for downstream apps.
- Node-level cost estimation and execution telemetry.
- Flow multi-workspace support, with workspace-scoped snapshots and source-bin syncing.

### Video Workspace

Assemble and polish timeline output.

What Video handles:

- Visual and audio timeline lanes.
- Source and program monitor control.
- Clip trimming, cut/split operations, keyframes, transforms, crops, filters, and transitions.
- Audio volume/level keyframing and stage-object composition.
- Project-ready render controls, backend selection, and output preferences.

### Image Workspace

Create and edit raster documents with direct layer-style controls.

What Image handles:

- Document-level layer operations, brush and selection tooling.
- Masks and region-based edits.
- Provider-assisted image operations and in-editor generation/switchable operations.
- Export and save flows that return assets to the shared Source Library.
- Reusable history and source-bin friendly image-document lifecycle.

### Paper Workspace

Design page-based content and prepare print/export assets.

What Paper handles:

- Page creation, rulers, guides, grid/snap controls, and spread/document controls.
- Text and speech/thought bubble workflows.
- Image frame placement and linked asset workflows from Source Library.
- PDF/Webcomic export and DTP-oriented output presets.
- Export/flattening and book-style production paths.

## Typical Workflow

1. **Create or open a project**
   - Use `File > New Project` or `File > Open`.
   - In Electron, native `.sloom` projects are opened through the native project bridge.
2. **Move between workspaces**
   - Use the topbar workspace controls or `View` menu to jump between Flow, Video, Image, and Paper.
   - Project state, workspace snapshots, and Source Library entries remain connected.
3. **Generate and import assets**
   - Use Flow nodes or Image/Paper actions to generate media.
   - Import local files from OS file manager or drag/drop into supported targets.
4. **Compose finished output**
   - Finalize layout and keyframe edits in Video.
   - Finish page composition in Paper.
   - Export in your target format from the active workspace.

## Feature Notes

### Source Library

The Source Library is intentionally shared: generated content from Flow/Image/Paper, manually imported media, and exported outputs are visible in all workspaces.

### Keyboard behavior

- Workspace-specific shortcuts resolve to the active app (for example, paper and image tools only act in their matching workspaces).
- Generic project/edit commands are available across all workspaces via menu and command routes.

## Keyboard Shortcuts

- `Left / Right`: scrub by 0.1 seconds.
- `Shift + Left / Right`: scrub by whole seconds.
- `C`: cut selected visual clip at the playhead when possible, otherwise enter cut mode.
- `V`: select tool.
- `S`: slip tool.
- `H`: hand tool.
- `M`: snap marker tool.
- `K`: add or update a keyframe.
- `[ / ]`: jump to previous or next keyframe.
- `Delete / Backspace`: remove selected clip, layer, or object.
- `Ctrl/Cmd + Z`: undo.
- `Ctrl/Cmd + Shift + Z` or `Ctrl + Y`: redo.
- `F1` or `Shift + /`: open help.
- `Esc`: close help and context menus.

## Native Desktop Notes

The Electron launcher uses `electron/launcher.cjs`. On KDE Wayland it starts Electron through XWayland with the appmenu environment needed for Plasma globalmenu integration. Set `SIGNAL_LOOM_ELECTRON_NATIVE_WAYLAND=1` only if native Wayland is more important than Plasma globalmenu support.

Native project files use the `.sloom` extension even though the contents are JSON. Opening a `.sloom` project reconnects the matching per-project scratch directory before restoring source-bin media. Legacy `.signal-loom.json` and `.json` files can still be opened.
