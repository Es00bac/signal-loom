# AUD-040 canonical/replay/retry/Source gap correction

Base: clean `aa35bbf792d12e5e75482ad23a4020b622082076`.

Production/tests: `0e07992`, `e9381ee`, `88aae77`, `a325a67`. This is Sol correction
evidence for a fresh independent gate, not approval.

## Correction

- Document queue identity now resolves the actual filesystem object before enqueue: safe
  `realpath`, regular-file validation, device/inode identity where observable (including hard
  links), and platform-aware path fallback. Missing targets fail as `missing-file`.
- Each bounded OS delivery identity gets an exact non-expiring SHA-256 receipt digest. Receipts
  have no time or capacity eviction; a repeated delivery ID cannot replay after 512 intervening
  commits, while a genuinely later delivery ID can open the same canonical file.
- Accepted renderer replacement has four autonomous delayed commit-only retries. Replacement,
  acceptance, and renderer path publication remain exactly once; stale epochs do not retry, and
  disposal/reload/crash cancels the remaining retry sequence.
- External project staging records the Source version and staged snapshot. Reject/failure/revoke
  restores transaction-owned state and three-way applies concurrent Source additions, removals,
  renames, bins, and dismissals instead of restoring a captured whole snapshot.
- Electron 41's `requestSingleInstanceLock(additionalData)` path stranded the loser during the
  first live gate. `e9381ee` retained the proven bare argv lock and winner-minted delivery IDs;
  `88aae77` made probe cleanup wait until its temporary user-data path remains absent.

Permanent regressions cover relative/Unicode/spaces paths, real/symlink/hard-link aliases,
Linux/Windows case fallback semantics, missing/non-file rejection, pending/committed duplicates,
512-entry delayed replay, genuine later delivery, dirty rejection, stale epochs, transient retry,
retry exhaustion, reload/crash disposal, exact transition/apply/commit/publication counts, and
concurrent Source mutation.

## Final evidence

- Focused: 5 files / 93 tests passed.
- Neighbors: 10 files / 89 tests passed (15 files / 182 tests combined).
- `tsc -b --force tsconfig.app.json`, `tsconfig.node.json`, and root: passed.
- ESLint on all seven changed-lineage JS/MJS/TS files: passed; no output.
- Node syntax for external-open, main, preload, and lifecycle probe: passed.
- `git diff --check aa35bbf --`: passed.
- `CI=1 npm run build`: passed; 3,252 modules transformed.
- Electron 41.3.0 under Xvfb: winner stayed live, loser exited 0, and
  `Comic 週刊.sloom` committed through native argv, renderer acceptance, and canonical path
  publication. Final probe left no matching process or `/tmp/sloom-single-instance-probe-*` path.

## Residuals

- Only Linux/Xvfb has live two-process proof. Windows argv/case behavior and macOS
  `open-file`/`open-url` remain permanent static/unit coverage; no Windows/macOS live proof is
  claimed.
- Receipt digests are process-local by design, so a new app session is a new user-open authority.
  Within a session the set retains one fixed-size digest per committed external delivery and does
  not evict; there is no network-facing or renderer-controlled enqueue path.
