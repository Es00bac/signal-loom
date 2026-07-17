# 914 — AUD-015 ordered settings/license convergence

**Production/test commit:** `b2880b9` (parent `3cecddb`). This supersedes the ownership model described in note 909; it does not change the sanitizer, backup format, first-boot latch, day notice, or Zustand replace/function semantics.

## Corrected ownership model

The prior late-hydration guard used a single global set of locally-mutated keys. That set could protect a write forever: after window A had completed an activation, window B could persist and broadcast a removal, yet A's rehydrate drained its old marker, retained the old key, and convergence-wrote it back.

`settingsStore` now records a revision per top-level key and captures a revision at each hydration read's start. A merge preserves only a mutation made after *that read* began. The active read also records the durable write stamp carried by the encrypted snapshot. A not-yet-persisted local mutation remains protected against an older/no-stamp read, but a completed newer snapshot with a larger stamp wins. Failed reads clear their own epoch before recovery. This keeps the late-read guarantee while allowing completed remote state to converge.

Every settings write reserves a monotonic `flow-settings-storage:write-version` sidecar before encryption, stamps the encrypted JSON envelope, and rechecks the reservation after encryption. A delayed older encryption is skipped when a newer renderer has reserved the next version. License broadcasts occur only after the stamped write reaches storage.

License activation and backup import now claim their identity generation before their first await. They commit only when that generation is still current. Removal, imports, merges, and activations therefore invalidate older verifier/decrypt continuations; rejected or superseded activations do not write a key or verdict. Canonical same-key revalidation and coalescing remain unchanged.

## Permanent deterministic coverage

- Real two-window BroadcastChannel/storage removal after A's completed activation marker: all windows and disk stay unlicensed.
- Unrelated API-key removal plus another provider-setting change: an old local API-key marker cannot restore the key.
- Three-window remove then activate ordering converges each renderer and disk.
- A newer broadcast arriving before an older renderer's delayed encryption wins; the older physical write is skipped.
- Activation then removal, and activation then backup import, discard the older valid verification result.
- Overlapping reads, local writes during both reads, and decrypt read-failure followed by recovery retain the correct owner.

## Evidence

| Check | Result |
| --- | --- |
| Red proof at `3cecddb` after first four permanent regressions | 4 failed / 13 total (two stale-marker convergence defects; activation→remove and activation→import) |
| AUD-015 focused hostile matrix | 4 files, 24/24 passed |
| Neighbor license/settings matrix | 11 files, 66/66 passed |
| `npx tsc -b --force` | passed |
| Targeted ESLint and `npm run lint` | 0 errors, 0 warnings reported |
| `git diff --check` | clean |
| `CI=1 npm run build` | passed |

## Limits and gate

The sidecar assumes normal browser/Electron localStorage availability and all settings writers using this persistence adapter. If storage is unavailable, the existing memory-only behavior applies and cross-window ordering cannot be coordinated; failed writes deliberately do not broadcast. General settings do not gain a BroadcastChannel contract—only license identity does—so non-license windows converge on their next ordinary rehydrate. A fresh external provider must perform the requested final gate; this author does not self-approve.
