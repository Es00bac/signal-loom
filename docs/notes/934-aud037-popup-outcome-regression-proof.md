# AUD-037 popup-outcome regression proof

## Scope

This lane reconciles the previously recorded AUD-037 production correction on
exact integration base `17b2f76e66fef5aa460d259cb7ccad0cde7bd7b5`. It is
permanent proof for an existing closure, not a newly implemented closure.
Production code was not changed.

The current implementation in `PaperWorkspaceUtils.ts`, introduced by
`d43026ef40da51c4f282b8136a66330d3ada6b5a`, already distinguishes a browser
print-dialog path from the popup-blocked HTML fallback. The PDF-export caller
maps the fallback to an error outcome with the fallback message instead of
claiming that a print dialog opened.

## Permanent regressions

`PaperWorkspaceUtils.test.ts` now proves four reachable outcomes:

1. A successful popup is written, focused, and printed before the helper
   returns its `printed` outcome.
2. A blocked browser popup creates and clicks the expected print-HTML download
   and returns `html-fallback`.
3. The PDF-export caller reports the blocked-popup fallback as an error, emits
   the same truthful status, and never claims that it opened a print dialog.
4. On Android, the same blocked-popup route delegates the HTML fallback to the
   Capacitor filesystem path and uses the expected filename.

## Verification

- Focused: `PaperWorkspaceUtils.test.ts` — 51/51 passed.
- Adjacent Paper export/font/paint sweep — 5 files, 91/91 passed.
- Touched lint: `npx eslint src/components/Paper/PaperWorkspaceUtils.test.ts`
  passed with no findings.
- Forced nonincremental TypeScript: `npx tsc -b --force` passed.
- Production verifier: `npm run verify:paper-production` passed. Generated
  verifier output was archived outside the worktree at
  `/mnt/d/work_SPaC3/aud037-paper-production-verification-20260718`.

## Closure accounting

This proof supports mapping AUD-037 to the already recorded closure total. It
does not increment that total again.
