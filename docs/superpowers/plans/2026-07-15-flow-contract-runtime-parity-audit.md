# Flow Contract/Runtime Parity Audit Implementation Plan

> **Execution note:** This plan is being executed in the current workspace because the owner explicitly asked for the complete fix without further checkpoints. Each slice remains red/green tested and independently reviewable.

**Goal:** Make exact typed Flow connections truthful for every node input and dynamic variant: every type accepted by a port must be consumed by runtime behavior, and every type the runtime intentionally consumes must be connectable.

**Architecture:** Treat `flowNodeContracts.ts` as the UI/connection declaration, but verify it against an independently maintained runtime-capability fixture instead of deriving both sides from the same registry. Align the execution collectors, dependency discovery, and connected-source preview helpers with those declared capabilities. Generate a human-readable audit from the independent fixture and fail `verify:flow-production` when coverage or parity drifts.

**Tech stack:** React Flow, TypeScript, Vitest, Vite SSR audit scripts.

---

## Task 1: Establish the independent parity matrix

**Files:**
- Create: `src/lib/flowRuntimePortCapabilities.ts`
- Create: `src/lib/flowRuntimePortCapabilities.test.ts`
- Modify: `scripts/generate-flow-node-audit.mjs`
- Modify: `scripts/verify-flow-production.mjs`
- Modify: `package.json`

1. Enumerate every concrete input handle for all 63 `FlowNodeType` entries and every material dynamic variant (model modality, generation mode, list/envelope item kind, function value kind, portal role, and similar port-changing state).
2. Record runtime-consumed types from the actual consumer path, with an evidence path and a small behavior fixture for each multi-type input.
3. Add a failing completeness test proving every resolved input port is represented and every runtime capability maps to a real contract port.
4. Add a failing parity test comparing normalized contract types, cardinality, and dynamic variants against the independent matrix.
5. Extend the generated audit with runtime evidence and make the production Flow verifier run the parity suite.

## Task 2: Repair media/reference contract mismatches

**Files:**
- Modify: `src/lib/flowNodeContracts.ts`
- Modify: `src/lib/flowNodeContracts.test.ts`
- Modify: `src/lib/flowConnectionContracts.test.ts`
- Modify: `src/lib/imageEditConnections.ts`
- Modify: `src/lib/imageEditConnections.test.ts`
- Modify: `src/lib/videoFrameConnections.ts`
- Modify: `src/lib/videoFrameConnections.test.ts`
- Modify: `src/lib/flowSignals.test.ts`

1. Preserve the red tests for Text and JSON descriptions sharing an Image reference handle with the referenced image.
2. Add red tests for the equivalent Video reference behavior, including edge-order-independent media resolution.
3. Add red tests for composite image sources already supported by runtime collectors (package/envelope and the concrete image-producing node variants) on Crop, Verify, frame, mask, and reference inputs where applicable.
4. Generalize source resolution to scan all matching edges and resolve the first compatible media source without allowing a descriptive edge to hide it.
5. Keep image/media as the leading displayed port type while allowing multiple compatible edges only on reference/context inputs.

## Task 3: Repair Source Bin and container compatibility

**Files:**
- Modify: `src/lib/flowNodeContracts.ts`
- Modify: `src/lib/flowConnectionContracts.test.ts`
- Modify: `src/lib/sourceBin.ts`
- Modify: `src/lib/sourceBin.test.ts`

1. Add red connection tests for direct Text ingest and every concrete list/envelope type the Source Bin runtime can materialize.
2. Add runtime behavior fixtures for each accepted direct/container type.
3. Enumerate only source-library-compatible container item types; do not treat `mixed` as a wildcard under exact type equality.
4. Filter or reject unsupported container items explicitly so a declared type never relies on unsafe casting.

## Task 4: Audit remaining primitive, routing, code, and control nodes

**Files:**
- Modify: `src/lib/flowRuntimePortCapabilities.ts`
- Modify: relevant runtime modules under `src/lib/`
- Modify: relevant node tests

1. Walk the remaining ports by consumer family: primitive/text transforms, math/logic, list/envelope routing, function/code/data nodes, composition/media, and loop/control nodes.
2. For every discrepancy, first add a runtime graph fixture demonstrating intended consumption or rejection.
3. Narrow declarations that runtime does not consume; broaden only when a tested runtime path genuinely handles the type.
4. Cover input cardinality, because a port that intentionally combines descriptions/media or aggregates items must not silently default to one edge.

## Task 5: Align execution dependency discovery

**Files:**
- Modify: `src/store/flowStore.ts`
- Modify: `src/store/flowStore.test.ts`
- Modify: `src/lib/flowRuntimePortCapabilities.test.ts`

1. Build red graph tests showing every contract-valid upstream executable source is scheduled before its consumer.
2. Replace brittle source-node allowlists with contract/result-aware dependency discovery where safe, or exhaustively test the allowlist against the parity matrix.
3. Verify description-only edges do not masquerade as required media and multiple edges on one reference slot remain deterministic.

## Task 6: Verification and audit handoff

**Files:**
- Regenerate: `docs/audits/flow-node-audit-2026-07-15.md`
- Create: `docs/notes/903-flow-contract-runtime-parity-audit.md`

1. Run focused contract, connection, media-resolution, signal, Source Bin, and store tests.
2. Run the independent parity audit and generated-matrix check.
3. Run `npm run verify:flow-production`, TypeScript, the full Vitest suite, and the production build.
4. Record exact commands/results, repaired mismatches, remaining external-only checks, and audit mechanics in the note.

## Task 7: Resume the Flow-backed magazine demo

After the parity gate is trustworthy, use the configured Atlas Cloud provider in Flow to create the official-logo T-shirt, model, environment, composite advertisement, and editorial hero assets. Then execute the separate bilingual magazine plan and validate both `.slppr` files in Paper.
