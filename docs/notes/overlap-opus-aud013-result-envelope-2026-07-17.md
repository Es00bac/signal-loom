# AUD-013 — Versioned backend-proxy result-envelope parity (2026-07-17)

## Problem

Direct execution (`ExecutionResult` in `src/lib/flowExecution.ts`) can return `result`, `resultType`,
`statusMessage`, `usage`, `mimeType`, `extension`, `fileName`, `outputMetadata`, an optional `Blob`, and
ordered `additionalResults`. The backend-proxy reconstruction path retained only
`result`/`resultType`/`statusMessage`/`usage`, so proxied multi-output jobs lost every supplementary
image and every file-identity/metadata/Blob field, and a well-formed provider error returned at HTTP 200
was **resubmitted** through the outer retry wrapper.

## Change

New module `src/lib/backendProxyResultEnvelope.ts` defines one explicit, versioned, serializable
result-envelope contract and a pure encode/decode/validation surface:

- **Version:** `BACKEND_PROXY_RESULT_ENVELOPE_VERSION = 1`, intentionally **distinct** from the
  request-settings DTO version `BACKEND_PROXY_EXECUTION_SETTINGS_VERSION` (they evolve independently).
- **Wire shape:** flat top-level fields (a strict superset of the historical response) plus
  `envelopeVersion`, an explicit `binary` block, and `additionalResults`. `envelopeVersion` is the single
  unambiguous discriminator between the versioned and legacy contracts.
- **Blob transport:** `binary = { encoding: 'base64', mimeType, byteLength, data }`. Reconstructed to a
  real `Blob` only after validation; byte-for-byte and MIME preserved. Never `JSON.stringify(new Blob())`,
  object URLs, or filesystem paths. `result` and `binary` may coexist and describe the same primary asset,
  matching direct-execution semantics (documented in the module header).
- **Validation:** version; record shape; primary result **by result type** (real Boolean for `boolean`,
  data/HTTPS URL for asset kinds, string otherwise — object/file URLs rejected); status; usage
  (finite numerics, bounded string `notes`); MIME/extension/file name; JSON-safe + depth- + serialized-size-
  bounded output metadata; ordered `additionalResults` (a single malformed child rejects the whole
  envelope); and the binary block.
- **Bounds:** named and **injectable** via `BackendProxyResultEnvelopeLimits`
  (`DEFAULT_BACKEND_PROXY_RESULT_ENVELOPE_LIMITS`): `maxDecodedBinaryBytes` (64 MiB),
  `maxEncodedBinaryLength`, `maxAdditionalResults` (64), `maxResultValueLength` (96 MiB),
  `maxStatusMessageLength` (8192), `maxMimeTypeLength` (255), `maxExtensionLength` (32),
  `maxFileNameLength` (1024), `maxMetadataDepth` (32), `maxMetadataSerializedBytes` (1 MiB),
  `maxUsageNotes` (128), `maxNoteLength` (8192). An **oversize declared** `byteLength` is rejected on the
  number alone (before the encoded length check and before any buffer is allocated); the encoded string is
  length-checked before decode; declared vs. computed vs. actual decoded lengths must all agree.
- **Legacy adapter:** unversioned responses pass through a narrow adapter honoring only the historical
  single-asset fields; a legacy payload carrying `binary` or `additionalResults` is rejected with an
  actionable "use a versioned result envelope" message. Exactly two disambiguated shapes, never a third.
- **Terminal semantics:** any decode failure, unsupported version, or a well-formed `error` field is a
  **processed terminal response** — it throws `NonRetryableError`, so the proxy is never resubmitted.

`src/lib/flowExecution.ts`: the non-Vision proxy branch now returns
`decodeBackendProxyResultEnvelope(payload)`; the dead `VALID_RESULT_TYPES` constant and `payloadResult`
local were removed. Vision Verify's strict Boolean contract and the AUD-012 request allowlist are
untouched. On the no-op path `applyConfiguredAutoUpscaleIfRequested` returns the result unchanged, so the
full envelope (Blob/additionalResults/metadata) flows to the store consumer intact.

## Compatibility decision

Legacy **unversioned** proxy responses remain **accepted** through the narrow adapter (existing
`flowExecutionBackendProxy.test.ts` fixtures are unversioned), proven unable to claim the new Blob/
multi-result fields. **Behavioral change (deliberate):** a well-formed `error` at HTTP 200 is now terminal
(`NonRetryableError`) instead of a retryable plain `Error`; pre-fix it was resubmitted up to
`batchMaxRetries` times. This directly satisfies AUD-013 requirement 5 and is covered by a single-call test.

## Red → green evidence

Pre-fix (stash only `src/lib/flowExecution.ts`, run the integration suite):
`vitest run --configLoader runner src/lib/flowExecutionBackendProxyEnvelope.test.ts`
→ **11 failed | 5 passed (16)**. Dropped `additionalResults`/`blob`/`mimeType`/`extension`/`fileName`/
`outputMetadata`; the well-formed-error test observed **fetch called 4 times** (resubmission). Fix restored.

Post-fix focused runs (all `--configLoader runner`):

- `src/lib/backendProxyResultEnvelope.test.ts` — **32 passed** (version distinctness; text/Boolean/JSON/
  file/multi-image parity; non-UTF-8 Blob byte-for-byte round-trip + zero-byte Blob; exact bound + bound+1
  for binary size / additional-result count / metadata depth+size / encoded length, incl. an absurd declared
  `byteLength` rejected without allocation; invalid base64, length mismatch, malformed metadata, non-finite
  telemetry, unknown/unsupported version, wrong result type, non-URL/object-URL asset, malformed child,
  tempting fields in an error payload; legacy adapter accept + Blob/multi-result refusal).
- `src/lib/flowExecutionBackendProxyEnvelope.test.ts` — **16 passed** (multi-image `additionalResults` with
  distinct MIME survives `executeNodeRequest`; file metadata + nested `outputMetadata` retained; real Blob
  reconstructed; text status/usage carried; legacy single-asset still accepted; malformed/truncated JSON,
  wrong top-level schema, unknown version, wrong result type, invalid base64, byte-length mismatch, malformed
  metadata, tempting error payload, and legacy Blob-claim each call the proxy **exactly once** with retries
  configured; well-formed provider error is terminal in a single call).
- `src/store/flowStore.runNode.test.ts` — **+1** ordered multi-image expands to 3 `envelopeItems` with
  distinct MIME (`image/png`/`image/webp`/`image/jpeg`), indices `[0,1,2]`, and 3 Source Library items.

Combined regression run — `backendProxyResultEnvelope`, `flowExecutionBackendProxyEnvelope`, `backendProxy`
(AUD-012 DTO), `flowExecutionBackendProxy` (client-side upscale), `flowExecutionVisionVerify`,
`flowExecutionCancellation`, `flowStore.runNode`: **192 passed (7 files)**.

## Static gates

- `tsc -b --force` → exit 0 (fresh, non-incremental; app + node/test project refs).
- `eslint` on the 5 changed files → exit 0.
- `git diff --check` → exit 0.
- Production `vite` build **not run**: change is pure TS in `src/lib` + a store test, no build/boundary or
  config change; `tsc -b` is the authoritative type gate here.

## Commits

- Base HEAD: `ebc96d7`.
- Fix + permanent tests: `058bb54`.
- This evidence note: separate follow-up commit.

## Residual risk / assumptions

- No server implementation ships in this repo; this module is the client half of the contract. An external
  proxy must emit `envelopeVersion: 1` and the documented `binary` block to use Blob/multi-result outputs.
- The well-formed-error terminal change (above) could stop retrying a proxy that (incorrectly) returns 200
  for a transient error; correct proxies should return non-2xx for retryable failures.
- Default bounds are generous caps, not expectations; tune the injectable `limits` if real media exceeds them.
- A fresh cross-provider gate follows; not self-approved.
