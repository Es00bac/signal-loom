# Paper Stability Print Resolution

Task 15 replaces Paper's legacy Stability Data URL route with a managed binary pipeline.

- `paperStabilityUpscale` validates documented Fast and Conservative bounds, prompt and creativity rules, request/response image types, content hashes, provider errors, cancellation, and timeout handling.
- The workspace reads the BYOK value only from configured settings at execution time. It resolves managed or runtime sources into binary records, sends multipart image bytes, and stores only the returned content-addressed asset.
- Stability output keeps provider-reported dimensions. Paper preserves frame crop, offsets, rotation, flips, and fit while calculating achieved PPI from the placed physical size. A result below 300 PPI remains visibly insufficient and strict PDF/PDF/X export remains blocked.
- Batch finalization uses a per-action coordinator to share identical normalized paid requests. No API key, data URL, or object URL enters the managed result or Paper document state.

Focused verification: 61 tests across the Stability adapter/source, image-upscale, and preflight suites, plus a successful production build. Live provider evidence remains intentionally pending Task 17.
