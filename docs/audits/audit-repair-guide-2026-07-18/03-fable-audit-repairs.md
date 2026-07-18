# Fable audit repairs: what changed and what users should now experience

**As-of state:** 2026-07-18, after the audit-repair sprint reached 79/79 findings integrated and independently checked.  
**Scope of this file:** all 35 findings, `FBL-001` through `FBL-035`, from [the recovered Fable audit comparison](../fable-partial-audit-comparison-2026-07-16.md).  
**Status basis:** the final integration ledger in `/home/cabewse/work_SPaC3/model-research/sprint-ledger.md`, the repair evidence under `docs/notes/` and `docs/audits/`, and the named integration commits below.

## How to read this guide

The original Fable document was an audit, not an implementation report. Its “repair direction” text described what ought to change. This guide instead reports what was actually implemented and subsequently integrated. Each finding is described through four practical questions:

1. What could go wrong before the repair?
2. What correction was integrated?
3. What behavior should a user now see?
4. What was verified, and what limitation still matters?

“Expected current behavior” is the intended, regression-tested contract. It is not a claim that every neighboring feature or every operating-system rendering engine is flawless. Where a repair deliberately blocks an operation rather than risk incorrect output, that fail-closed behavior is called out.

Several Fable findings overlap findings in the other audit. Shared implementation is not double-counted:

- `FBL-005` materially broadens `AUD-020`; both were closed by the exact-font/flattened-output train.
- `FBL-011` extends `AUD-026`, but the fresh-process managed-face work is a distinct correction.
- `FBL-020` shares its runtime foundation with `AUD-007`.
- `FBL-031` is a narrower standalone-Paper ownership extension beside `AUD-019`.
- `FBL-009` was temporarily mentioned in an early Functions branch, but its actual closure is the later dedicated release-font artifact correction at main `939e4514`.

## Executive user-level result

The Fable repairs substantially changed five kinds of failure:

- Paper content is much less likely to disappear during save, reopen, tab replacement, close, crash recovery, or standalone package opening. Invalid material is retained as recovery information instead of silently replacing the workspace with a blank document.
- Authored typography now travels more consistently from the editor into managed composition, Canvas/SVG rendering, print, PDF/X, KDP, PNG, webcomic, Image, and Video output. When an exact face cannot be proven, strict paths stop with an actionable failure instead of silently substituting another face.
- Flow ports, lists, Switches, Functions, Composition tracks, and Cartesian runs now describe and execute the same graph. Planning, cost confirmation, resume, cancellation, and accepted provider work are tied to the frozen run that the user approved.
- Provider media output is labeled and packaged truthfully: valid ElevenLabs options survive normalization, PCM becomes a real WAV container, and BytePlus requests explicitly disable watermarks.
- Desktop font packaging, platform availability, localization, and multi-window locale state now have explicit authorities and verification instead of relying on incidental local state.

---

## 1. Paper project integrity, tabs, history, and ownership

### FBL-001 — Paper could reopen blank after media normalization changed asset identity

**Original defect.** A project save could capture a Paper snapshot containing managed asset IDs and then normalize the linked Source Library media to a different locator without rewriting that captured inventory. Reopen validation saw the mismatch, discarded the Paper snapshot, and restored a blank workspace. A subsequent save could make the blank state durable. A second partial serializer in the Project Library modal could also overwrite or export a project without its Paper, Image, or usage sections.

**Integrated correction.** Media normalization and Paper asset-inventory recomputation now happen as one consistent save transformation. On load, tabs are validated independently and recoverable invalid data is retained rather than causing whole-workspace blanking. The Project Library modal now delegates to the canonical full-project builder rather than maintaining a partial field list.

**Expected current behavior.** Saving and reopening a project with a migrated or Source-Library-linked managed image should preserve the Paper tabs and their media references. Saving, overwriting, exporting, or folder-linking through the Project Library should retain Paper, Image Editor, usage-ledger, and portable-asset sections. A legacy inconsistent project should preserve valid Paper content and recovery data instead of silently presenting a new blank document.

**Evidence and caveats.** Main integration `8a7eb97` with evidence `5dd828c`; Project Library follow-up is recorded in the same evidence note. The original repair ran 76 focused tests, 86 dependent tests, and a 951-test Paper/project sweep. The recovery object is durable and logged, but the original evidence notes that there was no dedicated Paper recovery banner/action at that point. Quarantined payloads remain in the project so they are recoverable, which can increase file size.

### FBL-002 — One malformed or duplicate tab could erase the entire Paper workspace

**Original defect.** The project validator treated the multi-tab Paper snapshot as all-or-nothing. A malformed tab, invalid asset reference, duplicate document ID, or stale declared inventory could cause every valid tab to be discarded and replaced by a blank workspace.

**Integrated correction.** Tabs are sanitized individually. Valid tabs survive; duplicate IDs receive stable repaired IDs; stale advisory inventories are recomputed; malformed or structurally invalid documents are quarantined with an index, ID/title when available, machine-readable reason, and serialized original payload. If every tab is invalid, the snapshot still carries explicit recovery information instead of collapsing to an unexplained `undefined` state.

**Expected current behavior.** Opening a three-tab project with one damaged tab should show the remaining valid tabs. Duplicate tabs should remain distinct rather than erasing the workspace. A resave after recovery should continue carrying the quarantined data so the act of opening and saving does not destroy the last recoverable copy.

**Evidence and caveats.** Shared main integration `8a7eb97` / evidence `5dd828c`; the permanent fixtures include corrupt tabs, duplicates, invalid references, all-tabs-corrupt state, second save, and reopen. Structurally unsafe managed references still reject the affected document. The repair intentionally did not reinterpret invalid document data as valid content.

### FBL-003 — Dirty Paper tabs could be closed or replaced without a reliable save/recovery decision

**Original defect.** Closing a Paper tab was a direct store action. Dirty state, per-document confirmation, crash reset, startup replacement, native project handoff, and combined dirty Paper/Image replacement did not share one trustworthy transaction. During the repair effort, independent checks also found stale dialog decisions, overlapping same-key prompts, authorization races, retained live-object references, hostile option accessors, and late callbacks that could overwrite newer work.

**Integrated correction.** Paper now participates in a coordinated Save/Discard/Cancel loss-prevention transaction across close, replacement, startup, crash reset, handoff, and shutdown-adjacent paths. Decisions are queued as distinct FIFO entries rather than coalesced by a shared key; visible actions are bound to the exact request ID. The transaction revalidates Paper/Image/workspace identity before mutation, captures all dirty tabs for recovery, uses detached frozen summaries rather than live store objects, and rolls back cross-store work when commit fails. The queue is bounded and fails closed as Cancel when full.

**Expected current behavior.** A dirty Paper tab should not disappear merely because the user closes it, opens/reloads another project, a remembered project arrives late, the application resets after an error, or another workspace also needs a decision. Save applies to the exact authorized document; Discard retains the bounded recovery route; Cancel leaves the current workspace alone. A stale dialog click or late async completion should not settle the next request or overwrite a newer document.

**Evidence and caveats.** The approved FBL-003 lineage was integrated as the Paper transaction train through main `be9b373`, then reconciled with portable assets, exact fonts, and linked-source work at `ebc96d7`. Evidence includes 100+ focused transaction cases, broad Paper/project/Image/Source/Flow matrices, both production verifiers, TypeScript, lint, and build checks; final queue evidence is in `docs/notes/fbl003-paper-loss-decision-queue-correction-2026-07-17.md`. Recovery and history are bounded, not infinite. A provider or operating system operation already dispatched outside the renderer may not be physically cancellable, but late results are not authorized to replace current state.

### FBL-004 — Asymmetric bubble-warp controls were lost during frame normalization

**Original defect.** `createPaperFrame` retained the base bubble-warp value but omitted the left, right, top, and bottom edge fields. Recreating, normalizing, saving, or reopening a frame could collapse an intentionally asymmetric speech-bubble warp.

**Integrated correction.** Frame construction now explicitly carries all four per-edge warp values, and the constructor is checked against the `PaperFrame` key set so newly added fields cannot be omitted casually.

**Expected current behavior.** A bubble with different warp values on its four edges should keep that exact shape through tab changes, normalization, project save, and reopen.

**Evidence and caveats.** Integrated as `5226293`, with a TypeScript exhaustiveness correction in `20c2fe5`; 47 Paper document tests and forced TypeScript passed. Future frame fields still need an intentional sanitization/default policy, but omission now becomes much easier to detect.

### FBL-021 — Switching Paper tabs destroyed undo and redo history

**Original defect.** Paper used one global undo/redo pair and cleared it whenever the active document changed. A user could edit tab A, work in tab B, return to A, and discover that A's undo history was gone. Recovery capture also omitted the history of inactive dirty tabs.

**Integrated correction.** Each open Paper document now owns a bounded runtime history. The active tab keeps the compatible top-level stacks; inactive tabs store their own histories in a document-keyed map. Tab switching stashes and restores the correct stacks, closing removes only that tab's history, and dirty recovery captures the selected tab's history even when it is inactive.

**Expected current behavior.** Moving A → B → A should restore A's undo/redo state; returning to B restores B's. Closing one tab should not erase another tab's history. Restoring a deliberately discarded tab should restore its own bounded history rather than another document's.

**Evidence and caveats.** Integrated through main `3e78876`; the integration matrix passed 311 tests. Histories are deliberately runtime-only and are excluded from `.sloom`, `.slppr`, and persisted workspace snapshots. They therefore do not survive a normal application restart, except inside the existing bounded deliberate-recovery records. Memory use grows with the number of open tabs but each stack remains capped.

### FBL-031 — Standalone `.slppr` opening bypassed the project edit-ownership transaction

**Original defect.** Local standalone Paper packages could mutate the local tab catalog and managed-record repository without going through the edit-baton/project authority used for coordinated project loads. The host might later reject remote publication, but local state had already diverged.

**Integrated correction.** Native menu open, browser/Android picker, native external-open, and baton-handoff cards now converge on one `openStandaloneSlpprDocument` transaction. Package bytes are validated and staged off-store; edit ownership, exact Paper workspace identity, and desktop project authority are checked before and after preparation; managed records publish atomically with exact rollback. Subsequent corrections serialize concurrent same-package opens and bind the operation to an uninterrupted holder grant plus a local continuity epoch, so an away-and-back ownership cycle cannot masquerade as uninterrupted authority.

**Expected current behavior.** A permitted standalone package should add a clean tab without replacing existing tabs, retain its writable backing path when appropriate, and publish all required managed bytes together. A remote holder, ownership transfer, project switch, concurrent losing open, or workspace drift should leave both the tab set and managed repository unchanged. Ordinary same-holder heartbeat updates do not spuriously reject a large open.

**Evidence and caveats.** Closed on main through `c438735d`; real-main passed 142 related tests, both TypeScript projects, lint, diff, and build. This is an additive open contract; it does not turn standalone packages into an automatic replacement for the current project.

---

## 2. Paper typography, exact fonts, and production output

### FBL-005 — Flattened output could substitute managed fonts; KDP skipped the exact-font gate

**Original defect.** Flattened Paper output serialized HTML into an isolated SVG/`foreignObject` but did not carry the managed font's exact bytes and descriptors into that isolated document. KDP, soft proof, PNG/webcomic, CBZ, raster PDF, and flattened PDF/X could therefore paint a system fallback even when the editor had the right face. Some paths assumed flattening had already made font verification unnecessary.

**Integrated correction.** Exact managed-font manifests, digest-derived runtime aliases, embedded verified bytes, complete `@font-face` descriptors, and descriptor-specific readiness checks now travel into isolated output documents. Browser print and rasterization require a non-empty load of the requested alias and a successful face-set check before paint. Portable projects carry reachable verified font and license records transactionally. Collection fonts that the browser cannot select reliably are stopped before paint instead of silently choosing a member. Later combined-Paper corrections also made style-applied character/paragraph fonts pass through the same exact identity and preflight rules.

**Expected current behavior.** If a Paper layout uses an authorized managed font, strict PDF/X, KDP, PNG/webcomic/CBZ, soft proof, raster PDF, print-window, reader/booklet, Source publication, and storyboard routes should use the same exact face identity as the editor. If the font bytes, license, descriptor identity, or browser readiness cannot be proven, the strict operation should stop with an actionable error before partial output or Source publication rather than quietly substitute a local font.

**Evidence and caveats.** The exact-font train is integrated through `97a1ee2`, with combined shipping-route correction integrated at `0305d4d` and evidence in `docs/notes/920-fbl-005-aud-020-terra-reconciliation.md` plus `924-exact-managed-font-shipping-blockers-closed.md`. Tests cover isolated rasterization, browser print, portable reopen, live rich editing, Source/storyboard publication, and PDF/X production verification. TTC/OTC member extraction is intentionally not implemented; users must extract a selected face to standalone TTF/OTF. Strict failure in that case is expected behavior.

### FBL-006 — Managed composition dropped rich leading and advanced run/paragraph typography

**Original defect.** The exact managed-font composer used frame-level defaults where rich paragraphs or runs had their own leading, kerning, numeric style, final-line alignment, strict breaking, orientation, emphasis, or small-caps override. That made live managed text, render plans, and native PDF wrap or paint differently from the rich editor. Some first-line/first-column overflow cases also falsely reported that text fit.

**Integrated correction.** The composer now resolves leading with run → paragraph → frame precedence; line/column boxes use the largest relevant size/leading; kerning and numeric OpenType features resolve per run; `alignLast` and strict Japanese breaking resolve per paragraph. The independent correction then carried orientation and all emphasis styles through composer, managed SVG, render plan, and native PDF; honored explicit `smallCaps: false`; rotated mixed Latin while retaining upright/CJK vertical shaping; and based overset on actual first-box/post-rollover geometry.

**Expected current behavior.** Mixed rich ranges should keep their own leading, kerning, number style, orientation, emphasis, and small-caps intent in both live managed rendering and native output. Paragraph final-line alignment and Japanese break behavior should follow the authored paragraph. Text that does not fit the first horizontal line, first vertical column, or a post-rollover box should be marked overset instead of silently treated as fitting.

**Evidence and caveats.** Independently approved and integrated through main `c56d3ee4`; real-main passed the 39-test shipping set, TypeScript, lint, diff, and Paper production verification. Evidence and preserved PDF/X artifacts are documented in `docs/notes/934-fbl006-canonical-computed-typography.md`. This repairs the shared managed composer; browser/platform raster engines remain separate consumers with their own exact-font gates.

### FBL-007 — Changing zoom during rich editing changed authored type size and leading

**Original defect.** Editor DOM values were created using the zoom at edit start but converted back using the zoom at commit. A 24-point run opened at 100% and committed after switching to 200% could become 12 points; leading changed similarly.

**Integrated correction.** Each rich-editor session captures its opening scale and uses that stable scale for DOM seeding, selection patches, rewrites, and final serialization.

**Expected current behavior.** Zooming in or out while a text edit is active should change only the view. Committing should retain the authored point sizes and leading for mixed runs and paragraphs.

**Evidence and caveats.** Integrated as `d4e46c4`, with reconciliation at `c653c57`; lifecycle tests cover 100% → 200%, 200% → 50%, mixed explicit sizes, leading, and unchanged zoom. This does not promise that text will not visually reflow while zoom changes; it protects the stored authored units.

### FBL-008 — Vertical-writing changes could be lost during an active rich edit

**Original defect.** The vertical-writing control took a rich-edit branch that retained paragraph alignment but returned without persisting `writingMode`. The checkbox could appear to change while the frame kept its previous direction.

**Integrated correction.** Writing mode is now part of the same retained rich-editor typography transaction used for the frame update, combining the live retained selection result with the complete frame patch.

**Expected current behavior.** Toggling horizontal/vertical writing should persist with an active selection, a collapsed caret, or no active editor; it should survive Paper JSON save/reopen without discarding current rich text.

**Evidence and caveats.** Integrated as `6726462` with shared evidence `b261bb3`; focused/editor/document format tests passed. The repair uses the existing frame update and undo transaction rather than creating a separate undo step.

### FBL-009 — Official desktop packages could omit the entire bundled font library

**Original defect.** A local developer build could contain `build/font-library`, while clean release CI had no source or mandatory staging step. Electron Builder tolerated the absent extra resource, producing an apparently successful installer whose bundled-font requests returned 404.

**Integrated correction.** The release now reconstructs the audited 116-family/430-face collection from pinned upstream revisions and hashes, verifies an exact 546-payload font/license inventory, stages it atomically, and makes Electron Builder `beforePack` and `afterPack` hooks mandatory. Desktop CI builds one verified transient artifact for every platform lane; post-pack smoke resolves a known exact face and its license from the packaged application.

**Expected current behavior.** A desktop installer should either contain the complete verified bundled library or fail packaging. It should not ship successfully with an empty font resource. The installed application should be able to resolve Liberation Sans Regular and its matching license from packaged resources.

**Evidence and caveats.** Dedicated production/tests `66a7b3ee`, independently approved and landed as main `5cf74bf5` / evidence `939e4514`. Independent verification reconstructed 116 families, 430 faces, and 546 payloads, exercised missing/altered/unsafe/extra cases, ran direct Electron Builder hooks, and resolved the real packaged face/license. The upstream inputs are network/cached-source dependencies during reconstruction; immutable revisions and hashes make unexpected content fail rather than drift. This repair verifies the declared redistributable pack; it is not a new legal opinion about third-party licensing.

### FBL-010 — Condensed and expanded managed faces did not retain width/stretch identity

**Original defect.** Font vetting recorded an OS/2 width class, but Paper requests often normalized stretch to 100%. A valid 75%-width face such as IBM Plex Sans Condensed could be rejected by strict preflight, or a draft route could use a normal-width fallback.

**Integrated correction.** Exact Paper face identity now includes stretch, explicit oblique angle, weight, style, and supported variation coordinates from picker/import through live registration, rich-editor serialization, duplicate/selection behavior, composition, portable project records, preflight, browser output, and native PDF. Relative `bolder`/`lighter` runs resolve against their frame before exact-face selection.

**Expected current behavior.** Selecting a condensed or expanded managed face should keep that width in the editor, after save/reopen, and in strict output. Preflight should accept the exact authorized condensed face and reject a descriptor collision or unavailable exact face rather than substituting normal width.

**Evidence and caveats.** Closed as part of the exact managed-font train through `97a1ee2`; the reconciliation evidence explicitly covers stretch/oblique/relative-weight identity and strict browser readiness. Percentage Canvas stretch remains dependent on supported browser engines, but Paper's strict managed shaping/native output uses the verified exact face. Collection-member limitations described under `FBL-005` still apply.

### FBL-022 — Paragraph leading was materialized into every run

**Original defect.** Rich DOM extraction copied inherited paragraph leading onto each run. A highlighted run could not reliably author an explicit smaller leading without accidentally replacing paragraph leading or being rounded back through computed CSS pixels.

**Integrated correction.** Generated spans carry run-leading metadata only when the run explicitly owns it. Serialization treats paragraph leading as inherited context, retains exact authored point values for explicit runs, and distinguishes highlighted run edits from caret-only paragraph edits. Styled blank-paragraph placeholders are serialized as one paragraph rather than duplicated.

**Expected current behavior.** A user can select a range and give it explicit leading below the paragraph value; that distinction survives range splitting/merging, save/reopen, and deterministic composition. A caret-only leading change still updates the paragraph. A larger run can raise the line box; a smaller run does not erase the paragraph's shared floor.

**Evidence and caveats.** Independently approved and landed through main `5931420f`; real-main passed focused tests, TypeScript, lint, build, and Paper production verification. This intentionally preserves `FBL-006` line-box rules rather than changing them.

### FBL-023 — The head of a threaded rich story could render the full story instead of its slice

**Original defect.** Threaded rich text computed a range but the head frame could render the complete payload. Across subsequent review, this also exposed half-open range errors around blank paragraphs, CR/LF/CRLF, list markers, folio tokens, paragraph decorations, destination metrics, vertical/horizontal spacing, and Canvas measurement acceptance. The result could be duplicated, missing, concatenated, or falsely non-overset text at frame boundaries.

**Integrated correction.** Every threaded frame now renders its authoritative rich/plain slice. The range model conserves structural delimiters and blank paragraphs, assigns list/folio/paragraph decoration ownership once, retains destination typography/geometry, substitutes folio values, and measures the same stretch/variation/kerning inputs used by live rendering. Canvas measurement verifies that requested typography was actually accepted and uses a bounded, exception-safe live-CSS fallback when it was not.

**Expected current behavior.** Text should flow across linked frames without the first frame repeating the whole story, later frames losing leading/terminal blank paragraphs, inline newlines disappearing, list markers shifting the range, or decorations repeating. Horizontal and vertical exact-fit/overflow decisions should follow the rendered geometry, and continuation frames are non-editable views of their assigned slice rather than independent copies.

**Evidence and caveats.** The complete approved lineage was replayed and closed at main `909cc97`; the real-main gate passed 140 focused tests, TypeScript, and Paper production verification, with artifacts preserved externally. This was one of the deepest “Medium” tickets because its final contract crosses source ownership, typography, Canvas feature detection, and rendering. Manual visual qualification with unusual fonts and long real publications is still useful, even though the structural regressions are permanent.

### FBL-024 — Print HTML omitted `each-line` paragraph indentation

**Original defect.** The editor retained each-line indentation, but print HTML emitted a plain `text-indent`, creating an editor/export mismatch for wrapped paragraph lines.

**Integrated correction.** Both rich-editor DOM CSS and print HTML emit the `each-line` qualifier for that paragraph setting.

**Expected current behavior.** Paragraphs authored with each-line indentation should retain that rule in print/output HTML rather than reverting to first-line-only behavior.

**Evidence and caveats.** Integrated as `6911617`; the focused two-file set passed 55 tests and forced TypeScript. Final layout still depends on whether the target browser/PDF engine implements the CSS `each-line` behavior.

### FBL-025 — The bundled-font browser was offered where its transport was unavailable

**Original defect.** LAN/web/Android renderers could display the bundled-font browser even though the `signal-loom-font` transport existed only in a properly configured Electron process. Early gating also inferred capability from a generic preload bridge, which could exist while the font root was missing. Async bridge swaps and Paper selection/authentication could publish stale catalog, callback, or typography state.

**Integrated correction.** Electron now exposes a dedicated font-library status tied to the exact resolved protocol root. Renderer capability fails closed while pending, missing, rejected, replaced, or negative. Catalog and selection state are scoped to bridge identity and irreversible consumer generations. Paper rich-editor and Inspector consumers revalidate exact document/page/frame/store authority after async font authentication and immediately before DOM, history, notice, or document publication.

**Expected current behavior.** Browser/Android/LAN use should not advertise a font library that cannot be fetched. A desktop with an available verified library shows the browser only after positive capability. Replacing a window bridge, catalog, selection, document, or frame during an async load should suppress stale success/error callbacks and must not apply the old font to the new target.

**Evidence and caveats.** Full approved lineage landed at main `6388536`; real-main passed the decisive 98-test matrix, TypeScript, and Paper production verification. Exact-face cache bytes are content addressed and may remain as unreferenced cache data after a canceled selection; that is a cleanup concern, not visible stale publication.

### FBL-026 — A bundled Paper font reloaded as user-import, or could falsely retain bundled trust

**Original defect.** The initial issue was loss of bundled provenance after reopen, weakening attribution/license handling. Independent review of the first correction found the opposite risk: arbitrary bytes plus canonical-looking metadata could claim bundled provenance without a matching local catalog/installer and license record.

**Integrated correction.** Bundled trust is retained only when the face matches a successful local bundled install or the uniquely matching currently authorized catalog face. The document tuple, font record, license record, descriptors, digest, length, MIME, attribution, variation/collection identity, and actual bytes must all agree. Invalid evidence downgrades only that face to `user-import`; the exact managed reference remains usable under ordinary font-rights rules.

**Expected current behavior.** A genuinely installed bundled face should retain its bundled source and license provenance through normalization, `.slppr`, and portable `.sloom` save/reopen. Invented, substituted, missing-license, or mismatched evidence should not receive bundled packaging treatment; the face becomes a user import rather than poisoning unrelated valid faces in the document.

**Evidence and caveats.** Independently approved and landed through main `a17afb43`; real-main ran focused tests plus TypeScript, lint, diff, and Paper verification. This validates local identity and evidence; it does not replace the release-pack licensing/inventory work of `FBL-009` or make a new external legal determination.

### FBL-034 — Bundled-font samples did not actually preview the selected face

**Original defect.** The chooser's `Ag あア` specimen was explicitly styled with the generic UI sans stack. Users were asked to choose a face while looking at a fallback. A first correction also allowed a mounted row changing from ready face A to unseen face B to briefly reuse A's alias/readiness.

**Integrated correction.** Visible specimens register and verify the exact bundled face, construct its durable reference, resolve its content-addressed runtime alias, and render with exact weight, style, stretch, and variable-axis defaults. Until that exact identity is ready, the row shows localized preparing/unavailable text in the ordinary UI font. Specimen state is keyed to the authorizing bridge and complete face identity, so A → B fails closed before passive effects.

**Expected current behavior.** The sample shown for an available face is that exact managed face, not generic sans. Scrolling or changing a row to an unseen/delayed/failed face shows a preparation/unavailable state without leaking the previous face. Retry publishes the new alias only after successful exact registration.

**Evidence and caveats.** Integrated with `FBL-032` through main `e75392d8`; a fresh reviewer reproduced A-ready → B-unseen/delayed/failure/recovery and verified complete identity plus English/Japanese fallback paths. Registration is deferred to visible rows with `IntersectionObserver`, so an off-screen row may not be prepared until it becomes visible.

### FBL-035 — Desktop packaging readiness reported fonts ready without checking bytes

**Original defect.** The readiness checklist could report the font resource as present based on configuration/shape without confirming the staged inventory and actual non-empty checksummed payloads.

**Integrated correction.** Packaging readiness checks inventory shape, the approved 116-family/430-face counts, declared entries, non-empty staged data, and hashes. Missing or altered staging now blocks readiness and directs the release flow through font preparation.

**Expected current behavior.** A developer or release job should see the font resource as ready only when the verified pack is staged. An empty, incomplete, mismatched, or unstaged pack should fail before packaging rather than produce a misleading green checklist.

**Evidence and caveats.** Integrated through `1d96bdb`, environment-fixture correction `01ce21d`, and evidence `f0ec22e`; packaging/context tests and TypeScript passed. `FBL-009` later strengthened this local readiness rule into mandatory acquisition, Builder hooks, CI artifact verification, and packaged face/license smoke.

---

## 3. Image and Video typography

### FBL-011 — Image/Video bundled fonts were session-only after restart or project transfer

**Original defect.** Image and Video stored a family string after the browser registered a clicked font for the current renderer session. Restarting or transferring the project lost that registration; preview/export could use a same-named system fallback without a strong missing-face warning.

**Integrated correction.** Image and Video now persist a schema-v2 exact face reference containing face ID, family, weight, style, stretch, collection index, full SHA-256, byte length, and related identity. Fresh-process restore resolves and re-hashes the exact bytes, registers a deterministic content-addressed alias before measurement/paint/export, and retains blocking issues for malformed or previously exact references. Video preview and native frame-export pre-layout share the same registered alias and full typography metrics; async registration is effect-owned and cannot publish stale completion after a reference change.

**Expected current behavior.** An Image text layer or Video text asset/clip/stage object using a bundled face should reopen in a new renderer with the same exact bytes and descriptors. Preview, arc/straight measurement, stage sizing, paint, and export should agree. Missing, changed, duplicated, truncated, or ambiguous identity should block with guidance instead of rendering a same-named system font.

**Evidence and caveats.** The final managed-font lineage was independently approved and integrated through main `01c1532`. Focused approval covered 278 tests plus TypeScript, lint, diff, and build; earlier broad matrices reached 638 tests. Nonzero TTC/OTC members are represented but deliberately unavailable for browser registration. Packaged-Electron qualification on each supported OS remains useful external evidence beyond deterministic browser stubs.

### FBL-012 — Family names with spaces/digits produced invalid Canvas/CSS fonts

**Original defect.** Image and Video inserted raw family strings into Canvas/CSS shorthand. Names such as `M PLUS 1` and `Source Sans 3` were parsed as invalid declarations by Chromium, leaving a previous/default font. Several normal preview, SVG, measurement, and browser routes bypassed the first attempted serializer.

**Integrated correction.** A shared CSS-aware family parser/serializer now preserves family identity, quotes/escapes non-generics, handles quoted stacks, commas, escapes, comments, control characters, CSS-wide words, and Chromium hex-escape terminators. All identified Image/Video Canvas, SVG, overlay, browser, preview, and fallback paths use it; SVG inline style is XML-attribute escaped. A real Chromium round-trip oracle was added and used for representative shipped names and adversarial syntax.

**Expected current behavior.** A shipped family with spaces, digits, punctuation, escapes, or a generic-looking quoted name should produce valid Canvas/CSS/SVG declarations and continue selecting the intended family rather than leaving the default font. Image live editing, rasterization, Video measurement, cards, and preview should use the same serialized identity.

**Evidence and caveats.** Integrated typography chain through main `ada9bcc`; integration passed 212 tests, both TypeScript projects, lint, diff, and build. The optional real-Chromium oracle passed in the implementation environment but is not mandatory in every CI run because it requires a browser installation.

### FBL-013 — Image “All Small Caps” invalidated Canvas font shorthand

**Original defect.** `all-small-caps` was placed where Canvas font shorthand does not accept it, causing Chromium to reject the entire font assignment. An early workaround lowercased content, which risked mutating Unicode text and still did not guarantee measure/draw parity.

**Integrated correction.** The text content remains unchanged. Canvas and live editor use the dedicated `fontVariantCaps`/`font-variant-caps` property, while measurement receives the same typography settings before wrapping/layout. Stored metadata remains `all-small-caps`.

**Expected current behavior.** Selecting All Small Caps should not invalidate the font or alter the authored string. Measurement and drawing should use the same caps setting, so wrapping/clip size agrees with paint where the browser supports the longhand.

**Evidence and caveats.** Shared integration through main `ada9bcc`; permanent tests include mixed case, expanded Unicode, measure/draw geometry, and normal small-caps behavior. Older engines that do not implement Canvas `fontVariantCaps` may display normal case, but they should preserve content and retain a valid font rather than corrupting the whole shorthand.

### FBL-014 — Video kerning control was discarded before preview/export

**Original defect.** The type and UI exposed `fontKerning`, but `normalizeManualEditorState` omitted it. Reading normalized state therefore erased the user's selection before downstream layout and export.

**Integrated correction.** The shared Video typography normalizer now carries `fontKerning`, and the persisted/manual editor paths retain it with the rest of the selected face properties.

**Expected current behavior.** Changing Video kerning should survive normalization, project state, preview, and export rather than snapping back or becoming a no-op.

**Evidence and caveats.** Shared typography integration through main `ada9bcc`; the chain passed manual-state, Video flow/composition, asset/stage-object, preview, and neighboring tests. Actual glyph-pair appearance still depends on the chosen font's kerning data and renderer support.

---

## 4. Flow variables, list execution, ports, and reusable Functions

### FBL-015 — Local template variables were falsely undeclared and double braces were corrupted

**Original defect.** Local allowed names were uppercase while parsed names were lowercased, so valid `{{A}}`-style slots could receive a run-blocking undeclared diagnostic. Replacement also processed single braces before double braces, turning `{{A}}` into `{value}`.

**Integrated correction.** Local slot identity is canonicalized case-insensitively, and replacement uses a longest-delimiter-first pattern so double braces are recognized as one token.

**Expected current behavior.** Local A/B/C slots and their case variants should validate and substitute correctly in single- and double-brace forms without leaving stray braces or falsely blocking the run.

**Evidence and caveats.** Integrated as main `d49bf33`; 32 Flow signal/variable tests passed. Triple-brace syntax remains intentionally unspecified.

### FBL-016 — Numbered List inputs followed edge insertion order

**Original defect.** Signal aggregation iterated the raw incoming edge array, so reconnecting or reopening could put slot B before slot A even though handles promised numbered order.

**Integrated correction.** List signal evaluation and list execution share one slot-aware ordering helper.

**Expected current behavior.** List inputs should resolve in numbered handle order regardless of edge-array insertion, reconnect, save, or load ordering.

**Evidence and caveats.** Integrated as main `9fd73b8`; 49 signal/list/execution tests passed. Multiple edges deliberately occupying the same numbered slot retain the established latest-edge rule.

### FBL-017 — `allCombinations` mishandled textual list signals and could misstate paid work

**Original defect.** Text-carried lists used different cardinalities during planning and batching. Cartesian runs could fail, multiply three prompts into nine unintended runs, ignore empty axes, over/underestimate multiple axes, prompt for already resumed work, or approve one graph and execute changed prompts/dependencies later. Resume initially trusted metadata without proving usable media bytes.

**Integrated correction.** Planning represents list/envelope axes structurally, projects provider cardinality through the frozen graph, de-duplicates shared dependencies, and expands once using paired/broadcast/Cartesian rules. The approved plan records exact provider calls and bounded Source resume proofs; execution must match it before dispatch. Source resume verifies actual supported payload/container identity and bounds allocation before materialization. A changed resumable source gets one fresh replan/confirmation; edit/cancel/reset invalidates ownership and releases resources.

**Expected current behavior.** `allCombinations` should produce the intended Cartesian product for direct lists, textual list signals, envelopes, and mixed axes; empty connected axes short-circuit rather than failing or spending. The confirmation should describe the same number of provider calls that execution can dispatch. Fully resumed valid results should not prompt or spend again; missing/corrupt/mismatched cached media should be regenerated only after a truthful replan.

**Evidence and caveats.** The final planner/resume correction passed exact 3/4/20 call-cardinality regressions, 342 production checks, and an independent 196-check gate; it was integrated through main `74c1696`. Provider behavior beyond declared model output counts remains a provider-adapter concern and is not silently authorized.

### FBL-018 — Switch Case outputs were typed `unknown`

**Original defect.** Runtime passed the selected value through, but connection validation declared every case output unknown. Typed downstream nodes could reject text, JSON, or image connections that runtime could satisfy.

**Integrated correction.** Switch case outputs infer the consistent incoming type from the key/value input, and the key accepts the known value families used by the runtime.

**Expected current behavior.** Connecting a Switch Case output carrying text, JSON, image, or another known value to a compatible typed consumer should validate. All case handles report the carried type rather than a blanket unknown.

**Evidence and caveats.** Integrated as `a53ff78`; tests cover text, JSON, image, and case-output inference. If the incoming branches are genuinely inconsistent/unknown, validation still cannot promise a false concrete type.

### FBL-019 — Composition audio tracks disagreed across UI, contract, migration, and runtime

**Original defect.** The UI could display a high-numbered legacy audio lane derived from connected edges while the node contract exposed only the authored count. The self-heal was unreachable. Malformed/overflow handles, templates, paste/remote ingress, routed media, Function media-family changes, and persistent diagnostics later proved additional disagreement points.

**Integrated correction.** One canonical model computes the effective bounded track count from authored count plus valid connected handles. Contracts, UI, hydration, paste/template/remote normalization, and execution use that model. Null legacy handles migrate to stable free lanes; explicit malformed/overflow handles are removed with bounded durable diagnostics. UI and execution share effective-source/output-asset resolution through Portals and Forks, retain `sourceHandle`, and enforce current Function audio/video family. Canonical warning deduplication occurs before the eight-entry cap.

**Expected current behavior.** Reopening a project with an edge on `composition-audio-3` should expose tracks 1–3 in both UI and validation and feed track 3 to execution once. Authored higher counts remain visible after disconnect. Legacy null handles migrate deterministically; malformed/track>4 connections are rejected or removed with one durable Flow warning. Portal-routed Function audio should display and execute; wrong-family or inactive-Fork media should do neither.

**Evidence and caveats.** Fourteen-commit lineage independently approved and reconciled onto main at `b73ed73`; final gates included 516 integration tests plus Flow production/static contract verification. Track count remains intentionally bounded to four. Recovery warnings are bounded and first-seen, so the diagnostic list is useful but not an unbounded archive of every malformed imported edge.

### FBL-020 — Reusable Functions advertised multiple outputs but executed/routed only the first

**Original defect.** Function contracts exposed every output binding, but execution planned from the first binding and signal lookup did not reliably preserve `sourceHandle`. Independent provider-backed secondary outputs could remain stale, return the primary value, or never execute. Cost approval, cancellation, retry, Source publication, and usage attribution could also diverge from the full multi-output plan.

**Integrated correction.** Function planning walks the union of every advertised output's dependency graph, de-duplicates shared dependencies, and executes each required provider node once. Results remain handle-keyed through ordinary and nested Functions; malformed named handles reject before provider submission. Cost estimation, confirmation, and execution share one immutable graph/input/settings snapshot. Run/workspace ownership gates late results and provisional Source publication. Accepted provider submissions use a non-resubmitting post-accept materialization/polling phase, and mixed known/unknown spend is reported honestly rather than as a misleading subtotal.

**Expected current behavior.** A two-output Function with different providers/types should compute and route both named outputs correctly, regardless of which output is first. Shared dependencies execute once; unreachable providers are neither estimated nor called. Changing the graph while confirmation is open invalidates the plan. Cancellation and workspace replacement prevent late publication; a post-accept decoding/polling problem does not repeat the paid submission.

**Evidence and caveats.** Closed with `AUD-007` at main `b3fdedc`; real-main passed 263 decisive tests, 104 contract neighbors, Flow production/static audit, and TypeScript. Native operations already dispatched through a platform API may only support late-result discard rather than physical cancellation.

### FBL-027 — Stored edge-contract annotations became stale after node configuration changed

**Original defect.** Updating node data could change a port or output contract without recomputing connected edge annotations. An incompatible edge could remain labeled valid; Portal synthetic projections could consume public cardinality; Function audio/video runtime-family changes could leave Composition routing falsely valid.

**Integrated correction.** Contract-affecting node patches trigger graph-aware canonical edge refresh. Compatible annotations update; incompatible edges retain the authored route but record current carried/accepted types and reason. Portal synthetic edges no longer consume visible connection limits. Function-to-Composition routing derives the current runtime media family, and removed handles remain invalid without rewriting unrelated edge identity.

**Expected current behavior.** Changing a node from text to number should immediately change a connected Regex route from valid to a canonical Number→Text incompatibility. Changing a Function result from audio to video should invalidate its Composition audio edge, then become valid again if it returns to audio. Unrelated edges should remain byte-identical.

**Evidence and caveats.** Independently approved and landed through main `2ff305b0`; real-main passed focused tests, Flow production/static audit, both TypeScript projects, lint, diff, and build. This refreshes truth and diagnostics; it does not automatically invent a semantically different compatible destination for an authored incompatible edge.

---

## 5. Provider media and request contracts

### FBL-028 — ElevenLabs `mp3_48000_192` was silently changed to another format

**Original defect.** The UI exposed and selected a valid ElevenLabs music format, but the sanitizer allowed only a smaller subset and silently coerced it to `mp3_44100_128`.

**Integrated correction.** Sanitization now validates against the supported provider/UI format set and preserves `mp3_48000_192`.

**Expected current behavior.** Choosing 48 kHz / 192 kbps MP3 should send and retain that format instead of silently changing sample rate/bitrate.

**Evidence and caveats.** Integrated as `f046565`; provider catalog and ElevenLabs execution tests passed 40/40. The accepted set must still be maintained when ElevenLabs changes capabilities.

### FBL-029 — ElevenLabs raw PCM was mislabeled as WAV

**Original defect.** Speech, sound effects, music, and voice-change branches could return headerless signed PCM while downstream code labeled/stored it as `audio/wav`. Post-success materialization failures could also re-enter the generic retry and issue a second paid request while losing accepted-attempt usage.

**Integrated correction.** One materializer covers all four routes. Recognized `pcm_<rate>` becomes a standard 44-byte RIFF/WAVE container around unchanged mono signed-16 little-endian samples; MP3 bytes remain `audio/mpeg`; unknown encodings retain provider MIME or honest octet-stream fallback. Empty/odd PCM fails non-retryably. A successful response is the accepted billing boundary: blob/byte/object-URL failures do not resubmit, carry actual usage, and preserve Abort cancellation.

**Expected current behavior.** `pcm_44100` should produce a playable 44.1 kHz mono 16-bit WAV whose payload bytes exactly match the provider samples. MP3 remains MP3. Malformed terminal audio fails once with usage recorded; a pre-response transport failure may retry, but accepted audio is never purchased twice because local materialization failed.

**Evidence and caveats.** Corrected and independently approved through main `a3d5d286`; final gates included 51 focused, 194 adjacent, Flow production/static audit, TypeScript, lint, diff, and build. No live ElevenLabs call was made; deterministic response fixtures establish byte and call-count contracts.

### FBL-030 — BytePlus image generation omitted the watermark control

**Original defect.** The request did not set BytePlus/ModelArk's watermark field, allowing the provider default to add a watermark despite Sloom's normal generated-image expectation.

**Integrated correction.** The shared BytePlus image-generation helper always sends `watermark: false`, covering Flow and Image adapter callers.

**Expected current behavior.** BytePlus requests should explicitly request unwatermarked output rather than depend on a provider default.

**Evidence and caveats.** Integrated as `d08cbaa`; request-shape and Flow image-provider suites passed 24 tests. A future provider/model can still change server-side support; the application now makes its intent explicit and testable.

---

## 6. Localization and multi-window desktop behavior

### FBL-032 — Major Paper/font typography surfaces were hardcoded in English

**Original defect.** Rich typography controls, Paper document tabs, the bundled-font browser, and kerning options bypassed the locale catalog, so a Japanese interface could contain large English-only surfaces.

**Integrated correction.** These surfaces now source labels, roles, help, tooltips, counts, dirty/recovery actions, loading/empty/error states, and dynamic document text from English/Japanese catalog entries. The rich typography panel reacts to a persisted locale change without requiring remount.

**Expected current behavior.** Switching to Japanese should localize the advanced type inspector, Paper tabs, bundled-font chooser, and kerning choices—including dynamic counts, dirty markers, accessibility labels, and failure states—without reopening the application.

**Evidence and caveats.** Integrated with `FBL-034` at main `e75392d8`; real-main passed 63 focused tests, both TypeScript projects, lint, diff, Paper production verification, and build. This finding covers the named typography surfaces, not a claim that every string in the entire application has been audited for translation quality.

### FBL-033 — Multiple windows could disagree about locale and native menu language

**Original defect.** Each renderer could update its own locale store while Electron's application menu was global. Two windows and the native menu could settle on different languages; stale/out-of-order startup messages or a closing writer could change the result unpredictably.

**Integrated correction.** A revisioned Electron-process locale authority owns `{ locale, localeChosen, revision }`. Renderers propose changes against adopted revisions; accepted state broadcasts to every window; stale conflicting proposals reconcile to current truth; exact repeats are idempotent. Application/global/panel menus rebuild from accepted authority only. New windows adopt established state after settings hydration without overwriting it from an old local snapshot.

**Expected current behavior.** Changing language in either desktop window should update every live window and the native menus to the same language. A stale window cannot revert a newer choice; closing the writer does not reset authority; a later window adopts the current process language.

**Evidence and caveats.** Independently approved and landed as main `c15d9cff` / evidence `9ea001c3`; real-main passed 84 relevant tests, both TypeScript projects, Electron syntax, lint, diff, and build. Authority is intentionally process-local and seeded from encrypted renderer settings after hydration, so the native menu may briefly begin in default English very early in startup.

---

## Complete FBL mapping table

The table is deliberately one row per original finding so Notebook can answer “what happened to FBL-N?” without inferring aliases.

| ID | Original severity | Product category | Final evidence / main anchor | Final disposition |
|---|---:|---|---|---|
| FBL-001 | Critical | Paper save/reopen integrity | `8a7eb97`, `5dd828c`; `overlap-fable-paper-2026-07-16.md` | Integrated and independently checked |
| FBL-002 | High | Paper tab validation/recovery | `8a7eb97`, `5dd828c`; same evidence | Integrated and independently checked |
| FBL-003 | High | Dirty-close/replacement recovery | Paper train `be9b373`, reconciliation `ebc96d7`; FBL-003 evidence notes | Integrated and independently checked |
| FBL-004 | High | Paper frame geometry | `5226293`, `20c2fe5` | Integrated and independently checked |
| FBL-005 | High | Exact fonts in flattened output | exact-font train through `97a1ee2`, combined route correction `0305d4d` | Integrated and independently checked; shared with AUD-020 |
| FBL-006 | High | Canonical managed typography | main `c56d3ee4` | Integrated and independently checked |
| FBL-007 | High | Rich-edit zoom conversion | `d4e46c4`, reconciliation `c653c57` | Integrated and independently checked |
| FBL-008 | High | Vertical rich writing | `6726462`, reconciliation `c653c57` | Integrated and independently checked |
| FBL-009 | High | Release font artifact | main `5cf74bf5` / evidence `939e4514` | Integrated and independently checked |
| FBL-010 | High | Condensed/stretch exact face | exact-font train through `97a1ee2` | Integrated and independently checked |
| FBL-011 | High | Image/Video face persistence | main lineage through `01c1532` | Integrated and independently checked |
| FBL-012 | High | CSS/Canvas family serialization | typography chain through `ada9bcc` | Integrated and independently checked |
| FBL-013 | High | Image all-small-caps | typography chain through `ada9bcc` | Integrated and independently checked |
| FBL-014 | High | Video kerning persistence | typography chain through `ada9bcc` | Integrated and independently checked |
| FBL-015 | High | Flow local variables | `d49bf33` | Integrated and independently checked |
| FBL-016 | High | List slot ordering | `9fd73b8` | Integrated and independently checked |
| FBL-017 | High | Cartesian planning/resume/cost | main `74c1696` | Integrated and independently checked |
| FBL-018 | High | Switch output typing | `a53ff78` | Integrated and independently checked |
| FBL-019 | High | Composition audio truth | main reconciliation `b73ed73` | Integrated and independently checked |
| FBL-020 | High | Function multi-output runtime | main `b3fdedc` | Integrated and independently checked; shared with AUD-007 |
| FBL-021 | Medium | Per-tab Paper history | main `3e78876` | Integrated and independently checked |
| FBL-022 | Medium | Run-leading inheritance | main `5931420f` | Integrated and independently checked |
| FBL-023 | Medium | Threaded rich-story slicing | main `909cc97` | Integrated and independently checked |
| FBL-024 | Medium | Each-line print indentation | `6911617` | Integrated and independently checked |
| FBL-025 | Medium | Platform font-browser capability | main `6388536` | Integrated and independently checked |
| FBL-026 | Medium | Bundled font provenance | main `a17afb43` | Integrated and independently checked |
| FBL-027 | Medium | Dynamic edge-contract refresh | main `2ff305b0` | Integrated and independently checked |
| FBL-028 | Medium | ElevenLabs format preservation | `f046565` | Integrated and independently checked |
| FBL-029 | Medium | ElevenLabs PCM/WAV truth | main `a3d5d286` | Integrated and independently checked |
| FBL-030 | Medium | BytePlus watermark intent | `d08cbaa` | Integrated and independently checked |
| FBL-031 | Medium | Standalone Paper ownership | main `c438735d` | Integrated and independently checked |
| FBL-032 | Medium | Japanese typography UI | main `e75392d8` | Integrated and independently checked |
| FBL-033 | Medium | Multi-window locale authority | main `9ea001c3` | Integrated and independently checked |
| FBL-034 | Low | Exact font chooser specimen | main `e75392d8` | Integrated and independently checked |
| FBL-035 | Low | Font-package readiness | `1d96bdb`, `01ce21d`, `f0ec22e` | Integrated and independently checked |

## Evidence chronology and mapping cautions

The evidence notes are intentionally conservative: an author note often ends with “fresh independent review required.” That sentence describes the state at the time the note was written, not the final state of the sprint. The sprint ledger records the subsequent review, correction, integration, and real-main checks. For example:

- The first `FBL-011`, `FBL-019`, `FBL-023`, `FBL-025`, `FBL-026`, `FBL-027`, `FBL-029`, `FBL-031`, and `FBL-034` candidates were rejected at least once. The behavior in this guide reflects the corrected, later-approved lineage rather than the first green author branch.
- `FBL-010` does not have a conveniently named standalone integration commit because stretch identity was inseparable from the shared exact-font export contract. The final exact-font train is the evidence anchor.
- `FBL-005` and `AUD-020`, and `FBL-020` and `AUD-007`, share production lineages but remain separate audit rows because the original user-facing failure statements differ.
- The early ledger row saying `FBL-009` was blocked or present in a Functions branch is superseded by the 2026-07-18 discovery and validation of `/home/cabewse/work_SPaC3/fonts` and the dedicated approved `939e4514` closure.

## Practical acceptance checklist for a user

If manually sampling the repaired product, these scenarios give the highest user-level coverage without rerunning the entire engineering test suite:

1. Create a three-tab Paper project, use a Source Library image and a bundled condensed font, make one tab dirty, save, close/reopen, switch tabs, undo in each tab, and confirm all content/history behavior matches the explanations above.
2. Export the same layout to PNG/webcomic, soft proof, ordinary raster PDF, and a strict PDF/X/KDP route. Confirm the intended managed face is visually stable; then temporarily make that face unavailable and confirm strict output blocks instead of substituting.
3. In Image and Video, choose a bundled family with spaces/digits, restart the application, reopen, and compare straight/arc text, kerning, all-small-caps content, and export.
4. Build a Flow containing numbered list inputs, textual list signals, Switch Case, a two-output Function, Portal/Fork routing, and Composition audio tracks. Reorder edges, save/reopen, and verify displayed ports, diagnostics, confirmation count, and produced outputs agree.
5. Request ElevenLabs PCM and inspect that the saved file is a real RIFF/WAVE; request 48 kHz/192 kbps MP3 and confirm the option remains selected. A simulated post-response materialization failure should not repeat the provider submission.
6. Open two desktop windows, switch English/Japanese in one, and confirm both windows and all native menus converge. Open the bundled-font chooser and confirm each prepared sample actually changes to its exact face.

These checks are supplementary. The integrated regressions and production verifiers remain the authoritative repeatable evidence for the repair sprint.
