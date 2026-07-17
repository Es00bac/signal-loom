# 916 — AUD-015 per-key convergence superseding correction

This supersedes the scalar `:write-version` / `:committed-write-version` approach recorded in note 915.

## Durable representation

Settings writes now treat the encrypted full Zustand blob as a compatibility cache only. Durable truth is an encrypted, immutable operation record per logical setting path (including individual API-key providers, provider settings, model defaults, and `licenseKey`). Each record carries a Lamport counter and a renderer-unique actor identity; its identity is part of the localStorage key. Concurrent writers that both observed the same old state therefore append distinct candidates rather than racing a shared `read -> increment -> write` reservation. Reads select the deterministic maximum `(clock, actor)` and compact only records strictly dominated by that winner. Empty values are explicit records, so key/license removal is a tombstone rather than an omitted stale value.

The cache is written only after record writes. A crashed encryption/write has no in-flight claim capable of invalidating the prior cache; any committed records replay over that cache on the next read. `BroadcastChannel` remains advisory. `installLicenseCrossWindowSync` also reacts to `storage` events and a bounded change-token poll, and its cleanup releases the message listener, storage listener, and interval.

License activation and backup import now return `committed`, `superseded`, or `failed`; Settings UI success is shown only for `committed` operations. The Flow production verifier now checks semantic encrypted-serialization behavior rather than the obsolete `encryptSecret(value)` literal.

## Current evidence and residual

`npx tsc -b --force`, `npm run verify:flow-production` (313 tests), and `git diff --check` pass.

The focused settings run currently has two remaining legacy verifier-scheduling probe failures in `settingsStoreLicenseRace.test.ts` (same-key rehydrate and activation→backup-import). They are not being represented as a successful audit gate. The broader cross-window matrix passes after updating its former scalar-sidecar assertion to assert immutable durable records/change tokens. Fresh Sol approval remains mandatory; this note is evidence from the Terra correction author, not approval.
