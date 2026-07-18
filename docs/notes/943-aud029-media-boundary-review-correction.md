# AUD-029 media-boundary review correction — 2026-07-18

## Superseding author correction

Fresh review of `21cb6c58` returned **CHANGES REQUIRED**. Production/tests commit `978b6c41` retains the original remote-materialization boundary while correcting the confirmed gaps. This note supersedes the prior evidence where it said established inline `data:` inputs retained a separate path and where native failure reporting could collapse an actionable status into “unavailable.”

The corrected boundary now:

- routes base64 and non-base64 `data:` inputs, `blob:` inputs, and remote inputs through the same bounded expected-MIME-family validation;
- preflights bounded base64 `data:` length before decode and rejects wrong-family inline media before any paid provider request;
- converges Flow image normalization, Gemini inline media, and OpenAI/Stability file conversion on the shared boundary;
- preserves Electron and Android native failure identity, including HTTP 403, while removing signed query/fragment values, bearer values, credentials, and token-like strings from renderer-visible summaries;
- retains renderer-first transport, Electron cancellation, Android fallback, native byte/MIME bounds, and the public provider-result API's prior undefined-on-native-failure behavior.

## Permanent old-behavior-sensitive coverage

- `remoteMediaFetch.test.ts` proves valid bounded `data:image` and `blob:` inputs remain usable, `data:text/html` and HTML blobs fail the image family gate, Android HTTP 403 remains actionable, and renderer/Electron signed details are redacted without erasing the cause/status.
- `flowExecutionImageProviders.test.ts` proves `data:text/html` source input fails before submission on representative BFL, Stability, OpenAI, and Gemini image-edit routes.
- `flowExecutionMediaBoundaryRoutes.test.ts` proves a remote source-video frame is materialized locally and its temporary object URL is revoked exactly once on success, extraction failure, and cancellation; no image-provider generation is submitted. It also proves a real remote PDF reference is materialized into Gemini inline document bytes rather than forwarding the remote URL.
- The original BFL remote image, Vertex Veo extension video, ElevenLabs audio, cancellation, native fallback, and published provider-result coverage remains active.

## Author verification

- Focused correction matrix: **3 files passed; 53 tests passed**.
- Adjacent Flow execution plus remote-media matrix: **23 files passed; 285 tests passed**.
- `npx tsc -p tsconfig.app.json --noEmit --pretty false` — passed.
- `npx tsc -p tsconfig.node.json --noEmit --pretty false` — passed.
- Touched-file ESLint — passed with zero findings.
- `npm run verify:flow-production` — **9 files passed; 375 tests passed**; static audit passed for **63 nodes, 182 model contracts, and 178 normal model options**.
- `git diff --check` and `npm run build` — passed. The production build retained only the existing runtime-URL, browser-module externalization, deprecation, and chunk-size warnings.

## Residuals and review status

The corrected boundary still trusts a truthful allowed-family `Content-Type`; it does not parse every media container's magic bytes. The default ceiling remains the established binary-resume ceiling, while callers can request a smaller bound. Native transports must receive their response before renderer-side base64 length validation, but invalid or oversized native data is rejected before decode/provider submission.

This is superseding author evidence only. Fresh independent review remains required; no approval, integration, or audit closure is claimed.
