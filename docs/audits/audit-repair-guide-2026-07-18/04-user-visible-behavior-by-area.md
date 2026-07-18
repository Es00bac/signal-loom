# Expected user-visible behavior after the audit repairs

This guide translates the repair program into product behavior. “Before” describes the audited failure. “Now” describes the expected behavior of the integrated implementation. The two detailed audit files provide finding-by-finding evidence.

## Opening, closing, saving, and replacing projects

**Before:** A stale window, delayed startup load, standalone Paper open, or destructive project transition could replace newer state. Dirty Image/Paper tabs could close without an adequate decision or recovery route. Some save/import/export failures were silent, and remembered-project errors could collapse into an unexplained blank project.

**Now:** Project replacement is authority-checked and transactional across supported renderer/native routes. Dirty creative documents participate in Save/Discard/Cancel or bounded recovery behavior. Startup recovery preserves the failing path and backup context and can offer Retry, Open Another, Recover Backup, or Continue Blank. The application opens blank by default unless reopening the previous project is explicitly enabled.

**Practical effect:** A user should be less likely to lose work because another window, startup task, open dialog, external file launch, or tab-close action arrived at the wrong time. When an operation cannot safely continue, the app should retain context and explain the choice rather than silently pretending it succeeded.

**Audit coverage:** `AUD-001`, `AUD-004`, `AUD-005`, `AUD-016`, `AUD-017`, `AUD-019`, `AUD-027`, `AUD-031`, `AUD-040`, `AUD-041`, `FBL-001`, `FBL-002`, `FBL-003`, `FBL-021`, `FBL-031`.

## Paper documents, managed assets, and multi-tab workspaces

**Before:** Paper could reopen blank after asset-ID normalization, discard all tabs because one tab was malformed, synchronize only one document without its managed bytes, or lose per-document undo history. A standalone `.slppr` open could bypass the same edit-ownership transaction used by a project load.

**Now:** Paper snapshots and workspace synchronization retain ordered documents, active-tab identity, and required managed image/font/license/profile records. Invalid content is handled without treating a plausible blank replacement as a successful load. Undo/redo history is document-scoped. Standalone Paper opens use the canonical ownership and rollback path.

**Practical effect:** Multi-document Paper projects should reopen and synchronize as workspaces rather than fragile single-document metadata. Switching tabs should not erase the other document’s useful history, and an unsafe replacement should stop or recover instead of blanking the workspace.

**Audit coverage:** `AUD-004`, `AUD-017`, `AUD-019`, `FBL-001`, `FBL-002`, `FBL-003`, `FBL-021`, `FBL-026`, `FBL-031`.

## Paper typography and layout fidelity

**Before:** Rich leading, indentation, writing direction, zoom-time type values, bubble-warp edges, threaded-story slicing, condensed face width, and several advanced run/paragraph attributes could be dropped or interpreted differently between the editor and output paths.

**Now:** Canonical typography data is carried through the rich editor and managed composer with explicit inheritance and exact face descriptors. Zoom changes do not rewrite authored point size/leading. Vertical-writing changes are retained while editing. Threaded frames render their computed story slice. Per-edge bubble warp and each-line indent survive normalization/export. Condensed/stretch identity participates in exact face resolution.

**Practical effect:** The text and layout seen while authoring should be a closer predictor of PDF, PDF/X, KDP, image, soft-proof, and other flattened output. Unsupported exact typography is more likely to fail clearly than to substitute silently.

**Audit coverage:** `AUD-020`, `AUD-026`, `FBL-004`, `FBL-006`, `FBL-007`, `FBL-008`, `FBL-010`, `FBL-022`, `FBL-023`, `FBL-024`.

## Paper printing, placed PDFs, and color-managed export

**Before:** Placed PDF frames could enter raster routes as images, flattened PDF could double-paint shapes or substitute fonts, KDP could skip the exact-font gate, browser popup fallback could be reported as a print dialog, and repeated ICC work could retain native resources.

**Now:** Placed-document identity and MIME are revalidated through output boundaries. Flattened and native paths coordinate shape/text ownership and exact managed-font readiness. Browser printing reports whether it opened a print dialog, downloaded an HTML fallback, or failed. ICC/profile/transform ownership uses bounded cleanup through success and failure.

**Practical effect:** Export results should be more faithful, and a blocked or downgraded path should be described accurately. Repeated color-managed exports should not steadily retain the same classes of native resources.

**Audit coverage:** `AUD-018`, `AUD-020`, `AUD-037`, `AUD-038`, `FBL-005`, `FBL-009`, `FBL-035`.

## Image editing, undo, snapshots, and selections

**Before:** Layer-operation undo could retain live canvas aliases and later resurrect mutated pixels. Named snapshots could refer to mutable pixels, omit pixel payloads on project save, undercount memory, or claim selection state without a real mask.

**Now:** Undo and named snapshots own immutable pixel/mask content with structural and content-digest proof, bounded size accounting, transactional restore, and lifecycle cleanup. Selection state is persisted and restored only with the content needed to make it true.

**Practical effect:** Undoing, restoring a named snapshot, saving/reopening, and moving between documents should reproduce the pixels captured at that moment rather than a later mutation or a blank placeholder. Corrupt or incomplete snapshot payloads should fail closed.

**Audit coverage:** `AUD-005`, `AUD-021`, `AUD-022`, `AUD-023`, `AUD-034`.

## Managed fonts in Image and Video

**Before:** Selecting an exact bundled face often persisted only a family name; restart/export could silently use a system fallback. Several family names produced invalid CSS/canvas shorthand, Image all-small-caps could invalidate the entire canvas font value, and Video kerning was normalized away.

**Now:** Image and Video retain stable managed-face identity and register the exact face before measurement/paint/export. Shared serialization quotes complex family names. All-small-caps uses a supported representation rather than an invalid shorthand token. Video kerning survives normalization into preview/output.

**Practical effect:** A project reopened on the same or another system should be much more likely to render the chosen bundled face consistently. Missing or malformed exact-face references should not quietly become a similarly named system font.

**Audit coverage:** `AUD-026`, `FBL-011`, `FBL-012`, `FBL-013`, `FBL-014`, `FBL-034`.

## Video, motion comics, and browser media processing

**Before:** Motion-comic clips could collapse from an authored duration to zero, legacy/browser comic export could emit only one frame, reusable comics could lose their saved appearance, and a failed FFmpeg load could poison later attempts or collide with stale virtual files.

**Now:** Comic duration and fallback export honor authored timing, reusable comic defaults are reapplied when placed, and browser FFmpeg setup/temporary files are reset and cleaned across failure/retry paths.

**Practical effect:** Motion comics should remain visible for the intended duration, multi-frame output should contain the expected sequence, reusable bubbles should retain their saved styling, and retrying a browser media job after an initial setup failure has a viable clean path.

**Audit coverage:** `AUD-024`, `AUD-025`, `AUD-035`, `AUD-036`, `FBL-019`.

## Flow run ownership, cancellation, retry, and resuming

**Before:** A run could finish into a different workspace, reuse stale upstream output, compute a self-invalidating cache key, duplicate a paid asynchronous submission, or continue after the user believed it was canceled. Resume logic could treat metadata or malformed media as a valid zero-spend result.

**Now:** A root run owns an immutable plan and workspace identity. Dependency execution is memoized within that ownership, current inputs are bound to the plan, cancellation reaches supported queued/running work, paid-job retry separates submission from polling, and resume validates usable payload content before it avoids provider work.

**Practical effect:** The output and usage record should belong to the run the user actually approved. Changing inputs, switching workspaces, canceling, or reopening cached work should not silently redirect or multiply the original provider job.

**Audit coverage:** `AUD-002`, `AUD-003`, `AUD-007`, `AUD-008`, `AUD-009`, `AUD-010`, `AUD-032`, `FBL-017`.

## Flow nodes, connections, templates, and typed results

**Before:** API Requester was unreachable through normal execution, reference descriptions could lose numbered image grouping, list inputs could follow edge-array order, local template braces could be corrupted, Switch output was typed unknown, functions exposed outputs they did not execute distinctly, and persisted edge contracts could become stale.

**Now:** The production run boundary includes API Requester with persistence/cancellation safeguards. Reference groups retain association. List slots are ordered consistently, template parsing handles case and delimiter length, Switch propagates compatible concrete types, reusable functions route handle-keyed outputs, and edge annotations are renormalized when node configuration changes.

**Practical effect:** Connections that appear valid should execute according to their visible handles, and reopening or reconfiguring a graph should not leave stale type promises behind. Templates and list combinations should be deterministic rather than dependent on internal edge order.

**Audit coverage:** `AUD-006`, `AUD-011`, `AUD-013`, `AUD-027`, `AUD-033`, `FBL-015`, `FBL-016`, `FBL-018`, `FBL-019`, `FBL-020`, `FBL-027`.

## Providers, usage, media chaining, and scheduling

**Before:** Some successful provider runs disappeared from usage history when cost data was incomplete. A remote provider URL could display once but fail as a downstream input or encode an error page as media. One provider’s long polling lifetime could block unrelated work. BytePlus/ElevenLabs options could be lost, mislabeled, or omit an explicit watermark choice.

**Now:** Successful executions can be recorded as actual runs even when price/token information is unknown. Downstream media uses one bounded renderer/native acquisition boundary with status, MIME, size, cancellation, and error-detail handling. Provider policies regulate starts independently of long polling. Supported audio formats and raw PCM/WAV identity are retained, and BytePlus image requests set the expected watermark behavior explicitly.

**Practical effect:** Usage history is more complete, chained media either materializes into validated bytes or reports an actionable failure, unrelated providers can progress independently, and provider-specific output settings better match the UI choice.

**Audit coverage:** `AUD-012`, `AUD-014`, `AUD-015`, `AUD-028`, `AUD-029`, `AUD-030`, `FBL-028`, `FBL-029`, `FBL-030`.

## Source Library durability

**Before:** If durable storage failed, a media item could appear saved and later disappear during sanitization/restart. Replacements could also leave identity inconsistent with the retained bytes.

**Now:** Recoverable inline bytes are retained when possible; quota-exhausted content remains as an explicit unavailable record with a visible warning; restart sanitization preserves that state; replacement identity follows the surviving content.

**Practical effect:** A storage problem should be visible and diagnosable. The library should no longer quietly erase every trace of an item simply because its preferred persistence backend failed.

**Audit coverage:** `AUD-031`.

## Language, first run, settings, licensing, and platform truth

**Before:** First-run dialogs could overlap and show English before language choice. Multiple windows and the native menu could disagree about locale. Context menus could retain the prior language. License validation could race settings hydration. Settings backup omitted preferences it claimed to cover. The local upscaler was labeled CPU-only although the shipped engine requires Vulkan.

**Now:** Startup interaction waits for hydrated settings and presents language selection before the localized Community notice. One revisioned locale authority converges windows and menus. Context menus observe current locale. License/settings identity uses ordered persistence and generation checks. Portable settings backup includes its declared preferences. Upscaling copy and capability responses identify the Vulkan requirement and lack of a CPU fallback.

**Practical effect:** Startup and localization are more coherent, licensing should not change incorrectly because storage completed late, restored settings are closer to what the backup promises, and users on machines without Vulkan receive an honest capability result.

**Audit coverage:** `AUD-014`, `AUD-015`, `AUD-039`, `AUD-042`, `AUD-043`, `AUD-044`, `FBL-032`, `FBL-033`.

## Desktop packaging and bundled fonts

**Before:** A developer build with a locally staged font directory could work while a clean CI-produced installer silently omitted the entire bundled font collection. A readiness checklist could declare fonts ready without checking their bytes.

**Now:** The font collection is reconstructed from pinned redistributable upstream inputs, checked against an exact manifest/checksum/length contract, staged atomically, verified before every Electron package, and probed again from packaged resources. Desktop CI lanes consume the same verified transient artifact.

**Practical effect:** An installer should either contain the exact audited 116-family/430-face library and its license payloads or fail packaging. It should not ship successfully with a missing font directory.

**Audit coverage:** `FBL-009`, `FBL-035`.

