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
- Installed application size: approximately 1.1 GiB, including the verified font library.

The corrected blank-start implementation also passed 26 focused startup/complete-recovery tests and
the broader startup, project replacement, authority, Paper store, Image store, Electron, i18n, and
version set: 296 relevant tests passed. Application TypeScript, touched-file lint, website verification,
and `git diff --check` passed before packaging.

One provider-telemetry case in the older general `appSmoke` file continued to time out in its mocked
request path, including when run alone with a longer timeout. It is outside the startup, project,
Paper, Image, pricing, version, and packaging paths changed here; this is recorded rather than
misrepresenting the broad smoke file as fully green.

The stable Application Menu entry now targets the corrected, repaired `0.9.12d` package.
