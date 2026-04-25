# Signal Loom Project Documentation

Signal Loom is a node-based generative AI media studio with a timeline editor for assembling, animating, and rendering multimedia projects. It runs as both a browser/Vite app and an Electron desktop app. The Electron path adds native file dialogs, KDE Plasma globalmenu integration, and local filesystem workflows while keeping the web build available for remote access.

## Workspaces

### Flow Workspace

Use the Flow workspace to build media-generation graphs. Nodes can create or import text, images, video, audio, settings, source-bin entries, compositions, and aliases. The source bin is the bridge between generated/imported media and the editor timeline.

### Editor Workspace

Use the Editor workspace for manual post-production. It includes source/program monitors, source-bin and editor-assets tabs, visual/audio timeline lanes, clip inspectors, keyframes, crop/filter controls, and render controls.

## Tutorial

### 1. Create or Open a Project

1. Use `File > New Project` or `File > Open`.
2. In Electron, save native projects as `.sloom` files. Each project automatically uses a sibling `*.signal-loom-scratch` folder for source-bin media.
3. Use `File > Set Scratch Folder` only when you need a temporary scratch location before the project has its own `.sloom` file.
4. Switch to the Editor workspace from the titlebar or `View > Editor Workspace`.

### 2. Add Media

1. Import images, video, or audio into the source bin.
2. Create text or shape editor assets from the editor-assets tab.
3. Drag source-bin items into visual or audio lanes.

### 3. Edit the Timeline

1. Select a clip.
2. Move the red playhead to the desired cut point.
3. Press `C`, choose `Timeline > Cut Tool`, or click `Cut` to split the selected visual clip at the playhead.
4. Drag clip edges to trim non-destructively.
5. Hold `Shift` while scrubbing, cutting, snapping, or trimming to use whole-second steps.

### 4. Animate and Finish

1. Select a visual or audio clip.
2. Move the playhead and press `K` or click `Add Key`.
3. Adjust transform, opacity, crop, filters, or volume.
4. Jump between keyframes with `[` and `]`.
5. Render when the program monitor matches the intended output.

## Feature Help

### Timeline Tools

- `Select`: move and select clips.
- `Cut`: split the selected visual clip at the playhead; clicking a visual clip in cut mode also cuts at the playhead.
- `Slip`: shift source content inside a timed clip without moving the clip itself.
- `Hand`: pan the timeline viewport.
- `Snap`: add snap points from the time ruler.

### Text and Shapes

- Text assets behave like natural text-sized layers, not visible rectangles.
- Shape assets are separate timeline-backed rectangle layers.
- Right-click text assets or text clips to edit wording, font, color, size, and effects.

### Crop, Filters, and Transforms

- Crop is non-destructive and affects preview/render only.
- Pan and rotate media inside the crop boundary without changing source media.
- Clips can use filters, blend modes, opacity, and keyframed transform animation.

### Audio

- Audio lanes support clip volume, per-track volume, waveform previews, and volume keyframes.
- Video assets can be placed on audio lanes when their audio needs separate timing.

### Gaps and Snapping

- Cutting leaves gaps in place.
- Select a gap and right-click it to fill that gap.
- Hold `Shift` during timeline operations to snap to whole seconds.

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
- `Delete / Backspace`: remove selected clip or stage object.
- `Ctrl/Cmd + Z`: undo.
- `Ctrl/Cmd + Shift + Z` or `Ctrl + Y`: redo.
- `F1` or `Shift + /`: open help.
- `Esc`: close help and context menus.

## Native Desktop Notes

The Electron launcher uses `electron/launcher.cjs`. On KDE Wayland it starts Electron through XWayland with the appmenu environment needed for Plasma globalmenu integration. Set `SIGNAL_LOOM_ELECTRON_NATIVE_WAYLAND=1` only if native Wayland is more important than Plasma globalmenu support.

Native project files use the `.sloom` extension even though the contents are JSON. Opening a `.sloom` project reconnects the matching per-project scratch directory before restoring source-bin media. Legacy `.signal-loom.json` and `.json` files can still be opened.
