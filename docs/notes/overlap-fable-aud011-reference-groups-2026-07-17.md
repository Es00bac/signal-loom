# AUD-011 structured numbered reference groups — 2026-07-17

Worktree `flow-overlap-fable-aud011-reference-groups`, branch
`overlap/fable-aud011-reference-groups`, based at combined main `3d628c8` (clean).
Production + permanent tests: `10b46af`.

## Defect and canonical model

Image/video `Reference N` handles accept one image-like connection plus textual/JSON
guidance, but the runtime reduced images to a flat ordered URL list
(`collectImageReferenceInputs` / `collectReferenceImageInputs`) and poured every textual
signal — regardless of target handle — into the global prompt
(`collectPromptSignalForNode`). Providers received content without its numbered
association, and swapping two descriptions between slots changed no flattened byte, so
`hashExecutionParameters` resumed stale output.

Canonical representation (`src/lib/referenceGroups.ts`):

```ts
interface FlowReferenceGroup {
  slot: number;                       // Reference N, 1-based, deterministic slot order
  imageUrl?: string;                  // the slot's single permitted image
  descriptions: string[];             // ordered textual guidance for this iteration
  jsonGuidance: string[];             // sorted-key deterministic JSON strings
  referenceType?: 'asset' | 'style';  // video slots only
}
```

- `flowSignals.collectNodePromptSignals` partitions textual edges once into: `combined`
  (byte-identical to the old collector — still the sole loop-cardinality and diagnostics
  authority, so FBL-017 planning/consent counts are unchanged), `prompt` (unnumbered
  edges only → `ExecutionContext.prompt`), and per-handle reference signal lists.
- `resolveReferenceGroupsAtIndex` materializes groups per iteration with the same
  broadcast/index selection rule as the prompt (`signalAtIterationIndex`), omits empty
  slots, and skips a text-less Package signal's image-URL fallback.
- `flowStore.buildNodeExecutionResolution` is the one resolution shared by planning,
  graph execution, and direct Run (the former hand-inlined dependency-loop context now
  calls it). Flat `editReferenceImageInputs`/`referenceImageInputs` are DERIVED from the
  groups; list/envelope iteration items routed to a numbered handle replace that slot's
  image for the iteration.
- `ExecutionContext.referenceGroups` is set only when non-empty, so envelope ids of
  existing flows without references stay byte-identical (no global resume invalidation);
  any slot re-association changes the hash and refuses stale resume.

## Provider mapping decisions

- Gemini direct + Vertex Gemini image (`buildVertexGeminiImageRequestBody` now takes
  `references: {image, instruction?}[]`): each guided slot's
  `Reference N: …` text part is placed immediately BEFORE its own image part;
  image-only slots stay byte-identical to the legacy flat request.
- OpenAI `images.edit`: ordered image array `[source?, ref slot order]` plus an explicit
  prompt block — `Reference 1 (attached image 2 of 3): preserve logo` — appended after
  the untouched ordinary prompt; positions proven in tests.
- Atlas native / BFL FLUX.2 / Local-Open: same prompt-block serialization with
  route-specific position nouns (`input image K of T`, `reference image K of N`).
- Veo (Gemini API + Vertex): native `referenceImages[{image, referenceType}]` in slot
  order (unchanged) + prompt block for guidance; Veo's own "guidance requires a prompt"
  validation still runs on the authored prompt.
- Gemini Omni (API-key + Vertex): the per-media `instruction` channel carries
  `Reference N (asset|style reference): …`; image-only slots keep the legacy
  `Use this as a … reference.` string exactly.
- Fail-closed, non-retryable, before any submission: guidance-only slots (no image),
  slot number above the model's `maxReferenceImages`, guidance on reference-incapable
  image models (Stability/HF/BytePlus/Android/Imagen route), Atlas OpenAI-compatible
  references (was a retryable plain `Error`), and any guidance on non-Gemini video
  providers (HF/Atlas video cannot express the association).
- Backend proxy: `buildBackendProxyExecuteRequest` rebuilds `referenceGroups` from an
  allowlist (slot int 1–14 strictly ascending, ≤14 groups, ≤16 guidance entries/slot,
  descriptions ≤20 000 chars, JSON entries ≤65 536 chars, parseable, depth ≤16,
  referenceType enum) and throws `NonRetryableError` before `fetch`; stray
  credential-shaped keys are dropped by reconstruction. Capability enforcement for
  proxied runs stays server-side (the server runs the same direct code), keeping
  direct/proxy parity.

## Red → green proof

Red on clean `3d628c8` (`node_modules/.bin/vitest run --configLoader runner
src/lib/flowExecutionReferenceGroups.test.ts src/store/flowStore.referenceGroups.test.ts`):
**15 failed | 3 passed (18)**. The 3 passes are deliberate invariance guards
(image-only Gemini request byte-identical; guidance-free OpenAI prompt untouched;
Atlas-compat rejection already non-retryable via the top capability gate). Demonstrated
failures include: no `referenceGroups` on captured store contexts; reference text leaked
into `context.prompt`; Gemini/OpenAI/Veo/Omni requests without any `Reference N`
association; description swap resumed from Source Bin with 0 fresh calls; proxy DTO
carried a `super-secret` stray key and accepted depth-40 JSON.

Green after `10b46af`: same command → **18 passed (18)**. The swap test proves the
fingerprint/resume requirement end-to-end: identical flattened bytes (same prompt
concatenation, same `[A, B]` image list), swapped handles → both iterations re-execute
(2 fresh provider calls) and every stored Source item lands under new envelope ids.

## Verification (final tree, exact commands)

- Focused matrix `node_modules/.bin/vitest run --configLoader runner …` over 33 files
  (signals, listExecution/listNodes, flowStore + runNode + ownership + cancellation,
  backendProxy + flowExecutionBackendProxy, image/video/vertex/atlas/HF providers,
  provider-signal, cancellation, vision-verify, node/connection contracts, gemini video
  request/validation, vertexImageRequests, geminiImagePrompt, usage ledger/recording,
  runtime port capabilities, videoFrameConnections, preflight, async-retry,
  imageEditorAi request builders + atlas native, both new AUD-011 suites):
  **33 files, 649 tests, all passed, exit 0**. Pre-change baseline of the original 24
  files on `3d628c8` was 510/510.
- `tsc -b --force` (fresh, non-incremental, app+node+all refs): **exit 0**.
- Changed-file ESLint (all 11 TS files): **exit 0, no findings**.
- `git diff --check`: **exit 0**.
- `npm run verify:flow-production`: **exit 0** — 9 files / 342 tests, then
  "Flow production audit passed: 63 nodes, 182 model contracts, 178 normal model
  options."
- No production build run: the change is runtime TS inside existing modules; `tsc -b`
  plus the matrix covers the changed boundary.

`docs/audits/flow-node-audit-2026-07-15.md` is regenerated (2 lines): the runtime-
evidence rows for `image-reference-*`/`video-reference-*` now name
`collectImageReferenceSlotInputs` / `collectVideoReferenceSlotInputs` and the new
verification suites — a legitimate contract-registry update, not noise.

## Residuals

- Atlas/HF video routes reject reference *guidance*; bare reference *images* on those
  routes remain contract-disabled upstream (no Atlas/HF video contract declares
  `reference-to-video`), so nothing arrives at runtime today.
- Prompt-only reference text with no ordinary prompt used to run (the leak made it the
  prompt); it now fails with an actionable diagnostic asking for a prompt or an image on
  the slot — intentional honesty change.
- The envelope-on-reference double-count (static first-image + per-iteration item both
  in the flat list) is gone for group-derived arrays; legacy contexts without groups
  keep old behavior.
- Proxied runs rely on the (external) server enforcing model reference capabilities;
  the client bounds shape/size only. The proxy context DTO gains an optional
  `referenceGroups` field; the versioned settings DTO is unchanged.
