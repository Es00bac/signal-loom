# Functions invalid named-output handle correction

Date: 2026-07-17

Branch: `overlap/fable-functions`

Required starting evidence: `900fd2b0bd766f8f91702e42c28a03de6948f4b0`

Production/tests: `c7cc3aa05d5f05372054c0ddc06090d4ad17f58f`

Prior production/tests retained: `ed10a27930f32fdab257b9f43febb5af87c6065c`

Preserved Fable WIP: `487411e4e99d139f833835437eb684646a7610ae`

## Scope and invariant

This author correction addresses only the independently reproduced High final-gate blocker in Function named-output identity. FBL-009 remains separate and open.

A Function output is the exact pair `(sourceNodeId, sourceHandle)`. Any non-default handle must be one of the selected source node's currently advertised Flow output ports before dependency planning or provider execution. Resolution repeats that check and must not fall back to a primary result, frozen stored data, expression/missing defaults, or another paid output. `undefined`, `null`, and the persisted empty string retain the canonical unnamed/default behavior; named handles remain exact and case-sensitive.

## Authoritative representation

- `flowNodeContracts.ts` now exports `normalizeFlowHandle` and `resolveFlowNodePort`. The latter resolves dynamic ordinary, provider, local, and nested Function ports through `resolveFlowNodePorts`.
- `flowConnectionContracts.ts` uses those helpers for ordinary Flow source/target validation and output-type routing, so Function execution and canvas connection validation share one handle contract.
- `flowExecution.ts` validates every Function output binding immediately after subgraph/input preparation and before provider dependency planning.
- `functionNodes.ts` repeats the same assertion before signal evaluation. An impossible named handle throws `NonRetryableError` outside the signal evaluator's legacy recovery block, so it cannot degrade to primary/default data.
- Nested Functions advertise contract output port IDs through the same dynamic resolver, matching the keys used by runtime `functionOutputs` routing. Semantic port keys are not rewritten into different runtime handle IDs.

The existing output-union plan, consent snapshot, accepted-job boundaries, Source publication ownership, cancellation transport, usage aggregation, batch/envelope/additional-results routing, and default-output compatibility were not changed.

## Exact old-code red proof

A disposable Git tree combined exact starting production `900fd2b0bd766f8f91702e42c28a03de6948f4b0` with the final committed regression file from `c7cc3aa`. It did not change the candidate worktree or any branch, and it was removed immediately after the run.

```text
./node_modules/.bin/vitest run --configLoader runner \
  src/lib/flowExecutionFunctionNode.test.ts

Test Files  1 failed (1)
Tests       3 failed | 25 passed (28)
```

The three failures were old-code-sensitive for the intended reasons:

- `sourceNodeId: "paid"` plus `sourceHandle: "not-a-real-output"` submitted Stability and resolved the primary image instead of rejecting.
- An unknown outer handle on a nested Function executed its inner Stability provider and resolved the inner primary image.
- Persisted `MaskOutput` casing executed the paid ancestor and returned the editor's default image instead of treating the unknown exact handle as invalid.

The same old production passed the legitimate nested provider-secondary metadata route and absent/empty default-handle cases, demonstrating that the regression does not demand broader behavior changes.

## Permanent regressions

`flowExecutionFunctionNode.test.ts` now proves:

- the gate's exact unknown Stability handle throws a clear `NonRetryableError` with zero provider POSTs;
- an unknown nested Function output throws before any inner provider call;
- an Atlas-backed nested secondary Function output reaches the outer Function with its distinct image/MIME metadata and exactly one submission plus one materialization;
- the pre-existing Atlas additional-result test retains primary/additional MIME metadata and single internal usage attribution;
- the pre-existing local named-output and nested secondary-output cases retain exact values;
- absent and persisted empty handles retain ordinary provider primary-output compatibility;
- malformed named-handle casing is not normalized to a different paid output and rejects with zero calls.

## Final verification

```text
# Focused Function and canonical connection/output contract neighbors
npx vitest run --configLoader runner \
  src/lib/flowExecutionFunctionNode.test.ts src/lib/functionNodes.test.ts \
  src/lib/flowSignals.test.ts src/lib/flowConnectionContracts.test.ts
Test Files  4 passed (4)
Tests       87 passed (87)

# Relevant Function/output, cost, Source, cancellation, upscale, and usage matrix
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
Tests       205 passed (205)

# Functions/Flow matrix
npx vitest run --configLoader runner src/lib/flowExecution*.test.ts \
  src/lib/functionNodes.test.ts src/lib/flowSignals.test.ts \
  src/lib/listExecution.test.ts src/lib/appSmoke.test.ts \
  src/lib/costEstimation.test.ts src/lib/cloudImageUpscale.test.ts \
  src/lib/exponentialBackoff.test.ts src/store/flowStore.test.ts \
  src/store/flowStore.bookmarks.test.ts src/store/flowStore.remoteSync.test.ts
Test Files  22 passed (22)
Tests       211 passed (211)

npm run verify:flow-production
Test Files  9 passed (9)
Tests       321 passed (321)
Flow production audit passed: 63 nodes, 182 model contracts, 178 normal model options.

npx tsc -b tsconfig.app.json tsconfig.node.json --force --pretty false
PASS

npx eslint src/lib/flowExecution.ts \
  src/lib/flowExecutionFunctionNode.test.ts src/lib/functionNodes.ts \
  src/lib/flowNodeContracts.ts src/lib/flowConnectionContracts.ts
PASS

git diff --check
git diff --cached --check
PASS
```

A production build was not rerun: the correction changes TypeScript runtime/contract helpers only, with no Vite, packaging, native, asset, or build-configuration seam. Forced app/node TypeScript and the production Flow verifier cover the touched boundary.

## Residual risk and gate boundary

- No live paid provider request was made. Deterministic provider fixtures prove submission cardinality and fail-before-spend behavior.
- The correction trusts the existing `resolveFlowNodePorts` catalog as the canonical advertised contract; any future dynamic output must be added there to become connectable and Function-addressable.
- Default handles deliberately retain legacy primary-output compatibility even where a node's visible ports are named. This is required compatibility, not a named-handle alias.
- This is author evidence only. It claims neither acceptance, integration, audit closure, nor FBL-009 closure. A fresh Terra Context Cartographer re-gate remains required.
