# AUD-033 — Vision Verify Boolean contract — correction — 2026-07-16

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
- Green evidence after `1c627bc`:
  - reviewer matrix plus new focused coverage: 20 files / 465 tests passed
    with `npx vitest run --configLoader runner …`;
  - forced `npx tsc -p tsconfig.app.json --noEmit --incremental false` and
    `npx tsc -p tsconfig.node.json --noEmit --incremental false` passed;
  - changed-file ESLint had 0 errors (14 existing warnings), and
    `git diff --check` passed;
  - `npm run build` passed;
  - `npm run verify:flow-production` passed: 9 files / 325 tests and the
    63-node / 182-contract production verifier.
