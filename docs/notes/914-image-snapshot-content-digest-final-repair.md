# Image snapshot content-digest final repair

Terra's final Image snapshot BLOCK is repaired in production/tests commit
`37cc1fb61fad41b1503ab96d38567056d4b75921`. The existing evidence ledger at
`docs/notes/overlap-sol-image-snapshot-integrity-2026-07-16.md` now retracts the
second false approval and contains the exact red/green proof.

The snapshot integrity contract is version 2 and hashes canonical decoded RGBA8
bitmap/mask bytes or alpha8 selection bytes with SHA-256. The digest domain also
binds asset role, layer identity, dimensions, and payload length. Snapshot
creation plus project JSON and `.slimg` save boundaries recompute proof;
decoders verify it before exposing a complete/restorable snapshot.

Current-format mutation, swaps, malformed or removed digests, and mismatches
throw transactionally. Partial decoded resources are released once and prior
live Image state remains intact. Proof-less/version-1 snapshots remain legacy
and unavailable. Restore UI and automation readiness continue to use the same
central inspection function, now with content verification.

Final local evidence is 20 files/207 tests for the prior matrix plus new digest
coverage, a focused 4-file/8-test digest gate, forced non-incremental app/node
TypeScript, changed-file lint, diff checks, and the production build. The main
remaining cost is synchronous O(pixel) Canvas readback and hashing; SHA-256 is
content integrity, not authenticity against an attacker who can rewrite both
payload and manifest.
