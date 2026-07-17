# AUD-033 hostile metadata and Boolean contract correction — 2026-07-16

Source and regression coverage are in `86913f4` (`fix(flow): harden Boolean
metadata boundaries`). This supersedes the limited metadata-safety claim in
note 918. It records local evidence only and does not approve the change.

## Correction

- Browser `projectValidation.ts` and Electron `project-files.cjs` now use the
  same bounded descriptor traversal for result output metadata. They only
  accept own, enumerable data properties of plain or null-prototype objects;
  create null-prototype restored records; reject `__proto__`, `constructor`,
  and `prototype`; and fail closed on accessors, trapping/revoked Proxies,
  cycles, non-JSON array shapes, foreign prototypes, and malformed nested
  values. Invalid metadata is removed without removing a valid selected
  Boolean attempt or its MIME/file/variable/Source Bin siblings.
- Typed Boolean rendering and routing no longer rely on string-only/truthy
  coercion: Boolean themes distinguish literal `true` and `false`, Function
  scalars reach Value Monitor, and virtual conditional routing recognizes
  literal Booleans before narrowly retaining legacy strings.

## Regression evidence

- Initial targeted red run: **5 files / 134 tests; 14 failed, 120 passed**.
  The failures covered JSON `__proto__`, nested prototype keys, throwing
  getters/Proxies, null-prototype output restoration, typed true theme, and
  Function-to-Value-Monitor true/false.
- Focused hostile/no-history set: **5 files / 134 tests passed**. Browser and
  Electron are compared on the hostile fixtures; coverage also retains the
  existing arrays, depth, key/string/node/aggregate-size boundaries, selected
  attempts, MIME/file descriptors, variable bindings, and Source Bin links.
- Prior author matrix: **20 files / 546 tests passed**. Boolean consumer
  sweep: **12 files / 148 tests passed**.
- `npm run verify:flow-production`: **9 files / 333 tests passed**, then the
  63-node / 182-contract / 178-normal-option verifier passed.
- Forced non-incremental app and node TypeScript, correction-lineage ESLint,
  `git diff --check`, and `CI=1 npm run build` passed.

## Residuals

- No live or paid provider request was made.
- Vite retains its existing runtime URL/externalized-module and large-chunk
  warnings; the production build completed successfully.
- A different-model final gate remains required. This evidence is not a
  self-approval.
