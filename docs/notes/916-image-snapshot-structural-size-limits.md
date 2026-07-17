# Image snapshot structural size-limit correction — 2026-07-16

## Correction

The earlier snapshot-integrity evidence stated that hostile snapshot graphs were
bounded before decode, but the bound function skipped every snapshot marked
unavailable and every legacy snapshot without a version-2 integrity manifest.
A browser project or native `.slimg` document could therefore carry 2,049 or
more snapshot-layer descriptors through legacy normalization. That statement
was incomplete.

Production/tests commit
`9893b44bfeb5060d8ba11e18055c4eef3ac851a6` makes structural bounds independent of pixel availability,
integrity version, selection claims/payloads, and proof validity. It preserves
the prior verified-state ownership, invalidation, disposal, and content-digest
work.

## Implementation

- Raw snapshot structure is checked before any availability/version branch.
  Non-record snapshots and non-array layer graphs fail closed. The per-snapshot
  layer and proof maxima are both 2,048; exact limits remain accepted and 2,049
  is rejected.
- Per-document aggregate maxima are 8,192 layers, 8,192 proofs, 32,792
  structural resource descriptors, and 64 MiB of non-pixel metadata. Per-project
  aggregate maxima are 65,536 layers, 65,536 proofs, 262,336 structural resource
  descriptors, and 512 MiB of non-pixel metadata. Each snapshot is additionally
  capped at 8,194 structural resource descriptors and 16 MiB of non-pixel
  metadata.
- The existing 12-snapshot/document, 96-snapshot/project, 16,384-dimension, and
  768 MiB aggregate decoded-pixel bounds remain in force. Current version-2
  presence/dimension/digest checks still run after the structural gate.
- Browser project sanitation applies the project-wide raw gate before document
  sanitation, and the document raw gate before legacy normalization or pixel
  decode. Native `.slimg` applies the raw gate before decoding even the live
  layer graph, so an oversized named snapshot makes zero codec calls and creates
  no decoded Canvas or selection resources.
- Structural resource counting covers runtime/native/project bitmap, mask, and
  selection representations plus bitmap/mask/selection proofs. Metadata
  measurement excludes pixel payload bodies while bounding all other enumerable
  structure. Traversal stops as soon as a bound is exceeded and does not enqueue
  the children of an already oversized array/object.
- Cached verified snapshots now take the exact verified-binding path before the
  deeper metadata walk. Repeated readiness and render queries perform neither
  pixel readback nor metadata traversal; layer/resource/manifest replacement
  still invalidates the binding, and uncached or changed snapshots are checked
  normally.

## Boundary coverage

The new cases prove:

- exact 2,048-layer unavailable and version-1 legacy browser/native snapshots
  are accepted as unavailable;
- 2,049 layers reject with the layer-bound error for unavailable, legacy,
  selection-claim/payload, current-version missing-proof, and current-version
  duplicate-proof shapes;
- native rejection occurs with zero codec calls;
- exact per-document aggregate layers and exact proof counts are accepted, with
  the next descriptor rejected;
- structural resource and metadata option boundaries accept equality and reject
  equality plus one;
- oversized unavailable readiness/Restore stays disabled without pixel reads;
  and
- cached repeated readiness performs zero pixel reads and zero metadata getter
  reads, while explicit deep verification still reads both.

## Verification

- Focused unfinished set:
  `npx vitest run --configLoader runner src/components/ImageEditor/ImageSnapshotVerifiedState.test.ts src/components/ImageEditor/ImageSlimgFormat.test.ts src/lib/projectValidation.test.ts`
  — **3 files passed; 59 tests passed**.
- Prior requested 21-file/217-test matrix plus the four new boundary cases, all
  with `--configLoader runner` — **21 files passed; 221 tests passed**.
- `npx tsc -p tsconfig.app.json --noEmit --incremental false` — passed.
- `npx tsc -p tsconfig.node.json --noEmit --incremental false` — passed.
- Current six-file changed-lineage ESLint — **0 errors, 0 warnings**.
  A broader 27-file lint from the first snapshot-integrity production parent
  also had **0 errors** and retained the two pre-existing
  `react-refresh/only-export-components` warnings at
  `ImageEditorSourceSnapshotControls.tsx:67,122`.
- Unstaged and staged `git diff --check` — passed.
- `CI=1 npm run build` — passed. It retained the existing Vite runtime-URL,
  browser-module externalization, `module.register()` deprecation, and
  large-chunk warnings.

## Residuals

The structural metadata accounting is an application safety budget rather than
a byte-for-byte container-size quota; encoded bitmap/mask/selection bodies are
governed by their separate compressed-input and decoded-pixel limits. SHA-256
remains integrity evidence, not an authenticity signature. Explicit
create/decode/save/Restore verification remains O(pixel) at its intended
boundaries. No Windows, macOS, Android, or GPU-memory trace was added by this
correction.
