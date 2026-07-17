# Image snapshot resource-metadata boundary — 2026-07-16

## Superseding correction

A second independent Sonnet review reproduced one reachable boundary left by
`917-image-snapshot-verified-cache-structural-gate.md`: runtime structural
measurement skipped the complete `layer.bitmap` and `layer.mask` objects.
`makeBitmapImmutable` hid writable canvas entry points but did not make the
underlying host/wrapper object non-extensible. An own enumerable 16 MiB
`evilMetadata` expando added after verified caching therefore left Restore
ready, and a fresh uncached 20 MiB resource expando passed explicit integrity
verification without changing resource identity or pixel bytes.

The statement in note 917 that cached inspection covers all own enumerable
non-pixel structure is superseded at this bitmap/mask resource boundary.
Production/tests commit
`6c00122b82792be052a8669cda98075054d2367c` closes it without amending the
preserved snapshot-integrity lineage.

## Correction

- Runtime metadata measurement now descends into bitmap and mask resource
  objects. It uses own enumerable string-keyed property descriptors, terminates
  cycles by identity, accounts sparse arrays by length without visiting empty
  elements, and stops at the existing 16 MiB per-snapshot metadata budget.
- Resource accessor descriptors are not executed. Unsupported accessors,
  missing/contradictory descriptors, and throwing Proxy traps fail closed as
  `snapshot-bounds-invalid`. The immutable facade's known width/height
  accessors are recognized without pixel access.
- Canvas-like mock/wrapper pixel containers under canonical pixel-body keys are
  treated as opaque shape. Their array length or binary byte length is bound,
  but their elements are never copied, stringified, read back, or hashed by the
  metadata path. Real `OffscreenCanvas`/`HTMLCanvasElement` host storage is not
  exposed through enumerable JavaScript pixel properties.
- Each exact verified layer binding now includes a bounded streaming SHA-256
  descriptor of bitmap and mask resource metadata, descriptor flags, reference
  sharing, and cycles. Small pre-existing legitimate metadata remains
  supported; a later value, property, or descriptor change invalidates cached
  readiness until an explicit pixel verification recaches the graph.
- Symbols, non-enumerable properties, and inherited keys remain deliberately
  outside the metadata contract. Resource identity, dimensions, proof
  identity, role-aware pixel digest, immutable transfer/context facade, clone
  and Restore behavior, and disposal continue to be enforced separately.
- If an owned sealed/frozen/host resource cannot accept the immutable facade,
  explicit verification returns `snapshot-resource-hardening-failed` instead
  of throwing or caching it. The trusted-builder registration path reports a
  controlled error and rolls back newly added ownership/cache state.

## Retained red and boundary coverage

The six-case focused run was executed after adding the permanent regressions
but before changing production code. All six failed against clean
`a198dd32306127437664cd685061daa2d809e4c4`: cached bitmap and mask expandos,
uncached 20 MiB explicit verification, the exact configured resource-metadata
boundary, small metadata binding, and hostile resource descriptor handling.
The prior implementation returned `complete: true` for both cached 16 MiB
expandos and the uncached 20 MiB expando.

The final `ImageSnapshotVerifiedState.test.ts` coverage proves:

- cached bitmap and mask rejection before readiness, Restore, pixel readback,
  or codec work;
- uncached 20 MiB rejection before explicit verification reads pixels;
- exact configured resource-metadata acceptance and exact-plus-one rejection;
- bounded legitimate nested/cyclic metadata support and post-cache mutation
  invalidation;
- getter non-execution, throwing Proxy failure, normal resource replacement,
  and symbol/non-enumerable/inherited exclusions;
- sealed Canvas-like hardening failure behavior; and
- preservation of the earlier 2,048/2,049, digest, selection, rollback,
  disposal, ownership, dirty-close, and lifecycle cases.

## Verification

All Vitest commands used `--configLoader runner`.

- New verified-state/expando file: **1 file, 19 tests passed**.
- Prior focused cache/bounds/digest/resource/rollback set: **5 files, 81 tests
  passed** (the prior 74 plus seven permanent cases).
- Snapshot-integrity lineage core: **13 files, 136 tests passed** (the prior
  129 plus seven).
- Historical complete snapshot matrix: **21 files, 234 tests passed** (the
  prior 227 plus seven).
- Expanded lineage plus dirty-close/persistence matrix: **21 files, 239 tests
  passed** (the prior 232 plus seven).
- Dirty-close/persistence matrix remains **15 files, 229 tests passed**.
- Forced non-incremental `tsconfig.app.json` and `tsconfig.node.json` checks
  passed. Forced project-reference `npx tsc -b --force` also passed.
- Current two-file ESLint passed with **0 errors, 0 warnings**. Full 28-file
  correction-lineage ESLint passed with **0 errors** and the two inherited
  `react-refresh/only-export-components` warnings at
  `ImageEditorSourceSnapshotControls.tsx:67,122`.
- Unstaged and staged `git diff --check` passed.
- `CI=1 npm run build` passed.

## Residuals

Valid cached readiness remains O(bounded own enumerable metadata) and now also
computes the resource descriptor binding; metadata near the accepted limit can
therefore be expensive. It remains independent of canvas dimensions and never
performs pixel readback or codec calls. Opaque Canvas-like pixel-body arrays
are described by shape because their contents are already covered by the
role/dimension/layer-aware pixel digest and immutable resource lifecycle.
Explicit create/decode/save/Restore verification remains O(pixel). SHA-256 is
integrity evidence rather than authenticity, and browser/GPU backing-store
release timing remains outside the JavaScript ownership proof.
