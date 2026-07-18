# FBL-009 CI desktop font artifact correction

Date: 2026-07-18

Production/tests commit: `66a7b3ee07dc13e4a2ec181ac34d1f3878772f5d`

## Scope and result

This author correction addresses only FBL-009. The previously missing audited source was confirmed at `/home/cabewse/work_SPaC3/fonts`: clean revision `31507e786066f973e1b01fb479d6d718cd433a6c`, 116 families, 430 faces, zero critical errors, and a passing `inventory/SHA256SUMS` check. Its 481 MiB `collection/` is intentionally ignored and the repository has no remote, so CI does not attempt to check out that sibling.

The release now reconstructs the same redistributable collection from immutable upstream inputs recorded in `resources/font-pack/source-artifact.json`:

- `google/fonts` at `26c5c976d82d50c24a8f0a7ac455e0a7c639c226`;
- Liberation Fonts 2.1.5 archive SHA-256 `7191c669bf38899f73a2094ed00f7b800553364f90e2637010a69c0e268f25d0`;
- M PLUS license at `0d4459efc913a91f33c3f08b219a5a95d282c7b8`, SHA-256 `1bd6eceefce3edcb25cad3d5a4fbec6405d66946a6672daf69fe667c7e52f591`.

Full reconstruction reproduced the audited metadata exactly:

- `font-inventory.json`: `f9902cc342471b4c58147347fc5a51ed8e6826fa04712ed37c54867105908cff` in both roots;
- `SHA256SUMS`: `c1e2ea9159dbb7f3c73d3f720210b625ce36d8273989ec53eed6646bb2dedb1c` in both roots;
- 116 families, 430 faces, 546 inventory-declared font/license payloads.

## Implementation

- `scripts/acquire-bundled-font-library.sh` assembles the pinned source without depending on `../fonts` and verifies it before returning.
- `scripts/font-pack-verification.mjs` binds the source lock, inventory, exact face/license identity, byte lengths, checksum manifest, and actual bytes. Duplicate, missing, extra, changed, unsafe, empty, non-regular, or undeclared staged entries stop verification.
- `scripts/prepare-bundled-font-library.mjs` copies only the exact 546 declared payloads and seven required metadata files into a temporary sibling, verifies it strictly, then swaps it into place. A failed source or replacement leaves the prior stage intact.
- Local packaging remains compatible with the existing sibling source: if its bytes are exact but it predates `source-artifact.json`, the tracked lock is supplied during source verification and copied into the new strict stage. CI always supplies its explicit reconstructed root.
- Electron Builder `beforePack` and `afterPack` hooks make the gate unavoidable for direct builder invocations. The first verifies the stage; the second inspects every produced application output using `electron/bundled-font-library.cjs` and requests both the known face and its license.
- `.github/workflows/release.yml` builds one verified transient artifact, makes all desktop matrix lanes depend on it, re-verifies it after download, and runs the package smoke again. Missing build artifacts now stop the job.

The package smoke identity is Liberation Sans Regular:

- face `collection/base/liberationsans/LiberationSans-Regular.ttf`, 410,712 bytes, SHA-256 `76d04c18ea243f426b7de1f3ad208e927008f961dc5945e5aad352d0dfde8ee8`;
- license `collection/base/liberationsans/LICENSE`, 4,414 bytes, SHA-256 `93fed46019c38bbe566b479d22148e2e8a1e85ada614accb0211c37b2c61c19b`.

## Verification

- Focused permanent suite: `vitest ... scripts/font-pack-verification.test.mjs scripts/font-pack-release-contract.test.mjs` — 12/12 passed.
- Adjacent Electron/packaging suite — 75/75 passed across the new tests plus `desktopPackaging`, Electron bundled-font boundary, main-source, and preload-source tests.
- Full acquisition from the cached pinned Google source — passed; 113 Google families plus three pinned Liberation families; 116/430/546 verified; metadata hashes exactly match the audited `/home/.../fonts` source.
- Local compatibility: `SLOOM_FONT_PACK_DIR=/home/cabewse/work_SPaC3/fonts npm run prepare:font-library` — passed despite the historical source lacking the new lock; the resulting strict stage passed `npm run verify:font-library` and contained 554 total files (546 payload, seven metadata, one local marker).
- TypeScript and production bundle: `npm run build` — passed, 3,287 modules transformed.
- Real Linux package: `npx electron-builder --linux dir --publish never` — passed. `beforePack` reported 116/430/546; `afterPack` resolved and verified the exact face/license under `release/linux-unpacked/resources/font-library`.
- Independent post-package command: `npm run smoke:packaged-font-library -- release` — passed. The packaged resource contained 553 files (546 payload plus seven metadata; the local staging marker is intentionally not packaged).
- Touched script syntax, release-workflow YAML parse, touched-file ESLint, and `git diff --check` — passed.

No release, public artifact, push, or external publication was performed. This is author evidence only; fresh independent review is still required before integration or audit closure.
