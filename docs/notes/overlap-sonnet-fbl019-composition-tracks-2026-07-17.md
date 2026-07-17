# FBL-019 — Composition audio-track truth unified across contract/UI/migration/execution

Base HEAD: `ebc96d773c93184aa06d5a8ce1baf47d3d7bf8bd`
Final HEAD: `f7a2cf2` (production + tests), evidence note is a separate commit on top.
Branch: `overlap/sonnet-fbl019-composition-tracks` (worktree `/mnt/d/work_SPaC3/flow-overlap-sonnet-fbl019-composition-tracks`).

## Defect (from `docs/audits/fable-partial-audit-comparison-2026-07-16.md`, FBL-019)

`resolveCompositionPorts` (src/lib/flowNodeContracts.ts:608, pre-fix) derived the Composition
node's audio port count from `data.compositionAudioTrackCount` alone. The `CompositionNode` UI
(src/components/Nodes/CompositionNode.tsx:87) additionally grew the *visible* track count from
connected legacy audio edges via `getVisibleCompositionAudioHandles`. Its attempted self-heal
(`useEffect` at line 90-98) compared `highestConnectedIndex` against `visibleAudioTrackCount`,
which had already folded that same max in — so the repair branch was unreachable, and a saved
project with a stale `compositionAudioTrackCount` plus an explicit higher-numbered audio edge
could disagree between contract, UI, connection validation, and execution about which audio
tracks exist.

## Fix

One canonical pure model, `resolveCompositionAudioTrackModel` (src/lib/compositionTracks.ts), is
now the single source of truth: `effectiveCount = max(1, clamp(authoredCount), highestValidConnectedIndex)`,
bounded to the supported `composition-audio-1..4` handles. Every consumer derives from it:

- **Contract** — `resolveCompositionPorts` (flowNodeContracts.ts) now takes the full
  `FlowNodeContractContext` and reads connected handles via `getConnectedCompositionAudioHandles`
  (edges targeting the node), instead of trusting only the persisted count.
- **UI** — `CompositionNode.tsx` calls the same model to compute `visibleAudioHandles`. The
  unreachable `useEffect` self-heal is deleted outright — no render-time node-data mutation.
- **Migration** — `normalizeCompositionEdges`/`normalizeCompositionConnectionTargetHandle`
  (compositionEdgeMigration.ts) still auto-assign a truly legacy edge (no target handle at all)
  to the next open lane, and still leave explicit valid handles untouched. They now also
  distinguish an explicit handle beyond the 1-4 range or otherwise malformed (`classifyCompositionAudioHandle`)
  and **drop it with a diagnostic** (`normalizeCompositionEdgesWithDiagnostics`) instead of
  silently renumbering it into range — the original bug this migration had for any non-recognized
  explicit handle.
- **Store restore/duplicate/import** — `normalizeCompositionAudioTrackCounts` settles each
  Composition node's persisted `compositionAudioTrackCount` to the canonical effective count,
  wired into `hydratePersistedState`, `replaceFlowSnapshot`, and `pasteClipboard` (project
  restore, snapshot replace/remote-sync, and paste/duplicate). It only rewrites a node's data when
  the value actually differs, preserving referential equality otherwise (no save/reopen churn).
- **Execution** — `buildExecutionContextForNode` (flowStore.ts, now exported for direct testing)
  already iterated all 4 fixed `COMPOSITION_AUDIO_HANDLES` per execution regardless of the stored
  count, restricted to `audioGen`/`functionNode` sources — this was already correct and is now
  covered by a direct regression test; no behavior change was needed there.
- **Overflow/invalid handles** — a live connection attempt with an explicit out-of-range handle is
  left untouched by `normalizeCompositionConnectionTargetHandle` (only `== null` legacy handles get
  auto-assigned), so `validateFlowConnection` correctly rejects it ("target handle ... not
  available on this node") since the contract never exposes a port beyond the effective count.

## Red before fix (manual verification)

Reverting `flowNodeContracts.ts`'s `resolveCompositionPorts` to the pre-fix
`Math.max(1, Math.min(4, Math.floor(finiteNumber(data.compositionAudioTrackCount, 1))))` (ignoring
edges) and re-running `src/lib/flowNodeContracts.test.ts -t "exposes an explicitly connected higher audio track"`
fails: the contract only exposes `composition-audio-1` even with an explicit `composition-audio-3`
edge present, reproducing FBL-019 exactly as described in the audit. Restoring the fix makes it
green again.

## Test evidence (all commands run with `--configLoader runner`)

```
npx vitest run --configLoader runner \
  src/lib/compositionTracks.test.ts \
  src/lib/compositionEdgeMigration.test.ts \
  src/lib/flowNodeContracts.test.ts \
  src/lib/flowConnectionContracts.test.ts \
  src/store/flowStore.test.ts \
  src/store/flowStore.runNode.test.ts \
  src/store/flowStore.bookmarks.test.ts \
  src/store/flowStoreCancellation.test.ts \
  src/store/flowStore.remoteSync.test.ts \
  src/lib/flowRuntimePortCapabilities.test.ts \
  src/lib/costEstimation.test.ts \
  src/lib/listExecution.test.ts
# 12 files passed, 431 tests passed

npx vitest run --configLoader runner src/lib/flowExecutionComposition.test.ts src/lib/mediaComposition.test.ts
# 2 files passed, 36 tests passed (composition execution/composeMedia — unrelated behavior confirmed unchanged)

npm run verify:flow-production
# 9 files passed, 351 tests passed; "Flow production audit passed: 63 nodes, 182 model contracts, 178 normal model options."
```

New/changed test counts by file: `compositionTracks.test.ts` 19 tests (rewritten around the
canonical model + `normalizeCompositionAudioTrackCounts`), `compositionEdgeMigration.test.ts` 10
tests (+5 new: overflow, malformed, stable multi-legacy handles, explicit-handle preservation
alongside legacy migration, unchanged video migration), `flowNodeContracts.test.ts` 152 tests (+2
new: stale-count-with-explicit-edge exposure, track-4 overflow rejection),
`flowStore.test.ts` 35 tests (+7 new, see below).

### Required scenarios and where each is proven

- **Reopen with `compositionAudioTrackCount: 1` + explicit `composition-audio-3` edge** —
  `flowStore.test.ts > FBL-019 > "reopens a saved project with a stale count..."`: asserts
  restored node data (`compositionAudioTrackCount === 3`), contract ports (`resolveFlowNodePorts`
  exposes tracks 1-3), connection validation recognizes track 3 as a real port, and
  `buildExecutionContextForNode` consumes it exactly once.
- **Track-4 boundary** — sibling test `"normalizes at the supported track-4 boundary"`.
- **Multiple legacy edges get stable non-colliding handles across repeated normalization/save/reopen, explicit handles fixed** —
  `"assigns stable non-colliding handles to multiple legacy audio edges..."` (store-level, calls
  `hydratePersistedState` twice) plus a pure-function version in `compositionEdgeMigration.test.ts`.
- **Higher authored count without connections stays visible after reopen and after disconnect** —
  `"keeps a larger authored count visible after reopen and after its higher track disconnects"`.
- **Invalid/zero/fractional/oversize saved counts normalize deterministically, no update loop** —
  `"clamps invalid, zero, fractional, and oversize saved counts deterministically..."` (store-level,
  hydrates twice and asserts identical node array) plus the pure-function unit tests in
  `compositionTracks.test.ts`.
- **Contract resolution works before UI mount, no `useEffect`** — every `flowNodeContracts.test.ts`
  assertion calls `resolveFlowNodePorts` directly with no React render; `CompositionNode.tsx`'s
  self-heal `useEffect` is deleted, not merely disabled.
- **Per-track offset/volume/enabled reach runtime in normalized handle order** —
  `"collects per-track offset, volume, and enabled settings in normalized handle order without
  treating the video source as an audio lane"`: asserts `context.videoInput` is the video URL (not
  folded into `audioInputs`) and `context.audioInputs` is `[track1, track2]` in order with their
  distinct offset/volume/enabled values.
- **Overflow/unknown handles fail visibly; existing video migration unchanged** —
  `"rejects an explicit connection attempt to an out-of-range audio handle..."` (store `onConnect`,
  asserts no edge added and node `error` mentions the bad handle) plus
  `compositionEdgeMigration.test.ts`'s `"rejects an already-persisted explicit handle beyond track 4
  with a diagnostic..."`, `"...malformed audio handle..."`, and `"leaves unrelated Composition
  video-handle migration unchanged"`.
- **Whole-snapshot normalization is idempotent** — `compositionTracks.test.ts`'s
  `"is idempotent across the whole snapshot..."` (pure function, referential equality on the
  second pass) and the store-level double-hydrate assertions above (`toEqual` the first settled
  state).

## Static gates

- `npx tsc -b --force --pretty false` — clean (fresh, non-incremental).
- `npx eslint <9 changed files>` — clean.
- `git diff --check` — clean.
- `npm run build` (sandbox disabled, `dist/` verified written) — succeeds; pre-existing
  chunk-size warnings only, unrelated to this change.

## Migration/idempotence behavior summary

- A truly legacy audio edge (`targetHandle == null`) is still auto-migrated to the next open lane;
  repeated normalization of the same edge set is a no-op (handle already explicit).
- An explicit handle beyond `composition-audio-4`, or shaped like `composition-audio-0`
  (non-positive index), is dropped from the edge list with a `{ targetNodeId, edgeId, handle,
  reason }` diagnostic (`reason: 'overflow' | 'malformed'`) rather than being silently renumbered
  into range or left invisibly attached.
- `normalizeCompositionAudioTrackCounts` only rewrites `compositionAudioTrackCount` when the
  canonical value differs from what's stored, so an already-settled snapshot produces the
  identical node array (by reference) on a repeat call — verified both at the pure-function level
  and through two consecutive `hydratePersistedState()` calls in the store.
- Composition video-handle migration (`legacyVideoEdges` collapsing to the single video handle) is
  untouched — same code path, same test coverage, explicit regression test added.

## Residual risk (as of `f7a2cf2`, before the correction below)

- The dropped-overflow-edge diagnostic (`normalizeCompositionEdgesWithDiagnostics`) is only
  consumed by tests today; it is not yet wired into a user-visible warning (e.g. node `error`) when
  it fires during background restore/migration paths (`hydratePersistedState`,
  `replaceFlowSnapshot`, `pasteClipboard` call the diagnostics-discarding `normalizeCompositionEdges`
  wrapper). In practice this only fires for corrupted/hand-edited project JSON — the UI can never
  produce a handle beyond `composition-audio-4` — but a future pass could surface the diagnostic on
  the affected node the same way connection-time rejection already does.
- `insertTemplate` (template insertion) does not run `normalizeCompositionAudioTrackCounts`; a
  template whose Composition node ships a stale count alongside a higher explicit audio edge would
  still resolve correctly live (contract/UI/execution are edge-derived), but the persisted count
  wouldn't settle until the next full restore/paste. Left out to keep the diff scoped to the
  explicitly required restore/duplicate/import/new-connection paths.

## Correction (independent review, 3 Medium gaps closed on top of `f7a2cf2`)

An independent review of `f7a2cf2` found the "residual risk" above understated two real gaps and
identified a third, more serious one in the *live connection* path that the original test suite
didn't exercise: `onConnect` validated a brand-new connection against only the edges that already
existed, so `resolveCompositionPorts` (which derives the effective audio-track count from
`context.edges`) couldn't see the very edge being added. An authored-count-1 Composition node could
therefore **reject its own first connection** to `composition-audio-2` or `composition-audio-3`,
live in the UI — not just on restore.

1. **Candidate-inclusive connection validation (`onConnect`, flowStore.ts).** The new connection is
   now validated as a synthetic edge (`{ ...connection, id: 'candidate-<id>' }`) appended to the
   edge set passed to `validateFlowConnection`, the same pattern `annotateFlowEdge` already uses
   for an edge validated against a context containing itself. The synthetic id lets
   `maxConnections`/`connectionGroups` counting exclude it as "not yet existing" while
   `resolveCompositionPorts` sees it as already connected, so the effective track count expands
   *before* the port lookup that would otherwise reject the target handle. This applies uniformly
   whether the handle was explicit (`composition-audio-3`) or normalized from a legacy `null`
   handle by `normalizeCompositionConnectionTargetHandle` earlier in the same `onConnect` call. On
   acceptance, `onConnect` now also calls `normalizeCompositionAudioTrackCounts` so the persisted
   count settles immediately instead of only being correct dynamically.
2. **Template insert and incremental remote sync now normalize Composition state, and UI handle
   visibility is edge-derived, not media-derived.** `insertTemplate` and the non-snapshot branch of
   `applyRemoteFlowGraphChange` (an edge added/removed by a remote peer) now both run
   `normalizeCompositionAudioTrackCounts` after `normalizeFlowEdges`, matching the store's other
   mutation paths. Separately, `CompositionNode.tsx` computed which audio handles counted as
   "connected" (for track visibility) from **resolved media** (`findConnectedMedia`, which requires
   the source node to already have a result/asset URL) instead of from the edge model directly —
   so a validly connected higher track whose source hadn't produced media yet was invisible in the
   UI even though contracts, validation, and execution all already saw it. `connectedAudioHandleIds`
   now comes from `getConnectedCompositionAudioHandles(id, edges)` (the same canonical helper the
   contract layer uses), and `connectionSignature` includes the raw connected-handle list so the
   component re-renders when such an edge is added even with no media yet.
3. **Dropped overflow/malformed edges now surface a visible, durable node error instead of vanishing
   silently.** `normalizeFlowEdges` gained an optional `onCompositionDiagnostics` callback invoked
   with whatever `normalizeCompositionEdgesWithDiagnostics` produced; `hydratePersistedState` and
   `replaceFlowSnapshotState` (the restore and project-import/snapshot-replace paths) now capture
   those diagnostics and run them through the new `surfaceCompositionEdgeDiagnostics` (in
   `compositionEdgeMigration.ts`), which patches the affected Composition node's `data.error` with a
   message naming the exact dropped handle and edge (e.g. `Removed unsupported audio connection on
   handle "composition-audio-9" (beyond the supported 4-track limit).`). The edge is still dropped —
   this doesn't restore overflow handles into range — but the rejection is now visible on the node,
   the same way a live connection-time rejection already was. `insertTemplate`/`onConnect` were left
   on the diagnostics-discarding `normalizeFlowEdges` default (no callback) since those paths can
   never carry a persisted overflow handle that didn't already fail validation on the way in;
   `pasteClipboard` is unchanged for the same reason (it copies from an already-normalized live
   graph, not untrusted persisted/imported JSON) and remains out of scope, consistent with the
   restore/import framing above.

### Correction test evidence

New regression tests (all fail against `fd7cc93` for the reason stated, pass after the fix):

- `flowStore.test.ts` — `"accepts a newly drawn connection onto an explicit higher track even
  though the saved count is stale (FBL-019 gap 1)"`, `"accepts a legacy (implicit-handle)
  connection normalized onto a track beyond the stale saved count (FBL-019 gap 1)"` (both drive the
  real `onConnect` production path), `"settles a stale template-authored count against a template
  edge whose audio source has no media yet (FBL-019 gap 2)"` (drives `insertTemplate`),
  `"surfaces a visible, durable node error instead of silently dropping a persisted overflow handle
  on restore"` (drives `hydratePersistedState`), `"surfaces a visible node error for a dropped
  overflow handle when restoring a project snapshot"` (drives `replaceFlowSnapshot`).
- `flowStore.remoteSync.test.ts` — `"settles a stale Composition audio-track count when a remote
  edge-added change lands on a higher track (FBL-019 gap 2)"` (drives
  `applyRemoteFlowGraphChange({ type: 'flow-edge-added' })` with an unresolved-media source).
- `CompositionNode.test.tsx` (new file) — `"renders a higher explicit audio track handle even when
  its source has not produced media yet"` renders the real component (`renderToStaticMarkup` +
  `ReactFlowProvider`, the same pattern used by `AudioNode.test.tsx`/`VideoNode.test.tsx`) and
  asserts `data-handleid="composition-audio-3"` is present in the output; a sibling test guards
  that an unconnected higher track still does not render.
- `compositionEdgeMigration.test.ts` — 3 new tests for `surfaceCompositionEdgeDiagnostics`: sets a
  message naming the handle on the correct target node, combines multiple diagnostics for the same
  target into one message, and is a reference-identity no-op when there are no diagnostics.

```
npx vitest run \
  src/store/flowStore.test.ts \
  src/store/flowStore.remoteSync.test.ts \
  src/components/Nodes/CompositionNode.test.tsx \
  src/lib/compositionEdgeMigration.test.ts \
  src/lib/flowNodeContracts.test.ts \
  src/lib/compositionTracks.test.ts \
  src/lib/flowExecutionComposition.test.ts
# 7 files passed, 236 tests passed

npm run verify:flow-production
# 9 files passed, 356 tests passed; "Flow production audit passed: 63 nodes, 182 model contracts, 178 normal model options."

npx vitest run
# 683 test files; 2 pre-existing unrelated failures (ImageSourceDocument LAN-session asset-API
# tests, bundledFontPdfxIntegration missing a build/ fixture) — same failures present at fd7cc93,
# unaffected by this change; 6112/6114 tests passed.

npm run build
# tsc -b + vite build, clean; dist/ mtime advanced (sandbox disabled).

npm run lint
# 0 errors, 84 pre-existing warnings, none in a file this correction touched.

git diff --check
# clean.
```

### Correction final commits

- `a30a116` — production fixes (flowStore.ts, snapshotActions.ts, compositionEdgeMigration.ts,
  CompositionNode.tsx) and their tests (flowStore.test.ts, flowStore.remoteSync.test.ts,
  compositionEdgeMigration.test.ts, CompositionNode.test.tsx, new file), in one commit.
- This note update is a separate commit on top of `a30a116`.
