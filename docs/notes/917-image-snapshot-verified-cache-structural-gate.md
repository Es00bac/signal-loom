# Image snapshot verified-cache structural gate — 2026-07-16

## Superseding correction

Terra reproduced a remaining verified-cache bypass after the structural-bound
correction recorded in `916-image-snapshot-structural-size-limits.md`. A valid
owned snapshot could enter the verified cache, receive a new own enumerable
optional field containing 16 MiB of metadata, and remain Restore-ready because
the cached readiness branch returned before the raw structural gate. Explicit
verification correctly returned `snapshot-bounds-invalid`.

The earlier note's statement that repeated cached readiness performs zero
metadata traversal is therefore retracted. Production/tests commit
`fd596fb42b5cd832500411a1d5e3e5eb813b50f5` closes the bypass without changing
the pixel digest, immutable ownership, disposal, rollback, selection, or
document-lifecycle contracts.

## Correction

- Every cached `inspectImageDocumentSnapshotIntegrity` call now runs
  `inspectSnapshotStructure` before accepting the exact verified binding. The
  gate is bounded by the existing snapshot structural limits and deliberately
  skips bitmap, mask, and selection pixel payload bodies.
- Valid cached readiness is now O(own enumerable non-pixel structure), not
  O(pixel). One hundred direct inspections plus one hundred readiness
  descriptor builds read the enumerable metadata probe 200 times and perform
  zero bitmap reads. Explicit verification still performs the four expected
  bitmap/mask reads for the two-layer fixture.
- Structure and verified-binding inspection fail closed when runtime getters or
  Proxy traps throw. Cycles terminate through the existing identity set.
  Symbol-keyed, non-enumerable, and inherited fields remain outside the
  decode-bound accounting contract on both cached and explicit paths.
- Adding or replacing oversized root, layer, layer-proof, or selection-proof
  metadata now makes both cached readiness and explicit verification invalid
  before pixel readback. Removing the oversized field restores agreement for
  the still-exact binding. Replacing a layer object with byte-identical immutable
  resources conservatively invalidates readiness until explicit verification
  recaches the new exact object graph.
- Exact 2,048-layer unavailable/legacy acceptance and 2,049-layer rejection
  remain enforced before native codec calls or project allocation. The existing
  one-to-one proof identity, digest mutation detection, selection proof,
  rollback, ownership, and disposal cases remain green.

## Retained boundary coverage

`ImageSnapshotVerifiedState.test.ts` now retains the original 16 MiB cache
bypass reproduction plus cases for:

- oversized string, sparse-array, and nested-object additions/replacements
  before and after readiness, followed by removal and valid reinspection;
- nested metadata just below, exactly at, and one byte beyond a configured
  snapshot limit, plus exact/limit-plus-one document aggregate accounting;
- post-cache layer, proof, and selection-proof optional metadata mutation;
- layer-object replacement with identical immutable pixel resources and
  explicit recache;
- own enumerable versus symbol, non-enumerable, and prototype metadata;
- cycles, stateful getters, throwing getters, and throwing Proxy `ownKeys`;
- readiness never reporting restorable when explicit structural verification
  rejects; and
- cached readiness traversing structure while performing zero O(pixel) reads.

The initial focused red command was:

`npx vitest run --configLoader runner src/components/ImageEditor/ImageSnapshotVerifiedState.test.ts -t "rejects oversized enumerable metadata added" --reporter=verbose`

It failed 1/1 because cached inspection returned `complete: true`. The same case
passes after the production correction.

## Dirty-close sweep investigation

Terra's three `hasSelection` failures were reproduced both in the 15-file
dirty-close/persistence sweep and in `ImageEditorDirtyClose.test.tsx` alone.
They were not caused by this final cache-gate change, but they were caused by
the preserved snapshot-integrity lineage: `2f05169` made `openDocument` reject
an unbacked `hasSelection: true` claim unless a valid nonempty selection mask
accompanies it. The older dirty-close fixture supplied only the boolean and
then expected it to survive Save cancellation/failure and Cancel/Escape.

The production contract is correct and was not relaxed. The fixture now opens
a real 32 x 24 nonempty selection mask. Before that fixture correction the
expanded 15-file run had 3 failures and 226 passes; afterward it has 15 files
and 229 passing tests. The focused dirty-close file now has 11 passing tests.
The runner still reports its existing unavailable-localStorage persistence
diagnostics and ProjectLibraryModal `act(...)` warnings; neither is treated as
a product failure.

## Verification

All Vitest commands used `--configLoader runner`.

- Focused cache/bounds/digest/resource/rollback set: **5 files, 74 tests
  passed**.
- Thirteen-file snapshot-integrity lineage core: **13 files, 129 tests
  passed**.
- Historical complete 21-file snapshot matrix: **21 files, 227 tests passed**.
- Expanded 21-file lineage plus dirty-close/persistence matrix: **21 files, 232
  tests passed**.
- Dirty-close focused and expanded follow-up: **1 file/11 tests** and **15
  files/229 tests passed**.
- Forced non-incremental `tsconfig.app.json` and `tsconfig.node.json`
  TypeScript checks passed.
- Current three-file ESLint passed with **0 errors, 0 warnings**. Full 28-file
  snapshot/dirty-close lineage ESLint passed with **0 errors** and the two
  inherited `react-refresh/only-export-components` warnings at
  `ImageEditorSourceSnapshotControls.tsx:67,122`.
- Unstaged and staged `git diff --check` passed.
- `CI=1 npm run build` passed. It retained the existing runtime-URL,
  browser-module externalization, `module.register()` deprecation, and
  large-chunk warnings.

## Residuals

Valid cached readiness now intentionally pays bounded structural traversal on
each query. Metadata at the accepted upper bound can therefore be expensive,
but pixel bodies are never copied, stringified, read back, or hashed by this
path, and traversal stops once the existing metadata budget is exceeded.
Explicit create/decode/save/Restore verification remains O(pixel). SHA-256 is
integrity evidence rather than authenticity, and browser/GPU backing-store
release timing remains outside the JavaScript ownership proof.
