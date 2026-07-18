# Internal desktop build 0.9.12d

## Purpose

`0.9.12d` is the internal Linux desktop build intended to package the completed 79-finding audit repair set for Application Menu use. Electron package metadata stores the SemVer-safe value `0.9.12-d`; Sloom Studio’s About dialog and installer output present the human-facing value `0.9.12d`.

## Included post-audit copy change

The launch notice and Sloom website no longer describe the current price as limited to the first 100 customers or copies. The current rule is:

- the current one-time beta price applies through version `0.9.x`;
- the full price begins with version `1.0`;
- the transition is not triggered by sales count or a calendar date.

English and Japanese application/site copy were updated, and permanent checks reject the old first-100/date-trigger wording.

## Corrected blank-launch behavior

The first `0.9.12d` package exposed a post-audit startup regression: launching the application with
the default blank-start behavior could hydrate Paper tabs from the previous renderer session, show
a loss-prevention dialog before native project authority had been adopted, and then cycle through a
stale-copy warning and another discard dialog. The corrected `0.9.12d` package replaces that startup
sequence.

Expected behavior in the final installed build:

- An ordinary blank launch opens a clean Flow workspace without asking the user to save or discard
  Paper tabs from the prior session.
- Blank startup does not attempt a project save before the window has adopted native project
  authority, so it does not manufacture the out-of-date-copy warning seen in the first package.
- If hydrated prior-session Paper or Image documents contain work that is genuinely dirty, the app
  places bounded local copies in its recovery history before establishing the clean workspace. The
  work is therefore not forced onto the canvas, but it is not silently destroyed either.
- Opening a remembered project remains a different operation: genuinely dirty live work still uses
  the normal Save, Discard with Recovery, or Cancel decision before that file replaces the workspace.
- Delayed native startup state remains request-scoped and cannot overwrite a newer explicit project
  open.

This launch correction is a post-audit packaging/runtime follow-up. Like the price-copy change, it
does not alter the 79-finding audit count.

## Corrected legacy-project Paper fonts and stable licensed identity

A later hands-on check opened the pre-repair project
`Sloom-Studio-Origin-Zine-Assets.sloom` and exposed two more current-build defects. Neither defect
changed the project’s authored Paper content.

First, Paper asked Chromium to authenticate an exact managed face with a CSS shorthand such as
`normal 400 100% 16px "sloom-managed-…"`. Chromium accepts percentages in the `@font-face`
`font-stretch` descriptor but rejects a percentage in this `FontFaceSet.load()` shorthand. The app
therefore blocked exact paint for every otherwise valid face. The repair maps each OpenType width
class to its exact shorthand keyword (`condensed`, `normal`, `expanded`, and their other canonical
variants) in both browser and native-PDF readiness checks. A real-Chromium regression proves all
nine width classes parse and proves the retired percentage form does not. Large faces also receive
a byte-size-aware, bounded 5–30 second registration window; the project’s approximately 9.6 MiB
Noto Sans JP variable face receives 22.5 seconds instead of the old fixed 2.5 seconds.

Second, the license-only cross-window listener was reacting to the generic settings change token.
Every derived license-verdict persistence could therefore trigger another rehydrate, temporarily
fail-close the verdict, revalidate it, and repeat. The visible symptom was the title alternating
between `Sloom Studio` and `Sloom Studio — Community`; commercial feature gates used the same
Boolean, so this was not merely title decoration. The listener now responds only to the dedicated
license change token, license-key record, or license broadcast. Unrelated settings and derived
verdict writes no longer rehydrate license identity.

Expected behavior in the final installed build:

- Opening the legacy zine project in the existing licensed profile loads all 16 Paper pages without
  the red exact-managed-typography banner or the large-face timeout message.
- Flow and Paper remain titled `Sloom Studio`; ordinary settings persistence does not make the
  licensed app alternate into Community state.
- Exact managed-font behavior remains fail-closed. A genuinely absent, altered, collection-member,
  or noncanonical descriptor still stops rather than silently painting a fallback.
- The old zine project references managed Paper records but predates the portable `paperAssets`
  section. Its existing profile has the verified local records, so it opens there. A completely
  fresh profile cannot reconstruct those omitted bytes from that old file alone and correctly
  reports the portability problem. This verification did not rewrite the user’s project.

The implementation and permanent regression evidence are in commit `e20fdc97`. These are
post-audit runtime corrections and do not alter the 79-finding audit count.

## Corrected drop caps and flattened page font validation

A hands-on PDF/PNG check of the same legacy zine found two export defects that were independent of
the project file. The opening story frame still contained its authored `dropCapLines: 3` setting,
and the live exact-text renderer correctly shaped its first glyph at three times the regular scale.
Print HTML, however, sent plain-text frames directly through the inline-text encoder and never
created the `.paper-dropcap` block used for rich paragraphs. Browser PDF and flattened PNG/SVG
therefore received ordinary opening text even though the canvas understood the setting.

The flattened-page verifier also compared every raw alias in the complete-document font manifest
against the body of each individual page. Managed aliases inside `@font-face` rules are deliberately
hex-escaped, and a single page need not use every face the document embeds. An unused Newsreader
italic face was therefore misreported as a missing alias after the PDF had already been written,
leaving a saved file and a late `Export failed` dialog at the same time.

The corrected export behavior is:

- A plain-text frame with a two- through eight-line drop-cap setting emits the same drop-cap block
  as the live canvas; rich paragraphs inherit the frame setting when they do not override it.
- PDF, flattened SVG, and PNG paths retain that markup, so the opening glyph is not silently reduced
  to ordinary body text.
- A page may embed the complete document's exact-font payload even when it does not use every face.
  Unused faces no longer create a false failure.
- Validation remains fail-closed in the direction that matters: every managed alias actually
  requested by the page body must appear in the embedded identity manifest, the complete CSS/byte
  payload must be present in the isolated SVG, and each declared face must still pass exact browser
  readiness checks before raster paint.

Permanent regressions cover plain-print drop caps, flattened-output drop caps, a valid multi-face
payload with an unused italic face, and a page that requests an undeclared alias. The actual zine
source now produces `<div class="paper-dropcap" style="--sl-dropcap-lines: 3">` around “The first
version…”. In the freshly installed app, all 47 visible managed-text layers reached `ready`; the
opening glyph rendered at scale `0.0135` versus `0.0045` for the following glyphs, with measured
on-canvas bounds approximately 28 × 33 pixels versus 8 × 11 pixels. No Paper alert was present.

The implementation and permanent regression evidence are in commit `fdb07b1d`. This is another
post-audit runtime correction and does not change the 79-finding audit count.

## Relationship to the audit count

The build packages the integrated audit work, but the sale-copy change and internal letter identifier are later product/release changes. They do not create an 80th or 81st audit finding.

## Installation target

- Application Menu name: `Sloom Studio`
- Stable install directory: `~/.local/opt/signal-loom`
- Desktop entry: `~/.local/share/applications/signal-loom.desktop`
- Expected About version: `Sloom Studio 0.9.12d`

## Verification record

The July 18 installation completed and passed all of the following:

- Production TypeScript + Vite build: 3,287 modules.
- Electron Builder pre-package font check: 116 families, 430 faces, 546 declared payload files.
- Electron Builder post-package check: exact bundled face and license request passed.
- Installed `app.asar` metadata: `0.9.12-d`; user-facing formatter present; expected display `0.9.12d`.
- Installed font resource smoke: Liberation Sans Regular, 410,712 bytes, exact SHA-256 `76d04c18ea243f426b7de1f3ad208e927008f961dc5945e5aad352d0dfde8ee8`; license, 4,414 bytes, exact SHA-256 `93fed46019c38bbe566b479d22148e2e8a1e85ada614accb0211c37b2c61c19b`.
- Desktop file validation passed.
- Application Menu `Exec` points at `/home/cabewse/.local/opt/signal-loom/signal-loom`, not a development server.
- Installed executable byte-compares equal to the freshly packaged executable.
- Installed `app.asar` byte-compares equal to the freshly packaged archive.
- Installed executable SHA-256: `134b72e0eb5a85ffaf2dfd85d98fd67b9d242b644297b12362ac995b178ff08f`.
- Installed `app.asar` SHA-256: `044a014fb2c919c5279b61ceda1043d98ad4f8225b901ee01efcb4b9e8ef8292`.
- Installed application size: approximately 1.1 GiB, including the verified font library.

The corrected blank-start implementation also passed 26 focused startup/complete-recovery tests and
the broader startup, project replacement, authority, Paper store, Image store, Electron, i18n, and
version set: 296 relevant tests passed. Application TypeScript, touched-file lint, website verification,
and `git diff --check` passed before packaging.

The legacy-project Paper/title correction passed 26 focused tests and a 145-test neighboring set
covering exact fonts, rich editing, browser/native export, project portability, settings hydration,
license races, and backup. TypeScript, touched-file lint, Electron syntax, `git diff --check`, and the
3,287-module production build passed. A real Chromium instance accepted all nine corrected
descriptors. Finally, the freshly installed Application Menu binary was launched with the normal
licensed profile and the actual zine project: Flow held the single title `Sloom Studio` for six
seconds; Paper loaded 16 pages, reached `document.fonts.status === "loaded"`, and showed no managed
font, timeout, recovery, or project-sync error over a 25-second observation. The isolated
clean-profile negative check correctly stopped because the old project omits its portable asset
section, which is the documented file limitation above rather than a license or renderer failure.

The drop-cap/raster correction passed 75 focused export tests, a 93-test Paper neighborhood,
TypeScript, touched-file lint, `git diff --check`, the Paper production verifier, the 3,287-module
production build, and both Electron Builder font-package checks. A complete repository run reported
seven unrelated failures in older Source Library source assertions, LAN Image host mocks, Paper
preflight fixtures with conflicting synthetic asset metadata, one Flow-store isolation case, and
the previously recorded provider smoke timeout. None of those failures imports or exercises the
four files changed by `fdb07b1d`; they are recorded rather than hidden or attributed to this repair.

One provider-telemetry case in the older general `appSmoke` file continued to time out in its mocked
request path, including when run alone with a longer timeout. It is outside the startup, project,
Paper, Image, pricing, version, and packaging paths changed here; this is recorded rather than
misrepresenting the broad smoke file as fully green.

The stable Application Menu entry now targets the corrected, repaired `0.9.12d` package.
