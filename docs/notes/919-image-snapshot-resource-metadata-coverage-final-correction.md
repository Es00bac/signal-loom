# Image snapshot resource-metadata coverage final correction — 2026-07-16

## Scope and status

This correction responds to Terra's independent reproduction of two remaining
resource-metadata fail-open paths at clean baseline
`e9915c767596a01298ef70f60b92272a00a3727a`. It does not claim approval; a
fresh provider still owns the final gate.

Production and permanent regression tests are committed together in
`95dd2c6e34c07199a30662f8f218427d5fcbe717`.

## Deterministic red evidence

The permanent tests were added before production changed and run over exact
baseline `e9915c7` with:

`npx vitest run --configLoader runner src/components/ImageEditor/ImageSnapshotVerifiedState.test.ts -t "nested binary|Proxy hides|Proxy hiding|revoked and hardening-trap|ordinary platform-shaped|deeply nested" --reporter=verbose`

Result: **1 file failed; 11 tests failed; 19 tests skipped**. Both bitmap and
mask accepted same-length mutation of nested `metadata.data`; both accepted an
uncached 20 MiB nested binary; both uncached and cached Proxy cases could hide
oversized own fields; hardening traps reached pixel reads; ordinary resources
remained extensible; and a 257-level metadata chain was accepted. The baseline
returned `complete: true` for the reproduced nested-binary and usable
`ownKeys`-hiding Proxy paths.

## Correction

- The opaque pixel-body exception is now positional. A canonical binary field
  is treated as pixel storage only when it is a direct own field of the bitmap
  resource root. A generic nested key such as `resource.metadata.data` is
  ordinary metadata regardless of its name.
- Nested typed-array, `ArrayBuffer`, and `ImageData` metadata contributes to
  the existing runtime byte budget. Accepted nested binary content is streamed
  into the bounded resource SHA-256 descriptor, so an equal-length byte change
  invalidates the exact verified binding without reading Canvas pixels.
- Before a resource can enter verified readiness, the existing immutable
  Canvas facade is installed and the own-enumerable non-pixel object graph is
  made non-extensible. ECMAScript Proxy invariants then prevent an `ownKeys`
  trap from omitting a target own property. A hidden-key invariant violation,
  revoked Proxy, hardening trap, accessor, or contradictory descriptor fails
  closed without bitmap readback or codec work.
- Cached inspection requires the controlled resource graph. Replacing a
  resource retains the prior exact-identity invalidation result; replacing an
  existing metadata value with an uncontrolled object fails structural
  readiness until explicit verification controls and recaches it.
- Traversal remains iterative and identity-aware for cycles and reference
  sharing. It now rejects metadata deeper than 256 levels and retains the
  existing 16 MiB per-snapshot and document/project aggregate byte limits.
  Own symbol keys, non-enumerable keys, and inherited prototype state remain
  outside this metadata contract. Accessor bodies are not invoked.
- If hardening or later pixel verification fails, newly installed immutable
  facades are released before the established partial-resource cleanup runs.
  The prior exact rollback, disposal, selection, proof-identity, and content
  digest behavior remains intact.

## Permanent coverage

`ImageSnapshotVerifiedState.test.ts` now has 30 deterministic cases. The new
coverage includes bitmap and mask on cached and uncached paths; same-length
nested binary mutation; oversized nested binary; usable Proxies hiding own
fields both before and after caching; revoked and `preventExtensions`-trapping
Proxies; normal Canvas-like platform shapes; controlled and pre-sealed
resources; getter non-execution; prototype exclusion; cycles; depth; and the
existing exact/plus-one aggregate-byte boundaries. Every cheap-readiness case
asserts zero `getImageData` reads and zero codec calls where applicable.

## Green verification

All Vitest commands used `--configLoader runner`.

- Verified-state focused file: **1 file passed; 30 tests passed**.
- Focused cache/bounds/digest/resource/rollback matrix: **5 files passed; 92
  tests passed**.
- Snapshot-integrity lineage core: **13 files passed; 147 tests passed**.
- Historical complete snapshot matrix: **21 files passed; 245 tests passed**.
- Dirty-close/persistence matrix: **15 files passed; 229 tests passed**. It
  retained only the existing unavailable-localStorage diagnostics.
- Forced `tsconfig.app.json` and `tsconfig.node.json` non-incremental checks
  passed. Forced project-reference `npx tsc -b --force --pretty false` passed.
- Current two-file ESLint passed with **0 errors and 0 warnings**. The full
  **28-file** correction-lineage ESLint passed with **0 errors** and the two
  inherited `react-refresh/only-export-components` warnings at
  `ImageEditorSourceSnapshotControls.tsx:67,122`.
- Unstaged and staged `git diff --check` passed.
- `CI=1 npm run build` passed: 3,250 modules transformed. It retained the
  existing runtime-URL, browser-module externalization, `module.register()`
  deprecation, and large-chunk warnings.

## Limitations and gate handoff

Verified resource roots and their own-enumerable non-pixel metadata objects
are intentionally non-extensible. Existing writable values can still change,
but the bounded descriptor detects those changes. Exotic host objects that
cannot accept the immutable facade or cannot become non-extensible fail closed
as `snapshot-resource-hardening-failed`; ordinary Canvas-like wrappers remain
usable and the historical browser/Electron-facing matrices pass.

Cheap cached readiness can hash accepted nested binary metadata up to the
existing bound, so metadata close to that bound is intentionally more
expensive. It never calls `getImageData`, hashes Canvas pixels, or invokes a
codec. Direct proven root pixel bodies remain shape-only in this metadata path;
their content stays under the prior role/dimension/layer-aware pixel digest and
immutable-resource contract. Explicit create/decode/save/Restore verification
remains O(pixel). SHA-256 is integrity evidence, not authenticity, and native
backing-store reclamation timing remains browser/GPU managed.
