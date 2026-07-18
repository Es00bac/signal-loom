# FBL-031 concurrent standalone-open ownership correction

## Superseding scope

Fresh review rejected the earlier FBL-031 evidence at `2bcead15`: two allowed standalone
`.slppr` opens could prepare the same previously absent content-addressed record concurrently. Both
transactions then held an `undefined` rollback baseline. If one tab committed while the other became
stale, the stale transaction could delete the shared record and orphan the successful tab.

Production and permanent regression coverage for this superseding author correction are in
`6a727b50`, on top of the rejected evidence without rewriting it.

## Correction

- `openStandaloneSlpprDocument` now serializes the complete canonical open transaction: current
  project-authority check, Paper/edit-baton capture, package decode, baseline capture, managed-record
  publication, exact-authority tab commit, finalization, and rollback.
- The queue is limited to standalone package opens. Unrelated Paper, Flow, Image, Video, and project
  work remains concurrent.
- Every production standalone route already enters this helper: native Paper menu, browser/Android
  picker, native external-open delivery, and baton-handoff continuation. The queue therefore also
  orders handoff and direct-open races rather than protecting only one UI route.
- A rejected request settles its queue position before the next starts. Publication failure cannot
  poison the queue or prevent a later valid package from opening.
- Mutable package bytes and option values are owned at submission. Paper/edit-baton/project authority
  is captured and checked when the request reaches the queue head, so a queued stale desktop request
  fails before staging and cannot roll back the preceding winner's record.

Serialization is required because exact per-transaction rollback is not reference-safe when two
transactions can both observe the same digest as absent. Once baseline capture and finalization are
mutually exclusive, a later same-digest request observes the winner's committed record as its real
baseline and cannot classify that record as its own newly introduced content.

## Permanent regressions

`src/lib/paperStandaloneDocumentOpen.test.ts` now has 13 direct state-machine regressions. The four
new controls prove:

1. a second same-record open cannot enter baseline capture while the first is pending, both tabs
   settle in submission order, and the shared record survives;
2. concurrent submissions containing different records retain both records and both documents;
3. an injected first atomic-publication failure rolls back exactly and the following queued request
   still commits; and
4. project authority that becomes stale while queued is rejected before staging while the preceding
   same-record winner and its managed bytes survive.

The earlier remote-holder, local-holder, baton-transfer, same-holder heartbeat, Paper drift, desktop
authority, duplicate-tab/path, and observer-exception controls remain green.

## Verification

- Direct regression: **1 file / 13 tests passed**.
- Focused and adjacent ownership matrix: **6 files / 94 tests passed**.
- `npx tsc -p tsconfig.app.json --noEmit --incremental false --pretty false`: passed.
- `npx tsc -p tsconfig.node.json --noEmit --incremental false --pretty false`: passed.
- ESLint over both correction files: passed with no output.
- `git diff --check`: passed.
- `npm run build`: passed; Vite transformed 3,282 modules and completed the production bundle. The
  existing browser-externalization and large-chunk warnings remain non-fatal.

This is superseding author correction evidence only. It does not claim independent approval,
integration, or audit closure.
