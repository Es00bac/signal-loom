# AUD-013 — result-family contract + header-fast body cancellation (2026-07-17)

Follow-up to `overlap-opus-aud013-result-envelope-corrections-2026-07-17.md`. A second independent
review confirmed the five prior fixes and returned two remaining blockers plus one non-blocking note.
Both blockers are corrected on top of `bba6145` (clean at entry) in commit `edc322c`; this note is a
separate follow-up commit.

## Blocker 1 — media-family parity (`backendProxyResultEnvelope.ts`)

Before: the decoder accepted any `data:`/HTTP asset URL for every asset result type;
`validateAdditionalResults` never received the parent `resultType`; and the execution boundary
(`assertProxyResultTypeMatchesNode`) only checked the *declared* type. So an `imageGen` envelope
declaring `resultType: "image"` could carry `data:video/mp4…` as the primary and `data:audio/wav…`
as an additional result, and `flowStore.ts` (`addAssetItem`/`envelopeItems`, ~L4573–4600) then
persisted every output under `kind: execution.resultType` — i.e. heterogeneous media mislabeled as
image.

Fix — one canonical family contract, enforced in the decoder (both versioned and legacy paths):

- `assetMediaFamily(resultType)` maps `image→image`, `video→video`, `audio→audio`,
  `package→application` (a package is an application/* archive/container); non-asset types → `null`.
- `enforceAssetMediaFamily(url, suppliedMime, family, field)`: a `data:` URL's own MIME
  (`dataUrlMimeType`, base64 or not) is authoritative — it must sit in `family`, and any supplied
  MIME must equal it. An HTTP(S) URL has no inspectable MIME, so a supplied MIME (when present) must
  sit in `family`; with none, the declared result type governs (the direct executors only emit
  same-family HTTP assets — e.g. Atlas image URLs — which are unprovable but never heterogeneous).
- `validateAdditionalResults` now takes `resultType`: a non-asset parent carrying siblings is
  rejected (`fail`), and every sibling is family-checked as it is validated.
- `enforcePrimaryAssetFamily(resultType, result, topLevelMime, binary)` gates the primary value, the
  supplied top-level MIME, and the binary MIME to the family; called from both decoders. An
  internally-consistent `video` binary+primary pair is therefore still rejected under an `image`
  declaration.

Verified against the direct contract: no direct executor emits heterogeneous additional outputs — the
only multi-output source is image executors (`executeAtlasImage`, flowExecution.ts ~L1926) returning
same-family image siblings; `package`/`video`/`audio`/`text` executors return a single primary. So the
family rule models exactly what the executors can return, not a guess. Text/Boolean/JSON/package
primary behavior is unchanged (non-asset strings and the `application/*` package family still pass).

## Blocker 2 — header-fast oversized responses (`flowExecution.ts`)

`readBoundedResponseText` threw `NonRetryableError` on an over-cap `Content-Length` *before* acquiring
or cancelling `response.body`, so a large or stalled response could keep consuming the connection after
the run had already failed. Fix: on that exact early-reject path, when `response.body` exists, call
`response.body.cancel()` best-effort exactly once (`void Promise.resolve(...).catch(() => undefined)`
inside a `try/catch`) before throwing the size error. A `cancel()` that throws or rejects is swallowed
and never replaces the original size error. The streamed-over-limit path, the mid-stream/AbortError
handling, and the API-requester reader are untouched.

## Non-blocking note — `encodeBackendProxyResultEnvelope` blob-primary

The reviewer noted the encoder can copy a `blob:` primary while adding `binary`, producing an envelope
its own decoder rejects. Re-traced callers: `grep -rn encodeBackendProxyResultEnvelope src --include=*.ts`
returns only the definition and test files — **no production caller**. The function is a pure
test-only parity/round-trip utility; the live proxy path builds its wire body server-side and only ever
*decodes* here. It is therefore out of current proxy reach, and closing it in the encoder is not
warranted without a production caller (and must not weaken the decoder, which correctly rejects a
`blob:`/object-URL primary via `requireAssetUrl` + `ASSET_URL_PATTERN`). Left as-is and documented.

## Red → green evidence

Focused tests were added first and confirmed RED against clean `bba6145`
(`vitest run --configLoader runner`):

- `src/lib/backendProxyResultEnvelope.test.ts` — **13 failed / 54 passed (67)**. The 13 reds are the
  new family-contract rejections (image primary carrying video/audio; supplied MIME disagreeing with a
  same-family data URL; foreign supplied MIME on an HTTP primary; audio/video additional siblings under
  image; HTTP additional with a foreign explicit MIME; video/package primary carrying the wrong family;
  non-asset text declaring siblings; an internally-consistent video binary+primary under an image
  declaration). The 4 accept/preserve guards (video HTTP + same-family MIME, video HTTP no-MIME,
  ordered same-family image and audio siblings) already passed.
- `src/lib/flowExecutionBackendProxyEnvelope.test.ts` — **2 failed / 24 passed (26)**: image-declared
  primary carrying a foreign-family video data URL, and an image-declared audio additional, each must
  reject non-retryably through the real `executeNodeRequest` proxy path with a single fetch call.
- `src/lib/flowExecutionBoundedReader.test.ts` (new) — **2 failed / 1 passed (3)**: the body must be
  cancelled exactly once on the declared-oversize path, and a rejecting `cancel()` must not replace the
  size error (both red — clean never touches the body); the no-body case already passed.

After the fix, all green (`--configLoader runner`):

- `backendProxyResultEnvelope.test.ts` — **67 passed** (one pre-existing byte-round-trip fixture was
  realigned from `resultType: "video"` + `application/octet-stream` to `package`, the family-coherent
  home for opaque octet-stream bytes; the byte-for-byte Blob/binding proof is unchanged — the sibling
  zero-byte test already used `package` + `application/octet-stream`).
- `flowExecutionBackendProxyEnvelope.test.ts` — **26 passed**.
- `flowExecutionBoundedReader.test.ts` — **3 passed**.
- `flowExecutionApiFetch.test.ts` — **16 passed** (reader refactor consumer, unchanged behavior).
- Neighbor suites all green: `backendProxy` (AUD-012 DTO), `flowStore.runNode`, `flowStore`,
  `flowExecutionBackendProxy`, `flowExecutionVisionVerify`, `flowExecutionCancellation`,
  `flowStoreCancellation`, `flowAutoUpscaleMaterialization`, `sourceBinResume` —
  **211 passed (7 files)** + **175 passed (6 files)** across the two batches.

## Static gates

- `tsc -b --force` → exit 0 (fresh, non-incremental; app + node/test project refs).
- `eslint` on the 5 changed/added files → exit 0.
- `git diff --check` → clean.
- `npm run verify:flow-production` → exit 0 (**342 tests + audit: 63 nodes, 182 model contracts,
  178 normal model options**). No full `vite` build: the change is pure `src/lib` decoder/reader logic
  with no node-contract or build-boundary change; `tsc -b` is the authoritative type gate.

## Commits

- Entry HEAD (clean): `bba6145`.
- Corrections + permanent tests: `edc322c`.
- This evidence note: separate follow-up commit.

## Residual risk / assumptions

- `package` maps to the `application/*` family, so a package envelope may carry any application-typed
  bytes (zip, pdf, json…). This prevents cross-media (image/video/audio) smuggling — the reviewer's
  concern — while not over-constraining a generic container; no proxied node produces `package`, so
  this is defensive-only.
- HTTP(S) assets with no MIME (primary or sibling) remain accepted as same-family because they are
  unprovable and are exactly what some direct executors return (raw provider URLs). A proxy that must
  distinguish families for an HTTP asset should supply an explicit MIME, which is then family-validated.
- `encodeBackendProxyResultEnvelope` remains a test-only utility with no production caller; if a real
  encoder caller is ever added, add the smallest coherent blob/primary encoding rule + a test then.
- No server implementation ships here; this module remains the client half of the contract. A
  different provider will re-review — not self-approved.
