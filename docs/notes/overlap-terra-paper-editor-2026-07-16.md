# Overlap Terra Paper editor — 2026-07-16

## Scope

This lane repaired only FBL-007 and FBL-008 from
`docs/audits/fable-partial-audit-comparison-2026-07-16.md`, based on reviewed
integration commit `5dd828c`. FBL-006 and Paper export, fonts, project
validation/save, Flow, Image, and provider work were intentionally untouched.

## Commit map

1. `cc3231b fix(paper): preserve rich authored sizes across zoom` — FBL-007.
2. `ced4aa7 fix(paper): retain writing mode during rich editing` — FBL-008.

## FBL-007 — stable rich-editor conversion scale

`PaperRichEditableText` now captures its opening zoom in a ref. Its initial
DOM seed, selection patching, DOM rewrites, and final serialization all use
that session scale. `createRichEditorBase` makes the opening-scale conversion
explicit and shared by the component and DOM lifecycle test.

Red evidence, before the fix:

```sh
npx vitest run --configLoader runner src/lib/paperRichTextDomRoundtrip.test.ts
```

The three new lifecycle tests failed. At 100% → 200%, a 9pt/11pt explicit
run serialized as approximately 4.50pt/5.50pt; at 200% → 50%, the explicit
24pt/30pt run serialized as approximately 96pt/120pt. The unchanged-zoom
control exposed only normal CSS-pixel rounding.

Green evidence after the fix:

```sh
npx vitest run --configLoader runner \
  src/lib/paperRichTextDomRoundtrip.test.ts \
  src/lib/paperRichTextDom.test.ts \
  src/features/paper/workspace/paperRichEditorSession.test.ts
```

Result: 3 files, 20 tests passed. The test uses the real rich-editor open
(`richTextToEditorHtml`) and commit (`serializeRichEditor`) DOM boundary for
100% → 200%, 200% → 50%, mixed explicit run sizes, explicit run/paragraph
leading, and an unchanged-zoom control.

## FBL-008 — retained transaction plus frame writing mode

`resolvePaperRichEditorTypographyUpdate` now combines the live retained-range
result with the complete frame typography patch. The Inspector sends this one
patch to the existing frame updater, so `writingMode` is retained whether the
active edit has a range, a caret, or no session at all. This preserves the
current rich DOM result instead of replacing it with stale document data.

Red evidence, before the fix:

```sh
npx vitest run --configLoader runner src/features/paper/workspace/paperRichEditorSession.test.ts
```

The three new range/caret/inactive transaction tests failed because the
required transaction/persistence handoff did not exist (`TypeError:
resolvePaperRichEditorTypographyUpdate is not a function`). This captured the
missing root-cause boundary rather than testing a standalone typography
comparison.

Green evidence after the fix:

```sh
npx vitest run --configLoader runner \
  src/features/paper/workspace/paperRichEditorSession.test.ts \
  src/features/paper/workspace/PaperWorkspace.richTextShortcuts.test.ts \
  src/features/paper/workspace/richTextTransforms.test.ts \
  src/lib/paperDocumentFormats.test.ts
```

Result: 4 files, 87 tests passed. Coverage includes active range selection,
collapsed caret, inactive editor, vertical toggle on/off, rich-text retention,
and Paper JSON save/restore of vertical writing and rich content.

## Final verification

```sh
npx vitest run --configLoader runner \
  src/lib/paperRichTextDom.test.ts \
  src/lib/paperRichTextDomRoundtrip.test.ts \
  src/features/paper/workspace/paperRichEditorSession.test.ts \
  src/features/paper/workspace/PaperWorkspace.richTextShortcuts.test.ts \
  src/features/paper/workspace/richTextTransforms.test.ts \
  src/lib/paperDocumentFormats.test.ts
npx tsc -p tsconfig.app.json --noEmit --incremental false
npx tsc -p tsconfig.node.json --noEmit --incremental false
npx eslint src/lib/paperRichTextDom.ts src/lib/paperRichTextDomRoundtrip.test.ts \
  src/features/paper/workspace/PaperWorkspace.tsx \
  src/features/paper/workspace/paperRichEditorSession.ts \
  src/features/paper/workspace/paperRichEditorSession.test.ts \
  src/features/paper/workspace/PaperWorkspace.richTextShortcuts.test.ts \
  src/lib/paperDocumentFormats.test.ts
git diff --check
npm run build
```

Result: 6 files, 103 tests passed; both forced non-incremental TypeScript
commands, changed-file lint, `git diff --check`, and the production build
passed.

## Residual risk

The fixes protect authored model units and frame `writingMode`; they do not
attempt the reserved FBL-006 multi-renderer typography unification. No
headed/manual interaction smoke was run in this bounded lane, so visual
reflow while changing canvas zoom remains a UI-proof follow-up rather than a
known data-loss path. The fix continues to use the existing single frame
update transaction, preserving its established undo behavior.
