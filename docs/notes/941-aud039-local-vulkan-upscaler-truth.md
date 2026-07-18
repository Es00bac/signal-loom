# AUD-039 local Vulkan upscaler truth

## Scope and ownership

- Date: 2026-07-18
- Exact author base: `5931420f42c3e1654090f3be54ee1f70d6a313ab`
- Finding: AUD-039
- This is an author lane. It does not self-approve or integrate the result.

## Red proof

Before production changes, six focused suites ran against the exact base. The new runtime-contract
suite could not load because no truthful managed-runtime contract existed, and five existing suites
still expected the false `Local CPU AI` / CPU-only product claims. Fifty-three unchanged controls
passed. This established that the repair had to change both runtime truth and the user-facing
contract rather than merely relabel one menu option.

## Correction

The managed desktop route is now named **Local Vulkan AI** throughout Paper, Image, generative-edit,
provider-catalog, status, and help surfaces. Copy states that the bundled
`realesrgan-ncnn-vulkan` runtime requires a compatible Vulkan GPU/driver and has no CPU fallback.

The helper now publishes an explicit capability object:

- backend: `realesrgan-ncnn-vulkan`
- accelerator: `vulkan`
- `requiresVulkan: true`
- `cpuFallback: false`

The desktop status bridge exposes the same facts. Known Vulkan/device initialization failures are
classified as `vulkan-unavailable`, returned with HTTP 503, and carry a direct message that a
working Vulkan GPU/driver is required and no CPU fallback exists. Other process failures remain
typed as ordinary upscaler-process failures.

The persisted provider and settings identifier `local-ai-cpu` is intentionally retained so existing
projects and preferences continue to deserialize. It is now documented as a legacy compatibility
key, not a product capability claim. Generic custom-endpoint errors use the neutral name `Local AI
upscaler`, because compatible user-supplied endpoints are not necessarily the managed Vulkan
runtime.

## No-Vulkan coverage

Permanent tests simulate three representative failures:

- `VK_ERROR_INCOMPATIBLE_DRIVER`
- no Vulkan-capable GPU
- failure to find a Vulkan device

Each produces the exact `vulkan-unavailable` / 503 / no-CPU-fallback result. Capability coverage
also proves the managed endpoint cannot advertise a CPU fallback.

## Author verification

- Focused local-runtime, Paper, universal Image, generative-edit, and endpoint suites: **6 files,
  66 tests passed**.
- Electron status, help, native bridge, provider catalog, Flow image-provider/cancellation, and Image
  properties adjacency: **7 files, 147 tests passed**.
- CommonJS and ESM syntax checks for the runtime contract, helper, and Electron main process:
  passed.
- Forced App TypeScript with incremental state disabled: passed.
- Forced Node TypeScript with incremental state disabled: passed.
- Touched-file ESLint: zero errors; four pre-existing `PaperWorkspace` hook warnings only.
- `git diff --check`: passed.
- Production build: passed; Vite transformed **3,281 modules**.
- Repository search found no remaining `Local CPU AI`, `local CPU upscaler`, or `CPU only` product
  promise in `src`, `electron`, `ops`, or `shared`.

## Handoff

A fresh independent reviewer must verify that every managed-route entry point is truthful, probe the
capability and failure classifier with adversarial platform messages, and confirm legacy
`local-ai-cpu` data remains compatible without leaking the former CPU promise. Only a clean exact
tip with that approval may be integrated.
