# AUD-033 — Vision Verify Boolean contract — 2026-07-16

Commit `45e51a8` fixes the Vision Verify result-type mismatch.

## Canonical representation and path

- `executeNodeRequest` now receives a real `boolean` from both Gemini API-key
  and Vertex routes. The provider's second-line explanation remains in
  `usage.notes`; status retains the human-readable `Verified: TRUE/FALSE`.
- The backend-proxy boundary normalizes legacy string decisions too, so it
  cannot reintroduce `resultType: 'text'` for a Vision Verify node.
- `flowStore` persists that Boolean through its normal result patch and
  `appendResultAttempt` path. Selection restores the exact Boolean result.
  Project hydration converts legacy Vision Verify `"true"`/`"false"` results
  and result-history entries to the Boolean representation.
- `evaluateNodeSignal` emits a Boolean value; the legacy generic monitor
  serializer deliberately renders it as `true` or `false`, never by string
  truthiness. Source Bin does not materialize Boolean-only values as text or
  media assets.
- `FLOW_NODE_CONTRACTS` and the generated Flow audit now identify Vision
  Verify's runtime result as `boolean`.

## Evidence

- Executor-to-port parity covers Gemini `true` and `false`, including the
  output-port declaration and retained explanation:
  `src/lib/flowExecutionVisionVerify.test.ts`.
- Signal, generic monitor serialization, result history, selected attempt,
  and saved-project restoration have explicit Boolean regressions.
- Focused production Flow suite: 13 files, 378 tests passed with
  `--configLoader runner`.
- Forced non-incremental TypeScript, changed-file ESLint, `git diff --check`,
  `npm run build`, and `node scripts/verify-flow-production.mjs` passed.

The audit generator also refreshed its pre-existing stale Switch Case matrix
row so the checked-in generated artifact matches the production gate.
