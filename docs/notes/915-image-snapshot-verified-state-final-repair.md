# Image snapshot verified-state final repair

Terra's third final-gate BLOCK is repaired in production/tests commit
`71d7f1168ead19f14984f703e2432f47d07daf51`. The lineage ledger in
`overlap-sol-image-snapshot-integrity-2026-07-16.md` now retracts the affected
`830da48` final-approval and performance claims without rewriting history.

Current version-2 snapshots require a unique, nonempty, exact one-to-one layer
id/proof id set before content verification. Deep role/dimension/layer-aware
SHA-256 verification occurs at explicit creation, decode, history
materialization, save, and Restore boundaries. Immutable owned resources carry
an exact-object verified-state binding, so React render, History descriptors,
automation, and readiness do no pixel readback or hashing; replacement and
disposal invalidate the binding.

Project and `.slimg` preflight bound snapshots to 12 per document, 96 per
project, 2,048 layers per snapshot, 16,384 per dimension, and 768 MiB aggregate
decoded snapshot pixels. Transport presence/reference dimensions and PNG IHDR/
compressed-input budgets are checked before codec/browser pixel allocation.
Legacy snapshots remain unavailable and current corruption remains
transactional with exact resource cleanup.

Final evidence is 21 files/217 tests for the prior matrix plus identity,
caching, invalidation, bounds, React rerender, and PNG preallocation coverage;
18 focused integrity tests; forced non-incremental app/node TypeScript;
changed-file ESLint with zero errors/warnings; diff checks; and the CI
production build. Remaining caveats are explicit-boundary O(pixel) cost,
browser-managed backing-store reclamation timing, and SHA-256 integrity rather
than authenticity.
