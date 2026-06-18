# 6. Image workspace

**Image** is a layered image editor — the place to paint, retouch, mask, and do model-in-the-loop
editing on stills. If you've used Photoshop, GIMP, Krita, or Procreate, the model will feel
familiar: a stack of **layers**, **masks**, a **brush engine**, **adjustments**, and **tools**
down the side.

A single Image document can be saved on its own as a `.slimg` file (**File → Save As…**) or kept
as part of the larger `.sloom` project.

## Layers, masks, and channels

- **Layers** stack from bottom to top with per-layer opacity and blend modes. Reorder, group,
  link, and toggle visibility from the **Layers** panel.
- **Layer masks** hide or reveal parts of a layer non-destructively — paint the mask in
  black/white to carve a shape without touching the pixels.
- **Channels** and a **Paths** tab live alongside Layers for finer selection and vector work.
- **Selections** — marquee, lasso, and magic-wand style tools — constrain painting and edits to a
  region; invert, deselect, and select-all are on the **Select** menu.

## The brush engine

The brush is a full pressure/tilt engine designed to feel like a natural-media tool, not a
hard-edged stamp. Brush properties live in the **Brushes** / brush-properties panel.

**Dynamics — pen pressure and tilt drive the brush:**

- **Pressure → size, opacity, flow, roundness, and hardness.** Press harder for a bigger, more
  opaque, harder-edged mark; ease off for a fine, soft one.
- **Pressure response curve.** Shape *how* pressure maps — choose **Linear**, **Soft** (light
  pressure does little, for delicate build-up), **Hard** (light pressure already lays down, for
  inking), or **S-Curve**. This is the Krita-style "pressure curve."
- **Tilt → angle, roundness, size, opacity, and flow.** Lay the pen over and the tip flattens,
  grows, and lightens — the way a tilted pencil or charcoal stick shades. Barrel rotation can
  steer the tip.

**Jitter (randomization) — for organic, natural-media strokes:**

- Per-dab **Size**, **Opacity**, **Flow**, **Roundness**, and **Angle** jitter add controlled
  randomness so strokes don't look mechanically uniform (Photoshop's "Shape/Transfer Dynamics").
  The randomness is seeded, so a stroke is reproducible.

**Paint behaviour:**

- **Mixer / color-smudge** brushes pick up and blend the colours they pass over — paint *into*
  what's already there. Choose **RGB** mixing or **Spectral** (Kubelka–Munk) pigment mixing, where
  blue + yellow makes green like real paint. **Smearing** vs **Dulling** controls how the brush
  drags colour.
- **Dry-brush / taper** dynamics let a stroke fade in, taper off, and deplete its "paint load"
  over distance — for dry-media and calligraphic strokes.
- Foreground→background **colour dynamics** can shift colour by pressure or tilt.

**Presets.** Pencil, Marker, Charcoal, Texture Stipple, Wet Mixer, Spectral Mixer, Dry Bristle and
more come built in; you can save your own.

## Retouch & finishing tools

Alongside the brush there are dedicated retouch tools, each with its own options:

- **Clone Stamp** (aligned/sampled, choose the sample source layer).
- **Blur** and **Sharpen** brushes with selectable sample modes.
- **Smudge** (finishing) brush.
- **Dodge / Burn** with tonal-range targeting and tone protection.
- **Sponge** (saturate / desaturate) with vibrance and luminosity preservation.

## Adjustments

The **Image → Adjustments** menu opens non-destructive, dockable adjustment dialogs:
Brightness/Contrast, **Levels** (`Ctrl+L`), **Curves** (`Ctrl+M`), **Hue/Saturation** (`Ctrl+U`),
Exposure, Color Temperature, Black & White, and Invert.

## Model-in-the-loop editing *(needs a provider key)*

Image isn't only manual editing — generative models work *inside* the layer stack:

- **Generative fill** — mask a region and let an image model fill or replace it.
- **Reference-guided** image models use a reference image to steer the edit.

Because capabilities follow the model, the editor routes a masked, reference-guided edit to the
model's native edit endpoint and shows only the controls that model supports.

## Tools, transforms, and export

- **Move**, **Hand**, **Crop**, **Eyedropper**, **Text**, and **Shape** tools are on the tool
  palette and the **Tools** menu.
- **Transforms** include free transform and an interactive **warp mesh** (an N×N control-point
  grid you drag to bend the image).
- **Export** the visible image to standard formats, or **Download PSD** to hand layers to another
  editor. Save the editable document as `.slimg`.

---

Next: [Video workspace →](07-video.md)
