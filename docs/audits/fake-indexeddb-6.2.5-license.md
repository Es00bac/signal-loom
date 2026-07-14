# `fake-indexeddb` 6.2.5 License And Provenance Audit

Audited on 2026-07-14 for Paper asset repository tests. The package is accepted only as an exact, development-only test dependency.

## Registry Provenance

Commands run before installation:

```bash
npm view fake-indexeddb@6.2.5 version license dependencies dist.integrity dist.tarball --json
npm pack fake-indexeddb@6.2.5 --dry-run --json
```

Observed values:

- Package/version: `fake-indexeddb@6.2.5`.
- License metadata: `Apache-2.0`; the tarball includes `LICENSE`, containing the Apache License, Version 2.0 text.
- Runtime dependencies: none. The registry response omitted `dependencies`, the installed manifest has no dependency map, and the dry-run reported no bundled packages.
- Integrity: `sha512-CGnyrvbhPlWYMngksqrSSUT1BAVP49dZocrHuK0SvtR0D5TMs5wP0o3j7jexDJW01KSadjBp1M/71o/KR3nD1w==`.
- Tarball: `https://registry.npmjs.org/fake-indexeddb/-/fake-indexeddb-6.2.5.tgz`.
- SHA-1: `74285b6821467d6c102af092f0a4517ad5521613`.
- Archive size: 52,568 bytes; unpacked size: 340,358 bytes.
- Package engines: Node.js 18 or newer.

All required values matched the Task 3 allowlist before installation.

## Package File Inventory

`npm pack --dry-run --json` reported exactly 120 entries. This is the complete inventory, grouped where CommonJS and ESM builds have identical relative paths:

- Root files (5): `LICENSE`, `README.md`, `auto.d.ts`, `package.json`, `types.d.ts`.
- Automatic injection entry (3): `auto/index.js`, `auto/index.mjs`, `auto/package.json`.
- CommonJS and ESM public modules (30 total, the following 15 names under each of `build/cjs/` and `build/esm/`): `fakeIndexedDB.js`, `FDBCursor.js`, `FDBCursorWithValue.js`, `FDBDatabase.js`, `FDBFactory.js`, `FDBIndex.js`, `FDBKeyRange.js`, `FDBObjectStore.js`, `FDBOpenDBRequest.js`, `FDBRecord.js`, `FDBRequest.js`, `FDBTransaction.js`, `FDBVersionChangeEvent.js`, `forceCloseDatabase.js`, `index.js`.
- CommonJS and ESM internal modules (56 total, the following 28 names under each of `build/cjs/lib/` and `build/esm/lib/`): `binarySearchTree.js`, `canInjectKey.js`, `cloneValueForInsertion.js`, `closeConnection.js`, `cmp.js`, `Database.js`, `enforceRange.js`, `errors.js`, `extractGetAllOptions.js`, `extractKey.js`, `FakeDOMStringList.js`, `FakeEvent.js`, `FakeEventTarget.js`, `getKeyPath.js`, `Index.js`, `intersection.js`, `isPotentiallyValidKeyRange.js`, `isSharedArrayBuffer.js`, `KeyGenerator.js`, `ObjectStore.js`, `RecordStore.js`, `scheduling.js`, `types.js`, `validateKeyPath.js`, `validateRequiredArguments.js`, `valueToKey.js`, `valueToKeyRange.js`, `valueToKeyWithoutThrowing.js`.
- CommonJS build marker (1): `build/cjs/package.json`.
- Compatibility declarations/shims (25): `lib/fakeIndexedDB.d.ts`, paired `.d.ts` and `.js` files for `FDBCursor`, `FDBCursorWithValue`, `FDBDatabase`, `FDBFactory`, `FDBIndex`, `FDBKeyRange`, `FDBObjectStore`, `FDBOpenDBRequest`, `FDBRequest`, `FDBTransaction`, and `FDBVersionChangeEvent`, plus `lib/package.json` and `lib/README.md`.

Count reconciliation: 5 + 3 + 30 + 56 + 1 + 25 = 120 files.

## Development-Only And Non-Shipping Scope

- `package.json` pins the exact version `6.2.5` under `devDependencies`; no range operator is used.
- `package-lock.json` records the package with `"dev": true`, the audited integrity, and no child dependencies.
- The sole source import is in `PaperIndexedDbAssetRepository.test.ts`. Production repository code accepts the platform `IDBFactory` and never imports the fake.
- Vite can only bundle the fake through a reachable production import, and there is none. Production dependency installs that omit development dependencies also omit this package.
- No automatic global-injection entry is imported. Tests instantiate the named `IDBFactory` explicitly, so the fake cannot alter production globals.

Decision: approved for non-shipping unit tests only.
