# Paper editor/export WYSIWYG follow-up

## Why this work followed the audit sprint

The two frozen audits focused on loss prevention, asset portability, exact-font identity, PDF/export honesty, synchronization, and other correctness boundaries. Once those repairs were installed as internal build `0.9.12d`, the real 16-page Sloom Studio origin zine exposed a finer problem: Paper's managed HarfBuzz editor composition and its browser-based print/raster layout could both use the correct text and exact font bytes yet still make different layout decisions.

The result was not corrupted source data. It was editor/export drift: a cap could occupy the wrong wrap lane, a word or display line could break differently, a rich paragraph could sit closer to its neighbor, a variable font could shape at its default axis, or Japanese inline annotations could use geometry that did not match CSS export.

Eight integrated commits close those post-audit WYSIWYG gaps. They are packaged in the installed Application Menu build identified to the user as **Sloom Studio 0.9.12d**. They do not add findings to the completed 79-item audit count.

## Corrections by layout responsibility

### Story-opening drop caps and their float lane

Commit `317bd5d9` (`fix(paper): align editor drop caps with export`) makes a frame-level drop cap a story-opening instruction rather than a value inherited by every paragraph.

- A frame-level cap applies only to the first paragraph in the first frame of a threaded story.
- Continuation frames do not manufacture another opening cap.
- Later paragraphs remain ordinary body text unless that paragraph explicitly authors its own cap.
- An explicit paragraph-level cap still works, so the correction does not remove deliberate mid-story editorial treatments.
- The managed composer derives the number of body-text lines that wrap beside the cap from the cap's rendered float height and paragraph leading. It no longer assumes the raw three-times glyph scale means exactly three full body lines must stay in the narrow lane.
- The live inline/rich editor uses the same story-opening rule as composition and export.

**User-visible result.** A three-line opening cap appears once at the start of the story. The adjacent text uses the same shortened wrap lane the exported CSS float uses, then returns to the full column width at the correct line. Ordinary later paragraphs and threaded continuations no longer acquire surprise drop caps.

### Whole-word wrapping and balanced columns

Commit `f459662a` (`fix(paper): match managed text wrapping to export`) corrects two separate layout decisions.

First, the line wrapper now preserves a complete overflowing word. It finds the latest legal break before that word and moves the entire word to the next line. The old composer could wait until the first overflowing grapheme, leaving most of a word on one line and moving only its tail.

Second, an authored multi-column frame with column balancing enabled computes the shortest balanced column height that fits the content. The resulting columns differ by at most the unavoidable line/paragraph constraints instead of filling the first column to the frame bottom before beginning the next.

**User-visible result.** Normal prose wraps at word boundaries like the browser export, and balanced editorial columns distribute copy across the authored columns rather than looking full on the left and sparse on the right.

### Balanced display lines and optical sizing

Commit `02ef1460` (`fix(paper): preserve optical and balanced typography`) implements the remaining authored typography semantics.

- `lineBreak: balance` now balances display copy while preserving its natural line count. The composer searches for a narrower effective line width that produces the same number of lines with more even measures, matching browser balanced-wrap intent.
- A variable face with an `opsz` axis and no explicitly authored optical-size coordinate now receives CSS-compatible automatic optical sizing derived from the rendered point size converted to CSS pixels and clamped to the face's axis range.
- Scaling a style for a drop cap recalculates automatic optical size at the enlarged cap size instead of retaining the body's optical coordinate.

**User-visible result.** Headlines and display text form more deliberate, even line shapes, and variable fonts use optical masters appropriate to their rendered size. A large drop cap is shaped as large type rather than as a body-size optical master merely scaled up.

### Rich paragraph leading in the editor

Commit `30a26fda` (`fix(paper): preserve rich paragraph leading in editor`) aligns rich-paragraph separation across managed composition, the inline editor, and print HTML.

Print serialization preserves a newline between authored rich paragraph blocks inside a pre-wrap container; Chromium gives that separator one frame-leading line of geometry. The managed composer now models that line explicitly. The browser editor view adds the same gap as presentation-only margin while retaining any separately authored `spaceAfter` value.

The editor-only gap is not written back as new authored spacing when the user opens and closes text editing. This prevents WYSIWYG display geometry from slowly accumulating into the document model.

**User-visible result.** Separate rich paragraphs sit at the same vertical positions in the editor and export. Entering and leaving text editing does not double or permanently increase their spacing.

### Contextual HarfBuzz shaping during wrap decisions

Commit `760f9860` (`fix(paper): wrap text with contextual glyph metrics`) removes an important measurement shortcut. The old wrapper summed grapheme advances shaped in isolation. That loses kerning, ligatures, and other contextual shaping, so it could reject a word or line that the final grouped HarfBuzz paint—and browser export—actually fits.

The corrected wrapper:

- groups source units at legal wrap boundaries;
- shapes each candidate line in context with the same grouping used for final placement;
- decides fit from that contextual advance;
- preserves normal whole-word behavior; and
- uses exact prefix measurement only for the uncommon intrinsically over-wide token that must be split.

**User-visible result.** Kerning pairs, ligatures, and script shaping no longer make the editor wrap earlier than its own final paint or exported layout. A line such as an `AV` pair is measured as the font shapes it, not as two unrelated letters.

### Explicit hard breaks in rich runs

Commit `91656e37` (`fix(paper): honor hard breaks in managed rich text`) makes authored newline characters layout boundaries rather than font glyph requests.

- A newline inside a rich run creates a new composed line.
- The newline has zero glyph advance and is never reported as a missing font character.
- Text before and after the break still follows the normal word/contextual wrapping rules.
- Following line origins advance by the authored leading.

**User-visible result.** Text such as `FIRST\nSECOND\nTHIRD` appears as three intentional lines in the editor, with the same hard breaks in export and no false missing-glyph warning.

### Variable-face descriptor axes

Commit `f23b7ab5` (`fix(paper): map managed variable face descriptors`) makes HarfBuzz honor the selected managed face's CSS descriptors.

CSS automatically maps a registered variable face's weight, width, italic, and oblique descriptors onto its variation axes. HarfBuzz does not do that automatically. The editor could therefore authenticate a selected weight-700 face but shape its outlines at the font's default weight 400 while browser export correctly used 700.

The managed composer now maps:

- face weight to `wght`;
- stretch percentage to `wdth`;
- italic style to `ital`;
- oblique style/angle to `slnt`; and
- automatic rendered size to `opsz` where available.

Every coordinate is clamped to the declared face axis. An explicitly authored run/frame/face variation remains authoritative and is not overwritten by descriptor inference.

**User-visible result.** The weight, width, italic/oblique posture, and optical size seen in the Paper editor match the exact variable face selected and the browser export. Bold no longer authenticates as bold but paints with regular/default outlines.

### Browser-native inline annotations shared with export

Commit `f2486722` (`fix(paper): share export layout for inline annotations`) defines one honest geometry owner for Japanese and annotated inline layout.

Ruby readings, emphasis marks, and tate-chu-yoko (TCY) affect browser line boxes and inline distribution in ways that HarfBuzz glyph positioning alone does not reproduce. Paper now detects these annotations and keeps their editor preview on the exact managed-font browser DOM layout used by print/raster export, rather than overlaying a separately centered HarfBuzz approximation. Plain text without those annotations continues to use the managed composition layer.

The detection covers:

- ruby, such as `日本語《にほんご》`;
- emphasis, such as `《《強調》》`; and
- TCY digit runs in vertical writing, such as `第12巻`.

**User-visible result.** Ruby distributes its reading over the same base text in the editor and export, emphasis marks occupy the same inline geometry, and short horizontal numeral groups in vertical text use the same TCY layout. The editor no longer shows one arrangement and exports another.

## Expected behavior across the 16-page proof publication

The final proof used the actual 16-page Sloom Studio origin zine, not only synthetic single-frame fixtures. Across that publication, the expected current behavior is:

- story-opening caps occur once and release their narrowed wrap lane at the same point in editor and export;
- words are not split merely because isolated-grapheme measurement overestimated a shaped line;
- balanced headlines and columns retain their authored line/column intent;
- rich paragraph blocks retain the same leading and explicit hard breaks;
- Newsreader and other variable faces use selected descriptor axes and size-appropriate optical shaping;
- ordinary managed text remains on the exact HarfBuzz composition route; and
- ruby, emphasis, and vertical TCY frames use the browser-native exact-font route shared with export.

The all-16-page editor/export proof confirmed the complete publication remained available after these corrections and exercised the repaired layout decisions in the installed `0.9.12d` application. This proof supplements the permanent fixtures; it does not rewrite the user's `.sloom` project or convert visual observation into a new audit finding.

The durable visual proof archive is
`/mnt/d/Sloom-Studio-artifacts/2026-07-18-paper-editor-export-wysiwyg/`. It contains paired editor
and export captures for pages 1–16, per-page comparisons, and `sweep-final-contact.png` as the final
whole-publication contact sheet. Focused intermediate captures in the same directory preserve the
drop-cap, rich-leading, contextual-wrap, optical-size, hard-break, variable-font, and Japanese
annotation checks that led to the final sweep.

## Permanent verification

The final integrated tip was rechecked with the six directly affected suites:

```text
src/lib/paperTextComposition.test.ts
src/lib/paperDocument.test.ts
src/lib/paperRichTextDom.test.ts
src/lib/paperJapaneseText.test.ts
src/features/paper/workspace/PaperManagedTextLayer.test.tsx
src/lib/paperPageFlattenExport.test.ts

6 test files passed
132 tests passed
```

TypeScript passed. Targeted lint passed with only the already-existing `PaperWorkspace` warnings;
`git diff --check` passed. The production build completed with 3,287 modules, and the package font
checks confirmed 116 families, 430 faces, and 546 declared payload files.

The permanent cases include:

- one frame-opening cap plus an explicit later paragraph cap;
- cap float-lane release based on rendered height/leading;
- complete-word overflow movement;
- balanced columns and balanced display lines;
- automatic optical sizing and enlarged drop-cap optical sizing;
- rich paragraph leading without persistence mutation;
- contextual kerning in line-fit decisions;
- rich-run newline hard breaks without missing glyphs;
- variable `wght` descriptor mapping, alongside the production `wdth`/`ital`/`slnt` mapping; and
- browser-native annotation routing for ruby, emphasis, TCY, and a plain-text control.

The final installed target remains:

- Application Menu name: `Sloom Studio`
- installed directory: `~/.local/opt/signal-loom`
- desktop entry: `~/.local/share/applications/signal-loom.desktop`
- user-facing version: `0.9.12d`

## Boundary and interpretation

This work improves WYSIWYG fidelity by assigning each layout to the engine that also owns its export geometry. It does not force every frame through one renderer:

- ordinary exact managed text uses the HarfBuzz composer, now with browser-compatible wrapping, spacing, and variable-axis rules;
- ruby, emphasis, and TCY use the authenticated managed-font browser DOM because that is also the export layout engine for those annotations.

That split is deliberate. “WYSIWYG” here means the Paper editing view and Sloom's browser print/raster output make the same relevant layout decisions. It is not a claim of pixel identity across every OS/browser version, nor external Acrobat, printer, RIP, or press certification.
