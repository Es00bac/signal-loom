# 863: Image performance rewrite — pixel-store foundation

Implemented the first compatibility-safe storage slice of the Sloom Studio Image
performance rewrite. The live `ImageLayer` backend remains Canvas; no renderer or
tool has been switched to tiled storage yet.

## What shipped

- Repaired the pre-existing Windows packaging baseline. The unsupported Electron
  Builder `msix` target had already been reverted, but an invalid npm script,
  readiness claims, tests, and release artifact globs still advertised it. Windows
  packaging is consistently x64 NSIS-only again.
- Upgraded `TiledBitmap` from a fixed 256px prototype to configurable 128/256px
  sparse RGBA8 tiles with monotonic store/tile revisions.
- Added all-zero transparent-tile pruning. The implementation deliberately preserves
  alpha-zero pixels with non-zero hidden RGB so CPU byte parity is not weakened.
- Replaced exposed snapshot maps with opaque disposable COW snapshot handles.
  Restores compare buffer identities, invalidating only tiles that changed.
- Added deterministic reference audits, unique-buffer retained-byte accounting,
  snapshot eviction, store disposal, and bounded tile-region iteration.
- Added `LayerPixelStore`, implemented by `CanvasPixelStore` and `TiledPixelStore`,
  with region reads/writes, snapshots/restores, materialization, revisions, retained
  bytes, and disposal. Tiled materializations are cached by rect + revision and are
  read-only by convention.
- Added the internal policy seam: 128px tiles on mobile or reported memory <=4GB,
  256px otherwise; Canvas remains the fallback unless both rollout and startup
  self-test gates pass.
- Added deterministic COW startup self-tests and randomized byte-parity coverage for
  Canvas versus tiled stores at both supported tile sizes.

## Structure

- `src/components/ImageEditor/tiles/TiledBitmap.ts` owns sparse tile buffers,
  revisions, COW references, pruning, auditing, and lifecycle.
- `src/components/ImageEditor/tiles/LayerPixelStore.ts` defines the region-first
  public contract and the Canvas/tiled implementations.
- `src/components/ImageEditor/tiles/pixelStorePolicy.ts` owns adaptive tile sizing,
  backend gating, and the startup self-test.
- `src/components/ImageEditor/tiles/tiledCanvasInterop.ts` remains a temporary
  full-canvas bridge and now honors persisted tile size.

## Verification

- `npx vitest run src/components/ImageEditor/tiles src/components/ImageEditor src/lib/brushEngine`
  — 153 files / 1,486 tests passed.
- `npx tsc -b --pretty false` — passed before the final documentation sweep.
- `npm test` — 562 files / 4,206 tests passed.
- `npm run build` — TypeScript and Vite production build passed.
- Changed-file ESLint — passed with zero errors or warnings.
- Repository-wide `npm run lint` remains red on 23 pre-existing Paper-owned errors
  (`PaperWorkspace.tsx` ref/whitespace rules plus three Paper text/export whitespace
  rules). Paper is concurrently owned by another session, so this isolated Image
  branch deliberately did not modify those files.

## Caveats and next slice

- Canvas snapshots still retain full frames; COW memory wins start only after paint
  history migrates to `LayerPixelSnapshot`.
- Existing `ImageLayer.bitmap` and `mask` remain `OffscreenCanvas`. The next
  compatibility slice must convert direct `getContext()`/`convertToBlob()` helpers
  before the tiled policy can be enabled.
- Persistence still serializes legacy PNG/data URLs. Tile-size persistence lands with
  `.slimg`/`.sloom` v2, and readers must accept both 128px and 256px assets.
