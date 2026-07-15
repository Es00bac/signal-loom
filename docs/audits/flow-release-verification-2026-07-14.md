# Flow Workspace Audit — Release Verification

Date: 2026-07-14  
Branch: `audit/flow-node-provider-vertex`  
Host verification: Linux desktop, Electron/browser development runtime, Android Gradle toolchain

## Outcome

The Flow node/type, provider/model, typed-wire, Image reference-handle, and Vertex ADC audit passes its deterministic production gate. All 63 registered node types and all 182 curated provider/model contracts are covered by executable registries and generated matrices. The normal catalog contains 178 selectable curated entries; account-discovered unknown IDs use a restricted unverified contract.

## Deterministic verification

| Command or check | Result | Evidence |
| --- | --- | --- |
| `npm run verify:flow-production` | Pass | 63 node contracts, 182 model contracts, 178 normal options; no orphans, stale generated audit, missing implementation, project-file Vertex secret field, or credential-shaped shipping literal |
| `npm test -- --run` | Pass | 613 test files, 4,686 tests |
| `npx tsc -b --pretty false` | Pass | Project-reference TypeScript build clean |
| `npm run build` | Pass | Vite transformed 3,239 modules and emitted production assets |
| `npm run lint` | Pass with warnings | 0 errors, 84 repository warnings; no new error gate failure |
| `npx cap sync android` | Pass | Recreated ignored Capacitor build inputs without tracked-file changes |
| `android/gradlew testDebugUnitTest --no-daemon` | Pass | `BUILD SUCCESSFUL`, 86 actionable tasks |
| Generator tests | Pass | Node and provider matrices reproduce exactly from executable registries |
| Saved-flow migration fixtures | Pass | Valid typed edge, invalid retained edge, shut-down saved model, and legacy Vertex ADC settings all round-trip as designed |

The first repository test run executed concurrently with build/lint and timed out one Paper PDF golden case at its five-second budget. The same Paper golden passed 4/4 alone, and the subsequent full repository suite run by itself passed all 4,686 tests. This was resource contention, not a Flow or Paper regression.

## Live UI verification

The Flow workspace was exercised in a headed browser against the development server.

- The palette shows purpose text plus **Connections & example** help generated from the node contract.
- Adding **FLUX.2 Multi-Reference** without a BFL key preserves `Black Forest Labs` / `FLUX.2 Pro` instead of silently switching providers.
- The node explains that credentials are missing, remains fully selectable/configurable, and disables **Run**.
- Reference handles 1–8 are active for FLUX.2 Pro. References 9–14 remain visible but blocked with the exact eight-reference limit.
- Reference handles sit on alternating exterior left/right edges, so incoming wires no longer disappear behind the two-row interior control grid.
- Browser console result: 0 errors and 0 warnings.
- Vertex Settings showed terminal-free JSON choose/paste, ADC detection, project/region/quota controls, and test connection.

## Live credential/provider checks

- The desktop ADC broker successfully obtained a short-lived access token from the host's standard ADC file and reported source `adc-file`. The token and credential contents were not printed or recorded.
- The catalog sync checker was invoked without provider API keys in the command environment. It skipped Gemini, OpenAI, Atlas, and ElevenLabs and wrote nothing. This is recorded as **not run — credentials unavailable**, not as a successful live catalog comparison.
- Paid/minimal generation calls for OpenAI, Gemini API-key, Atlas, BytePlus, Hugging Face, BFL, Stability, and ElevenLabs were not run because keys were not available to the command environment.

## Platform evidence and limits

| Platform | Evidence | Status |
| --- | --- | --- |
| Linux desktop | Headed Flow UI, real standard-path ADC token, build/tests | Live verified |
| Android | Authorized-user/service-account direct-token/request tests plus Gradle unit build | Deterministic verified; no physical-device generation call in this session |
| Windows desktop | Standard `%APPDATA%` ADC discovery, imported JSON broker, path/command tests, Electron Builder configuration | Deterministic/configuration verified; not launched on Windows in this session |
| macOS desktop | Standard `~/.config/gcloud` discovery, imported JSON broker, path/command tests, Electron Builder configuration | Deterministic/configuration verified; not launched on macOS in this session |

Android standalone accepts authorized-user and service-account ADC JSON. External-account and impersonated-service-account credentials currently require the desktop Google Auth broker. Optional desktop **Google browser sign-in** remains a Cloud SDK compatibility path; built-in JSON import is the no-SDK/no-terminal path.

## Known non-blocking warnings

- Vite reports existing externalized Node `module` imports for HarfBuzz/lcms browser compatibility and large production chunks.
- ESLint reports 84 existing warnings across broader Image/Paper/Video/App files. The audit introduces no lint errors.
- `module.register()` emits a dependency deprecation warning during Vitest/Vite execution.

## Durable artifacts

- [Exhaustive node matrix](flow-node-audit-2026-07-14.md)
- [Exhaustive provider/model matrix](provider-model-audit-2026-07-14.md)
- [Vertex authentication guide](../vertex-authentication.md)
- [Audit design](../superpowers/specs/2026-07-14-flow-node-provider-auth-audit-design.md)
- [Typed connection plan](../superpowers/plans/2026-07-14-flow-contracts-and-typed-connections.md)
- [Provider/model plan](../superpowers/plans/2026-07-14-provider-model-contract-catalog.md)
- [Vertex broker plan](../superpowers/plans/2026-07-14-vertex-cross-platform-credential-broker.md)
