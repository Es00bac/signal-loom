# FBL-011 Terra blocker repair

Date: 2026-07-16
Branch: `overlap/kimi-managed-font-identity`
Base: `fbdad282e5edd107c479fe6babe03175824f07c2`
Original production/tests: `34ba7f36016c17ece6a97556b817527d1d1afd9f`
Original evidence: `1dbcb27`
Production/tests follow-up: `4592393f37b25335da93f64bcccd5edebcabb698`

## Outcome

Terra's fresh gate blocked the original FBL-011 implementation on incomplete serialized identity, bare-family arc measurement, post-paint Video registration, and silent removal of malformed managed references. The follow-up closes all four boundaries without changing FBL-010 or Paper production code.

Managed references now use a complete schema-v2 identity: face ID, family, weight, style, stretch, collection index, full SHA-256, and byte length. Resolution requires one unique complete match and revalidates the selected face against the complete hash, bytes, collection, and descriptors. Legacy or malformed prior managed state remains a serializable blocking issue until it can be honestly byte-verified or explicitly reselected.

Image and Video layout, measurement, painting, export, persistence, and cache keys use the complete-identity runtime alias. Video now gates its first preview and export until registration succeeds, preserves failure visibly, supports retry, and ignores stale registration completion after a reference change.

## Structure and tests

- `src/types/managedFont.ts` owns the v2 exact reference and serializable issue state.
- `src/lib/bundledFontLibrary.ts` owns strict normalization, complete resolution, content verification, legacy promotion, aliases, and registration caches.
- `src/lib/managedBundledFonts.ts` collects exact references and issues across Image and every Video managed location.
- `src/features/video/workspace/useManagedFontRegistrationGate.ts` owns first-paint loading/error/success/retry/stale-completion behavior.
- Project, Image, Video, export, and cache normalizers propagate exact references or actionable issues rather than falling back silently.

Adversarial coverage includes duplicate IDs/families, differing bytes and collection indexes, duplicate complete identities, mutated/truncated hashes, descriptor and collection mismatches, runtime-alias arc metrics, first-paint/failure/reference-change/retry registration, malformed restore across Image plus Video asset/clip/stage state, fresh-module byte transfer, and complete-identity cache variation.

## Verification

- Affected matrix: 23 files / 342 tests passed with `--configLoader runner`.
- Broad adjacent matrix: 47 files / 493 tests passed with `--configLoader runner`.
- App and node TypeScript passed with `--incremental false`; `tsc -b --force` also passed.
- Changed-file ESLint: 0 errors / 33 existing warnings.
- `git diff --check`: passed.
- Production build: passed; 3,252 modules transformed.

## Caveats

The checked-in inventory is TTF-only. Nonzero TTC/OTC faces are identity-safe but intentionally blocked because the browser `FontFace(ArrayBuffer)` path cannot portably select a collection member. Fresh-process tests exercise real checked-in font bytes, hashing, and parsing with stubbed browser font/canvas APIs; packaged Electron restart checks across shipping operating systems remain useful external evidence.
