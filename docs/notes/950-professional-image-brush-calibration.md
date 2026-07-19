# 950 — Professional Image brush calibration

Date: 2026-07-18

## Outcome

The Image workspace now ships 173 built-in brush presets: 29 core tools plus 144 media-specific tools in 16 collapsible families. The library is approximately six times the original core set. Every preset was reviewed against the dynamics the Sloom engine actually implements and rendered through the real dab engine in both a pressure/velocity ramp and a Wacom-style tilt/twist ramp.

The generated proof sheets are outside the repository at:

`/mnt/d/Sloom-Studio-artifacts/brush-calibration/`

There are 22 sheets covering every built-in group and every one of the 173 presets.

## Reference method

This calibration used behavior and preset construction patterns from the open-source Krita and MyPaint projects as references, without copying their source or brush assets into Sloom Studio.

Primary references:

- Krita brush preset and sensor documentation: <https://docs.krita.org/en/reference_manual/brushes/brush_settings.html>
- Krita MyPaint brush-engine documentation: <https://docs.krita.org/en/reference_manual/brushes/brush_engines/mypaint_engine.html>
- Krita brush-tip resource documentation: <https://docs.krita.org/en/reference_manual/resource_management/resource_brushtips.html>
- MyPaint's installed 2.0 default `.myb` presets in `/usr/share/mypaint-data/2.0/brushes`
- Krita's official default-resource bundle, retained only as a reference under `/mnt/d/Sloom-Studio-reference/brush-calibration-2026-07-18/`

The important relationships were translated to Sloom's engine semantics instead of transcribing raw values. Sloom multiplies opacity, flow, pressure response, texture alpha, and repeated-dab buildup differently from either reference application, so direct numeric copying produced marks that were too faint or too dense.

## Material decisions

### Graphite and pencils

- The default pencil is explicitly **HB / No. 2 Pencil**.
- Graphite uses low hardness, tight spacing, paper-grain breakup, small random offsets, and pressure that primarily builds value rather than inflating line width.
- 4H, 2H, HB, 2B, and 6B form a deliberate value/softness progression.
- Mechanical pencil minimizes tilt and width variation; carpenter pencil uses a rotating broad rectangular lead; the side shader responds strongly to stylus tilt.
- Sloom-specific opacity and flow were raised after the first real-engine proof pass showed that literal MyPaint-like deposit values were too faint under Sloom's multiplicative dab compositing.

### Charcoal, Conté, pastel, and chalk

- Pressure primarily changes deposited value; chalk/grain texture and controlled scatter break the edge.
- Side/block tools use tightly overlapping rectangular dabs and stylus rotation.
- The misleading `Kneaded Charcoal Lift` was replaced by an honest `Kneaded Charcoal Blender`, using the implemented canvas mixer with almost no new-color deposit.
- Dust, powder, stick, pencil, wedge, speckle, and blender tools now have distinct operating roles.

### Ink and markers

- G-pen, Maru, crow-quill, brush-pen, and manga tools are hard, opaque, tightly spaced, and pressure-width driven.
- Technical/ruling pens remain constant width.
- Broad-edge and chisel tools rely on rectangular tip geometry, barrel rotation, and little pressure-size change.
- Felt/alcohol markers avoid unintended hue drift. The colorless blender now has a zero color rate.

### Watercolor, gouache, oil, acrylic, and dry bristle

- Watercolor uses low deposit, wet-edge behavior, grain, and the implemented spectral mixer; drybrush is deliberately excluded from canvas mixing.
- Oils use spectral pigment mixing and longer smearing; acrylic and gouache remain quick-drying/non-mixing except their explicit blender tools.
- Dry bristle tools have texture breakup, finite paint load, and pressure-flow response. Proof-sheet testing caught load falloff that exhausted paint in the first quarter of a stroke; those rates were reduced to useful full-stroke ranges.

### Digital, texture, organic, manga, FX, and mixers

- Digital brushes separate clean painting, rendering, flat blocking, pixel work, velocity response, controlled color dynamics, and noise.
- Organic and FX presets use intentional scatter, jitter, velocity, and color dynamics rather than arbitrary hue changes in natural-media tools.
- The engine currently modulates texture per dab; it does not tile a complete spatial screentone field inside one tip. Presets previously named as full screentones were therefore renamed and recalibrated as visible dot/stipple trails so their names match their actual output.
- Blend/smudge tools use the implemented canvas-sampling mixer with distinct pickup memory, sample radius, color rate, RGB/spectral mixing, and dulling/smearing modes.

## Correctness repair found during calibration

Selecting a preset previously merged it over the entire current brush. Hidden mixer, wet-media, texture, jitter, velocity, and tilt fields could therefore leak between tool identities—for example, selecting a pencil after a wet mixer could leave the pencil acting as a mixer.

`applyBrushPreset` now normalizes each preset against engine defaults and retains only the artist's current color unless the selected preset intentionally supplies its own color. A regression test covers the wet/mixer/dual-brush/velocity leakage case.

## Verification

- 50/50 focused preset, engine, palette, and calibration tests pass after final graphite tuning.
- 64/64 focused tests pass when mixer tests are included.
- TypeScript and the production Vite build pass.
- Targeted ESLint passes for all changed brush files and the proof-sheet generator.
- Broad Image-workspace sweep: 1,585/1,588 passed. The eyedropper timeout passed when rerun alone; two existing served-LAN `ImageSourceDocument` host-asset mock expectations remain unrelated to the brush changes.

