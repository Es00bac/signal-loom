# Signaloom Bilingual Magazine Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore descriptive Image reference inputs, generate a traceable Atlas Cloud reference chain in Flow, and produce verified English and Japanese two-page Paper magazine `.slppr` files.

**Architecture:** The Flow correction stays confined to port contracts and image-source resolution, with regression tests proving that one reference slot can carry an image plus Text/JSON guidance. Atlas generation then happens in the installed Flow workspace using the existing in-app credential and official Sloom Studio logo. A deterministic artifact builder packages the two localized Paper documents and their final Flow-generated hero/ad images as validated version-2 `.slppr` containers.

**Tech Stack:** React Flow contracts, TypeScript, Vitest, Signal Loom Flow, Atlas Cloud image models, Signal Loom Paper document schema, `fflate`, SHA-256 content-addressed Paper assets.

## Global Constraints

- Do not print, copy into source, or embed the configured Atlas API key.
- Use `/home/cabewse/work_SPaC3/flow/docs/release/website/sloom-studio/assets/graphics/icon-512.png` as the official Sloom Studio logo source.
- Preserve separate Flow outputs for the hero, T-shirt reference, model reference, environment reference, and final model-in-environment composite.
- Page two's article content must remain above the midpoint; the Sloan Studio demo ad occupies the lower half.
- Include `CONCEPT DEMO — NOT A REAL PRODUCT — NOT FOR SALE` in English and `コンセプトデモ／実在しない商品です／非売品` in Japanese.
- Do not add pricing, purchase links, QR codes, sizes, or availability claims.
- Final paths are `/home/cabewse/Documents/Loom Workspace/Signaloom-Story-English-Magazine.slppr` and `/home/cabewse/Documents/Loom Workspace/Signaloom-Story-Japanese-Magazine.slppr`.

---

### Task 1: Restore Text/JSON Image Reference Guidance

**Files:**
- Modify: `src/lib/flowNodeContracts.test.ts`
- Modify: `src/lib/flowConnectionContracts.test.ts`
- Modify: `src/lib/imageEditConnections.test.ts`
- Modify: `src/lib/flowSignals.test.ts`
- Modify: `src/lib/flowNodeContracts.ts`
- Modify: `src/lib/imageEditConnections.ts`

**Interfaces:**
- Consumes: `resolveFlowNodePorts`, `validateFlowConnection`, `collectPromptSignalForNode`, and `resolveConnectedImageReferenceAsset`.
- Produces: Image reference inputs accepting image/package/envelope plus direct text and JSON guidance, with multiple connections per reference slot and image lookup independent of edge order.

- [ ] **Step 1: Add failing port and connection tests**

Add expectations that `image-reference-1` includes `{ kind: 'text' }` and `{ kind: 'json' }`, has `maxConnections: null`, and accepts a Text edge after an Image edge already occupies the same handle.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npx vitest run src/lib/flowNodeContracts.test.ts src/lib/flowConnectionContracts.test.ts`

Expected: failures show that Text/JSON are absent and the reference handle still has a one-connection maximum.

- [ ] **Step 3: Add the edge-order image-resolution regression**

Build an `imageEditConnections` fixture whose first reference edge comes from a Text node and second edge comes from a generated Image node. Assert that the slot remains connected as an image reference and resolves the Image URL.

- [ ] **Step 4: Run the resolver test and verify RED**

Run: `npx vitest run src/lib/imageEditConnections.test.ts`

Expected: the resolver returns `undefined` because it stops at the first textual edge.

- [ ] **Step 5: Add prompt aggregation coverage**

Connect a Text node and a JSON Value node to the same image-reference handle alongside an Image node. Assert that `collectPromptSignalForNode` contains both textual descriptions and excludes the image URL.

- [ ] **Step 6: Implement the minimal contract and resolver fix**

Extend the Image reference accepted type list with `textType` and `jsonType`, set each Image reference input to `maxConnections: null`, and change `findConnectedImageInputSource` to scan matching edges until it finds an image-capable effective source instead of examining only the first edge.

- [ ] **Step 7: Verify GREEN and the broader Flow contract slice**

Run: `npx vitest run src/lib/flowNodeContracts.test.ts src/lib/flowConnectionContracts.test.ts src/lib/imageEditConnections.test.ts src/lib/flowSignals.test.ts src/components/Nodes/ImageNode.test.tsx src/store/flowStore.test.ts`

Expected: all focused tests pass with no failures.

- [ ] **Step 8: Commit the regression fix**

Run: `git add src/lib/flowNodeContracts.ts src/lib/flowNodeContracts.test.ts src/lib/flowConnectionContracts.test.ts src/lib/imageEditConnections.ts src/lib/imageEditConnections.test.ts src/lib/flowSignals.test.ts docs/TASK_LIST.md && git commit -m "fix(flow): restore descriptive image references"`

### Task 2: Generate the Atlas Reference Chain in Flow

**Files:**
- Read: `docs/release/website/sloom-studio/assets/graphics/icon-512.png`
- Create: `/home/cabewse/Documents/Loom Workspace/Signaloom-Magazine-Flow-Assets/hero.png`
- Create: `/home/cabewse/Documents/Loom Workspace/Signaloom-Magazine-Flow-Assets/tshirt-reference.png`
- Create: `/home/cabewse/Documents/Loom Workspace/Signaloom-Magazine-Flow-Assets/model-reference.png`
- Create: `/home/cabewse/Documents/Loom Workspace/Signaloom-Magazine-Flow-Assets/environment-reference.png`
- Create: `/home/cabewse/Documents/Loom Workspace/Signaloom-Magazine-Flow-Assets/ad-composite.png`
- Create: `/home/cabewse/Documents/Loom Workspace/Signaloom-Magazine-Flow-Assets.sloom`

**Interfaces:**
- Consumes: configured Atlas Cloud credential in the installed app, official logo PNG, restored Image reference ports.
- Produces: five concrete Flow outputs plus a saved graph proving the reference chain.

- [ ] **Step 1: Open Flow and confirm Atlas without exposing the key**

Use the installed Sloom Studio app. Confirm only that Atlas Cloud appears configured; do not reveal the credential field.

- [ ] **Step 2: Import the official logo as a Flow Image source**

Import `icon-512.png` as `Sloom Studio Logo Reference` and preserve it in Source Library.

- [ ] **Step 3: Generate and inspect the editorial hero**

Use Atlas text-to-image with the approved dark woven-signal prompt. Save the accepted output as `hero.png`.

- [ ] **Step 4: Generate and inspect the T-shirt reference**

Use an Atlas reference-to-image node with the official logo in Reference 1 and connected descriptive Text guidance on that same slot. Save a clear product reference as `tshirt-reference.png`.

- [ ] **Step 5: Generate the model and environment references separately**

Create a neutral full-body editorial model reference and an empty cobalt/graphite architectural studio. Save them as `model-reference.png` and `environment-reference.png`.

- [ ] **Step 6: Generate the final ad composite**

Use a multi-reference Atlas image node with the T-shirt, model, and environment outputs on separate reference slots, each paired with connected Text/JSON role descriptions. Generate a natural standing or walking pose, inspect logo and identity continuity, and save the accepted output as `ad-composite.png`.

- [ ] **Step 7: Save the Flow evidence project**

Save the graph as `Signaloom-Magazine-Flow-Assets.sloom` and verify the five outputs remain in Flow/Source Library.

### Task 3: Build the Two Localized Paper Containers

**Files:**
- Create: `scripts/create-signaloom-magazine-demo.mjs`
- Create: `scripts/create-signaloom-magazine-demo.test.ts`
- Create: `/home/cabewse/Documents/Loom Workspace/Signaloom-Story-English-Magazine.slppr`
- Create: `/home/cabewse/Documents/Loom Workspace/Signaloom-Story-Japanese-Magazine.slppr`

**Interfaces:**
- Consumes: `hero.png`, `ad-composite.png`, Paper v2 manifest schema, and content-addressed asset rules.
- Produces: `buildEnglishMagazine(heroRecord, adRecord)` and `buildJapaneseMagazine(heroRecord, adRecord)` document objects plus two validated containers.

- [ ] **Step 1: Write failing structural artifact tests**

Test exact two-page count, A4 size, spread view, named styles/swatches, embedded hero/ad references, page-two midpoint separation, English/Japanese disclaimers, threaded article frames, and Japanese `vertical-rl` plus `rtlBinding: true` metadata.

- [ ] **Step 2: Run the artifact test and verify RED**

Run: `npx vitest run scripts/create-signaloom-magazine-demo.test.ts`

Expected: module-not-found or missing exported builder failures.

- [ ] **Step 3: Implement the deterministic document builders**

Create shared frame/style/swatch helpers and language-specific page builders. Use professional English and localized Japanese story copy, exact midpoint zoning, rich text runs, columns, drop caps, gradients, fine rules, captions, and the demo-ad disclaimers.

- [ ] **Step 4: Implement validated v2 packaging**

Hash Flow asset bytes with SHA-256, create managed Paper asset locators, write `manifest.json` plus `assets/<sha256>.<ext>` entries with `fflate`, and fail if either required Flow output is missing.

- [ ] **Step 5: Verify GREEN**

Run: `npx vitest run scripts/create-signaloom-magazine-demo.test.ts src/features/paper/SlpprFormat.test.ts src/shared/files/ValidatedAssetContainer.test.ts`

Expected: all tests pass.

- [ ] **Step 6: Generate both final files**

Run: `node scripts/create-signaloom-magazine-demo.mjs --assets "/home/cabewse/Documents/Loom Workspace/Signaloom-Magazine-Flow-Assets" --output "/home/cabewse/Documents/Loom Workspace"`

Expected: both requested `.slppr` paths are reported and exist.

### Task 4: Verify in Paper and Document the Result

**Files:**
- Create: `docs/notes/903-signaloom-bilingual-magazine-demo.md`
- Modify: `docs/TASK_LIST.md`

**Interfaces:**
- Consumes: the two generated `.slppr` containers.
- Produces: native Paper-open evidence, structural verification, screenshots/previews, and repository handoff notes.

- [ ] **Step 1: Run container-level verification**

Inspect each ZIP, validate asset hashes/lengths, deserialize through the Paper format reader, and assert every design invariant from the spec.

- [ ] **Step 2: Open each file in the Paper workspace**

Use File Open in Sloom Studio, switch to Spreads, and confirm there is no recovery boundary or missing-asset warning.

- [ ] **Step 3: Visually inspect both spreads**

Confirm hierarchy, legibility, Japanese glyph rendering, midpoint separation, image cropping, and disclaimers. Capture verification evidence under `output/playwright/signaloom-magazine/` if browser inspection is needed.

- [ ] **Step 4: Run proportional repository verification**

Run: `npx vitest run src/lib/flowNodeContracts.test.ts src/lib/flowConnectionContracts.test.ts src/lib/imageEditConnections.test.ts src/lib/flowSignals.test.ts src/components/Nodes/ImageNode.test.tsx src/store/flowStore.test.ts scripts/create-signaloom-magazine-demo.test.ts && npm run build`

Expected: tests and production build pass.

- [ ] **Step 5: Complete the task list and write the note**

Mark both current tasks complete and record the files, Flow lineage, layout structure, caveats, and verification commands in `docs/notes/903-signaloom-bilingual-magazine-demo.md`.

- [ ] **Step 6: Commit the artifact tooling and documentation**

Run: `git add scripts/create-signaloom-magazine-demo.mjs scripts/create-signaloom-magazine-demo.test.ts docs/TASK_LIST.md docs/notes/903-signaloom-bilingual-magazine-demo.md && git commit -m "feat(paper): add bilingual Signaloom magazine demo"`
