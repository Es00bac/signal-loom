# Paper Export Destination and Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make native Paper PDF and page-image exports choose their destination before rasterization and provide visible progress, result paths, and open-target actions.

**Architecture:** Add chooser-only Electron bridge methods, pass approved absolute destinations into the existing write handlers, and keep their legacy dialog fallback. Make the renderer export utilities chooser-first and return outcomes that drive one accessible Paper export notice.

**Tech Stack:** React, TypeScript, Electron IPC, Vitest, Vite.

## Global Constraints

- Do not read, migrate, expose, or overwrite saved license keys or provider credentials.
- Preserve browser-only and automation export fallbacks.
- Use strict TypeScript and test-first red/green cycles.
- Keep the change limited to Paper export destination and feedback behavior.

---

### Task 1: Chooser-first native contracts

**Files:**
- Modify: `src/lib/nativeApp.ts`
- Modify: `electron/preload.cjs`
- Modify: `electron/main.mjs`
- Test: `src/lib/electronMainSource.test.ts`
- Test: `src/lib/electronPreloadSource.test.ts`

**Interfaces:**
- Produces: `choosePaperPdfExportPath(metadata)` and `choosePaperImageExportDirectory(metadata)` bridge methods.
- Produces: optional approved `filePath`/`directoryPath` properties on native write requests.

- [ ] Write source-guard tests requiring chooser-only IPC handlers, preload methods, absolute-path validation, and write-handler fallback.
- [ ] Run the focused source tests and verify they fail because the chooser bridge is absent.
- [ ] Add the typed bridge contracts, preload methods, main handlers, and approved-path consumption.
- [ ] Run the focused source tests and verify they pass.

### Task 2: Renderer export ordering and outcomes

**Files:**
- Modify: `src/components/Paper/PaperWorkspaceUtils.ts`
- Test: `src/components/Paper/PaperWorkspaceUtils.test.ts`

**Interfaces:**
- Produces: `PaperExportOutcome` with `state`, `message`, optional `path`, and `targetKind`.
- Consumes: chooser methods from Task 1 before any call to page-raster helpers.

- [ ] Write PDF and PNG tests that record chooser, canvas/raster, and write ordering and assert chooser cancellation performs no raster work.
- [ ] Run the focused utility tests and verify the new assertions fail against the raster-first implementation.
- [ ] Implement chooser-first PDF and page-image flows, retain old-bridge fallbacks, and return explicit outcomes.
- [ ] Run the focused utility tests and verify they pass.

### Task 3: Visible Paper export status

**Files:**
- Modify: `src/features/paper/workspace/PaperWorkspace.tsx`
- Modify: `src/features/paper/workspace/PaperTopStrip.test.tsx`

**Interfaces:**
- Consumes: `PaperExportOutcome` from Task 2.
- Produces: an accessible `data-paper-export-status` live region with pending/success/error/canceled states and an open-target action on success.

- [ ] Write a render/source assertion requiring the export live region and action independently of Inspector content.
- [ ] Run the focused workspace test and verify it fails because status is Inspector-only.
- [ ] Add export-notice state, progress reporting, final outcome handling, dismiss behavior, and native open-target action.
- [ ] Run the focused workspace test and utility tests and verify they pass.

### Task 4: Native verification, documentation, and installation

**Files:**
- Modify: `docs/TASK_LIST.md`
- Create: `docs/notes/905-paper-export-destination-feedback.md`

**Interfaces:**
- Consumes: completed chooser-first export pipeline.
- Produces: refreshed configured desktop installation and durable verification evidence.

- [ ] Run focused Electron/Paper tests, TypeScript/Vite build, and `git diff --check`.
- [ ] Run configured-profile native PDF and PNG smoke exports to explicit test destinations; validate PDF magic, PNG magic, byte counts, and visible success paths without inspecting secrets.
- [ ] Mark the task complete and document the root cause, compatibility behavior, tests, native evidence, and installation refresh.
- [ ] Commit, merge locally, refresh `/home/cabewse/.local/opt/signal-loom`, and re-open the configured application profile.

## Plan self-review

Every requirement in the design maps to a task. Interface names and destination fields are consistent, no placeholders remain, and all production changes follow an explicit failing-test step.
