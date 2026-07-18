# 929 — AUD-019 Paper workspace and managed-asset sync correction

## Audit failure

Paper sync seeded and emitted only `state.document`. Although snapshot metadata listed reachable
asset ids, the channel never transferred or fetched the corresponding managed records. Remote apply
then changed only the live document body, leaving the ordered `documents` catalog and
`activeDocumentId` stale. A clean receiver could therefore show broken managed image, font, or ICC
references, while switching between two tabs could replace an unrelated active body.

The permanent workspace-envelope assertion was run before production changes. It failed with the
historical value exactly: expected a versioned workspace snapshot and received the bare
`paper-document-snapshot`.

## Corrected protocol

- Schema-v1 Paper snapshots carry the complete ordered tab catalog, each tab's document and editor
  state, the exact active tab id, and the complete deduplicated `BinaryAssetRef` inventory reachable
  across all tabs. Local filesystem save provenance is deliberately excluded.
- The discriminator remains `paper-document-snapshot` and retains the active `document` field. An
  older receiver therefore follows its known active-document path instead of falling through an
  unknown change type; current receivers authenticate and atomically apply the `workspace` member.
- Outbound sync recomputes reachability from authored content, verifies repository metadata and
  SHA-256 bytes, declares/pins the whole inventory, receives authority acknowledgement for each
  upload, and publishes the JSON envelope only after every record is available.
- The host cache retains the declared current inventory together even when it exceeds the generic
  256-entry transient pixel tail, then prunes records superseded by the next inventory.
- Inbound sync stages every missing managed image, font/license, and ICC record, verifies its exact
  id/hash/MIME/length, and writes records only after the complete set passes. Missing, corrupt,
  mismatched, malformed, repaired, or incomplete input leaves both the repository and live workspace
  unchanged.
- Async outbound work and inbound apply are serialized, preventing a slower older transfer from
  landing after a newer arrival.
- Store apply replaces catalog, active identity, and active body in one state transition while
  preserving only device-local save provenance for matching tabs and clearing stale undo histories.
- Historical frame/document changes remain accepted. They route by document/page identity, update
  the matching catalog entry and live body coherently, and reject ambiguous unrelated multi-tab full
  replacement.

## Permanent coverage

The new clean-receiver suite proves:

- two ordered tabs and exact active-tab identity;
- managed artwork, a custom managed font, and a managed ICC profile with exact bytes and hashes;
- inventory and bytes publication before the workspace event;
- zero state/repository publication for missing or corrupt transfer and zero metadata publication
  when the sender lacks a reachable record;
- serialized concurrent envelopes with a delayed older fetch;
- legacy single-tab replacement/catalog coherence and unrelated multi-tab rejection;
- acknowledged authority upload behavior and a retained inventory larger than 256 records.

## Verification

- Old-code red: 1 focused failure — expected the workspace envelope, received a bare document
  snapshot.
- Final sync/store/transport matrix: 7 files, 67 tests passed.
- Adjacent Paper assets/store/project validation/sync/LAN matrix: 7 files, 160 tests passed.
- Nonincremental application TypeScript passed:
  `npx tsc -p tsconfig.app.json --noEmit --incremental false --pretty false`.
- Nonincremental node TypeScript passed:
  `npx tsc -p tsconfig.node.json --noEmit --incremental false --pretty false`.
- Touched-file ESLint passed with no output.
- `git diff --check` passed.
- `npm run verify:paper-production` passed. Generated PDF/X, separations, and JSON evidence is
  preserved outside the worktree at
  `/mnt/d/work_SPaC3/verification-artifacts/aud019-paper-sync-20260717/`; its `SHA256SUMS.txt` verifies
  all 15 outputs.

Production and permanent tests are commit `d8c763c`. This is author evidence only. A fresh
independent gate must inspect and approve the exact clean branch before integration or audit closure.
