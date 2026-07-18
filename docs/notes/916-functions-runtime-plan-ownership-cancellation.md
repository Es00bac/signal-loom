# Functions runtime plan, ownership, and cancellation correction

Date: 2026-07-17

Branch: `overlap/fable-functions`

Preserved Fable WIP: `487411e4e99d139f833835437eb684646a7610ae`

Prior substantive candidate: `52117f71cb54d4b80f5e339189558c5b951aef78`

Final Cartographer-blocker production/tests: `ed10a27`

## Scope

This correction implements the independently confirmed AUD-007/FBL-020 runtime requirements without merging or rebasing current `main`. The preserved WIP commit remains in branch history as test evidence, not acceptance.

FBL-009 is not closed here. Its audited external font-pack source and packaged known-face proof remain a separate external-artifact blocker.

## Red baseline and Fable test audit

The preserved Fable regressions were run before production edits:

```text
npx vitest run --configLoader runner src/lib/flowExecutionFunctionNode.test.ts
Test Files  1 failed (1)
Tests       2 failed | 14 passed (16)
```

Both failures were valid:

- A Function advertising two independent provider outputs executed Stability once but never executed the disjoint OpenAI output subtree.
- A Function whose first output was local and second output was provider-backed never executed Stability.

The fixtures intentionally poison frozen internal results and assert exact provider calls, so they distinguish fresh execution from stale result routing.

## Runtime contract implemented

### Immutable execution plan and consent

- Function planning now walks the union of the dependency subgraphs rooted at every advertised output binding. The traversal de-duplicates shared dependencies, executes each required provider-backed node once, and preserves named/mixed/batch output routing and MIME/result families.
- Cost estimation resolves Function input bindings first, prepares the same internal graph shape used by execution, and estimates only reachable provider calls across the complete output union.
- Flow run preflight captures a JSON-immutable node/edge/settings snapshot and computes a consent signature from it. After the asynchronous consent dialog, the exact workspace identity, graph, resolved inputs, and settings are revalidated immediately before submission.
- Execution consumes the captured snapshot. It does not reread a mutable canvas graph after consent.

### Run ownership

- Every run captures the starting workspace ID and workspace `createdAt` identity, then receives a unique run ID.
- Active cancellation ownership is keyed by workspace and node, while live node patches additionally require the matching runtime-only `activeRunId`.
- Workspace switching, duplicated workspaces, replacement nodes that reuse an ID, delayed consent cancellation, and late provider completion cannot patch the newly active/replacement node.
- Usage attribution is captured at run start, so later workspace switching cannot redirect spend records.

### Cancellation and accepted-job exactly-once behavior

- One `AbortSignal` is carried through internal Function execution, API/provider submission, media upload/preparation, polling, sleeps, downloads/materialization, local/proxy/direct execution, and retry backoff.
- Provider jobs with an accepted submission use a separate post-acceptance retry phase. Poll and materialization retries happen inside that phase; failures escape as non-retryable accepted-job errors so the outer provider retry cannot repeat the paid submission.
- Atlas, BFL, Gemini video, Stability asynchronous upscale, and configured post-generation upscale paths use this accepted-job boundary. Vertex native bridge calls and native media fallback are abort-raced so late results are discarded even when the platform bridge itself cannot cancel an already-dispatched native operation.

## Permanent regressions

Added coverage proves:

- complete union planning for two disjoint provider outputs and for local-first/provider-second output order;
- fresh materialization, honest aggregate usage, and exact one-call-per-provider success counts;
- cost estimation over two reachable advertised-output providers while excluding an unreachable provider;
- consent invalidation after a graph/input mutation with zero provider calls;
- duplicate-workspace and same-workspace ID-reuse protection for late completion;
- duplicate-workspace protection when consent is declined after switching;
- accepted Atlas polling retry with exact counts `{ submit: 1, poll: 2, download: 1 }`;
- accepted Atlas materialization retry with exact counts `{ submit: 1, download: 2 }`;
- polling cancellation with exact counts `{ submit: 1, poll: 1, download: 0 }`;
- materialization cancellation with exact counts `{ submit: 1, poll: 0, download: 1 }`;
- existing named/mixed/batch routing, MIME/result families, Source Bin persistence counts, and direct/proxy provider behavior.

## Verification evidence

Final-state checks:

```text
npx vitest run --configLoader runner src/lib/flowExecution*.test.ts \
  src/lib/functionNodes.test.ts src/lib/flowSignals.test.ts \
  src/lib/listExecution.test.ts src/lib/appSmoke.test.ts \
  src/lib/costEstimation.test.ts src/lib/cloudImageUpscale.test.ts \
  src/lib/exponentialBackoff.test.ts src/store/flowStore.test.ts \
  src/store/flowStore.bookmarks.test.ts src/store/flowStore.remoteSync.test.ts
Test Files  21 passed (21)
Tests       193 passed (193)

npm run verify:flow-production
Test Files  9 passed (9)
Tests       319 passed (319)
Flow production audit passed: 63 nodes, 182 model contracts, 178 normal model options.

npx tsc -b tsconfig.app.json tsconfig.node.json --force --pretty false
PASS

npx eslint <all touched TypeScript files>
PASS

CI=1 npm run build
PASS

git diff --check
PASS
```

The build retained only the repository's existing Vite module-externalization and large-chunk warnings.

## Final Cartographer-blocker correction — author evidence

This section appends the five independently confirmed final blockers to the earlier candidate evidence. It is author work only.

### Invariant model

- Output identity is `(sourceNodeId, sourceHandle)` and must match signal/runtime resolution.
- A provider acceptance boundary separates retryable pre-accept work from non-resubmittable post-accept materialization/polling.
- A Source item created by a run is provisional until that run still owns workspace + node + run after persistence, and it must be removed on lost authority before publication.
- One `AbortSignal` owns every reachable pre-provider and post-provider await in the enumerated run routes.
- Aggregate numeric spend means complete spend, never a lower-bound subtotal.

### Affected route matrix

| Blocker | Authoritative routes checked | Correction |
|---|---|---|
| Named Function output identity | `resolveFunctionOutputFromGraph` → `evaluateNodeSignal`; nested Function `functionOutputs`; provider additional-result metadata; no-handle primary compatibility | Passes `sourceHandle` into signal evaluation, retains nested handle maps on internal nodes, and selects nested named metadata/additional results without changing primary fallback behavior. |
| Accepted configured Stability resubmission | Flow configured auto-upscale → shared cloud Stability request → accepted HTTP response → body/object-URL materialization | Splits submission and materialization. Pre-accept retries stop at the accepted response; post-accept retries read clones of that same response and cannot issue another POST. |
| Stale Source publication | Loop/envelope single outputs, provider `additionalResults`, ordinary single outputs; Source Bin add/dedupe/broadcast/remove | Adds deferred publication, rechecks workspace + node + run after persistence, silently discards only registered provisional IDs on lost authority, and leaves existing same-key/deduplicated items unchanged. |
| Media preparation cancellation | Vision; Gemini text media; Gemini image; BFL normalization; configured-upscale dimension/normalization/local conversion; shared cloud Stability file preparation | Threads the same run signal through fetches/helpers and checks abort after non-abortable blob, bitmap, mask, base64, and canvas-conversion boundaries. No independent controller is introduced. |
| Mixed known/unknown spend | Function internal execution usage collection → aggregate telemetry → node “Last run” summary and project attribution | Every incurred internal call receives exactly one attribution (explicit unknown telemetry when the provider reports none); aggregate `costUsd` is present only when every internal cost is numeric. Counts/notes remain visible and unknown totals render as pricing unknown. |

The output-union plan and the estimate/consent/execution snapshot representation were not changed by this correction. The same immutable captured graph/settings/input signature introduced in `6a68626` still drives estimate, post-consent revalidation, and execution. AUD-002/AUD-006/AUD-008 protections, nested/malformed handling, accepted-job polling, and Fable WIP ancestry remain intact. FBL-009 remains out of scope.

### Exact red proof against `e5b5775954d03c624ab34a447b04a818bd9fb6e5`

Before production edits, the permanent regression files were run with:

```text
npx vitest run --configLoader runner \
  src/lib/flowExecutionFunctionNode.test.ts \
  src/lib/flowExecutionImageProviders.test.ts \
  src/lib/flowExecutionMediaCancellation.test.ts \
  src/lib/cloudImageUpscale.test.ts \
  src/store/flowStore.test.ts

Test Files  5 failed (5)
Tests       11 failed | 78 passed (89)
```

The failures were old-code-sensitive for the intended reasons: `maskOutput` resolved to the editor's default result; accepted Stability materialization issued two upscale POSTs; a cancelled run retained its just-created Source item; all enumerated media-preparation fetches lacked the same signal and BFL crossed an aborted blob boundary into submission; and mixed known/unknown internal spend exposed the known subtotal/confidence.

### Final green proof on `ed10a27`

```text
# Focused Function/output, cost, Source ownership/live-sync, cancellation,
# configured-upscale, accepted retry, and usage suites
npx vitest run --configLoader runner \
  src/lib/flowExecutionFunctionNode.test.ts \
  src/lib/flowExecutionImageProviders.test.ts \
  src/lib/flowExecutionMediaCancellation.test.ts \
  src/lib/cloudImageUpscale.test.ts \
  src/lib/exponentialBackoff.test.ts src/lib/costEstimation.test.ts \
  src/lib/functionNodes.test.ts src/lib/flowSignals.test.ts \
  src/store/flowStore.test.ts src/store/sourceBinStore.test.ts \
  src/store/sourceBinLiveSync.test.ts \
  src/lib/projectUsageRecording.test.ts src/lib/projectUsageLedger.test.ts
Test Files  13 passed (13)
Tests       200 passed (200)

# Prior Functions/Flow matrix, with the new cancellation regression file included
npx vitest run --configLoader runner src/lib/flowExecution*.test.ts \
  src/lib/functionNodes.test.ts src/lib/flowSignals.test.ts \
  src/lib/listExecution.test.ts src/lib/appSmoke.test.ts \
  src/lib/costEstimation.test.ts src/lib/cloudImageUpscale.test.ts \
  src/lib/exponentialBackoff.test.ts src/store/flowStore.test.ts \
  src/store/flowStore.bookmarks.test.ts src/store/flowStore.remoteSync.test.ts
Test Files  22 passed (22)
Tests       206 passed (206)

npm run verify:flow-production
Test Files  9 passed (9)
Tests       321 passed (321)
Flow production audit passed: 63 nodes, 182 model contracts, 178 normal model options.

npx tsc -b tsconfig.app.json tsconfig.node.json --force --pretty false
PASS

npx eslint <11 touched TypeScript production/test files>
PASS

CI=1 npm run build
PASS

git diff --check
PASS
```

The production build retained only the existing Vite `module` externalization, unresolved runtime URL, and large-chunk warnings.

### Residual risk and gate boundary

- No paid live Stability fault was induced. Deterministic fake-response coverage proves one accepted POST across a transient `blob()` failure; provider/network behavior still belongs in the independent gate or a separately authorized live check.
- Discarding a provisional Source item removes it from the Source Library and all publication paths. As with existing Source removal, durable backing bytes may remain as unreferenced storage for later cleanup; they are not broadcast or attached to a result.
- Native operations that cannot cancel after dispatch still rely on the preserved abort race/late-result discard contract.
- This author evidence claims neither approval, integration, nor closure. A fresh different-model Context Cartographer review remains mandatory.

## Gate status

Implementation and evidence are ready for Terra's fresh independent gate. This note is not a self-approval and does not reconcile the isolated branch with current `main`.
