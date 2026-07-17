# AUD-033 — Vision Verify Boolean contract — correction — 2026-07-16

## Sol final-gate correction

Sol's fresh final gate correctly returned **BLOCK** against `1c627bc`. The
following claims in the earlier evidence are retracted: direct Gemini/Vertex
and proxy Vision Verify did **not** yet share a fail-closed Boolean parser, and
renderer/Electron sanitation did **not** round-trip the complete selected
attempt state. In particular, permissive `includes('true')` parsing accepted
empty, ambiguous, embedded-token, and contradictory strings as successful
decisions (or fabricated `false` for missing direct output); sanitization
dropped attempt `variableName` and `sourceBinItemId`.

Commit `c4649f1` is the follow-up production/test repair. It introduces one
shared direct/proxy parser that accepts only a provider Boolean or a
case-insensitive standalone `true`/`false` first decision line, rejects
ambiguous/missing/wrong-type/provider-rejected responses as non-retryable, and
does not fabricate a verdict. It also makes MIME, extension, file name, safe
output metadata, usage, variable, and Source Bin linkage first-class attempt
state with browser/Electron-parity validation and selected-attempt restoration.

The prior claim that commit `45e51a8` passed the production build is
retracted. The fresh Sol gate correctly found that the committed branch did
not compile under the strict build graph and that its renderer/Electron
sanitizers, Boolean history migration, loop transport, variable binding, and
media consumers did not agree on the value contract.

Commit `1c627bc` is the production/test repair.

## Canonical representation and path

- `ResultValue` is the canonical scalar result type. Boolean node state,
  attempts, selected attempts, and project data retain real `boolean` values.
  List/envelope payloads deliberately serialize Boolean items as canonical
  `"true"`/`"false"` strings and restore them to Booleans at scalar boundaries.
- Direct Gemini/Vertex and backend-proxy Vision Verify execution agree on
  true/false. Function execution follows the same scalar restoration rule.
- App and Electron project sanitizers preserve real Boolean attempts, migrate
  only Vision Verify's legacy text-tagged canonical decisions (including each
  history entry), restore a selected false attempt, and leave ordinary text
  `"true"` untouched.
- Media URL consumers now explicitly require strings. Attempt previews,
  source/project/video helpers, image/audio/video/composition UI, execution,
  and cost helpers cannot use Boolean values as URLs.
- Flow variables retain Boolean kind while deterministically presenting both
  values as `true`/`false`; false is no longer filtered by truthiness.
- `FLOW_NODE_CONTRACTS` and the generated Flow audit now identify Vision
  Verify's runtime result as `boolean`.

## Evidence

- Red evidence: the strict `npm run build` exposed the invalid `string |
  boolean` boundaries in media nodes, Video Workspace, executor/proxy,
  list/source/project helpers, costs, and contracts. The earlier app-only
  check was therefore insufficient evidence for a production build claim.
- The previous green evidence after `1c627bc` is superseded for the two Sol
  blockers above. It was green for the then-covered Boolean boundaries, but it
  did not prove strict provider-response parsing or complete attempt
  persistence.
- Green evidence after `c4649f1`:
  - focused 20-file AUD-033 matrix passed with
    `npx vitest run --configLoader runner …`, including deterministic API-key,
    Vertex, and proxy malformed-response/retry tests plus browser/Electron
    attempt-parity, variable substitution, and Source Bin resolution coverage;
  - forced `npx tsc -p tsconfig.app.json --noEmit --incremental false` and
    `npx tsc -p tsconfig.node.json --noEmit --incremental false` passed;
  - changed-file ESLint had 0 errors, and `git diff --check` passed;
  - `npm run build` passed;
  - `npm run verify:flow-production` passed: 9 files / 325 tests and the
    63-node / 182-contract production verifier.

Residual: the bounded code/test evidence is green; a fresh independent Sol
gate remains the requested final confirmation. No live paid provider request
was made by this repair.
