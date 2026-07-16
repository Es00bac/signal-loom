# Terra Paper overlap repairs — 2026-07-16

This lane repaired the three assigned Fable findings only. Each production
change has its own commit; this note is committed separately for integration
traceability.

| Finding | Commit | Repair | Red evidence | Green evidence | Residual risk |
| --- | --- | --- | --- | --- | --- |
| FBL-004 | `3f53b85` | `createPaperFrame` now preserves `bubbleWarpLeft`, `bubbleWarpRight`, `bubbleWarpTop`, and `bubbleWarpBottom`; its return names every `PaperFrame` key. | `npx vitest run --configLoader runner src/lib/paperDocument.test.ts` — 1 failure: the parsed frame lacked all four authored per-edge controls. | Same command — 47 tests passed. Integration corrected the initial key-only exhaustiveness helper in `20c2fe5`; forced non-incremental app/node TypeScript checks and `git diff --check` then passed. | The regression assigns unique non-default geometry/effect values. New persisted controls still require intentional default/sanitization policy when introduced. |
| FBL-024 | `f818e67` | Rich paragraph first-line indents now emit the `each-line` qualifier in both the rich-editor DOM CSS and print HTML. | `npx vitest run --configLoader runner src/lib/paperRichTextDom.test.ts src/lib/paperDocument.test.ts` — 2 failures: each path emitted a plain `text-indent` value. | Same command — 55 tests passed. After the inherited FBL-004 type-helper correction, forced non-incremental app TypeScript and `git diff --check` passed on integration. | The behavior relies on CSS `each-line`; browser/PDF-engine layout remains an external rendering concern. |
| FBL-030 | `0b17221` | The shared ModelArk image-generation helper always sends `watermark: false`, covering Flow and the image adapter. | `npx vitest run --configLoader runner src/lib/imageEditorAi/bytePlusImage.test.ts` — 1 failure: the exact request body had no `watermark` field. | `npx vitest run --configLoader runner src/lib/imageEditorAi/bytePlusImage.test.ts src/lib/flowExecutionImageProviders.test.ts` — 24 tests passed. Forced non-incremental app TypeScript and `git diff --check` passed on integration. | The explicit value is supported by the documented ModelArk Image Generation API; provider-side support for future model IDs remains dependent on BytePlus. |

## Verification commands

All focused Vitest commands used `--configLoader runner` to avoid shared
temporary-config writes. Final combined verification after all three fixes:

```sh
npx vitest run --configLoader runner \
  src/lib/paperDocument.test.ts \
  src/lib/paperRichTextDom.test.ts \
  src/lib/imageEditorAi/bytePlusImage.test.ts \
  src/lib/flowExecutionImageProviders.test.ts
npx tsc -p tsconfig.app.json --noEmit --incremental false --pretty false
npx tsc -p tsconfig.node.json --noEmit --incremental false --pretty false
git diff --check
```

The final Vitest sweep passed (4 files, 79 tests). The original Terra worktree's
`tsc -b` surfaced errors in the FBL-004 exhaustiveness helper even though the
agent's summary said it passed; integration repaired that helper in `20c2fe5`
and verified both TypeScript projects non-incrementally. Whitespace validation
also passed.
The BytePlus request shape follows the provider's documented `watermark: false`
control: <https://api.byteplus.com/api-explorer/?action=ImageGenerations&groupName=Image+Generation+API&serviceCode=ark&version=2024-01-01>.
