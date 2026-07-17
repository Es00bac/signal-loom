# Terra AUD-033 legacy Boolean and top-level metadata repair — 2026-07-16

Source and tests are in `fb3f4c0` (`fix(flow): restore legacy Boolean results
safely`). This note records local evidence only; it does not approve the work.

## Repair

- `shared/flow-result-value-contract.json` is the exact persisted Boolean
  spelling contract: only literal `true` and `false` strings restore legacy
  Boolean scalars. Browser and Electron adapters preserve literal Booleans,
  reject whitespace/case/number/truthy alternatives, and never use string
  truthiness.
- Browser and Electron project normalization now restore typed Boolean current
  results and history for every node type, including persisted Function
  results with no history. Vision Verify retains its narrowly scoped migration
  from its former text-tagged legacy data; ordinary text remains text.
- Signals, list/monitor paths, function input/output paths, variables, and
  the Vision Verify display restore through the typed scalar boundary. Media
  callers remain string-only through `resultValueAsMediaUrl`.
- Both project sanitizers now apply the existing metadata limits to
  `resultOutputMetadata` even when no result history exists. Invalid metadata
  is dropped without deleting the actual result or a selected attempt.

## Regression evidence

- Browser/Electron parity tests cover history-absent top-level metadata plus
  exact string, key, array, depth, aggregate-byte, and visited-node limits;
  they verify a selected legacy Function `"false"` becomes Boolean `false`.
- The 20-file AUD-033 author regression run completed with
  `--configLoader runner`: **20 files / 581 tests passed**. The count is higher
  than the earlier 517-test record because this repair adds scalar,
  history-absent metadata, and parity cases.
- A directly affected 12-file consumer regression run completed with
  `--configLoader runner`: **12 files / 250 tests passed**.
- `npm run verify:flow-production` passed: **9 files / 333 tests**, followed
  by the 63-node / 182-contract / 178-normal-option verifier.
- Forced non-incremental `tsconfig.app.json` and `tsconfig.node.json` checks,
  changed-lineage ESLint, `git diff --check`, and `CI=1 npm run build` passed.

## Residuals

- No paid provider request was sent.
- This is not a self-approval. A fresh independent Sol final gate remains
  required.
