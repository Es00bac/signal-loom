# Sloom Studio Paper Workspace Production Audit Design

**Date:** 2026-07-14

**Status:** Approved design, awaiting implementation plan

**Scope:** Full Paper Workspace audit with the licensed print pipeline as the first release-blocking project

## Purpose

Audit every source path in Sloom Studio's Paper Workspace and bring the workspace to a defensible production standard. The first implementation project establishes a managed hybrid print pipeline for reliable PDF, PDF/X-1a, PDF/X-4, process CMYK, named spot colors, rich text, managed fonts, ICC output profiles, Stability upscaling, and PNG output. Later projects apply the same contracts to the rest of Paper's tools, import/export surfaces, persistence, collaboration, performance, and supported platforms.

The result must preserve Sloom Studio's business model: local-first software, no account, no telemetry, a perpetual offline commercial key, and professional print features behind the existing one-time commercial license.

## Product And Licensing Boundaries

The existing offline entitlement remains authoritative. This work must not change the private signing process, generated verifier, key format, pricing, entitlement persistence, or licensed feature set without a separate owner decision.

The commercial gate continues to cover PDF/X-4, PDF/X-1a, KDP-ready PDF, Adobe IDML, exact CMYK/spot production, and the related professional output actions. Community functionality remains free. The open-font browser and downloader is available to Community and commercial users because it is an asset-acquisition utility, not a print entitlement.

License checks happen at the production action boundary before expensive work and again before saving the result. They use the existing fail-closed, offline state. No account, telemetry, license server, or new network dependency is introduced.

New runtime dependencies require a documented license audit of the exact version, complete transitive tree, binary/WASM provenance, commercial redistribution rights, notices, and checksums. GPL, AGPL, network-copyleft, source-disclosure, or unclear prebuilt binaries are not acceptable for this architecture. Required notices join Sloom's existing generated OSS license inventory. No dependency may alter Sloom's PolyForm source license or the developer's ability to sell official commercial builds.

HarfBuzz is the preferred shaping engine only after that gate passes. The canonical HarfBuzz source uses the permissive Old MIT license and the official `harfbuzzjs` binding uses MIT; the selected artifact must still be audited rather than inferred from the project name.

Downloaded fonts retain their own licenses. Sloom records and enforces available evidence but does not make unsupported legal determinations for users. Open-font catalog downloads require a license record. Restricted fonts are rejected for production embedding. Ambiguous custom fonts require the user to attest separately that they may embed the font in output and package the source font inside an editable project.

## Current Risks Driving The Work

The initial source review found production-critical gaps that the implementation plan must reproduce with tests before fixing:

- The internal PDF/X checker verifies a useful structural subset but is described too strongly in places, and the current save path can download a PDF after that checker reports failure.
- Selected ICC profiles can be silently substituted, including mappings from FOGRA51/52 to older profiles. A custom profile name has no complete managed profile-byte path.
- Authored process CMYK swatches are commonly rendered through RGB and converted back to CMYK, losing the exact channel values the user selected.
- Overprint preview is currently metadata/UI state, not a PDF overprint graphics state.
- Spot output supports only a subset of fills, strokes, and text. Rich spot text can be reported as preserved even when its layout forces process rasterization.
- Total-ink limiting uses a post-conversion channel reduction that can change colorimetry without an explicit user decision.
- Font-family CSS strings and browser/OS availability remain authoritative in several editor paths. A different machine can reflow, substitute, or rasterize different glyphs.
- Imported fonts store raw Base64 in `PaperDocument`, use Boolean bold/italic matching, and can remain inline in `.slppr` manifests even though the container has a binary asset directory.
- Font vetting does not yet provide a complete production policy for bitmap-only rights, missing license metadata, collections, variable axes, corrupt coverage reads, or project-open revalidation.
- Stability requests do not fully normalize provider input. Conservative creativity can fall outside the current provider range, Fast commonly receives oversized input, and a 4 MP result can be resampled and incorrectly presented as true 300 DPI detail.
- The current replacement fit can change or double-apply cropping rather than preserving the placed composition.
- Project validation casts much of the Paper document instead of validating it field by field.
- `PaperWorkspace.tsx` has grown beyond 11,000 lines, mixing interaction, panels, provider actions, and export orchestration.

These are starting hypotheses, not the complete audit result. The evidence ledger will verify them and discover additional defects across the full workspace.

## Program Architecture

The work is split into four ordered projects. Each project receives its own implementation plan, verification report, and `docs/notes/` handoff.

### Project 1: Licensed Print Core

Build the shared binary asset contract, managed font and ICC libraries, deterministic text/render plan, CMYK/spot-aware PDF compiler, strict PDF/X preflight, Stability print-resolution pipeline, and output verification fixtures. This project is release-blocking because it supports paid product claims.

### Project 2: Layout And Interoperability

Audit and remediate drawing, selection, transforms, page/layout features, rich content, importers, normal PDF/PNG, KDP, booklet, reader spreads, CBZ, webcomic, HTML, IDML, project packages, and story exports. Migrate visual exporters to the shared render plan where applicable.

### Project 3: Document Integrity

Complete schema validation and migrations, binary asset packaging, recovery, undo/history reachability, source-library links, project synchronization, collaboration asset transfer, and hostile-project handling.

### Project 4: Runtime Quality

Verify and improve performance, memory, cancellation, accessibility, offline behavior, browser/Electron/Android parity, responsive behavior, and complete end-to-end workflows.

The projects are ordered because layout, interchange, persistence, and platform work depend on the document, font, color, asset, and render contracts established by Project 1.

## Audit Evidence Ledger

The audit produces a machine-readable ledger plus a human-readable report. Each row records:

- Feature, code path, platform, Community/commercial scope, and public claim.
- Status: implemented, partial, broken, unverified, documented-only, or unsupported.
- Severity, reproduction, expected behavior, actual behavior, and affected data.
- Required fix, owning module, automated tests, manual checks, and external gates.
- Verification evidence and the exact wording Sloom may use publicly.

Claims without independent evidence use precise labels such as `structurally verified` or `external verification pending`. They are never described as certified. Unsupported paywalled claims are release blockers or are corrected before release.

## WYSIWYG Contract

The editor and exporters consume one authoritative layout and render plan. Exporters do not independently reconstruct typography or geometry with browser CSS.

WYSIWYG means identical content, shaped glyphs, line breaks, geometry, page boxes, transforms, crop, clipping, stacking, effects, transparency decisions, and intended color separations. Unsupported native PDF effects are deliberately flattened from the same plan at the selected production resolution and disclosed in the export report.

Physical ink and paper cannot be reproduced literally on an arbitrary RGB monitor. The color contract is therefore ICC-managed soft-proof parity: exact authored CMYK/spot values remain authoritative, while the editor uses the selected output intent to preview process color, separations, gamut, paper simulation where supported, and overprint. UI and documentation must not promise an uncalibrated monitor will match a press sheet.

Golden fixtures compare editor reference renders with round-tripped PNG, PDF, PDF/X-1a, and PDF/X-4 renders. Tolerances distinguish antialiasing differences from layout, crop, missing-content, and color-separation failures.

## Binary Asset Store

No new document or application state may store binary content as Base64 or a `data:` URL. Legacy Base64 is migration input only.

`.sloom` and `.slppr` remain ZIP containers with JSON manifests. Binary data is stored once at a content-addressed path such as `assets/<sha256>.<extension>`. Manifest references contain a stable asset ID/hash, MIME type, byte length, and source/provenance metadata where applicable. Images, fonts, ICC profiles, generated/upscaled media, placed documents, and future binary resources share this service.

Desktop and Android working copies use project workspace/cache files. Browser sessions use Blob/File objects backed by IndexedDB or OPFS where available. Temporary object URLs are created by one resolver and revoked through reference tracking; object URLs never become durable document fields.

Portable saves package all required assets. Explicit external links remain possible but are represented as links, not fake packaged assets, and receive package/relink/missing status in preflight. Undo, redo, snapshots, and collaboration operations contain asset references only.

Legacy loading decodes Base64 and data URLs once, hashes and deduplicates the bytes, and writes binary assets. New saves never recreate Base64. Garbage collection considers the live document, undo/redo history, recovery checkpoints, pending saves, and in-flight exports before deleting a working asset.

Container loading validates normalized paths, entry count, compressed and uncompressed sizes, compression ratio, declared length, SHA-256, MIME signature, and decompression limits before exposing assets to decoders.

## Managed Fonts

Font-family strings are no longer production identities. The application font library stores managed faces by stable ID and content hash. Each face records family, subfamily, PostScript name, numeric weight, style, stretch, collection index, variable axes, Unicode coverage, format, source/version, license record, embedding flags, and user attestations.

There are two scopes:

- The application library stores fonts locally for reuse and offline operation.
- The document asset bundle contains the exact used faces when project-packaging rights permit it, allowing another Sloom installation to reproduce the document.

The font settings window offers an opt-in open-font catalog. No font service is contacted on startup. A first-run prompt may lead to this window, but no download is automatic. The initial catalog uses a keyless, documented source such as Fontsource for discovery and pinned TTF downloads, with authoritative family license records retained alongside each asset. Downloads without adequate license metadata fail closed.

Custom font import performs bounded parsing, table/checksum validation, per-face selection for collections, variable-axis extraction, Unicode coverage analysis, and embedding-right checks. Restricted and bitmap-only production embedding is blocked. Missing or ambiguous license evidence requires user attestation for output embedding and editable-project packaging. Sloom records the decision, timestamp, source filename/hash, and displayed terms without claiming it proves legal ownership.

Removal is dependency-aware. A used font can only be replaced, outlined where permitted, or left installed. System/browser fonts may remain unresolved draft references for legacy editing, but strict print export requires download, import, replacement, or an explicit supported outline conversion. Silent OS, browser, or Liberation substitution is removed from production output.

## Typography And Rich Text

The typography pipeline is:

`rich-text model -> face/style resolution -> bidi and script segmentation -> glyph shaping -> paragraph composition -> positioned glyph runs`

A license-approved shaping engine receives the exact managed font bytes and returns glyph IDs, advances, offsets, clusters, script/language direction, and feature substitutions. The paragraph composer handles line breaking, hyphenation, justification, tracking, paragraph spacing, drop caps, baseline shifts, run backgrounds and decoration, links, columns, threading, runaround, tables, vertical Japanese, kinsoku, furigana, emphasis marks, and mixed scripts.

Rich runs reference managed face IDs, numeric weights, styles, widths, variation axes, language/script metadata, and OpenType features. Faux bold and faux italic are forbidden in production. Managed fallback occurs per glyph and is recorded. Missing glyphs block strict export.

The editor renders the positioned result and uses its cluster-to-caret map for editing and selection. Browser layout is not allowed to choose production line breaks. PDF output embeds positioned, selectable glyph runs when supported. Explicit outline conversion preserves difficult display lettering. Raster text is a disclosed last resort at the production resolution, never a silent substitute.

PDF output embeds used subsets or complete fonts when subsetting is prohibited. Editable project files package the exact permitted font assets. Both behaviors are separately governed by recorded rights.

## Managed ICC Profiles And Color

ICC profiles use the shared asset service and have stable IDs derived from exact bytes. Import or opt-in download validates profile size, signature, class, input/output color space, PCS, tags, description, and CMYK output suitability. Each installed profile records hash, source, version, license evidence, and output condition metadata.

PDF/X fails closed if the exact selected profile is missing or invalid. No FOGRA, GRACoL, SWOP, or custom profile is silently mapped to another condition. A document may be opened without its profile, but soft proof and production export show a resolvable missing-profile blocker.

Typed paint values remain authoritative:

- Process CMYK emits the authored C/M/Y/K operands for native content.
- Gray emits an exact gray value.
- Named spot colors emit `/Separation` or `/DeviceN` with a validated unique plate name and managed alternate.
- Managed RGB artwork is converted through the exact selected ICC transform for strict CMYK output.

Exact authored CMYK is not silently altered to meet total-area coverage. TAC is measured and excessive values block strict export until the user changes the paint or explicitly runs a documented conversion. Raster black generation comes from the selected ICC transform; text/line black policy is applied consistently to native and flattened content.

## Render Plan And PDF Compiler

`PaperRenderPlan` is the stable boundary between editing and output. It contains resolved page geometry, objects, clips, transforms, shaped glyph runs, image placements, typed paints, transparency/compositing, source asset hashes, and object-level provenance.

The print compiler classifies plan nodes as native vector/text, native image, or deliberate flatten group. It must:

- Emit supported paths and text as native PDF content.
- Embed exact managed font faces with correct subset/full behavior.
- Preserve exact process CMYK, gray, and named spots.
- Apply real PDF overprint graphics states and expose them to separation preview.
- Convert managed RGB artwork through the selected ICC profile.
- Prevent duplicate raster and native rendering when content is promoted out of a flattened layer.
- Record every flattening, outline, conversion, fallback, and unsupported spot condition.
- Refuse output when a requested spot or other strict property cannot be preserved.

PDF/X-1a uses PDF 1.4-compatible content, CMYK/gray/spot only, embedded fonts, no encryption, and flattened transparency. PDF/X-4 may retain supported transparency and ICC-managed content; Sloom's strict CMYK preset still normalizes process artwork to the selected press condition. Both include the exact output intent, standard metadata, document/trailer IDs, trapping declaration, and correct MediaBox, TrimBox, BleedBox, and optional marks outside trim.

Plain print-ready PDF may reuse the managed engine without claiming PDF/X. Proof exports remain available when blockers exist but are clearly named and never carry PDF/X identity metadata.

## Stability Print Upscaling

Resolution planning uses the visible placed area, crop, page geometry, bleed, target DPI, source pixels, and reused placements. The UI reports actual dimensions and effective placed PPI.

Before a paid call, provider-specific validation checks file format, byte size, orientation, alpha handling, aspect, dimensions, pixel count, prompt, creativity, and expected cost. Fast requests are normalized to the provider's 32-1536 pixel side and 1,024-1,048,576 pixel limits. Conservative requests require at least 64 pixels per side, a valid supported aspect ratio, a prompt, and creativity within 0.2-0.5.

Fast returns four-times dimensions up to its documented maximum. Conservative returns approximately 4 MP. The pipeline never equates local interpolation with generated detail. If the provider result cannot meet the required placed PPI, strict print export remains blocked and reports the remaining deficit.

Upscaling is non-destructive. The original asset remains available; provider output is written directly as binary to the content-addressed store. The replacement preserves frame bounds, crop, transform, stacking, and source aspect. Unless a returned embedded profile proves otherwise, provider output is treated as managed sRGB and converted later through the selected print profile.

One source used in multiple frames is upscaled once to the highest required result. The user can compare, accept, reject, and revert. A document mutation occurs only after a complete, decoded, dimension-validated, hashed result is stored.

Requests read the existing encrypted Stability key and request binary output. Cancellation, timeout, invalid credentials, moderation, rate limiting, insufficient credits, malformed responses, and provider errors leave the document unchanged and clean temporary data. One authorized live Fast call and one authorized live Conservative call run only after all local tests pass; absence or rejection of the configured key is reported as pending, not converted into a pass.

## Layout And Interoperability Audit

The executable audit matrix covers:

- Drawing, selection, transforms, stacking, snapping, guides, parent pages, spreads, bleed, grids, rulers, and page management.
- Text frames, threading, runaround, styles, tables, bubbles, captions, SFX, Japanese vertical text, and mixed scripts.
- Images, placed documents, crop/fit, masks, effects, transparency, gradients, and source relinking.
- DOCX, PDF, IDML, JSON, HTML, RTF, TXT, and project ingestion where supported or publicly claimed.
- Plain PDF, PDF/X, PNG, KDP, booklet, reader spreads, CBZ, webcomic, HTML, IDML, document packages, and story exports.

Importers are transactional adapters: parse into an isolated candidate, validate schema/assets/fonts, report losses, and commit only on success. Specialized exporters may intentionally omit capabilities, but every omission appears in an export report.

`PaperWorkspace.tsx` is decomposed only after characterization tests, along tested ownership boundaries: workspace commands, canvas interaction, inspectors, dialogs, export orchestration, and feature controllers. This is not a visual rewrite.

Golden documents combine difficult features rather than testing only ideal rectangles. External products such as KDP, Acrobat, InDesign, Affinity, and real printers remain named external acceptance gates when unavailable locally.

## Document Integrity And Runtime

Unknown Paper documents are parsed field by field through a versioned runtime schema. Bounded strings, arrays, dimensions, enums, asset references, and nested records replace whole-document casts. Migrations are pure, ordered, idempotent, and tested from every supported version.

Saves build a new container, verify it, and atomically replace the prior file. Recovery retains the last known-good checkpoint. Asset reconciliation reports missing, corrupt, duplicate, orphaned, and external resources deterministically.

Collaboration and cross-device synchronization exchange operations plus content hashes. Assets transfer once through the asset transport with size/hash verification. Binary payloads never live inside repeated operations.

Image decoding, hashing, ICC conversion, flattening, font parsing, shaping, ZIP packaging, and PDF generation run behind bounded, cancellable services or workers. Page rendering remains virtualized. Decoded assets use memory-aware caches with explicit release.

Electron filesystem, Android project storage, and browser IndexedDB/OPFS implement the same asset interface and contract tests. Security review includes hostile containers, malformed fonts/ICC/images, oversized input, remote URLs, HTML/import sanitization, archive traversal and bombs, object-URL lifetime, credential leakage, temporary files, and cancellation cleanup.

## Preflight And Error Handling

Preflight issues have stable codes and three severities:

- `blocker`: output would be nonconformant, incomplete, incorrectly separated, missing a required asset, or below the production threshold.
- `warning`: valid output includes a disclosed conversion, flattening, outlining, gamut concern, or quality risk.
- `information`: output characteristics and positive evidence.

Each issue includes page/object or managed-asset location, explanation, evidence, and a direct fix action. Selecting an issue focuses the affected frame, font, swatch, image, or profile. Strict PDF/X blockers cannot be overridden.

Production export is transactional:

1. Freeze the document revision and referenced asset graph.
2. Resolve and verify assets, fonts, and profiles.
3. Compile and validate the render plan.
4. Generate into temporary storage.
5. Run structural, render, font, color, and separation checks.
6. Save only if all strict checks pass.

Cancellation or failure removes temporary output and preserves the document. Retrying the same frozen revision is deterministic.

The in-app export report records revision, standard, output profile hash, boxes, embedded fonts, outlined/raster text, process and spot plates, overprint, TAC, image PPI, flattening/conversion decisions, validator results, and pending external checks. An optional sidecar report contains no credentials or license keys.

## Verification

### Automated Coverage

- Unit and property tests for schema migration, hashing, font vetting, shaping, layout, color, plate planning, page geometry, and provider validation.
- Hostile-input fixtures for ZIPs, manifests, fonts, ICC profiles, images, HTML/imports, and legacy Base64 projects.
- Browser integration and Playwright workflows at desktop and mobile viewports.
- Electron and Android contract/smoke tests where the required runtime is available.
- Editor/export golden fixtures with round-trip visual comparison.
- Migration tests proving one binary asset per hash and no Base64 in new manifests/state.

### PDF And Print Evidence

- `qpdf` syntax and stream checks.
- Poppler metadata, font, text, and image inspection.
- Ghostscript rendering and `tiffsep` process/spot plate evidence.
- Exact process-CMYK operand and named-plate checks.
- Font subset/full embedding and missing-glyph tests.
- PDF/X-1a transparency flattening and PDF/X-4 preservation fixtures.
- Output-intent hash, metadata, document IDs, boxes, overprint state, TAC, and encryption checks.
- Deterministic Acrobat Pro Preflight fixtures and checklist.

Acrobat Pro is unavailable on the Linux development machine. The application must therefore say `structurally verified` until those fixtures pass Acrobat or another recognized independent PDF/X preflight. The internal validator is necessary but is not presented as ISO certification.

### Stability Evidence

- Provider request and error contract tests.
- Source normalization, output dimension, aspect, crop, placement, and PPI tests.
- Binary asset persistence and PDF/PDF-X/PNG integration tests.
- One live Fast and one live Conservative request using the existing configured credential after all local tests pass.

## Completion Criteria

Project 1 is complete only when:

- No unresolved critical, high, or fidelity-affecting medium defect remains in the licensed print path.
- Strict PDF/X output blocks invalid downloads and passes every locally available validator and render/separation check.
- Authored process CMYK and supported named spots remain exact and independently inspectable.
- Fonts are managed, portable when rights permit, and embedded/outlined without silent substitution.
- Editor/export parity fixtures pass within documented tolerances.
- Stability results are reported by achieved effective PPI and propagate through PNG, PDF, and PDF/X.
- External Acrobat status is stated honestly.

The full audit is complete only when every matrix row has evidence and every critical/high finding is fixed. Lower-severity findings remain visible and prioritized rather than hidden.

## Implementation Order

1. Establish the audit ledger and characterization fixtures.
2. Introduce the workspace-neutral content-addressed asset service and migrate Paper containers/state away from Base64.
3. Add managed font/profile registries, license records, opt-in font catalog, import vetting, and portability rules.
4. Add deterministic shaping, paragraph composition, and render-plan contracts.
5. Replace print compilation with exact process/spot/native-text output plus deliberate flatten groups.
6. Make PDF/X preflight and save fail closed; add export evidence reports.
7. Normalize Stability requests and results, preserve placement, and enforce achieved effective PPI.
8. Run local and authorized live verification, publish the Project 1 audit/remediation note, and prepare external Acrobat fixtures.
9. Continue Projects 2-4 through separate implementation plans using the same ledger and contracts.

## Authoritative References

- ISO 15930-4:2003, PDF/X-1a complete CMYK and spot exchange: <https://www.iso.org/standard/39938.html?browse=tc>
- ISO 15930-7:2010, PDF/X-4 color-managed exchange: <https://www.iso.org/standard/55843.html?browse=tc>
- Stability API reference: <https://platform.stability.ai/docs/api-reference>
- Google Fonts repository and per-family licensing: <https://github.com/google/fonts>
- Fontsource catalog and file API: <https://fontsource.org/docs/api/font-id>
- Microsoft OpenType `OS/2.fsType` embedding rules: <https://learn.microsoft.com/en-us/typography/opentype/spec/os2>
- HarfBuzz license: <https://raw.githubusercontent.com/harfbuzz/harfbuzz/main/COPYING>
- `harfbuzzjs` license: <https://raw.githubusercontent.com/harfbuzz/harfbuzzjs/main/LICENSE>
