# 7. Video workspace

**Video** is a multi-track timeline editor for sequencing clips, overlays, and audio into a
finished piece. Clips generated in Flow or edited in Image are already in your source library, so
editing is mostly arranging and timing — no importing between tools.

## The timeline

The bottom of the workspace is a **multi-track timeline**. Each track holds clips laid out in
time; stack tracks to composite video over video and mix audio.

- **Add clips** by dragging from the **Source Bin** onto a track.
- **Trim** by dragging clip edges; **move** clips along and between tracks.
- **Snapping** aligns clip edges to each other and to the playhead so cuts land cleanly.
- The **playhead** scrubs the composition; the preview above shows the current frame.

## Tracks and layers

- **Video tracks** composite top-over-bottom, so an overlay on an upper track sits above the clip
  below it.
- **Audio tracks** mix together; set per-clip **volume**.
- **Text** and **shape** overlays are first-class clips you place on a track and time like any
  other.

## Animation with keyframes

Clip properties animate over time with **keyframes**:

- **Transform** — position, scale, and rotation animate, so you can pan, push in, or move an
  overlay across the frame.
- **Opacity** fades clips in and out.
- **Crop** trims the visible area and can animate.

Set a keyframe at one point in time, change the value at another, and Signal Loom interpolates
between them.

## Generating clips *(needs a provider key)*

Video clips themselves usually come from **Flow** — text-to-video or image-to-video nodes,
including providers (such as Veo, Seedance, and Wan via Atlas Cloud or Vertex) that generate
asynchronously. Generate in Flow, then sequence the result here. Everything stays in the one
project.

## Export

Render the composition out to a standard video file. The render path is built to run the same way
on desktop and on Android/DeX.

---

Next: [Paper workspace →](08-paper.md)
