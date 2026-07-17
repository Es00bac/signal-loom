# Overlap: Fable combined Paper blocker correction (K3 gate) — 2026-07-17

Worktree `flow-overlap-fable-paper-combined-blockers`, branch
`overlap/fable-paper-combined-blockers`. Base `ebc96d7` (clean), correction commit `213f541`
(production code + permanent tests together). All five K3 combined-gate findings were
independently re-traced against the code before any edit; all five were confirmed
production-reachable and corrected. No finding was rejected.

## Findings, confirmation, and corrections

### K3-1 — Style-applied managed fonts bypassed exact export preparation (CONFIRMED)

Trace: `computeEffectivePaperFrame` (`src/lib/paperDocument.ts`) merges paragraph/character
style typography OVER frame typography, and `renderPrintFrame` applies it at render time —
while `buildPaperDocumentExactManagedFontOutput`, the `buildFlattenedPaperPageSvgExport`
manifest gate, and the strict preflight font loop all read RAW frame/run typography. Built-in
paragraph presets carry `fontFamily`, and `redefinePaperStyleFromFrame` copies full frame
typography (including family) into styles, so a style-supplied managed face is reachable through
the ordinary style dropdown. Failure modes proved by the red tests: a style-only managed face was
never collected (silent fallback raster paint), an aliased frame family was re-clobbered by the
raw style family (false "missing requested managed alias" block), and preflight
approved/expected the raw face render never paints.

Style-resolution strategy: one new export-only projection,
`resolvePaperDocumentEffectiveTypography` (`src/lib/paperDocument.ts`), built on the existing
`computeEffectivePaperFrame`. It bakes paragraph/character typography (+ paragraph columns) into
each frame and CLEARS `paragraphStyleId`/`characterStyleId` so downstream
`computeEffectivePaperFrame` passes (print HTML, one-page export docs) cannot double-apply
inheritance or clobber aliases. `objectStyleId` is preserved and object styles keep resolving at
render (they carry no typography; out of this correction's scope). The authored document is
never mutated; frames without style links keep reference identity. Consumers now in agreement on
the same effective face set:

- `buildPaperDocumentExactManagedFontOutput` collects/aliases from the projection and returns
  the baked (and, with faces, aliased) document (`PaperAssetRuntime.ts`);
- the `buildFlattenedPaperPageSvgExport` manifest gate collects from the projection
  (`paperPageFlattenExport.ts`), so bypassing callers block on the faces that actually paint;
- strict preflight resolves each frame through `computeEffectivePaperFrame` before its font gate
  (`paperProductionPreflight.ts`), so issues/`expectedFontIds` describe the effective face;
- the native vector PDF/X path already consumed effective frames via
  `resolvePaperPageFramesForOutput` (render plan/composition) and receives the AUTHORED
  document, so it is unaffected by aliasing and now agrees with CSS/preflight;
- every raster/native caller (Paper source export, envelopes, webcomic/CBZ/KDP, soft proof,
  browser PDF/X, Video storyboard, Electron PDF) flows through
  `buildPaperDocumentExactManagedFontOutput` and inherits the projection.

### K3-2 — Placed-document output lost its typed error contract (CONFIRMED)

`buildRasterizedPaperPageSourcePayload` rethrew only `PaperExactManagedFontError` and wrapped
`PaperPlacedDocumentRasterizationError` (raised by `assertPaperDocumentSupportsRasterization`
inside both flatten entrypoints) as generic `PaperPageOutputError`, dropping
`code`/`issues`. Fix: the catch now rethrows anything matching
`isPaperPlacedDocumentRasterizationError` unchanged. Consumers still present actionable text
without raw rejections: `PaperWorkspace.sendPaperPageToSourceLibraryById` and the Video
storyboard caller both catch `Error` and surface `error.message`, which for this type carries
the per-frame remediation text; the publish helpers still write nothing on failure.

### K3-3 — Video storyboard publication lacked final linked-source revalidation (CONFIRMED)

`importPaperStoryboardPages` (`VideoWorkspace.tsx`) materialized from a captured `libraryItems`
render snapshot and published with no revalidation. Fix (smallest shared optional contract):
`publishPaperStoryboardPageSourcePayloads` gained the same optional `assertBeforePublish`
parameter its sibling `publishRasterizedPaperPagesSourcePayloads` already had — called after the
complete batch is built and before the first publish. The Video caller now creates
`createPaperPlacedDocumentRasterizationGuard(paperDocument, () =>
useSourceBinStore.getState().getAllItems())`, materializes from `guard.sourceItems` (the pinned
immutable revisions), re-asserts after exact-font preparation, and passes the guard to the
publisher. Transaction ordering: guard creation (pins + capability assert) → materialize from
pinned snapshot → exact-font output → `guard()` → build all page payloads → `guard()` (inside
publisher) → first Source write. All-page atomicity, exact CSS, and unrelated-change tolerance
are unchanged.

### K3-4 — Print-package publication lacked final linked-source revalidation (CONFIRMED)

Both callers (`paper:package-print` and the print-finalize flow in `PaperWorkspace.tsx`) passed
live mutable store items into the async `buildPaperPackageExport` gather and downloaded with no
revalidation. The raster guard is the wrong tool here — its creation rejects placed PDFs, which
are legitimate package content. Fix: new identity-only
`createPaperLinkedSourceIdentityGuard`/`PaperLinkedSourceRevisionError`
(`paperPlacedDocumentRasterization.ts`), reusing the module's existing
`collectPaperLinkedSourceItemIds` and `paperPlacedSourceItemRevisionMatches` — no parallel
identity system. Source-identity boundaries: the guard pins deep-frozen full-record copies of
exactly the linked items (so mutable caller objects can no longer mix earlier bytes with later
metadata), and calling it compares symmetric presence (initially-present must remain present,
initially-absent must remain absent) plus the complete existing byte-identity tuple
`{id, mimeType, assetUrl, createdAt}` for every linked id, ignoring unrelated items. An
initially-dangling link stays on its existing `unpackagedLinks` path. Both callers now build
from `[...guard.sourceItems]` and call `guard()` after ZIP creation/validation and immediately
before `downloadBlob` — the only delivery route (no native package bridge exists). Strict
portable-asset validation and ZIP/member verification inside `buildPaperPackageExport` are
untouched.

### K3-5 — Portable-project validation ran before replacement authorization (CONFIRMED)

`replaceProjectDocument` ran `normalizeIncomingProjectDocument` (full `sanitizeProjectDocument`,
including portable Paper integrity) inside the stable phase BEFORE `beginProjectReplacementRequest()`
and before the paired Paper/Image decision — so Cancel paid full validation, malformed input was
deeply processed just to reach (or bypass) the dialog, and a deep-invalid request threw before
allocating a request identity, leaving an OLDER pending dialog current and eligible to commit.

Transaction ordering now: (1) bounded cheap checks inside the trap-bracketed stable phase — the
new `assertProjectDocumentReplacementCandidate` (`projectValidation.ts`, sharing
`isRecord` + the exact `sanitizeProjectDocument` error string, strictly weaker than full
validation) plus options normalization; (2) `beginProjectReplacementRequest()` — the identity
exists before any dialog, so a later bounded-but-invalid request retires older dialogs; (3) the
exact current Save/Discard/Cancel authorization (`requestProjectReplacementAuthorizations`,
unchanged); (4) full incoming validation inside `runStableWorkspaceNormalizationPhase`, which
fails closed if the payload mutates any workspace during inspection; (5) explicit
request-currency recheck, then `restoreNormalizedProjectDocument`, whose prepared transaction
re-proves request identity + both authorization signatures before provisional asset staging and
again at `assertCanCommit` before any store change. Invalid incoming projects reject without
mutating live state; the native two-phase path (`requestProjectReplacementAuthorization` +
`prepareProjectDocumentTransaction`) already had authorization-before-validation and is
unchanged.

## Red/green evidence (permanent, production-path)

Red baseline on `ebc96d7` (same command, before any production edit):

```
node_modules/.bin/vitest run --configLoader runner \
  src/features/paper/assets/PaperAssetRuntime.styleFonts.test.ts \
  src/lib/paperPageFlattenExport.test.ts src/lib/paperVideoAssets.test.ts \
  src/features/video/workspace/VideoWorkspace.paperStoryboardFonts.test.ts \
  src/lib/paperPackageExport.linkedSources.test.ts \
  src/features/paper/workspace/PaperWorkspace.packageDelivery.test.ts \
  src/lib/projectDocumentActions.replacementOrdering.test.ts \
  src/lib/paperProductionPreflight.test.ts
# 8 files failed — 18 failed | 37 passed
```

Every red failure was at the audited symptom, not a fixture error: missing `fontFaceCss` for the
style-supplied face; only 2 of 5 mixed-run faces collected; CSS demanded for a face that never
paints; `code: "PAPER_PAGE_OUTPUT_FAILED"` in place of the typed placed-document error (twice);
storyboard "promise resolved [...] instead of rejecting" after a same-ID same-MIME replacement;
`createPaperLinkedSourceIdentityGuard is not a function` (4×); both structure gates; 14 deep
property reads before the decision dialog; two ordering tests timing out on a dialog that never
appeared; the stale first dialog committing (`expected true to be false`); and a
`MISSING_MANAGED_FONT` blocker for a raw family the render never paints. The two deliberately
green-on-base cases are preservation pins (unrelated-source ordering; valid replacement commits
once).

Green after the correction (same command): **8 files, 55/55 passed**.

## Gates (all on the final tree, `213f541`)

- Bounded combined matrix `node_modules/.bin/vitest run --configLoader runner src/lib/paper
  src/features/paper src/features/video src/lib/project src/store/paperStore
  src/store/paperLoss src/components/Paper src/lib/sourceLibraryAppSource`:
  **151 files, 1438/1438 passed** — includes the FBL-003 FIFO/pairing/reset suites
  (`paperLossPreventionStore`, `paperLossPrevention`, `projectDocumentActions`,
  `projectDocumentActions.composedDirtyClose`), AUD-004 portable/clean-profile/rollback/package
  suites (`projectPaperPortableAssets`, `paperPackageExport`, `paperPackageExportAssets`,
  `PaperPortableAssets`), exact managed-font output suites (`paperExactManagedFonts`,
  `PaperWorkspace.sourceOutputFonts`, `paperPdfxBrowser`, `paperSoftProofBrowser`,
  `paperDocumentSave`), and AUD-018 source-revision suites
  (`paperPlacedDocumentRasterization`, `paperPlacedPdf`).
- FBL-003 startup piece run separately (path missed by the matrix filters):
  `src/lib/nativeStartupProjectReplacement.test.ts` — **12/12 passed**.
- Fresh non-incremental TypeScript: deleted both `.tsbuildinfo` files, `tsc -b --force`
  (app + node project references) — **exit 0**.
- Changed-file ESLint (all 18 files): **0 errors**, 15 warnings — all pre-existing hook/refresh
  warnings in `PaperWorkspace.tsx`/`VideoWorkspace.tsx`, none at changed lines.
- `git diff --check` (worktree and staged): clean.
- `npm run verify:paper-production` (output dir redirected to /tmp): **passed**.
- `npm run verify:flow-production`: **passed** — 9 files / 342 tests + audit (63 nodes,
  182 model contracts).

The full repository suite was deliberately not rerun once the focused and neighboring evidence
was green, per the gate instructions.

## Residuals

- The identity guard compares `{id, mimeType, assetUrl, createdAt}`; a hypothetical in-place
  byte change that preserves all four fields (including an unchanged `assetUrl` data URL) is
  indistinguishable — identical to the AUD-018 raster-guard boundary, by design.
- Preflight resolves effective typography only in the font gate; spot-swatch and transparency
  inspection still read raw frames. Object styles carry no typography today; if styles ever gain
  color/opacity semantics those gates need the same projection treatment.
- The live editor's face-registration path (edit-time collection in `PaperWorkspace.tsx`) still
  operates on raw selection typography; the correction scope was export preparation, and live
  paint continues to resolve through `paperManagedFontFamilyForLivePaint`.
- `replaceProjectDocument` now shows the Save/Discard decision before a corrupt file is deeply
  validated, so a user can answer Save/Discard and then see the file rejected. This is the
  mandated ordering; Save is non-destructive and Discard still captures recovery copies.
