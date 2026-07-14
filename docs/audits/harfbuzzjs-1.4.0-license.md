# harfbuzzjs 1.4.0 License Audit

Audit date: 2026-07-14

## Provenance

- Package: `harfbuzzjs@1.4.0`
- Registry license field: `MIT`
- Tarball: `https://registry.npmjs.org/harfbuzzjs/-/harfbuzzjs-1.4.0.tgz`
- Integrity: `sha512-3KrygnLb4ESsntxvxZA7RhJy2Ci47GdXWC8fl9HwPHNEOUDXUNv5M+x/TiBkXKjUz6jz/CRJOL2Ksgq8V3UdKw==`
- Runtime dependencies: none declared

`npm pack --dry-run --json` reported only the package metadata, binding license and README, TypeScript
declarations, JavaScript bridge, and the `harfbuzz.wasm` / `harfbuzz-subset.wasm` binaries. The packed
package license is the standard MIT license credited to the harfbuzzjs project authors.

The upstream HarfBuzz `COPYING` file identifies HarfBuzz as Old MIT. The harfbuzzjs README states that its
WASM is a stripped HarfBuzz build compiled with `-DHB_TINY`; this is the origin of the runtime WASM used by
the Paper shaping adapter.

## Distribution Notice

The generated OSS inventory must retain the harfbuzzjs MIT notice and the upstream HarfBuzz Old MIT notice
for the embedded WASM. The package is used only as a shaping engine; no third-party font bytes are bundled
or distributed by this change.

## Runtime Packaging And Lifecycle

Vite copies the package's `dist/harfbuzz.wasm` unchanged to `dist/assets/harfbuzz.wasm`, adjacent to the
emitted JavaScript chunks. The package resolves its relative WASM URL from that location in the browser and
packaged desktop renderer. The build verification compared the source and emitted SHA-512 values:

```text
eb1b07a1170807b38f6af9e3e6ac30d2c28625448e3e7bb03fe218d7100dda7d2589bfa89358a34c9e9bfa9fe87b0b143ebb21c3eb5178ea08fef8ad4b0f4ab4
```

harfbuzzjs 1.4.0 exposes no public manual destructor for its Blob, Face, Font, or Buffer objects. The Paper
adapter never retains a per-call buffer, invalidates and releases every owned wrapper reference immediately
on `destroy()`, and fails closed after that point. The package's own `FinalizationRegistry` releases the
underlying WASM handles. This is recorded as a library API constraint rather than represented as a direct
native-destruction API.

## Commands Inspected

```text
npm view harfbuzzjs@1.4.0 version license dependencies dist.integrity dist.tarball --json
npm pack harfbuzzjs@1.4.0 --dry-run --json
```
