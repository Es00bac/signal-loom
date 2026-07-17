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

## Residual risk

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
