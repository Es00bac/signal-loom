# Sources, method, and glossary

## Frozen primary sources

- `docs/audits/codebase-correctness-audit-2026-07-16.md` — 44 findings, `AUD-001` through `AUD-044`.
- `docs/audits/fable-partial-audit-comparison-2026-07-16.md` — 35 additional findings, `FBL-001` through `FBL-035`, plus corroboration and rejected/unpromoted leads that are not extra numbered defects.
- `/home/cabewse/work_SPaC3/model-research/sprint-ledger.md` — chronological implementation, review, correction, integration, model, usage, and storage record.
- `docs/notes/` — finding- and correction-specific evidence notes. Later notes supersede earlier author claims when an independent reviewer found a blocker.
- Git history on `overlap/integration-20260716` — the integrated code and tests. Audit closure reached `939e4514`.
- The audit progress workbook and synchronized Google Sheet — row-level accounting for all 79 unique IDs.

## How this guide was built

The source audit titles and severity classifications were kept frozen. Repair claims were reconciled against the final ledger and accepted integration history, not copied from the first author report. Where a reviewer rejected a candidate, this guide describes the later corrected behavior rather than the superseded claim.

The two detailed audit files are organized for retrieval: each ID has the original problem, implemented correction, expected user behavior, evidence, and caveats. The behavior guide intentionally groups multiple IDs because a person using Sloom Studio experiences a project-open transaction or print pipeline, not an audit numbering sequence.

## Counting rules

- The denominator is exactly 79 numbered findings.
- Corroborations, rejected claims, plausible leads, reviewer blockers, and post-audit requests are not additional findings unless they own an `AUD-*` or `FBL-*` ID.
- An implementation did not count as closed until it was integrated and independently verified.
- A finding can touch several product categories, so category references can overlap. Overlap does not change the unique-ID denominator.
- The final count is 79 integrated, 79 row-mapped, zero mapping gap, zero active correction candidates, and zero external blocker.

## Severity distribution

| Severity | Count | Meaning used by the audits |
|---|---:|---|
| Critical | 6 | Credible silent loss/corruption or uncontrolled-spend path |
| High | 40 | Breaks a primary application contract |
| Medium | 30 | Narrower or recoverable but materially incorrect |
| Low | 3 | Deterministic and limited in impact |
| Total | 79 | Frozen numbered scope |

## Glossary

**Authority / ownership:** The current window, workspace, document, or run identity permitted to commit a state-changing result. Authority checks prevent stale work from replacing newer state.

**Transactional replacement:** Prepare and validate the new state before publishing it; if any step fails, restore or retain the exact previous state rather than leaving a partial mixture.

**Fail closed:** Stop and surface a failure when exact correctness cannot be proven, instead of returning a plausible but potentially wrong result.

**Managed asset:** Image, font, license, color profile, or other byte payload that Sloom Studio owns and must transfer/persist with the project or Paper document.

**Exact managed face:** A font identity that includes more than a family name—such as source identity, weight, style, stretch, variation, and verified bytes—so a similarly named system font cannot silently substitute.

**Renderer:** An Electron/browser application window. Sloom Studio can have several renderers sharing one desktop process and project authority.

**Resume:** Reusing a previously produced result instead of calling a provider again. Correct resume requires proof that the payload is still usable and belongs to the approved inputs.

**Baton / edit ownership:** The cross-device or cross-window right to edit a document. A valid holder/epoch prevents two owners from both replacing the same state.

**Production verifier:** A generated or static contract check that validates the production node/port/option inventory, not only isolated unit functions.

**Independent gate:** A fresh reviewer’s attempt to reproduce remaining failures against an exact clean candidate. An author’s green test run is evidence, but not self-approval.

## Notebook questions this source set can answer

- Which repairs most directly reduce the chance of losing a project or document?
- What should be different when opening, closing, saving, or recovering Paper and Image work?
- How did exact font behavior change across Paper, Image, Video, and packaged installers?
- Which Flow changes affect provider cost, cancellation, retry, resume, and deterministic output?
- Which repairs deliberately replace a silent fallback with a visible failure?
- What should be manually tested before the next public release?
- What does 79/79 mean, and what does it explicitly not mean?

