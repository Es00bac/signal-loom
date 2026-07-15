# 901 — Flow Node, Provider, and Vertex ADC Audit

## Summary

Completed the production audit of the main Flow workspace without modifying the concurrently owned Paper or Image workspace implementations. The result is an executable type/contract layer for every Flow node, model-aware UI/requests for every provider family, typed directional wiring, exterior Image reference handles, a terminal-free cross-platform Vertex ADC path, generated audit matrices, saved-flow regression fixtures, and a production drift gate.

## Node contracts and purpose

`src/lib/flowNodeContracts.ts` is now the canonical registry for all 63 `FlowNodeType` values. Every contract records:

- source/transform/control/sink/container/boundary/UI-only role;
- user-facing purpose and help;
- input/output handle IDs, types, sides, required/cardinality/ordering rules, and disabled reason;
- a representative upstream/downstream use case;
- failure behavior and implementation path;
- API capability for text/image/video/audio nodes.

The registry is exhaustive at compile time and runtime. `src/lib/flowNodeContracts.test.ts` fails if a node type is missing, undocumented, has duplicate handle IDs, or lacks a use case. The generated [63-row node matrix](../audits/flow-node-audit-2026-07-14.md) makes the same data reviewable without creating a second hand-maintained source.

Several previously decorative or ambiguous utility nodes now have deterministic behavior: story state, sentiment analysis, dialogue splitting, image feature extraction, fallback selection, list flattening, API fetch response handling, and declared flexible outputs. JavaScript, Python-like expressions, JSON Query, and API Requester produce `unknown` until the user explicitly declares their result type.

## Typed connections and wire UX

`src/lib/flowPortTypes.ts` defines exact atomic and container types: text, number, boolean, JSON, image, video, audio, package, control, unknown, `list<T>`, and `envelope<T>`. There is no implicit scalar/media coercion. Passthroughs, typed lists, conditional branches, portals, expanders, and function contracts resolve concrete runtime types from their graph context.

`src/lib/flowConnectionContracts.ts` validates handle existence, disabled states, connection counts, peer-type consistency, and exact compatibility. New invalid connections are rejected. Existing invalid saved edges remain in place, become visibly invalid, and appear in diagnostics with a reason and converter suggestion.

Handles and wires share type colors. Source handles are directional triangles; target handles are circles; edges animate markers toward the target. Container/control/unknown values use distinct line patterns. The custom connection preview uses the same derived presentation.

## Image reference-handle fix

All 14 conceptual reference inputs remain visible so model changes do not rearrange the node. Odd references are placed on the exterior left and even references on the exterior right. This keeps the wire/handle junction visible instead of routing wires underneath the two-row reference control grid.

The selected image model decides which handles are active. For BFL FLUX.2 Pro, references 1–8 connect and 9–14 remain visible with the exact model-limit warning. The same mechanism blocks all reference handles for a model/API route that exposes none.

## Provider and model contracts

`src/lib/providerModelContracts.ts` defines shared lifecycle, availability, API family, authentication, modalities, operations, exact parameter names/types/ranges/enums/conditions, limitations, official evidence, recommended use, representative Flow chain, and request-builder family.

Dedicated registries cover:

- 15 text contracts across Gemini/Vertex, OpenAI, and Hugging Face;
- 129 image contracts across Gemini/Vertex, OpenAI, Atlas (87 schema-derived entries), BytePlus, Hugging Face, BFL, Stability, Local/Open, and Android;
- 22 video contracts across Gemini Interactions/Veo/Vertex, Hugging Face, and Atlas;
- 16 audio contracts across Gemini TTS, ElevenLabs speech/voice-change/sound/music, and Hugging Face.

The [182-row provider/model matrix](../audits/provider-model-audit-2026-07-14.md) is generated from those registries. Current notable updates include GPT Image 2, Gemini 3.1 image families, Gemini Omni Interactions, exact Gemini-preview versus Vertex-`-001` Veo routes, Veo 3.1 families, FLUX.2 Klein/Pro/Flex/Max, Seedream 5.0 Lite/4.5/4.0, current ElevenLabs speech/STS/SFX/Music modes, and the schema-derived Atlas catalog. Shut-down preview image IDs and Veo 3.0 are retained only for saved-flow diagnosis; deprecated GPT Image 1 and Vertex Imagen 4 rows carry migration/lifecycle warnings. Vestigial Eleven TTV/turbo/v1 IDs are filtered from normal discovery.

Curated choices remain selectable even without credentials or when an account's live model list omits them. The node shows the missing configuration and disables Run. Live-only unknown IDs remain selectable through a visibly unverified contract with only the safe endpoint-level controls.

## Vertex ADC

The Electron broker now uses `google-auth-library` before falling back to Cloud SDK commands. It searches the explicit ADC/environment paths and the standard Windows, macOS, and Linux ADC locations, accepts imported authorized-user/service-account/external/impersonated JSON, refreshes/mints tokens, and lists projects through Resource Manager rather than parsing CLI output.

The Settings panel exposes file choose, paste, ADC detect, project picker/manual ID, region, quota project, and test connection. Android standalone refreshes authorized-user ADC or signs service-account assertions in-app and uses the existing direct Vertex REST implementation for text/image/video. No terminal is required for JSON import on any shipped platform. The optional desktop browser sign-in button still uses an installed Cloud SDK as a compatibility path.

The settings blob is encrypted at rest through OS `safeStorage` on desktop or non-extractable WebCrypto AES-GCM on Android/WebView. Vertex credential JSON is not part of `.sloom` project files. See the [user guide](../vertex-authentication.md) for exact setup and troubleshooting.

## Verification

- Flow production gate: 63 node contracts, 182 model contracts, 178 normal options.
- Full Vitest: 613 files / 4,686 tests passed.
- Project-reference TypeScript: clean.
- Production build: 3,239 modules transformed, exit 0.
- ESLint: 0 errors / 84 existing warnings.
- Android Gradle unit build: 86 actionable tasks, `BUILD SUCCESSFUL`.
- Headed browser: BFL selection preserved without a key, Run blocked with warning, refs 1–8 enabled and 9–14 blocked, console 0 errors/0 warnings.
- Live desktop ADC token smoke: passed from the host standard ADC file; no token/credential was logged.

Full evidence and unrun live-provider limitations are in [the release verification ledger](../audits/flow-release-verification-2026-07-14.md).

## Plans and architecture

- [Design](../superpowers/specs/2026-07-14-flow-node-provider-auth-audit-design.md)
- [Typed contracts/connections](../superpowers/plans/2026-07-14-flow-contracts-and-typed-connections.md)
- [Provider/model catalog](../superpowers/plans/2026-07-14-provider-model-contract-catalog.md)
- [Vertex credential broker](../superpowers/plans/2026-07-14-vertex-cross-platform-credential-broker.md)
- [Audit evidence/release](../superpowers/plans/2026-07-14-flow-audit-evidence-and-release-verification.md)

## Caveats

- Provider live catalog/generation calls were not made because the command environment had no provider API keys; the sync checker skipped and wrote nothing.
- Windows and macOS behavior is unit/configuration verified from Linux, not physically launched in this session.
- Android external-account/impersonated credentials require the desktop broker; authorized-user and service-account ADC work standalone.
- The 84 lint warnings are pre-existing broader-workspace warnings and remain outside this Flow audit.
