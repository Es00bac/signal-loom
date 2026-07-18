# FBL-031 standalone `.slppr` ownership transaction

## Scope

FBL-031 found that standalone Paper package opens mutated renderer-local Paper state outside the
ownership path used for coordinated project work. A renderer that did not hold the cross-device edit
baton could therefore open a local `.slppr`; the host would reject its later remote publication, but
the local tab catalog and managed-record repository had already diverged.

Production and permanent regression coverage are in `f8999909`, authored from exact clean main
`5931420f42c3e1654090f3be54ee1f70d6a313ab`.

## Correction

- `openStandaloneSlpprDocument` is the single additive open transaction for the native Paper menu,
  browser/Android content-aware picker, native external-open queue, and Paper baton-handoff cards.
- The transaction captures the exact Paper tab/content/baseline authorization and current edit-baton
  owner before package work. A remote holder blocks the operation before any package record is staged.
- Desktop callers additionally bind the operation to one adopted, non-stale project authority. A
  save/open/adoption in another window invalidates the delayed standalone open.
- `.slppr` v1 migration and v2 extraction now run against an off-store overlay. The complete managed
  record set is published only after package validation and an ownership recheck.
- Publication uses the repository's atomic batch seam when available and retains the exact prior
  record baseline until the synchronous Paper tab commit succeeds. A baton transfer, Paper edit/tab
  change, project-authority change, repository failure, or rejected store authorization restores
  overwritten records and removes newly introduced records.
- The baton token binds managed/unmanaged mode plus holder identity. Take, yield, release, and force
  transitions invalidate an open, while a same-holder heartbeat may advance revision/expiry without
  spuriously rejecting a large package.
- The Paper store requires an exact workspace authorization for `openDocumentJson`, commits without an
  await between the authorization check and state assignment, preserves the standalone backing path,
  and treats an observer exception after Zustand assignment as committed so managed bytes cannot be
  rolled back out from under a live tab.
- Standalone opens remain additive. Existing tabs, dirty baselines, and the user's Save/Discard/Cancel
  choices are not replaced or rewritten; reopening the same document creates a unique clean tab with
  its own backing path.

## Entry-point convergence

| Entry point | Shared transaction behavior |
| --- | --- |
| Paper File → Open | Native bytes and acknowledged path enter the exact ownership transaction. |
| Browser / Android picker | Content-classified Paper bytes enter the same transaction without claiming a writable native path. |
| Native external open / second instance | The accepted intent remains serialized with project transitions and retains its exact file path. |
| Baton handoff Continue card | The gaining device must currently be allowed to edit before the transported package can add a tab. |

## Permanent regressions

`src/lib/paperStandaloneDocumentOpen.test.ts` provides nine direct state-machine regressions:

1. successful additive open retains a clean standalone baseline, exact path, and managed bytes;
2. another device's baton blocks both tab and repository mutation;
3. the current baton holder can open the package;
4. a mid-open baton transfer restores an exact corrupt/pre-existing record baseline;
5. a same-holder heartbeat does not masquerade as an ownership transfer;
6. Paper workspace drift rolls records back and adds no tab;
7. desktop project authority is required initially and revalidated after record publication;
8. duplicate document identity reopens as distinct clean tabs with independent paths; and
9. an observer exception after Zustand assignment cannot orphan the committed tab's records.

Existing `.slppr` format, Paper store, Paper baton-handoff, and native external-open tests were retained
and updated to prove every entry point uses the canonical transaction.

## Verification

- Focused/adjacent matrix: **5 files, 75 tests passed**.
- `npx tsc -b --pretty false`: passed.
- ESLint over all eight touched production/test files: passed with no output.
- `npm run lint`: passed with **0 errors**; the repository still reports its existing 84 warnings.
- `npm run build`: passed; Vite transformed 3,282 modules and completed the production bundle.
- `git diff --check`: passed.
- Full `npm test`: **708 files / 6,706 tests passed**; 7 failures in 5 unrelated files reproduced
  identically in a temporary detached worktree at exact base `5931420f`. One additional suite initially
  lacked the generated `build/font-library` fixture in the isolated worktree; with the existing verified
  library linked, `bundledFontPdfxIntegration.test.ts` passed 1/1. The temporary baseline worktree and
  fixture link were removed after comparison.
- Storage remained bounded: `/home` had 24 GiB free and `/mnt/d` had 452 GiB free during final checks.

This is author correction evidence only. It does not claim independent approval, integration, or audit
closure.
