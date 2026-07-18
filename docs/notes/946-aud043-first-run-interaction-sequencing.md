# AUD-043 first-run interaction sequencing — 2026-07-18

## Outcome

Production/tests commit `4cfecb64` replaces two independently mounted startup overlays with one
deterministic interaction sequence after persisted settings are authoritative:

1. While settings hydration is pending, neither startup interaction is mounted.
2. A profile without a confirmed locale sees only the bilingual language chooser.
3. Selecting a locale atomically completes the language step before the Community notice begins
   its existing license/day-claim decision.
4. A returning profile with a confirmed locale proceeds directly to the Community decision.

Because the sequence returns exactly one child, the language chooser and Community notice cannot
overlap in one React commit. `App.tsx` changed only at the import and the two former mount points so
the work remains straightforward to reconcile with concurrent App work.

## Localized Community notice

All Community notice title, body, price, action, and countdown copy now comes from the shared i18n
catalog. The component subscribes to the active locale through `useI18n`, so the first notice shown
after choosing Japanese is Japanese and a later Settings locale change updates an already-visible
notice immediately. Japanese prose joins without inserted Western spacing.

## Permanent regression coverage

`StartupInteractionSequence.test.tsx` composes the real language chooser, Community notice,
settings store, locale catalog, and day-claim helper. Old independent-mount behavior fails these
cases. The tests prove:

- no startup overlay appears before settings hydration settles;
- a fresh profile sees the language chooser without a Community overlay or premature day claim;
- Japanese selection removes the chooser before a Japanese Community notice appears;
- returning users never see the language chooser after delayed hydration;
- live locale changes update a visible notice immediately;
- dismissing the displayed notice preserves its day claim across a full sequence remount; and
- no tested transition contains both startup overlays.

Existing Community tests continue to prove late licensed hydration never flashes a notice,
community hydration waits, abandoned decisions release their claim, and simultaneous windows show
exactly one notice.

## Author verification

- Focused startup/i18n matrix: **5 files passed; 26 tests passed**.
- Adjacent Layout/App/i18n matrix: **15 files passed; 72 tests passed**.
- `npx tsc -p tsconfig.app.json --noEmit --incremental false --pretty false` — passed.
- `npx tsc -p tsconfig.node.json --noEmit --incremental false --pretty false` — passed.
- Touched-file ESLint — passed with zero errors; the existing synchronous licensed-notice dismissal
  effect retains its prior React advisory warning.
- `git diff --check` — passed.
- `npm run build` — passed; **3,286 modules transformed**, with only the established runtime-URL,
  browser-module externalization, deprecation, and chunk-size warnings.

## Changed files

- `src/App.tsx`
- `src/components/Layout/CommunityStartupNotice.tsx`
- `src/components/Layout/FirstRunLanguageGate.tsx`
- `src/components/Layout/StartupInteractionSequence.tsx`
- `src/components/Layout/StartupInteractionSequence.test.tsx`
- `src/lib/i18n.ts`

The isolated worktree measured approximately **329 MiB** after verification, including a **22 MiB**
ignored production build. The shared `node_modules` dependency is a removable symlink and is not
included in that disk usage.

## Residual concern

The Japanese Community copy is wired and deterministically rendered, but—as with the existing
Japanese catalog—it should receive native-speaker editorial review before a Japanese release.
The existing storage-only fallback limitation for simultaneous day claims is unchanged and remains
documented in `communityNoticeDayClaim.ts`; Web Locks keep supported production runtimes serialized.

This is author evidence only. Fresh independent review is still required before integration or
AUD-043 closure.
