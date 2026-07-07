# Print Production — Status & Honest Assessment

**Branch:** `feature/real-cmyk-pdfx-print` · **Tests:** 3963 passing · **Build:** clean (`tsc -b` + vite)
**Verified with:** our ISO 15930 validator + poppler (`pdfinfo`/`pdffonts`/`pdfimages`), **Ghostscript `tiffsep`** (spot plates), **`pdffonts`** (real font subset + proof that outlined text carries NO font), **Scribus 1.6.6** (IDML opens correctly), `pdftoppm` render.

> **Update (later same session) — "is rasterized text professional?"** No — raster is the last-resort tier, and it's now smaller. Three follow-ups shipped: (1) **single-column is the default** for new text frames, so body text embeds as selectable vector out of the box (was dormant at 2 columns); (2) preflight now **warns exactly which imported-font glyphs are missing** (they fall back to raster); (3) a real **"convert to curves" tier** — stroked/outlined lettering that used to rasterize now draws as filled+stroked **vector glyph curves** (verified: "KA-BOOM!" renders as outlined lettering using *no font*, beside a selectable caption, still valid PDF/X-4). The hierarchy is now **embedded selectable type → outlined vector curves → raster (only when we lack the glyphs)**.

> **Update — spot-coloured *text* now plates (not just fills).** The Type inspector gained a **"Spot Ink"** row: bind a text/caption frame's colour to a named spot swatch and, under "Preserve named spots", its glyphs **outline to vector curves and print on the swatch's own `/Separation` plate** — reusing both the glyph-outlining and spot-plate engines. gs-`tiffsep`-verified on a PANTONE 185 C caption: **7354px of glyphs on the named plate, all four CMYK process plates empty, no embedded font** (`pdffonts` clean). Preflight now names spot text among the kept plates.

> **Update — spot *borders* plate too, closing the spot story.** A frame's stroke can carry a spot swatch (Alt-click a document swatch → "Alt: stroke → spot plate"); a solid border draws as a stroked `/Separation` path and is knocked out of the process raster. gs-verified (4 mm PANTONE 185 C border: 39833px on the named plate, all four process plates empty). Now the *only* spot uses that still convert are a dashed/dotted/double border and a speech-bubble shape — both niche, both disclosed. Spot fills, solid borders, and text all plate.

The through-line of all this work: kill the paywalled print feature that *looks* real but silently ships the wrong file. Below is what changed, an honest 0–99 professional-usability rating per piece, my confidence, and the gaps.

---

## Bottom line

**Will this produce professional printer files that actually work? — Yes, for process-color work** (comics, KDP interiors, black-text books, CMYK design).

These are genuine PDF/X files: real CMYK through a real embedded ICC output intent, correct Trim/Bleed boxes, enforced total-ink limits, embedded subset fonts — **not a mislabeled RGB PNG**. A print shop opening one sees a real PDF/X with the color space and output intent it expects.

**Core CMYK PDF/X confidence: ~80 / 99.** The missing ~20% is the one thing I **cannot** do from here: a real-world round-trip — no file has yet been opened in Acrobat/Enfocus, handed to a shop, or run through KDP's uploader. Everything is validated by our own structural checker + poppler/Ghostscript/Scribus. Strong, but not "a press ran it." That test is yours; it's the honest line between *correct by construction* and *proven in the wild*.

---

## What I did this session (8 commits)

| # | Area | Was | Now | Commit |
|---|---|---|---|---|
| 1 | **IDML geometry** | Page centred on the spine in Y but pinned x=0 → every frame shifted half-a-page right; right-column frames **fell off the page** (a caption dropped on import). Text frames emitted no fill. | Centred on the spine in **both** axes; text frames carry Fill/Stroke. **Verified in Scribus** — all frames at exact mm positions with fills. | `62a1f98` |
| 2 | **Font vetting** | No way to import a font; everything substituted. | `vetFontBytes` — parses with fontkit, requires essential sfnt tables, reads OS/2 `fsType`, refuses corrupt / WOFF2 / restricted-license fonts with a plain reason. | `cc9e5cc` |
| 3 | **Font library** | — | `PaperImportedFont` on the document (persists like swatches); `resolveTextFace` prefers the user's real face over Liberation. | `2b525ae` |
| 4 | **Embed real font** | Every face embedded as a Liberation substitute. | The user's **actual font** embeds as a real subset in PDF/X; honours the no-subsetting license bit. **pdffonts-verified**: DejaVu → 3 KB subset under its own name. | `7e52929` |
| 5 | **Preflight** | — | Discloses matched fonts as "embedded as your imported font" (not a substitute). | `7fc6015` |
| 6 | **Import UI** | — | "Import font…" in the Type inspector: vets + adds, live `FontFace` preview, "Imported fonts" picker group, undoable. | `6a4eccc` |
| 7 | **Glyph coverage** | An imported font missing a glyph would draw `.notdef` boxes as vector. | Falls back to raster (browser font-fallback renders the glyph) instead of shipping tofu boxes. | `0c15d19` |
| 8 | **Spot `/Separation`** | Spot always flattened to process. | Exporter emits **real named spot plates** — `gs tiffsep` produces a "PANTONE 185 C" plate; file still passes PDF/X-4. Reachable from the UI for **fills and text** (see rows 73/74). | `fd87177` |

*(These build on the prior session's real-CMYK / PDF/X / ink-limit / black-policy / vector-text foundation, commits `34e72c4`→`69d7048`.)*

---

## Feature ratings — professional usability (0–99)

Legend: **80–99** press-ready · **60–79** works, with caveats · **40–59** partial · **<40** not yet usable.

| Score | Feature | Honest note |
|:---:|---|---|
| **85** | Real CMYK color engine (lcms2 + ICC) | Genuine sRGB→CMYK through real ICC profiles (13 bundled). Cap: some press conditions use a nearest-profile substitute (FOGRA51→FOGRA39); no per-shop device-link. |
| **82** | PDF/X-1a & PDF/X-4 structure | Conformant embedded ICC OutputIntent, Trim/Bleed boxes, XMP + Info, trailer `/ID`. Recognized as ISO 15930 by poppler. Cap: not yet opened in Acrobat/Enfocus/callas. |
| **82** | **Font embedding — the user's real font** | **New this session.** Import → vet (unbroken + embeddable) → embed the actual font as a real subset, pdffonts-verified. Coverage-guarded (missing glyphs → raster, no tofu). Unimported fonts still use a disclosed Liberation substitute. Caps: no faux-bold when only one weight is imported; WOFF2 must be converted to TTF/OTF first. |
| **80** | Total-ink (TAC) limit | Real UCR clamp on raster **and** vector fills, verified against the actual exported image. Cap: simple keep-K/scale-CMY, not a profile-aware re-separation. |
| **80** | Preflight accuracy & honesty | Truthful about fonts, ink, rich-black, and PDF/X status. Now also **warns exactly which imported-font glyphs are missing** (those characters fall back to raster, per-character disclosure). The earlier spot→process no-op is fixed (uses `fillSwatchId`). |
| **78** | Black policy (100% K text) | Rewrites near-black vector text to pure K, stopping registration fringing. Cap: vector text only. |
| **77** | KDP-ready interior PDF | Correct form: flattened CMYK PDF/X-1a at ≥300 DPI, 0.125″ bleed, embedded intent. Cap: not yet run through KDP's own file checker. |
| **79** | Selectable vector text | Real embedded subset fonts, correctly placed, captions included, searchable, coverage-guarded, and now **single-column by default** so body text is selectable vector out of the box. Caps: multi-column, rotated, and speech-bubble text still don't produce *selectable* type. |
| **74** | Text as vector curves (convert-to-outlines) | **New.** Text we can't embed as live type but must keep crisp draws as **filled/stroked glyph curves** (the font's own outlines, quad→cubic), not raster. Live end-to-end for **stroked lettering, letter-spacing, whole-frame rotation, and spot-coloured text** (gs/render-verified: no font, no image — pure vector, correct spacing + tilt direction/pivot; spot glyphs land on the named plate). Next: skew/scale, arc/on-a-curve, speech-bubble, text-only rotation. Not selectable (curves carry no text — by design). |
| **76** | Soft proof (on-screen) | Real lcms proofing transform incl. optional paper-white sim. Preview quality; not a physical contract proof. |
| **70** | IDML (InDesign interchange) — export | A real `.idml` that **opens correctly in professional DTP software** — independently verified in Scribus 1.6.6 (exact geometry + fills; fixed the half-page bug). Caps: import/round-trip not built; not opened in InDesign *specifically*. |
| **73** | Spot / Pantone plates | **Real end-to-end.** Create a named spot swatch ("+ Spot"), apply it to a **fill** (any shape) or to **text** (the "Spot Ink" row in the Type inspector), set the spot policy to "Preserve named spots" → the export emits a real `/Separation` plate and knocks that art out of the process raster. Fills handle the full shape family: solid, **tinted/screened** (fill opacity → tint), **rotated**, **rounded-corner**, and **polygon**; **solid borders** plate as stroked /Separation paths; **text** outlines to glyph curves and plates. **gs-tiffsep-verified**: solid vs 40% measures ink 1.000 vs 0.400; a 25° rect plates rotated; a 14 mm-radius rect plates rounded; a 5-vertex frame plates a clean pentagon; a PANTONE 185 C caption plates 7354px of glyphs with all four process plates empty and no embedded font; a 4 mm PANTONE border plates 39833px with the process plates empty. Still valid PDF/X-4; preflight discloses kept vs converted. Caps: only a dashed/dotted/double border or a speech-bubble shape still converts (disclosed); not yet proven in a real RIP/press by you. |

---

## Output formats — what a shop actually receives

| Format | Status | Reality |
|---|---|---|
| **PDF/X-1a** | ✅ Real | Flattened CMYK, embedded ICC intent, no live transparency. The safe, universally-accepted press format. |
| **PDF/X-4** | ✅ Real | Same color core, plus a selectable vector-text layer (your embedded fonts) over the raster art. |
| **KDP interior PDF** | ✅ Real | PDF/X-1a shaped to Amazon KDP's spec (DPI + bleed). Form is right; uploader untested. |
| **Adobe IDML** | ✅ Real (export) | Genuine package, Scribus-verified to open with correct geometry + fills. Import not built. |
| **Spot-color PDF** | ✅ Real (fills + borders + text) | Named spot swatch → fill (any shape family), solid border, or text → real `/Separation` plate, knocked out of the process raster, gs-verified. Only a dashed/dotted/double border or a speech-bubble shape still converts (disclosed). |

---

## Confidence, stated plainly

- **Structurally / by construction:** high (≈85%). The files carry a real CMYK OutputIntent, correct boxes, enforced ink limits, embedded subset fonts (including your *own* font now), and pass our ISO 15930 validator + poppler. The classic amateur tells — RGB mislabeled as print, over-inked rich blacks, fringing black text, silently-swapped fonts, tofu boxes — are handled or openly disclosed.
- **Will a real shop accept it:** confident for **process-color** jobs (≈80%). Held back only by the absence of a live Acrobat/Enfocus/shop/KDP round-trip.
- **Where I'm *not* confident:** spot/Pantone jobs are now wired end-to-end (fills + text) and gs-verified, but **not yet proven in a real RIP/press by you**; and any InDesign-specific IDML quirk (verified in Scribus, not InDesign itself).

**One-line pitch you can honestly make today:** *"Exports real CMYK PDF/X-1a & X-4 with an embedded ICC output intent, enforced ink limits, and selectable embedded text using your own fonts — the correct press format, not a labeled RGB image."* Every word of that is true now.

---

## Gaps remaining

| # | Gap | Priority | Why / next step |
|:---:|---|---|---|
| 1 | **Real-world validation round-trip** | Highest | Open a PDF/X in Acrobat/Enfocus, hand one to a shop, upload the KDP interior. The one test only you can run — the reason confidence caps at ~80%. |
| 2 | **Spot color — broaden coverage** | Done | Solid/tinted/rotated/rounded/polygon spot fills, **solid borders**, and **spot-coloured text** all ship as real /Separation plates. Only a dashed/dotted/double border or a speech-bubble shape still converts (disclosed) — both are niche. Remaining: prove one plate in a real RIP (yours to do). |
| 3 | **Font polish** | Medium | Faux-bold/italic when only one weight is imported; native WOFF2 (needs a brotli decompressor). *(The "your font is missing glyph X" preflight note is now done.)* |
| 4 | **Vector-text reach** | Medium | Single-column is the default; **stroked, letter-spaced, and rotated** text now outline to vector curves instead of rasterizing. Still to reach vector: skew/scale, arc/on-a-curve, and speech-bubble text (the outline core handles them — remaining work is the exporter geometry + a live-editor overlay check for pixel-exact alignment). |
| 5 | **IDML import + ink-reduction quality + PDF/A-2b hybrid** | Later | Round-trip IDML; profile-aware re-separation; optional GTS_PDFA intent so veraPDF passes too (archival). |

---

## How this was verified (not owner-dependent)

- **Fonts:** exported a PDF/X-4 with a real imported face (DejaVu, absent from our bundled set). `pdffonts` shows it embedded under its own name; the FontFile2 stream is a **3 KB subset** (vs 470 KB with subsetting off) — the user's real font, subsetted, not a substitute.
- **IDML:** generated a representative `.idml` and imported it into **Scribus 1.6.6 headless** — all four frames land at their exact mm positions and sizes, with fills and text. Fixed a real half-page coordinate bug this caught.
- **Spot:** `gs -sDEVICE=tiffsep` on the exported PDF produces a `PANTONE 185 C` plate alongside the CMYK plates, and the file still passes our PDF/X-4 validator.
- **Whole suite:** 3912 tests + `tsc -b` + production build, all green.

**Not checked (yours to run):** Acrobat/Enfocus, a physical proof, a real shop, KDP's uploader, and InDesign opening the `.idml`.

*Detailed engineering notes: `docs/notes/843` (IDML), `844` (fonts), `845` (spot).*
