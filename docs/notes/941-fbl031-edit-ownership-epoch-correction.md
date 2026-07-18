# FBL-031 edit-ownership epoch correction

## Follow-up scope

Independent edge-case review confirmed the shared-record open queue in `6a727b50` and identified one
remaining state-continuity gap. The prior transaction signature compared managed mode and holder ID.
If baseline capture paused while the local holder at `heldSince=1000` transferred to another holder at
`heldSince=2000` and the local device later reacquired control at `heldSince=3000`, the starting and
ending holder IDs matched even though the original ownership interval had ended.

Production and permanent regression coverage for this author correction are in `80700a3f`, on top of
the earlier correction evidence without rewriting history.

## Correction

- The edit-lock store now maintains a local `ownershipEpoch`. It advances when the stable ownership
  identity changes between unmanaged, managed-free, or a particular holder grant.
- A holder grant is identified by device ID plus `heldSince`. `projectEditLock` already assigns
  `heldSince` at grant time and leaves it unchanged during normal heartbeats; its contract comment and
  permanent heartbeat test now state that invariant explicitly.
- Revision and expiry-only heartbeat updates therefore preserve the ownership epoch, while release,
  transfer, reacquisition, and managed/unmanaged transitions advance it.
- The standalone Paper open transaction binds its captured edit scope to managed mode, holder ID,
  holder grant epoch, and the store continuity epoch. Returning to the same holder no longer makes an
  earlier transaction current again.
- Queued standalone opens still capture ownership only when they reach the queue head. A request that
  was waiting during a transfer can proceed if the current holder is allowed when its own transaction
  begins; the earlier in-progress request is rejected and restores its exact asset baseline.

## Permanent regressions

`src/lib/paperStandaloneDocumentOpen.test.ts` now contains 17 direct state-machine tests. New controls
prove:

1. a normal same-holder heartbeat keeps the stable grant and store ownership epochs and remains valid;
2. release during paused baseline capture rejects the open and restores the exact prior record;
3. the deterministic local `1000` → other `2000` → local `3000` sequence rejects the original open
   despite matching starting and ending device IDs, with exact record restoration;
4. unmanaged → managed → unmanaged during the transaction is also a continuity break; and
5. after the first queued transaction becomes stale, the following request captures the current epoch
   at the queue head and commits normally.

`editLockStore.test.ts` directly pins stable heartbeat behavior and epoch advancement across a
return-to-local sequence. `projectEditLock.test.ts` pins that a same-holder re-claim extends expiry
without changing `heldSince`.

## Verification

- Direct ownership tests: **2 files / 28 tests passed**.
- Focused and adjacent state/route matrix: **9 files / 129 tests passed**.
- `npx tsc -p tsconfig.app.json --noEmit --incremental false --pretty false`: passed.
- `npx tsc -p tsconfig.node.json --noEmit --incremental false --pretty false`: passed.
- ESLint over all six correction files: passed with no output.
- `git diff --check`: passed.
- `npm run build`: passed; Vite transformed 3,282 modules and completed the production bundle. Existing
  browser-externalization and large-chunk warnings remain non-fatal.

This is follow-up author correction evidence only. It does not claim independent approval,
integration, or audit closure.
