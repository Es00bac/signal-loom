# AUD-029 downstream media materialization — 2026-07-18

## Author correction

Production/tests commit `21cb6c58` centralizes upstream media materialization before a Flow result is sent to another provider. Renderer fetch remains the first transport, but every non-success response, transport failure, invalid media MIME, or oversized body is rejected and eligible for the existing Electron/Android native fallback. The resulting bytes—not a raw provider URL—cross the downstream provider boundary.

The shared boundary:

- accepts an explicit image, video, audio, or document identity and a bounded byte limit;
- checks renderer HTTP status, declared length, actual length, and strict media MIME;
- validates native base64 length and MIME before decoding it in the renderer;
- races renderer reads and native downloads with cancellation, including the existing Electron cancellation callback;
- reports a useful query-free URL identity so temporary provider parameters are not copied into errors.

Flow image/reference conversion, Gemini/Veo inline image and video inputs, BFL/Stability/OpenAI file inputs, ElevenLabs voice-change audio, and image-node video-frame extraction now use the boundary. Existing inline `data:` inputs retain their established path.

## Permanent regression coverage

- `remoteMediaFetch.test.ts` covers renderer success, Electron fallback, Android non-success, renderer non-success, expired HTML returned where video is expected, wrong native MIME, declared and actual byte bounds, cancellation without native fallback, and ignored late completion.
- `flowExecutionImageProviders.test.ts` proves a BFL edit source that renderer fetch cannot read is materialized through the Electron fallback and submitted as inline image bytes, never as the raw URL.
- `flowExecutionVertexVideo.test.ts` proves a remote Veo extension video is materialized into `bytesBase64Encoded` before the Vertex bridge request.
- `flowExecutionElevenLabsAudio.test.ts` proves a remote voice-change source is materialized as an audio file before the ElevenLabs request.

## Author verification

- Focused media and representative routes: **4 files passed; 72 tests passed**.
- Adjacent Flow execution plus remote-media matrix: **22 files passed; 275 tests passed**.
- `npx tsc -p tsconfig.app.json --noEmit --incremental false` — passed.
- `npx tsc -p tsconfig.node.json --noEmit --incremental false` — passed.
- Touched-file ESLint — passed with zero findings.
- `npm run verify:flow-production` — **9 files passed; 375 tests passed**; static audit passed for **63 nodes, 182 model contracts, and 178 normal model options**.
- `git diff --check`, staged diff check, and `CI=1 npm run build` — passed. The production build retained only the existing runtime-URL, browser-module externalization, deprecation, and chunk-size warnings.

## Residuals and review status

The boundary trusts a truthful media `Content-Type`; it does not parse every image/audio/video container for magic-byte identity. The default ceiling remains the repository's established 512 MiB binary-resume ceiling, while callers can request a smaller bound. Native transports must receive a response before the renderer can inspect its byte count, but oversized native base64 is rejected before renderer decoding or provider submission.

This is author evidence only. Fresh independent review remains required; no approval, integration, or audit closure is claimed.
