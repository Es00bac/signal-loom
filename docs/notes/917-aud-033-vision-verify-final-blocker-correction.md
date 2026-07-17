# AUD-033 Vision Verify final-blocker correction — 2026-07-16

## Sol BLOCK and bounded repair

Sol's fresh final review **BLOCKED** `c4649f1` on five exact issues. The prior
claims that its proxy contract and production build were green are retracted.
Commit `7a33a66` is the source/test correction; this evidence commit records
the results without declaring approval.

1. Proxy Vision Verify now accepts only a literal Boolean result with
   `resultType: 'boolean'` and required, matching
   `outputMetadata.decision`/`outputMetadata.resultType`. Strings, numbers,
   null, objects, error payloads, missing descriptors, and both true/false
   disagreement directions fail as `NonRetryableError`. Direct/Vertex exact
   first-line string grammar was not weakened.
2. Once a proxy HTTP 200 is processed, JSON decode and top-level/schema errors
   become `NonRetryableError`; malformed JSON, truncated JSON, a wrong root,
   and invalid Vision metadata each make one fetch at `batchMaxRetries: 2`.
3. Source Library generated-result hydration is restricted to compatible media
   producer/result pairs. Boolean attempt validation preserves real false;
   colliding text Source items and stale linkage cannot override Vision true or
   false. Electron now hydrates the same compatible results as the browser.
4. Renderer and Electron apply matching linear metadata limits: depth 12,
   64 keys/object and 256 total keys, 256 array items, 16 KiB values, 512-byte
   keys, 1,024 visited nodes, and 1 MiB UTF-8 serialized metadata. Invalid
   metadata is dropped while the valid attempt/descriptors remain.
5. The two malformed-response `it.each` callbacks now consume their full row,
   so forced nonincremental TypeScript and the real build graph type-check.

## Final local evidence

- Focused proxy/restore/parity regressions: 4 files / 137 tests passed with
  `npx vitest run --configLoader runner`.
- The 20-file author matrix was rerun with `--configLoader runner`: 517 tests
  passed. Sol's earlier 465-test observation predates this correction's added
  deterministic permutations.
- The broader Boolean-consumer matrix passed at 449 tests with
  `--configLoader runner`.
- Forced `npx tsc -p tsconfig.app.json --noEmit --incremental false` and
  `npx tsc -p tsconfig.node.json --noEmit --incremental false` passed.
- Changed-lineage ESLint and `git diff --check` passed.
- `npm run verify:flow-production` passed: 9 files / 325 tests; 63 nodes,
  182 model contracts, and 178 normal model options.
- `npm run build` reached and completed Vite production build.

Residual: no live paid provider request was made. A fresh independent Sol
final gate remains required; this note does not declare approval.
