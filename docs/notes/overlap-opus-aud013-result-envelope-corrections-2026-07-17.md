# AUD-013 — result-envelope review corrections (2026-07-17)

Follow-up to `overlap-opus-aud013-result-envelope-2026-07-17.md`. An independent review returned
CHANGES REQUIRED with five findings; all five are corrected narrowly in commit `b377632` on top of the
production commit `058bb54` (worktree HEAD was `bb728a8`). The envelope stays legacy-compatible for
existing unversioned single-result proxies while making the versioned v1 contract internally coherent.

## Findings and fixes

1. **Primary/binary binding + post-upscale stale bytes.**
   - `backendProxyResultEnvelope.ts`: when a v1 envelope carries `binary`, `bindPrimaryResultToBinary`
     now requires an asset result type; requires the primary `result` to be a base64 `data:` URL (an
     HTTP(S) primary alongside a binary is unprovable and rejected; HTTP without binary stays valid);
     normalizes and requires the data-URL MIME, `binary.mimeType`, and any top-level MIME to agree;
     decodes the binary once (`reconstructBinary`) and compares the primary data-URL payload byte-for-byte
     and by declared length; and derives the runtime MIME from the binary when the top level omits it.
   - `flowExecution.ts`: `applyConfiguredAutoUpscaleIfRequested` now clears `blob`, `extension`,
     `fileName`, and `outputMetadata` after the upscale replaces the primary bytes. Root cause: the
     Source Library materializer (`sourceBinStore.ts` ~L2432) persists a supplied `Blob` in preference to
     the result data URL, so a retained pre-upscale Blob stored the ORIGINAL image, not the upscaled one.
   - Misleading decoder/integration tests that paired unrelated bytes/MIME were corrected to describe the
     same asset.

2. **Vision Verify through the common versioned envelope.** `executeNodeViaBackendProxy` now decodes both
   legacy and versioned Vision payloads via `decodeBackendProxyResultEnvelope` first (version, literal
   Boolean, status, usage enums, and metadata depth/size all validated in common), then applies the
   literal-Boolean and decision/metadata-agreement checks on the decoded result.

3. **Node/result-type compatibility at the proxy boundary.** `assertProxyResultTypeMatchesNode` maps
   `textNode->text`, `imageGen->image`, `videoGen->video`, `audioGen->audio` (Vision Verify handled on its
   own Boolean branch). Verified against the direct executors — each is strictly 1:1 (executeTextNode
   emits only `text`, etc.) and the `flowNodeContracts` output ports agree. A well-formed package/video
   envelope for an image node is now rejected instead of accepted by the generic decoder.

4. **Usage as an allowlisted validated object.** `validateUsage` requires valid `source`/`confidence`
   enums, bounds `provider`/`modelId` (`maxUsageStringLength`), rejects unknown keys, requires
   costs/durations finite and non-negative and counts/tokens non-negative integers, preserves legitimate
   zero, and builds a fresh object — the raw value is never cast through.

5. **Bounded response before JSON allocation.** `readBoundedResponseText` (generalized from the API
   Requester reader; the API path is preserved byte-for-byte) reads the proxy body under one named cap
   `MAX_BACKEND_PROXY_RESULT_WIRE_BYTES`, derived from and reconciled with the per-field/count maxima
   (`maxAdditionalResults` reduced to 16, new `maxAdditionalResultValueLength` 16 MiB) so the maxima cannot
   in aggregate describe a multi-gigabyte envelope (cap resolves to well under 512 MiB). Oversized declared
   Content-Length and streamed bodies reject non-retryably before parse; the reader cancels/releases the
   body and preserves AbortError. `decodeBackendProxyExecutionPayload` now uses it + `JSON.parse`.

## Red → green evidence

Each finding's regression was confirmed RED against the pre-fix behavior by surgically neutralizing only
that finding's guard (upscale-clear, node-type check, decoder binding, usage validation, bounded reader)
and running the targeted tests — 22 targeted failures across the four suites — then restoring. With the
fix in place:

- `backendProxyResultEnvelope.test.ts` — 50 passed (adds primary/binary binding: MIME/byte/length
  agreement, HTTP+binary rejection, HTTP-without-binary acceptance, non-asset rejection, runtime-MIME
  derivation; usage allowlist: exact-bound strings, invalid enums, negative, fractional count, unknown
  key, oversized string, zero preserved, no cast-through).
- `flowExecutionBackendProxyEnvelope.test.ts` — passed (matching-node file-metadata/Blob; node-type
  rejection of package/video on imageGen and image on textNode; bounded-reader unit tests: reconciled
  sub-GiB cap, declared-length reject, exact-cap accept / +1 reject, in-flight AbortError; declared-length
  route reject with a single call).
- `flowExecutionBackendProxy.test.ts` — 32 passed (adds finding-2 versioned Vision accept; unknown
  version, over-depth metadata, oversize metadata, and invalid usage enum rejected through the shared
  decoder, each a single call).
- `src/store/flowAutoUpscaleMaterialization.test.ts` (new, jsdom) — end-to-end real proxy (versioned image
  + ORIGINAL binary) -> real Android-accelerator auto-upscale -> real `addAssetItem`; asserts the cleared
  byte-derived fields and that the persisted bytes are the UPSCALED output via the data-URL branch, never
  the original Blob.

Combined focused + neighbor run — `backendProxyResultEnvelope`, `flowExecutionBackendProxyEnvelope`,
`flowExecutionBackendProxy`, `flowExecutionVisionVerify`, `flowExecutionApiFetch` (reader refactor),
`flowExecutionCancellation`, `backendProxy` (AUD-012 DTO), `flowStore.runNode`, and the new store test:
**240 passed (9 files)**.

## Static gates

- `tsc -b --force` → exit 0 (fresh, non-incremental; app + node/test project refs).
- `eslint` on the 6 changed/added files → exit 0.
- `git diff --check` → clean.
- `npm run verify:flow-production` → exit 0 (342 tests + audit: 63 nodes, 182 model contracts). The proxy
  result path is part of the flow-production surface, so the verifier was run even though no node contract
  or build boundary changed; a full `vite` build is not warranted (pure `src/lib` + a store test, no
  config/boundary change; `tsc -b` is the authoritative type gate).

## Commits

- Base production: `058bb54`; prior evidence: `bb728a8`.
- Corrections + permanent tests: `b377632`.
- This evidence note: separate follow-up commit.

## Residual risk / assumptions

- Reconciling the maxima reduced `maxAdditionalResults` 64 -> 16 and capped auxiliary result strings at
  16 MiB; realistic multi-image jobs (<= a handful of siblings) are unaffected. Tune the injectable limits
  if real media exceeds them, and re-derive the wire cap alongside.
- A binary'd primary must now be a self-consistent base64 `data:` URL. A conforming proxy that previously
  shipped an HTTP primary beside a binary must instead ship the data URL (or drop the binary and keep the
  HTTP primary, which stays valid).
- No server implementation ships here; this module remains the client half of the contract.
