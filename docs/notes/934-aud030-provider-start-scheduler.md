# AUD-030 provider start-scheduler correction

Date: 2026-07-18

## Scope and baseline

- Branch: `audit/aud030-provider-start-scheduler-20260718`
- Required clean baseline: `a3d5d2865a02b7e99fea6022d22420f1c73422ef`
- Production/tests commit: `54991f64`
- Finding: AUD-030 from `docs/audits/codebase-correctness-audit-2026-07-16.md`

The previous `ProviderRateLimiter.acquire()` retained its active queue slot until the complete task settled. A provider submission that entered a multi-minute polling or result-materialization phase therefore retained admission ownership for that entire lifetime. Atlas, BytePlus, local/open, Android, and missing-provider local routes also fell through a shared `default` policy, even though they do not share one transport or quota.

## Corrected ownership model

`ProviderRateLimiter` now separates start admission from task lifetime:

1. Starts remain FIFO within one policy and retain their configured minimum spacing.
2. The scheduler records the admitted start time and immediately advances its queue independently of the task promise.
3. A long poll or materialization phase therefore cannot serialize later work for its full lifetime.
4. A cancellation while waiting for admission removes or rejects only that waiting start and does not consume a spacing interval.
5. A task rejection cannot retain or poison scheduler ownership because the scheduler no longer awaits task completion.

The existing `acquire(task, signal)` call contract remains intact, so Flow and Image Gemini call sites receive the corrected semantics without changing request bodies, response handling, job identifiers, retry phases, usage attribution, or cancellation signals.

## Policy identity

The existing remote-provider delays are preserved. Explicit policies were added for Atlas and BytePlus, while local/open, Android, and local transform routes use independent zero-delay policies. Backend-proxy policies are separated both from direct execution and from one another by upstream provider, for example `backend-proxy:atlas`.

Flow now resolves omitted provider values with the same defaults as each executor:

- generated text, image, and video default to Gemini;
- audio defaults to ElevenLabs;
- Vision Verify uses Gemini;
- prompt-mode text and crop transforms use the local policy;
- Function, API Requester, and Composition nodes retain their existing explicit paths outside provider admission.

This removes the shared-default coupling without changing paid-job ownership. Direct asynchronous Atlas, BFL, Gemini, and Stability jobs still submit exactly once where required; their existing-ID polling and materialization retry boundaries are unchanged.

## Deterministic regression coverage

The initial focused run reproduced the audited behavior:

```text
Test Files  2 failed (2)
Tests       2 failed | 2 passed (4)
```

The permanent fake-clock/deferred-promise checks prove:

- a same-policy second start occurs only after the exact configured interval while the first task remains unresolved;
- a cancelled waiting start never executes and the next waiter receives admission cleanly;
- a task failure does not stop the following admission;
- policy identity is distinct for Atlas, BytePlus, local/open, Android, local transforms, and proxied Atlas;
- an unresolved Atlas poll does not prevent an unrelated BytePlus submission and completion.

Focused corrected result:

```text
Test Files  2 passed (2)
Tests       5 passed (5)
```

## Validation

Adjacent Flow execution lineage, split only to retain exact concise runner summaries:

```text
Test Files  22 passed (22)
Tests       254 passed (254)
```

Flow production verification:

```text
Test Files  9 passed (9)
Tests       375 passed (375)
Flow production audit passed: 63 nodes, 182 model contracts, 178 normal model options.
```

Additional gates:

```text
npx tsc -p tsconfig.app.json --noEmit --incremental false --pretty false
exit 0

npx tsc -p tsconfig.node.json --noEmit --incremental false --pretty false
exit 0

npx eslint src/lib/providerRateLimiter.ts src/lib/providerRateLimiter.test.ts src/lib/flowExecution.ts src/lib/flowExecutionProviderScheduling.test.ts
exit 0

git diff --check
exit 0

npx vite build --configLoader=runner
3282 modules transformed; built in 3.01s; exit 0
```

The production build emitted only the repository's existing browser externalization, runtime URL, and large-chunk warnings.

## Review state and residual limits

- This is author evidence, not independent approval. A fresh read-only scheduler and state-ownership review is still required before integration or audit closure.
- Admission governs operation starts. Provider-internal polling cadence remains owned by the existing provider implementations and their bounded polling loops.
- The fallback `default` limiter remains for unknown external callers, but every supported Flow execution route now resolves to an explicit provider/local policy before lookup.
