# FBL-026 bundled Paper font provenance — final correction evidence

Date: 2026-07-18

Correction base: `ee1cc47bec09d2f0c53a655045de809740a692c9`

Production/test correction: `3c2c6a96`

Role: Product Mechanic correction author. This note records implementation and local verification only; it does not self-approve or integrate FBL-026.

## Gate-confirmed gap

The prior correction preserved bundled provenance from any canonical-looking internal font URL plus shaped license metadata. Independent disposable probes demonstrated that arbitrary user font bytes with invented metadata retained `source.kind: bundled`, and that a syntactically valid license reference retained bundled trust even when its repository record was absent. The bundled shortcut in packaging policy therefore received insufficient positive provenance evidence.

## Correction

Retained bundled trust is now bound to one positive local identity:

- either a face successfully installed through the bundled Paper font installer in this renderer;
- or the uniquely matching face in the current locally authorized bundled catalog after renderer restart.

The document tuple must exactly match that identity: internal resource URL, catalog source version, installed face id and descriptors, font digest/length/MIME type, license id/digest/length, attribution, family/postscript metadata, variation axes, collection index, and subsetting policy. Both referenced repository records must exist, their metadata must equal the document references, and their bytes must re-hash to the declared content identities.

Insufficient evidence downgrades only the affected face to `user-import`. Its exact managed reference and document usability remain intact, but it no longer receives bundled packaging treatment. Existing font-rights rules then make the packaging decision; this correction does not introduce a new external license audit or close FBL-009.

The current-catalog fallback is dynamically loaded. Ordinary Paper normalization remains a small production chunk, while catalog/desktop/font-vetting code loads only when bundled provenance has no successful installer proof in the current renderer.

## Permanent regression coverage

- Direct normalization preserves a real installer-produced face, including its variation setting and license evidence.
- Arbitrary bytes with the real installed source tuple downgrade to `user-import`.
- Missing license records and managed-reference metadata mismatches downgrade.
- Mixed documents retain bundled trust only on the valid installed face.
- Version-2 `.slppr` save/open preserves the installed face, downgrades arbitrary bytes, and rejects a save with missing required license bytes.
- Portable `.sloom` clean-profile reopen preserves the installed face, downgrades only the invalid face in a mixed document, and rejects strict save when the bundled license record is absent.
- Existing old-schema, legacy inline migration, packaging, exact-font descriptor, project replacement, and bundled catalog tests remain green.

The new fail-closed tests are old-code-sensitive: the prior tip retained bundled source identity for the arbitrary/missing/mismatched cases, while the pre-FBL-026 base failed the valid provenance round trips.

## Verification

- Focused/adjacent Paper font, asset, project, packaging, replacement, and legacy matrix: 11 files, 257 tests passed.
- `npx tsc -p tsconfig.app.json --noEmit --incremental false --pretty false` — passed.
- `npx tsc -p tsconfig.node.json --noEmit --incremental false --pretty false` — passed.
- ESLint across all seven touched production/test files — passed.
- `npm run verify:paper-production` — passed.
- `npm run build` — passed; 3,280 modules transformed.
- `git diff --check` — passed.

Generated Paper verifier artifacts were moved intact to `/mnt/d/work_SPaC3/generated-artifacts-fbl026-correction-final-20260718`.

No external provider or network service was called.
