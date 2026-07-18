# What the audit repair sprint accomplished

## Executive Summary

- **The full frozen audit scope is repaired.** The two audits identified 79 distinct correctness findings: six Critical, 40 High, 30 Medium, and three Low. All 79 are now mapped to integrated implementations and independent verification evidence.
- **The largest gains are protection against silent loss and incorrect output.** Project replacement, dirty-document close, Paper asset transfer, Image snapshots, Source Library persistence, startup recovery, and cross-window ownership now preserve or explicitly reject state instead of silently substituting, dropping, or overwriting it.
- **Creative output is more faithful.** Paper typography, exact managed fonts, flattened/PDF/X/KDP output, placed PDFs, Image text, Video text/comics, and browser media processing now retain more of the authored intent and fail clearly when an exact result cannot be produced.
- **Flow execution is more truthful and controllable.** Run ownership, cancellation, retry behavior, resuming, function outputs, typed routing, list ordering, provider scheduling, usage records, and downstream media acquisition were corrected at their real application boundaries.

## The measured change

| Measure | Count | Meaning |
|---|---:|---|
| Findings in the Codebase Correctness Audit | 44 | `AUD-001` through `AUD-044` |
| Findings in the Fable comparison audit | 35 | `FBL-001` through `FBL-035` |
| Total frozen audit scope | 79 | The denominator used throughout this guide |
| Recorded closed at sprint start | 32 | Starting point on July 16 |
| Newly closed during the repair sprint | 47 | Net improvement over the starting point |
| Integrated and independently verified at completion | 79 | Full numbered scope |
| Remaining numbered findings | 0 | No unmapped audit ID, active repair lane, or external blocker |

The completion point is main repair commit `939e4514`, which integrated the final finding, FBL-009. Later commits change sale language and mark the internal `0.9.12d` build; those changes do not alter the 79-item accounting.

## What changed for a person using Sloom Studio

### Projects should resist accidental replacement and silent loss

Multiple windows and workspaces now use explicit authority and freshness checks before replacing shared project state. Dirty Image and Paper documents have decision/recovery paths. Startup project failures retain the failed path and offer recovery choices rather than quietly forgetting the project. Portable project/package operations include the Paper bytes they require. Relevant findings include `AUD-001`, `AUD-004`, `AUD-005`, `AUD-016`, `AUD-019`, `AUD-031`, `AUD-040`, `AUD-041`, `FBL-001`, `FBL-002`, `FBL-003`, and `FBL-031`.

### Paper output should more closely match the editor

The repaired pipeline carries exact managed-font identity and richer typography through editor, composition, flattening, PDF/PDF-X/KDP, image export, soft proof, and packaged font resources. Placed PDF behavior, threaded stories, paragraph/run leading, indentation, vertical writing, zoom-time editing, condensed faces, and per-document undo received focused corrections. Relevant findings include `AUD-017`–`AUD-020`, `AUD-037`, `AUD-038`, `FBL-004`–`FBL-010`, and `FBL-021`–`FBL-026`.

### Image and Video state should survive normal editing and reopening more reliably

Image undo/snapshot content is frozen, verified, bounded, and restored transactionally; selection truth is tied to real mask content. Video comic duration/export, reusable comic defaults, exact font faces, font syntax, small caps, and kerning were corrected across preview and output. Relevant findings include `AUD-021`–`AUD-026`, `AUD-034`–`AUD-036`, and `FBL-011`–`FBL-014`.

### Flow runs should represent what was actually approved and executed

Runs now bind to immutable ownership and current workspace identity. Paid/asynchronous retries avoid duplicate submission, cancellation propagates through supported paths, resume validation binds usable content, and provider admission does not let one long poll unnecessarily block unrelated routes. Function/list/Switch/Composition contracts were aligned with runtime behavior. Relevant findings include `AUD-002`, `AUD-003`, `AUD-006`–`AUD-013`, `AUD-027`–`AUD-033`, `FBL-015`–`FBL-020`, and `FBL-027`–`FBL-030`.

### Startup, language, settings, and packaging are more honest

The first-run language choice and Community notice are sequenced instead of overlapping; locale state is shared coherently across windows and native menus; settings backups carry the promised portable preferences; the local upscaler describes its Vulkan requirement honestly; and release packaging fails if the verified bundled-font payload is absent or altered. Relevant findings include `AUD-039`–`AUD-044`, `FBL-009`, `FBL-025`, `FBL-032`–`FBL-035`.

## What completion does not claim

- It is not a proof that no undiscovered defect remains outside the two audit lists.
- It is not a substitute for feedback from real production projects, unusual documents, GPUs, printers, provider accounts, or every desktop operating system.
- It does not retroactively repair project files already corrupted by an older build; it improves rejection, recovery, and future persistence behavior.
- It does not mean every optional external service is always reachable or every provider will preserve its API behavior.
- The final FBL-009 release mechanism was locally packaged and independently inspected on Linux, while the hosted Windows/macOS/Linux release matrix was verified structurally rather than published solely for the audit gate.

