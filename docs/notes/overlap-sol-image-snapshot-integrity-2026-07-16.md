# AUD-021 / AUD-022 Image snapshot pixel-integrity repair — 2026-07-16

## Final Terra digest BLOCK follow-up

### Retraction of the second false approval

Evidence commit `b356b15` asserted that the `2f05169` structural manifest made
project JSON and native `.slimg` named snapshots integrity-proven and that all
three producer/decoder boundaries verified the integrity contract. That
approval claim was false and is retracted. The contract recorded only payload
presence, dimensions, and selection byte length. A same-length selection alpha
replacement, a same-dimension bitmap or mask replacement, and equal-sized
cross-layer asset swaps all passed readiness and Restore. Terra's second BLOCK
was correct.

The earlier structural, transaction, rollback, ownership, selection-persistence,
and registry-lifecycle repairs remain valid and are preserved. Production/tests
commit `37cc1fb61fad41b1503ab96d38567056d4b75921` adds the missing content binding
without amending, rebasing, or integrating the prior lineage.

### Final correction

- `ImageDocumentSnapshotIntegrity` is now version 2. Every present bitmap and
  mask records a SHA-256 digest over canonical decoded RGBA8 bytes plus an
  unambiguous domain, asset role, layer-id byte length/value, width, height, and
  payload length. Selection proof uses the same domain with a distinct
  `selection-alpha8` role and exact alpha bytes. Equal dimensions and lengths
  therefore cannot make bitmap/mask roles or layer identities interchangeable.
- Snapshot creation hashes immutable snapshot clones. Project JSON and `.slimg`
  encoders first verify the in-memory proof, produce their payloads, then
  recompute and persist proof from canonical runtime bytes instead of copying a
  caller-supplied digest. No runtime canvas or duplicate pixel payload is added
  to either format.
- Project sanitation accepts only lowercase `sha256:` plus 64 hexadecimal
  digits for every expected current-format payload. Current-format malformed,
  removed, mismatched, mutated, or swapped proof/payload data throws before
  store replacement. Version-1 or proof-less snapshots remain explicitly
  legacy/unavailable and are never silently upgraded.
- Project and native decoders hash decoded canonical pixels before marking a
  snapshot complete. Native snapshot decoding is sequential so already-owned
  snapshots remain visible to rollback cleanup. Partial layer decodes and
  digest failures zero-size every newly decoded owned bitmap/mask at most once;
  successful replacement and all prior ownership protections are unchanged.
- Restore, History descriptors, automation targets, and the Restore button keep
  routing through `inspectImageDocumentSnapshotIntegrity`. Because hashing is
  synchronous over `getImageData()`/alpha bytes, readiness cannot race an
  asynchronous verification result.

### Deterministic digest red evidence

Before the production correction, the new focused regression was run with:

`npx vitest run --configLoader runner src/components/ImageEditor/ImageSnapshotContentIntegrity.test.ts`

Result: **1 file failed; 2 tests failed**. The manifest was version 1 instead
of version 2, and a one-byte same-length project bitmap mutation resolved as a
complete/restorable snapshot instead of rejecting.

### Final green evidence

- Focused digest gate:
  `npx vitest run --configLoader runner src/components/ImageEditor/ImageSnapshotContentIntegrity.test.ts src/components/ImageEditor/ImageSlimgFormat.test.ts src/components/ImageEditor/ImageEditorHistoryPanel.test.tsx src/lib/projectValidation.test.ts -t "digest|SHA-256|round-trips exact project|same-size native|partially decoded native"`
  — **4 files passed; 8 tests passed; 51 skipped**.
- Prior 19-file/199-test matrix plus the new digest suite, all with
  `--configLoader runner`: **20 files passed; 207 tests passed**. The eight new
  cases cover one-byte bitmap, mask, and selection mutation without changing
  length/dimensions; equal-sized cross-layer swaps; manifest digest mutation
  and removal; project JSON and `.slimg`; valid byte-equal round trips; legacy
  unavailable behavior; fresh-store readiness; disabled Restore UI; rollback;
  and exact partial-resource disposal.
- `npx tsc -p tsconfig.app.json --noEmit --incremental false` — passed.
- `npx tsc -p tsconfig.node.json --noEmit --incremental false` — passed.
- Changed-file ESLint — **0 errors, 0 warnings**.
- `git diff --check`, staged `git diff --cached --check`, and production build
  (`CI=1 npm run build`) — passed. Vite emitted the existing `module.register()`
  deprecation and runtime `new URL("./", import.meta.url)` warning.

### Final producer/decoder/readiness audit

The production audit again found one creator (`createImageDocumentSnapshot`),
the project JSON encoder/decoder pair, and the native `.slimg` encoder/decoder
pair. Creation and both encoders call
`buildImageDocumentSnapshotIntegrity`; both decoders and every readiness/
Restore consumer call `inspectImageDocumentSnapshotIntegrity`. Native baton
handoff and the normal `.slimg` codec both route through the same audited native
functions. No alternate complete-snapshot producer or trusted decode bypass
was found.

### Remaining risk after the final correction

Canonical hashing reads every complete snapshot bitmap/mask synchronously, so
snapshot creation, readiness inspection, and save verification add O(pixel)
CPU/readback cost on top of the already synchronous Canvas clone cost. Large
projects remain memory- and latency-sensitive, and no Windows/macOS/Android GPU
trace was captured. SHA-256 detects accidental or uncoordinated replacement;
it is not a signature, so an attacker able to rewrite both payload and manifest
can recompute a valid digest. Version-1 structural snapshots cannot be safely
content-upgraded and intentionally remain unavailable.

## First Terra BLOCK follow-up (historical; later blocked on content binding)

Terra blocked the earlier `cb492f3` evidence because production commit
`bf6b080` still trusted `pixelState: 'complete'`, did not retain exact named-
snapshot selection bytes, silently converted corrupt live project pixels to
null, did not own/dispose named-snapshot clones across the full document
lifecycle, and allowed `selectionRegistry` entries to outlive their documents.
The findings were valid. Follow-up production/tests commit
`2f05169b6981eb6d09cec36775090283beb2debb` repairs AUD-021/AUD-022 and the
directly overlapping AUD-023 registry lifecycle without amending or rebasing
the earlier commits.

### Repair

- Named snapshots now own an immutable `Uint8ClampedArray` selection mask when
  selection pixels are actually present. Restore installs a fresh registry
  mask with exact bytes, or clears the document entry when the snapshot proves
  no selection. Project JSON uses a dedicated base64 alpha payload; `.slimg`
  uses a raw alpha asset. Live document selections also round-trip honestly,
  and missing/empty/mismatched bytes fail closed to `hasSelection: false`.
- Every complete named snapshot carries a versioned integrity manifest with
  expected layer ids, bitmap/mask presence and dimensions, plus selection
  presence, dimensions, and byte length. Project and `.slimg` decoders verify
  references, payloads, decoded dimensions, and selection truth. Missing proof
  is legacy/unavailable; stripped or corrupt assets never enable Restore.
- Live project layer decode now throws. Image documents are decoded off-store,
  all partial decoded resources are released on failure, and state/history/
  selection replacement occurs only after the full Image graph succeeds. The
  cross-workspace restore orders Image replacement last, so its rollback keeps
  the exact prior live document objects, pixels, history, and selection masks.
- Named-snapshot bitmap/mask clones have explicit ownership. Delete, 12-item
  cap eviction, close/discard, reset/replacement, history materialization, and
  rollback release only owned clones, once. Protected live identities, fresh
  editable Restore clones, retained sibling snapshot identities, and history-
  owned canvases are not released. Named-snapshot selection buffers are also
  included in unique history byte accounting.
- Registry entries now follow document lifecycle: close/discard clears only
  the removed document; whole-project reset/replacement clears all replaced
  Image entries; reused ids are cleared before open; persisted masks are
  restored only after exact validation. A no-selection reopened `.slimg`
  cannot inherit stale bytes, and another still-open document is not cleared.
- Readiness, automation targets, History descriptors, and Restore UI use the
  structural proof result rather than the `pixelState` label. Selection-
  claiming snapshots without exact restorable bytes are blocked.

### Follow-up verification (historical; second approval retracted above)

- Prior focused/neighboring set plus the new snapshot-resource and selection-
  registry lifecycle suites, all with `--configLoader runner`: **19 files
  passed; 199 tests passed**.
- Added asymmetric A-selection → snapshot → B-selection/clear → Restore byte-
  equality coverage, project JSON/fresh-store and native `.slimg` round trips,
  stripped/corrupt/missing/dimension-mismatched payload coverage, project-
  boundary rollback coverage, and distinct/shared/double-dispose/cap/close/
  replacement/rollback ownership coverage.
- `npx tsc -p tsconfig.app.json --noEmit --incremental false` — passed.
- `npx tsc -p tsconfig.node.json --noEmit --incremental false` — passed.
- Changed-file ESLint — **0 errors** and the same two pre-existing
  `react-refresh/only-export-components` warnings at
  `ImageEditorSourceSnapshotControls.tsx:67,122`.
- `git diff --check`, staged `git diff --cached --check`, and `npm run build`
  — passed. Vite emitted only the repository's existing runtime URL, browser-
  module externalization, deprecation, and large-chunk warnings.
- The `b356b15` evidence claimed that a second producer/bypass audit proved the
  integrity contract at the creator, project decoder, and `.slimg` decoder.
  That claim covered structure only, missed content replacement, and is
  explicitly retracted by the final Terra digest follow-up above.

### Remaining risk

The earlier performance and platform caveats still apply: complete snapshots
copy full Canvas-backed layer pixels synchronously, large projects/workfiles can
grow substantially, and zero-sizing is an ownership-safe release signal rather
than a guarantee about GPU-driver reclamation timing. This follow-up adds raw
selection bytes and small manifests but does not change those scaling limits;
no Windows/macOS/Android GPU trace was captured in this worktree.

## Original implementation outcome (historical; later blocked twice)

AUD-021 and AUD-022 are repaired at the Image history, named-snapshot, and
project/workfile persistence boundaries in production commit
`bf6b080532ed20b232cfda221040b6838d84c55b`.

- Every pixel-bearing undo operation is frozen when it enters history. Paint,
  layer graph, document resize, and complete document-state entries retain
  private bitmap/mask canvases plus deep-cloned serializable layer content.
  One clone map spans each operation's before/after states, so unchanged canvas
  identities share one retained immutable copy within that operation.
- Undo/redo materializes fresh editable canvases instead of installing a
  history-owned canvas into the live document. Later brush mutation therefore
  cannot modify an older operation.
- History byte accounting now walks unique bitmaps/masks inside layer arrays,
  document resize states, and named snapshots retained by document-state
  operations. It also counts selection buffers. Count eviction, byte eviction,
  redo invalidation, Clear History, document close/discard, and project-state
  replacement release only history-owned canvases. Release is idempotent and
  zero-sizes the retained OffscreenCanvas backing store; live/source canvases
  are never disposed.
- Named snapshots clone bitmap, mask, and nested layer content at creation and
  clone again when restored into the editable document. They are marked with
  `pixelState: 'complete'`.
- Project save/open persists the existing maximum of 12 named snapshots through
  the same lossless per-layer PNG `bitmapData`/`maskData` codec used by live
  Image layers. No new base64 channel or lossy flattening was introduced.
- Native `.slimg` workfiles also persist complete named snapshots through their
  existing binary asset table. Exact shared canvas identities reuse one asset
  entry, including concurrent encoding paths.
- Legacy snapshots that never stored pixels migrate to
  `pixelState: 'unavailable'`. Readiness reports a blocker, the History UI shows
  “Pixels unavailable,” Restore is disabled, and the restore function fails
  closed instead of silently borrowing current pixels.

## Deterministic red evidence

After `npm ci` restored this isolated worktree's lockfile-pinned dependencies,
the unchanged regressions were run with:

`npx vitest run --configLoader runner src/components/ImageEditor/undoRedoApply.test.ts src/components/ImageEditor/ImageSnapshots.test.ts`

Result before production changes: **2 files failed; 2 tests failed, 13 passed**.

1. The real insertion/apply chronology inserted a layer, changed the existing
   bitmap from `[12, 34, 56, 255]` to `[220, 10, 20, 255]`, pushed and undid the
   paint operation, then undid insertion. The later red pixel reappeared.
2. A named snapshot captured `[180, 20, 30, 255]`, the live bitmap changed to
   `[10, 190, 20, 255]`, then the real Image store exported its pixel-complete
   project snapshot, crossed JSON serialization, restored it, and restored the
   named snapshot. The later green pixel remained.

## Green evidence

- Focused and neighboring Image history/snapshot/project, native workfile, and
  resource suites:
  `npx vitest run --configLoader runner src/components/ImageEditor/ImageHistoryResources.test.ts src/components/ImageEditor/undoRedoApply.test.ts src/components/ImageEditor/imageLayerInsert.test.ts src/components/ImageEditor/imageAdjustmentActions.test.ts src/components/ImageEditor/ImageSnapshots.test.ts src/components/ImageEditor/ImageEditorHistoryPanel.test.tsx src/components/ImageEditor/ImageLayerProjectPixels.test.ts src/components/ImageEditor/ImageSlimgFormat.test.ts src/components/ImageEditor/ImageSlimgCodec.test.ts src/components/ImageEditor/ImageDocumentSave.test.ts src/components/ImageEditor/ImageLayerProjectPixels.test.ts src/components/ImageEditor/tiles/TiledBitmap.test.ts src/components/ImageEditor/tiles/LayerPixelStore.test.ts src/store/imageEditorStore.test.ts src/lib/projectValidation.test.ts src/lib/projectDocumentActions.test.ts src/lib/nativeProjectDocument.test.ts src/components/Layout/ProjectLibraryModal.test.tsx`
  — **17 files passed; 183 tests passed**.
- Final dedup/UI/resource follow-up:
  `npx vitest run --configLoader runner src/components/ImageEditor/ImageSlimgFormat.test.ts src/components/ImageEditor/ImageHistoryResources.test.ts src/components/ImageEditor/ImageEditorHistoryPanel.test.tsx`
  — **3 files passed; 16 tests passed**.
- `npx tsc -p tsconfig.app.json --noEmit --incremental false` — passed.
- `npx tsc -p tsconfig.node.json --noEmit --incremental false` — passed.
- Changed-file ESLint — **0 errors**. It reported the two existing
  `react-refresh/only-export-components` warnings at
  `ImageEditorSourceSnapshotControls.tsx:66,121`; this repair added neither
  export.
- `git diff --check` and staged `git diff --cached --check` — passed.
- `npm run build` — passed. Vite emitted only the repository's existing runtime
  URL, browser-module externalization, deprecation, and large-chunk warnings.

## Resource/lifecycle coverage

- A 51-operation stress case proves count eviction zero-sizes the evicted
  retained canvas, clears invalidated redo resources, and leaves the original
  source canvas usable.
- Two synthetic 12,000 × 12,000 layer-graph entries prove unique layer-array
  pixels are counted toward the 768 MiB cap and the byte-evicted operation is
  released.
- A shared before/after bitmap is cloned once per immutable operation, counted
  once, and survives double-dispose without an ownership underflow or source
  mutation.
- Snapshot assertions inspect distinguishable bitmap and mask pixels plus
  nested source metadata after the project JSON round trip; `.slimg` assertions
  inspect the decoded bitmap/mask asset tags and asset-table deduplication.

## Residual risks

- Canvas remains the authoritative live backend. Freezing a paint or structural
  history operation therefore performs full-canvas copies synchronously; layer
  operations with many large canvases can cause visible latency and high
  transient memory. The 50-operation / 768 MiB retention caps bound accumulated
  history, but the newest single operation is deliberately retained even when
  it alone exceeds the byte cap.
- Named snapshots are bounded to 12, but a project containing many large,
  materially different snapshots can be much larger and slower to save/open.
  Project JSON uses the established per-layer PNG fields and does not
  content-deduplicate independent snapshot canvases. `.slimg` deduplicates exact
  shared canvas identities, not pixel-identical independent clones.
- Zero-sizing an OffscreenCanvas is the available explicit backing-store release
  for the current Canvas backend. The tests prove ownership and idempotence, but
  exact GPU/driver memory reclamation timing remains browser/platform managed;
  no Windows/macOS/Android GPU-memory trace was captured in this worktree.
- Legacy named snapshots never contained pixels, so their lost bitmap state is
  unrecoverable. They remain visible for naming/deletion and are explicitly
  non-restorable rather than receiving substituted live pixels.
