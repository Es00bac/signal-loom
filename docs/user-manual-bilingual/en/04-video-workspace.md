# Video Workspace

The Video workspace is a non-linear editor for assembling compositions from source media. It combines a Source Bin, Source Monitor, Program Monitor, multi-track timeline, inspector, effects, keyframes, captions, and export presets. The workspace is designed for short-form social content, review cuts, archival masters, and motion graphics that include text, shapes, and comic elements.

This chapter explains compositions, monitors, timeline editing, effects, audio, sequence settings, render/export, captions, FCP XML, and the mobile layout.

## Dockable Panels

The Video workspace uses dockable panels that persist their layout per project:

| Panel | Purpose |
|-------|---------|
| Project Source Bin | Browse and import media for the current project. |
| Source Monitor | Preview a source clip and mark in/out points. |
| Program Monitor | View the current frame of the edited sequence. |
| Inspector | Edit properties of the selected clip, track, or effect. |
| Timeline | Arrange clips on tracks. |
| Premiere Parity | Check compatibility with Premiere Pro features. |
| Sequence Settings | Set aspect ratio, resolution, and frame rate. |
| Export Preset | Choose and configure render presets. |
| Diagnostics | Report timeline errors, missing media, and parity issues. |

Drag panels by their headers to rearrange, dock, or float them. Choose **View > Layout Defaults** to reset the layout.

## Compositions

A composition is the top-level video project inside the Video workspace. It contains tracks, clips, effects, and sequence settings. A project can have multiple compositions.

### Create Composition

To create a new composition:

1. Click **New Composition** in the workspace menu or Source Bin.
2. Choose a starter sequence preset, or start blank.
3. Name the composition.

### Starter Sequence

Starter sequences create common setups automatically, such as:

- Social vertical 9:16 with title safe overlays.
- Review 16:9 with two video tracks and one audio track.
- Blank timeline with default tracks.

### History

The Video workspace keeps up to 80 history entries. Use `Ctrl+Z` / `Cmd+Z` to undo and `Ctrl+Y` / `Cmd+Shift+Z` to redo. The history is scoped to the Video workspace; undo does not affect Flow or Paper edits.

## Source Bin

The Source Bin in the Video workspace shows media available for editing. It supports:

- **Media Import** — Add video, audio, image, and subtitle files.
- **Kind Filters** — Show only video, audio, images, or sequences.
- **Search** — Filter by name, tag, or metadata.
- **Star / Collapse** — Mark favorites and collapse groups.
- **Editor Assets** — Pre-made titles, shapes, and transitions.
- **Paper Storyboard Import** — Import storyboard frames from the Paper workspace.

Right-click a source for actions such as Preview, Place, Add to Track, and Locate in Source Library.

## Source Monitor

The Source Monitor previews individual source clips before they are added to the timeline.

### Mark In/Out

- Press `I` to set the **In** point.
- Press `O` to set the **Out** point.
- Drag the In/Out handles on the scrubber.
- Press `Alt+I` / `Alt+O` to clear In/Out.

### Insert and Overwrite

After marking In/Out:

- Press `,` (comma) to **Insert** the clip at the playhead, pushing later clips to the right.
- Press `.` (period) to **Overwrite** the clip at the playhead, replacing whatever is there.
- Click **Add to Track** to place the clip on the targeted track without changing the playhead position.

## Program Monitor and Stage

The Program Monitor shows the current frame of the timeline. It has two modes:

- **Stage** — Shows interactive transform handles, clip boundaries, and stage objects.
- **Rendered** — Shows the final rendered output, useful for previewing effects and composites.

### Interactive Clip Transform

In Stage mode, select a clip to show transform handles. You can:

- Drag to move.
- Drag corners to scale.
- Drag outside the bounding box to rotate.
- Hold `Shift` to constrain proportions.
- Hold `Alt` to transform from the center.

### Comic Tail Drag

Clips that contain comic speech or thought bubbles show a tail handle. Drag the tail to point at a character or object in the frame.

### Stage Objects

Stage objects are overlays such as text, shapes, and comic panels. They behave like clips but are created inside the Video workspace rather than imported. Select a stage object to edit its content in the Inspector.

### Fit Modes

Use fit modes to control how the sequence frame is displayed:

- **Fit** — Scale to fit entirely in the monitor.
- **Fill** — Scale to fill the monitor, cropping edges if needed.
- **100%** — Show pixels 1:1.

### Quick Controls

Quick controls appear near the Program Monitor for common actions:

- Play / Pause
- Step frame backward / forward
- Mark In / Out
- Toggle stage overlays
- Snapshot current frame

## Timeline Tools

The timeline toolbar contains editing tools:

| Tool | Shortcut | Purpose |
|------|----------|---------|
| Select | `V` | Select and move clips. |
| Cut / Razor | `C` | Split a clip at the playhead. |
| Slip | `Y` | Change a clip's In/Out without changing its timeline duration. |
| Hand | `H` | Pan the timeline view. |
| Snap | `S` toggle | Snap clips and playhead to edges and markers. |

## Tracks

The timeline has:

- **4 visual tracks** for video, images, text, shapes, and effects.
- **4 audio tracks** for audio clips and narration.

Tracks can be:

- **Locked** — Prevent accidental edits.
- **Collapsed** — Hide track details to save space.
- **Resized** — Drag the track border to change height.
- **Targeted** — The target track receives inserts and overwrites from the Source Monitor.

### Overlay Track

One visual track can be designated as the overlay track. Overlay clips composite on top using blend modes and alpha channels. Use it for logos, lower thirds, and comic speech bubbles.

## Editing Operations

### Drag and Drop

Drag a source from the Source Bin onto a track. Drop it at the desired time position. Hold `Alt` while dragging to duplicate.

### Move and Trim

- Drag a clip to move it in time or to another track.
- Drag the left or right edge to trim the In or Out point.
- Hold `Shift` while trimming to ripple trims.

### Split

Place the playhead where you want to split and press `C` or click the Cut tool. The clip is divided into two independent clips.

### Ripple Trim

Ripple trim adjusts the timeline duration automatically.

- Press `Q` to ripple trim the start of a clip to the playhead.
- Press `W` to ripple trim the end of a clip to the playhead.

### Roll Edit

Press `E` to enter roll edit mode. Roll edit adjusts the boundary between two adjacent clips without changing the total duration.

### Slip Edit

With the Slip tool (`Y`), drag a clip to change which portion of the source it shows without changing its position or duration on the timeline.

### Fill Gap

Right-click an empty space between clips and choose **Fill Gap** to close it by moving later clips left.

### Snapping

Toggle snapping with `S`. When snapping is on, the playhead, clip edges, and markers snap to each other. Snap sensitivity can be adjusted in settings.

### Markers

Add markers to the timeline with `M`. Markers can have names and colors. They are useful for notes, chapter points, and sync references.

### Timeline Zoom

Zoom the timeline horizontally with `+` and `-` or by scrolling with `Ctrl` held. Zoom vertically by resizing individual tracks.

## Transport and JKL Shuttle

Transport controls move the playhead and preview the timeline.

| Key | Action |
|-----|--------|
| `Space` | Play / Pause |
| `J` | Shuttle reverse (press repeatedly to speed up) |
| `K` | Stop shuttle |
| `L` | Shuttle forward (press repeatedly to speed up) |
| `Left Arrow` | Step one frame backward |
| `Right Arrow` | Step one frame forward |
| `Home` | Go to start |
| `End` | Go to end |

Press `K` while holding `J` or `L` to slow shuttle to one speed step.

### Opacity and Volume Nudge

With a clip selected:

- `Ctrl+Shift+Up` / `Ctrl+Shift+Down` nudges opacity for visual clips.
- `Ctrl+Shift+Left` / `Ctrl+Shift+Right` nudges volume for audio clips.
- Hold `Alt` for smaller nudge increments.

## Keyframes and Animation

Many properties can be animated with keyframes:

- Position, scale, rotation, opacity.
- Effect parameters.
- Audio volume and pan.

To add a keyframe:

1. Move the playhead to the desired time.
2. In the Inspector, click the diamond next to the property.
3. Change the property value.
4. Move the playhead and repeat.

Keyframes can be linear, eased, or stepped. Drag keyframes in the timeline to adjust timing.

## Effects

The Inspector contains an Effects section for the selected clip.

### Clip Filters

Clip filters apply image adjustments such as:

- Brightness / Contrast
- Saturation
- Hue rotation
- Blur and sharpen
- Color grading LUTs

### Crop

The Crop effect removes edges of a clip. It can be animated with keyframes for reveal effects.

### Chroma Key

The Chroma Key effect removes a color background, typically green or blue. Adjust tolerance, edge softness, and spill suppression in the Inspector.

### Stroke and Outline

Add a border around a clip, text, or shape. Set color, width, and corner style.

### Blend Modes

Blend modes control how a clip composites with tracks below. Common modes include Normal, Multiply, Screen, Overlay, Soft Light, and Difference.

### Transitions

Place transitions between adjacent clips on the same track. Available transitions include:

- Cross dissolve
- Dip to color
- Wipe
- Slide
- Fade to black

Drag a transition from the Source Bin or Effects panel onto a cut point.

### Flip

Flip a clip horizontally or vertically. Useful for correcting mirrored footage or creating reflections.

## Text, Shapes, and Comics

### Text

Add text from the toolbar or Source Bin. Edit content directly on the Program Monitor or in the Inspector. Options include:

- Font family, size, weight.
- Fill, stroke, shadow.
- Alignment and tracking.
- Text animation presets.

### Shapes

Add rectangles, ellipses, polygons, and lines. Shapes can be filled, stroked, animated, and converted to masks.

### Comics

Comic tools include:

- **Panels** — Divide the frame into comic panels.
- **Speech bubbles** — Add dialogue with draggable tails.
- **Thought bubbles** — Add cloud-shaped bubbles.
- **SFX decals** — Pre-made sound effect graphics.
- **Captions** — Subtitle-style text overlays.

Comic elements are stage objects and can be animated like other clips.

## Audio

### Audio Clips

Drag audio files onto audio tracks. The timeline shows waveforms when zoomed in enough.

### Track Volume

Adjust overall track volume with the fader on the track header. Track volume can also be automated with keyframes.

### Volume Keyframes

Select an audio clip and add volume keyframes in the Inspector or by clicking the volume line in the timeline.

### Fade and Crossfade

- **Fade In / Fade Out** — Add from the clip context menu or by dragging fade handles.
- **Crossfade** — Overlap two audio clips and apply a crossfade transition.

### Waveform Display

Toggle waveform display per track. Waveform resolution depends on zoom level.

### Narration Generation

Generate narration from text using the narration tool:

1. Select an audio track.
2. Choose **Generate Narration** from the track menu.
3. Enter the text and choose a voice.
4. The generated audio clip appears on the track.

Narration uses the configured ElevenLabs or system TTS provider.

## Sequence Settings

Sequence settings define the frame size and timing of the composition.

| Setting | Options |
|---------|---------|
| Aspect ratio | 16:9, 9:16, 1:1, custom |
| Resolution | 720p, 1080p, 4K, custom |
| Frame rate | 24, 25, 30, 60 fps |
| Pixel aspect | Square, anamorphic |
| Audio sample rate | 44.1 kHz, 48 kHz |

Choose a starter sequence to set these automatically, or open **Sequence Settings** to change them later. Changing sequence settings after editing may scale or crop existing clips.

## Render and Export

Open the Export panel from **File > Export** or the workspace toolbar.

### Export Presets

| Preset | Best For |
|--------|----------|
| Review H.264 | Quick sharing and review. |
| Social Vertical | 9:16 content for short-form platforms. |
| Archive | Lossless or high-bitrate master. |
| WebM VP9 | Web playback and open-source workflows. |
| GIF | Short looping animations. |
| ProRes | Professional post-production exchange. |
| HEVC | Efficient high-quality delivery. |
| PNG/JPEG Sequence | Frame-level output for compositing. |

### Render Backends

Sloom Studio supports multiple render backends:

- **CPU** — Compatible everywhere, slower for complex effects.
- **WebGL** — Faster for GPU-accelerated effects.
- **Native** — Uses OS media frameworks when available.

Choose the backend in the Export panel or settings.

### Incremental Cache

Rendered frames are cached incrementally. If you change only part of the timeline, only affected frames rerender. The cache can be cleared from the Export panel.

### Readiness Check

Before rendering, Sloom Studio checks for:

- Missing media.
- Offline effects.
- Sequence setting mismatches.
- License gating for certain formats.

Fix any warnings to avoid failed exports.

### Save Preview

The **Save Preview** button renders a low-resolution preview for quick review without running a full export.

## Captions

### Import Captions

Import SRT or WebVTT files into the timeline. Captions appear as clip-like objects on a caption track.

### Edit Captions

Double-click a caption to edit its text and timing. The Inspector shows start time, end time, and style.

### Export Captions

Export captions as SRT or WebVTT from **File > Export > Captions**.

## FCP7 XML Export

Sloom Studio can export a Final Cut Pro 7 XML file for interchange with other editors. The export includes:

- Clips and edits.
- Track structure.
- Markers.
- Basic transitions.

Some effects and generative content may not translate exactly. Use the **Premiere Parity** panel to review compatibility before exporting.

## Diagnostics and Parity Panels

The Diagnostics panel reports timeline problems. The Premiere Parity panel compares your timeline against Premiere Pro capabilities and warns about unsupported features.

Common issues include:

- Missing source media.
- Unsupported codecs.
- Effects that will not export to FCP7 XML.
- Frame rate mismatches.

## Mobile Layout

On Android and narrow windows, the Video workspace adapts:

- Panels become bottom sheets.
- Timeline tracks are taller for touch.
- JKL shuttle is replaced by on-screen transport buttons.
- Precision edits use long-press menus.

Some advanced docking and floating panel features are limited on mobile.

## Best Practices

- Set sequence settings before editing to avoid scaling surprises.
- Use markers to organize long timelines.
- Lock tracks you are not editing.
- Preview often with the Rendered mode to catch effect problems early.
- Use incremental cache to speed up repeat exports.
- Export a review cut before the final render.
