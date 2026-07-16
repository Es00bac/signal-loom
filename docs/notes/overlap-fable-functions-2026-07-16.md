# AUD-007 repair: collapsed reusable functions execute their internal provider subgraph

**Lane:** overlap/fable-functions · **Commit:** `f1f91ae` · **Date:** 2026-07-16

## The defect

Collapse promises "Replace the selected logic with one reusable function node"
(`FlowWorkspaceShell.tsx:309`), but execution never honored it. `executeNodeRequest` routed
function nodes into a **synchronous** signal evaluation (`executeFunctionNodeConfig` →
`evaluateNodeSignal`), where every provider-backed node type (`imageGen`, `videoGen`,
`audioGen`, generate-mode `textNode`, …) simply reads its stored `data.result` — the value
frozen into `config.graph.nodes` at collapse time. Worse, non-marker boundary injection
overwrote the boundary target's `data.result` with the raw input text, so a collapsed
Prompt → Image function returned the *prompt string typed into an image-kinded output*.
Usage was hardcoded to `costUsd: 0` with a note claiming functions run "without provider
spend."

## Architecture of the repair

The constraint that shaped everything: the real per-node context collectors
(`collectPromptSignalForNode` plus the image/audio/video/mask/reference/config collectors)
and the executor's dependency walker live in `src/store/flowStore.ts`, which imports
`flowExecution.ts` — so the lib layer cannot import them back. Two primitives are therefore
**injected**, and everything else reuses existing machinery:

1. **`flowStore.ts`** — runNode's inline ExecutionContext block (≈85 lines) is extracted
   into exported `buildNodeExecutionContext(node, nodes, edges, promptSignal?)`; runNode now
   calls it. New export `flowFunctionNodeExecutionRuntime = { buildContext, getDependencies }`
   (the latter wrapping the store's real `getExecutionDependencies`, which is
   portal/routing-aware — the `costEstimation.ts` copy has diverged toward estimation
   semantics and was deliberately not used). Both `executeNodeRequest` callsites (loop and
   single path) pass `functionRuntime`.

2. **`functionNodes.ts`** — the clone + input-injection logic is extracted into
   `prepareFunctionSubgraph(config, flowInputs)`, shared by the sync and async paths, and
   now also synthesizes **boundary carrier nodes**: each non-marker input boundary link gets
   a carrier (`functionInputNode` for text-like ports, an import-mode `imageGen`/`videoGen`/
   `audioGen` for media ports — the shape the context collectors already recognize) wired
   through the original target handle. Bound values therefore arrive the way the
   pre-collapse graph delivered them: through an edge that both signal evaluation and the
   context collectors can see. Output resolution is `resolveFunctionOutputFromGraph` +
   `serializeFunctionExecutionOutcome` with the existing precedence (signal → expression →
   source-node data → missing strategy) unchanged.

3. **`flowExecution.ts`** — function nodes are dispatched **before** the retry/limiter
   wrapper (like composition): `ProviderRateLimiter.acquire` is a strict serial queue, so an
   orchestrator holding a slot while an internal node acquires the same provider's limiter is
   a guaranteed deadlock, and a retrying orchestrator would re-buy the entire subgraph after
   an internal node exhausted its own retries. `executeFunctionNode` now:
   - guards recursion explicitly via `options.functionOwnerChain` (a function node whose id
     re-enters the chain → `NonRetryableError`; depth cap 8);
   - prepares the subgraph and plans the **runnable ancestors of the bound output** with the
     injected dependency walker + the lib `canRunNode` (post-order DFS, explicit
     cycle rejection) — mirroring runNode's semantics, including the quirk that
     `apiFetchNode` is not planned as a dependency at the top level either;
   - **clears stale outputs on every runnable internal node** so nothing — signals,
     collectors, or the output binding — can serve a collapse-time provider result;
   - executes the plan sequentially through `executeNodeRequest` itself (each internal node
     gets its own limiter slot, retry budget, and the same abort signal; blocking prompt
     diagnostics fail the run), writing fresh results back into the prepared graph;
   - aggregates internal `UsageTelemetry` (single execution passes through; multiple sum
     cost/tokens/characters/duration/imageCount, weakest confidence wins, notes list internal
     spend) so `recordProjectUsageFromExecution` books real spend against the function node;
   - resolves the first advertised output through the unchanged binding path
     (FBL-020 multi-output routing untouched: `additionalResults` from internal nodes are
     not fanned out);
   - keeps the legacy zero-spend sync path for provider-free graphs, empty graphs, and
     missing bindings — and **fails closed** (`NonRetryableError`, no stale data) when
     provider nodes exist but no `functionRuntime` was supplied (the only production caller
     without one, VideoWorkspace's narration helper, executes a synthetic `audioGen` and is
     unaffected).

## Red → green evidence

Red test (`src/lib/flowExecutionFunctionNode.test.ts`, written first against the existing
API only): collapse external prompt → selected Stability image node carrying
`data:image/png;base64,FROZENCOLLAPSETIMERESULT`, change the bound input, execute through
`executeNodeRequest` with mocked `fetch`:

```
AssertionError: expected "vi.fn()" to be called 1 times, but got 0 times
 FAIL  … > executes the internal provider subgraph with the current bound input …
```

After the repair the same assertions pass with the arrange step upgraded to full fidelity —
the context is built by the store's real `buildNodeExecutionContext` over the post-collapse
outer graph and the real `flowFunctionNodeExecutionRuntime` is passed: one fresh POST to
`…/stable-image/generate/core` whose FormData prompt equals the changed input, result
`blob:function-fresh-image` (≠ frozen), `resultType: image`, usage `{source: 'actual',
costUsd: 0.03}` with no zero-spend note.

Focused cases (all in the new suite, 9 tests):
- **Dependency semantics / accounting:** openai text → stability image chain; the internal
  text node sees the *current* external prompt, the internal image node consumes the *fresh*
  internal text (not its stale stored result), usage aggregates (`costUsd ≥ 0.03`, tokens
  12/24, "Executed 2 internal provider nodes"), status reports "2 provider nodes across 2
  internal nodes".
- **Cancellation:** aborting during the first internal provider step rejects with
  `AbortError` and the downstream provider request is never issued.
- **Empty graph** resolves through the sync path (zero-spend note intact); missing output
  binding keeps its legacy message.
- **Malformed graphs:** missing output source resolves to the default without crashing or
  spending; a provider-node dependency cycle rejects explicitly.
- **Non-provider sync path:** a collapsed `stringTemplateNode` binds the current input
  *without* any runtime (`Greetings, Captain Mara!`) — also proving the carrier repair,
  since template inputs are read from edges only (the old injection produced
  `Greetings, !`).
- **Fail-closed:** provider graph without runtime rejects with "provider-backed internal
  node…", zero fetches.
- **Recursion:** a function whose graph contains its own node id rejects via the owner
  chain.

The pre-existing collapse-structure tests that prepopulate internal `result` fields remain
valid as *structure* tests; the masking the audit called out is now inverted — the new suite
prepopulates the same frozen fields and asserts they are **not** served.

## Commands run

```
npx vitest run --configLoader runner src/lib/flowExecutionFunctionNode.test.ts   # red, then green (9 passed)
npx vitest run --configLoader runner src/lib/flowExecution*.test.ts \
  src/lib/functionNodes.test.ts src/lib/flowSignals.test.ts \
  src/lib/listExecution.test.ts src/lib/appSmoke.test.ts                          # 15 files, 107 passed
npx vitest run --configLoader runner src/store/flowStore.test.ts \
  src/store/flowStore.bookmarks.test.ts src/store/flowStore.remoteSync.test.ts    # 3 files, 36 passed
npx tsc -b                                                                        # clean
git diff --check                                                                  # clean
```

## Residual risks / follow-ups (not taken in this lane)

- **Cost preflight underestimates functions:** `estimateExecutionPlan` still treats a
  function node as a single zero-ish node, so the run-cost confirmation dialog does not
  warn about internal provider spend. Recorded spend is now truthful; the *estimate* is not.
- **Internal envelope/loop fan-out:** list-loop iteration inside a function subgraph is a
  store-level feature and still does not run per-item internally (single-shot per internal
  node). Related to, but distinct from, FBL-020 multi-output routing, which was deliberately
  left alone.
- **Media-typed marker inputs:** `functionInputNode` markers are recognized as text sources
  by signals but not by the image/audio/video context collectors; media boundary values are
  covered by import-mode carriers on non-marker links only.
- **No-runtime classification uses a plain edge walk**, so a runnable node reachable only
  through portal-pair indirection could be missed there — the store path (always supplies
  the runtime) uses the real walker and is unaffected.
- **Internal aborts inherit AUD-008's limits:** the signal now reaches every internal
  `executeNodeRequest` (wrapper-level abort), but providers that ignore signals mid-flight
  are that lane's repair.
- Internal execution intentionally skips `assertFlowExecutionPreflight` on the cut internal
  graph (boundary edges are severed by design and would false-block); blocking prompt-signal
  diagnostics are still enforced per internal node.
