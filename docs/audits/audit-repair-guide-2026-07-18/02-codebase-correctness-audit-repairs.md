# Codebase Correctness Audit Repairs

## Purpose and scope

This guide translates the 44 findings in the frozen [Codebase Correctness Audit of 2026-07-16](../codebase-correctness-audit-2026-07-16.md) into user-level terms: what was wrong, what changed, what Sloom Studio should do now, how the change was checked, and what boundary still deserves attention.

The two-audit repair package contains 79 mapped findings in total and the repair ledger records **79/79 integrated and independently gated**. This document covers only the correctness audit's own **44/44 findings**: 5 Critical, 21 High, 17 Medium, and 1 Low. The other 35 findings belong to the separate Fable recovery/comparison audit and are described elsewhere in this guide.

“Fixed” below means the production change is present in the integrated branch and was mapped into the final 79-item ledger. It does not mean that every platform, provider, printer, graphics driver, or operating-system integration has received external certification. Where the implemented contract is deliberately fail-closed rather than newly capable, that distinction is explicit.

## Reading the evidence

- Commit IDs identify the integrated implementation lineage, not necessarily a single self-contained patch. Several high-risk findings required multiple author/reviewer correction rounds.
- Evidence-note links lead to the detailed red/green tests, review objections, corrections, and residuals retained in the repository.
- “Expected behavior now” is the product contract a user should observe after these repairs.
- Four findings—AUD-009, AUD-010, AUD-032, and AUD-034—were closed inside broader Flow or Image integrity corrections rather than receiving a standalone same-ID evidence note. Their mappings are identified explicitly instead of inventing one-to-one provenance.

---

## Project, desktop, startup, and settings integrity

### AUD-001 — Independent Electron renderers can overwrite a project with stale state

**Original problem.** Each Electron window held its own project stores while the main process held one global file path. A window still displaying project A could receive project B's path and then serialize A-like state into B. Even a normal save could let a stale renderer overwrite edits from another window.

**What changed.** The desktop now uses immutable project-authority identities, monotonic versions, sender/renderer epochs, and a main-process mutation lease. Open, New, Save, Save As, external open, Source Library replacement, Paper/Image preparation, and remembered-startup state participate in one staged transaction. A stale or unauthorized save is rejected before disk publication. Renderer preparation is reversible; rollback is store-specific, preserves concurrent edits, retains/revokes temporary Source URLs by reference count, and disposes staged Paper/Image resources only when ownership settles. The main implementation lineage runs from `72893d33` through `d54ffcfa`, including the final Source-URL lifetime correction.

**Expected behavior now.** Opening or creating a project in one window cannot silently make a stale window authoritative. Saving from an out-of-date window should be refused or presented as a conflict instead of overwriting the current project. Failed Open/New/Save As operations should leave the previous project, its assets, histories, selections, and temporary URLs usable. Successful publication should update windows to the same canonical project identity.

**Verification and evidence.** The final authority gate exercised 26 files / 417 tests, a 9-file / 181-test focused set, 7 files / 163 dirty/recovery tests, 77 Source-URL tests, both production verifiers, forced TypeScript, lint, Electron syntax, diff checks, and a production build. Terra first rejected the URL-lifetime candidate, then approved the corrected exact tip. See [final atomic-authority evidence](../../notes/overlap-sol-aud001-final-superseding-evidence-2026-07-16.md) and [approved Source-URL lifetime evidence](../../notes/overlap-sol-aud001-source-url-lifetime-evidence-2026-07-17.md).

**Caveat and mapping note.** The original audit paragraph also used whole-snapshot settings writes as supporting evidence. AUD-001's principal closure is the project-corruption transaction. License/settings identity races were separately repaired under AUD-015, portable settings under AUD-042, and locale ownership under FBL-033. This report does not claim that every arbitrary preference edit is a collaborative real-time settings system.

### AUD-005 — Closing a dirty Image tab discards the document without confirmation

**Original problem.** The dirty dot was only visual. Clicking a tab's close button immediately removed the layered document and its undo/redo history. A flattened PNG or Source Library export could also mark the editable layered document clean even though it was not an editable save.

**What changed.** `closeDocument` now refuses dirty documents; explicit discard is a separate destructive operation. Dirty tabs use Save / Discard / Cancel, re-check the live document when the choice is exercised, and keep the tab open on canceled or failed saves. Editable `.slimg` save truth is separate from flattened exports. Project replacement and application shutdown also use loss-prevention boundaries.

**Expected behavior now.** Closing unsaved layered Image work prompts for a decision. Cancel keeps the tab and history. Save closes only after the editable workfile succeeds. Discard is intentional. Exporting a flattened image no longer pretends the layered source is saved.

**Verification and evidence.** The corrected integration passed 15 files / 213 tests plus both TypeScript projects, lint, diff check, and build. The suite includes stale-dialog, linked Flow/Paper close, save failure, flattened export, project replacement, and shutdown cases. Integrated commits are `b5f378f8` and `4978a59e`. See [AUD-005 evidence](../../notes/overlap-sol-image-dirty-close-2026-07-16.md).

**Caveat.** Browser/Capacitor download dispatch cannot confirm a later OS storage failure as precisely as Electron's native save result. The browser path therefore protects synchronous failure but cannot promise a file reached storage after the platform accepted the handoff.

### AUD-014 — BytePlus API keys never survive persistence

**Original problem.** BytePlus existed in the settings UI and TypeScript schema but was omitted from the sanitizer/copy registry. A saved key came back empty after restart or backup import.

**What changed.** BytePlus joined the shared credential registry and its persistence sanitizer/round-trip coverage, removing the divergent provider-specific list.

**Expected behavior now.** A BytePlus key entered in Settings should remain configured after restart and through settings export/import, subject to normal encrypted-storage behavior.

**Verification and evidence.** The old-code test reproduced a supplied key becoming an empty string; the corrected settings suite passed with non-empty round-trip coverage. Main commit: `62cb0db7`. See the AUD-014 row in [Terra quick-win evidence](../../notes/overlap-terra-quickwins-2026-07-16.md).

**Caveat.** A future provider still must be added through the shared registry; inventing another parallel key list would recreate the class of defect.

### AUD-015 — Commercial-license validation can race settings hydration

**Original problem.** Startup could validate the initial empty license before encrypted settings finished hydrating, mark the decision complete, and never validate the real stored key. Later cross-window writes or stale decrypts could also resurrect removed license/key state.

**What changed.** License validation now waits for authoritative hydration and is bound to the license identity/generation it validated. Encrypted settings use ordered, per-key durable convergence with committed generations, stale-read revalidation, serialized writes, cross-window invalidation, and fail-closed result application. Activation, removal, import, and rehydrate have explicit operation ownership so an old async completion cannot re-enable or disable the wrong identity.

**Expected behavior now.** A valid stored commercial license should unlock after hydration without requiring a manual settings change. Removing or replacing a key should not be undone by an older decrypt, another window's stale snapshot, or an out-of-order verification. If validation cannot prove the current identity, commercial gates remain fail-closed rather than guessing.

**Verification and evidence.** The lineage `593e307c` through `014f2e93` accumulated delayed hydration, same-key, failed decrypt, two/three-window, dropped-broadcast, import/activation/removal, storage fallback, and stale-write cases, followed by fresh review. Key records include [ordered convergence](../../notes/914-aud015-ordered-settings-license-convergence.md), [durable stale-read correction](../../notes/915-aud015-durable-stale-read-convergence.md), [per-key convergence](../../notes/916-aud015-per-key-convergence-superseding.md), and [legacy scheduling/build gate](../../notes/917-aud015-legacy-scheduling-build-gate.md).

**Caveat.** Validation still depends on the license service and the encrypted storage available on the platform. The local contract is correct ordering and fail-closed state, not a promise that an unavailable remote service can validate immediately.

### AUD-016 — Project save/import/export failures can be silent

**Original problem.** Several App menu and keyboard commands intentionally discarded their promises. Disk, materialization, chooser, or bridge rejection could become an unhandled rejection with no reliable user message, making it easy to assume a save succeeded.

**What changed.** Fire-and-forget file commands now run through a common async error boundary with operation-specific failure titles. Save, Save As, media import, scratch selection, project export, and asset export settle their promise and surface an actionable dialog instead of leaking a rejected promise.

**Expected behavior now.** If a file operation fails, the application should say which operation failed and why. It should not show a success state or leave the user to infer failure from the filesystem.

**Verification and evidence.** Main commits `d3c39c6f` / `a92a338e` include bridge-rejection and command-dispatch tests plus TypeScript, lint, diff, and build gates. See [AUD-016 error-boundary evidence](../../notes/overlap-sonnet-aud016-file-operation-errors-2026-07-17.md).

**Caveat.** A web browser can confirm that a download was initiated, not that the user ultimately stored it. Messages on browser fallback paths are intentionally phrased as “started” rather than “saved.”

### AUD-040 — Desktop lifecycle lacks a single-instance owner and file/URL launch routing

**Original problem.** Repeated launcher clicks could start multiple Electron processes sharing one user-data directory and fixed services. The Linux launcher advertised `%U`, but the launch chain discarded file and URL arguments, so opening `.sloom` or `.slppr` from the desktop did not work reliably.

**What changed.** Electron acquires a single-instance lock before shared side effects. Initial argv, second-instance argv, macOS open events, file URLs, supported project/publication files, and `signal-loom://` links enter a validated exactly-once queue. File identity is captured before delivery; dirty Paper/Image replacement uses the same guarded project transaction; commit receipts and renderer epochs prevent replay. The launcher and package metadata now forward/register supported targets.

**Expected behavior now.** Launching Sloom Studio again focuses the existing instance. Opening a `.sloom` or `.slppr` from the file manager routes it to the running app once, through normal loss-prevention behavior. Unsupported or remote targets are rejected rather than treated as local projects.

**Verification and evidence.** The lineage begins at `54990ba6` and ends with authority reconciliation (`471c0e95`, `8dccae5a`). It includes 188 early focused tests, repeated replay/identity/dirty-state correction gates, and a real Electron 41/Xvfb Linux winner/loser relay with a Unicode-and-spaces project path. See [single-instance implementation](../../notes/overlap-fable-single-instance-2026-07-16.md) and [final external-open correction](../../notes/overlap-sol-aud040-desktop-final-correction-2026-07-17.md).

**Caveat.** Linux was live-tested. macOS `open-file`/`open-url` behavior is covered structurally and by unit tests but was not exercised on macOS hardware. Development “Open with” menus may still need system MIME registration outside the packaged installer.

### AUD-041 — Remembered-project startup errors silently open a blank project

**Original problem.** A missing, unreadable, corrupt, schema-invalid, or preparation-failing remembered project had its path forgotten, after which a blank project appeared without explaining the failure or offering recovery.

**What changed.** Normal startup is now blank by default; remembered reopening is opt-in. If an opted-in project fails, Electron retains a typed recovery descriptor and nearby backups. After the exact blank authority is adopted, the renderer offers Retry, Open Another, Recover Backup, or Continue Blank. Successful project transitions clear stale recovery; canceled/rejected attempts retain it.

**Expected behavior now.** Sloom Studio should normally launch to a new blank project unless previous-project reopening is explicitly enabled. If that optional reopen fails, the user sees the exact path and recovery choices instead of an unexplained blank workspace. Reloading a valid backup uses the same guarded Open transaction.

**Verification and evidence.** Main integration through `fe924974` passed 163 focused/adjacent and 82 native-startup tests, both TypeScript projects, Electron syntax, lint, diff, build, and a real isolated Electron EACCES/backup recovery check. See [startup recovery](../../notes/942-aud041-startup-project-recovery.md) and [authority-ordering correction](../../notes/943-aud041-startup-recovery-ordering-correction.md).

**Caveat.** Recovery for a previous project is relevant only when the user opted into reopening it. Continue Blank is session-only and deliberately does not erase the remembered path or preference.

### AUD-042 — Encrypted settings backup omits editor preferences

**Original problem.** The backup was described broadly but omitted locale, locale-choice state, density, menu style, default image model, and open-font-library preferences.

**What changed.** The versioned encrypted payload declares all 15 user-meaningful persisted settings fields and shares sanitizers with hydration. Runtime/UI-only state is excluded. Current-schema import is atomic and ordered; schema-less legacy import is restricted to the exact fields the old exporter could have produced. Later valid imports win, while later rejected imports cannot cancel a valid one already decrypting.

**Expected behavior now.** Exporting and importing settings should restore provider/model preferences, theme/menu/density, locale, shortcuts/bindings/presets, font-library metadata, keys, and license identity without importing transient dialog or hydration state. Invalid or unsupported backups leave current settings unchanged.

**Verification and evidence.** Main lineage `07a322b3` through `fb5f6193` includes the 15-field round trip, hostile schema, atomicity, legacy projection, concurrent valid/rejected import, license-operation ordering, 84-test settings matrix, TypeScript, lint, diff, and build gates. See [portable backup evidence](../../notes/aud042-portable-settings-backup-evidence-2026-07-18.md), [final correction](../../notes/937-aud042-portable-settings-backup-final-correction.md), and [valid-import ordering](../../notes/938-aud042-valid-import-order-final-correction.md).

**Caveat.** Open-font-library data in this backup is metadata, not font binaries. Managed font bytes belong to the Paper/project asset systems. This is portable export/import, not live synchronization of every preference between open windows.

### AUD-043 — First-run Community notice can cover language selection

**Original problem.** The hardcoded-English Community notice and the language gate mounted independently. The higher notice layer could cover language selection, making a first Japanese interaction appear in English.

**What changed.** One startup interaction owner waits for settings hydration, shows exactly one of the language gate or Community decision, and advances from language choice before evaluating the notice. All Community notice copy is in the shared English/Japanese catalog and reacts to locale changes.

**Expected behavior now.** A new profile should first see the bilingual language chooser. Choosing Japanese removes the chooser before a Japanese Community notice can appear. Returning users with a stored locale skip the language gate. The two overlays should never overlap.

**Verification and evidence.** Main commits `5d9e70b9` / `9cee05fe` passed 26 focused and 72 adjacent tests, both TypeScript projects, lint, diff, and a 3,286-module build; root independently repeated focused and broader startup gates. See [AUD-043 evidence](../../notes/946-aud043-first-run-interaction-sequencing.md).

**Caveat.** The Japanese strings are implemented and deterministically rendered but still merit native-speaker editorial review. The existing storage fallback for simultaneous day claims remains a narrower platform limitation.

### AUD-044 — Flow context-menu labels retain the previous locale

**Original problem.** The canvas context-menu callback captured the prior locale because `locale` was missing from its React dependency list.

**What changed.** Locale is now a callback dependency and the menu label catalog is re-evaluated when language changes.

**Expected behavior now.** Switching the app language and immediately right-clicking the Flow canvas should show node/category labels in the newly selected language without requiring another unrelated UI change.

**Verification and evidence.** The permanent test changes locale and observes the Japanese label `生成`; main commit `e258649a`. See the AUD-044 row in [Terra quick-win evidence](../../notes/overlap-terra-quickwins-2026-07-16.md).

**Caveat.** This finding is limited to the Flow pane context menu. Broader cross-window locale ownership was repaired separately under FBL-033.

---

## Flow execution, providers, usage, and Source Library

### AUD-002 — A Flow run can finish into the wrong workspace

**Original problem.** A provider completion looked up whichever Flow canvas happened to be hydrated after the await. Switching workspaces could lose the original result, write it into a duplicate with the same node ID, or charge usage to the wrong workspace.

**What changed.** Every run now owns immutable workspace, node-instance, input-revision, graph-generation, and run identities. Completion patches go through the workspace store, not an arbitrary current canvas. Graph edits, deletion, reset, workspace replacement, and cancellation invalidate ownership. Source publication and usage attribution are independently tied to the starting owner; diamond dependencies execute once per root run.

**Expected behavior now.** A slow run started in workspace A remains A's run even if the user switches to B. Its result cannot overwrite a duplicate/recreated node in B. Incurred usage remains attached to A; stale output/Source publication is discarded if the owner no longer exists.

**Verification and evidence.** The combined integration (`48ab7d18`, `a9647455`, `502bb0e3`, `74c1696f`) passed 43 files / 458 author tests, a 9-file / 340-test Flow gate, the 63-node/182-contract/178-option static audit, a full repository sweep, and fresh independent approval. The run-ownership history and correction trail are summarized in the sprint ledger and [Functions ownership/cancellation evidence](../../notes/916-functions-runtime-plan-ownership-cancellation.md).

**Caveat.** Usage already incurred at a provider is still recorded even when a later ownership check prevents publishing the result. That is intentional financial truth, not a late-result leak.

### AUD-003 — Generic retry can resubmit paid jobs and wait over eight hours

**Original problem.** One retry wrapper surrounded submission, polling, and download. A transient poll failure could create another paid job, while validation and HTTP 4xx errors could enter an 8h31m30s backoff sequence.

**What changed.** Paid async routes separate submit-once from retryable poll/materialization phases. Existing prediction/job/operation IDs are reused; structured status errors retain numeric status; validation and permanent failures are non-retryable; Flow's exponential wait budget is bounded to five minutes.

**Expected behavior now.** A transient failure after a job was accepted should continue that same job, not buy another one. Invalid prompts, credentials, or requests should fail promptly. Status text may show bounded retry of polling/download, but not repeated creation.

**Verification and evidence.** Atlas, BFL, Gemini, and Stability red tests showed two submissions before repair; green tests assert one create through injected poll/download faults. The integration passed 12 files / 80 tests plus TypeScript, lint, diff, and build (`f2d4aa92`, `78e51b18`). See [AUD-003 provider evidence](../../notes/overlap-sol-provider-2026-07-16.md).

**Caveat.** Accepted job IDs survive automatic retries within the active execution, not an application crash/restart. Individual network calls still rely on their route's own timeout behavior.

### AUD-006 — API Requester has an executor but cannot run in the application

**Original problem.** The API Requester implementation existed, but its node had no active run wiring and was excluded from graph reachability. Direct helper tests hid that a user could not execute it.

**What changed.** API Requester is runnable from the rendered node and recursive Flow execution. It owns visible running/cancel state, coalesces duplicate root starts, participates in one-per-root dependency memoization, handles stream cancellation, normalizes response media, and redacts credential-bearing URL/query/header/body values from persisted/exported state.

**Expected behavior now.** A configured API Requester can run directly or upstream of Run Me, show status, return text/JSON/binary results, and cancel. Duplicate clicks or a diamond graph should not make unintended duplicate requests. Reopened redacted requests fail closed until the user restores any removed private value.

**Verification and evidence.** This was integrated with the AUD-002/AUD-008 runtime in `48ab7d18`. The combined lane passed 91 independent targeted tests, the full repository sweep, 340 Flow production tests/static audit, TypeScript, lint, syntax, diff, and build. API-specific coverage includes rendered-node reachability, methods/body/status, streams, pending-read abort, duplicate Run Me, persistence, usage, and Source output.

**Caveat.** Arbitrary requests are intentionally not automatically replayed. Cancellation cannot undo work a remote server completed before it observed the connection close.

### AUD-007 — Collapsed reusable functions return frozen provider results

**Original problem.** A collapsed Function synchronously evaluated provider nodes by reading their stored `data.result`, so changing a Function input often returned the old frozen output and reported zero spend.

**What changed.** Function execution prepares an isolated internal graph, resolves current input bindings, plans the union of all advertised output dependencies, clears stale internal results, executes provider nodes through the real runtime, preserves named and additional outputs, estimates/authorizes spend from the same immutable plan, records internal attribution, and forwards the outer cancellation signal. Malformed wiring and invalid output handles fail closed.

**Expected behavior now.** Changing a collapsed Function's input causes its internal provider work to run against the new value. Named/multiple outputs retain type and media metadata. The confirmation and usage ledger reflect actual internal provider work; cancellation stops or invalidates the whole Function run.

**Verification and evidence.** The integrated lineage `39b161b9` through `b3fdedc1` and final reconciliation includes 200 focused tests, a 206-test broader Functions/Flow matrix, 321 Flow production tests/static audit, TypeScript, lint, diff, build, and independent adversarial review. See [initial Function repair](../../notes/overlap-fable-functions-2026-07-16.md), [real run-boundary correction](../../notes/914-terra-aud-007-real-run-boundary.md), and [final plan/ownership/cancellation evidence](../../notes/916-functions-runtime-plan-ownership-cancellation.md).

**Caveat.** Nested Functions remain depth-limited. Provider SDKs that expose no abort hook can only be abort-raced and have their late result discarded.

### AUD-008 — Cancel does not abort most provider work

**Original problem.** The store aborted a controller, but the signal often stopped at the wrapper and never reached fetch, upload, sleep, poll, download, local conversion, or provider-specific helpers.

**What changed.** One run signal is propagated through provider submission, uploads/preparation, sleeps, polling, download/materialization, retry waits, Functions, backend proxy, and native fallback races. Accepted paid jobs keep their submit-once phase. Cancel invalidates the complete root/dependency ownership graph and prevents late result or Source publication.

**Expected behavior now.** Cancel from the active node—including a Run Me root or an active dependency—should stop waiting promptly, suppress downstream submissions, remove running state across the owned graph, and prevent late output from appearing. Where a provider supports cancellation, the route can use it; otherwise the app discards the late completion.

**Verification and evidence.** The combined AUD-002/AUD-006/AUD-008 integration added hundreds of provider-signal, media-cancellation, store-cancellation, and ownership cases in `48ab7d18`, with the fresh 91-test targeted gate, full repository suite, 340-test Flow gate/static audit, TypeScript, syntax, lint, diff, and build all passing. Accepted-job details are also covered in [Functions cancellation evidence](../../notes/916-functions-runtime-plan-ownership-cancellation.md).

**Caveat.** A native bridge or external provider that cannot cancel after dispatch may still consume remote compute; the local contract is prompt cancellation, exact accounting, and no stale publication.

### AUD-009 — Run Me reuses stale upstream outputs after inputs change

**Original problem.** Any truthy media/function/composition result could be treated as reusable before dependency inspection. Editing P1 to P2 and clicking Run Me could silently retain P1's upstream image.

**What changed.** Arbitrary existing `node.data.result` is display state, not permission to skip work. A provider-root run owns a fresh complete dependency traversal captured in an immutable plan. Reuse is limited to an explicitly validated Source Library resume for the requested root, with exact envelope/content proof and post-confirmation revalidation; dependencies execute for the current root.

**Expected behavior now.** Editing an upstream prompt/configuration and running the chain uses the new input. Old results may remain visible until replaced, but they are not silently treated as current dependencies. A proven matching root asset can say it resumed from Source Library.

**Verification and evidence.** This finding is mapped to the combined Flow correction rather than a same-ID note. The decisive implementation is `502bb0e3`, whose permanent run-plan suite added 1,398 tests-file lines and whose combined gate passed the 458-test author matrix, 340-test Flow production/static gate, full repository suite, and independent approval.

**Caveat.** The corrected design deliberately favors correctness over opportunistic reuse: dependencies rerun per provider root unless they are represented in the approved explicit resume plan.

### AUD-010 — Resume/cache hashes include their own previous outputs

**Original problem.** Execution hashes included complete mutable node data, including prior result/history/usage fields. Completing a run changed its own future hash, so an unchanged authored request missed its cache.

**What changed.** Planning uses stable authored execution data, resolved current contexts, immutable graph/settings snapshots, and content-bound Source resume proofs. Runtime/display fields no longer grant reuse or define current authored identity. Confirmation revalidates the exact fingerprint before provider submission.

**Expected behavior now.** A genuinely matching root resume can be recognized without being invalidated by its own previous result metadata. Conversely, changing authored inputs, routed references, settings, graph identity, or resume bytes invalidates the plan and requires re-planning/reconfirmation.

**Verification and evidence.** Like AUD-009, this is a broader reconciliation mapping centered on `502bb0e3`, `a9647455`, and `74c1696f`, with permanent immutable-plan, consent-drift, Source-byte, duplicate/diamond, and current-input tests inside the 458-test author and 340-test production matrices.

**Caveat.** This is not a general hidden cache of provider calls. Resume is explicit, content-validated, and scoped to the requested root so that stale dependencies cannot be smuggled into a new chain.

### AUD-011 — Reference descriptions lose their numbered image association

**Original problem.** Numbered reference images became one flat image array while all text/JSON guidance became one global prompt. Providers could not know which instruction belonged to Reference 1 versus Reference 2, and swapping descriptions might not invalidate resume.

**What changed.** Flow carries structured `{slot, image, descriptions, jsonGuidance, referenceType}` groups in deterministic slot order. Planning, direct Run, graph Run, hashing, list/envelope iteration, and adapters share one resolver. Provider-specific request builders serialize guidance adjacent to or explicitly indexed against its own image.

**Expected behavior now.** Instructions such as “preserve logo” on Reference 1 and “preserve identity” on Reference 2 remain attached to those images through generation. Swapping or editing slot guidance changes execution identity and cannot return a stale resume.

**Verification and evidence.** Main commits `b4c7b180` / `b7fb8406` include provider request-body, hashing, routing, direct/graph execution, list iteration, and image-editor AI coverage. See [AUD-011 reference-group evidence](../../notes/overlap-fable-aud011-reference-groups-2026-07-17.md).

**Caveat.** Providers expose different request schemas, so some receive native reference objects and others receive explicit indexed prompt blocks. The invariant is preserved association, not identical wire format.

### AUD-012 — Backend proxy requests disclose nested credentials

**Original problem.** Top-level `apiKeys` were removed, but the full nested provider-settings object still contained service-account JSON, device/native tokens, authorization headers, and paired-device secrets.

**What changed.** Proxy requests are built from a versioned allowlist DTO containing only execution-safe fields. Client-only local upscale remains client-side, and retry classification prevents an unavailable local post-process from repeating paid proxy generation.

**Expected behavior now.** Sending a job through a configured backend proxy should include only the model/execution configuration the proxy needs. Keys, device PINs/tokens, service-account JSON, and arbitrary authorization fields remain on their owning side.

**Verification and evidence.** Main commits `1f85f259`, `b68d5114`, and `d077fa4` passed 9 files / 77 tests, both TypeScript projects, lint, diff, and build after K3 found and the author fixed an unintended paid-retry boundary. The proxy DTO is also exercised by AUD-013 parity tests.

**Caveat.** This protects renderer-to-proxy projection. The proxy service remains responsible for its own server-side secret storage, request logging, and access policy.

### AUD-013 — Backend proxy responses discard valid outputs and metadata

**Original problem.** Proxy reconstruction kept a primary result and a few fields but discarded additional outputs, MIME/extension/filename, Blob/file information, metadata, and other envelope fields used by history and Source Library consumers.

**What changed.** Proxy responses use a versioned, bounded, typed result envelope. Primary and additional results retain media family, MIME, file identity, output metadata, status, and usage. Validation binds responses to the request, rejects family/type disagreement and oversized/hostile data, and cancels response bodies rejected after headers.

**Expected behavior now.** A proxied multi-image or file-producing job should arrive with the same meaningful outputs and metadata as a direct job. Invalid or mismatched proxy responses fail with a controlled error rather than being partially accepted.

**Verification and evidence.** Main lineage `95d8148b` → `da451f5e` → `bd2a2bb9` with evidence through `c208e578` covers direct/proxy parity, multi-output, file/Blob serialization, request binding, size/type/family checks, cancellation, and neighboring Flow store behavior. See [initial envelope evidence](../../notes/overlap-opus-aud013-result-envelope-2026-07-17.md), [review corrections](../../notes/overlap-opus-aud013-result-envelope-corrections-2026-07-17.md), and [family/cancel evidence](../../notes/overlap-opus-aud013-result-envelope-family-cancel-2026-07-17.md).

**Caveat.** The envelope is intentionally bounded. Very large binary results should travel through supported asset/file references rather than unbounded inline JSON.

### AUD-027 — Rapid Flow workspace switching can mismatch selector and canvas

**Original problem.** If workspace B was still restoring assets when the user selected C, an in-flight boolean dropped the C request. The selector could say C while the canvas still showed B; a delayed asset restore could also patch a reused node ID in the wrong canvas.

**What changed.** A serialized workspace-switch coordinator coalesces intermediate requests and always drains to the newest surviving target. Asset restoration is bound to workspace ID and graph generation. Exact B state is captured before C replaces it; close, failure, disposal, targeted window commands, and last-tab replacement have explicit outcomes.

**Expected behavior now.** Rapidly selecting A → B → C should settle on C in both the tab selector and canvas. Late bytes from A or B should not appear in C, even if node IDs were reused. Failed or closed intermediate targets should not strand the switcher.

**Verification and evidence.** Main commits `31a52df8` / `cdcb79ce` passed 12 focused tests, 165 project/asset neighbors, 28 UI/window/replacement neighbors, both TypeScript projects, lint, diff, and build. See [AUD-027 queue evidence](../../notes/aud-027-flow-workspace-switch-queue-2026-07-18.md).

**Caveat.** Disposal does not cancel an IndexedDB read already executing; it prevents its publication. A targeted cross-window command that cannot hydrate its requested workspace within the existing 2.5-second bound is dropped rather than misapplied.

### AUD-028 — Successful executions can disappear from the usage ledger

**Original problem.** Several provider paths returned no numeric usage object, and the ledger treated that as no execution. Real Hugging Face, BytePlus, Atlas, Vertex, proxy, and other runs could disappear entirely; some paths fabricated token counts instead.

**What changed.** Every accepted successful model execution crosses an explicit usage boundary. Missing numbers produce an actual record with `confidence: unknown`, provider/model identity, and no invented cost/tokens. Multi-stage generation plus paid upscale emits distinct ordered attributions. Failed/canceled work produces no success record; accepted-job retries do not duplicate it.

**Expected behavior now.** Project usage history should show that a provider ran even when its API supplies no price or token data. The UI can say pricing is unknown instead of showing zero or omitting the event. A generation plus separate paid upscale appears as two real operations.

**Verification and evidence.** Main commits `36e67af0`, `a79ea3c9`, and evidence through `69d21793` passed 270 provider/persistence/UI tests, 103 retry/cancellation/store tests, 150 provider-route tests, 374 Flow production tests/static audit, TypeScript, lint, diff, and build. See [AUD-028 evidence](../../notes/935-aud028-unknown-actual-usage-recording.md).

**Caveat.** An unknown record proves execution, not cost. Sloom Studio cannot calculate a truthful total until the provider or catalog supplies numeric data.

### AUD-029 — Raw provider media URLs fail downstream or encode error pages as media

**Original problem.** Downstream chaining depended on renderer fetch, lacked consistent native fallback and status/MIME checks, and could base64-encode an expired provider's HTML error page as if it were image/video/audio data.

**What changed.** One bounded materializer handles `data:`, `blob:`, remote, and file/document references with renderer fetch plus established native fallback, successful-status checks, strict media-family/MIME/size validation, cancellation, and object-URL cleanup. Failure details retain actionable HTTP status while fully redacting Basic/Bearer credential values.

**Expected behavior now.** Valid provider output should chain into later image, video, audio, or document operations even when browser CORS requires native retrieval. Expired, wrong-family, oversized, or error responses fail before provider submission instead of becoming broken media. Error messages should not reveal authorization values.

**Verification and evidence.** Main lineage `ce08bd37` through `10eb587e` and final evidence `18f7162a` passed 55 focused, 287 adjacent, 375 Flow production/static tests, both TypeScript projects, full lint, diff, build, and repeated independent credential-redaction checks. See [initial materialization](../../notes/942-aud029-downstream-media-materialization.md), [media-boundary correction](../../notes/943-aud029-media-boundary-review-correction.md), [failure-detail correction](../../notes/944-aud029-failure-detail-redaction-correction.md), and [alphabetic Bearer correction](../../notes/945-aud029-alphabetic-bearer-redaction-correction.md).

**Caveat.** Native fallback requires the relevant desktop/mobile bridge. Every inline path remains bounded; this is not permission to accept arbitrary file types or unlimited bytes.

### AUD-030 — Long polling holds a shared provider queue lock

**Original problem.** Rate limiting enclosed the whole job lifetime. A minutes-long poll held the queue, and unrelated Atlas, BytePlus, local, proxy, or Function routes could share the default limiter and block one another.

**What changed.** Provider admission limits operation starts, then releases the scheduler while the accepted job polls. Every supported direct/proxy route resolves to an explicit independently instantiated policy. Prompt pass-through and Android stay local; Local/Open uses its own registered proxy policy; orchestration-only nodes bypass provider admission.

**Expected behavior now.** A long-running video or image job should not prevent an unrelated provider from starting. Requests to the same provider still respect configured start spacing. Canceling a queued start removes it cleanly, and a failed start does not poison later admission.

**Verification and evidence.** Main commits `59358dc3`, `f3425056`, and evidence `65b1d910` passed 8 focused scheduling/route tests, 253 execution neighbors, 112 proxy/usage/billing tests, 375 Flow production/static tests, TypeScript, lint, diff, and build after independent review found and corrected unregistered local/proxy keys. See [scheduler evidence](../../notes/934-aud030-provider-start-scheduler.md) and [policy-matrix correction](../../notes/941-aud030-supported-route-policy-matrix-correction.md).

**Caveat.** This controls local request-start admission. It cannot change a provider's own account quota, remote concurrency policy, or queueing after the request reaches its service.

### AUD-031 — Source Library persistence failures can look successful, then vanish

**Original problem.** When IndexedDB/native/scratch persistence failed, an item could remain visible for the current session, lose its only inline bytes during sanitization, and disappear on restart with no warning.

**What changed.** Recoverable failures retain inline recovery bytes and mark the item/storage state as degraded. If quota cannot hold those bytes, persistence retries with an explicit unavailable record, preserved identity, recovery instruction, and visible warning. Restart sanitization keeps unavailable items instead of silently deleting them, and later replacement uses the current asset identity.

**Expected behavior now.** A storage failure should be visible. Whenever bytes can be retained, the Source item should reopen. If quota prevents that, the item remains listed as unavailable and tells the user to relink/regenerate rather than simply disappearing.

**Verification and evidence.** Main commits `829fe860` / `90deb402` passed 66 focused and 225 adjacent Source tests, 375 Flow production/static tests, both TypeScript projects, lint, diff, build, and independent review. See [AUD-031 durability evidence](../../notes/946-aud031-source-library-durability.md).

**Caveat.** An explicit unavailable record cannot recreate missing bytes. It preserves project truth and recovery context; the user may still need to relink or regenerate the asset.

### AUD-032 — Run Me lacks its own progress and cancellation

**Original problem.** Run Me initiated the upstream chain but did not own `isRunning` or a controller. Users had to find whichever upstream node was active to understand or cancel the run.

**What changed.** The requested root is registered in immutable graph-run ownership even when it is a passive Run Me trigger. Root and dependency nodes receive running/status patches; `BaseNode` displays the cancel control; `cancelNodeRun` finds the active planning or execution controller and invalidates every node owned by that root.

**Expected behavior now.** Clicking Run Me shows Running/status on the trigger itself. Its Cancel button cancels planning, confirmation, or the active upstream graph and clears owned running state rather than requiring the user to hunt for a provider node.

**Verification and evidence.** This finding is mapped through the combined Flow runtime rather than a standalone note. `48ab7d18` and `502bb0e3` include Run Me/API Requester reachability, root/dependency cancellation, diamond deduplication, confirmation, and stale-owner tests; the combined lane passed 458 author tests, 91 fresh targeted tests, the full suite, and the 340-test Flow production/static gate.

**Caveat.** Canceling after a remote provider has irreversibly accepted work cannot guarantee that the provider stops billing; AUD-008 guarantees local abort/late-result suppression and uses provider cancellation where available.

### AUD-033 — Vision Verify advertises Boolean but records text

**Original problem.** The node's port claimed Boolean while execution/history stored text. Literal `false` was especially vulnerable to truthiness loss, project reopen changes, proxy disagreement, or generic consumer misclassification.

**What changed.** Vision Verify uses a strict shared verdict parser and a true Boolean result through direct, Vertex, proxy, history, attempt selection, project persistence, Functions, signals, Source hydration, and downstream ports. Missing, malformed, embedded, or contradictory verdicts fail closed and do not enter semantic retry loops. Metadata is bounded and complete.

**Expected behavior now.** True remains `true`, false remains `false`, and both route as Boolean after save/reopen or proxy use. Malformed provider output produces an explicit failure instead of being guessed as a verdict.

**Verification and evidence.** Main lineage `f8754b27` through `4bb9c8c0` survived multiple independent blocker rounds covering type widening, proxy disagreement, legacy strings, selected attempts, Source collisions, metadata bounds, retry count, TypeScript, and build. Evidence is retained in [initial Boolean contract](../../notes/914-aud-033-vision-verify-boolean-contract.md), [repair](../../notes/915-aud-033-vision-verify-boolean-repair.md), [strict verdict correction](../../notes/917-aud-033-vision-verify-final-blocker-correction.md), [legacy repair](../../notes/918-terra-aud-033-legacy-boolean-metadata-repair.md), and [hostile metadata correction](../../notes/919-aud-033-hostile-metadata-boolean-contract.md).

**Caveat.** Legacy string values are migrated only when they are unambiguous. Ambiguous historical/provider data is rejected rather than coerced.

---

## Paper portability, synchronization, and print/export correctness

### AUD-004 — Portable `.sloom` and “Package for print” omit Paper's required bytes

**Original problem.** Paper documents referenced managed images, fonts, licenses, and ICC profiles stored only in the source browser profile. Portable projects and print packages shipped references or inventories without the bytes, so artwork/fonts/color profiles disappeared on another machine.

**What changed.** Portable `.sloom` gained a versioned, content-addressed Paper asset section built from every reachable tab. Imports verify canonical base64, size, MIME, path, SHA-256, duplicate identity, and rights policy before transactional staging. Print packages include actual Links, Fonts, Licenses, and Profiles plus a digest manifest and explicit unpackaged-link reasons. Saved/package ZIP output is reopened and validated for canonical, bounded archive structure before being returned.

**Expected behavior now.** Exporting a portable project with managed assets should reopen on a clean profile with artwork, exact allowed fonts, license text, and ICC bytes intact. “Package for print” should contain the actual reproducible assets it claims. Missing/restricted/unattested font records fail with an actionable message instead of producing a deceptively complete package.

**Verification and evidence.** The implementation began at `6a18021a`; archive/output hardening continued through `3ac0cbdb`. Clean-profile tests use two Paper tabs, managed PNGs, a font/license, and the real FOGRA39 profile, then wipe repository state and verify exact reconstruction. Author evidence included 97 portability tests and 81 neighbors; later canonical-ZIP gates added malformed archive, collision, CRC, coverage, and output-reopen cases. See [AUD-004 portable asset evidence](../../notes/overlap-fable-aud004-portable-paper-assets-2026-07-16.md).

**Caveat.** Plain Save may preserve a document while explicitly excluding a font whose editable-project packaging rights are not proven; strict portable export/package fails closed. Some native/blob-backed Source links can be listed honestly as unpackaged rather than silently embedded.

### AUD-017 — Paper JSON export cannot round-trip through its own import picker

**Original problem.** Paper exported `.sloom-paper.json` and accepted that filename in the picker, but format inference treated it as text. Import could place the serialized JSON as visible text and replace the real layout.

**What changed.** Extension/signature routing recognizes native Paper JSON and sends it to validated Paper deserialization before document replacement.

**Expected behavior now.** Exporting Paper JSON and immediately importing it should reconstruct the Paper document structure instead of creating a page full of JSON source text.

**Verification and evidence.** The old test inferred TXT; the corrected format suite passed 26 tests. Main commit `28d2db16`. See the AUD-017 row in [Terra quick-win evidence](../../notes/overlap-terra-quickwins-2026-07-16.md).

**Caveat.** Arbitrary foreign `.json` remains ordinary text unless it uses a supported Paper format/signature. That avoids guessing that unrelated JSON is a Sloom document.

### AUD-018 — Placed PDF frames break raster exports and soft proof

**Original problem.** A placed PDF data URL was sent to `HTMLImageElement`, which cannot decode it. PNG/CBZ/KDP/raster-PDF, soft proof, and browser PDF/X could fail after beginning work or partially output unaffected pages.

**What changed.** The repository has no general PDF rasterizer, so the honest repair is a shared typed preflight boundary. It identifies PDF placements from definitive current MIME/metadata/labels across image and document frames, revalidates linked source identity, and blocks the complete raster transaction before asset reads, canvas work, downloads, or success status. Compatible live/print HTML retains real PDF `<object>` placement.

**Expected behavior now.** A document containing a placed PDF can still use compatible live/vector print paths. Choosing an unsupported raster/soft-proof/browser-PDF-X path produces a clear preflight message before any partial pages or misleading files are emitted.

**Verification and evidence.** Main lineage `866471f2` through `ebc96d77` covers mixed pages, aliases, malformed/missing assets, MIME changes, linked-source drift, side-effect ordering, and output lifetime. Final evidence records 86 focused and 896 broad Paper tests, Paper production verification, TypeScript, lint, diff, and build. The final note was integrated as commit `2936624e`; the surrounding combined Paper correction is retained in [combined Paper blocker evidence](../../notes/overlap-fable-paper-combined-blocker-correction-2026-07-17.md).

**Caveat.** This repair is correctness by fail-closed capability, not new PDF rasterization. Raster output of placed PDFs will remain unavailable until a bounded PDF renderer is added.

### AUD-019 — Paper sync is single-document metadata-only despite assets and tabs

**Original problem.** Paper sync sent one active document body, ignored the declared asset IDs/bytes, and did not update the tab catalog/active identity. Receivers could get broken art/font/profile references or have one tab's body applied under another tab's identity.

**What changed.** Schema-v1 Paper sync carries the ordered tab catalog, editor state, active tab ID, and deduplicated reachable managed-asset inventory. The sender verifies and publishes all bytes before the workspace envelope. The receiver authenticates role/MIME/hash/length and atomically stages the full record set before one workspace apply. Unsupported schemas, corrupt records, partial writes, ambiguous legacy replacements, and rejected LAN authority leave repository and workspace unchanged.

**Expected behavior now.** Synchronizing a multi-tab Paper workspace to a clean receiver should reproduce the same tabs and active document with managed images, exact fonts/licenses, and ICC profiles available. A bad or incomplete transfer should not partially alter the receiver.

**Verification and evidence.** Main commits `d8c763c9`, `c55b94ca`, and evidence `ef75224e` include a two-tab clean receiver, records larger than the generic transient tail, concurrent envelopes, legacy routing, unsupported version, role substitution, injected mid-batch write failure, atomic rollback, 145 corrected-gate tests, TypeScript, lint, diff, and Paper production verification. See [workspace sync evidence](../../notes/929-aud019-paper-workspace-managed-asset-sync.md) and [independent-gate corrections](../../notes/930-aud019-independent-gate-corrections.md).

**Caveat.** Older peers follow their historical active-document path and do not gain full workspace capability. Current peers fail closed on unsupported workspace schema rather than pretending compatibility.

### AUD-020 — “Flattened PDF” can double-paint shapes and substitute fonts

**Original problem.** The ordinary “flattened” PDF was actually hybrid: translucent shapes could be rasterized into a backdrop and then drawn again, changing appearance. Exact managed fonts could be absent in the isolated export window and fall back or reflow.

**What changed.** Exact managed-face identity, stretch/style/angle, bounded readiness, and digest-derived aliases now travel into every isolated export route. The ordinary Flattened PDF path became genuinely fully raster: one authoritative page raster is placed once, with vector/text overlays removed so shapes/text cannot double-paint.

**Expected behavior now.** Flattened PDF pages should visually match the authored page without doubled translucent shapes or font fallback/reflow. The output is intentionally rasterized; ordinary vector/hybrid exports remain separate choices.

**Verification and evidence.** Exact-font reconciliation spans `d43026ef` through `521f92d0`; the shape fix is `ae62b995` with evidence `91730608`. Tests cover requested face identity/readiness, duplicate/collision descriptors, browser/electron windows, translucent shapes, and no overlay in fully raster mode. See [exact-font reconciliation](../../notes/920-fbl-005-aud-020-terra-reconciliation.md) and [shape double-paint evidence](../../notes/925-aud-020-flattened-pdf-shape-double-paint.md).

**Caveat.** Fully raster output deliberately sacrifices selectable/vector text in that preset. Users needing vector text should choose an appropriate non-flattened PDF/PDF-X route and satisfy its stricter font/preflight requirements.

### AUD-037 — Popup-blocked browser PDF reports the wrong success state

**Original problem.** If `window.open` was blocked, the fallback downloaded HTML while the caller still announced that a PDF print dialog opened. Other font/DOM/print/storage errors could reject outside a consistent result.

**What changed.** Browser preview returns a typed `printed`, `html-fallback`, or `failed` outcome. The popup is opened synchronously and isolated before async font work. Browser fallback reports download startup; Android awaits ordered storage destinations and reports the winning path or failure. All shipping callers settle the outcome without an unhandled rejection.

**Expected behavior now.** A successful popup says the print dialog opened. A blocked popup says an HTML fallback was started/saved through the actual platform route and does not claim a PDF dialog. Font readiness, popup write/print, and storage failures show failure.

**Verification and evidence.** Main correction `997b8704` followed an earlier proof and real Chromium discovery. The superseding gate passed 56 focused, 123 adjacent tests, TypeScript, lint, diff, Paper verifier, and a direct Playwright Chromium popup-handle check. See [regression proof](../../notes/934-aud037-popup-outcome-regression-proof.md) and [superseding correction](../../notes/935-aud037-popup-outcome-superseding-correction.md).

**Caveat.** Browser APIs cannot confirm final disk persistence after download handoff. No Acrobat/press certification is inferred from the local Paper verifier.

### AUD-038 — ICC/WASM resources leak across repeated exports

**Original problem.** RGB→CMYK, soft proof, and PDF/X paths did not symmetrically close every LCMS profile/transform on success and failure, so repeated operations accumulated native/WASM handles. Cleanup errors could also hide the real export error.

**What changed.** Profiles/transforms have explicit required ownership and disposal. Construction and export paths use best-effort `try/finally` cleanup, attempt every release, preserve the primary error, retain cleanup evidence without mutating frozen errors, reject use-after-dispose, and enforce owned-transform types in PDF/X dependencies.

**Expected behavior now.** Repeated soft proofs and color-managed exports should not accumulate per-operation LCMS handles. If export and cleanup both fail, the user-facing failure remains the actual export/conversion cause while cleanup evidence remains available for diagnostics.

**Verification and evidence.** Main lineage `60f92aa4` through `fc2fa630`/`4ad12e81` passed 16 files / 88 lifecycle and neighboring tests, including 100 RGB, 100 soft-proof, 50 PDF/X iterations, partial construction, failed cleanup, frozen/primitive errors, use-after-dispose, compile-time ownership, TypeScript, lint, diff, and build. See [AUD-038 resource ownership evidence](../../notes/915-aud-038-icc-wasm-resource-ownership.md).

**Caveat.** Deterministic handle accounting is not the same as a long interactive browser/Electron heap profile or a press/RIP certification. The LCMS engine itself remains process-lifetime state where the library exposes no destructor.

---

## Image document, history, snapshot, selection, and memory correctness

### AUD-021 — Layer-operation undo holds live canvases

**Original problem.** Layer-operation history stored live layer/canvas objects. Painting those objects later mutated the supposedly older history, so undoing a layer insertion could resurrect a later stroke.

**What changed.** History retention deep-clones mutable bitmap/mask resources into immutable operation-owned storage with shared-identity deduplication. Undo/redo materializes fresh live canvases instead of exposing retained history objects. Eviction and clear paths dispose only owned retained resources.

**Expected behavior now.** Undo should reconstruct the pixels that existed when the operation was recorded. Later paint cannot travel backward into an older undo entry, and replayed pixels can be edited without mutating history.

**Verification and evidence.** The Image integrity lineage begins at `58c5d933` and continues through content-digest, structure, metadata, symbol/platform, and transactional corrections. It includes chronology, aliasing, disposal, corruption, 4K structure, no-OffscreenCanvas, hostile metadata, project/`.slimg`, TypeScript, lint, diff, and build gates. See [Image snapshot/history evidence](../../notes/overlap-sol-image-snapshot-integrity-2026-07-16.md) and subsequent notes `914`–`921` for reviewer corrections.

**Caveat.** Immutable history necessarily retains pixel bytes until entries are evicted; AUD-034's exact accounting now bounds that cost.

### AUD-022 — Named Image snapshots do not freeze or persist pixels

**Original problem.** A snapshot reused `doc.layers`, so later painting changed the snapshot. Project persistence stripped snapshot bitmap/mask data, making restore after reopen metadata-only or based on current pixels.

**What changed.** Named snapshots own immutable cloned pixels and selection masks, bind them to structural/content digests and resource metadata, serialize them through project and `.slimg` codecs, validate bounds before decode, and apply them transactionally. Corrupt/incomplete snapshots are unavailable or rejected without replacing live work.

**Expected behavior now.** Creating a named snapshot, editing further, and restoring should return to the captured pixels and selection. The same should remain true after save, close, and reopen. A damaged snapshot should not install blank or mismatched pixels.

**Verification and evidence.** The multi-round Image lineage (`58c5d933` through `bb568b80`) covers mutation-after-capture, clean reopen, digest byte changes, swapped identities, duplicate IDs, structural limits, cache invalidation, symbols/direct pixel data, rollback/disposal, and platform fallbacks. See [primary AUD-021/022/023 note](../../notes/overlap-sol-image-snapshot-integrity-2026-07-16.md), [structural limits](../../notes/916-image-snapshot-structural-size-limits.md), and [transaction correction](../../notes/920-image-snapshot-direct-data-symbol-transaction-correction.md).

**Caveat.** Legacy snapshots that cannot prove complete pixel integrity fail closed; the application does not fabricate a pixel-accurate restore from metadata alone.

### AUD-023 — Selection state can say selected when no mask exists

**Original problem.** `hasSelection` persisted in the document while the real mask lived only in a module registry. Reopen could show selection actions with no mask, close leaked masks, and a reused document ID could inherit stale selection data.

**What changed.** Selection masks are snapshotted, serialized, content-verified, restored transactionally, and tied to document lifecycle. Close, replacement, eviction, rollback, and reused IDs clear/dispose the corresponding registry state. UI truth follows the verified mask rather than a detached flag.

**Expected behavior now.** Saving and reopening a document with a selection should restore the actual selected pixels. Closing it removes its mask. A new document with a reused ID cannot inherit an older selection. Corrupt/missing mask data cannot enable selection-only operations.

**Verification and evidence.** This was folded deliberately into the AUD-021/022 Image correction because the snapshot and selection resource ownership are inseparable. Permanent project/`.slimg`, close, reused-ID, rollback, content-digest, lifecycle, and disposal cases are documented in [the combined Image evidence](../../notes/overlap-sol-image-snapshot-integrity-2026-07-16.md).

**Caveat.** Selection restore is guaranteed only when its dimensions/data/content proof validates against the document. Invalid legacy state is cleared rather than guessed.

### AUD-034 — Image history cap undercounts layer operations and snapshots

**Original problem.** The 768 MiB cap estimated only simple bitmap-shaped values. Nested `layerOp`, masks, whole documents, and multilayer snapshots were zero or severely undercounted, so large histories could exceed the intended memory bound.

**What changed.** `editorOperationRetainedBytes` traverses every operation kind, counts unique retained bitmap/mask identities once, includes selection buffers, and works with the immutable-resource owner. History eviction disposes the resources it owns without invalidating live document canvases.

**Expected behavior now.** Large 4K/8K edits and multilayer operations contribute realistic RGBA/mask byte counts. When retained history reaches the configured limit, old entries are evicted and their owned resources released rather than allowing silent unbounded growth.

**Verification and evidence.** This finding has no standalone same-ID note; it is an exact sub-contract of `58c5d933` and the subsequent Image resource line. `ImageHistoryResources.test.ts` covers unique sharing, layer operations, documents, selections, byte accounting, eviction, and disposal inside the broader Image integrity gates.

**Caveat.** The estimate measures retained pixel buffers, not every byte of JavaScript object overhead or browser/GPU allocator overhead. It is a deterministic safety cap, not a heap profiler.

---

## Video, motion comics, typography, browser media, and local acceleration

### AUD-024 — Motion-comic clips resolve from four seconds to zero duration

**Original problem.** Speech, Thought, and Caption comics were authored as four-second clips but omitted from still-duration resolution and the inspector's duration controls. They contributed zero timeline length and were visible only at their exact start time.

**What changed.** Comic clips share the still-duration resolver used by images/text/shapes and expose duration through timeline/inspector paths. Stage visibility, timeline end, trimming/splitting, command placement, and export use the resolved interval.

**Expected behavior now.** Adding a comic should create a real four-second clip by default. It remains visible throughout its interval, contributes to sequence duration, and can be adjusted like another still visual.

**Verification and evidence.** Main commit `3a048b03` plus test-fixture correction `0b2196d2` passed 10 files / 150 tests spanning comic timeline, visibility, placement, inspector, native frame export, browser composition, typography neighbors, TypeScript, lint, diff, and build. See [AUD-024/AUD-025 comic evidence](../../notes/overlap-terra-comic-duration-2026-07-16.md).

**Caveat.** Duration correctness does not imply every animated comic-tail/keyframe effect is supported in every fallback encoder; that boundary is covered under AUD-025.

### AUD-025 — Browser/legacy comic export emits the comic for one frame

**Original problem.** The fallback rendered a comic to one PNG but did not loop that still input, so only the first encoded frame contained a four-second comic.

**What changed.** Browser/legacy FFmpeg and image-sequence fallback hold the rasterized comic card for the complete resolved still interval. The native frame-server remains the per-frame path for dynamic comic animation.

**Expected behavior now.** A static comic remains present for its full authored duration in fallback video/image-sequence exports instead of flashing for one frame.

**Verification and evidence.** The same `3a048b03` lineage covers full-interval fallback visibility alongside 117 focused media/comic tests and the 150-test integrated gate. See [comic duration/export evidence](../../notes/overlap-terra-comic-duration-2026-07-16.md).

**Caveat.** Fallback routes freeze the rasterized comic card. Animated tails/keyframes remain dynamic only through the native frame-server path.

### AUD-026 — Exact bundled font-face selection is discarded in Image and Video

**Original problem.** The font browser returned family, weight, and style, but Image/Video consumers applied only the family. Selecting 700 Italic could leave old/400 typography and cause synthetic or fallback rendering.

**What changed.** Image text controls and every relevant Video stage/clip/tool/asset path apply family, weight, and style atomically. Persisted typography normalizes safe weights, preserves exact fields through asset-to-timeline placement, and uses shared standards-aware Canvas/CSS family serialization. Measurement, preview, SVG/raster export, and final paint use the same face tuple.

**Expected behavior now.** Choosing a bundled face such as Bold Italic should visibly use that exact weight/style in the editor and retain it through save/reopen, reusable asset placement, timeline rendering, and export.

**Verification and evidence.** Main typography lineage `f4354798` → `8216af39` → `42a65b24` → `ada9bcc5` passed 16 files / 212 integration tests, real-Chromium serializer oracles, TypeScript, zero-error lint, diff, and build after Sol/Terra review rounds. See [combined typography evidence](../../notes/overlap-kimi-typography-2026-07-16.md).

**Caveat.** Exact bundled face registration across restart and Paper's managed-font export required separate FBL findings; those were also completed in the full package but are not part of AUD-026 itself.

### AUD-035 — Reusing a saved comic loses its defaults

**Original problem.** Saved comic assets carried `comicDefaults`, but re-placement ignored them, losing comic kind, text, colors, stroke, and tail settings.

**What changed.** Reusable comic placement reapplies normalized stored defaults in the same way reusable text/shape assets apply theirs, while preserving placement-specific identity/timing.

**Expected behavior now.** Dragging or placing a saved comic asset should recreate its authored bubble/caption type, wording, fill/text/stroke colors, stroke width, and tail settings instead of reverting to generic defaults.

**Verification and evidence.** Main commits `b3d47ad0` / `b0597e23` include old-code-sensitive placement cases and adjacent editor-asset normalization. See [AUD-035 comic default evidence](../../notes/936-aud035-reusable-comic-default-placement.md).

**Caveat.** Placement still creates a new clip with its own identity and location; later edits to the library asset are not implied to live-update existing clips.

### AUD-036 — Browser FFmpeg failures poison retries and collide files

**Original problem.** A rejected FFmpeg load stayed cached, cleanup was incomplete, virtual filenames were reused, and overwrite behavior was unspecified. Later attempts could remain permanently broken or collide with stale files.

**What changed.** Rejected loader promises are evicted. Each browser operation owns UUID-scoped virtual paths, explicit `-y`, tracked file cleanup on success/failure, continued cleanup after delete errors, and primary-error preservation. Internal UUID names are mapped back to stable public image-sequence filenames/manifests.

**Expected behavior now.** Retrying after an FFmpeg load failure can create a fresh instance. Concurrent/failed browser exports should not overwrite one another or leak internal names into ZIPs. Partial files are cleaned when discoverable, and the original media error remains visible.

**Verification and evidence.** Main commits `24d40f01` and `8cebe3dd` passed 5 files / 64 tests plus TypeScript, lint, diff, and build after K3 caught the public-filename regression. See [AUD-036 FFmpeg evidence](../../notes/overlap-terra-browser-ffmpeg-2026-07-16.md).

**Caveat.** Tests inject the FFmpeg wrapper rather than downloading the CDN WASM core. If the core's directory listing itself fails, undiscoverable partial files may remain inside that failed worker until reset, though UUID isolation prevents cross-run collision.

### AUD-039 — “Local CPU AI” actually requires Vulkan

**Original problem.** Product copy promised local CPU-only upscale, but the managed binary is `realesrgan-ncnn-vulkan` and has no working CPU mode. CPU-only/no-Vulkan systems could never satisfy the advertised fallback.

**What changed.** User-facing surfaces now call the managed route **Local Vulkan AI** and state that a compatible Vulkan GPU/driver is required with no CPU fallback. A shared capability object reports the backend/accelerator truth, known Vulkan initialization failures return a typed `vulkan-unavailable` result, and new output metadata uses Vulkan-accurate names. The old `local-ai-cpu` identifier is retained only for project/settings compatibility.

**Expected behavior now.** Systems with working Vulkan can use the managed local upscaler. Systems without it receive a direct requirement message rather than being told CPU mode will work. Old saved projects/preferences still load.

**Verification and evidence.** Main lineage `f83a4a2c`, `83eaccb6`, `1861f9e1`, and evidence `1ceec0af` passed 68 focused, 147 adjacent tests, no-Vulkan platform messages, both TypeScript projects, Electron/helper syntax, lint, residual-copy search, diff, and build. See [AUD-039 Vulkan truth evidence](../../notes/941-aud039-local-vulkan-upscaler-truth.md).

**Caveat.** No CPU backend was added. The repair makes capability truthful; a genuine CPU fallback would be a separate product feature.

---

## Complete correctness-audit ID map

This table is an index to the category sections above. “Direct” means the finding has a clearly named primary evidence note or isolated implementation lineage. “Combined” means the exact invariant was closed and tested inside a broader repair whose principal label was another finding.

| ID | Severity | Category in this guide | Closure mapping |
|---|---|---|---|
| AUD-001 | Critical | Project/desktop integrity | Direct multi-window project authority; settings sub-seams split across AUD-015/AUD-042/FBL-033 |
| AUD-002 | Critical | Flow run ownership | Direct, combined final reconciliation with AUD-006/AUD-008 |
| AUD-003 | Critical | Provider retry/spend | Direct |
| AUD-004 | Critical | Paper portability/package | Direct |
| AUD-005 | Critical | Image destructive lifecycle | Direct |
| AUD-006 | High | API Requester reachability | Direct, combined final reconciliation with AUD-002/AUD-008 |
| AUD-007 | High | Reusable Functions | Direct |
| AUD-008 | High | Provider cancellation | Direct, combined final reconciliation with AUD-002/AUD-006 |
| AUD-009 | High | Run Me freshness | Combined immutable provider-run planning (`502bb0e3`) |
| AUD-010 | High | Resume identity | Combined immutable provider-run planning (`502bb0e3`) |
| AUD-011 | High | Numbered reference groups | Direct |
| AUD-012 | High | Proxy request minimization | Direct |
| AUD-013 | High | Proxy response parity | Direct |
| AUD-014 | High | BytePlus persistence | Direct |
| AUD-015 | High | License/settings hydration | Direct, multi-round convergence lineage |
| AUD-016 | High | File-operation errors | Direct |
| AUD-017 | High | Paper JSON round trip | Direct |
| AUD-018 | High | Placed-PDF raster capability | Direct fail-closed capability repair |
| AUD-019 | High | Paper workspace/asset sync | Direct |
| AUD-020 | High | Flattened PDF parity | Direct exact-font + full-raster lineages |
| AUD-021 | High | Image undo chronology | Direct combined Image resource lineage |
| AUD-022 | High | Named snapshot pixels | Direct combined Image resource lineage |
| AUD-023 | High | Selection-mask lifecycle | Directly folded into AUD-021/022 resource lineage |
| AUD-024 | High | Comic duration | Direct |
| AUD-025 | High | Comic fallback export | Direct |
| AUD-026 | High | Exact Image/Video face tuple | Direct |
| AUD-027 | Medium | Flow workspace switching | Direct |
| AUD-028 | Medium | Usage truth | Direct |
| AUD-029 | Medium | Downstream media materialization | Direct |
| AUD-030 | Medium | Provider start scheduling | Direct |
| AUD-031 | Medium | Source Library durability | Direct |
| AUD-032 | Medium | Run Me status/cancel | Combined Flow root-run ownership (`48ab7d18`, `502bb0e3`) |
| AUD-033 | Medium | Vision Boolean contract | Direct, multi-round strict-parity lineage |
| AUD-034 | Medium | Image history memory accounting | Combined Image resource lineage (`58c5d933`) |
| AUD-035 | Medium | Reusable comic defaults | Direct |
| AUD-036 | Medium | Browser FFmpeg lifecycle | Direct |
| AUD-037 | Medium | Browser PDF outcome | Direct |
| AUD-038 | Medium | ICC/WASM ownership | Direct |
| AUD-039 | Medium | Local-upscale capability truth | Direct |
| AUD-040 | Medium | Single-instance/external open | Direct, multi-round desktop lineage |
| AUD-041 | Medium | Startup project recovery | Direct |
| AUD-042 | Medium | Portable settings backup | Direct |
| AUD-043 | Medium | First-run sequencing/i18n | Direct |
| AUD-044 | Low | Flow context-menu locale | Direct |

## What this changes for day-to-day use

The most consequential shift is that Sloom Studio now treats long-lived state and output as owned transactions rather than loose UI snapshots:

- A project, Flow run, Function run, external file open, Paper sync event, Image history entry, and provider job all carry explicit identity and lifecycle boundaries.
- Existing output is no longer silently assumed current merely because it is present on a node.
- Portable/project/package claims are backed by verified bytes or blocked with a specific reason.
- Destructive actions ask for an explicit decision and re-check that the decision still applies before mutation.
- Provider execution separates accepted paid work from retryable waiting and keeps actual usage truth even when price is unknown.
- Export routes either produce the capability they advertise or fail before partial/misleading output.
- Platform limitations—Vulkan, browser popup/download behavior, placed-PDF rasterization, non-abortable bridges—are now surfaced as limitations instead of being mislabeled as success.

## Remaining operational expectations

The audit findings are closed in the integrated repair package, but prudent release validation still includes real projects and platform smoke tests. In particular:

1. Open, edit, save, and switch one representative multi-workspace project across more than one desktop window.
2. Reopen a portable Paper project on a clean profile and inspect artwork, exact fonts, profiles, and at least one export.
3. Exercise one provider run with confirmation, cancellation, retry, Source output, and usage history using non-production-cost fixtures where possible.
4. Export a representative Image/Video/Paper document on each shipping OS and confirm the user-visible outcome text matches what actually occurred.
5. Treat press/PDF certification, macOS external-open hardware behavior, GPU-driver variety, and remote provider/account behavior as external validation layers, not as conclusions implied by unit tests.
