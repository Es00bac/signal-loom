# Professional Redistributable Font Library Design

Date: 2026-07-15

## Objective

Ship a large, professional, offline-capable font library with Sloom Studio while preserving a defensible redistribution and print-embedding trail for every exact binary. The library must support Latin Extended and Japanese publishing on desktop, optional Chinese and Korean packs, exact managed-font use in Paper, PDF/PDF-X embedding, packaged projects, and an explicit printer/collaborator font handoff.

The library is a curated publishing toolbox, not an indiscriminate mirror of every free font. Version 1 contains exactly 107 desktop-base families: 87 Latin-oriented families and 20 Japanese families. The installed desktop font resources, licenses, manifests, and headroom must remain at or below 950 MiB. This leaves margin beneath the owner's 1 GiB ceiling.

No engineering process can guarantee immunity from a legal dispute. The release process provides exact provenance, license retention, automated checks, and human approval; counsel should review the final commercial distribution before public release.

## Approved Product Scope

- Windows, macOS, and Linux installers bundle the complete Latin Extended and Japanese base library.
- Android keeps a small built-in fallback and offers the audited packs by optional download or local sideload.
- Simplified/Traditional Chinese and Korean are separate optional packs on every platform.
- The collection balances editorial, corporate, display, monospace, comic, handwriting, and novelty roles.
- Fonts remain managed inside Sloom Studio. The application does not install them into the operating system.
- Users may export the exact original fonts used by a document, or selected complete families, with their licenses for a printer or collaborator.
- Static SFNT faces in TTF, OTF, TTC, or OTC files are the production baseline. WOFF/WOFF2 is not a production source.
- Existing opt-in Fontsource acquisition remains available for families outside the bundled collection, but it is not the provenance source for the curated packs unless the exact Fontsource artifact is independently approved and locked.

## Chosen Approach

Use immutable, unmodified upstream releases. Flagship families come from their authoritative projects, including Adobe Source, IBM Plex, Inter, Noto, and SIL. The curated long tail may come from the `google/fonts` repository at an exact commit because its top-level license directories organize redistributable binaries and each family contains its own license record.

The application does not build a derivative Sloom typeface, rename internal font families, convert formats, strip tables, or optimize font binaries. Avoiding modifications preserves upstream identity, reduces Reserved Font Name risk, and keeps the printer handoff byte-identical to its audited source. Procurement selects the newest stable, non-prerelease authoritative release available when the source lock is authored. A `google/fonts` source instead selects one repository commit for the entire pack. Human approval freezes every URL, version, commit, and hash before a binary becomes eligible; no floating branch, `latest` URL, or mutable CDN identity enters a release manifest.

Primary legal and provenance references:

- SIL Open Font License FAQ: <https://openfontlicense.org/ofl-faq/>
- Google Fonts binary repository: <https://github.com/google/fonts>
- Adobe Source Sans: <https://github.com/adobe-fonts/source-sans>
- Adobe Source Serif: <https://github.com/adobe-fonts/source-serif>
- Adobe Source Code Pro: <https://github.com/adobe-fonts/source-code-pro>
- Noto CJK: <https://github.com/notofonts/noto-cjk>
- IBM Plex: <https://github.com/IBM/plex>
- Inter: <https://rsms.me/inter/>

## Version 1 Catalog

The source lock records exact releases and faces. A display/handwriting family remains in the catalog only if at least one suitable unmodified static face exists. A text, editorial, or corporate family requires at least authentic Regular 400 and Bold 700 faces. Every family must pass the rights and technical gates. If a proposed family fails, the release cannot silently substitute another family; replacing it changes this approved catalog and requires a documented spec amendment.

### Foundations and superfamilies: 14

1. Source Sans 3
2. Source Serif 4
3. Source Code Pro
4. IBM Plex Sans
5. IBM Plex Serif
6. IBM Plex Mono
7. IBM Plex Sans Condensed
8. Inter
9. Noto Sans
10. Noto Serif
11. Noto Sans Mono
12. Liberation Sans
13. Liberation Serif
14. Liberation Mono

### Editorial serif and slab: 18

1. EB Garamond
2. Libre Baskerville
3. Crimson Pro
4. Cormorant Garamond
5. Spectral
6. Lora
7. Merriweather
8. Alegreya
9. Literata
10. Newsreader
11. Vollkorn
12. Cardo
13. Gentium Plus
14. Charis SIL
15. Andada Pro
16. Fraunces
17. Bodoni Moda
18. Playfair Display

### Corporate, brand sans, and slab: 20

1. Open Sans
2. Lato
3. Montserrat
4. Poppins
5. Raleway
6. Work Sans
7. Manrope
8. Fira Sans
9. Archivo
10. Barlow
11. Nunito Sans
12. PT Sans
13. Roboto
14. Roboto Condensed
15. Roboto Slab
16. Oswald
17. Josefin Sans
18. Mulish
19. Rubik
20. Space Grotesk

### Display, monospace, and technical: 19

1. Bebas Neue
2. Anton
3. Cinzel
4. Abril Fatface
5. DM Serif Display
6. Unbounded
7. Syne
8. Alfa Slab One
9. Black Ops One
10. Limelight
11. Staatliches
12. Lilita One
13. JetBrains Mono
14. Fira Code
15. Inconsolata
16. Space Mono
17. Roboto Mono
18. Cousine
19. Anonymous Pro

### Comic, handwriting, and script: 16

1. Comic Neue
2. Bangers
3. Luckiest Guy
4. Boogaloo
5. Chewy
6. Patrick Hand
7. Permanent Marker
8. Kalam
9. Shantell Sans
10. Caveat
11. Dancing Script
12. Pacifico
13. Sacramento
14. Great Vibes
15. Architects Daughter
16. Indie Flower

### Japanese: 20

1. Noto Sans JP
2. Noto Serif JP
3. BIZ UDPGothic
4. BIZ UDPMincho
5. M PLUS 1
6. M PLUS 2
7. M PLUS Rounded 1c
8. IBM Plex Sans JP
9. Zen Kaku Gothic New
10. Zen Old Mincho
11. Zen Maru Gothic
12. Shippori Mincho
13. Kosugi Maru
14. Klee One
15. Dela Gothic One
16. DotGothic16
17. Reggae One
18. RocknRoll One
19. Yomogi
20. Yuji Syuku

### Optional Chinese and Korean packs

The initial Chinese pack contains Noto Sans CJK SC, Noto Sans CJK TC, Noto Serif CJK SC, and Noto Serif CJK TC. The initial Korean pack contains Noto Sans KR, Noto Serif KR, IBM Plex Sans KR, Nanum Gothic, and Nanum Myeongjo. These nine optional families do not count toward the 107-family desktop base or its 950 MiB limit.

## Face Selection Policy

- Text, editorial, and corporate families include static Regular 400, Bold 700, Italic 400, and Bold Italic 700 when upstream supplies them.
- Families whose identity depends on a broader range may retain additional static weights. Noto, Adobe Source, IBM Plex, Inter, M PLUS, and the primary Japanese body families receive priority for broader ranges.
- Display, comic, and handwriting families retain their intended upstream styles; a single-style display family is valid.
- Sloom never synthesizes a missing weight or italic for production output.
- If an upstream release offers only a variable font, that family cannot use a locally instantiated derivative. It must use an upstream static release or fail the catalog gate.
- If the base pack exceeds 950 MiB, prune redundant intermediate weights before removing any required 400/700/italic face. Family removal requires a design amendment.
- Font files keep their upstream filenames and internal names.

## Pack Architecture

The canonical tracked inputs live in the Flow repository:

```text
font-library/
  manifests/
    desktop-base.json
    chinese.json
    korean.json
  sources.lock.json
  schemas/
    font-pack.schema.json
scripts/font-library/
  fetch.mjs
  audit.mjs
  build.mjs
  verify.mjs
resources/font-packs/            # generated/retrieved release artifacts; not normal Git blobs
```

`/home/cabewse/work_SPaC3/fonts` is the local fetch, audit, and pack-build workspace for this machine. It is not hard-coded into the application or required on another developer's machine. Commands accept an explicit work directory, and release automation may use another cache.

Each deterministic `.sloom-fontpack` archive contains:

```text
font-pack.json
SHA256SUMS
README.md
fonts/<family>/<upstream filename>
licenses/<family>/<copyright-and-license files>
notices/<family>/<NOTICE or supplemental attribution files>
```

The manifest records pack schema version, pack ID/version, scripts, byte totals, build timestamp/source commit, every entry hash, and a detached signature identifier. Each face record contains:

- stable face and family IDs;
- user-facing family/subfamily and PostScript names;
- weight, style, stretch, format, and collection index;
- source project, canonical URL, upstream version/tag/commit, and retrieval date;
- binary SHA-256 and byte length;
- license SPDX ID, exact license-file hash, copyright, Reserved Font Names, and required notices;
- approved rights for application redistribution, PDF embedding, subsetting, project bundling, and raw handoff;
- OpenType embedding flags and no-subsetting state;
- declared script/language coverage and intended-use category;
- human reviewer, decision date, and approval state.

Production pack manifests are signed by the Sloom release process. The application embeds the corresponding public verification key. Development-only unsigned packs require an explicit development build and are never accepted by a production build.

## Distribution

Electron-builder includes the verified desktop base pack as `extraResources`, outside Vite's `dist` tree. Capacitor therefore does not copy the desktop base into the Android package. At runtime Electron exposes bounded read-only pack metadata and exact font bytes through the existing main/preload boundary rather than a renderer-visible filesystem path.

Android obtains optional packs from the configured Sloom release catalog or through local `.sloom-fontpack` import. The catalog and archive signatures are verified before extraction. Downloads resume into a temporary location, and installation becomes visible only after the complete archive passes signature, hash, schema, size, path, license, and binary checks.

Chinese and Korean packs use the same download/import mechanism on desktop. Bundled desktop resources also pass signature and hash verification at startup; packaging is not assumed to make them trustworthy.

## License and Provenance Gate

Every exact face must pass all of these conditions:

1. The exact accompanying license permits commercial app bundling and redistribution, document/PDF embedding, and redistribution of the unmodified font for the approved handoff behavior.
2. The complete copyright notice, license text, and any required NOTICE file are present and readable.
3. The binary comes from an authoritative project release or an exact license-organized `google/fonts` commit.
4. The source identity, exact release, URL, hashes, internal license metadata, Reserved Font Names, and notices agree with the lock record.
5. The binary is an unmodified TTF, OTF, TTC, or OTC and passes bounded parsing, shaping, naming, checksum, and embedding tests.
6. OpenType embedding flags do not contradict the approved use. Restricted flags reject the face. A no-subsetting bit is honored by whole-font embedding.
7. A named human reviewer marks the exact release approved in the lock after inspecting the generated evidence.

The gate rejects personal-use fonts, ambiguous freeware, subscription fonts, missing license files, unofficial mirrors, unexplained binary drift, and bare claims that a font is a free download. Version 1 is expected to use OFL-1.1 and Apache-2.0 font releases; another license requires an explicit policy addition and counsel review.

The font collection is bundled as part of Sloom Studio and is not priced or marketed as a standalone font product. Exported handoff packages state that each original font remains under its included upstream license. Copyright-holder or author names are used for attribution only, never as product endorsement.

## Application Integration

Settings > Font Library gains four sources: Bundled, Optional Packs, Custom Imports, and Document Fonts. Users can filter by family, script, intended role, weight, style, source, and pack. A family detail view exposes upstream identity, exact version, supported scripts, installed faces, license, and rights summary.

Desktop bundled metadata is available offline immediately, but font bytes load lazily. Selecting a face for a document copies the exact binary and license evidence into Paper's existing content-addressed managed-font repository. Browser `FontFace`, HarfBuzz shaping, editor composition, and PDF export consume that same record.

A stable managed identity includes source, family, upstream version, face, and binary hash. Friendly family names never act as production identities. Two releases with the same family/PostScript name remain distinct managed assets, and the UI disambiguates their versions.

Documents and project packages include only their exact used faces and license evidence. Pack updates do not replace a face already pinned by a document. Removing a pack or face is dependency-aware: a used face must remain, be explicitly replaced, or be packaged into the document before removal.

## PDF and Print Behavior

- Native PDF/PDF-X export uses the exact managed font selected by the render plan.
- Used glyphs are embedded as a deterministic subset when permitted.
- A face marked no-subsetting is embedded whole.
- Synthetic styles, silent family fallback, silent version replacement, and browser/system authorization are prohibited.
- Missing assets, unsupported glyphs, or a mismatched binary block strict output and identify the affected text and repair action.
- Explicit text outlining remains available for deliberate display treatment; it is not a hidden license or missing-font fallback.
- The flattened KDP preset may resolve live font dependencies through its already-disclosed page-raster path, while native PDF/PDF-X retains exact managed-font requirements.

## Printer and Collaborator Handoff

`Export Font Package` supports two scopes:

- every exact font used by the active document; or
- user-selected complete families and faces from installed packs.

The ZIP contains original audited font files, complete per-family licenses/notices, SHA-256 checksums, `font-inventory.json`, and a human-readable `README.md`. The README identifies the document and selected face versions, explains each recipient's obligation to follow the included upstream license, and notes that a correctly embedded print PDF normally does not require separate font installation.

The handoff never exports a locally renamed, converted, stripped, or reconstructed font. It never extracts a PDF subset into a reusable font file. The exact upstream binary is the distributable unit.

## Coverage Policy

Latin body families are tested against the project's declared Latin Extended baseline, including common Western/Central European letters, Latin Extended-A, required punctuation/currency, and Vietnamese coverage where the upstream family claims it. The UI presents exact coverage instead of describing every Latin-oriented display font as universally complete.

Japanese body families are tested for kana, punctuation, vertical alternates where claimed, and the declared Joyo/JIS coverage baseline. Japanese display and handwriting families may be intentionally smaller. Their missing code points are visible before use, and strict output requires the document to choose an approved exact fallback rather than silently substituting one.

The Chinese and Korean packs publish region-specific coverage. SC, TC, and KR faces are never treated as interchangeable merely because their Unicode coverage overlaps; the selected regional glyph forms remain part of the managed identity.

## Error Handling and Security

- Archive readers bound file count, compressed/uncompressed sizes, compression ratio, path depth, and declared byte length.
- Absolute paths, traversal segments, links, duplicate normalized paths, and undeclared entries are rejected.
- Installation verifies the catalog signature, archive signature, manifest schema, every entry hash, licenses, font signatures, and exact declared byte totals before committing state.
- Failed downloads resume when safe; a hash/signature mismatch is quarantined and must restart from a trusted source.
- Installation is atomic. An interrupted or rejected pack cannot alter the active catalog or managed document assets.
- Offline or unavailable optional packs remain visible with a truthful status and local-import action.
- Duplicate family/PostScript names generate a review error unless the manifest explicitly documents distinct pinned versions.
- Automatic updates never replace fonts in an open or saved document.

## Verification

### License and supply-chain verification

- Validate every license SPDX ID, complete text hash, copyright, source origin, tag/commit, Reserved Font Name declaration, notice, and binary hash.
- Reject an unreviewed or stale approval after any source, binary, license, or metadata change.
- Re-open built packs and compare every byte to the source lock.
- Verify deterministic rebuilds produce identical archives apart from a separately defined signed envelope.

### Binary and typography verification

- Run each face through the existing bounded `paperFontVetting`, fontkit, and HarfBuzz paths.
- Validate SFNT checksums, tables, internal names, weight/style/stretch, collection index, embedding flags, and claimed Unicode coverage.
- Shape representative Latin Extended, Japanese horizontal/vertical, Chinese, and Korean fixtures as applicable.
- Confirm no required production style depends on synthetic weight or italic.

### PDF verification

- Generate an embedding fixture for every shipped face.
- Verify structure with `qpdf`, embedded font presence and expected identity with `pdffonts`, and rendering with Ghostscript.
- Run representative multi-family Latin and Japanese documents through PDF/X-1a and PDF/X-4 verification.
- Confirm permitted faces subset, no-subsetting faces embed whole, missing glyphs fail closed, and pinned versions survive reopen/export.

### Packaging and runtime verification

- Re-open every handoff ZIP and re-audit its binaries, licenses, hashes, inventory, and README.
- Confirm desktop installers contain and can use the complete base offline.
- Confirm Android build artifacts do not contain the desktop base pack.
- Install, resume, reject, remove, and restart optional packs on Android and desktop.
- Exercise corrupt ZIP, zip-bomb, traversal, missing-notice, duplicate-name, hash-mismatch, bad-signature, and interrupted-install fixtures.
- Measure installed desktop font resources and fail the release when they exceed 950 MiB.

## Acceptance Criteria

The feature is release-ready only when:

- all 107 approved desktop-base families have at least one approved face;
- the nine specified Chinese/Korean optional families have approved pack artifacts;
- every distributed binary has exact source, version, hash, copyright, complete license/notices, rights decision, and human approval;
- desktop base resources are no larger than 950 MiB installed;
- desktop use works entirely offline;
- Android excludes the desktop base and supports verified optional download/sideload;
- every shipped face passes the font and PDF fixture gates;
- Paper selects, shapes, persists, packages, and exports exact managed faces without synthetic styling or silent substitution;
- printer/collaborator ZIPs reproduce the original audited binaries and complete license trail;
- focused tests, the full test suite, TypeScript build, production build, and Paper production verifier pass;
- the final release inventory receives counsel review before commercial public distribution.

## Out of Scope

- Recreating proprietary Adobe Fonts, Helvetica, Times, or other commercial typefaces.
- Claiming metric or visual identity with a proprietary family unless an upstream project explicitly documents compatibility.
- Designing or modifying a Sloom-owned font family.
- Installing fonts globally into Windows, macOS, Linux, or Android.
- Automatically uploading packs or pushing release artifacts to public infrastructure without separate release authorization.
- Treating an embedded PDF font subset as a reusable font handoff.
