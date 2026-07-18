# AUD-028 unknown actual usage recording

Date: 2026-07-18

Author lane: independent Systems Weaver implementation

Base: `17b2f76e66fef5aa460d259cb7ccad0cde7bd7b5`

Code/test commit: `5ec060106cec132393b589c29e7d9dfcf1b3f133`

Independent-gate correction commit: `7c50c15e5234541dce6522e2fbf0bca4b2841d91`

## Status

AUD-028 is implemented and locally verified. It still requires the normal independent integration decision; this author lane does not self-approve closure.

## Invariant

Every accepted successful model execution produces exactly one project usage-history entry. When a provider omits numeric telemetry, the entry remains an actual execution with `confidence: 'unknown'`; absent tokens, rate, and cost stay absent rather than being fabricated as zero or known. Failed and cancelled executions do not create an entry. Provider retry/poll attempts for one accepted job do not create duplicate entries.

Prompt-only text nodes are local source values, not model executions, and are intentionally excluded.

## Inventory and boundary

All direct and backend-proxied provider routes converge at `executeNodeRequest`. The successful result is now normalized at that shared boundary, inside the retry operation, before it reaches Flow result history and the project-usage recorder. Existing provider telemetry remains authoritative; only a missing telemetry object receives the unknown-actual fallback.

The route inventory included:

- Hugging Face text, image, video, and audio;
- BytePlus image;
- Atlas video, including accepted-job polling retries;
- Vertex Gemini text and Vision Verify;
- OpenAI text responses without usage metadata;
- backend-proxy legacy responses without usage metadata;
- other successful text/image/video/audio/vision provider paths that share the same boundary.

Canonical provider/model identity comes from the exact runtime node/settings resolution. Image output count is retained when it is known from the accepted result. `recordProjectUsageFromExecution` also has a defensive successful-execution fallback, while remaining inert for prompt-only text.

Consumers were traced through `ExecutionResult.usage`, result-attempt history, Flow node state, actual-usage rollup, the project usage ledger/store, project save/export/restore sanitization, and the Project Library/Usage Bar summaries. The existing ledger representation already preserves absent numbers and reports them as unknown-cost entries, so no schema migration or UI compatibility change was required.

## Correctness changes

- Removed Gemini text `?? 0` token coercion. Partial provider metadata now preserves only the reported counts and leaves pricing unknown until both input and output counts exist.
- Removed the Vision Verify synthetic `100`-token fallback.
- Vertex Vision without a numerical bridge is now explicitly unknown rather than measured.
- Successful missing-telemetry results receive a shared unknown-actual object with provider/model identity and no invented numeric fields.
- Recording still occurs only after the retry wrapper resolves an accepted success, so submit/poll retries cannot create multiple ledger entries.

## Red proof

Before the production changes, the new focused assertions failed on the original code in the expected places:

- a successful image execution with missing telemetry produced one recorder call instead of the expected second unknown-actual record;
- all four Hugging Face modality results had `usage === undefined`;
- BytePlus image, Atlas video, and Vertex text returned no usage;
- OpenAI text without provider usage returned no usage;
- Vision Verify fabricated measured `100`-token telemetry;
- partial Gemini text metadata fabricated an output count and derived the wrong total.

The Atlas regression includes a `429` poll response followed by success and proves one submit, two polls, and one final recorder call with the exact owner and timestamp.

## Green verification

All network/provider behavior in these runs was mocked; no real provider call was made.

- Forced app TypeScript: `npx tsc -p tsconfig.app.json --noEmit --incremental false --pretty false` — passed.
- Forced Node TypeScript: `npx tsc -p tsconfig.node.json --noEmit --incremental false --pretty false` — passed.
- Touched-file ESLint — passed.
- Provider/telemetry/persistence/UI matrix: 18 files, 270 tests passed.
- Async retry/cancellation/media/store matrix: 6 files, 103 tests passed.
- Provider route matrix: 9 files, 150 tests passed.
- `npm run verify:flow-production`: 9 files, 374 tests passed; static audit passed with 63 nodes, 182 model contracts, and 178 normal model options.
- `npm run build` — passed (3,279 modules transformed).
- `git diff --check` — passed.

The complete `flowRunOwnership.test.ts` run has 26 passing tests and one unrelated failure: `removes a Source item when ownership goes stale during Source persistence`. The identical assertion fails on exact clean base `17b2f76e` (one stale Source item remains), proving it was not introduced by AUD-028. The two new AUD-028 failure/cancellation assertions pass.

## Residual risk

Provider APIs can still omit identity details in future response formats, but the shared boundary resolves identity from the runtime settings rather than trusting optional response metadata. Unknown entries intentionally cannot estimate cost; they preserve the financial fact of execution without claiming a number the provider did not supply.

## Superseding independent-gate corrections

The first independent final gate confirmed the core missing-telemetry correction, then reproduced
three additional shipping gaps at clean candidate `6e836278c0ddc58068bfdbd679746925392f2510`:

- proxied Vision Verify constructed an actual/unknown usage object before the shared success
  fallback, so the fallback returned early and left provider/model identity absent;
- a successful generation followed by paid Stability auto-upscale collapsed two provider calls into
  one combined record under the generation model; and
- Video Workspace narration called the shared executor outside Flow's run store but never crossed a
  project-usage recording boundary.

The correction keeps identity enrichment and unknown synthesis at explicit success boundaries.
Existing telemetry remains authoritative, while absent provider/model/image-count fields are filled
from the canonical runtime node/settings resolution. Merely calling the generic project recorder with
`usage: undefined` no longer implies success; synthesis requires `executionSucceeded: true`, and the
new async wrapper owns that transition for non-Flow callers.

A successful paid Stability post-process now returns and emits two ordered attributions: the base
generation under its exact provider/model, then an `upscale` operation under provider `stability` and
model `stable-image-upscale-fast` or `stable-image-upscale-conservative`. The existing aggregate usage
remains available to result history, but Flow skips it when the exact attributions exist, preventing a
third/double-counted ledger entry. Emission occurs only after the whole successful retry boundary;
failed, misconfigured, or cancelled post-processing creates no phantom upscale record.

Video Workspace narration now uses `executeAndRecordProjectUsage` with `workspace: 'editor'`. The
provider promise must resolve before one record is written, and the record is written before result
validation or Source materialization. Provider failure and cancellation never cross the boundary.

### Correction red proof

Before the production correction, the new assertions produced eight expected failures across proxy
identity, direct/proxy Stability attribution, retry exact-once emission, generic-recorder hardening,
and Video narration wiring. The no-phantom failure/cancellation guards already passed and remain as
permanent protection. One unrelated stale Source-item rollback assertion also failed exactly as it
does on the clean sibling baseline and was not changed.

### Correction green verification

- Focused corrected boundary: **5 files, 64 tests passed**.
- Usage/provider/retry/Video/Source adjacency: **13 files, 204 tests passed**.
- Immutable-owner success/failure/cancel selection: **4 tests passed**.
- Adjacent Flow store/cancellation/usage: **3 files, 62 tests passed**.
- Forced app and Node TypeScript: **passed**.
- ESLint on all nine changed production/test files: **zero errors** (11 pre-existing
  `VideoWorkspace.tsx` warnings).
- `npm run verify:flow-production`: **9 files, 374 tests passed**; static audit passed with
  **63 nodes, 182 model contracts, and 178 normal model options**.
- `npm run build`: **passed**, 3,279 modules transformed.
- `git diff --check`: **clean**.

This correction remains an author candidate. It requires a fresh independent final gate and is not
self-approved or integrated by this lane.
