# Paper KDP and Soft-Proof Profile Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make bundled CMYK setup, Paper Soft Proof, and KDP/PDF-X saving work end-to-end while preserving exact-profile fail-closed production rules.

**Architecture:** A pure bundled-profile installer turns a catalog selection into the existing managed ICC asset model. Paper UI components reuse that installer for the inspector and Soft Proof repair state. Validated strict PDF bytes cross a dedicated Electron bridge to the existing native Save dialog, and the magazine builder embeds the same exact profile into both demo containers.

**Tech Stack:** React 19, TypeScript, Vitest, Electron IPC/contextBridge, Little CMS WASM, IndexedDB Paper assets, fflate `.slppr` containers.

## Global Constraints

- Preserve exact selected-profile validation and never substitute one named print condition for another.
- Store ICC bytes only as content-addressed assets.
- Preserve the user's normal configured Electron profile during install and smoke verification.
- Use red/green TDD for every behavior change.

---

### Task 1: Bundled managed ICC installation and controls

**Files:**
- Modify: `src/lib/paperIccProfiles.ts`
- Modify: `src/lib/paperManagedIccProfiles.ts`
- Modify: `src/lib/paperManagedIccProfiles.test.ts`
- Modify: `src/features/paper/workspace/PaperIccProfileManager.tsx`
- Modify: `src/features/paper/workspace/PaperIccProfileManager.test.tsx`

**Interfaces:**
- Produces: `installBundledPaperManagedIccProfile(profileId, store, load?) -> Promise<{ profile, outputConditionId }>`.
- Produces: `PaperIccProfileManagerChange.outputConditionId?: string`.

- [ ] **Step 1: Write failing tests** asserting a bundled FOGRA39 selection validates/stores exact bytes with `source.kind === 'bundled'`, and the manager renders a bundled selector plus explicit use action.
- [ ] **Step 2: Run the focused tests** with `npx vitest run src/lib/paperManagedIccProfiles.test.ts src/features/paper/workspace/PaperIccProfileManager.test.tsx`; expect failures for the missing installer/control.
- [ ] **Step 3: Implement the catalog metadata, installer, and manager action** using `resolveBundledAssetUrl`, `parseAndValidateCmykOutputProfile`, `createBinaryAssetRecord`, and the existing repository contract.
- [ ] **Step 4: Re-run the focused tests** and expect all assertions to pass.
- [ ] **Step 5: Commit** with `git commit -m "fix(paper): expose bundled managed ICC profiles"`.

### Task 2: Actionable Soft Proof profile setup

**Files:**
- Modify: `src/features/paper/workspace/PaperSoftProofModal.tsx`
- Modify: `src/features/paper/workspace/PaperSoftProofModal.test.tsx`
- Modify: `src/features/paper/workspace/PaperWorkspace.tsx`

**Interfaces:**
- Consumes: `PaperIccProfileManagerChange`.
- Produces: optional `PaperSoftProofModal.onConfigureProfile(change)`.

- [ ] **Step 1: Write a failing render test** asserting a document without a selected managed profile shows explanatory setup copy and the bundled-profile action instead of beginning an impossible preview.
- [ ] **Step 2: Run `npx vitest run src/features/paper/workspace/PaperSoftProofModal.test.tsx`** and expect the missing-profile setup assertion to fail.
- [ ] **Step 3: Implement the setup state and parent update callback** so explicit profile selection writes `managedIccProfiles`, `outputIntentProfileId: 'custom'`, the exact `customOutputIntentName`, and `outputIntentProfileAssetId`.
- [ ] **Step 4: Re-run the modal test** and expect it to pass.
- [ ] **Step 5: Commit** with `git commit -m "fix(paper): make soft proof profile setup actionable"`.

### Task 3: Native validated-PDF byte saving for PDF/X and KDP

**Files:**
- Modify: `src/lib/nativeApp.ts`
- Modify: `electron/preload.cjs`
- Modify: `electron/main.mjs`
- Modify: `src/components/Paper/PaperWorkspaceUtils.ts`
- Modify: `src/components/Paper/PaperWorkspaceUtils.test.ts`
- Modify: `src/lib/electronPreloadSource.test.ts`
- Modify: `src/lib/electronMainSource.test.ts`

**Interfaces:**
- Produces: `SignalLoomNativeBridge.savePaperPdfBytes(request) -> Promise<NativePaperPdfExportResult>`.
- Consumes: internally validated `Uint8Array` PDF bytes only.

- [ ] **Step 1: Write failing tests** proving KDP calls `savePaperPdfBytes`, does not call the browser downloader in Electron, reports the returned path, and reports cancellation without claiming success; add preload/main source expectations.
- [ ] **Step 2: Run the focused utility and Electron source tests** and expect failures because the bridge is absent.
- [ ] **Step 3: Implement the bridge and strict-byte saver** with PDF-header validation, the existing Paper destination chooser, absolute automation-path support, directory creation, and exact result reporting.
- [ ] **Step 4: Re-run the focused tests** and expect them to pass.
- [ ] **Step 5: Commit** with `git commit -m "fix(paper): save validated KDP PDFs natively"`.

### Task 4: Profile-ready Signaloom magazine containers

**Files:**
- Modify: `scripts/create-signaloom-magazine-demo.mjs`
- Modify: `scripts/create-signaloom-magazine-demo.test.ts`
- Replace: `/home/cabewse/Documents/Loom Workspace/Signaloom-Story-English-Magazine.slppr`
- Replace: `/home/cabewse/Documents/Loom Workspace/Signaloom-Story-Japanese-Magazine.slppr`

**Interfaces:**
- Produces: both demo manifests with an exact FOGRA39 managed record and reachable ICC asset entry.

- [ ] **Step 1: Write failing builder tests** asserting both documents select FOGRA39 and both packed archives contain the referenced `.icc` asset with a matching SHA-256.
- [ ] **Step 2: Run `npx vitest run scripts/create-signaloom-magazine-demo.test.ts`** and expect the profile assertions to fail.
- [ ] **Step 3: Update the deterministic builder** to create/package the ICC record, set exact output-condition metadata, and pass all three records to the container packer.
- [ ] **Step 4: Re-run the builder test, regenerate both files, and inspect both manifests**; expect the tests to pass and the selected ICC asset to be reachable.
- [ ] **Step 5: Commit** the builder change with `git commit -m "fix(demo): embed managed CMYK profile in magazines"`; the generated workspace artifacts remain user files outside Git.

### Task 4A: KDP full-page PDF/X-1a flattening

**Files:**
- Modify: `src/lib/paperPdfxPipeline.ts`
- Modify: `src/lib/paperPdfxPipeline.test.ts`
- Modify: `src/lib/paperProductionPreflight.ts`
- Modify: `src/lib/paperProductionPreflight.test.ts`
- Modify: `src/components/Paper/PaperWorkspaceUtils.ts`
- Modify: `src/components/Paper/PaperWorkspaceUtils.test.ts`

**Interfaces:**
- Produces: `PaperPdfxPipelineOptions.flattenAllPages?: boolean`.
- Produces: `PaperProductionPreflightOptions.allowFullPageFlatten?: boolean`.

- [ ] **Step 1: Write failing tests** proving KDP flattens unmanaged type and live opacity into an ICC-converted full-page PDF/X-1a raster while retaining insufficient source PPI as a warning.
- [ ] **Step 2: Run the pipeline, preflight, and workspace utility tests** and expect failures for the absent KDP flatten options.
- [ ] **Step 3: Implement the full-page raster branch and KDP-specific preflight policy** while leaving standard PDF/X behavior unchanged.
- [ ] **Step 4: Re-run the focused tests and production verifier** and expect all checks to pass.
- [ ] **Step 5: Commit** with `git commit -m "fix(paper): flatten KDP pages into CMYK PDF-X"`.

### Task 5: Integrated verification and configured-app install

**Files:**
- Create: `docs/notes/906-paper-kdp-soft-proof-profile-repair.md`
- Modify: `docs/TASK_LIST.md`

**Interfaces:**
- Consumes: all preceding tasks.
- Produces: packaged/native evidence and the final handoff record.

- [ ] **Step 1: Run focused suites, TypeScript, touched-file lint, production build, and the Paper production gate**; require zero new errors.
- [ ] **Step 2: Build and install the packaged Linux app** into the existing per-user installation without replacing `/home/cabewse/.config/Sloom Studio`.
- [ ] **Step 3: Smoke both real magazines** with the configured app: verify Soft Proof renders an image; export KDP PDF to an explicit automation destination; verify `%PDF-`, two pages, PDF/X-1a metadata, and embedded FOGRA39 output intent.
- [ ] **Step 4: Relaunch the installed app normally** and verify no automation environment is present.
- [ ] **Step 5: Write note 906, mark the task complete, commit, merge to main, and remove the isolated worktree** only after verification passes.
