# FBL-027 routed edge contract final correction

## Scope and ownership

- Date: 2026-07-18
- Original exact base: `b0597e23508014c7536a540fcbda34b0cf39db4b`
- Rejected candidate tip: `dc48ef7ec8f2c930db102fd3e8972e217e305f2c`
- Final correction code and permanent regressions: `16fddd1ec83686ab02d72e336ea12a46a8c75f4d`
- Finding: FBL-027 persisted edge-contract refresh after node configuration changes.
- This is a correction-author lane. It does not self-approve or integrate the commits.

## Independent rejection proof

The candidate correctly refreshed ordinary source, target, handle, transitive, export/import, and
Composition-track-count contract changes, but two reachable routed cases remained untruthful:

1. A Portal route from a text source through an entry/exit pair to a Regex Replace target was
   annotated invalid because its hidden synthetic projection consumed the target's one public
   connection slot. After changing the source output to number, the carried type refreshed but the
   persisted reason remained the false maximum-connection diagnosis instead of the canonical
   `number cannot connect to text` incompatibility.
2. A Function output declared as audio and routed to a Composition audio lane remained annotated
   valid after the Function's current runtime `resultType` changed to video. The persisted contract
   continued to carry the declared audio port type even though both Composition display and
   execution already reject a Function whose runtime media family differs from the routed lane.

Both failures were reproduced at exact clean candidate tip `dc48ef7e` with disposable probes before
the correction. Those probes were removed; their cases now exist as permanent regressions.

## Correction

`validateFlowConnection` now treats Portal synthetic edges as hidden projections rather than public
connections:

- synthetic edges do not consume a target port's `maxConnections` or typed connection-group quota;
- validating a synthetic projection is not itself blocked by the visible route it represents; and
- visible edges retain the existing cardinality rules unchanged.

For Function-to-Composition media routes, validation now derives the carried family from the
Function's current runtime `resultType` on exact video and audio lane handles. That matches the
existing shared Composition display/execution policy. A missing or invalid runtime result type is
unknown rather than being represented as the declared output family.

The canonical compatibility stage remains authoritative for the final diagnosis, so contract
refresh records the current carried and accepted types and the corresponding type-family reason.

## Permanent coverage

- `flowConnectionContracts.test.ts` proves hidden Portal plumbing neither consumes nor is blocked by
  a public single-connection slot. Its adjacent pre-existing test continues to prove that two real
  visible connections are rejected.
- `flowStore.edgeContractRefresh.test.ts` proves a valid text-to-Portal-to-Regex route refreshes to
  current `number` carried type and canonical incompatibility after a source patch while retaining
  exactly one synthetic projection.
- The same store suite proves a Function routed to `composition-audio-1` refreshes from valid audio
  to invalid video, keeps the authored target handle, records the canonical family mismatch, and
  becomes valid again when runtime truth returns to audio.

## Verification

- Focused contract suites: **3 files, 196 tests passed**.
- Relevant Portal, Composition, import, native-sync, store, remote-sync, reference-group, and node
  adjacency: **12 files, 352 tests passed**.
- Flow production verifier: **9 files, 375 tests passed**.
- Static Flow audit: **63 node contracts, 182 model contracts, 178 normal model options**.
- Forced App TypeScript (`--incremental false`): passed.
- Forced Node TypeScript (`--incremental false`): passed.
- ESLint over the correction and candidate production/test files: passed.
- `git diff --check`: passed.
- Production build: passed; Vite transformed **3,281 modules** and completed the bundle.

## Unrelated exact-base failures

Two Source-persistence assertions encountered in broader runs are not caused by this correction.
Each was reproduced with the same assertion on untouched exact base `b0597e23` in a disposable
worktree, which was then removed:

- `flowRunOwnership.test.ts`, line 756: stale ownership removal still leaves one Source item.
- `flowRuntimeReconciliation.test.ts`, line 247: the corresponding Source persistence expectation
  also differs on the exact base.

FBL-027 changes only edge validation and its dedicated regression coverage; it does not alter the
Source publication or ownership paths.

## Handoff

The correction is ready for a fresh independent final gate. Review should begin from exact code
commit `16fddd1e` and must not treat this author evidence as approval.
