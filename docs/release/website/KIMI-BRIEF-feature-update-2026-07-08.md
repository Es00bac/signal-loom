# Brief for Kimi: ship the new print-production features on the website (EN + JA)

**Read this whole file before touching anything. Jarrod has ~36 hours of Claude budget left this
week, so Claude verified the load-bearing facts below and is handing execution to you. Don't
re-litigate the verified facts; do verify anything NOT marked verified before publishing it.**

Site root: `flow/docs/release/website/sloom-studio/` — English pages at the root, Japanese
mirrors under `ja/`. No build step, raw HTML. Deploy gate: `node verify-site.mjs` must pass
before `./deploy.sh <host> --go` (see README.md in that folder for the exact deploy command,
including the `RSYNC_RSH` env var needed for the SSH key). **Do not deploy without running the
gate first.** Every JA page needs `<html lang="ja">`, hreflang alternates back to its EN sibling,
and genuinely translated Japanese (there's an automated check for this in verify-site.mjs — it
fails the build if a `ja/` page has no CJK text, so don't leave placeholders).

## Verified true (Claude confirmed against source, 2026-07-08 — cite these, don't re-derive)

1. **PDF/X-1a and PDF/X-4 conformant export is REAL now**, not just intent-recording. Confirmed
   in `flow/src/lib/`: `paperPdfxExport.ts` (743 lines — builds embedded ICC OutputIntent
   `/S /GTS_PDFX`, PDF/X XMP metadata packet with `GTS_PDFXVersion`/`GTS_PDFXConformance`),
   `paperPdfxPipeline.ts`, `paperPdfxValidate.ts`, `paperIccEngine.ts`, `paperIccProfiles.ts`,
   `paperPdfxSpotFills.ts`, `paperPdfxVectorTextFrames.ts` — 3,056 lines total, backed by 7 test
   files, wired into `src/components/Paper/PaperWorkspaceUtils.ts` (a real component, not
   orphaned). **This supersedes the old audit finding** (`sloom-business/website-claims-audit.md`
   and `website-claims-fixes-DRAFT.md` — those are now STALE for this specific claim; the "in
   active development" wording added to the site on 2026-07-06 needs to come OFF for PDF/X-1a and
   PDF/X-4 specifically, replaced with a real, confident claim).
2. **Real CMYK with embedded ICC profiles is real** (same files above — `paperIccEngine.ts` +
   `paperIccProfiles.ts`), and **named spot colors export as real Separation plates**
   (`paperPdfxSpotFills.ts`), not metadata-only. This also supersedes the old "RGB approximation"
   finding in the audit for the Paper/PDF export path specifically (the OLD finding about
   `ImageAdjustmentLayer.ts:1142` — CMYK adjustment in the *Image* workspace's raster canvas — is
   a **different code path and is still true as written**; don't blur these. Image-workspace
   on-canvas CMYK preview is still an RGB approximation. Paper's PDF/X export pipeline is real.
   Say what's true for each, don't generalize one to the other.)
3. **Japanese vertical typesetting is real** (verified in an earlier pass, unchanged): genuine
   WYSIWYG `writing-mode: vertical-rl` (identical on canvas and in exported PDF), furigana/ruby
   using real Aozora/pixiv/narou notation (`漢字《かんじ》`, `｜base《reading》`), emphasis dots
   (`《《word》》`), tate-chū-yoko auto-formatting for short numbers in vertical columns
   (`src/lib/paperJapaneseText.ts`), manga-lettering bubble presets (Gothic/Mincho), a real
   tankōbon page-size preset. This is already documented on the site (`docs.html` /
   `ja/docs.html`, section `#japanese-typesetting`, and `index.html` comparison table) — the new
   screenshots below are additional proof, not a new claim to write from scratch.
4. **CORRECTION (2026-07-08, after Kimi's first pass got this wrong):** A prior Kimi session
   checked `format: 'sloom-idml-json'` in `paperDocumentFormats.ts` and reported IDML as fake/
   in-development. That field is real but is a *different thing* — Sloom's own internal JSON
   interchange format, not an IDML export. **The actual IDML export path is
   `src/lib/paperIdmlExport.ts` (502 lines, tested in `paperIdmlExport.test.ts`, 131 lines) and it
   is real and spec-correct**: builds a genuine Adobe `.idml` ZIP package — `mimetype` stored
   first and uncompressed exactly per the IDML spec, `META-INF/container.xml`, `designmap.xml` as
   the hub, `Resources/{Graphic,Fonts,Styles,Preferences}.xml`, real `Spreads/`/`Stories/`, every
   part wrapped in the correct `idPkg:*` packaging namespace, correct MIME type
   (`application/vnd.adobe.indesign-idml-package`). Verified so far: valid ZIP structure, every
   XML part well-formed (checked with `xmllint` per the code's own test comments). **What is NOT
   yet verified: nobody has opened the actual export in real InDesign or Affinity Publisher.**
   Structural/XML validity is strong evidence but is not the same as a confirmed real-app open.
   **Claim precisely:** "exports a structurally valid, spec-correct Adobe IDML package" — real,
   tested, substantial. Do NOT claim "confirmed to open in InDesign" or similar until that real
   open actually happens (Jarrod has a print-shop contact, Gemini II Imprints in Arvada, lined up
   for exactly this test — not your job to chase that, just don't overclaim past what's verified).
   Note separately: real Adobe `.idml` *import* (reading someone else's IDML back in) is
   explicitly NOT built (`paperDocumentFormats.ts` throws a clear "not supported yet" error for
   it) — the claim is export-only, be precise about that distinction too.

## New screenshots to use (real, from today, on disk)

All in `/home/cabewse/Pictures/Screenshots/`:
- `Screenshot_20260708_092712.png` and `Screenshot_20260708_092912.png` — a live comic page with
  Japanese vertical text, furigana, and speech bubbles in the Paper editor (source-bin sidebar in
  Japanese UI). Good for the JA docs Japanese-typesetting section and/or the JA homepage.
- `Screenshot_20260708_093538.png` and `Screenshot_20260708_093638.png` — "Type & Craft" English
  typesetting showcase page, showing drop caps, runaround text, spot color, PDF/X-1a, rich text
  runs, true small caps, AND a **production spec sheet visible in-frame**: "PDF/X-1a & X-4 ✓ Real
  CMYK, embedded ICC", "Named spot colors ✓ Kept as Separation plates", "True drop caps ✓ Up to 8
  lines", "Hanging indents ✓", "Runaround text ✓". **This is the strongest proof image for the
  PDF/X claim — use it prominently wherever the site talks about print export**, home page and
  the print/KDP/TTRPG landing pages (EN); make/find a JA-labelled equivalent for the JA pages if
  one exists, otherwise this EN screenshot is still fine on JA pages with a JA caption.
- `Screenshot_20260708_102134.png` and `Screenshot_20260708_102224.png` — a full-bleed illustrated
  comic page (English) with a proper spec panel (Inspector) open: page size, bleed, PDF/X target,
  output intent, ink limit, black handling, spot colors, overprint preview — showing the real
  production controls, not just output. Good secondary proof image for print-feature sections.

Some similar shots already exist on the site (`assets/screenshots/`) — check there first; **don't
duplicate an existing shot, but do replace any old shot that's now weaker than one of these** (a
new shot showing the actual verified spec sheet beats an old generic screenshot).

Copy new images into `assets/screenshots/` with descriptive kebab-case names (matching existing
convention, e.g. `paper-pdfx-typecraft-showcase.png`), write real alt text describing what's
actually on screen (not generic), and reference them with relative paths — remember JA pages are
one directory down (`ja/`), so their image paths need `../assets/screenshots/...`.

## The bilingual user manual — verify before publishing, don't trust it blind

`/home/cabewse/work_SPaC3/flow/docs/user-manual-bilingual/` (en/ja) was written by a prior Kimi
session (`session_26ac84a2-3116-4420-b69c-1da592f43878` — you can resume it directly for context:
`kimi-cli --resume session_26ac84a2-3116-4420-b69c-1da592f43878`). **It was LLM-generated, so
verify its claims against the actual source code before publishing anything from it to the public
site** — the same standard Claude held itself to in this brief. Where it's accurate, fold the good
material into `docs.html` / `ja/docs.html` (the existing per-workspace sections) rather than
publishing it as a separate standalone manual — keep one canonical docs page per language. Where
it overstates something (especially around IDML, or anything about AI capabilities — see the
"Do NOT claim" list in `hermes/business/signal-loom-facts.md`, that file is the source of truth
for positioning: never lead with AI, never call it an AI tool, no fabricated benchmarks/user
counts), fix it before it goes anywhere near the site.

## What to actually update (both `en` root and `ja/` mirror, every item)

1. **`docs.html` / `ja/docs.html`** — Paper workspace section, `#export` subsection: replace the
   "in active development" language for PDF/X-1a and PDF/X-4 and real CMYK/spot with confident,
   accurate claims per the verified facts above. Add the new screenshots. Pull in verified content
   from the user manual for anything genuinely new (drop caps, runaround text, hanging indents,
   true small caps, spot-color handling, ink limit / black handling / overprint preview controls
   — verify each against `PaperWorkspaceUtils.ts` / `paperPdfxExport.ts` / the Inspector component
   before claiming it).
2. **`index.html` / `ja/index.html`** — Paper row in the comparison table and the license/FAQ
   sections currently say "conformant PDF/X-1a, PDF/X-4 and Adobe IDML in active development" —
   update all three: PDF/X-1a and PDF/X-4 become real/shipped claims, and IDML becomes "exports a
   structurally valid Adobe IDML package" (real, tested — see item 4 in Verified True above), NOT
   "in active development" anymore, but also not "confirmed InDesign-compatible."
3. **`print-ready-comics.html` / `ja/`, `kdp-book-formatting-software.html` / `ja/`,
   `ttrpg-layout-software.html` / `ja/`** — these three landing pages all currently hedge PDF/X-1a,
   PDF/X-4, AND IDML as "in development" in their chips/body copy/pricing bullets — same upgrade
   for all three claims, on all three pages, both languages, using the precise IDML wording above.
4. **`changelog.html` / `ja/changelog.html`** — add a new dated entry for this PDF/X-1a/X-4 + real
   CMYK/ICC + spot-Separation + real IDML export ship (check `git log` in `flow/` for the actual
   commit dates/messages on the `paperPdfx*`/`paperIcc*`/`paperIdmlExport.ts` files if you want an
   accurate date instead of guessing).
5. **Update `sloom-business/website-claims-audit.md` and
   `sloom-business/website-claims-fixes-DRAFT.md`** to mark the PDF/X-1a/X-4/CMYK/spot AND IDML
   findings as RESOLVED (superseded by this ship — note IDML resolved with the precise "structurally
   valid, not yet InDesign-confirmed" caveat, not a blanket "fixed"), so nobody re-reads those as
   current status later.

## Non-negotiable constraints (same rules Claude operates under for this site)

- **Verify before claiming.** Every feature claim must trace to real code you've read, not to the
  manual, not to a screenshot alone, not to inference. If you can't verify something, say "in
  active development" rather than guess.
- **No AI-first framing.** Never call this "an AI tool" or lead with AI — see
  `hermes/business/signal-loom-facts.md` for the full positioning rules. This is a professional
  creative suite that's AI-optional.
- **Deploy gate is mandatory.** `node verify-site.mjs` must pass (checks structural markers, every
  asset resolves, no broken anchors, every EN page has JA hreflang and vice versa, every JA page
  contains real Japanese text) before any `./deploy.sh --go`.
- **Symlinked downloads, never hand-edit versioned filenames** into HTML — see the README's
  "Maintenance: single-source values" section if a download link needs touching.
- **IndexNow auto-pings on deploy** — no extra step needed, `deploy.sh --go` does it.

## To run this

```
kimi-cli --resume session_26ac84a2-3116-4420-b69c-1da592f43878 --work-dir /home/cabewse/work_SPaC3/flow
```
Then paste in: "Read and execute
docs/release/website/KIMI-BRIEF-feature-update-2026-07-08.md end to end." Kimi's own budget
(Jarrod's Kimi subscription, ~97% remaining as of this morning) covers this — no need to conserve
tokens the way Claude did while writing this brief.
