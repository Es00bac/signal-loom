# FBL-027 persisted edge contract refresh

## Scope and ownership

- Exact base: `b0597e23508014c7536a540fcbda34b0cf39db4b`
- Production and permanent regression commit: `e0691897`
- Finding: `patchNodeData` changed node configuration without re-deriving the durable
  `edge.data.flowContract` annotations already stored on connected edges.
- This is an author lane. It does not self-approve or integrate the correction.

## Red proof

The dedicated permanent suite was run before production changes. Four of its initial five tests
failed on the exact base:

- a JavaScript output changed from text to number while its edge remained `valid: true` carrying
  text;
- an XML/YAML target changed from text input to JSON input while its edge still accepted text;
- two edges on a removed Color Swatch named handle remained valid;
- the stale annotation was exported unchanged; and
- lowering an authored Composition count below an existing routed track left persisted node data
  inconsistent with the routed handle.

The unchanged/content-only/disconnected/missing-node control passed on old code, proving the red
cases were specific to stale edge contracts rather than ordinary patch behavior.

## Correction

`flowNodeConnectionContractsChanged` centralizes contract-affecting detection. It compares the
edited node's resolved dynamic ports and output types before and after the patch, with explicit
coverage for the three graph-wide facts not fully represented by its own port array: Portal pair
identity, Function runtime media family, and Composition authored-versus-routed audio count.

When the contract changes, `patchNodeData` now runs the same canonical edge ingress pipeline used
by import, paste, hydration, and remote replacement. Consequently:

- every edge annotation is re-derived from the current graph, including transitive pass-through
  outputs;
- compatible edges receive canonical current carried/accepted types;
- incompatible edges follow the established non-destructive legacy policy and remain present with
  `flowContract.valid: false`, the current carried/accepted types, and a truthful reason/converter
  diagnostic;
- named handles removed by configuration changes are diagnosed as unavailable;
- Composition handle migration and durable FBL-019 diagnostics remain authoritative; and
- byte-equivalent edges reuse their previous objects, avoiding unrelated graph churn.

Content-only and no-op patches do not normalize edges. A disconnected non-Portal node cannot
affect a persisted edge and also bypasses the normalization pass.

## Permanent coverage

`flowStore.edgeContractRefresh.test.ts` covers:

- source and target configuration changes in incompatible and compatible directions;
- handle-specific Color Swatch contracts and multiple fan-out edges;
- transitive type propagation through a Virtual pass-through node;
- exact non-mutation of an unrelated edge;
- unchanged, content-only, disconnected, and missing-node patches;
- project and browser export/import plus undo/redo-style snapshot replacement; and
- an existing explicit Composition track-3 route surviving an authored-count reduction while the
  persisted count settles back to routed truth.

## Verification

- Focused contract suites: **3 files, 193 tests passed**.
- Contract/import/native-sync adjacency: **6 files, 223 tests passed**.
- Flow store/bookmark/reference/remote-sync adjacency: **4 files, 82 tests passed**.
- Runtime/cancellation/ownership adjacency: **88 tests passed**; the sole failure is the unrelated
  Source-persistence ownership assertion documented below.
- Flow production verifier: **9 files, 374 tests passed**.
- Static Flow audit: **63 node contracts, 182 model contracts, 178 normal model options**.
- Forced App TypeScript: passed.
- Forced Node TypeScript: passed.
- ESLint over all changed production/test files: passed.
- `git diff --check`: passed.
- `npm run build`: passed.

## Unrelated exact-base failure

`flowRunOwnership.test.ts` case “removes a Source item when ownership goes stale during Source
persistence” expects zero Source items but receives one at line 756. The exact isolated test was
run in a disposable worktree at untouched base `b0597e23` and failed with the identical assertion,
line, and value. FBL-027 does not alter the Source publication path.

## Residuals for independent review

- The existing saved-flow compatibility policy preserves a now-incompatible edge with an explicit
  invalid contract diagnostic instead of deleting user graph structure.
- Edge object equivalence uses the persisted JSON projection. Unexpected non-serializable edge
  metadata safely falls back to a new edge object; it cannot suppress contract refresh.
- Flow has no separate user-facing undo stack. Snapshot replacement is the actual graph restore
  boundary, so the regression exercises pre-patch and post-patch snapshots as undo/redo-style
  restoration plus a browser export/reopen cycle.
