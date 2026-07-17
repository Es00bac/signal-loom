# Image snapshot direct-data, symbol, and transaction correction — 2026-07-16

## Scope

This Sol correction closes Terra's three fresh cache-contract findings at clean
baseline `8466f6b`. Production and permanent tests are commit `df4ac2f`. This
note is evidence for a fresh independent gate and does not claim approval.

## Deterministic red evidence

Before production changed, the three permanent regression groups ran with:

`npx vitest run --configLoader runner src/components/ImageEditor/ImageSnapshotVerifiedState.test.ts -t "direct root data|symbol-keyed|rolls back every retained" --reporter=verbose`

Result: **1 file failed; 5 tests failed; 30 skipped**. Cached bitmap and mask
readiness missed same-length direct `data` mutation and enumerable symbol-keyed
binary mutation. A later Proxy hardening failure left the earlier bitmap root
and both metadata descendants non-extensible.

## Correction

- One bounded descriptor traversal now uses all own enumerable string and
  symbol keys. Direct root arrays, views, `ArrayBuffer`, and `ImageData` bytes
  are measured and content-hashed; no field is exempted by a pixel-like name.
  Detached buffers, accessors, revoked/contradictory descriptors, depth, work,
  and aggregate overflow fail closed.
- Owned verification stages detached pixel/resource clones, deep-copies the
  bounded metadata graph with cycles and aliases intact, hardens only fresh
  objects, and commits replacements only after every resource succeeds. A
  trap or later digest failure restores every prior identity and releases only
  fresh allocations. Source `preventExtensions` traps are never invoked.
- Real browser resources remain real `OffscreenCanvas` clones. The bounded
  Canvas-like test/native-adapter fallback captures pixels at the existing
  explicit O(pixel) verification boundary without codec work. Cached readiness
  hashes metadata only and performs zero pixel reads and zero codec calls.
- Superseded owned sources stay in the snapshot ownership set so shared/live
  protection and final disposal still release each exact resource once.
  Enumerable symbols are retained and bound; non-enumerable symbols and
  inherited prototype state remain outside the contract.

## Permanent and green evidence

- Verified state: **1 file / 41 tests passed**.
- Focused cache/bounds/digest/resource/native set: **5 files / 103 tests**.
- Snapshot lineage core: **13 files / 162 tests**.
- Historical snapshot matrix: **21 files / 256 tests**.
- Dirty-close/persistence matrix: **15 files / 229 tests**; only the existing
  unavailable-localStorage diagnostics appeared.
- Project persistence matrix: **8 files / 137 tests**.
- Forced nonincremental app and node TypeScript plus forced root project
  references passed.
- Current three-file ESLint passed with **0 errors / 0 warnings**. The full
  **26-file** correction-lineage lint passed with **0 errors** and the two
  inherited `react-refresh/only-export-components` warnings at
  `ImageEditorSourceSnapshotControls.tsx:67,122`.
- Unstaged and staged diff hygiene passed.
- `CI=1 npm run build` passed with **3,250 modules transformed** and retained
  only the existing runtime-URL, browser externalization, `module.register()`
  deprecation, and large-chunk warnings.

## Residuals

Accepted metadata near the 16 MiB bound intentionally makes cached readiness
more expensive. Detached cloning temporarily retains the prior owned source so
shared-identity disposal remains exact, increasing snapshot memory until that
snapshot is disposed. Explicit create/decode/save/Restore remains O(pixel);
cached readiness performs no pixel readback or codec work. SHA-256 is integrity
evidence, not authenticity, and native GPU reclamation timing remains outside
the JavaScript proof.
