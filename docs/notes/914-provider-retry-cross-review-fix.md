# Provider retry cross-review repair

Date: 2026-07-16

## Scope

This follow-up repairs the cross-review blocker in the provider-safe async retry work from `0657bc27ed99895b0b611ba1ef51f6a842b40125` and its evidence follow-up `c19302a0a4fd8ffce0e056b15971703e5315a074`.

`src/lib/exponentialBackoff.ts` no longer treats the entire HTTP 4xx range as permanently non-retryable. Structured statuses and message-only status fallbacks now share one explicit permanent-client-error policy containing 400, 401, 403, 404, 405, 410, 413, 415, and 422. Transient 408, 425, and 429 responses therefore continue through bounded retry. Numeric `.code` fields are no longer interpreted as HTTP status codes because SDKs also use that field for non-HTTP error namespaces.

The Flow-level regression uses the existing real Atlas execution path. A fake paid submission returns one prediction ID, the first poll returns HTTP 429, and the next poll completes. The test proves exactly one `/model/generateImage` submission and two requests for the same prediction ID.

Owned implementation/test files:

- `src/lib/exponentialBackoff.ts`
- `src/lib/exponentialBackoff.test.ts`
- `src/lib/flowExecutionAsyncRetry.test.ts`

Focused fix commit: `3e74f7848ef2e560736c289fe8434edc46e721e4` (`fix(flow): retry transient async poll client errors`).

## Red-to-green evidence

The regressions were run before the classifier changed:

```text
npx vitest run src/lib/flowExecutionAsyncRetry.test.ts src/lib/exponentialBackoff.test.ts --reporter=verbose --configLoader=runner
Test Files  2 failed (2)
Tests       8 failed | 14 passed (22)
```

The eight expected failures covered structured 408/425/429, message-only 408/425/429, an arbitrary numeric SDK `.code`, and an Atlas 429 poll that was not retried. The final focused run passed:

```text
npx vitest run src/lib/flowExecutionAsyncRetry.test.ts src/lib/exponentialBackoff.test.ts --reporter=verbose --configLoader=runner
Test Files  2 passed (2)
Tests       30 passed (30)
```

All affected Flow execution suites passed:

```text
npx vitest run src/lib/flowExecution*.test.ts src/lib/exponentialBackoff.test.ts --configLoader=runner
Test Files  12 passed (12)
Tests       80 passed (80)
```

Static and production checks:

```text
npx tsc -p tsconfig.app.json --noEmit --incremental false --pretty false
exit 0

npx tsc -p tsconfig.node.json --noEmit --incremental false --pretty false
exit 0

npx eslint src/lib/exponentialBackoff.ts src/lib/exponentialBackoff.test.ts src/lib/flowExecutionAsyncRetry.test.ts
exit 0

git diff --check
exit 0

npx vite build --configLoader=runner
3246 modules transformed; built in 1.33s; exit 0
```

The production build emitted only the existing browser-externalization, unresolved `new URL("./", import.meta.url)`, and large-chunk warnings.

## Residual risks

- Unlisted HTTP 4xx statuses now default to retryable. That is intentional for safety around already-paid jobs and remains bounded by the existing retry-count and five-minute elapsed-delay budget, but a newly proven permanent status should be added explicitly with a regression.
- Retry timing still uses the existing exponential schedule rather than a provider `Retry-After` header.
- Existing job state is still in-memory only; renderer crash/restart recovery remains outside this focused repair.
