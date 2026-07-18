# Verification, confidence, and caveats

## What “integrated and verified” meant in this sprint

A numbered finding was not counted closed merely because an agent edited files or reported success. Closure required:

1. A substantive implementation tied to the exact audit ID.
2. Permanent regression coverage for the reproduced boundary where practical.
3. Static checks appropriate to the change, commonly application and Electron TypeScript, lint, syntax, generated-contract verification, and `git diff --check`.
4. A production build or packaging path when the change affected shipping behavior.
5. A fresh review that attempted to disprove the fix, often with new hostile fixtures or a real Electron/browser/package probe.
6. Correction and another review when that gate found a blocker.
7. Integration onto `overlap/integration-20260716` followed by real-main checks.
8. A unique ledger mapping from the audit ID to the accepted integrated state.

This process matters because several candidates passed their author’s tests and still failed an independent reproduction. Examples included stale authority races, same-ID asset replacement, malformed-but-decodable media, exact-font identity gaps, late-render state, and diagnostic redaction boundaries. Those findings remained open until the reproduced blocker was corrected.

## Evidence layers used

### Focused permanent tests

Small test sets exercised the exact reported defect and nearby failure cases. Examples include dirty close decisions, run ownership, retry submission count, managed-face identity, snapshot byte mutation, list ordering, popup fallback outcomes, locale propagation, and corrupt remembered-project recovery.

### Broader neighboring suites

Changes were rerun with related store, project, Paper, Image, Video, Flow, provider, and Electron suites. This looked for regressions outside the original minimal reproduction.

### Type and contract checks

Both application and Electron/Node TypeScript targets were forced where relevant. The Flow production verifier compared the canonical node/contract/option inventory, preventing a “tests pass but generated production contract is stale” closure.

### Production builds

Many lanes completed a Vite production build, generally transforming roughly 3,250–3,287 modules as the integration branch grew. Build success caught failures that focused tests alone did not, including the internal-version test boundary repaired after `0.9.12d` work began.

### Real runtime and artifact probes

High-risk boundaries received more concrete checks: real Chromium font behavior, Electron startup/external-open flows, packaged font resource requests, PDF/export fixtures, strict source-stage reconstruction, and negative corruption/replacement cases.

### Independent adversarial review

Fresh reviewers were instructed to attack the implementation rather than summarize it. A review could return `CHANGES REQUIRED` despite green nominal tests. Closure followed only after a later reviewer approved the corrected exact revision.

## Completion evidence

- Frozen scope: 44 `AUD-*` plus 35 `FBL-*` findings.
- Row-mapped closed set: 79 unique IDs.
- Final integration point for the audit scope: `939e4514`.
- Final finding: `FBL-009`, the clean-installer bundled-font artifact.
- FBL-009 independent package evidence: 116 font families, 430 faces, 546 declared font/license payloads, strict staging, pre-package verification, post-package resource request, 12 focused tests, 75 adjacent packaging/Electron tests, and a production build.
- Progress from sprint start: 32 closed to 79 closed, a net increase of 47.

## What this evidence supports

The evidence supports a strong claim that each numbered defect has an implemented and regression-checked correction on the integrated repair branch. It supports expected behavior at the tested boundaries and raises confidence that the build packages those corrections together.

It does not support a literal claim that all possible user projects, provider accounts, GPUs, operating systems, printers, fonts, or timing schedules are defect-free.

## Residual limitations and honest caveats

- **New defects remain possible.** The audits were broad but finite snapshots of a changing application.
- **Manual workflows are not exhaustive.** Automated fixtures cover many exact transitions, but long creative sessions and unusual real projects can combine features in ways no bounded suite anticipates.
- **External providers can change.** Provider responses, rate rules, model catalogs, URLs, and authentication behavior can drift after the verified revision.
- **Cross-platform artifact depth varies.** The final font mechanism was concretely packaged and probed on Linux; the Windows/macOS/Linux release workflow was structurally checked but was not published solely to satisfy the local audit gate.
- **Old damaged files may need recovery.** A new build can reject, preserve, or recover more safely, but it cannot recreate bytes an older build already discarded unless a backup or surviving source exists.
- **Some pre-repair Paper projects are profile-dependent.** A project can retain valid managed-asset references yet predate the portable `paperAssets` section. It opens when the original profile still owns and verifies those content-addressed records, but a clean machine/profile cannot reconstruct bytes that the file never embedded. After verifying such a project in its original profile, save a backup copy with the repaired build to migrate it into the portable format; keep the original until the new copy has been reopened successfully.
- **Fail-closed behavior can feel stricter.** Some repaired export/font/media routes now stop with a useful error rather than returning a plausible but wrong result. That is intentional correctness behavior.
- **Optional environment support remains conditional.** Vulkan upscaling, native menus, external providers, browser media, and desktop protocols depend on available platform capabilities.
- **The post-audit price-copy change is separate.** It is present in `0.9.12d` but is not evidence for, or part of, the 79-item closure total.

## Practical regression checklist

Use this list when evaluating `0.9.12d` or a later release candidate:

1. Launch with no remembered-project reopening preference and confirm a clean new project opens.
2. Enable previous-project reopening, make the remembered file unavailable/corrupt, and confirm the recovery choices preserve the path and do not loop into a silent blank replacement.
3. Open a project with multiple Paper tabs and managed images/fonts; switch tabs, undo/redo, save, close, reopen, and verify active tab, pages, assets, and history behavior.
4. Attempt to close dirty Image and Paper documents; verify Save, Discard, and Cancel each have the expected result and do not cycle indefinitely.
5. Export representative Paper pages containing a placed PDF, exact bundled font, rich leading/indentation, vertical text, threaded frames, and flattened shapes through the output formats you sell/support.
6. Save and restore an Image named snapshot containing multiple layers and a selection; mutate pixels after capture and verify restore returns the captured content.
7. Reopen an Image/Video project using a managed face that is not installed system-wide; verify preview and export use the same face.
8. Run a Flow with a paid asynchronous provider, cancel during polling, change an input, resume where appropriate, and verify no duplicate submission or stale result publication.
9. Test list ordering, local template braces, Switch typing, a two-output reusable function, and a Composition project with legacy audio handles.
10. Chain a remote provider image/audio/video into another node; verify expired, wrong-MIME, oversized, and canceled inputs fail with useful context rather than becoming media bytes.
11. Switch English/Japanese with two windows open and inspect renderer, context, native, and panel menus.
12. Inspect About and confirm the internal build reads `0.9.12d`; verify the Application Menu launcher opens the packaged install rather than a development wrapper.
13. Open a pre-repair Paper project with large CJK/variable fonts in its original profile; confirm all pages load without an exact-font banner, the title remains `Sloom Studio` when licensed, then save and reopen a backup copy that contains the portable Paper asset section.
