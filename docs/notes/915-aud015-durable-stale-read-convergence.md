# 915 — AUD-015 durable stale-read convergence

**Production/test commit:** `389977a` (parent `22f2bc7`). This supersedes note 914's read-epoch-only correction. It does not alter activation/import pre-await identity ownership, encryption-at-rest, backup format, commercial gates, or the first-hydration latch.

## Correction

The prior `:write-version` sidecar was a reservation and could serialize encryption completion, but it did not stop a renderer that had already decrypted an old stamped blob from merging that state later. Zustand could then persist the merged old complete snapshot as a new write, resurrecting a removed license/API key and unrelated settings.

The settings adapter now has two durable ownership facts:

- `:write-version` is the current write claim, reserved before asynchronous encryption. A failed claimant releases its claim back to the committed generation, so storage errors cannot leave a permanent poisoned marker.
- `:committed-write-version` advances only after the matching stamped encrypted blob is placed in storage. Reads decrypt the current blob again if its generation changed, with a bounded retry; the persist merge repeats the ownership comparison immediately before it can apply state.

A read may retain a later generation only when the local renderer owns that exact post-read write generation. The existing per-key mutation merge then resolves that local state once; an unowned remote claim or committed generation rejects the stale merge. Thus a remote removal dominates an old complete snapshot, while a legitimate later activation/import still wins by receiving a newer generation.

## Permanent hostile matrix

`settingsStoreLicenseCrossWindow.test.ts` contains the exact final-gate probe: A has read/decrypts stamped version 10; B durably removes the license and OpenAI key and changes `atlasBaseUrl`; B's channel listener is deliberately absent; A releases its old decrypt. The encrypted durable blob, A, B, and a reloaded C all converge on the removal/new provider value, all license verdicts are false, and all commercial gates are closed.

The same settings/license family additionally covers three-window remove→activate ordering, delayed encrypt/write ordering, duplicate change notices after a removal generation, activation/import pre-await races, overlapping reads, same-key revalidation, different-key/API-key replacement, failed decrypt recovery, and unavailable-storage memory fallback. The version-10 probe is intentionally red on `22f2bc7`: that baseline has no committed-generation comparison or current-blob re-read and accepts the old snapshot after B's completed write.

## Evidence

| Check | Result |
| --- | --- |
| Settings/license/hydration/persistence/cross-window/backup neighbors | 8 files, 53/53 passed |
| Changed-lineage ESLint | passed (0 errors, 0 warnings) |
| Repository lint | passed (0 errors, 0 warnings) |
| Forced nonincremental TypeScript | `npx tsc -b --force` passed |
| CI production build | `CI=1 npm run build` passed |
| Diff hygiene | `git diff --check` passed before the production/test commit |

## Residuals and gate

`localStorage` has no multi-key atomic transaction. The adapter closes the relevant async gap by publishing a claim before encryption, stamping the ciphertext, committing only after blob placement, and checking both facts at read/merge time. If storage is unavailable, the existing renderer-memory fallback is retained and commercial gates stay fail-closed; cross-window convergence resumes from the durable blob once storage is available. BroadcastChannel remains a prompt to rehydrate, not an authority channel.

No integration, push, rebase, amend, or self-approval was performed. A fresh provider must perform the final approval gate.
