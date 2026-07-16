# Browser FFmpeg Reliability Contract (AUD-036)

Date: 2026-07-16

Production/test commit: `04a3e01 fix(media): harden browser FFmpeg lifecycle`

## What changed

`src/lib/mediaComposition.ts` now gives each browser-only FFmpeg invocation a UUID-backed virtual-FS namespace. `composeMedia` and `composeSequenceMedia` rebuild their browser command using those names after the native/Electron fallback is exhausted; native request names are unchanged. Both command builders pass `-y` explicitly.

A small shared `BrowserFfmpegOperation` owns only files successfully written by the invocation, plus output files confirmed after execution. It cleans all tracked paths on normal completion and on downstream failure. Interrupted executions list the virtual FS only to capture actually-present partial output. Cleanup attempts continue after individual delete failures; a primary write/exec/read error wins, while cleanup failure remains visible when the media work otherwise succeeded.

The shared FFmpeg promise now clears itself if loading rejects. Healthy concurrent callers retain a single in-flight/shared instance; a later retry creates a fresh instance.

`src/lib/mediaComposition.browser.test.ts` provides deterministic mocked browser coverage for:

- rejected loader eviction and fresh-instance retry;
- overlapping healthy loads and disjoint composition/sequence paths;
- explicit overwrite flags;
- write, exec, read, and delete failures; and
- cleanup ownership and primary-error preservation.

## Evidence

The first runner-mode attempt exposed an uninstalled local dependency (`vitest/config`), so `npm ci --ignore-scripts` restored the lockfile-defined dependency tree without changing tracked project files.

- Red: `npx vitest run --configLoader runner src/lib/mediaComposition.browser.test.ts` — 7 tests: 6 failed, 1 passed against the pre-fix implementation. The six failures covered cached rejected load, disjoint names/overwrite, and missing failure cleanup. The existing successful-cleanup delete-error behavior was already passing.
- Green focused: `npx vitest run --configLoader runner src/lib/mediaComposition.browser.test.ts src/lib/mediaComposition.test.ts` — 2 files, 37 passed.
- Green neighboring: `npx vitest run --configLoader runner src/lib/mediaComposition.browser.test.ts src/lib/mediaComposition.test.ts src/lib/flowExecutionComposition.test.ts src/lib/stageFrameCompositor.test.ts src/lib/videoPremiereParity.test.ts --reporter=dot` — 5 files, 62 passed.
- `npx tsc -p tsconfig.app.json --incremental false` — passed.
- `npx tsc -p tsconfig.node.json --incremental false` — passed.
- `npx eslint src/lib/mediaComposition.ts src/lib/mediaComposition.test.ts src/lib/mediaComposition.browser.test.ts` — passed.
- `git diff --check` — passed.
- `npm run build` — passed. Existing Vite warnings remain for runtime `new URL`, browser-externalized `module` imports from HarfBuzz/LCMS WASM, and the Node deprecation warning.

## Follow-up: public image-sequence names

Independent review found that the original UUID isolation also altered browser image-sequence output patterns. The raw MEMFS name could therefore leak into ZIP entries and `manifest.frames`; the original note must not be read as evidence of public image-sequence-name compatibility.

Follow-up code/test commit `faf4f92 fix(media): preserve public image sequence names` retains UUID names exclusively for FFmpeg matching, reads, deletion, and cleanup. It maps each raw frame name to the preset's stable public pattern before ZIP packaging and manifest creation. PNG and JPEG regression cases use a deterministic UUID and prove public entries such as `sequence-frame-00002.png`/`.jpg`, stable manifest/output metadata, numeric ordering, and raw-path reads/deletes.

- Red follow-up: `npx vitest run --configLoader runner src/lib/mediaComposition.browser.test.ts --reporter=verbose` — 9 tests: 2 failed (PNG and JPEG public-name cases), 7 passed before the correction.
- Green follow-up focused: `npx vitest run --configLoader runner src/lib/mediaComposition.browser.test.ts src/lib/mediaComposition.test.ts --reporter=verbose` — 2 files, 39 passed.
- Green follow-up affected set: `npx vitest run --configLoader runner src/lib/mediaComposition.browser.test.ts src/lib/mediaComposition.test.ts src/lib/flowExecutionComposition.test.ts src/lib/stageFrameCompositor.test.ts src/lib/videoPremiereParity.test.ts --reporter=dot` — 5 files, 64 passed.
- `npx tsc -p tsconfig.app.json --incremental false`, `npx tsc -p tsconfig.node.json --incremental false`, changed-file ESLint, `git diff --check`, and `npm run build` — passed.

## Residual risk

The contract suite uses an injected FFmpeg wrapper rather than downloading/running the CDN WASM core. On an interrupted image-sequence execution where `listDir` itself fails, exact partial-frame names cannot be discovered for deletion; their per-operation UUID prefix prevents cross-invocation deletion/collision, but the failed core may retain those inaccessible files until the worker is reset.
