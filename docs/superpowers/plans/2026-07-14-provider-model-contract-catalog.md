# Provider and Model Contract Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan.

**Goal:** Verify every Flow-facing provider/model against current official APIs, merge live discovery with curated semantics, remove vestigial defaults, add current models, preserve saved legacy IDs, and drive node controls and request validation from one model contract.

**Architecture:** Introduce versioned provider/model contracts shared by text, image, video, and audio nodes. Curated facts own capabilities and parameter constraints; live provider catalogs own account visibility. A deterministic merge produces selectable options with lifecycle state. Existing image capability definitions adapt into the shared schema instead of being discarded.

**Tech Stack:** TypeScript, Zustand, provider REST APIs, installed SDKs, Vitest, Node sync scripts.

## Global Constraints

- Official provider documentation is primary evidence; provider-owned model endpoints/OpenAPI/SDK types are secondary.
- Never infer a verified capability from a model name alone.
- Live unknown models stay selectable as `unverified` with only safe controls.
- Unsupported controls stay visible but disabled with an explanation.
- Saved legacy IDs stay attached to the node and never silently substitute.
- Do not redesign or edit Paper/Image workspace components.
- Last verified date for this audit: `2026-07-14`.

---

### Task 1: Add the shared provider/model contract schema

**Files:**
- Create: `src/lib/providerModelContracts.ts`
- Test: `src/lib/providerModelContracts.test.ts`
- Modify: `src/types/flow.ts`

**Step 1: Write schema and invariant tests**

Assert valid lifecycle states, exact parameter types/ranges/enums, unique provider+model keys, non-empty official sources for verified models, operation/output consistency, and the explicit unverified fallback.

**Step 2: Implement the schema**

Define `ProviderModelContract`, `ModelParameterContract`, `ModelLifecycle`, `ModelAvailability`, `ApiFamily`, and `ModelCatalogEntry`. Required fields include provider/model/display name, endpoint family, auth, modalities, output, operations, parameter API names and conditional rules, lifecycle, official evidence, limitations, recommended use, Flow example, and request-builder family.

Expose `getProviderModelContract`, `getModelUiControls`, `validateModelRequest`, and `createUnverifiedModelContract`.

**Step 3: Run tests and commit**

Run: `npm test -- --run src/lib/providerModelContracts.test.ts`

```bash
git add src/lib/providerModelContracts.ts src/lib/providerModelContracts.test.ts src/types/flow.ts
git commit -m "feat(providers): add shared model contracts"
```

### Task 2: Encode current official text contracts

**Files:**
- Create: `src/lib/modelContracts/textModelContracts.ts`
- Test: `src/lib/modelContracts/textModelContracts.test.ts`
- Modify: `src/lib/providerCatalog.ts`

**Step 1: Add failing coverage for every fallback text option**

Assert every Google Gemini/Vertex, OpenAI, and Hugging Face fallback option maps to a verified or explicitly unverified contract.

**Step 2: Update current curated defaults and lifecycles**

- OpenAI: make current official GPT-5.6 family options the normal defaults; mark obsolete GPT-4.1/GPT-4o-era defaults legacy/deprecated according to official catalog, while preserving saved values.
- Google: encode current Gemini 3.5/3.1/2.5 text aliases actually documented by Gemini/Vertex and mark preview/rollout status exactly.
- Hugging Face: use task/provider metadata as account availability; curated model cards only when a fallback is asserted.

Official sources:

- `https://developers.openai.com/api/docs/models`
- `https://developers.openai.com/api/docs/models/all`
- `https://ai.google.dev/gemini-api/docs/models`
- `https://ai.google.dev/api/models`
- `https://huggingface.co/docs/inference-providers/en/index`

**Step 3: Run tests and commit**

Run: `npm test -- --run src/lib/modelContracts/textModelContracts.test.ts src/lib/providerCatalog.test.ts`

```bash
git add src/lib/modelContracts/textModelContracts.ts src/lib/modelContracts/textModelContracts.test.ts src/lib/providerCatalog.ts
git commit -m "feat(providers): refresh text model contracts"
```

### Task 3: Adapt and refresh image contracts

**Files:**
- Modify: `src/lib/imageProviderCapabilities.ts`
- Modify: `src/lib/imageProviderCapabilities.test.ts`
- Modify: `src/lib/imageModelInference.ts`
- Modify: `src/lib/imageProviderParity.test.ts`
- Create: `src/lib/modelContracts/imageModelContractAdapter.ts`
- Test: `src/lib/modelContracts/imageModelContractAdapter.test.ts`

**Step 1: Add matrix tests before changing options**

Iterate every image fallback and generated Atlas option. Assert exact operation/controls/request-builder mapping or unverified fallback. Assert inference never labels guessed facts `verified`.

**Step 2: Encode catalog changes from official sources**

- OpenAI: keep `gpt-image-2`; remove `gpt-image-1`/1.5 from normal new-node options when official catalog marks them deprecated, but preserve saved legacy IDs.
- Gemini: add `gemini-3.1-flash-lite-image`; retain current 3.1 Flash Image, 3 Pro Image, and 2.5 Flash Image with exact editing/reference/resolution semantics. Mark Imagen models deprecated with the official August 17, 2026 shutdown and show migration guidance.
- BytePlus: add `seedream-5-0-lite-260128`/API alias used by ModelArk, formats, reference/edit constraints, and current Seedream 4.x lifecycle.
- BFL: verify FLUX.2 `[klein]`, pro, flex, max, and preview/GA endpoint IDs; keep reference limits/custom dimensions/exact color only where official docs assert them.
- Stability: map endpoint operations rather than pretending endpoint names are interchangeable models; preserve Core/Ultra and edit endpoints with exact multipart fields.
- Atlas: regenerate options from official model library/native discovery; each discovered model maps to generated semantics or unverified fallback.
- Hugging Face/local/Android: label runtime/account-discovered models accurately and do not promise controls not expressed by the selected provider route.

Official sources include:

- `https://developers.openai.com/api/docs/models`
- `https://ai.google.dev/gemini-api/docs/image-generation`
- `https://docs.cloud.google.com/vertex-ai/generative-ai/docs/release-notes`
- `https://docs.bfl.ai/flux_2/flux2_overview`
- `https://platform.stability.ai/docs/api-reference`
- `https://docs.byteplus.com/en/docs/ModelArk/1541523`
- `https://www.atlascloud.ai/docs/models/overview`
- `https://huggingface.co/docs/inference-providers/en/index`

**Step 3: Make unknown controls safe**

`getImageModelDefinition` may still infer an unverified option for live models, but it must set lifecycle/capability confidence to unverified and expose only prompt + output controls proven by the endpoint family. Keep the model selectable.

**Step 4: Run tests and commit**

Run: `npm test -- --run src/lib/imageProviderCapabilities.test.ts src/lib/imageProviderParity.test.ts src/lib/modelContracts/imageModelContractAdapter.test.ts`

```bash
git add src/lib/imageProviderCapabilities.ts src/lib/imageProviderCapabilities.test.ts src/lib/imageModelInference.ts src/lib/imageProviderParity.test.ts src/lib/modelContracts/imageModelContractAdapter.ts src/lib/modelContracts/imageModelContractAdapter.test.ts
git commit -m "feat(providers): refresh image model capabilities"
```

### Task 4: Encode current video contracts

**Files:**
- Create: `src/lib/modelContracts/videoModelContracts.ts`
- Test: `src/lib/modelContracts/videoModelContracts.test.ts`
- Modify: `src/lib/videoModelSupport.ts`
- Modify: `src/lib/videoModelSupport.test.ts`
- Modify: `src/components/Nodes/VideoNode.tsx` or the discovered Flow video-node path

**Step 1: Test all selectable video IDs and operations**

Cover text-to-video, image-to-video, first/last frame interpolation, reference image guidance, extension, audio generation, aspect, duration, resolution, and unsupported-port reasons.

**Step 2: Refresh Google contracts**

Distinguish Veo 3.1 preview IDs from GA aliases actually accepted by Gemini versus Vertex. Encode Veo 3/3 Fast and Veo 2 only where currently supported. Remove duplicated/obsolete aliases from normal selection while preserving saved values. Do not assign Omni capabilities without official endpoint evidence.

**Step 3: Refresh Hugging Face and Atlas**

Use Inference Provider task metadata for availability and curated contracts for selected fallback models. Refresh Atlas native video IDs from the official library/generated source; unknown live models remain unverified and text-only until their model page supplies semantics.

**Step 4: Drive node ports/controls from contracts**

The Video node must keep models selectable, visibly warn on preview/deprecated/unverified states, and disable unsupported frame/reference/extension controls with reasons. Execution and graph contracts consume the same capability object.

**Step 5: Run tests and commit**

Run: `npm test -- --run src/lib/modelContracts/videoModelContracts.test.ts src/lib/videoModelSupport.test.ts src/components/Nodes/VideoNode.test.tsx`

```bash
git add src/lib/modelContracts/videoModelContracts.ts src/lib/modelContracts/videoModelContracts.test.ts src/lib/videoModelSupport.ts src/lib/videoModelSupport.test.ts src/components/Nodes/VideoNode.tsx src/components/Nodes/VideoNode.test.tsx
git commit -m "feat(providers): refresh video model contracts"
```

### Task 5: Encode current audio contracts

**Files:**
- Create: `src/lib/modelContracts/audioModelContracts.ts`
- Test: `src/lib/modelContracts/audioModelContracts.test.ts`
- Modify: `src/components/Nodes/AudioNode.tsx`
- Modify: `src/components/Nodes/AudioNode.modelFilter.test.ts`
- Modify: `src/lib/providerCatalog.ts`

**Step 1: Test speech/sound-effect/voice-change filtering**

Every option must declare supported audio operation, languages/character limits where exposed, style/speaker-boost support, output formats, and lifecycle.

**Step 2: Refresh ElevenLabs**

Keep `eleven_v3`, `eleven_multilingual_v2`, and `eleven_flash_v2_5` for TTS; use `eleven_text_to_sound_v2` and `eleven_multilingual_sts_v2` for their operations. Remove `scribe_v1`, `eleven_monolingual_v1`, and `eleven_multilingual_v1` from normal selection because their July 9, 2026 removal has passed. Prefer Flash over Turbo aliases while preserving saved Turbo IDs as deprecated.

Official sources:

- `https://elevenlabs.io/docs/overview/models`
- `https://elevenlabs.io/docs/api-reference/models/list`
- `https://elevenlabs.io/docs/api-reference/text-to-speech/convert`

**Step 3: Refresh Gemini/Hugging Face audio**

Verify current Gemini TTS IDs/preview states and exact output/config fields. Treat Hugging Face task/provider availability separately from curated model capabilities.

**Step 4: Run tests and commit**

Run: `npm test -- --run src/lib/modelContracts/audioModelContracts.test.ts src/components/Nodes/AudioNode.modelFilter.test.ts src/lib/providerCatalog.test.ts`

```bash
git add src/lib/modelContracts/audioModelContracts.ts src/lib/modelContracts/audioModelContracts.test.ts src/components/Nodes/AudioNode.tsx src/components/Nodes/AudioNode.modelFilter.test.ts src/lib/providerCatalog.ts
git commit -m "feat(providers): refresh audio model contracts"
```

### Task 6: Implement lifecycle-aware live catalog merging

**Files:**
- Create: `src/lib/modelCatalogMerge.ts`
- Test: `src/lib/modelCatalogMerge.test.ts`
- Modify: `src/store/catalogStore.ts`
- Modify: `src/store/catalogStore.test.ts`
- Modify: `src/types/flow.ts`

**Step 1: Write the six required merge-state tests**

Cover verified-live, unverified-live, documented rollout-dependent, deprecated, vestigial, and legacy-saved. Assert ordering/badges/warnings are deterministic and no selected value disappears.

**Step 2: Implement merge semantics**

Replace bare `SelectOption` generation internally with `ModelCatalogEntry`; convert to presentational options at the UI boundary. Live provider records may update availability/labels but cannot overwrite curated parameter facts. Add `includeLegacySelectedModel(entries, selectedId)` for node-local preservation.

**Step 3: Replace name-only classification where metadata exists**

Gemini uses `supportedGenerationMethods`; ElevenLabs uses `can_do_*`; Hugging Face uses pipeline task/provider; Atlas uses native model-page/generated records; OpenAI-compatible unknowns remain text unless the provider contract/discovery endpoint proves image/video/audio.

**Step 4: Run tests and commit**

Run: `npm test -- --run src/lib/modelCatalogMerge.test.ts src/store/catalogStore.test.ts`

```bash
git add src/lib/modelCatalogMerge.ts src/lib/modelCatalogMerge.test.ts src/store/catalogStore.ts src/store/catalogStore.test.ts src/types/flow.ts
git commit -m "feat(providers): merge live and curated catalogs safely"
```

### Task 7: Make controls and request builders consume contracts

**Files:**
- Modify: `src/components/Nodes/TextNode.tsx`
- Modify: `src/components/Nodes/ImageNode.tsx`
- Modify: `src/components/Nodes/VideoNode.tsx`
- Modify: `src/components/Nodes/AudioNode.tsx`
- Modify: `src/lib/flowExecution.ts`
- Modify: provider request helpers under `src/lib/`
- Test: existing provider execution tests plus new `src/lib/providerModelRequestMatrix.test.ts`

**Step 1: Write one request fixture per API family**

Assert unsupported fields are omitted, required/conditional fields are caught before fetch, exact model IDs survive, and errors name provider/model/operation. Add a matrix assertion that each selectable curated model has a request-builder family.

**Step 2: Render contract-aware model summaries and controls**

Keep normal nodes compact. Add an expandable summary with status, modalities, operations, limits, recommended use, official link, and verification date. Keep every option selectable; controls/ports unsupported by the chosen model remain visible and disabled with a reason.

**Step 3: Validate before network calls**

At each provider branch, call `validateModelRequest`; build only supported fields. Authentication, invalid-request, unsupported-operation, and safety failures are non-retryable unless provider metadata states otherwise.

**Step 4: Run provider execution tests and commit**

Run: `npm test -- --run src/lib/providerModelRequestMatrix.test.ts src/lib/flowExecutionImageProviders.test.ts src/lib/flowExecutionElevenLabsAudio.test.ts src/lib/flowExecutionVertexText.test.ts src/lib/flowExecutionVertexImage.test.ts src/lib/flowExecutionVertexVideo.test.ts`

```bash
git add src/components/Nodes src/lib/flowExecution.ts src/lib/providerModelRequestMatrix.test.ts src/lib
git commit -m "feat(providers): drive node controls from model contracts"
```

### Task 8: Expand the catalog sync and drift gate

**Files:**
- Modify: `scripts/sync-provider-catalog.mjs`
- Modify: `scripts/sync-provider-catalog.test.mjs`
- Modify: `src/data/providerModelCatalog.generated.json`
- Modify: generated Atlas model files only through their existing generator

**Step 1: Test normalized snapshots and redaction**

Cover pagination, provider errors, lifecycle diff, metadata retention, deterministic ordering, and proof that keys/responses containing secrets are not written.

**Step 2: Expand discovery**

Support official list endpoints where available for Gemini, OpenAI, Atlas, ElevenLabs, Hugging Face account/provider metadata, and any provider with a documented model list. For BFL/Stability/BytePlus curated endpoint families without a complete list API, record `curated-only` rather than scraping pages.

**Step 3: Generate the snapshot only with configured owner keys**

Run: `npm run sync:catalog`

If keys are unavailable, keep the deterministic test fixture and document that live availability was not claimed; do not fabricate a timestamped live snapshot.

**Step 4: Run tests and commit**

Run: `node --test scripts/sync-provider-catalog.test.mjs && npm test -- --run src/store/catalogStore.test.ts`

```bash
git add scripts/sync-provider-catalog.mjs scripts/sync-provider-catalog.test.mjs src/data/providerModelCatalog.generated.json
git commit -m "chore(providers): add catalog drift verification"
```

### Task 9: Plan verification gate

Run:

```bash
npm test -- --run src/lib/providerCatalog.test.ts src/store/catalogStore.test.ts src/lib/providerModelContracts.test.ts src/lib/modelCatalogMerge.test.ts src/lib/imageProviderCapabilities.test.ts src/lib/imageProviderParity.test.ts src/lib/videoModelSupport.test.ts src/components/Nodes/AudioNode.modelFilter.test.ts src/lib/providerModelRequestMatrix.test.ts
node --test scripts/sync-provider-catalog.test.mjs
npx tsc -b --pretty false
```

Expected: all selectable models map to verified semantics or the explicit unverified fallback; all normal defaults are current and non-vestigial.
