# AUD-042 valid-import ordering — superseding correction evidence

Date: 2026-07-18

Rejected candidate: `5c9275dd7629eca63c18afca121e709734fd1825`

Production/test correction: `16155ef8677a617a693ffbbca3b2275bcb9b19df`

Role: Product Mechanic correction author. This note records implementation and local verification
only; it does not self-approve or integrate AUD-042.

## Independently reproduced gap

The final read-only gate found one remaining Medium operation-authority defect. With two valid
imports invoked A then B while both were decrypting, A could validate and commit first. Its license
verification generation increment then made later-invoked B return `superseded` when B validated,
even though B was the later valid import and no activation, removal, or rehydrate had intervened.

A disposable gate probe reproduced the failure on exact candidate `5c9275dd`; the permanent
old-code-sensitive regression produced the same red result before the production correction:

- one failed assertion: B returned `superseded` instead of `committed` when A decrypted first;
- the activation, removal, and rehydrate neighbor assertions already passed.

## Narrow correction

Import invocation/validation order remains separate from license identity. The correction adds a
distinct external-identity generation for activation, removal, and applied rehydration. A settings
import still increments the ordinary license-verification generation when it commits, so stale
verification cannot apply, but that internal import claim no longer masquerades as an external
operation that cancels a later-valid import.

The resulting authority rules are:

- rejected, malformed, incomplete, and unsupported imports never enter valid-import ordering;
- for two valid imports, the later invocation wins whether it decrypts first or second;
- a later activation, removal, or applied rehydrate still supersedes any import that remains in
  flight; and
- an earlier import cannot overwrite a later valid import that validated first.

No backup schema, field sanitizer, encryption, persistence format, UI, or translation behavior was
changed.

## Permanent regression coverage

- A then B invoked; A decrypts and commits first; B decrypts second and commits as the final owner.
- A then B invoked; B validates first; the pre-existing inverse-order test remains green.
- After A commits while B is still decrypting, a later valid activation supersedes B.
- After A commits while B is still decrypting, a later removal supersedes B.
- A later applied rehydrate supersedes a valid import still decrypting.
- Existing rejected-import, malformed-data, schema validation, license verification, cross-window,
  and hydration races remain green.

## Verification

- Focused backup and authority suite: **2 files, 31 tests passed**.
- Full settings/backup/i18n/UI/hydration/cross-window/license matrix: **10 files, 84 tests passed**.
- `npx tsc -p tsconfig.app.json --noEmit --incremental false --pretty false` — passed.
- `npx tsc -p tsconfig.node.json --noEmit --incremental false --pretty false` — passed.
- ESLint on both touched production/test files — passed.
- `git diff --check` — passed.
- `npm run build` — passed; 3,279 modules transformed. Existing runtime-URL,
  browser-externalization, and chunk-size warnings remain non-fatal.

This is a correction-author candidate and requires a fresh independent final gate.
