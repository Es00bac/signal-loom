# Terra exact managed-font shipping-gap regressions

Base: `bacbac510f96e5b4cbae894c44f5ba315607dfa4`.

This note superseded the route-level claims in `922-terra-exact-managed-font-five-blocker-correction.md`,
but its Chromium collection-fragment claim was later disproved and is itself superseded by
`924-exact-managed-font-shipping-blockers-closed.md`. Fresh review remains mandatory and no approval is claimed.

## Corrected shipping invariants

1. Live Paper maps a managed family to its digest-derived registered alias. Registration now uses
   the exact standalone CSS source, and a missing, unreadable, or
   failed `FontFace` registration is an assertive visible blocked state rather than swallowed
   browser-family fallback. The picker/rich selection writes exact weight, stretch, axis defaults,
   and explicit oblique style; outline extraction carries each shaped run's coordinates into
   `glyphPath()`.
2. A current `paperAssets` section now requires both byte classes for every packageable managed
   face: the font and `license.textAsset`. Reopen rejects absent license references, absent
   license records, and license IDs listed in `missingAssets` before any repository/store staging.
   Policy-excluded faces retain their explicit recovery diagnostics.
3. Image and Video canvas paint no longer writes a non-standard Canvas 2D
   `fontVariationSettings` property. Variable managed text is blocked before pixels are painted;
   Paper uses the supported HarfBuzz shaping/outline route with retained coordinates.
4. Correction: Chromium ignores the PostScript-name URL fragment and can decode member zero even for a
   wrong or nonexistent fragment. Browser collection paint is therefore blocked; the selected member must
   be extracted to a standalone `.ttf`/`.otf` before import, paint, or browser-backed output.
5. Flattened SVG output refuses managed text without an exact manifest, verifies that every
   manifest alias is embedded in the isolated SVG, then performs descriptor-specific readiness
   checks before `Image.decode()`/canvas paint. This gate is shared by flattened PNG, raster PDF,
   CBZ/KDP/webcomic images, soft proof, and raster PDF/X.

## Permanent regressions

- Missing and explicitly `missingAssets` license text both reject clean-profile reopen before
  partial restore.
- Collection member zero, nonzero members, and nonexistent PostScript names all fail before CSS emission.
- Isolated SVG rasterization rejects an unloaded alias before constructing/decoding an `Image`.
- Image and Video variable Canvas paint reject rather than default-instance fallback.
- Paper managed SVG outline tests prove that a selected `opsz` coordinate reaches `glyphPath()`.

## Verification

- Focused Paper/project/shipping/Image/Video matrix:
  `npx vitest run --configLoader runner ...` — 15 files, 275 tests passed.
- Orchestrator handoff verification corrected two static defects in the uncommitted result: rich
  typography now admits/persists `fontStretch` and `fontVariationSettings`, and the portable
  license regression narrows optional Paper documents before iteration. The resulting focused
  rerun passed 11 files / 209 tests, including the new rich-run descriptor regression.
- Forced nonincremental TypeScript passed for app, node, and root configurations.
- `npm run prepare:font-library` passed; independent staged inventory read verified 116 families,
  430 faces, and 546 checksum entries.
- `npm run verify:paper-production` passed. Its generated proof directory was moved out of the
  worktree after verification.
- `CI=1 npm run build` passed.
- Changed-file ESLint has zero errors and five inherited warnings. The pre-existing render-time
  ref read in the changed editor was mechanically replaced with equivalent one-time state so the
  final committed tree does not carry the three React-compiler errors seen in Terra's first pass.
- `git diff --check` passed before commit.

## Review boundary

This is implementation evidence, not review approval. Fresh Sol review is still mandatory,
with particular attention to actual Chromium collection-fragment behavior and the isolated-SVG
descriptor gate on a clean renderer profile.
