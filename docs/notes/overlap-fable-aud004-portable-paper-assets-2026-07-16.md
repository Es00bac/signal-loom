# AUD-004 — Portable `.sloom` and “Package for print” now carry Paper's required bytes

- **Date:** 2026-07-16
- **Branch / base:** `overlap/fable-portable-assets` at reviewed integration `01c1532`
- **Production + tests commit:** `8173ee1` (this note is committed separately)
- **Finding:** `docs/audits/codebase-correctness-audit-2026-07-16.md` AUD-004 (Critical / Certain)

## What was broken

A portable `.sloom` stored Paper snapshots whose frames/fonts/profiles referenced
content-addressed asset IDs while the actual managed bytes (placed images, exact font faces,
license texts, CMYK ICC profiles) lived only in the source profile's IndexedDB
(`src/features/paper/assets/PaperAssetRuntime.ts`). Reopening on a clean profile lost artwork,
exact fonts, and ICC-dependent export. “Package for print” shipped JSON inventories and
explicitly stripped runtime data/blob URLs while omitting every linked byte.

## The repair — one validated content-addressed contract

New module: `src/features/paper/assets/PaperPortableAssets.ts`, following the proven `.slppr` v2
record model (`BinaryAssetRecord`/`BinaryAssetRef`, digest-verified) rather than inventing a
parallel scheme. `.slppr` v2 itself is untouched.

### Portable `.sloom` section

- `FlowProjectDocument.paperAssets` — schema `signal-loom/paper-portable-assets`, version `1`,
  entries `{ ref: BinaryAssetRef, dataBase64 }` sorted by id.
- **Enumeration:** only records reachable from every Paper tab document (active + `documents[]`
  catalog): frame locators on pages and parent pages, `importedFonts[].fontAsset`,
  `license.textAsset`, `managedIccProfiles[].asset` (single source of truth stays
  `collectReachablePaperAssetIds`). Paper style catalogs hold no binary refs; fonts named by
  styles resolve through `importedFonts`, which is covered. Deduplicated by digest across tabs.
  The section is built from the **normalized** save document, so managed→external locator
  remaps (`normalizeProjectMediaReferencesForSave`) can never strand unreachable bytes.
- **Validation:** canonical-base64 payloads; per-entry `byteLength`/`sha256`/MIME checked;
  duplicate ids rejected; traversal file names (`/`, `\\`, `..`, NUL) rejected; declared-size
  limits enforced **before decoding** (4 096 entries / 128 MiB per asset / 256 MiB total —
  JSON-safe versus the binary container's larger `.slppr` limits). No blob/object URLs, secrets,
  filesystem paths, or unrelated repository records can be serialized: entries are built only
  from digest-verified repository records for reachable ids.
- **Open/import (`restoreProjectDocument`):** the section is decoded and digest-verified in full
  BEFORE the first store or repository mutation, then staged transactionally with a rollback
  journal; any later restore failure rolls the staged records back (covered by test). Same-ID
  records already present are kept when they verify; stored bytes that no longer match their
  digest are **repaired** from the verified incoming copy (sha256 identity makes
  same-hash/different-byte input a corruption case, which fails verification and the open).
  Browser and Electron agree by construction: the section rides top-level project JSON, and
  `electron/main.mjs` `prepareProjectDocumentForNativeSave/Open` spread `...document`, passing
  it through byte-for-byte; all validation lives in the shared renderer path.
- **Legacy `.sloom` without the section** opens normally and reports explicit missing-asset
  diagnostics (per-record, naming role/label/document) through the existing Paper recovery
  channel — no fabricated completeness. Export of a missing record still fails loudly at
  materialization, as before.

### Font rights policy (fail closed, never silent)

`classifyPaperFontPackaging` in `src/lib/paperManagedFonts.ts`, per exact face:

| Face | Verdict |
|---|---|
| fsType `installable` / `editable` | packaged |
| `source.kind: 'bundled'`; authoritative version-pinned open-catalog (OFL-1.1/Apache-2.0/MIT + license text) | packaged (license text required to travel) |
| byte-bound attestation with `mayPackageEditableProject` | packaged |
| `restricted` / `bitmap-only` | fail closed |
| `unknown` / `print-preview` without packaging attestation; attestation bound to different bytes | fail closed (`attestation-required` / `attestation-mismatch`) |

Strict flows — **Project → Export .sloom Project**, Project Library export, and **Package for
print** — refuse with an actionable per-face diagnostic (family, PostScript name, reason, fix).
Plain Save/Save As is never blocked: disallowed faces are recorded as explicit
`excludedFonts` entries (bytes omitted, reason preserved) and surface as recovery diagnostics on
a clean-profile reopen. License texts of excluded faces are excluded unless an allowed face
shares them; a font asset shared by any disallowed face (e.g. one face of a collection) is
excluded as a whole.

### “Package for print”

`buildPaperPackageExport` (now async) reuses the same verified-record core
(`collectVerifiedPaperAssetRecords`, strict) and writes the actual bytes into the ZIP:

- `Links/<label>-<sha12>.<ext>` placed managed art (+ decodable data-URL Source Library links),
  `Fonts/<postscript>-<sha12>.<ext>`, `Fonts/Licenses/<license>-<sha12>.txt`,
  `Profiles/<description>-<sha12>.icc` — deterministic names (label + digest prefix, collision
  fallback to the full digest), sorted entries, identical across identical builds (tested).
- `manifest.json` version 2 adds `packagedAssets` (path/role/sha256/byteLength/MIME per file — a
  printer/validator can hash-verify every file) and `unpackagedLinks` (explicit per-link reasons
  for anything not embedded: missing item, runtime-only blob URL, external URL). Existing
  document JSON, preflight report, and link/font/color inventories are preserved; per-link
  metadata JSON stays free of runtime data URLs. Missing managed records or disallowed fonts
  fail the whole package instead of shipping inventories that lie — making the “Consolidate all
  layout assets for print” claim (`src/lib/i18n.ts`) honest.

### UI wiring

- `src/App.tsx` `file:export-project`: strict build + Export Project Failed dialog (was a
  silent unhandled rejection path).
- `src/components/Layout/ProjectLibraryModal.tsx` export: strict (existing catch shows the
  message). Save-to-library and plain Save stay non-strict by design.
- `PaperWorkspace.tsx` `paper:package-print`: awaits the async builder, reports embedded-file
  count, catches policy errors into the status line; the print-finalize flow awaits it inside
  its existing catch.

## Red → green proof (TDD)

Red run before any production code (`npx vitest run --configLoader runner` on the three new
files): **23 failed | 2 passed (25)** — failures were the missing section, missing policy
export, missing package bytes, missing rollback/diagnostics; the 2 passes were the
vacuous-until-implemented determinism/rollback guards. After implementation the same files pass
**25/25**, inside the focused sweep below.

Test boundaries exercised (not just manifest helpers):

- `src/lib/projectPaperPortableAssets.test.ts` — real `buildCurrentProjectDocument` /
  `restoreProjectDocument` through live zustand stores and the module-graph repository
  singleton. Headline gate: two Paper tabs (managed PNG per tab + one image shared across tabs,
  installable TTF + license text, real `public/icc/FOGRA39L_coated.icc` = 122 152 bytes), export
  → JSON transport → wipe every store and repository record (clean profile, `listRefs()` = 0) →
  reopen → 5 deduplicated records staged and digest-verified (`verifyBinaryAssetRecord` true,
  refs byte-identical), both tabs materialize concrete data URLs
  (`materializePaperDocumentAssetUrls`), linked-asset status `embedded`, and
  `resolveExactPaperOutputProfile` returns `ready` with bytes equal to FOGRA39. Plus: legacy
  file diagnostics; length-preserving corruption, truncation, duplicate ids, per-asset and
  4 097-entry limits, traversal file names → all reject with zero store/repository mutation;
  restricted-face exclusion + clean-reopen repair text; strict fail-closed; attested
  unknown-face packaging; same-ID corrupt-record repair; staged-record rollback when a later
  restore step fails.
- `src/lib/paperPackageExportAssets.test.ts` — unzips the real package: byte-identical
  Links/Fonts/Licenses/Profiles entries vs the seeded fixtures, digest manifest sorted,
  deterministic across builds, data-URL link embedded with clean metadata, restricted-face and
  missing-record fail-closed (error names the digest).
- `src/lib/paperFontPackagingPolicy.test.ts` — the seven rights rows above.

## Verification (all on the final tree)

| Gate | Result |
|---|---|
| Focused suites (`--configLoader runner`): 3 new files + projectDocumentActions, nativeProjectDocument, paperPackageExport, paperManagedFonts, SlpprFormat, `features/paper/assets/*`, paperManagedIccProfiles, paperPreflight | 15 files, **97/97 passed** |
| Affected/portability neighbors: ProjectLibraryModal, managedBundledFontPersistence, projectValidation, test_parse_frontend, paperStore, paperDocumentNativeSync | 6 files, **81/81 passed** |
| Full suite `npx vitest run --configLoader runner --reporter=dot` | **5 085 / 5 086 tests passed**, 640/642 files — the two failing files reproduce byte-for-byte on a pristine `01c1532` worktree (verified): `bundledFontPdfxIntegration.test.ts` needs the generated `build/font-library` inventory (`npm run prepare:font-library`, a dist-time step absent in any fresh checkout — the known clean-runner gap from the post-audit delta), and `scripts/verify-flow-production.test.mjs` reports the checked-in `docs/audits/flow-node-audit-2026-07-15.md` stale vs its generator at base. Both pre-existing, unrelated to AUD-004; audit artifacts were not touched per instructions. |
| `npm run verify:paper-production` | **passed** (artifact regenerated then removed from the tree) |
| Forced non-incremental TypeScript `npx tsc -b --force` | clean |
| Changed-file ESLint | 0 findings in authored lines; `PaperWorkspace.tsx` carries 3 pre-existing errors + 4 warnings at `openingZoomRef.current` (present at `01c1532`, line 9827, from commit `c653c57`) |
| `git diff --check` | clean |
| `CI=1 npm run build` | passed; `dist/index.html` mtime advanced (real build) |

## Residuals / follow-ups (not in scope)

- The pre-existing full-suite failures above (fresh-checkout font-library artifact; stale
  checked-in flow audit doc) belong to their own findings.
- Source Library links whose bytes are native-file/blob-backed are reported in
  `unpackagedLinks` rather than fetched into the package; embedding them would need async
  native reads in the package path (explicit, honest today).
- AUD-019 (Paper sync byte channel) still stands; this contract's staging/verify core is the
  natural building block for it.
- A UI affordance for granting `mayPackageEditableProject` on already-imported faces exists via
  the font attestation flow; if any surface only sets `mayEmbedOutput`, exports name the exact
  face and fix, so the gap is discoverable.

Not self-approved — awaiting the independent K3/Sol gate.
