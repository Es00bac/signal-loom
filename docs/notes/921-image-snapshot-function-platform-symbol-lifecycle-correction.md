# Image snapshot function, platform, and symbol-lifecycle correction — 2026-07-17

## Scope and status

This Sol correction responds to Terra's two remaining High findings and symbol
lifecycle concern at exact clean baseline
`40cb5e16af65090d31820ede300f55bb8e96437a`. Production and permanent tests
are commit `1de7a81bcd0842285f18e480bcc5e77222a448dc`. This note records evidence for
a fresh independent Terra gate; it does not claim approval.

## Deterministic red evidence

The permanent callable, fresh-symbol lifecycle, and unsupported-platform cases
were added before production changed and run with:

`npx vitest run --configLoader runner src/components/ImageEditor/ImageSnapshotVerifiedState.test.ts -t "rejects callable|changed to a callable|releases cache-entry-owned fresh-symbol|no OffscreenCanvas" --reporter=verbose`

Result: **1 file failed; 4 tests failed, 1 passed, 41 skipped**. Bitmap and mask
callables entered verified ownership, post-cache callable replacement produced
only identity-token invalidation, and snapshot creation without
`OffscreenCanvas` returned a partial Canvas-shaped object instead of failing.
The repeated-symbol disposal case passed behaviorally but could not close the
process-global retention concern until the strong symbol map was removed.

## Correction

- Any callable reached through a bitmap or mask's own enumerable metadata graph
  now fails closed during bounded structural inspection, detached cloning,
  hardening, and cache-signature capture. Functions are never copied or bound
  by reference across snapshot ownership. Replacing an accepted cached value
  with a callable makes readiness fail before pixel readback or codec work.
- `cloneBitmap` no longer casts a small read-only object to `OffscreenCanvas`.
  If the platform lacks `OffscreenCanvas`, it throws
  `UnsupportedLayerBitmapPlatformError` with stable code
  `LAYER_BITMAP_UNSUPPORTED_PLATFORM` and an actionable runtime requirement.
  Snapshot creation fails before reading source pixels or installing a named
  snapshot. Test persistence codecs now install explicit class-shaped CPU test
  canvases rather than depending on the removed production fallback.
- The process-global `Map<symbol, number>` and global symbol counter are gone.
  Each bounded resource-signature traversal assigns local symbol ordinals and
  returns the exact encountered symbol identities with its digest. The verified
  `WeakMap` cache entry owns those arrays; cached inspection compares both the
  digest/alias structure and exact symbol references. Disposal deletes the
  cache entry, so fresh symbols have no process-global retention path.
- Enumerable symbol keys and symbol values retain alias/identity semantics.
  Replacing a symbol value with a fresh same-description symbol invalidates the
  cache. Verified resource graphs are non-extensible, so deleting an accepted
  symbol key makes a fresh-key replacement impossible and invalidates readiness.
  Existing cycle, alias, binary-content, exact-limit, accessor, Proxy, rollback,
  disposal, bitmap/mask/selection, project, and `.slimg` behavior remains under
  the same bounded traversal and integrity contracts.

## Permanent and green evidence

All Vitest commands used `--configLoader runner`.

- Verified-state lifecycle: **1 file / 47 tests passed**.
- Focused cache/bounds/digest/resource/native set: **5 files / 109 tests passed**.
- Snapshot-integrity lineage core: **13 files / 168 tests passed**.
- Historical complete snapshot matrix: **21 files / 262 tests passed**.
- Dirty-close/persistence matrix: **15 files / 229 tests passed**; only the
  existing unavailable-localStorage diagnostics appeared.
- Project persistence matrix: **8 files / 137 tests passed**.
- The five directly affected verification/persistence/UI files also passed
  **78 tests** after the final fixture typing correction.
- Forced nonincremental app and node TypeScript plus forced root project
  references passed.
- Current seven-file ESLint passed with **0 errors / 0 warnings**. The full
  **26-file** correction-lineage lint passed with **0 errors** and only the two
  inherited `react-refresh/only-export-components` warnings at
  `ImageEditorSourceSnapshotControls.tsx:67,122`.
- Unstaged and staged diff checks passed.
- `CI=1 npm run build` passed with **3,250 modules transformed**. It retained
  only the existing runtime-URL, browser externalization, `module.register()`
  deprecation, and large-chunk warnings.

## Residuals and gate handoff

Callable bitmap/mask metadata is deliberately unsupported rather than
partially detached. Platforms without `OffscreenCanvas` cannot create or clone
Image layer bitmaps and now receive the typed error; no CPU bitmap is installed
by production. Accepted symbols remain strongly reachable only for the lifetime
of their owning verified cache entry, as required for exact identity checks.
Cached readiness remains O(bounded metadata) with no Canvas pixel readback or
codec work; explicit create/decode/save/Restore remains O(pixel). SHA-256 is
integrity evidence, not authenticity, and native backing-store reclamation
timing remains platform managed. Fresh Terra approval is still required.
