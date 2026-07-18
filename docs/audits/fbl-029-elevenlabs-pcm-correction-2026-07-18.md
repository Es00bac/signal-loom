# FBL-029 — ElevenLabs PCM response correction

Date: 2026-07-18  
Role: author (not independent approver or integrator)  
Base: `b0597e23508014c7536a540fcbda34b0cf39db4b`  
Production/tests commit: `44099a321ce5991ecdf2fc280abf004ca292ae50`

## Audit contract

The four direct ElevenLabs audio branches previously passed every successful response blob straight to the result URL. When `pcm_44100` was requested, the provider bytes were headerless signed PCM, but downstream code inferred `audio/wav`. Those bytes were therefore stored and reused as a WAV file even though they had no RIFF/WAVE container.

This correction centralizes response materialization for:

- speech (`/v1/text-to-speech/{voice_id}`)
- sound effects (`/v1/sound-generation`)
- music (`/v1/music`)
- voice change (`/v1/speech-to-speech/{voice_id}`)

No real provider request was made during implementation or verification.

## Implemented behavior

- Recognized ElevenLabs `pcm_<rate>` output is treated as mono signed 16-bit little-endian PCM and wrapped in a standard 44-byte RIFF/WAVE header.
- The current selectable `pcm_44100` contract is materialized with 44,100 Hz sample rate, 88,200 byte rate, 2-byte block alignment, 16-bit sample depth, and an exact data length.
- The wrapper retains every provider payload byte unchanged after the header.
- MP3 output retains its payload bytes and is published as `audio/mpeg` / `.mp3`, with the requested sample rate and bitrate recorded in output metadata.
- Unknown future encoded formats are not guessed or wrapped. Their provider MIME is retained, with `application/octet-stream` as the honest fallback.
- Empty audio and odd-byte PCM (a truncated 16-bit sample) fail with `NonRetryableError`, so a successful paid request is not repeated just because its terminal payload is malformed.
- Response blob reads and byte reads race the run abort signal. A cancelled run cannot publish a stale object URL.
- The exact materialized blob, MIME, extension, and audio metadata are returned together for downstream Source Library persistence and reuse.

## Permanent regression coverage

`src/lib/flowExecutionElevenLabsAudio.test.ts` now proves:

- exact RIFF, WAVE, `fmt `, and `data` fields and payload offset/length for every sibling branch;
- PCM metadata: `pcm_s16le`, 44,100 Hz, mono, 16-bit, little-endian;
- MP3 byte preservation and MIME/extension truth for every sibling branch;
- unknown-format byte and provider-MIME preservation without invented WAV identity;
- empty and truncated PCM fail closed and are not retried;
- a transient transport failure retries once, after which the successful response is materialized exactly once;
- cancellation during response materialization produces `AbortError` and no object URL;
- the returned blob is the same blob handed to downstream persistence.

The new tests were old-code-sensitive: before the production change, the focused file reported **13 failures / 5 passes**. The failures included all four raw-PCM branches, all four MP3 MIME contracts, unknown-format metadata, empty/truncated response rejection, retry materialization, and cancellation.

## Verification at production/tests commit

| Gate | Result |
| --- | --- |
| Focused ElevenLabs execution tests | 1 file, 18 tests passed |
| Adjacent execution/cancellation/audio/source/usage/ledger tests | 9 files, 161 tests passed |
| Flow production verifier | 9 files, 374 tests passed; 63 nodes, 182 model contracts, 178 normal model options |
| App TypeScript | `npx tsc -p tsconfig.app.json --noEmit` passed |
| Node TypeScript | `npx tsc -p tsconfig.node.json --noEmit` passed |
| ESLint | 0 errors; 84 existing repository warnings |
| Diff check | `git diff --check` passed |
| Production build | `tsc -b && vite build` passed; 3,282 modules transformed |

Focused and adjacent command:

```text
npx vitest run src/lib/flowExecutionElevenLabsAudio.test.ts \
  src/lib/flowExecutionCancellation.test.ts \
  src/lib/flowExecutionMediaCancellation.test.ts \
  src/lib/flowExecutionAsyncRetry.test.ts \
  src/lib/sourceBinResume.test.ts \
  src/lib/sourceBinPersistence.test.ts \
  src/lib/projectUsageRecording.test.ts \
  src/lib/projectUsageLedger.test.ts \
  src/lib/modelContracts/audioModelContracts.test.ts
```

## Provider evidence

- [ElevenLabs Create speech API](https://elevenlabs.io/docs/api-reference/text-to-speech/convert)
- [ElevenLabs Voice Changer API](https://elevenlabs.io/docs/api-reference/speech-to-speech/convert)
- [ElevenLabs sound-effect generation API](https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert)
- [ElevenLabs Compose music API](https://elevenlabs.io/docs/api-reference/music/compose)
- [ElevenLabs PCM format reference](https://elevenlabs.io/docs/eleven-api/guides/how-to/speech-engine/livekit-integration) — documents signed 16-bit little-endian PCM and the supported sample rates; the listed PCM path is mono.

## Handoff

This author lane does not self-approve or integrate. An independent gate should review the exact production/tests commit, rerun the focused/adjacent contract, and confirm the evidence commit changes documentation only.
