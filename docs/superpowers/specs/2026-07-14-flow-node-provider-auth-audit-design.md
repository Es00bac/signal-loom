# Flow Node, Provider Catalog, and Vertex Authentication Production Audit Design

**Date:** 2026-07-14

**Status:** Approved design, pending written-spec review

## Summary

This project makes the Sloom Studio Flow workspace contract-driven. Every Flow node will declare its purpose, typed ports, execution behavior, examples, and help content. Every Flow-facing provider/model will declare the API capabilities that control its inputs, parameters, outputs, validation, and documentation. The Flow canvas will reject incompatible connections, color handles and edges by carried data type, and show direction without replacing the current Sloom node design.

The project also replaces the Vertex desktop dependency on terminal-managed `gcloud` authentication with a cross-platform credential broker. Windows, macOS, Linux, and Android users will be able to import supported Google credential files from inside Sloom. Google Account browser sign-in will use the system browser and PKCE. Existing `gcloud` support remains an optional compatibility fallback, not the primary path.

The active Paper and Image workspace work owned by other Codex instances is outside this implementation. Provider code shared with those workspaces may receive additive contract exports and parity tests, but their workspace components will not be redesigned.

## Goals

1. Audit all 62 values in `FLOW_NODE_TYPES` and give each node an intentional, documented, testable contract.
2. Enforce strict data compatibility when users connect nodes and again before execution.
3. Preserve Sloom's current Flow node chrome, category styling, compact controls, and dense canvas layout.
4. Color handles and edges by payload type and add clear directional markers.
5. Fix the Image node's two-column reference grid so no target handle sits on the interior seam or receives a wire from behind the node.
6. Audit every Flow-facing provider and selectable model against official documentation, current provider catalogs, and installed SDK schemas.
7. Remove genuinely vestigial model IDs from normal new-node selection, add current models and their capabilities, and preserve legacy saved workflows without silent substitution.
8. Make Vertex credentials usable from inside Sloom on every shipped operating system without requiring terminal work.
9. Produce durable audit matrices and automated completeness tests so future additions cannot bypass the contracts.

## Non-goals

- Redesigning Paper, the Image editor workspace, or the Video timeline workspace.
- Replacing the visual identity of existing Flow nodes.
- Hiding live-discovered experimental models merely because their capability contract is incomplete.
- Guessing unsupported provider features from model names and presenting those guesses as verified.
- Automatically converting incompatible values. Conversions must be explicit and visible in the graph.
- Storing provider credentials, refresh tokens, or service-account keys in `.sloom` project files.

## Current-state findings

- `FLOW_NODE_TYPES` enumerates 62 node types, but no exhaustive node-port contract exists.
- `FlowWorkspaceShell` does not provide React Flow with a graph-wide `isValidConnection` policy or a typed connection-line component.
- `flowStore.onConnect` normalizes special image/video/composition/list targets, but it does not enforce a single universal source-output to target-input type contract.
- Default and custom handles are implemented in many separate components. Their colors generally describe node families or connection state rather than a stable payload vocabulary.
- Edges use React Flow defaults. In large graphs, thin neutral wires are difficult to trace and do not clearly indicate direction.
- The Flow Image node renders reference slots in a two-column grid while every slot places its target handle on that slot's left edge. Handles in the second column therefore sit on the grid's interior seam, causing incoming wires to travel under or behind the node.
- Image models have the strongest capability registry. Text, video, audio, flexible-code, and utility nodes do not share an equivalent contract source.
- Live model refresh uses provider-specific name heuristics. The committed generated provider snapshot is empty, and provider model-list endpoints do not supply enough parameter semantics to construct accurate nodes by themselves.
- Desktop Vertex login shells out to `gcloud`. Desktop users cannot import the service-account/ADC JSON that the mobile settings surface already accepts.
- Vertex auth status can treat a selected project as sufficient evidence of desktop credentials even when no usable token has been obtained.

## Architecture and delivery boundaries

The work is split into four bounded subsystems. They share types but can be tested independently.

Delivery uses four implementation plans in dependency order: Flow contracts/visuals, provider-model contracts/catalog refresh, Vertex credential broker, then full audit evidence and release verification. Each plan has its own test and review gate; later plans consume only the published interfaces from earlier plans.

### 1. Flow contracts

A Flow contract registry is the source of truth for node purpose, ports, examples, and contract-aware help. It is exhaustive over `FlowNodeType`.

### 2. Graph compatibility and visuals

A graph service resolves dynamic port contracts, checks compatibility, diagnoses old edges, derives edge presentation, and supplies typed handles/connection feedback to React Flow.

### 3. Provider/model contracts

A provider registry owns API model capabilities and parameter semantics. Live-discovered model catalogs merge onto this verified registry without overwriting curated facts.

### 4. Vertex credential broker

A platform-specific secure credential store and token broker provide access tokens to existing Vertex REST request paths. Renderer code receives status and actions, not raw long-lived secrets.

## Flow value type system

The persisted `ResultType` vocabulary will be represented by a richer runtime contract type:

- Scalars: `text`, `number`, `boolean`, `json`.
- Media: `image`, `video`, `audio`.
- Containers: `list<T>`, `envelope<T>`, and structured `package` members.
- Execution: `control`, which never masquerades as user data.
- Escape hatch: `unknown`, used only when a node genuinely cannot declare a result.

`unknown` is not an implicit `any`. It may connect only to ports that explicitly accept unknown values, such as a generic monitor, or to an explicit conversion/validation node. Flexible nodes such as JavaScript, Python, SQL, API Fetch, and user-defined HTTP endpoints must expose an output-type selector or a schema-derived output type.

A port contract declares:

- Stable handle ID and direction.
- Human label and compact help text.
- Produced type or accepted type set.
- Required/optional state.
- Minimum and maximum connection count.
- Whether order is meaningful.
- A resolver for node-data, selected-model, or graph-dependent behavior.
- A disabled reason when the port is conceptually relevant but unsupported by the current model.

Exact type compatibility is the default. `number` does not flow to `text`; `text` does not flow to `json`; `image` does not flow to `video`. Explicit conversion nodes express intended conversions. A union-typed target is allowed when the implementation truly accepts each member. Multimodal model nodes normally use separately labelled input ports so the graph communicates how each value is used.

Container types retain their element type. `list<image>` is incompatible with `list<text>`. Heterogeneous containers resolve to `list<mixed>` or `envelope<mixed>` and only connect to targets that explicitly support mixed contents. Function-node boundary ports continue using their declared kinds and participate in the same compatibility service.

## Exhaustive node contracts

The registry must satisfy `Record<FlowNodeType, FlowNodeContract>` at compile time. Every contract contains:

- Name, category, and concise purpose.
- Input and output port resolvers.
- Execution role: source, transform, control, sink, container, boundary, or UI-only grouping.
- At least one realistic example showing upstream and downstream nodes.
- Expanded help: what it does, accepted values, output, failure modes, and example use.
- Implementation status and, for API nodes, provider/model contract references.

Contracts are allowed to state that a structural node has no data ports. Group and layout nodes therefore remain purposeful without pretending to generate values.

Dynamic nodes resolve ports deterministically:

- Text output follows configured plain-text versus JSON output.
- Image, video, and audio inputs follow the selected provider/model capabilities.
- Value and number nodes produce their selected scalar type.
- List and envelope nodes infer or declare contained types.
- Switches, comparisons, conditions, loops, gates, and breaks distinguish control from data.
- Function nodes use their existing port contracts.
- Code/data nodes use declared result types and show `unknown` until configured.
- Portal pairs preserve the transported type through their entry/exit boundary.

A model or node-setting change never silently deletes or retargets an edge. An edge whose contract becomes invalid remains visible in the invalid style, blocks execution, and explains the required correction.

## Connection and handle user experience

The approved visual baseline is the existing Sloom Flow workspace shown in the owner's July 2026 screenshots. Node bodies, category-colored headers, panels, sizing, compact reference cards, and canvas density remain intact.

The visual delta is limited to:

- Target and source handles use the carried payload color.
- Connected edges use the same payload color.
- Edges have a small arrowhead showing source-to-target direction.
- Lists and envelopes add a secondary line treatment so their container nature is not communicated by hue alone.
- Control edges use a neutral high-contrast treatment distinct from payload wires.
- Unknown edges are neutral and visibly labelled when selected.
- Invalid legacy edges are red/dashed, remain selectable, and block execution.
- An invalid drag turns the proposed connection red and shows `SOURCE_TYPE cannot connect to TARGET_TYPE` plus an explicit converter suggestion when one exists.
- Labels, icons, patterns, and shapes supplement color for accessibility.

Compatibility is checked during drag with React Flow's `isValidConnection`, again inside `flowStore.onConnect`, on project load, when dynamic node configuration changes, and immediately before execution. The store remains authoritative so programmatic/imported connections cannot bypass validation.

### Image reference-grid handle correction

The two-column reference grid keeps its current compact card layout. Interior-seam target handles are removed.

- Odd-numbered/left-column reference inputs terminate on the node's exterior left edge.
- Even-numbered/right-column reference inputs terminate on the node's exterior right edge.
- Each exterior handle has a short visible association line to its reference card and an accessible label.
- Right-side reference target handles occupy a reserved input region below the main image result/source handle, so inputs and outputs cannot overlap.
- Output handles retain a source-specific shape/direction cue so a right-edge reference input cannot be mistaken for image output.
- Collapsed handle stubs preserve the same type color and deterministic spacing.

This directly fixes wires routing behind the node while avoiding a taller single-column reference layout.

## Provider/model contract schema

Every selectable API model maps to a versioned provider/model contract with:

- Provider ID, exact model ID, display name, API family, endpoint/SDK surface, and auth method.
- Input modalities, output type, and supported operations.
- Parameter definitions with exact API field names, value types, ranges, defaults, conditional rules, and mutual exclusions.
- Size/aspect, format, duration, resolution, seed, reference-count, and operation-specific constraints.
- Verified, preview, deprecated, unavailable, or unverified status.
- Official documentation URLs, evidence notes, and last-verified date.
- Recommended use, limitations, and one example Flow chain.
- Request-builder family and any per-model overrides.

Models with identical API behavior may share a family contract, but every selectable ID must explicitly map to that family. A matrix test iterates every model option and proves that it maps either to a verified contract or to the unverified fallback.

The Flow-facing audit includes:

- Text: Google Gemini/Vertex, OpenAI, and Hugging Face.
- Image: Google Gemini/Vertex Imagen, OpenAI, Hugging Face, BFL, Stability AI, Atlas, BytePlus, local-open endpoints, and Android local acceleration.
- Video: Google Vertex/Gemini, Hugging Face, and Atlas.
- Audio: Google Gemini, ElevenLabs, and Hugging Face.

Official provider documentation is primary evidence. Installed SDK types and provider-owned OpenAPI/model metadata are secondary executable evidence. Third-party summaries are not used to assert capabilities when a primary source exists.

## Catalog lifecycle

Catalog refresh has two layers:

1. Live discovery obtains model IDs and provider-supplied metadata where supported.
2. Curated contracts provide semantic capabilities that model-list endpoints omit.

Merge rules are deterministic:

- A live-discovered model with a curated contract uses the curated semantics and current availability metadata.
- A live-discovered unknown model remains selectable, carries an `Unverified` warning, and exposes only minimal safe controls. Unsupported multimodal ports stay disabled until verified.
- A documented model not returned to the current account remains selectable when provider documentation says availability is region, tier, or rollout dependent; the UI states that account access is unconfirmed.
- A model absent from both the current official catalog and current official documentation is vestigial. It is removed from fallback/default new-node lists.
- A saved project using a vestigial ID still loads that exact ID through legacy option preservation, displays `Legacy/unavailable`, and is never silently migrated to another model.
- Deprecation never rewrites an existing project. The help panel may recommend an explicit replacement.

Provider control rendering consumes the contract schema. Unsupported controls are disabled with reasons rather than silently ignored. Execution validates the same parameter schema before building the request. Request builders must not send fields that the selected model/operation does not accept.

## Node-level provider UX and documentation

API nodes keep their current compact normal state. An expandable model summary provides:

- Verification/status badge.
- Accepted inputs and output.
- Supported operations and currently disabled operations.
- Parameter limitations that affect the current node.
- Cost information only when supported by a maintained source; unknown cost is labelled unknown.
- `Best for` guidance and an example connected workflow.
- Official documentation link and verification date.

Warnings distinguish authentication, account access, deprecation, unverified capabilities, unsupported inputs, quota, safety response, and network failure. A model remains selectable when warned unless the API contract proves the requested operation impossible.

## Vertex authentication design

### Supported targets

- Electron on Windows, macOS, and Linux.
- Capacitor Android.

### Credential paths

The in-app Vertex wizard supports:

1. Google Account browser sign-in using the system browser, Authorization Code flow, PKCE, state validation, and offline access.
2. Import of `authorized_user` ADC JSON.
3. Import of service-account JSON with an explicit key-security warning.
4. Desktop import/use of Google external-account ADC configurations through the Google authentication library when the configuration's subject-token source is supported by the host.
5. Existing `gcloud` user or ADC commands as an optional compatibility fallback.

No embedded webview is used for Google login. Desktop receives the callback on an ephemeral `127.0.0.1` loopback port. Android uses a registered app redirect handled by a native Capacitor authentication plugin and returns only the authorization result to the renderer.

Sloom production builds bundle public platform OAuth client IDs, not a confidential client secret. Development or privately branded builds without bundled IDs can import a Google Desktop/Android OAuth client configuration in the wizard. If neither source exists, credential-file import remains operational and the browser-sign-in button explains that an OAuth client must be configured rather than failing after launch.

### Secure storage

- Electron stores refresh tokens and imported credential documents in an app-private file encrypted through Electron `safeStorage` under `userData`.
- Android stores long-lived tokens/credential material behind Android Keystore through a native Capacitor plugin.
- Renderer state stores only credential source, account label, project/quota selection, expiry/status, and an opaque credential ID.
- Existing `vertexServiceAccountJson` renderer persistence migrates into the secure store and is cleared after successful migration.
- Secrets never enter project serialization, logs, diagnostics exports, clipboard operations, or catalog requests.

### Token broker and project selection

All Vertex image, text, and video paths request short-lived access tokens from one credential broker. Token refresh, expiry skew, quota-project headers, and revocation are centralized. The main process/native layer performs credential exchange; the renderer never receives refresh tokens or private keys.

Project discovery uses Google Cloud Resource Manager REST with the brokered token. Failure to list projects does not invalidate otherwise usable credentials: users may type a project ID manually, and Test Connection verifies that selected project directly. Status is derived from an actual token/credential check, not merely from a non-empty project field.

The wizard includes sign-in/import, credential source, account/service-account identity, project, region, quota project, Test Connection, refresh, logout/revoke, and remove-credential actions. Errors name the failed layer: OAuth configuration, credential parsing, token exchange, project permission, Vertex API enablement, IAM role, billing/quota, or region/model access.

## Execution and error behavior

Graph execution performs a preflight pass before any billable provider call. It reports all blocking invalid edges, missing required inputs, unsupported model operations, and invalid parameters together where possible.

Provider calls preserve the existing retry/backoff behavior only for retryable failures. Authentication, invalid request, unsupported capability, and safety-policy failures are non-retryable unless the provider explicitly marks them otherwise. Error messages identify provider, model, operation, and actionable correction without logging prompts or credentials unnecessarily.

## Audit artifacts

The implementation produces durable documentation:

- A node audit matrix covering all 62 node types: purpose, ports, output, example, implementation path, and verification result.
- A provider/model audit matrix: provider, model ID, API family, capabilities, controls, status, official evidence, last verified date, and request-builder coverage.
- A Vertex authentication guide for Google Account sign-in, ADC import, service accounts, project/IAM setup, logout, and platform-specific caveats.
- A new chronological note in `docs/notes/` summarizing implementation structure, tests, sources, and remaining live-key verification caveats.

## Testing strategy

Tests make the contracts enforceable rather than relying on a one-time manual review.

### Flow contracts

- Registry completeness over `FLOW_NODE_TYPES`.
- Every contract has purpose, example, and valid unique handle IDs.
- Table-driven compatibility tests for every scalar/media/container/control combination.
- Dynamic port tests for model changes, list/envelope inference, portals, functions, and flexible result nodes.
- Store tests prove invalid programmatic connections cannot bypass UI validation.
- Project-load tests keep invalid legacy edges visible and diagnostic-blocking.

### Visual connections

- Edge presentation tests for color, container pattern, direction marker, unknown, and invalid states.
- Handle tests prove handle color matches resolved payload type.
- Flow Image node tests prove every reference target handle is on an exterior node edge and no right-side reference target overlaps the image output region.
- Collapsed-node tests preserve typed connected stubs.
- Browser visual smoke checks use representative dense graphs without changing Sloom's existing node chrome.

### Providers/models

- Catalog merge tests cover verified, unverified-live, rollout-dependent, deprecated, vestigial, and legacy-saved models.
- Every selectable model maps to a contract/family or the explicit unverified fallback.
- Parameter rendering and request-shape tests prove unsupported fields are not sent.
- Per-family request fixtures cover all model overrides; matrix coverage proves no model is orphaned.
- Provider fetches are mocked in automated tests. Optional live catalog and generation smoke checks require owner-provided credentials and never run in the default suite.

### Vertex auth

- Credential parser tests for authorized-user, service-account, and supported external-account documents.
- PKCE, state, loopback callback, Android callback, token refresh, expiry, revoke, and logout tests.
- Secure-storage tests prove renderer snapshots/project serialization contain no credential material.
- Project-list failure/manual-project fallback and IAM/API/billing diagnostic tests.
- Electron packaging and Android manifest/plugin tests verify platform registration.

### Repository gates

- Strict TypeScript build.
- Focused Flow/provider/auth suites.
- Full Vitest suite.
- ESLint, with unrelated existing failures documented rather than silently changed.
- Production Vite build and platform source/package verification proportionate to files changed.

## Migration and compatibility

- Existing edges are re-resolved from source and target contracts on load. Valid edges gain typed presentation without project-schema churn where possible.
- Invalid existing edges are retained and diagnosed.
- Old model IDs remain attached to saved nodes and appear as legacy options for those nodes only.
- Existing Vertex gcloud settings migrate to the compatibility credential source.
- Existing stored service-account JSON migrates once into secure native storage.
- Provider/model settings are not copied into Paper/Image workspace components; shared contracts remain backward-compatible exports until those workspace owners elect to adopt them.

## Coordination constraints

- Do not edit `src/components/Paper/`, `src/features/paper/`, `src/lib/paper*`, or `src/types/paper.ts` during this work.
- Do not redesign or edit `src/components/ImageEditor/` or `src/features/imageAutomation/` except for a separately reviewed additive provider-contract import that is necessary to keep shared request code compiling.
- `src/components/Nodes/ImageNode.tsx` is the Flow Image node and is explicitly in scope.
- Check `git status` before every patch series. If another active instance changes an overlapping shared provider/auth file, reconcile deliberately and preserve both scopes.

## Acceptance criteria

The project is complete when:

1. Every `FlowNodeType` has a complete contract, help entry, and example.
2. Invalid type connections are rejected interactively and by the store/runtime.
3. Legacy invalid edges remain visible, explain themselves, and block execution.
4. Handles and edges share an accessible payload-type treatment and every edge shows direction.
5. No Image reference target handle remains on the two-column grid's interior seam.
6. Every selectable provider/model maps to a verified contract or explicit unverified fallback.
7. Current official catalogs/docs have been checked, vestigial defaults removed, current models/capabilities added, and the evidence matrix committed.
8. Unsupported controls are disabled/explained and unsupported request fields are not sent.
9. Vertex credential import works without a terminal on Windows, macOS, Linux, and Android; browser OAuth works wherever the appropriate public client configuration is bundled or imported.
10. Credential material is absent from renderer persistence and project files.
11. Focused tests, full tests, and the production build pass, with any unrelated pre-existing failure identified precisely.
12. The required `docs/notes/` handoff note and user-facing Vertex guide are complete.
