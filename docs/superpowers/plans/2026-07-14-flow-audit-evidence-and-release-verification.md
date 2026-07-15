# Flow Audit Evidence and Release Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan.

**Goal:** Prove the Flow workspace audit is complete with generated matrices, parity checks, migration fixtures, cross-platform verification, user documentation, and a durable handoff note.

**Architecture:** Generate audit artifacts from executable registries, supplement them with request-builder and platform evidence, and fail CI/tests when nodes/models lack coverage. Manual/live checks are clearly separated from deterministic default tests.

**Tech Stack:** TypeScript, Node scripts, Vitest, Testing Library, Electron/Android build tooling, Markdown.

## Global Constraints

- This plan begins only after the contracts, provider catalog, and Vertex broker plans pass their focused gates.
- Generated evidence must be derived from registries; do not hand-maintain a second drifting source of truth.
- Never include credentials, prompts, private source assets, or API responses containing user data.
- Do not claim a live provider/platform smoke passed unless it was actually run and recorded.
- Preserve concurrent Paper/Image workspace changes.

---

### Task 1: Generate the exhaustive node audit matrix

**Files:**
- Create: `scripts/generate-flow-node-audit.mjs`
- Test: `scripts/generate-flow-node-audit.test.mjs`
- Create: `docs/audits/flow-node-audit-2026-07-14.md`

**Step 1: Test generation completeness**

Assert exactly 62 rows, stable ordering by catalog category/type, non-empty purpose/inputs/outputs/example/implementation/verification, unique handles, and no `TODO`/placeholder text.

**Step 2: Generate from `FLOW_NODE_CONTRACTS`**

Each row includes node type, label, role, purpose, input ports/types/cardinality, output ports/types, dynamic behavior, example chain, implementation path, API capability where relevant, and test evidence.

**Step 3: Run generator/test and commit**

Run: `node --test scripts/generate-flow-node-audit.test.mjs && node scripts/generate-flow-node-audit.mjs`

```bash
git add scripts/generate-flow-node-audit.mjs scripts/generate-flow-node-audit.test.mjs docs/audits/flow-node-audit-2026-07-14.md
git commit -m "docs(flow): generate exhaustive node audit"
```

### Task 2: Generate the provider/model audit matrix

**Files:**
- Create: `scripts/generate-provider-model-audit.mjs`
- Test: `scripts/generate-provider-model-audit.test.mjs`
- Create: `docs/audits/provider-model-audit-2026-07-14.md`

**Step 1: Test orphan/status/evidence rules**

Assert every normal fallback option has a contract; every verified contract has official evidence and last-verified date; every model has request-builder coverage or explicit unverified fallback; vestigial IDs are absent from normal options; known legacy fixtures remain preservable.

**Step 2: Generate the matrix**

Columns: capability, provider, exact model ID, API family, endpoint/auth, inputs/output, operations, key controls/limits, lifecycle/account availability, warning, request builder, official evidence, last verified, and representative Flow chain.

**Step 3: Record catalog changes**

Add a concise appendix listing added, removed-from-normal, deprecated, legacy-preserved, and unverified-live models. Base entries on the executable diff rather than memory.

**Step 4: Run generator/test and commit**

Run: `node --test scripts/generate-provider-model-audit.test.mjs && node scripts/generate-provider-model-audit.mjs`

```bash
git add scripts/generate-provider-model-audit.mjs scripts/generate-provider-model-audit.test.mjs docs/audits/provider-model-audit-2026-07-14.md
git commit -m "docs(providers): generate verified model audit"
```

### Task 3: Add saved-project migration and regression fixtures

**Files:**
- Create: `src/test/fixtures/flow-audit/valid-typed-flow.json`
- Create: `src/test/fixtures/flow-audit/invalid-legacy-edge.json`
- Create: `src/test/fixtures/flow-audit/legacy-model-selection.json`
- Create: `src/test/fixtures/flow-audit/legacy-vertex-settings.json`
- Create: `src/lib/flowAuditMigrations.test.ts`

**Step 1: Write round-trip tests**

Load/save each fixture. Assert valid edges gain derived presentation, invalid edges remain and block, legacy model IDs remain exact/selectable on their node, and legacy Vertex secrets migrate only after secure native import.

**Step 2: Add fixtures and implement only necessary migrations**

Do not bump project schema for purely derived edge styling. Keep fixture media inline as tiny synthetic data or omit it; no owner assets.

**Step 3: Run tests and commit**

Run: `npm test -- --run src/lib/flowAuditMigrations.test.ts`

```bash
git add src/test/fixtures/flow-audit src/lib/flowAuditMigrations.test.ts
git commit -m "test(flow): preserve audited legacy workflows"
```

### Task 4: Add an automated production audit gate

**Files:**
- Create: `scripts/verify-flow-production.mjs`
- Test: `scripts/verify-flow-production.test.mjs`
- Modify: `package.json`
- Modify: release-gate script only if it already supports additive workspace gates

**Step 1: Write gate tests**

The gate must fail on missing node contract, orphan model, verified model without official evidence, missing request-builder family, incompatible normal default, raw Vertex credential field in persisted settings, or absent audit artifact.

**Step 2: Implement the deterministic gate**

Add `npm run verify:flow-production`. Keep live API checks opt-in through separate environment flags. Print concise actionable failures and never print secrets.

**Step 3: Run and commit**

Run: `node --test scripts/verify-flow-production.test.mjs && npm run verify:flow-production`

```bash
git add scripts/verify-flow-production.mjs scripts/verify-flow-production.test.mjs package.json
git commit -m "test(flow): add production audit gate"
```

### Task 5: Write the Vertex user guide

**Files:**
- Create: `docs/vertex-authentication.md`
- Test: link/source checks in the production audit gate

**Step 1: Document all supported paths**

Cover Google Account sign-in, authorized-user ADC import, service-account import and risk guidance, supported external account config, project/IAM/API/billing setup, regions, quota project, testing, logout/revoke/remove, gcloud compatibility, and platform differences for Windows/macOS/Linux/Android.

Use official links for Google auth, installed-app OAuth/PKCE, Resource Manager project discovery, Vertex IAM/API setup, and service-account key risk. State clearly that browser-only builds cannot promise native secure credential persistence.

**Step 2: Add troubleshooting by failure layer**

Map UI messages to OAuth client setup, parse failure, token exchange, project permission, Vertex API enablement, IAM, billing/quota, model region/account access, and provider safety response.

**Step 3: Commit**

```bash
git add docs/vertex-authentication.md
git commit -m "docs(vertex): add in-app authentication guide"
```

### Task 6: Run focused, full, and platform verification

**Files:**
- Modify only files required to fix failures attributable to this audit
- Create/update: `docs/audits/flow-release-verification-2026-07-14.md`

**Step 1: Run focused gates**

```bash
npm run verify:flow-production
npm test -- --run src/lib/flowPortTypes.test.ts src/lib/flowNodeContracts.test.ts src/lib/flowConnectionContracts.test.ts src/lib/flowDiagnostics.test.ts src/store/flowStore.test.ts src/components/Nodes/ImageNode.test.tsx src/features/flow/workspace/FlowWorkspaceShell.test.tsx
npm test -- --run src/lib/providerModelContracts.test.ts src/lib/modelCatalogMerge.test.ts src/lib/providerCatalog.test.ts src/store/catalogStore.test.ts src/lib/imageProviderCapabilities.test.ts src/lib/imageProviderParity.test.ts src/lib/videoModelSupport.test.ts src/components/Nodes/AudioNode.modelFilter.test.ts src/lib/providerModelRequestMatrix.test.ts
npm test -- --run src/lib/vertex src/components/Settings/VertexAuthPanel.test.tsx src/store/settingsStore.test.ts src/lib/settingsBackup.test.ts src/lib/vertexDirectRest.test.ts
```

**Step 2: Run repository verification**

```bash
npm test
npx tsc -b --pretty false
npm run lint
npm run build
```

If a failure is in concurrent Paper/Image work, record it and do not overwrite those files. If it is caused by this audit, use systematic debugging and fix it before continuing.

**Step 3: Run native deterministic checks**

```bash
node --test electron/vertex-credential-store.test.cjs electron/vertex-token-broker.test.cjs electron/vertex-oauth.test.cjs
cd android && ./gradlew testDebugUnitTest
```

Run available non-credential packaging/smoke commands for the host. Windows/macOS package configuration can be verified from Electron Builder config on Linux, but do not claim launched native smoke success without those operating systems.

**Step 4: Run opt-in live checks only with configured credentials**

Where owner credentials exist, run model-list refresh and one minimal text/image/video/audio request per provider family plus Vertex sign-in/import/test. Redact request/response content in the report. Otherwise mark each as `not run — credentials/platform unavailable`, not failed or passed.

**Step 5: Write the verification record and commit**

Record command, date, platform, exit result, test count, skipped live checks, and any pre-existing unrelated failures.

```bash
git add docs/audits/flow-release-verification-2026-07-14.md
git commit -m "test(flow): record production audit verification"
```

### Task 7: Write the required handoff note and reconcile task tracking

**Files:**
- Create: next numbered file in `docs/notes/`, e.g. `docs/notes/NNN-flow-contract-provider-vertex-audit.md`
- Modify: `docs/TASK_LIST.md`
- Modify: `docs/HANDOFF.md` only if its current format expects the latest completed work

**Step 1: Write the note**

Summarize architecture, node contracts, connection UX, Image reference fix, catalog additions/removals/lifecycles, Vertex platform behavior, secure storage, migrations, verification results, skipped live tests, and caveats. Link the design, four plans, audit matrices, release record, and Vertex guide.

**Step 2: Update task status without erasing other agents’ entries**

Use a narrow patch. Preserve active Paper/Image tasks and concurrent notes.

**Step 3: Final diff/security review**

Run:

```bash
git status --short
git diff --check
git diff --stat
rg -n "private_key|refresh_token|client_secret" src electron android docs --glob '!**/*.test.*' --glob '!**/fixtures/**'
```

Inspect every match and prove it is a schema field/parser/help string, never a real credential.

**Step 4: Commit**

```bash
git add docs/notes/NNN-flow-contract-provider-vertex-audit.md docs/TASK_LIST.md docs/HANDOFF.md
git commit -m "docs(flow): hand off production audit"
```

### Task 8: Completion gate

Use `superpowers:verification-before-completion`, then `superpowers:requesting-code-review`. Do not report completion until:

- all 62 node contracts and audit rows exist;
- every normal selectable model has verified or explicit unverified coverage;
- vestigial normal options are removed and legacy preservation tests pass;
- typed connection/edge/handle tests pass;
- Image reference handles are exterior;
- renderer/project persistence contains no Vertex long-lived secrets;
- deterministic desktop and Android auth tests pass;
- full test/typecheck/build results are recorded accurately;
- the required note and user guide are committed.
