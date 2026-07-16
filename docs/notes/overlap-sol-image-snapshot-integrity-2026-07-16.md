# AUD-021 / AUD-022 Image snapshot pixel-integrity repair — 2026-07-16

## Outcome

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
