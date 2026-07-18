# FBL-032 / FBL-034 typography localization and exact specimens

## Scope and authority

- Date: 2026-07-18
- Exact author base: `65b1d910347d3d69a62b39de232422eff36e3d41`
- Production commit: `8b9e39ce`
- Findings: FBL-032 and FBL-034
- This is a scoped author lane. It does not self-approve, integrate, or claim audit closure.

These findings share `BundledFontBrowser`, its permanent component coverage, and the locale catalog,
so their implementation is one code-path-aligned commit rather than two commits that would leave an
intermediate misleading preview or partially localized browser.

## FBL-032 correction

The rich-selection typography panel, Paper document tabs, shared audited font browser, and Inspector
kerning choices now source user-visible copy from the app locale catalog. English and Japanese entries
cover labels, controls, roles, tooltips, accessibility names, dynamic document titles, singular/plural
family/face/page counts, dirty state, recovery/handoff actions, loading/empty/error states, and the
font-output disclosure.

The rich typography panel now reacts to a persisted locale change without remounting. Japanese
coverage directly renders its character, paragraph, kerning, colour, Japanese-typesetting, and help
surfaces. Paper tab coverage pins Japanese dynamic titles, page counts, dirty markers, tooltips, close
actions, and discarded-document recovery. Font-browser coverage pins Japanese role/search copy,
singular summaries, output truth, tooltip, empty results, and catalog errors.

## FBL-034 correction

The chooser no longer places the family row or `Ag あア` sample behind the generic `font-sans` stack.
Each visible specimen goes through the existing audited managed-font readiness path:

1. register and verify the exact bundled face bytes;
2. construct its durable exact-face reference;
3. resolve the content-addressed runtime family alias; and
4. apply its exact weight, style, stretch, and sorted variable-axis coordinates.

Until registration succeeds, the browser displays a localized preparation status in the ordinary UI
font. A failed registration displays a localized unavailable status rather than falsely rendering the
sample in a fallback. `IntersectionObserver` defers real-browser registration to visible rows while
retaining a deterministic immediate path in environments without the observer.

Permanent tests fail the former `font-sans` behavior by requiring the content-addressed managed alias,
ready state, exact face descriptors, and variable coordinates on the sample itself. Existing bridge
replacement tests distinguish catalog fetches from the new legitimate exact-face byte fetch, preserving
their capability and stale-authority guarantees.

## Verification

- Focused browser, i18n, Paper tab/rich-panel, source-contract, and bundled-font suites:
  **6 files / 61 tests passed**.
- Adjacent settings, Image text, Video font gate, managed-font persistence, Paper document/save/native
  sync/formats, font resolution, rich-text round-trip/leading, text composition, and threading suites:
  **16 files / 186 tests passed**.
- `npx tsc -p tsconfig.app.json --noEmit --incremental false --pretty false`: passed.
- `npx tsc -p tsconfig.node.json --noEmit --incremental false --pretty false`: passed.
- Touched-file ESLint: zero errors; four pre-existing `PaperWorkspace` hook warnings only.
- `git diff --check`: passed.
- `npm run verify:paper-production`: passed.
- `npx vite build --configLoader=runner`: passed; Vite transformed 3,283 modules. Existing
  browser-externalization and large-chunk warnings remain non-fatal.

Generated Paper verification outputs were retained outside the worktree at
`/mnt/d/work_SPaC3/build-artifacts/fbl032-fbl034-typography-ui-20260718` rather than deleted.

## Handoff

A fresh independent reviewer should confirm Japanese copy coverage on all four surfaces, exercise
locale switching with the font browser open, and verify that ready specimens cannot show a family
fallback after bridge replacement or exact-byte registration failure. Only a clean exact tip with that
independent approval may be integrated.
