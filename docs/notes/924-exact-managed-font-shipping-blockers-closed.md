# Exact managed-font shipping blockers closed

Base: `2212679b26a519d841743d622299fd911959c9fb`.

This correction preserves the useful interrupted Fable draft, replaces its false Chromium collection proof,
and closes the three requested shipping blockers. It is implementation evidence only; a separate reviewer
still decides approval.

## Closed invariants

1. The live rich editor resolves managed typography to the quoted digest alias, keeps the human family in a
   durable DOM mirror, and authenticates verified repository bytes through a bounded `FontFace` load plus the
   descriptor-specific `FontFaceSet` check before contentEditable paint or mutation. Inspector/session edits
   are transactional: authentication rejection leaves both DOM and Paper state unchanged. Weight, stretch,
   `wdth`/`wght` coordinates, and explicit oblique angle survive computed-style serialization and reopen.
2. TTC/OTC sources never emit CSS, a PostScript fragment, or `format("collection")`. Paper custom import,
   bundled Paper install/registration, live browser paint, browser output CSS, and native PDF readiness fail
   closed with recovery guidance to extract a standalone `.ttf`/`.otf`. Deterministic coverage rejects member
   zero, a nonzero selected member, and a nonexistent PostScript name before paint.
3. Paper Source Library and Paper-to-Video storyboard routes publish only successfully decoded PNG payloads.
   Exact payload construction/readiness is awaited, all Video storyboard rasters are prepared before the first
   Source Library mutation, and readiness/decode failures surface typed actionable errors with zero publisher
   calls. Raw SVG fallback was removed from both shipping callers.

## Supporting corrections

- Rich-text normalization now retains oblique descriptors, stretch, and finite four-character variation
  coordinates; these fields also participate in run-style and plain-to-rich promotion decisions.
- Digest-derived live CSS family names are quoted so the browser does not reject an otherwise verified alias
  as an invalid unquoted identifier.
- The exact manifest records standalone format and native PDF readiness independently rejects collection or
  nonzero-member payloads before `document.fonts.load()`.

## Verification

- Focused rich DOM/session/exact-font/Source/storyboard/Video/native-output matrix: 12 files / 154 tests passed.
- Broad neighboring Paper assets/fonts/portable assets/Source/Video workspace matrix: 30 files / 259 tests passed.
- `npm run verify:paper-production`: passed; generated proof artifacts removed after verification.
- `npm run prepare:font-library`: passed; audited library reported current.
- Nonincremental app and node TypeScript: passed with `--incremental false`. The composite default attempts to
  write build metadata into this worktree's shared read-only `node_modules` symlink.
- Production Vite build: passed with `--configLoader runner`. The default config loader likewise cannot write its
  temporary module into the shared read-only `node_modules` symlink.
- Changed-file ESLint passed with 0 errors and 17 warning-class findings; `git diff --check` passed.

## Residual limitation

TTC/OTC extraction is intentionally not implemented. Collection users must extract the selected face to a
standalone `.ttf` or `.otf` and re-import it; this is a fail-closed product limitation, not a fallback path.

## Commit packaging blocker

The validated tree could not be staged or committed in this execution environment. The worktree's Git index
is stored under `/home/cabewse/work_SPaC3/flow/.git/worktrees/flow-overlap-terra-exact-font-reconciled`, which
is mounted read-only; `git add` failed before staging with `index.lock: Read-only file system`. All production,
test, and handoff edits remain intact in the requested worktree.
