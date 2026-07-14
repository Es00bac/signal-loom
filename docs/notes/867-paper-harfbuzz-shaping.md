# Paper HarfBuzz Shaping

Task 9 adds `harfbuzzjs@1.4.0` as an exact, license-audited dependency and exposes
`createHarfBuzzPaperTextShaper`. The adapter accepts managed font bytes plus a collection index and shapes
explicit direction, script, language, features, variation axes, font scale, and UTF-16 source clusters.

The adapter holds one resettable HarfBuzz buffer per font face, so repeated shaping does not accumulate
per-call buffers. `destroy()` drops every Paper-owned wrapper reference and rejects subsequent calls. The
upstream package has no public manual native destructor; its documented finalizer owns the native handles.
This constraint is recorded in `docs/audits/harfbuzzjs-1.4.0-license.md` rather than hidden by a false API
claim.

The Vite build copies the package WASM unchanged to `dist/assets/harfbuzz.wasm`, where the package's
relative runtime loader resolves it. The generated OSS view now includes the binding MIT notice and the
embedded HarfBuzz Old MIT notice. No font file was added to the product.

Verification:

```text
npx vitest run src/lib/paperTextShaper.test.ts
npm run generate:oss-licenses
npm run build
```
