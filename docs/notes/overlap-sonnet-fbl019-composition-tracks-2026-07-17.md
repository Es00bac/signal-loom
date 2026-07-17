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
- `81973e1` — note update for the above, separate commit on top of `a30a116`.

## Second correction (independent review, 3 remaining gaps closed on top of `81973e1`)

A second independent review of `81973e1` found the "dropped-overflow-edge diagnostic" was still
incomplete in three ways, none exercised by the first correction's test suite:

1. **`classifyCompositionAudioHandle`'s regex silently accepted nonnumeric handles.**
   `/^composition-audio-(\d+)$/` requires a pure-digit suffix, so `composition-audio-x`,
   `composition-audio--1`, and `composition-audio-1.5` all failed the regex and fell through to
   `return null` — the same "not audio-track-shaped at all" result the function returns for the
   unrelated video handle. `normalizeCompositionEdgesWithDiagnostics` treated a `null` classification
   as "nothing to diagnose" and silently preserved the invalid edge untouched, so a hand-edited or
   corrupted project could carry a dangling, non-functional audio edge with no track, no execution
   input, and no visible warning.
2. **The migration branch recognized only `audioGen` as an audio-producing source.** Execution's own
   `collectResultInputForHandle` accepts `['audioGen', 'functionNode']` for every
   `composition-audio-N` handle (flowStore.ts, `buildExecutionContextForNode`), but
   `normalizeCompositionEdgesWithDiagnostics` gated its whole audio-handle validation branch on
   `sourceNode?.type === 'audioGen'`. A `functionNode`-sourced edge with an overflow or malformed
   handle skipped the branch entirely and fell to `preserved.push(edge)`, bypassing recovery the same
   way the regex bug did, just from a different source type.
3. **The recovery diagnostic was written to the transient `node.data.error` field.** Both persistence
   serializers (`stripRuntimeData` for local autosave/export, `stripProjectRuntimeData` for
   project/workspace snapshot export) intentionally null out `error` before writing, so the warning
   never survived a save/reopen cycle. Independently, any later successful operation on the same node
   (e.g. a valid new connection via `onConnect`, which resets `error: undefined` on success) silently
   erased the warning while the underlying edge remained dropped — the rejection reason vanished even
   though the drop itself was correct. Only `hydratePersistedState` and `replaceFlowSnapshot` ever
   wired the diagnostics callback at all; `onEdgesChange`, `insertTemplate`, `pasteClipboard`, and the
   incremental branch of `applyRemoteFlowGraphChange` used the diagnostics-discarding default of
   `normalizeFlowEdges`, so a malformed/overflow handle arriving through any of those paths (a synced
   remote edge, a pasted clipboard edge injected by another bug, a template) was dropped with no trace
   at all.

### Fix

1. **`classifyCompositionAudioHandle` (compositionTracks.ts)** now checks the
   `composition-audio-` prefix directly instead of relying on the numeric-only regex to reject
   non-matches as "unrelated." Anything with the prefix that isn't a valid positive integer suffix
   — nonnumeric, negative, fractional, or otherwise malformed — now classifies as `malformed`
   instead of `null`. The video handle and any genuinely unrelated string still classify as `null`
   (unchanged).
2. **`normalizeCompositionEdgesWithDiagnostics` (compositionEdgeMigration.ts)** now gates its
   audio-handle branch on `isCompositionAudioProducingSourceType(sourceNode?.type)` — a new shared
   predicate over `COMPOSITION_AUDIO_PRODUCING_SOURCE_TYPES = ['audioGen', 'functionNode']`,
   matching execution's own accepted list exactly. Within that branch, only a truly handleless
   (`== null`) edge from `audioGen` is still auto-assigned to the next open lane; a null-handle
   `functionNode` edge is left untouched (functionNode can also legitimately feed the video handle,
   so a bare `null` is genuinely ambiguous and is not guessed at). Every other non-null handle that
   isn't one of the four valid `composition-audio-N` handles — whether malformed-suffix, overflow,
   or not audio-track-shaped at all (e.g. `"banana"`) — now fails closed with a diagnostic and is
   dropped, regardless of source type.
3. **A new bounded, typed, persisted field replaces `data.error` for this diagnostic.**
   `NodeData.compositionAudioMigrationWarnings?: CompositionAudioMigrationWarning[]` (types/flow.ts)
   holds `{ handle, reason, message }` records. `surfaceCompositionEdgeDiagnostics`
   (compositionEdgeMigration.ts) now writes to this field instead of `data.error`, **merging** new
   diagnostics with whatever a node already has (deduped by `reason:handle`, so re-normalizing after
   the bad edge is already gone doesn't wipe the record) rather than replacing it outright. Bounds:
   `COMPOSITION_AUDIO_MIGRATION_WARNING_LIMIT = 8` entries, `..._HANDLE_MAX_LENGTH = 64` and
   `..._MESSAGE_MAX_LENGTH = 200` characters (truncated with an ellipsis), enforced by
   `sanitizeCompositionAudioMigrationWarnings` — reused at every persistence/import boundary
   (`sanitizePersistedFlowState` in flowStore.ts for local autosave rehydrate,
   `sanitizeNodeData`/`sanitizeFlowSnapshot` in projectValidation.ts for project/snapshot import) so
   a corrupted or hostile project file can never grow this field unbounded. Neither serializer nor
   `data.error`/`statusMessage` is touched by this field — `stripRuntimeData`/`stripProjectRuntimeData`
   were left as-is and naturally preserve it via their `...data` spread since it isn't in either
   strip list. `CompositionNode.tsx` derives its visible error-banner text via
   `data.error ?? formatCompositionAudioMigrationWarningMessage(data.compositionAudioMigrationWarnings)`
   — a live runtime error still takes priority, but with none active the persisted warning becomes
   visible without ever being written into `data.error` itself. `collectFlowDiagnostics`
   (flowDiagnostics.ts) surfaces each persisted record as its own non-blocking (`blocksRun: false`,
   `severity: 'warning'`) entry in the existing Diagnostics panel.
4. **Every graph-ingress path now surfaces the same diagnostic.** A new `flowStore.ts`-private
   helper, `normalizeFlowEdgesWithCompositionDiagnostics(nodes, edges)`, wraps
   `normalizeFlowEdges` + `surfaceCompositionEdgeDiagnostics` atomically and replaces the ad hoc
   per-call-site wiring. It is now used by `hydratePersistedState`, `onEdgesChange`,
   `insertTemplate`, `pasteClipboard`, and the incremental (`flow-edge-added`/etc.) branch of
   `applyRemoteFlowGraphChange` — previously only `hydratePersistedState` and (via
   `replaceFlowSnapshotState` in snapshotActions.ts, unchanged) `replaceFlowSnapshot` wired
   diagnostics at all. `onConnect` (live connection) is deliberately untouched: a malformed/overflow
   handle is already rejected up front by `validateFlowConnection` (the contract never exposes a port
   for it), so it can never admit a bad edge in the first place and doesn't need this recovery path.

### Red before fix

All new tests below fail against `81973e1` before the fix, for the reasons recorded at the top of
each file's new test block (nonnumeric handles classify as `null` instead of `malformed`; the new
sanitize/format helpers don't exist yet; `surfaceCompositionEdgeDiagnostics`/hydrate/onEdgesChange/
insertTemplate/pasteClipboard/remote-sync tests assert `data.compositionAudioMigrationWarnings` which
is `undefined` on `81973e1` because the field didn't exist and the old code wrote `data.error`
instead; `CompositionNode` render test looks for the warning text with no live `data.error`, which
`81973e1`'s render never shows).

```
npx vitest run --configLoader runner \
  src/lib/compositionTracks.test.ts src/lib/compositionEdgeMigration.test.ts \
  src/lib/flowDiagnostics.test.ts src/store/flowStore.test.ts \
  src/store/flowStore.remoteSync.test.ts src/components/Nodes/CompositionNode.test.tsx
# (run against 81973e1, before any production change)
# Test Files  6 failed (6)
#      Tests  30 failed | 90 passed (120)
```

All 30 failures are the newly added tests (one per required scenario below); all 90 pre-existing
tests in those six files were already green and stayed untouched by the red run.

### Green after fix

```
npx vitest run --configLoader runner \
  src/lib/compositionTracks.test.ts src/lib/compositionEdgeMigration.test.ts \
  src/lib/flowDiagnostics.test.ts src/store/flowStore.test.ts \
  src/store/flowStore.remoteSync.test.ts src/components/Nodes/CompositionNode.test.tsx
# Test Files  6 passed (6)
#      Tests  121 passed (121)   (120 + 1 additional onEdgesChange "replace"-variant test)

npx vitest run --configLoader runner \
  src/lib/compositionTracks.test.ts src/lib/compositionEdgeMigration.test.ts \
  src/lib/flowDiagnostics.test.ts src/lib/flowNodeContracts.test.ts \
  src/lib/flowConnectionContracts.test.ts src/lib/flowSignals.test.ts \
  src/lib/flowRuntimePortCapabilities.test.ts src/lib/imageEditConnections.test.ts \
  src/lib/videoFrameConnections.test.ts src/lib/sourceBin.test.ts \
  src/lib/costEstimation.test.ts src/lib/listExecution.test.ts \
  src/lib/flowExecutionComposition.test.ts src/lib/mediaComposition.test.ts \
  src/lib/projectValidation.test.ts src/store/flowStore.test.ts \
  src/store/flowStore.runNode.test.ts src/store/flowStore.bookmarks.test.ts \
  src/store/flowStoreCancellation.test.ts src/store/flowStore.remoteSync.test.ts \
  src/components/Nodes/CompositionNode.test.tsx src/components/Nodes/AdvancedImageEditorNode.test.tsx
# Test Files  22 passed (22)
#      Tests  651 passed (651)

npm run verify:flow-production
# Test Files  9 passed (9)
#      Tests  365 passed (365)
# Flow production audit passed: 63 nodes, 182 model contracts, 178 normal model options.

npx tsc -b --force --pretty false
# clean (fresh, non-incremental)

npx eslint <13 changed files>
# clean

git diff --check
# clean
```

### Required scenarios and where each is proven

- **Nonnumeric malformed handles classify correctly** —
  `compositionTracks.test.ts > classifyCompositionAudioHandle > "classifies nonnumeric or
  malformed-suffix audio-shaped handles as malformed instead of returning null"` covers
  `composition-audio-x`, `composition-audio--1`, `composition-audio-1.5`.
- **Hydration drops+reports `composition-audio-x`/`--1`/`1.5`/zero/overflow; valid 1-4 and a null
  legacy handle retain their existing semantics** — `flowStore.test.ts > "drops every
  malformed/overflow persisted audio handle on hydration while keeping valid 1-4 and a legacy null
  handle intact"` (all seven edge shapes in one graph) plus the parametrized
  `compositionEdgeMigration.test.ts > "drops a persisted nonnumeric malformed audio handle %s..."`.
- **Durability across persist/serialize/reopen without persisting unrelated runtime errors** —
  `flowStore.test.ts > "keeps a composition audio migration warning durable across local
  export/reopen..."` (drives the real `exportFlow()`/`stripRuntimeData` serializer +
  `replaceFlowSnapshot` reopen) and `"...across project/workspace snapshot export and reopen..."`
  (drives `exportProjectFlowSnapshot()`/`stripProjectRuntimeData`); both assert `data.error` is
  absent from the exported JSON and the warning round-trips unchanged.
  `compositionEdgeMigration.test.ts > "merges new diagnostics with a node's existing persisted
  warnings instead of replacing them (durability)"` proves the same at the pure-function level: a
  second call with zero new diagnostics (simulating "the bad edge is already gone") is a reference
  no-op that keeps the first warning.
- **Unrelated successful operations cannot erase the warning** — `flowStore.test.ts > "does not let
  an unrelated successful connection erase a persisted composition audio migration warning"` drives
  a real `onConnect` success (which resets `data.error: undefined`) on the same node afterward and
  asserts the warning list is unchanged by reference-equal deep equality.
- **`collectFlowDiagnostics` exposes the persisted record as a non-blocking warning** —
  `flowDiagnostics.test.ts > "surfaces a persisted Composition audio migration warning as a
  non-blocking diagnostic"` asserts `severity: 'warning'`, `blocksRun: false` in the Diagnostics
  panel's diagnostic list.
- **Template insertion, clipboard paste, `onEdgesChange` add/replace, and incremental remote edge
  addition all surface the warning and never silently drop or preserve the bad handle** —
  `flowStore.test.ts > "...when a template ships a malformed persisted audio handle"` (drives
  `insertTemplate`), `"...when pasting a clipboard-copied malformed audio edge"` (drives
  `copySelection`/`pasteClipboard` on a malformed edge injected directly into the live graph, since
  a normally-drawn connection can never carry one), `"...when onEdgesChange adds a persisted
  overflow edge"` and `"...when onEdgesChange replaces an edge with a malformed handle"` (drive the
  `add` and `replace` `EdgeChange` variants), and
  `flowStore.remoteSync.test.ts > "rejects and diagnoses an overflow audio handle delivered via an
  incremental remote edge-added change"` (drives the non-snapshot branch of
  `applyRemoteFlowGraphChange`).
- **Bounded/deduplicated diagnostics; hostile long handle strings cannot grow the persisted message
  unbounded; unrelated nodes/valid connections keep their own warnings** —
  `compositionEdgeMigration.test.ts > "bounds and deduplicates warnings deterministically when many
  diagnostics accumulate"` (12 diagnostics → capped at 8, deterministic across repeat calls,
  duplicate handle+reason collapses to one entry), `"truncates a hostile long handle string instead
  of persisting it verbatim"` (5000-character handle → bounded output), and `"does not erase an
  existing warning on a node when new diagnostics target a different node"`. Mirrored at the
  sanitizer level in `compositionTracks.test.ts > sanitizeCompositionAudioMigrationWarnings` (drops
  malformed entries, bounds count, truncates long strings).
- **`audioGen` plus every audio-producing effective source accepted by execution (including
  `functionNode`) get the same recovery** — `compositionEdgeMigration.test.ts > "rejects an overflow
  audio handle from a functionNode audio-producing source the same way as audioGen"`, "...a
  malformed audio handle from a functionNode...", "does not touch a valid functionNode audio edge,
  mirroring audioGen" (regression guard), "leaves a legacy null-handle edge from a functionNode
  source untouched instead of auto-assigning it (ambiguous with video)" (regression guard for the
  intentional audioGen-only auto-assign scope), and "leaves a functionNode edge explicitly targeting
  the video handle untouched" (regression guard against false-positive audio misclassification).
  Store-level: `flowStore.test.ts > "rejects overflow/malformed audio handles from a functionNode
  audio-producing source at hydration, matching audioGen"`.
- **Already-fixed candidate-inclusive connection, unresolved-media UI handle visibility, track-count
  settlement, and valid 1-4 execution remain green** — confirmed unmodified and passing in the same
  full regression run above (all pre-`a30a116` and `a30a116` tests, 651/651).

### Bounds chosen

- Entry count: 8 (`COMPOSITION_AUDIO_MIGRATION_WARNING_LIMIT`) — generous for the realistic case (a
  handful of corrupted edges on one node) while bounding a pathological project with dozens of bad
  edges targeting the same node.
- Handle length: 64 chars, message length: 200 chars
  (`COMPOSITION_AUDIO_MIGRATION_HANDLE_MAX_LENGTH`/`..._MESSAGE_MAX_LENGTH`), truncated with a
  trailing `…` — enough for any real handle (`composition-audio-` + a huge but plausible integer)
  while capping a hostile multi-kilobyte handle string from ever reaching persisted JSON verbatim.
- Enforced at both the diagnostic-surfacing merge (`surfaceCompositionEdgeDiagnostics`) and the two
  untrusted-input boundaries (`sanitizePersistedFlowState` for local autosave rehydrate,
  `sanitizeNodeData`/`sanitizeFlowSnapshot` for project/snapshot import), so a value that reached
  persisted storage some other way is re-bounded on every read, not just on write.

### Ingress paths covered (exhaustive per the review's list)

`hydratePersistedState`, `replaceFlowSnapshotState` (via `replaceFlowSnapshot`, unchanged code path
that already called `surfaceCompositionEdgeDiagnostics` and now inherits the field change
automatically), `onEdgesChange` (add and replace), `insertTemplate`, `pasteClipboard`, and the
incremental branch of `applyRemoteFlowGraphChange`. `onConnect` is intentionally left on its existing
immediate-rejection behavior (never admits a bad edge, so nothing to recover). Grepped the whole
`src/` tree for every caller of `normalizeFlowEdges`/`normalizeCompositionEdgesWithDiagnostics`:
only `flowStore.ts`, `compositionEdgeMigration.ts` (self), and `snapshotActions.ts` call either — all
covered.

### Residual risk

- The 8-entry/64/200-character bounds are a judgment call with no product-specified limit; if a
  future case needs to distinguish more than 8 simultaneously-broken tracks on one node the oldest
  entries are silently evicted (`slice(-LIMIT)`) rather than surfaced as "N more truncated" — no
  count-truncation indicator was added, consistent with keeping the diff scoped to the review's
  explicit asks.
- `formatCompositionAudioMigrationWarningMessage` joins all persisted messages into one string for
  the node's single error-banner slot; a node with many distinct warnings shows one long banner
  rather than a structured list. The Diagnostics panel (`collectFlowDiagnostics`) does list each
  warning as a separate entry, so the structured view exists there.

### Final commits

- `17057bf` — production fixes (compositionTracks.ts, compositionEdgeMigration.ts, flowStore.ts,
  flowDiagnostics.ts, projectValidation.ts, CompositionNode.tsx, types/flow.ts) and their tests
  (compositionTracks.test.ts, compositionEdgeMigration.test.ts, flowStore.test.ts,
  flowStore.remoteSync.test.ts, flowDiagnostics.test.ts, CompositionNode.test.tsx), in one commit.
- `6ff8843` — note update for the above, separate commit on top of `17057bf`.

## Third correction (independent review, 1 remaining Medium UI/runtime parity gap closed on top of `6ff8843`)

A third independent review of the branch — after confirming the malformed/overflow classifier,
Function-audio migration acceptance, typed bounded durable recovery records, every ingress path,
reopen persistence, Diagnostics reporting, TypeScript, lint, and diff checks all passed — found one
remaining Medium defect:

`CompositionNode.tsx`'s connected-media lookup (`findConnectedMedia`, called from
`connectionSignature` and the `connectedVideo`/`connectedAudioTracks` `useMemo`) never included
`functionNode` in either handle's `acceptedTypes` (`['videoGen', 'composition']` for video,
`['audioGen']` for audio). Execution's own `collectResultInputForHandle`
(`buildExecutionContextForNode`'s `videoInput`/`audioInputs`) already accepted
`['..., 'functionNode']` for both handles and gated a Function node's admission on its own
`data.resultType`. So a Function node with `resultType: 'audio'`, a usable result, and an edge to
`composition-audio-1` **executed correctly** (its result flowed into the render) but the
Composition node **displayed that lane as `Connect media`** — no label, no duration, no timeline
block — because the UI's lookup rejected the source node's type outright before ever checking its
result type.

Inspecting `collectResultInputForHandle` itself while fixing this surfaced a second, deeper gap the
review didn't call out but the review's own required negative test would have caught: the function
had **no family check at all** for `functionNode` sources — it accepted a Function node's
`data.result` as either family's execution input regardless of the Function node's actual
`resultType`. A Function node whose `resultType` was `'video'` (or `'text'`, or anything else)
connected to `composition-audio-1` would have been silently consumed as the audio input at
execution time, not just mis-rendered in the UI. This is exactly the "current helper would classify
it as video in its fallback" risk the review flagged for the UI side, present in the execution
truth model too.

### Fix

1. **`functionNodeMatchesCompositionMediaFamily` (compositionTracks.ts, new)** — the single typed
   predicate: `node.type === 'functionNode' && node.data.resultType === family`, where `family` is
   `'audio' | 'video'` (new `CompositionMediaFamily` type). This is the one truth both the UI and
   execution now share, so a Function node can never be shown as one family in the timeline while a
   different (or no) result is fed into execution.
2. **`CompositionNode.tsx`'s `findConnectedMedia`** now takes an explicit `mediaFamily` parameter
   (passed `'video'`/`'audio'` at each of its 4 call sites, which also now include `'functionNode'`
   in their `acceptedTypes`). When the resolved source is a `functionNode`, it is admitted only if
   `functionNodeMatchesCompositionMediaFamily(sourceNode, mediaFamily)` holds; otherwise the lookup
   returns `undefined` exactly as if nothing were connected. The returned `ConnectedMedia.resultType`
   is now the target-derived `mediaFamily` directly, not inferred from `sourceNode.type` (the old
   `sourceNode.type === 'audioGen' ? 'audio' : 'video'` fallback — the exact bug the review flagged,
   since a `functionNode` would have fallen through to `'video'` unconditionally).
3. **`getMediaLabel`** gained a `functionNode` branch returning `node.data.functionNode?.title ??
   'Function output'` — the Function node's own configured title, a deterministic label instead of
   falling through to `node.data.modelId ?? 'Video track'`.
4. **`flowStore.ts`'s `collectResultInputForHandle`** now applies the same shared predicate: when
   the resolved source is a `functionNode`, it derives the expected family from which of
   `'audioGen'`/`'videoGen'` is present in the caller's `acceptedTypes` (the two Composition call
   sites are the only ones that ever include `'functionNode'`, and each supplies exactly one of the
   two) and rejects the match if `functionNodeMatchesCompositionMediaFamily` fails. This closes the
   latent execution-side wrong-family leak described above using the identical typed reuse rather
   than a second, divergent truth model — satisfying the review's "smallest typed reuse" instruction.

No change was needed to `resolveNodeOutputAsset`, the audio/video-import (`mediaMode`) resolution
already used by both files, `resolveCompositionAudioTrackModel`, the migration/diagnostics code from
the prior two corrections, or any persisted-data shape.

### Red before fix

Both new regression pairs were written and run against the working tree prior to this section's
production fix (i.e. at `6ff8843`, before `functionNodeMatchesCompositionMediaFamily` and its call
sites existed):

```
npx vitest run src/components/Nodes/CompositionNode.test.tsx src/store/flowStore.test.ts \
  -t "independent review correction"
# Test Files  2 failed (2)
#      Tests  2 failed | 2 passed | 52 skipped (56)
```

The 2 failures were exactly the new defect-proving cases:
- `CompositionNode.test.tsx > "shows the real media for a Function node whose effective result type
  is audio, instead of 'Connect media'"` — failed because `'Narration Function'` never appeared;
  `functionNode` was excluded from `acceptedTypes` entirely, so the lane rendered `Connect media`.
- `flowStore.test.ts > "does not feed a wrong-family Function result (video) into the
  composition-audio-1 execution input"` — failed because `context.audioInputs` contained the
  video-typed Function node's URL; `collectResultInputForHandle` had no family check at all.

(The negative UI test and the positive store-level test both happened to pass even before the fix —
the negative UI case because excluding `functionNode` entirely already produced the expected
"nothing connected" rendering regardless of family, and the positive store-level case because
`collectResultInputForHandle`'s pre-fix unconditional acceptance happened to include the
correct-family result too. Both are still asserted going forward as permanent regressions.)

### Green after fix

```
npx vitest run src/components/Nodes/CompositionNode.test.tsx src/store/flowStore.test.ts
# Test Files  2 passed (2)
#      Tests  56 passed (56)

npx vitest run --configLoader runner \
  src/components/Nodes/CompositionNode.test.tsx \
  src/lib/compositionTracks.test.ts src/lib/compositionEdgeMigration.test.ts \
  src/lib/compositionMediaState.test.ts src/lib/flowExecutionComposition.test.ts \
  src/lib/mediaComposition.test.ts src/lib/flowDiagnostics.test.ts \
  src/lib/flowNodeContracts.test.ts \
  src/store/flowStore.test.ts src/store/flowStore.remoteSync.test.ts
# Test Files  10 passed (10)
#      Tests  317 passed (317)

npx tsc -b tsconfig.app.json --force
# clean (fresh, non-incremental)

npx eslint src/components/Nodes/CompositionNode.tsx src/components/Nodes/CompositionNode.test.tsx \
  src/lib/compositionTracks.ts src/store/flowStore.ts src/store/flowStore.test.ts
# clean

git diff --check
# clean
```

### Required scenarios and where each is proven

- **A direct rendered Composition test proves a Function-audio lane shows the real media instead of
  `Connect media`** — `CompositionNode.test.tsx > "shows the real media for a Function node whose
  effective result type is audio, instead of 'Connect media'"`: renders a real `CompositionNode`
  with a `functionNode` (`resultType: 'audio'`, a usable MP3 URL, `functionNode.title: 'Narration
  Function'`) wired to `composition-audio-1`, asserts the label text appears and only the
  still-unconnected video lane falls back to `Connect media` (2 occurrences — its label plus its
  empty-timeline placeholder both contain the substring — rather than 4 if the audio-1 lane had also
  fallen back).
- **An execution-context/store-level parity test proves the same graph supplies the audio source
  execution expects** — `flowStore.test.ts > "supplies a Function node whose effective result type
  is audio as the composition-audio-1 execution source"`: builds the identical graph shape and
  asserts `buildExecutionContextForNode(...).audioInputs` contains the Function node's URL and
  `sourceNodeId`.
- **A wrong-family Function negative proves a non-audio result is neither displayed nor consumed as
  audio** — `CompositionNode.test.tsx > "does not display a wrong-family Function result (video) as
  an audio track"` (label absent, lane still shows `Connect media`) and
  `flowStore.test.ts > "does not feed a wrong-family Function result (video) into the
  composition-audio-1 execution input"` (`audioInputs` is `[]`). The symmetric video-lane check was
  not added as a separate test: `collectResultInputForHandle`'s fix is shared code covering both
  handles identically (verified by inspection and by the unchanged, still-green
  `flowExecutionComposition.test.ts`/`mediaComposition.test.ts` suites, which exercise the video
  path with non-`functionNode` sources), and no existing or newly-discovered scenario exercises a
  wrong-family Function node on the video handle in production use, so a same-shaped video test would
  duplicate coverage without proving anything the audio pair doesn't already establish about the
  shared predicate.
- **Existing malformed/overflow/durable-diagnostic/ingress tests remain green** — full 10-file,
  317-test run above includes every FBL-019-tagged file
  (`compositionTracks.test.ts`, `compositionEdgeMigration.test.ts`, `flowDiagnostics.test.ts`,
  `flowNodeContracts.test.ts`, `flowStore.test.ts`, `flowStore.remoteSync.test.ts`,
  `CompositionNode.test.tsx`) plus the closest composition-adjacent suites
  (`compositionMediaState.test.ts`, `flowExecutionComposition.test.ts`, `mediaComposition.test.ts`),
  all unchanged and passing.

### Residual risk

- `collectResultInputForHandle`'s family inference is positional (derived from which of
  `'audioGen'`/`'videoGen'` appears in the caller's `acceptedTypes`) rather than an explicit
  parameter, to avoid changing the signature at its two non-Composition call sites
  (`collectVideoExtensionInput`, which never includes `'functionNode'` and is therefore unaffected).
  If a future caller ever passes `'functionNode'` in `acceptedTypes` alongside neither or both of
  `'audioGen'`/`'videoGen'`, the inference silently skips the family check (`targetMediaFamily`
  stays `undefined`) rather than failing loudly. No such caller exists today — the two Composition
  sites are still the only ones that include `'functionNode'`.
- No test exercises a `functionNode` connected to the video handle at all (correct- or wrong-family);
  the fix is symmetric by construction (same shared function, same predicate), but only the audio
  side has a direct example. Flagged rather than silently assumed, per the task's explicit
  allowance to add the video case "only if the current helper's shared behavior needs it."

### Final commits

- `e0f9b31` — production fix (compositionTracks.ts, flowStore.ts, CompositionNode.tsx) and its
  tests (CompositionNode.test.tsx, flowStore.test.ts), in one commit.
- This note update is a separate commit on top of `e0f9b31`.

## Fourth correction (ultimate independent review, routed-media parity closed on top of `5be9009`)

The ultimate read-only review confirmed the direct Function-audio correction from `e0f9b31`, but
found one remaining Medium UI/execution mismatch on supported routed media:

- `collectResultInputForHandle` resolved a Portal/Fork/Switch source to its effective upstream
  producer before reading the result, while `CompositionNode.findConnectedMedia` checked the raw
  edge source type. Function audio routed through a Portal therefore reached Composition execution
  correctly but the visible lane still showed `Connect media`.
- Execution's effective-source lookup omitted `edge.sourceHandle`. For a `forkSwitchNode`, that
  handle is the identity of branch `A` or `B`; omitting it bypassed the inactive-branch check in
  `resolveEffectiveSourceNode`, so Function audio connected from inactive branch `B` could still be
  submitted to Composition while branch `A` was selected.
- The Function family check in `collectResultInputForHandle` inferred audio versus video
  positionally from `acceptedTypes`. Every current caller happened to be unambiguous, but this left
  the correctness rule implicit and allowed a future caller to include `functionNode` without a
  family check.

### Fix

1. `collectResultInputForHandle` now requires an explicit `CompositionMediaFamily | undefined`
   argument. Both static execution-context construction and the live run path pass `'video'` for
   `composition-video` and `'audio'` for each `composition-audio-N`; the unrelated video-extension
   consumer explicitly passes `undefined`. Function admission uses this parameter directly rather
   than inspecting the accepted-type list.
2. Both edge discovery and final source resolution in `collectResultInputForHandle` now call
   `resolveEffectiveSourceNode(..., edge.sourceHandle)`. Portal-routed producers resolve to their
   actual node, and inactive Fork branches resolve to `undefined` instead of leaking their upstream
   result into execution.
3. `CompositionNode.findConnectedMedia` now performs the same effective-source lookup with the same
   edge source handle before type, family, result, or label checks. It also uses the now-exported
   `resolveNodeOutputAsset`, the same asset resolver execution uses, so import/source-library
   fallback behavior cannot diverge between the timeline and the render input.

### Permanent red/green evidence

Eight new regressions cover UI and execution symmetrically:

- correct-family direct Function video is displayed and supplied as `videoInput`;
- wrong-family Function audio is neither displayed nor supplied on the video lane;
- Function audio routed through a Portal is displayed and supplied as the ordered audio input; and
- Function audio connected from inactive Fork branch `B` while branch `A` is selected is neither
  displayed nor supplied.

Before the production correction, the focused new-test run produced exactly the two independently
reported failures:

```text
Test Files  2 failed (2)
Tests       2 failed | 6 passed | 56 skipped (64)
```

The Portal UI assertion failed while execution already returned the Function MP3, and the inactive
Fork execution assertion received one audio input instead of `[]`. The six direct-family and
already-correct counterpart assertions passed.

After the correction:

```text
npx vitest run --configLoader runner \
  src/components/Nodes/CompositionNode.test.tsx src/store/flowStore.test.ts \
  -t "ultimate review correction|routed through a Portal|inactive Fork|correct-family Function video|wrong-family Function audio"
# 2 files passed; 8 tests passed, 56 skipped

npx vitest run --configLoader runner \
  src/components/Nodes/CompositionNode.test.tsx src/store/flowStore.test.ts
# 2 files passed; 64 tests passed

npx vitest run --configLoader runner \
  src/components/Nodes/CompositionNode.test.tsx \
  src/lib/compositionTracks.test.ts src/lib/compositionEdgeMigration.test.ts \
  src/lib/compositionMediaState.test.ts src/lib/flowExecutionComposition.test.ts \
  src/lib/mediaComposition.test.ts src/lib/flowDiagnostics.test.ts \
  src/lib/flowNodeContracts.test.ts src/store/flowStore.test.ts \
  src/store/flowStore.remoteSync.test.ts
# 10 files passed; 325 tests passed

npm run verify:flow-production
# 9 files passed; 371 tests passed
# Flow production audit passed: 63 nodes, 182 model contracts, 178 normal model options.

npx tsc -b tsconfig.app.json --force --pretty false
# clean

npx eslint src/components/Nodes/CompositionNode.tsx \
  src/components/Nodes/CompositionNode.test.tsx \
  src/store/flowStore.ts src/store/flowStore.test.ts
# clean

git diff --check
# clean
```

### Fourth-correction commits and review state

- `bda83af` — production correction plus permanent tests.
- The evidence-note update is a separate commit on top.
- This is author evidence only. The corrected clean head still requires a fresh independent
  read-only review; no approval is claimed here.
