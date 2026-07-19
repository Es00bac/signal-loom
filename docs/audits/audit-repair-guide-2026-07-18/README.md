# Sloom Studio audit-repair guide

This directory explains the two July 16 correctness audits and the repair sprint that followed. It is written as a self-contained source set for Gemini Notebook and for a product owner who wants to understand what changed without reconstructing two days of commits and reviewer transcripts.

## Bottom line

- The source audits contain **79 numbered findings**: 44 `AUD-*` findings and 35 `FBL-*` findings.
- The sprint began with **32 findings already recorded as closed**.
- By July 18, **all 79 findings had substantive implementations, exact ID mappings, independent verification, and integration on the main repair branch**.
- The sprint therefore closed **47 additional findings**.
- After the numbered audit package was installed as `0.9.12d`, the real 16-page origin zine drove a further Paper editor/export WYSIWYG pass. Those eight integrated corrections are documented separately and do not change the 79-finding total.
- “79/79” means the two frozen audit lists are repaired and mapped. It does not mean Sloom Studio can contain no other defect, that every operating system has received a new public installer, or that every possible workflow has been manually exercised.

## Recommended reading order

1. [01-executive-summary.md](01-executive-summary.md) — scope, outcome, and the most important product changes.
2. [04-user-visible-behavior-by-area.md](04-user-visible-behavior-by-area.md) — what users should experience now, organized by product area.
3. [02-codebase-correctness-audit-repairs.md](02-codebase-correctness-audit-repairs.md) — all 44 `AUD-*` findings, with original problem, repair, expected behavior, and evidence.
4. [03-fable-audit-repairs.md](03-fable-audit-repairs.md) — all 35 `FBL-*` findings in the same format.
5. [05-verification-confidence-and-caveats.md](05-verification-confidence-and-caveats.md) — how the work was checked, what “closed” means, and what limitations remain.
6. [06-sources-method-and-glossary.md](06-sources-method-and-glossary.md) — frozen sources, status accounting, terminology, and provenance.
7. [07-internal-build-0.9.12d.md](07-internal-build-0.9.12d.md) — the internal desktop build that packages the repaired code, the sale-copy change, and hands-on startup, exact-font, drop-cap, and raster-export follow-ups.
8. [08-paper-editor-export-wysiwyg-follow-up.md](08-paper-editor-export-wysiwyg-follow-up.md) — the eight-commit Paper typography/layout convergence pass and its all-16-page editor/export proof.

The Markdown files are the canonical Notebook source set. They remain portable, searchable, and readable without a report runtime.

## Scope boundary

The numbered repair total includes only the two source audits. Later sale-copy, internal-letter-build, startup/runtime, and Paper editor/export WYSIWYG changes are documented separately and are not counted among the 79 audit findings.
