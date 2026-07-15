# 903 — Flow contract/runtime parity audit

Date: 2026-07-15

## Outcome

Flow now has a durable contract-versus-runtime gate for every registered node type and every resolved input handle. Exact connection typing remains strict, but ports enumerate every value family their consumers intentionally support instead of collapsing flexible inputs to one literal type.

The initial Image-reference report was one symptom of a broader family of regressions introduced when exact type validation landed. This pass repaired the full set found by walking all 63 contracts against their runtime collectors, evaluators, UI resolvers, and dynamic output behavior.

## Repaired mismatches

- Image and Video numbered reference handles accept one image-bearing source plus coexisting Text/JSON descriptors. A typed connection group rejects a second image-bearing value because runtime consumes one image per numbered reference.
- Text-first edge ordering no longer hides an Image/Video reference preview. Shared image-source resolution covers Image, Crop, `.slimg`, Image Editor, Function image outputs, Package, Doodle, Expander, and Envelope sources.
- Generic container consumers enumerate concrete `list<T>` and `envelope<T>` variants. Typed lists/envelopes therefore connect to Expander, List Length, flattening, monitors, routing nodes, and reusable Function list/envelope ports without treating `mixed` as an unsafe global wildcard.
- Configured List/Envelope outputs retain their declared item type before the first connected item.
- Source Bin accepts direct Text/media/package values and supported list/envelope containers, materializes all declared source-compatible output families, and filters number/boolean/JSON items from mixed containers instead of unsafe-casting them into library assets.
- Crop, Image mask/source/reference, Video frame/reference, Vision Verify, Image Feature Extractor, and `.slimg` inputs accept the composite image values already handled by execution.
- Multimodal Text execution now consumes `.slimg`, Image Editor, and typed Function media outputs that were previously connectable but silently skipped.
- Settings JSON connects to Text/Image/Video/Audio generation ports and is merged as execution configuration without being appended to the creative prompt. LoRA JSON is likewise kept out of the prompt while still reaching the dedicated LoRA collector.
- Function `any`, `list`, and `envelope` inputs accept their intended concrete value families.
- Composition advertises `package` output for PNG/JPEG image-sequence presets and `video` for video presets, so downstream validation matches the actual render result.
- Execution dependency discovery is now based on runnable effective sources behind valid typed edges rather than parallel per-node allowlists.
- The Advanced Image Editor consumes and previews all three declared inputs and imports connected source/mask/reference images as named layers when the Image workspace opens.

## Audit architecture

`src/lib/flowRuntimePortCapabilities.ts` is an independent runtime-evidence registry. It names a consumer path and behavioral test for every input family. `src/lib/flowRuntimePortCapabilities.test.ts` resolves all 63 default contracts plus every material port-changing variant and fails if any input lacks evidence.

`scripts/generate-flow-node-audit.mjs` now joins contract rows with that registry and generates `docs/audits/flow-node-audit-2026-07-15.md`. `scripts/verify-flow-production.mjs` fails on missing evidence or missing consumer/test files. `npm run verify:flow-production` runs the focused parity/behavior suite before the generated-artifact and provider-model checks.

## Verification

- `npm run verify:flow-production` — passed: 9 files / 311 tests; 63 node contracts; 182 model contracts; 178 normal model options.
- `npx tsc -b --pretty false` — passed.
- `npm test` — passed: 616 files / 4,809 tests.
- `npm run build` — passed; production Vite bundle generated. Existing HarfBuzz/LCMS browser-externalization and large-chunk warnings remain informational.

## Caveats

- The runtime-evidence registry proves in-repository contract/consumer coverage and deterministic behavior fixtures. Live provider calls still require the owner's configured credentials and are separately gated by provider/model contracts.
- Mixed Source Bin containers are accepted because they can carry supported library values; unsupported items are intentionally filtered rather than coerced.
