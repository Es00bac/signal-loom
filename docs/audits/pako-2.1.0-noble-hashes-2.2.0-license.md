# `pako` 2.1.0 And `@noble/hashes` 2.2.0 License And Provenance Audit

Audited on 2026-07-14 for the bounded content-addressed ZIP container. Both packages are accepted as exact production dependencies.

## Registry Provenance

Commands run before installation:

```bash
npm view pako@2.1.0 name version license dependencies dist.tarball dist.integrity dist.shasum --json
npm view @noble/hashes@2.2.0 name version license dependencies dist.tarball dist.integrity dist.shasum --json
npm pack pako@2.1.0 @noble/hashes@2.2.0 --dry-run --json
```

Observed `pako@2.1.0` values:

- License metadata: `(MIT AND Zlib)`.
- Integrity: `sha512-w+eufiZ1WuJYgPXbV/PO3NCMEc3xqylkKHzp8bxp1uW4qaSNQUkwmLLEc3kKsfz8lpV1F8Ht3U1Cm+9Srog2ug==`.
- Tarball: `https://registry.npmjs.org/pako/-/pako-2.1.0.tgz`.
- SHA-1: `266cc37f98c7d883545d11335c00fbd4062c9a86`.
- Archive size: 412,482 bytes; unpacked size: 1,640,808 bytes; 33 entries.
- Runtime dependencies: none; bundled packages: none.

Observed `@noble/hashes@2.2.0` values:

- License metadata: `MIT`.
- Integrity: `sha512-IYqDGiTXab6FniAgnSdZwgWbomxpy9FtYvLKs7wCUs2a8RkITG+DFGO1DM9cr+E3/RgADRpFjrKVaJ1z6sjtEg==`.
- Tarball: `https://registry.npmjs.org/@noble/hashes/-/hashes-2.2.0.tgz`.
- SHA-1: `22da1d16a469954fce877055d559900a6c73b63b`.
- Archive size: 180,002 bytes; unpacked size: 889,457 bytes; 98 entries.
- Runtime dependencies: none; bundled packages: none.
- Engine metadata: Node.js 20.19.0 or newer. The shipping use is browser-bundled ESM and the repository toolchain type-checks and builds it successfully.

All required values matched the Task 4 allowlist before installation. `package.json` and `package-lock.json` pin both packages without range operators. The lockfile records the audited tarballs and integrity values.

## License Files

`pako` ships two applicable notices:

- Root `LICENSE` contains the MIT license and copyright for Vitaly Puzrin and Andrei Tuputcyn.
- `lib/zlib/README` identifies the port as based on zlib 1.2.8, states that the port is under the zlib license with JavaScript contributions under the root license, and retains the Jean-loup Gailly and Mark Adler copyright and zlib terms.

`@noble/hashes` ships root `LICENSE`, containing the MIT license and Paul Miller copyright. Neither package tarball contains a separate `NOTICE` or `COPYING` file.

The generated application OSS inventory retains pako's `(MIT AND Zlib)` metadata and root MIT text. The installed package and this audit separately retain the applicable zlib provenance and terms from `lib/zlib/README`.

## Runtime Contract Verification

A direct Node ESM probe verified the public APIs before adoption:

- Pako raw `Inflate` with `chunkSize: 65` emitted a 65-byte first callback for a 4 MiB repeated-byte payload compressed to 4,105 bytes. Throwing from `onData` propagated synchronously after 15 compressed bytes and stopped with 4,090 bytes still available.
- With a 64 KiB output chunk, the exact stream completed with `ended: true`, `err: 0`, and `strm.avail_in: 0`.
- Appending three bytes completed the DEFLATE member while retaining `strm.avail_in: 3`; truncation left `ended: false`. These public fields distinguish exact completion, trailing input, and incomplete input without inspecting internal inflater state.
- Noble SHA-256 for bytes `[1, 2, 3]` was `039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81`, identical to Web Crypto.

Pako does not ship TypeScript declarations. The repository therefore defines only the used public `Inflate` constructor, callback, result flags, and `strm.avail_in` field in `src/types/pako.d.ts`; no additional type package is installed.

## Dependency And Audit Scope

- Pako 2.1.0 was already present through `ag-psd`; the exact direct dependency makes the ZIP reader's runtime contract explicit. Existing PDF dependencies retain their separate pako 1.0.11 copies.
- Noble hashes 2.2.0 was already installed through development tooling; the exact direct dependency makes synchronous production hashing explicit.
- `npm ls pako @noble/hashes --omit=dev --all` resolves the new direct packages exactly and shows no children below either one.
- `npm audit --omit=dev` reported 14 vulnerable packages elsewhere in the existing production graph: 8 moderate, 4 high, and 2 critical. Neither audited package appears in the vulnerability report, and neither can introduce a transitive advisory because both have no dependencies. No audit fix or unrelated dependency change was made.

Decision: approved for the bounded ZIP reader and synchronous pack-time content hash validation.

## Fflate Packer Version Gate

The container packer remains implemented by `fflate`, but its direct production dependency is now exact-pinned to `fflate@0.8.3`. This is required because the pre-inflate compressed-work budget intentionally matches that version's DEFLATE output allocation bound:

```text
uncompressed + 5 * (1 + ceil(uncompressed / 7000))
```

A semver-compatible fflate release could change the packer's block sizing or allocation formula without changing this reader. Any fflate upgrade must therefore inspect the candidate packer implementation, prove or update the bound, and pass the adversarial `ValidatedAssetContainer` tests plus the Task 2/Task 4/legacy combined gate before changing the exact pin.
