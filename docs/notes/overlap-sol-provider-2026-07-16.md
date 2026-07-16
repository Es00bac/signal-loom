# Overlap Sol provider repair — AUD-003

Date: 2026-07-16

## Baseline and chosen path

- Repository: `/home/cabewse/work_SPaC3/flow-overlap-sol`
- Branch: `overlap/sol-provider`
- Required baseline and starting `HEAD`: `cef276d8fc8a03d6708f0307cf24f2b5f26bfccd`
- Finding completed: **AUD-003 — Generic retry can resubmit paid jobs and wait more than eight hours on permanent errors**.
- The strict pivot rule was not triggered. Deterministic failing Atlas, BFL, and Gemini regressions reproduced duplicate creates, and a bounded phase-aware design was viable within the allotted window. AUD-010 and AUD-006 were not touched.

## Reproduced failure

The first red run used only fake `fetch` responses, fake provider IDs/URLs, and fake timers:

```text
npx vitest run src/lib/flowExecutionAsyncRetry.test.ts src/lib/exponentialBackoff.test.ts --reporter=verbose --configLoader=runner
Test Files  2 failed (2)
Tests       7 failed | 6 passed (13)
```

The important failures were deterministic:

- Atlas returned `atlas-existing-prediction`; one fake poll 503 caused `/model/generateImage` to be called **2** times instead of 1.
- BFL returned `bfl-existing-job`; one fake poll 503 caused `/v1/flux-2-pro` to be called **2** times instead of 1.
- Gemini returned `operations/gemini-existing-job`; one fake poll 503 caused `:predictLongRunning` to be called **2** times instead of 1.
- A JSON-bodied HTTP 400 (`{"error":{"message":"invalid request body"}}`) lost its status and made the create endpoint run **2** times instead of 1.
- Missing-prompt validation emitted one generic retry status instead of failing immediately.
- The original backoff had no elapsed-time stopping condition; with ten default retries and a 30-second base it could still schedule the audited 30,690 seconds of waits.

No real provider request was made, and no credential was read or required.

## Design and implementation

The repair separates non-idempotent submission from retryable work without changing provider request bodies or result contracts:

1. Direct paid asynchronous routes are identified before the generic whole-operation wrapper:
   - Atlas native image and Atlas video
   - BFL image
   - Gemini API-key Veo `predictLongRunning`
   - Stability Replace Background & Relight
2. Those routes submit exactly once. Submission failures are surfaced because an ambiguous failed create cannot safely be replayed without a provider idempotency key.
3. After a successful submit, transient failures retry only the existing Atlas prediction ID, BFL polling URL, Gemini operation name/video URI, or Stability generation ID. Materialization retries use the already-returned output URL/operation rather than creating another job.
4. `withExponentialBackoff` now accepts `maxElapsedMs`. Flow applies a five-minute elapsed retry-wait budget, so the default 30s/60s/120s waits occur but the next 240s wait is refused (210 seconds total scheduled delay rather than 8h31m30s).
5. Direct fetch failures now use `HttpStatusError`, retaining the numeric response status independently of JSON message wording. Structured HTTP 4xx failures fail immediately.
6. Ordinary Flow validation/configuration failures in the touched execution path use `NonRetryableError`, preserving their existing user-facing text while preventing retry.
7. Provider terminal states and poll timeouts are fail-fast; only transient poll/materialization failures enter phase retry.

## Owned files

- `src/lib/exponentialBackoff.ts`
- `src/lib/exponentialBackoff.test.ts`
- `src/lib/flowExecution.ts`
- `src/lib/flowExecutionAsyncRetry.test.ts`
- `src/lib/imageEditorAi/stabilityAsyncResult.ts`
- `docs/notes/overlap-sol-provider-2026-07-16.md`

`docs/TASK_LIST.md`, credentials, deployment files, and unrelated provider request behavior were not changed.

## Exact verification results

Focused red-to-green lifecycle suite:

```text
npx vitest run src/lib/flowExecutionAsyncRetry.test.ts src/lib/exponentialBackoff.test.ts --reporter=verbose --configLoader=runner
Test Files  2 passed (2)
Tests       15 passed (15)
```

The green suite asserts create-call count **1** through an injected transient fault for Atlas, BFL, Gemini polling, Gemini result download, and Stability async result polling. It also asserts immediate JSON-bodied HTTP 400 and missing-prompt failures, structured HTTP 422 classification, and the five-minute backoff budget.

All neighboring Flow execution suites:

```text
npx vitest run src/lib/flowExecution*.test.ts src/lib/exponentialBackoff.test.ts --configLoader=runner
Test Files  12 passed (12)
Tests       65 passed (65)
```

Static and production validation:

```text
npx tsc -p tsconfig.app.json --noEmit --incremental false --pretty false
exit 0

npx tsc -p tsconfig.node.json --noEmit --incremental false --pretty false
exit 0

npx eslint src/lib/exponentialBackoff.ts src/lib/exponentialBackoff.test.ts src/lib/flowExecution.ts src/lib/flowExecutionAsyncRetry.test.ts src/lib/imageEditorAi/stabilityAsyncResult.ts
exit 0

npx vite build --configLoader=runner
3246 modules transformed; built in 1.39s; exit 0

git diff --check
exit 0
```

The `runner` config loader and non-incremental TypeScript commands were used because this worktree shares a read-only `node_modules` target; the normal Vite bundle config loader tries to write `node_modules/.vite-temp`. The production build completed with the repository's existing browser-externalization and large-chunk warnings only.

## Commits

- Baseline: `cef276d8fc8a03d6708f0307cf24f2b5f26bfccd`.
- Implementation, deterministic regressions, and initial note: `0657bc27ed99895b0b611ba1ef51f6a842b40125` (`fix(flow): make async provider retries job-safe`).
- Documentation-only follow-up: this commit corrects the initial note after a transient first staging attempt reported a read-only index lock; its exact SHA is recorded in the final sprint handoff because a commit cannot contain its own hash.

## Residual risks

- Existing job identifiers are retained for the life of `executeNodeRequest`, which is sufficient for automatic retry, but are not durably persisted across a renderer crash, application restart, or manual rerun. Durable crash recovery needs a separate node/run-state persistence design.
- Backend-proxied executions and Vertex native bridge internals are intentionally excluded from direct-route classification because their submit/poll lifecycle is opaque to the renderer. Their server/native implementations must provide their own idempotency and resume contract.
- The five-minute budget bounds scheduled exponential retry delay. It does not impose a network timeout on one hung `fetch`; provider poll loops retain their existing bounded attempt windows (BFL/Atlas image 240 seconds, Gemini 7.5 minutes, Atlas video 10 minutes).
- Atlas/BFL web materialization retains the existing native-download/raw-URL fallback. A CORS failure can therefore complete with the provider URL rather than consume retry budget, by design.
