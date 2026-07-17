# FBL-011 fresh-process bundled-font persistence

Date: 2026-07-16
Branch: `overlap/kimi-managed-font-identity`
Integration base: `fbdad282e5edd107c479fe6babe03175824f07c2`
Production/tests commit: `34ba7f36016c17ece6a97556b817527d1d1afd9f`
Terra-blocker production/tests follow-up: `4592393f37b25335da93f64bcccd5edebcabb698`

## Scope

This lane implements only FBL-011. It does not change Paper strict-output face resolution or the FBL-010 Paper stretch lane. The integrated FBL-012/FBL-013/FBL-014/AUD-026 behavior and the optional Chromium family-serialization oracle remain intact.

## Terra gate correction

A fresh Terra review of `34ba7f3` plus evidence commit `1dbcb27` returned **BLOCK**. The original evidence overstated four boundaries: the serialized reference did not include collection index or full content identity; Video arc metrics still used the human family; Video registration happened after paint; and malformed managed references could be normalized away into ordinary family fallback.

Those pre-follow-up claims are retracted. They apply only after production/tests follow-up `4592393f37b25335da93f64bcccd5edebcabb698`, whose corrections and fresh results are recorded below. The earlier green test counts remain historical implementation evidence, not proof that the four Terra boundaries were satisfied.

## Red evidence

Before implementation, the new fresh-process regression was run directly:

```text
npx vitest run src/lib/managedBundledFontPersistence.test.ts
```

Both tests failed deterministically because the canonical face-reference constructor/resolver contract did not exist (`createBundledFontFaceReference` was absent). This established that a saved Image/Video family string could not recover audited bytes in a fresh renderer.

## Corrected implementation

- The canonical reference is now schema v2 and binds `faceId`, family, weight, style, stretch percentage, collection index, full lowercase SHA-256, and byte length. Identity signatures, runtime aliases, registration/error caches, Image preview keys, Video segment keys, and Video composition keys all include the complete identity.
- Resolution enumerates every face-ID candidate and accepts exactly one complete identity match. Duplicate IDs, duplicate complete identities, family/descriptor/collection/content mismatches, changed bytes, and truncated hashes fail closed. Byte registration rechecks full SHA-256, byte length, selected collection face, family, weight, style, and stretch.
- Legacy v1 references become serializable `legacy-reference` issues. They are promoted to exact v2 only after catalog resolution and byte verification. Malformed and typography-mismatched references become serializable blocking issues rather than disappearing during project validation. Image layers/snapshots and all Video managed locations retain those issues through restore.
- The managed runtime alias is derived from the complete identity. Straight and arc Video layout/measurement, Video painting, Image measurement/editing/painting, and export paths use that alias and exact descriptors; a same-named system family cannot affect managed glyph placement.
- Video has a pre-preview registration gate. Managed content starts in loading state, remains unpainted/unmeasured/unexportable through registration failure, exposes retry, and ignores stale async completion after the composition's reference signature changes.
- TTC/OTC identity is represented and validated. A nonzero collection face is deliberately blocked at browser registration because `FontFace(ArrayBuffer)` has no portable collection selector; it is never silently rendered as another face. The current inventory remains standalone TTF.

## Corrected fresh-process and adversarial regression

`src/lib/managedBundledFontPersistence.test.ts` authors and saves:

- an Image text layer and its duplicated copy;
- a reusable Video text asset;
- a Video text clip;
- a Video text stage object.

It JSON-transfers the project, calls `vi.resetModules()` to create a new module graph with empty registration/catalog promises, sanitizes and restores both editors, and serves the real checked-in `LiberationSans-Regular.ttf` bytes. The corrected tests prove:

- all five authored schema-v2 references survive save/transfer/normalization with complete identity;
- project open fetches the audited byte URL in the fresh graph;
- the bytes reach `FontFace` as `ArrayBuffer` data;
- the exact `normal`/`400`/`100%` descriptors are registered;
- managed straight and arc metrics plus preview/export use the complete-identity alias, never the bare `Liberation Sans` system family;
- Image and Video canvas paths retain exact identity and stretch;
- a 403 byte response fails closed with reinstall/enable guidance;
- duplicate face IDs/family names with differing bytes or collection indexes do not collide, while a duplicate complete identity blocks;
- full-hash byte mutation, truncated hashes, collection mismatch, family/weight/style/stretch mismatch, and byte-length mismatch block;
- first Video paint is gated, failure does not expose managed or fallback text, changed references stale prior completions, and retry succeeds;
- malformed Image and Video asset/clip/stage references survive project restore as actionable blocking issues;
- every cache signature changes when any complete identity field changes.

## Follow-up verification

- Required affected Image/Video/project/export/cache/fresh-process matrix: 23 files, 342 tests passed with `--configLoader runner`.
- Final combined broad adjacent matrix: 47 files, 493 tests passed with `--configLoader runner`. It includes the affected suites plus bundled-font browser/settings, Electron transport/startup/project files, native project/schema/sync/usage, Flow composition, stage compositor, and the adjacent Paper managed-font suites without changing Paper.
- Forced app TypeScript: `npx tsc -p tsconfig.app.json --noEmit --incremental false --pretty false` passed.
- Forced node TypeScript: `npx tsc -p tsconfig.node.json --noEmit --incremental false --pretty false` passed.
- Forced project references: `npx tsc -b --force --pretty false` passed.
- Changed-file ESLint passed with 0 errors and 33 existing warnings in the large Image/Video workspace files plus two existing unused-disable warnings in stage export.
- Production build: `npm run build` passed; Vite transformed 3,252 modules. Existing externalized-module, runtime-URL, and large-chunk warnings remain.
- `git diff --check` passed before the production commit and again for the evidence patch.

## Residual risks

- Licensing/authorization: exact rendering requires the audited 116-family/430-face external font pack to be installed and authorized through the desktop protocol. The resolver now blocks when it is absent; it cannot grant rights for a font pack the user is not licensed to use. Real bytes are also rejected when OS/2 vetting says they are not safely embeddable.
- Browser oracle coverage: the fresh-process test uses real font bytes and the real parser/hash pipeline, but stubs the browser `FontFace` and Canvas objects. A packaged-Electron restart/transfer oracle on each shipping OS remains valuable.
- Collection rendering: current audited inventory contains 430 standalone TTF faces and no TTC/OTC collection faces. The contract is collection-safe and fails closed, but nonzero TTC/OTC faces remain intentionally unavailable until a browser-qualified extraction or selection mechanism exists.
- Canvas percentage stretch is newer than the baseline Canvas typings and is assigned through a guarded runtime property. Older engines that omit it still use the uniquely registered face bytes, but width-axis/stretch visual parity should be qualified per supported browser platform.
