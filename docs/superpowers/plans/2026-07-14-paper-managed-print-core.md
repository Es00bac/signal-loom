# Paper Managed Print Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Paper's browser-dependent fonts, inline binary assets, profile substitution, lossy CMYK/spot routing, permissive PDF/X saving, and misleading Stability resolution claims with a managed, WYSIWYG, fail-closed print core.

**Architecture:** Paper documents keep typed references to content-addressed binary assets; bytes live in project storage or `.slppr` ZIP entries. A managed font/ICC registry and deterministic text/render plan feed a hybrid PDF compiler that preserves native text, process CMYK, gray, named spots, and overprint while deliberately flattening unsupported effects. Strict preflight validates the frozen render plan and generated PDF before any licensed output is saved.

**Tech Stack:** React 19, TypeScript 6 strict mode, Zustand 5, Vite 8, Vitest 4, fflate, pdf-lib, @pdf-lib/fontkit, lcms-wasm, audited `harfbuzzjs@1.4.0`, IndexedDB/OPFS or native project storage, Poppler, qpdf, and Ghostscript.

## Global Constraints

- Preserve the existing offline one-time commercial entitlement, verifier artifact, pricing, and gated feature set. Do not edit `src/lib/licenseKey.ts` or `src/lib/licenseVerifier.bin.js`.
- Flow and Image are being modified by other Codex sessions. Before every task run `git status --short` and `git diff --name-only`; re-read any shared file immediately before editing. Do not edit `src/store/flowStore.ts`, `src/store/imageEditorStore.ts`, `src/components/ImageEditor/**`, or Flow components.
- Re-read the live contents of `PaperWorkspaceUtils*`, `PaperWorkspace.tsx`, `paperBubblePaths*`, `paperDocument*`, `paperPdfExport.ts`, and `src/types/paper.ts` immediately before editing because these are active integration files.
- Treat Claude's completed speech-bubble commit `b642957` as a protected behavioral baseline: independent left/right/top/bottom warp handles, curved tail control, out-of-frame tails, legacy symmetric-path byte identity, normalized model fields, editor handle behavior, and editor/export parity must survive every integration. Managed assets/fonts may replace its temporary inline-SVG or system-font transport only after equivalent behavior passes the protected tests.
- No new Paper document, history, sync operation, project snapshot, or manifest may store binary data as Base64 or a `data:` URL. Legacy Base64 is migration input only.
- `.slppr` stores binary assets under content-addressed ZIP paths. `.sloom` keeps Paper asset references in JSON and resolves bytes through project asset storage until the later document-integrity project coordinates a portable container change with Flow and Image.
- No system/browser font or Liberation substitution is allowed in print-ready PDF or PDF/X. Draft references remain editable but block strict export.
- No ICC profile substitution is allowed. Missing or invalid exact profiles block strict output.
- PDF/X validation failures prevent download. A proof output must not contain PDF/X identity metadata.
- Authored process CMYK/gray and named spot values remain exact for native objects. RGB artwork converts through the selected exact ICC profile.
- Total-area coverage is measured and reported. Do not silently rewrite authored CMYK with the current post-conversion UCR limiter.
- Stability requests are paid and BYOK. Run the two authorized live calls only after local tests pass, never log the key, and record provider cost/result without credentials.
- New dependencies require exact-version license, transitive-dependency, WASM provenance, integrity, and notice checks before installation.
- Every task uses TDD, ends with focused tests, and commits only its own files. Run `npm run build` and the full relevant Paper suite at integration checkpoints.

## File And Ownership Map

### New Shared, Additive Files

- `src/shared/assets/contentAddressedAsset.ts`: asset IDs, hashing, MIME metadata, and immutable records.
- `src/shared/assets/contentAddressedAsset.test.ts`: hash/deduplication contract.
- `src/shared/files/ValidatedAssetContainer.ts`: bounded ZIP read/write used initially by Paper only.
- `src/shared/files/ValidatedAssetContainer.test.ts`: traversal, missing-entry, hash, and decompression-limit checks.

These files are additive to avoid changing Image's live `SignalLoomContainer.ts` dependency during concurrent work.

### New Paper Asset Files

- `src/features/paper/assets/PaperAssetRepository.ts`: repository interface and in-memory implementation.
- `src/features/paper/assets/PaperIndexedDbAssetRepository.ts`: persistent browser/Electron-renderer implementation.
- `src/features/paper/assets/PaperAssetUrlRegistry.ts`: reference-counted object URLs.
- `src/features/paper/assets/PaperDocumentAssets.ts`: import, migration, reachability, and project-snapshot adapters.
- Corresponding `*.test.ts` files beside each module.

`PaperIndexedDbAssetRepository.test.ts` uses the exact, dev-only `fake-indexeddb@6.2.5` package to exercise the browser IndexedDB contract in Vitest. The dependency is Apache-2.0, has no runtime dependencies, is excluded from production bundles, and receives its own provenance note before installation.

### New Font And Typography Files

- `src/lib/paperManagedFonts.ts`: managed face records, rights, exact matching, and dependency analysis.
- `src/lib/paperOpenFontCatalog.ts`: opt-in Fontsource metadata/file/license client.
- `src/lib/paperTextShaper.ts`: license-audited HarfBuzz adapter.
- `src/lib/paperTextComposition.ts`: bidi/script segmentation and positioned rich-text glyph runs.
- `src/features/paper/workspace/PaperManagedTextLayer.tsx`: render/caret bridge that consumes composed glyphs.
- `src/components/Settings/FontLibrarySection.tsx`: local font library and explicit catalog download UI.

### New Profile, Render, And PDF Files

- `src/lib/paperManagedIccProfiles.ts`: exact profile records, header validation, and asset resolution.
- `src/features/paper/workspace/PaperIccProfileManager.tsx`: import/select/missing-profile repair UI.
- `src/lib/paperRenderPlan.ts`: deterministic page/object/text/image/paint plan.
- `src/lib/paperPrintPaint.ts`: exact process, gray, spot, and managed-RGB resolution.
- `src/lib/paperPdfxNativeContent.ts`: native PDF path/text/image/overprint operators.
- `src/lib/paperProductionPreflight.ts`: blocker/warning/information issues against a frozen plan.
- `src/lib/paperProductionReport.ts`: deterministic export evidence report.
- Corresponding `*.test.ts` files beside each module.

### New Stability Files

- `src/lib/paperStabilityUpscale.ts`: Paper-owned provider validation, preprocessing, binary execution, and achieved-PPI result.
- `src/lib/paperStabilityUpscale.test.ts`: provider limits, errors, and binary output.

### Existing Paper Integration Files

- `src/types/paper.ts`
- `src/store/paperStore.ts`
- `src/features/paper/SlpprFormat.ts`
- `src/App.tsx`
- `src/lib/projectDocumentActions.ts`
- `src/lib/projectValidation.ts`
- `src/lib/paperFontVetting.ts`
- `src/lib/paperFontLibrary.ts`
- `src/lib/paperPreflight.ts`
- `src/lib/paperPdfxPipeline.ts`
- `src/lib/paperPdfxExport.ts`
- `src/lib/paperPdfxValidate.ts`
- `src/lib/paperImageUpscale.ts`
- `src/components/Paper/PaperWorkspaceUtils.ts`
- `src/features/paper/workspace/PaperWorkspace.tsx`
- `src/components/Settings/SettingsModal.tsx`
- `src/store/settingsStore.ts`

Changes to shared application orchestration must be narrow Paper adapters and must not reshape Flow or Image state.

---

### Task 1: Establish The Project 1 Audit Ledger And Reproduction Baseline

**Files:**
- Create: `src/lib/paperProductionAudit.ts`
- Create: `src/lib/paperProductionAudit.test.ts`
- Create: `docs/audits/paper-workspace-project1.md`
- Modify: `docs/TASK_LIST.md`

**Interfaces:**
- Produces: `PaperProductionAuditEntry`, `PAPER_PROJECT_1_AUDIT`, and `paperAuditEntry(id)`.
- Consumed by: final verification and the Project 1 completion note.

- [ ] **Step 1: Record the concurrent-work baseline**

Run:

```bash
git status --short
git diff --name-only
git log -5 --oneline
npx vitest run src/lib/paperBubblePaths.test.ts src/lib/paperDocument.test.ts src/components/Paper/PaperWorkspaceUtils.test.ts
```

Expected: commit `b642957` remains in history; any new Flow/Image paths are treated as concurrently owned and are not edited; the protected Claude speech-bubble baseline passes (recorded planning baseline: 4 touched-surface files and 75 tests passing, followed by a successful production build, on 2026-07-14).

Record a `protected-baseline` section in `docs/audits/paper-workspace-project1.md` listing commit `b642957`, its nine Paper files, and these bubble invariants. Do not squash or fold the managed-print implementation into that baseline commit.

- [ ] **Step 2: Write the failing ledger contract test**

```ts
import { describe, expect, it } from 'vitest';
import { PAPER_PROJECT_1_AUDIT, paperAuditEntry } from './paperProductionAudit';

describe('Paper Project 1 audit ledger', () => {
  it('tracks every release-blocking production defect with evidence fields', () => {
    const required = [
      'asset-inline-base64', 'font-system-authority', 'icc-profile-substitution',
      'process-cmyk-roundtrip', 'spot-rich-text-overclaim', 'overprint-not-emitted',
      'pdfx-download-after-failure', 'stability-provider-contract', 'stability-effective-ppi',
    ];
    expect(PAPER_PROJECT_1_AUDIT.map((entry) => entry.id)).toEqual(expect.arrayContaining(required));
    for (const id of required) {
      expect(paperAuditEntry(id)).toMatchObject({ severity: expect.any(String), evidence: expect.any(Array) });
    }
  });
});
```

- [ ] **Step 3: Run the test and verify the missing module failure**

Run: `npx vitest run src/lib/paperProductionAudit.test.ts`

Expected: FAIL because `paperProductionAudit.ts` does not exist.

- [ ] **Step 4: Add the typed ledger and human audit file**

```ts
export type PaperAuditSeverity = 'critical' | 'high' | 'medium' | 'low';
export type PaperAuditStatus = 'reproduced' | 'fixed' | 'verified' | 'external-pending';

export interface PaperProductionAuditEntry {
  id: string;
  severity: PaperAuditSeverity;
  status: PaperAuditStatus;
  commercial: boolean;
  summary: string;
  evidence: string[];
  tests: string[];
}

export const PAPER_PROJECT_1_AUDIT: readonly PaperProductionAuditEntry[] = [
  { id: 'asset-inline-base64', severity: 'high', status: 'reproduced', commercial: false, summary: 'Paper stores binary assets in JSON/runtime state.', evidence: ['PaperImportedFont.dataBase64', 'PaperFrameAsset.src data URLs'], tests: [] },
  { id: 'font-system-authority', severity: 'critical', status: 'reproduced', commercial: true, summary: 'System/browser family names can change production typography.', evidence: ['PaperTypography.fontFamily', 'browserCanCheckFont'], tests: [] },
  { id: 'icc-profile-substitution', severity: 'critical', status: 'reproduced', commercial: true, summary: 'Selected output conditions can map to different ICC profiles.', evidence: ['INTENT_TO_BUNDLED'], tests: [] },
  { id: 'process-cmyk-roundtrip', severity: 'critical', status: 'reproduced', commercial: true, summary: 'Authored process CMYK is rasterized through RGB.', evidence: ['paperPdfxPipeline raster backdrop'], tests: [] },
  { id: 'spot-rich-text-overclaim', severity: 'high', status: 'reproduced', commercial: true, summary: 'Preflight can claim a rich text spot plate that export rasterizes.', evidence: ['collectSpotTextNames'], tests: [] },
  { id: 'overprint-not-emitted', severity: 'high', status: 'reproduced', commercial: true, summary: 'Overprint is preview metadata without PDF graphics state.', evidence: ['PaperPrintProductionSpec.overprintPreview'], tests: [] },
  { id: 'pdfx-download-after-failure', severity: 'critical', status: 'reproduced', commercial: true, summary: 'PDF/X bytes save after internal validation failure.', evidence: ['exportPaperPdfxAndSave'], tests: [] },
  { id: 'stability-provider-contract', severity: 'high', status: 'reproduced', commercial: false, summary: 'Paper can submit invalid Stability dimensions or creativity.', evidence: ['paperImageUpscale', 'buildStabilityUpscaleRequest'], tests: [] },
  { id: 'stability-effective-ppi', severity: 'critical', status: 'reproduced', commercial: true, summary: 'Local fitting can be described as generated print detail.', evidence: ['fitProviderResultToTargetDataUrl'], tests: [] },
] as const;

export function paperAuditEntry(id: string): PaperProductionAuditEntry | undefined {
  return PAPER_PROJECT_1_AUDIT.find((entry) => entry.id === id);
}
```

Write `docs/audits/paper-workspace-project1.md` with the same IDs, reproduction commands, expected fixes, and evidence locations. Add the approved Project 1 work as an active task in `docs/TASK_LIST.md` without altering unrelated task statuses.

- [ ] **Step 5: Verify and commit**

Run: `npx vitest run src/lib/paperProductionAudit.test.ts`

Expected: PASS.

```bash
git add src/lib/paperProductionAudit.ts src/lib/paperProductionAudit.test.ts docs/audits/paper-workspace-project1.md docs/TASK_LIST.md
git commit -m "test(paper): establish production audit ledger"
```

### Task 2: Add Content-Addressed Binary Asset Primitives

**Files:**
- Create: `src/shared/assets/contentAddressedAsset.ts`
- Create: `src/shared/assets/contentAddressedAsset.test.ts`

**Interfaces:**
- Produces: `BinaryAssetId`, `BinaryAssetRef`, `BinaryAssetRecord`, `createBinaryAssetRecord`, `verifyBinaryAssetRecord`, and `isBinaryAssetRef`.
- Consumed by: Tasks 3-8, 11, and 16.

- [ ] **Step 1: Write failing hash and identity tests**

```ts
import { describe, expect, it } from 'vitest';
import { createBinaryAssetRecord, verifyBinaryAssetRecord } from './contentAddressedAsset';

describe('content-addressed assets', () => {
  it('deduplicates equal bytes regardless of filename', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const a = await createBinaryAssetRecord(bytes, { mimeType: 'image/png', fileName: 'a.png' });
    const b = await createBinaryAssetRecord(bytes, { mimeType: 'image/png', fileName: 'b.png' });
    expect(a.ref.id).toBe(b.ref.id);
    expect(a.ref.sha256).toMatch(/^[a-f0-9]{64}$/);
    await expect(verifyBinaryAssetRecord(a)).resolves.toBe(true);
  });

  it('detects mutated bytes', async () => {
    const record = await createBinaryAssetRecord(new Uint8Array([9, 8, 7]), { mimeType: 'application/octet-stream' });
    await expect(verifyBinaryAssetRecord({ ...record, bytes: new Uint8Array([9, 8, 6]) })).resolves.toBe(false);
  });
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `npx vitest run src/shared/assets/contentAddressedAsset.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement immutable typed records**

```ts
export type BinaryAssetId = `sha256:${string}`;

export interface BinaryAssetRef {
  id: BinaryAssetId;
  sha256: string;
  mimeType: string;
  byteLength: number;
  fileName?: string;
}

export interface BinaryAssetRecord {
  ref: BinaryAssetRef;
  bytes: Uint8Array;
}

export async function createBinaryAssetRecord(
  bytes: Uint8Array,
  metadata: { mimeType: string; fileName?: string },
): Promise<BinaryAssetRecord> {
  const copy = new Uint8Array(bytes);
  const digest = await crypto.subtle.digest('SHA-256', copy);
  const sha256 = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
  return {
    ref: {
      id: `sha256:${sha256}`,
      sha256,
      mimeType: metadata.mimeType,
      byteLength: copy.byteLength,
      ...(metadata.fileName ? { fileName: metadata.fileName } : {}),
    },
    bytes: copy,
  };
}

export async function verifyBinaryAssetRecord(record: BinaryAssetRecord): Promise<boolean> {
  const rebuilt = await createBinaryAssetRecord(record.bytes, record.ref);
  return rebuilt.ref.id === record.ref.id && rebuilt.ref.byteLength === record.ref.byteLength;
}
```

Add a structural `isBinaryAssetRef` guard that validates the `sha256:` prefix, 64 lowercase hex digits, non-empty MIME type, and non-negative integer byte length.

- [ ] **Step 4: Verify and commit**

Run: `npx vitest run src/shared/assets/contentAddressedAsset.test.ts`

Expected: PASS.

```bash
git add src/shared/assets/contentAddressedAsset.ts src/shared/assets/contentAddressedAsset.test.ts
git commit -m "feat(assets): add content-addressed binary records"
```

### Task 3: Add The Paper Asset Repository And URL Lifecycle

**Files:**
- Create: `src/features/paper/assets/PaperAssetRepository.ts`
- Create: `src/features/paper/assets/PaperAssetRepository.test.ts`
- Create: `src/features/paper/assets/PaperIndexedDbAssetRepository.ts`
- Create: `src/features/paper/assets/PaperIndexedDbAssetRepository.test.ts`
- Create: `src/features/paper/assets/PaperAssetUrlRegistry.ts`
- Create: `src/features/paper/assets/PaperAssetUrlRegistry.test.ts`
- Create: `docs/audits/fake-indexeddb-6.2.5-license.md`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: `BinaryAssetId`, `BinaryAssetRecord`, `BinaryAssetRef` from Task 2.
- Produces: `PaperAssetRepository`, `MemoryPaperAssetRepository`, `IndexedDbPaperAssetRepository`, and `PaperAssetUrlRegistry`.

- [ ] **Step 1: Verify the dev-only IndexedDB test dependency**

Run:

```bash
npm view fake-indexeddb@6.2.5 version license dependencies dist.integrity dist.tarball --json
npm pack fake-indexeddb@6.2.5 --dry-run --json
```

Expected: version `6.2.5`, license `Apache-2.0`, no runtime dependencies, and integrity `sha512-CGnyrvbhPlWYMngksqrSSUT1BAVP49dZocrHuK0SvtR0D5TMs5wP0o3j7jexDJW01KSadjBp1M/71o/KR3nD1w==`. Record the package files, license, integrity, dev-only scope, and non-shipping status in `docs/audits/fake-indexeddb-6.2.5-license.md`. Stop this task if any value differs.

- [ ] **Step 2: Write failing repository and URL lifetime tests**

```ts
import { describe, expect, it, vi } from 'vitest';
import { createBinaryAssetRecord } from '../../../shared/assets/contentAddressedAsset';
import { MemoryPaperAssetRepository } from './PaperAssetRepository';
import { PaperAssetUrlRegistry } from './PaperAssetUrlRegistry';

describe('Paper asset repository', () => {
  it('stores one immutable record per content hash', async () => {
    const repository = new MemoryPaperAssetRepository();
    const record = await createBinaryAssetRecord(new Uint8Array([1, 2]), { mimeType: 'image/png' });
    await repository.put(record);
    await repository.put(record);
    expect(await repository.listRefs()).toEqual([record.ref]);
    expect((await repository.get(record.ref.id))?.bytes).toEqual(record.bytes);
  });

  it('revokes an object URL after the final lease releases', async () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const repository = new MemoryPaperAssetRepository();
    const record = await createBinaryAssetRecord(new Uint8Array([1]), { mimeType: 'image/png' });
    await repository.put(record);
    const registry = new PaperAssetUrlRegistry(repository);
    const first = await registry.acquire(record.ref.id);
    const second = await registry.acquire(record.ref.id);
    first.release();
    expect(revoke).not.toHaveBeenCalled();
    second.release();
    expect(revoke).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 3: Run the tests and verify failure**

Run: `npx vitest run src/features/paper/assets/PaperAssetRepository.test.ts src/features/paper/assets/PaperAssetUrlRegistry.test.ts`

Expected: FAIL because the modules do not exist.

- [ ] **Step 4: Install the exact dev dependency and implement the repository contracts**

Run: `npm install --save-dev --save-exact fake-indexeddb@6.2.5`

```ts
export interface PaperAssetRepository {
  put(record: BinaryAssetRecord): Promise<BinaryAssetRef>;
  get(id: BinaryAssetId): Promise<BinaryAssetRecord | undefined>;
  has(id: BinaryAssetId): Promise<boolean>;
  delete(id: BinaryAssetId): Promise<void>;
  listRefs(): Promise<BinaryAssetRef[]>;
}

export class MemoryPaperAssetRepository implements PaperAssetRepository {
  private readonly records = new Map<BinaryAssetId, BinaryAssetRecord>();
  async put(record: BinaryAssetRecord): Promise<BinaryAssetRef> {
    this.records.set(record.ref.id, { ref: { ...record.ref }, bytes: new Uint8Array(record.bytes) });
    return record.ref;
  }
  async get(id: BinaryAssetId): Promise<BinaryAssetRecord | undefined> {
    const record = this.records.get(id);
    return record ? { ref: { ...record.ref }, bytes: new Uint8Array(record.bytes) } : undefined;
  }
  async has(id: BinaryAssetId): Promise<boolean> { return this.records.has(id); }
  async delete(id: BinaryAssetId): Promise<void> { this.records.delete(id); }
  async listRefs(): Promise<BinaryAssetRef[]> { return [...this.records.values()].map(({ ref }) => ({ ...ref })); }
}
```

Implement `IndexedDbPaperAssetRepository` with database `sloom-paper-assets`, object store `assets`, key `ref.id`, and records `{ ref, bytes: ArrayBuffer }`. Accept an explicit `IDBFactory` constructor argument, default it to `globalThis.indexedDB`, and throw `PaperAssetStorageUnavailableError` when no factory exists. Export pure `encodePaperAssetDbRecord` and `decodePaperAssetDbRecord` helpers. Unit-test those helpers, the missing-capability error, and a complete put/close/reopen/get/delete round trip using `fake-indexeddb`'s injected `IDBFactory`; do not skip any test and never import the fake from production code.

Implement `PaperAssetUrlRegistry.acquire(id)` as `{ url, release }`, cache one object URL per ID, increment leases, and revoke/delete on the final release.

- [ ] **Step 5: Verify and commit**

Run: `npx vitest run src/features/paper/assets/PaperAssetRepository.test.ts src/features/paper/assets/PaperIndexedDbAssetRepository.test.ts src/features/paper/assets/PaperAssetUrlRegistry.test.ts`

Expected: PASS.

```bash
git add src/features/paper/assets docs/audits/fake-indexeddb-6.2.5-license.md package.json package-lock.json
git commit -m "feat(paper): add persistent binary asset repository"
```

### Task 4: Add A Bounded Content-Addressed ZIP Container

**Files:**
- Create: `src/shared/files/ValidatedAssetContainer.ts`
- Create: `src/shared/files/ValidatedAssetContainer.test.ts`

**Interfaces:**
- Consumes: Task 2 asset records.
- Produces: `packValidatedAssetContainer`, `unpackValidatedAssetContainer`, `AssetContainerLimits`, and `ValidatedAssetContainer`.

- [ ] **Step 1: Write failing security and integrity tests**

```ts
import { describe, expect, it } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { createBinaryAssetRecord } from '../assets/contentAddressedAsset';
import { packValidatedAssetContainer, unpackValidatedAssetContainer } from './ValidatedAssetContainer';

describe('ValidatedAssetContainer', () => {
  it('round-trips and verifies content-addressed entries', async () => {
    const asset = await createBinaryAssetRecord(new Uint8Array([1, 2, 3]), { mimeType: 'image/png' });
    const bytes = packValidatedAssetContainer({ format: 'paper-test', formatVersion: 2, kind: 'paper', document: {}, assets: [asset.ref] }, [asset]);
    const opened = await unpackValidatedAssetContainer(bytes);
    expect(opened.assets.get(asset.ref.id)?.bytes).toEqual(asset.bytes);
  });

  it('rejects traversal and undeclared entries', async () => {
    const malicious = zipSync({ '../escape.bin': new Uint8Array([1]), 'manifest.json': strToU8(JSON.stringify({ format: 'x', formatVersion: 2, kind: 'paper', document: {}, assets: [] })) });
    await expect(unpackValidatedAssetContainer(malicious)).rejects.toThrow(/path|undeclared/i);
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run src/shared/files/ValidatedAssetContainer.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement strict limits and manifest verification**

```ts
export interface AssetContainerLimits {
  maxEntries: number;
  maxManifestBytes: number;
  maxAssetBytes: number;
  maxTotalBytes: number;
}

export const DEFAULT_ASSET_CONTAINER_LIMITS: AssetContainerLimits = {
  maxEntries: 10_000,
  maxManifestBytes: 16 * 1024 * 1024,
  maxAssetBytes: 512 * 1024 * 1024,
  maxTotalBytes: 2 * 1024 * 1024 * 1024,
};
```

Use normalized `assets/<sha256>.<safe-extension>` paths. Reject absolute paths, `..`, duplicate names, undeclared entries, missing entries, size overflow, hash mismatch, malformed references, and foreign manifest types. Use fflate entry metadata filtering before retaining output and verify hashes after decompression. Do not modify `SignalLoomContainer.ts` in this task.

- [ ] **Step 4: Verify and commit**

Run: `npx vitest run src/shared/files/ValidatedAssetContainer.test.ts src/shared/files/SignalLoomContainer.test.ts`

Expected: PASS for the new strict container and the unchanged legacy container.

```bash
git add src/shared/files/ValidatedAssetContainer.ts src/shared/files/ValidatedAssetContainer.test.ts
git commit -m "feat(files): add validated content-addressed container"
```

### Task 5: Migrate `.slppr` To Version 2 Without Recreating Base64

**Files:**
- Modify: `src/features/paper/SlpprFormat.ts`
- Modify: `src/features/paper/SlpprFormat.test.ts`
- Modify: `src/App.tsx`
- Create: `src/features/paper/assets/PaperDocumentAssets.ts`
- Create: `src/features/paper/assets/PaperDocumentAssets.test.ts`

**Interfaces:**
- Consumes: Tasks 2-4.
- Produces: `serializeSlppr(document, repository) => Promise<Uint8Array>`, `deserializeSlppr(bytes, repository) => Promise<PaperDocument>`, `migrateLegacyPaperBinaryFields`, and `collectReachablePaperAssetIds`.

- [ ] **Step 1: Extend tests for deduplication and no Base64 manifest data**

```ts
it('writes duplicate Paper payloads once by hash and restores managed references', async () => {
  const repository = new MemoryPaperAssetRepository();
  const record = await createBinaryAssetRecord(new Uint8Array([1, 2, 3]), { mimeType: 'image/png', fileName: 'panel.png' });
  await repository.put(record);
  const doc = documentWithTwoManagedFrames(record.ref);
  const bytes = await serializeSlppr(doc, repository);
  const text = new TextDecoder('latin1').decode(bytes);
  expect(text).not.toMatch(/data:|dataBase64|AQID/);
  const restoredRepository = new MemoryPaperAssetRepository();
  const restored = await deserializeSlppr(bytes, restoredRepository);
  expect(collectReachablePaperAssetIds(restored)).toEqual([record.ref.id]);
  expect(await restoredRepository.has(record.ref.id)).toBe(true);
});
```

Retain a version-1 fixture containing both a `data:` image and `PaperImportedFont.dataBase64`; assert they migrate once into binary records and the returned document contains no Base64.

- [ ] **Step 2: Run and verify the tests fail**

Run: `npx vitest run src/features/paper/SlpprFormat.test.ts src/features/paper/assets/PaperDocumentAssets.test.ts`

Expected: FAIL against the synchronous version-1 serializer.

- [ ] **Step 3: Implement the version-2 codec**

```ts
export const SLPPR_FORMAT_VERSION = 2;

export async function serializeSlppr(
  document: PaperDocument,
  repository: PaperAssetRepository,
): Promise<Uint8Array> {
  const ids = collectReachablePaperAssetIds(document);
  const records = await Promise.all(ids.map(async (id) => {
    const record = await repository.get(id);
    if (!record) throw new Error(`Paper document is missing required asset ${id}.`);
    return record;
  }));
  return packValidatedAssetContainer({
    format: SLPPR_FORMAT,
    formatVersion: SLPPR_FORMAT_VERSION,
    kind: 'paper',
    document,
    assets: records.map(({ ref }) => ref),
  }, records);
}
```

`deserializeSlppr` accepts version 1 through the old decoder, immediately converts legacy payloads to repository records, strips legacy binary strings, and returns managed references. Version 2 imports verified records into the repository before returning the document. Update only the Paper open/save cases in `App.tsx` to await the codec and use the Paper repository.

- [ ] **Step 4: Verify and commit**

Run: `npx vitest run src/features/paper/SlpprFormat.test.ts src/features/paper/assets/PaperDocumentAssets.test.ts src/lib/signalLoomFileRouting.test.ts`

Expected: PASS.

```bash
git add src/features/paper/SlpprFormat.ts src/features/paper/SlpprFormat.test.ts src/features/paper/assets/PaperDocumentAssets.ts src/features/paper/assets/PaperDocumentAssets.test.ts src/App.tsx
git commit -m "feat(paper): migrate slppr assets to content hashes"
```

### Task 6: Replace Paper Runtime Binary Strings With Asset References

**Files:**
- Modify: `src/types/paper.ts`
- Modify: `src/store/paperStore.ts`
- Modify: `src/store/paperStore.test.ts`
- Modify: `src/lib/paperDocument.ts`
- Modify: `src/lib/paperDocument.test.ts`
- Modify: `src/lib/projectDocumentActions.ts`
- Modify: `src/lib/projectValidation.ts`
- Modify: `src/lib/projectValidation.test.ts`
- Modify: `src/lib/paperDocumentNativeSync.ts`
- Modify: `src/lib/paperDocumentNativeSync.test.ts`
- Modify: `src/lib/paperSyncChannel.ts`
- Modify: `src/features/paper/workspace/PaperWorkspace.tsx`

**Interfaces:**
- Consumes: `BinaryAssetRef`, Paper repository, and URL registry.
- Produces: `PaperManagedAssetLocator`, asset-reference-only `PaperFrameAsset`, `PaperDocument.managedFonts`, `PaperDocument.managedIccProfiles`, and asset reachability in `PaperDocumentSnapshot`.

- [ ] **Step 1: Write failing snapshot and validation tests**

```ts
it('exports Paper snapshots with references but no binary strings', async () => {
  const record = await createBinaryAssetRecord(new Uint8Array([4, 5, 6]), { mimeType: 'image/png' });
  const doc = documentWithManagedImage(record.ref);
  usePaperStore.setState({ document: doc });
  const snapshot = usePaperStore.getState().exportSnapshot();
  expect(JSON.stringify(snapshot)).not.toMatch(/base64|data:image|blob:/i);
  expect(snapshot.assetIds).toEqual([record.ref.id]);
});

it('rejects malformed Paper asset references on project restore', () => {
  expect(sanitizePaperSnapshot({ document: documentWithAssetId('sha256:not-a-hash') })).toBeUndefined();
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run src/store/paperStore.test.ts src/lib/projectValidation.test.ts src/lib/paperDocumentNativeSync.test.ts`

Expected: FAIL because snapshots contain no `assetIds` contract and Paper validation still casts the document.

- [ ] **Step 3: Introduce reference-only model fields**

```ts
export type PaperManagedAssetLocator =
  | { kind: 'managed'; ref: BinaryAssetRef }
  | { kind: 'external'; url: string };

export interface PaperFrameAsset {
  sourceBinItemId?: string;
  label: string;
  kind: SourceBinLibraryItem['kind'];
  locator?: PaperManagedAssetLocator;
  mimeType?: string;
  text?: string;
  format?: string;
  pageCount?: number;
  pixelWidth?: number;
  pixelHeight?: number;
  embeddedAt?: number;
}

export interface PaperDocumentSnapshot {
  document: PaperDocument;
  assetIds?: BinaryAssetId[];
  selectedPageId?: string;
  selectedFrameId?: string;
  selectedFrameIds?: string[];
  tool: PaperTool;
  zoom: number;
}
```

Remove `PaperImportedFont.dataBase64` after the Task 5 migration supplies an asset ref. Replace `frame.asset.src` consumers with a small Paper asset URL hook or explicit external URL resolution. Store no object URL in Paper state. Change sync snapshot operations to carry asset IDs only; asset byte transport remains the existing project asset channel and is addressed fully in Project 3.

Implement field-by-field Paper snapshot validation for the new asset fields. Do not broaden changes into Flow or Image sanitizers.

- [ ] **Step 4: Verify project save/restore and history**

Run:

```bash
npx vitest run src/store/paperStore.test.ts src/store/paperStore.remoteSync.test.ts src/lib/projectDocumentActions.test.ts src/lib/projectValidation.test.ts src/lib/paperDocumentNativeSync.test.ts src/lib/paperSyncChannel.test.ts
npm run build
```

Expected: all selected tests PASS and TypeScript reports no Paper asset-string consumers.

Run: `rg -n "dataBase64|asset\.src|data:image|data:application" src/types/paper.ts src/store/paperStore.ts src/lib/paper* src/features/paper src/components/Paper`

Expected: only named legacy migration fixtures/helpers, never current model or history fields.

- [ ] **Step 5: Commit**

```bash
git add src/types/paper.ts src/store/paperStore.ts src/store/paperStore.test.ts src/lib/paperDocument.ts src/lib/paperDocument.test.ts src/lib/projectDocumentActions.ts src/lib/projectValidation.ts src/lib/projectValidation.test.ts src/lib/paperDocumentNativeSync.ts src/lib/paperDocumentNativeSync.test.ts src/lib/paperSyncChannel.ts src/features/paper/workspace/PaperWorkspace.tsx
git commit -m "refactor(paper): keep binary assets out of document state"
```

### Task 7: Make Font Vetting And Managed Face Records Production-Safe

**Files:**
- Create: `src/lib/paperManagedFonts.ts`
- Create: `src/lib/paperManagedFonts.test.ts`
- Modify: `src/lib/paperFontVetting.ts`
- Modify: `src/lib/paperFontVetting.test.ts`
- Modify: `src/lib/paperFontLibrary.ts`
- Modify: `src/lib/paperFontLibrary.test.ts`
- Modify: `src/types/paper.ts`

**Interfaces:**
- Consumes: Binary font asset refs from Task 6.
- Produces: `PaperManagedFontFace`, `PaperFontRights`, `PaperFontAttestation`, `selectManagedFontFace`, `collectManagedFontDependencies`.

- [ ] **Step 1: Write failing rights and exact-face tests**

```ts
it('blocks bitmap-only fonts from outline embedding', () => {
  expect(classifyFontEmbeddingRights({ bitmapOnly: true })).toMatchObject({ embeddable: false, reason: 'bitmap-only' });
});

it('does not select regular as a silent bold face', () => {
  const regular = managedFace({ weight: 400, style: 'normal' });
  expect(selectManagedFontFace([regular], { familyId: regular.familyId, weight: 700, style: 'normal' })).toEqual({ status: 'missing-face', requestedWeight: 700, requestedStyle: 'normal' });
});

it('requires attestation when embedding rights are unknown', () => {
  const face = managedFace({ embeddability: 'unknown', attestation: undefined });
  expect(canUseManagedFontForProduction(face)).toMatchObject({ allowed: false, reason: 'attestation-required' });
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run src/lib/paperFontVetting.test.ts src/lib/paperManagedFonts.test.ts src/lib/paperFontLibrary.test.ts`

Expected: FAIL for bitmap-only, numeric face matching, and missing attestation.

- [ ] **Step 3: Add managed face and rights types**

```ts
export interface PaperFontAttestation {
  acceptedAt: number;
  assetSha256: string;
  mayEmbedOutput: boolean;
  mayPackageEditableProject: boolean;
  statementVersion: 1;
}

export interface PaperManagedFontFace {
  id: string;
  familyId: string;
  familyName: string;
  postscriptName: string;
  weight: number;
  style: 'normal' | 'italic' | 'oblique';
  stretchPercent: number;
  collectionIndex: number;
  variableAxes: Record<string, { min: number; default: number; max: number }>;
  unicodeRanges: Array<{ start: number; end: number }>;
  fontAsset: BinaryAssetRef;
  embeddability: FontEmbeddability;
  canSubset: boolean;
  source: { kind: 'open-catalog' | 'user-import'; url?: string; version?: string };
  license: { id?: string; textAsset?: BinaryAssetRef; attribution?: string };
  attestation?: PaperFontAttestation;
}
```

Change the vetter to block `bitmapOnly`, fail closed on coverage parse errors, expose all collection faces, record numeric style metadata, and leave unknown rights unusable for production until attested. `selectManagedFontFace` returns a discriminated result and never synthesizes weight/style.

- [ ] **Step 4: Verify and commit**

Run: `npx vitest run src/lib/paperFontVetting.test.ts src/lib/paperManagedFonts.test.ts src/lib/paperFontLibrary.test.ts`

Expected: PASS.

```bash
git add src/lib/paperManagedFonts.ts src/lib/paperManagedFonts.test.ts src/lib/paperFontVetting.ts src/lib/paperFontVetting.test.ts src/lib/paperFontLibrary.ts src/lib/paperFontLibrary.test.ts src/types/paper.ts
git commit -m "feat(paper): add managed font rights and exact faces"
```

### Task 8: Add The Opt-In Open Font Library UI

**Files:**
- Create: `src/lib/paperOpenFontCatalog.ts`
- Create: `src/lib/paperOpenFontCatalog.test.ts`
- Create: `src/components/Settings/FontLibrarySection.tsx`
- Create: `src/components/Settings/FontLibrarySection.test.tsx`
- Modify: `src/components/Settings/SettingsModal.tsx`
- Modify: `src/components/Settings/SettingsModal.test.tsx`
- Modify: `src/store/settingsStore.ts`
- Modify: `src/lib/i18n.ts`

**Interfaces:**
- Consumes: Tasks 3 and 7.
- Produces: `listOpenFontFamilies`, `fetchOpenFontFamily`, `downloadOpenFontFace`, and a `fonts` settings panel.

- [ ] **Step 1: Write failing catalog tests with injected fetch**

```ts
it('does not contact Fontsource until catalog browse is requested', async () => {
  const fetchImpl = vi.fn();
  const client = createOpenFontCatalogClient({ fetchImpl });
  expect(fetchImpl).not.toHaveBeenCalled();
  await client.listFamilies();
  expect(fetchImpl).toHaveBeenCalledWith('https://api.fontsource.org/v1/fonts', expect.any(Object));
});

it('rejects a face without an authoritative license record', async () => {
  const client = catalogClientWithFixture({ license: undefined });
  await expect(client.downloadFace('abel', 400, 'normal')).rejects.toThrow(/license/i);
});
```

Add a component test that opens Settings -> Fonts, clicks `Browse open fonts`, downloads a fixture TTF plus license text, and sees `Available offline`; initial render must make no request.

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run src/lib/paperOpenFontCatalog.test.ts src/components/Settings/FontLibrarySection.test.tsx src/components/Settings/SettingsModal.test.tsx`

Expected: FAIL because the catalog and `fonts` panel do not exist.

- [ ] **Step 3: Implement the explicit catalog client and UI**

```ts
export interface OpenFontCatalogFace {
  familyId: string;
  family: string;
  weight: number;
  style: 'normal' | 'italic';
  subsets: string[];
  version: string;
  ttfUrl: string;
  license: { id: string; url: string; attribution: string; text: string };
}

export function createOpenFontCatalogClient(input: { fetchImpl?: typeof fetch }) {
  const fetchImpl = input.fetchImpl ?? fetch;
  return {
    listFamilies: () => fetchJson(fetchImpl, 'https://api.fontsource.org/v1/fonts'),
    getFamily: (id: string) => fetchJson(fetchImpl, `https://api.fontsource.org/v1/fonts/${encodeURIComponent(id)}`),
  };
}
```

The client uses this exact user-initiated request sequence:

1. Browse: `GET https://api.fontsource.org/v1/fonts`.
2. Select a family: `GET https://api.fontsource.org/v1/fonts/{id}`.
3. Pin its current package version: `GET https://api.fontsource.org/v1/version/{id}` and require a strict semantic version string.
4. Fetch license metadata: `GET https://cdn.jsdelivr.net/npm/@fontsource/{id}@{version}/metadata.json` and require its license identifier.
5. Fetch the authoritative package license text: `GET https://cdn.jsdelivr.net/npm/@fontsource/{id}@{version}/LICENSE`; reject empty, missing, redirected-to-unversioned, or identifier-mismatched records.
6. Fetch the selected version-pinned face: `GET https://cdn.jsdelivr.net/fontsource/fonts/{id}@{version}/{subset}-{weight}-{style}.ttf`.

Use injected `fetch` in tests and assert every URL. Permit only `OFL-1.1`, `Apache-2.0`, or `MIT` records in this catalog path; a custom user font continues through the separate attestation path from Task 7. Vet the downloaded bytes, hash the font and license assets, and store both in the application font repository with their source URL, version, and retrieval timestamp. No request occurs until the user clicks Browse or Download. Add `fonts` to the settings panel union and tab UI without changing license state or provider configuration.

- [ ] **Step 4: Run license and UI verification**

Run:

```bash
npx vitest run src/lib/paperOpenFontCatalog.test.ts src/components/Settings/FontLibrarySection.test.tsx src/components/Settings/SettingsModal.test.tsx
git diff --check
```

Expected: tests PASS; no font files are added under `public/` or bundled into application assets.

- [ ] **Step 5: Commit**

```bash
git add src/lib/paperOpenFontCatalog.ts src/lib/paperOpenFontCatalog.test.ts src/components/Settings/FontLibrarySection.tsx src/components/Settings/FontLibrarySection.test.tsx src/components/Settings/SettingsModal.tsx src/components/Settings/SettingsModal.test.tsx src/store/settingsStore.ts src/lib/i18n.ts
git commit -m "feat(paper): add opt-in open font library"
```

### Task 9: Audit And Add HarfBuzz Shaping

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `docs/audits/harfbuzzjs-1.4.0-license.md`
- Create: `src/lib/paperTextShaper.ts`
- Create: `src/lib/paperTextShaper.test.ts`
- Modify (generated): `src/generated/ossLicenses.ts`

**Interfaces:**
- Consumes: `PaperManagedFontFace` and resolved bytes.
- Produces: `PaperTextShaper`, `PaperShapeRequest`, `PaperShapedRun`, `HarfBuzzPaperTextShaper`.

- [ ] **Step 1: Verify package provenance before installation**

Run:

```bash
npm view harfbuzzjs@1.4.0 version license dependencies dist.integrity dist.tarball --json
npm pack harfbuzzjs@1.4.0 --dry-run --json
```

Expected: version `1.4.0`, license `MIT`, no undeclared transitive runtime dependency, and integrity `sha512-3KrygnLb4ESsntxvxZA7RhJy2Ci47GdXWC8fl9HwPHNEOUDXUNv5M+x/TiBkXKjUz6jz/CRJOL2Ksgq8V3UdKw==`. Record the inspected files, upstream HarfBuzz Old MIT license, binding MIT license, WASM origin, and required notices in the audit document. Stop this task if any value differs.

- [ ] **Step 2: Write failing shaping tests**

```ts
it('shapes ligatures and keeps source cluster mapping', async () => {
  const shaper = await createFixtureShaper('public/fonts/liberation/LiberationSerif-Regular.ttf');
  const shaped = shaper.shape({ text: 'office', direction: 'ltr', script: 'Latn', language: 'en', fontSizePt: 12, features: { liga: true } });
  expect(shaped.glyphs.length).toBeLessThan('office'.length);
  expect(shaped.glyphs.map((glyph) => glyph.cluster)).toEqual(expect.arrayContaining([0, 1]));
});

it('shapes right-to-left text with stable advances', async () => {
  const shaped = await fixtureShaper.shape({ text: 'سلام', direction: 'rtl', script: 'Arab', language: 'ar', fontSizePt: 12, features: {} });
  expect(shaped.direction).toBe('rtl');
  expect(shaped.advanceX).toBeGreaterThan(0);
  expect(shaped.glyphs.every((glyph) => Number.isFinite(glyph.xAdvance))).toBe(true);
});
```

- [ ] **Step 3: Run and verify failure, then install exact dependency**

Run: `npx vitest run src/lib/paperTextShaper.test.ts`

Expected: FAIL because the adapter does not exist.

Run: `npm install --save-exact harfbuzzjs@1.4.0`

- [ ] **Step 4: Implement the stable adapter**

```ts
export interface PaperShapeRequest {
  text: string;
  direction: 'ltr' | 'rtl' | 'ttb';
  script: string;
  language: string;
  fontSizePt: number;
  features: Record<string, boolean | number>;
  variations?: Record<string, number>;
}

export interface PaperShapedGlyph {
  glyphId: number;
  cluster: number;
  xAdvance: number;
  yAdvance: number;
  xOffset: number;
  yOffset: number;
}

export interface PaperShapedRun {
  direction: PaperShapeRequest['direction'];
  glyphs: PaperShapedGlyph[];
  advanceX: number;
  advanceY: number;
}

export interface PaperTextShaper {
  shape(request: PaperShapeRequest): PaperShapedRun;
  glyphPath(glyphId: number): string;
  destroy(): void;
}
```

Wrap `harfbuzzjs` `Blob`, `Face`, `Font`, and `Buffer`; set scale from units-per-em/font size, direction/script/language/features explicitly, retain cluster indexes, and destroy native objects deterministically.

- [ ] **Step 5: Verify licenses, tests, build, and commit**

Run:

```bash
npx vitest run src/lib/paperTextShaper.test.ts
npm run generate:oss-licenses
npm run build
```

Expected: PASS and the generated OSS inventory includes HarfBuzz/harfbuzzjs notices.

```bash
git add package.json package-lock.json docs/audits/harfbuzzjs-1.4.0-license.md src/lib/paperTextShaper.ts src/lib/paperTextShaper.test.ts src/generated/ossLicenses.ts
git commit -m "feat(paper): add license-audited text shaping"
```

### Task 10: Compose Rich Text Into Deterministic Positioned Glyph Runs

**Files:**
- Create: `src/lib/paperTextComposition.ts`
- Create: `src/lib/paperTextComposition.test.ts`
- Modify: `src/lib/paperTextLayout.ts`
- Modify: `src/lib/paperTextLayout.test.ts`
- Modify: `src/lib/paperJapaneseText.ts`
- Modify: `src/lib/paperJapaneseText.test.ts`
- Create: `src/features/paper/workspace/PaperManagedTextLayer.tsx`
- Create: `src/features/paper/workspace/PaperManagedTextLayer.test.tsx`
- Modify: `src/features/paper/workspace/PaperWorkspace.tsx`
- Modify: `src/lib/paperDocument.ts`

**Interfaces:**
- Consumes: Tasks 7 and 9.
- Produces: `composePaperTextFrame(frame, document, fontResolver) => PaperComposedTextFrame` and `PaperManagedTextLayer`.

- [ ] **Step 1: Write failing mixed-run and vertical fixtures**

```ts
it('keeps mixed rich runs on one deterministic baseline with exact faces', async () => {
  const composed = await composeFixture([{ text: 'Plain ' }, { text: 'bold', fontWeight: '700' }]);
  expect(composed.lines).toHaveLength(1);
  expect(composed.lines[0].runs.map((run) => run.face.weight)).toEqual([400, 700]);
  expect(composed.caretMap[6].xPt).toBeLessThan(composed.caretMap[7].xPt);
});

it('composes vertical Japanese with right-to-left columns and kinsoku', async () => {
  const composed = await composeVerticalFixture('「花」、記憶。');
  expect(composed.writingMode).toBe('vertical-rl');
  expect(composed.lines[1].originXPt).toBeLessThan(composed.lines[0].originXPt);
  expect(composed.lines.every((line) => !/^[、。」]/.test(line.text))).toBe(true);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run src/lib/paperTextComposition.test.ts src/features/paper/workspace/PaperManagedTextLayer.test.tsx`

Expected: FAIL because composition and managed text rendering do not exist.

- [ ] **Step 3: Implement the composition output contract**

```ts
export interface PaperPositionedGlyphRun {
  face: PaperManagedFontFace;
  fontSizePt: number;
  color: PaperPrintPaintSource;
  glyphs: Array<PaperShapedGlyph & { xPt: number; yPt: number }>;
  sourceStart: number;
  sourceEnd: number;
}

export interface PaperComposedTextLine {
  text: string;
  originXPt: number;
  originYPt: number;
  widthPt: number;
  runs: PaperPositionedGlyphRun[];
}

export interface PaperComposedTextFrame {
  frameId: string;
  writingMode: 'horizontal-tb' | 'vertical-rl';
  lines: PaperComposedTextLine[];
  caretMap: Array<{ sourceOffset: number; xPt: number; yPt: number; heightPt: number }>;
  overset: boolean;
  missingGlyphs: Array<{ codePoint: number; faceId: string }>;
}
```

Segment paragraphs by bidi/script/language, resolve each rich run to an exact managed face, shape through Task 9, then apply line breaking, tracking, leading, paragraph spacing, indents, justification, columns, kinsoku, vertical metrics, furigana, emphasis marks, and baseline shifts. Missing exact faces/glyphs are data in the result, not browser fallbacks.

Render positioned glyphs through managed `FontFace` registrations or glyph paths while using the same coordinates for caret mapping. Browser text remains only an input/editor surface and cannot choose production line breaks.

- [ ] **Step 4: Verify editor and composer parity**

Run:

```bash
npx vitest run src/lib/paperTextComposition.test.ts src/lib/paperTextLayout.test.ts src/lib/paperJapaneseText.test.ts src/features/paper/workspace/PaperManagedTextLayer.test.tsx src/features/paper/workspace/PaperWorkspace.richTextShortcuts.test.ts
npm run build
```

Expected: PASS; existing rich-text editing behavior remains intact.

- [ ] **Step 5: Commit**

```bash
git add src/lib/paperTextComposition.ts src/lib/paperTextComposition.test.ts src/lib/paperTextLayout.ts src/lib/paperTextLayout.test.ts src/lib/paperJapaneseText.ts src/lib/paperJapaneseText.test.ts src/features/paper/workspace/PaperManagedTextLayer.tsx src/features/paper/workspace/PaperManagedTextLayer.test.tsx src/features/paper/workspace/PaperWorkspace.tsx src/lib/paperDocument.ts
git commit -m "feat(paper): share deterministic rich text composition"
```

### Task 11: Add Exact Managed ICC Profiles

**Files:**
- Create: `src/lib/paperManagedIccProfiles.ts`
- Create: `src/lib/paperManagedIccProfiles.test.ts`
- Create: `src/features/paper/workspace/PaperIccProfileManager.tsx`
- Create: `src/features/paper/workspace/PaperIccProfileManager.test.tsx`
- Modify: `src/types/paper.ts`
- Modify: `src/lib/paperPdfxPipeline.ts`
- Modify: `src/lib/paperPdfxPipeline.test.ts`
- Modify: `src/lib/paperPreflight.ts`
- Modify: `src/lib/paperPreflight.test.ts`
- Modify: `src/features/paper/workspace/PaperWorkspace.tsx`

**Interfaces:**
- Consumes: Binary asset repository from Tasks 2-3.
- Produces: `PaperManagedIccProfile`, `parseAndValidateCmykOutputProfile`, `resolveExactPaperOutputProfile`.

- [ ] **Step 1: Replace substitution tests with exact-resolution failures**

```ts
it('never substitutes a different output condition', async () => {
  const registry = registryWith([fogra39Profile]);
  expect(resolveExactPaperOutputProfile(registry, 'sha256:missing')).toEqual({ status: 'missing', profileId: 'sha256:missing' });
});

it('rejects RGB display profiles for PDF/X CMYK output', async () => {
  const bytes = new Uint8Array(readFileSync('test/fixtures/icc/srgb.icc'));
  await expect(parseAndValidateCmykOutputProfile(bytes)).rejects.toThrow(/CMYK output/i);
});
```

Update the old `bundledProfileForOutputIntent` tests so FOGRA51/52/custom do not fall back.

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run src/lib/paperManagedIccProfiles.test.ts src/lib/paperPdfxPipeline.test.ts src/lib/paperPreflight.test.ts`

Expected: FAIL because substitution is still expected.

- [ ] **Step 3: Implement exact profile records and UI**

```ts
export interface PaperManagedIccProfile {
  id: string;
  asset: BinaryAssetRef;
  description: string;
  deviceClass: string;
  colorSpace: 'CMYK';
  pcs: 'Lab ' | 'XYZ ';
  outputConditionId: string;
  registryName?: string;
  source: { kind: 'bundled' | 'downloaded' | 'user-import'; url?: string; licenseId?: string };
}

export type PaperOutputProfileResolution =
  | { status: 'ready'; profile: PaperManagedIccProfile; bytes: Uint8Array }
  | { status: 'missing'; profileId: string }
  | { status: 'invalid'; profileId: string; reason: string };
```

Parse the ICC header with `DataView`, require `acsp`, printer/output class, `CMYK`, supported PCS, sane declared size, and a successful lcms transform creation. The profile manager imports `.icc/.icm`, hashes bytes, stores the exact record, and binds `printProduction.outputIntentProfileAssetId`. Missing profiles remain repairable document blockers.

- [ ] **Step 4: Verify and commit**

Run:

```bash
npx vitest run src/lib/paperManagedIccProfiles.test.ts src/features/paper/workspace/PaperIccProfileManager.test.tsx src/lib/paperPdfxPipeline.test.ts src/lib/paperPreflight.test.ts
npm run build
```

Expected: PASS; `rg "INTENT_TO_BUNDLED|nearest bundled|isSubstitutedOutputIntent" src/lib src/components/Paper src/features/paper` returns no production use.

```bash
git add src/lib/paperManagedIccProfiles.ts src/lib/paperManagedIccProfiles.test.ts src/features/paper/workspace/PaperIccProfileManager.tsx src/features/paper/workspace/PaperIccProfileManager.test.tsx src/types/paper.ts src/lib/paperPdfxPipeline.ts src/lib/paperPdfxPipeline.test.ts src/lib/paperPreflight.ts src/lib/paperPreflight.test.ts src/features/paper/workspace/PaperWorkspace.tsx
git commit -m "feat(paper): require exact managed output profiles"
```

### Task 12: Compile A Typed WYSIWYG Render Plan

**Files:**
- Create: `src/lib/paperPrintPaint.ts`
- Create: `src/lib/paperPrintPaint.test.ts`
- Create: `src/lib/paperRenderPlan.ts`
- Create: `src/lib/paperRenderPlan.test.ts`
- Modify: `src/lib/paperPageFlattenExport.ts`
- Modify: `src/lib/paperPageFlattenExport.test.ts`
- Modify: `src/lib/paperColorManagement.ts`
- Modify: `src/lib/paperColorManagement.test.ts`

**Interfaces:**
- Consumes: exact ICC profiles, composed text, swatches, and asset refs.
- Produces: `PaperPrintPaint`, `PaperRenderPlan`, `PaperRenderNode`, `compilePaperRenderPlan`.

- [ ] **Step 1: Write failing exact-paint and render-plan tests**

```ts
it('preserves authored process CMYK without an RGB round trip', async () => {
  const plan = await compileFixtureWithFill(cmykSwatch({ c: 12, m: 34, y: 56, k: 78 }));
  expect(plan.pages[0].nodes[0].fill).toEqual({ kind: 'process-cmyk', c: 0.12, m: 0.34, y: 0.56, k: 0.78, tint: 1 });
});

it('records non-native effects as deliberate flatten groups', async () => {
  const plan = await compileFixtureFrame({ fillGradient: gradient(), textShadowBlurMm: 2 });
  expect(plan.pages[0].nodes[0]).toMatchObject({ kind: 'flatten-group', reasonCodes: ['gradient', 'blurred-text-shadow'] });
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run src/lib/paperPrintPaint.test.ts src/lib/paperRenderPlan.test.ts`

Expected: FAIL because typed plan modules do not exist.

- [ ] **Step 3: Implement stable plan types**

```ts
export type PaperPrintPaint =
  | { kind: 'process-cmyk'; c: number; m: number; y: number; k: number; tint: number }
  | { kind: 'gray'; gray: number; tint: number }
  | { kind: 'spot'; name: string; alternate: { c: number; m: number; y: number; k: number }; tint: number }
  | { kind: 'managed-rgb'; r: number; g: number; b: number; profile: 'srgb' };

export type PaperRenderNode =
  | { kind: 'path'; objectId: string; path: string; fill?: PaperPrintPaint; stroke?: PaperPrintPaint; opacity: number; overprint: boolean }
  | { kind: 'text'; objectId: string; composed: PaperComposedTextFrame; opacity: number; overprint: boolean }
  | { kind: 'image'; objectId: string; asset: BinaryAssetRef; clipPath?: string; transform: number[]; opacity: number }
  | { kind: 'flatten-group'; objectId: string; reasonCodes: string[]; boundsPt: { x: number; y: number; width: number; height: number }; children: PaperRenderNode[] };
```

Compile page background, parent items, frame stacking, paths, clips, transforms, exact paints, composed text, and managed images. Use one plan for preview/export; existing page flattening becomes the renderer for `flatten-group`, not the source of truth for native process/spot content.

- [ ] **Step 4: Verify and commit**

Run:

```bash
npx vitest run src/lib/paperPrintPaint.test.ts src/lib/paperRenderPlan.test.ts src/lib/paperPageFlattenExport.test.ts src/lib/paperColorManagement.test.ts
npm run build
```

Expected: PASS.

```bash
git add src/lib/paperPrintPaint.ts src/lib/paperPrintPaint.test.ts src/lib/paperRenderPlan.ts src/lib/paperRenderPlan.test.ts src/lib/paperPageFlattenExport.ts src/lib/paperPageFlattenExport.test.ts src/lib/paperColorManagement.ts src/lib/paperColorManagement.test.ts
git commit -m "feat(paper): compile typed WYSIWYG render plans"
```

### Task 13: Emit Exact CMYK, Spot, Fonts, Transparency, And Overprint

**Files:**
- Create: `src/lib/paperPdfxNativeContent.ts`
- Create: `src/lib/paperPdfxNativeContent.test.ts`
- Modify: `src/lib/paperPdfxExport.ts`
- Modify: `src/lib/paperPdfxExport.test.ts`
- Modify: `src/lib/paperPdfxPipeline.ts`
- Modify: `src/lib/paperPdfxPipeline.test.ts`
- Modify: `src/lib/paperPdfxPipelineVectorText.test.ts`
- Modify: `src/lib/paperPdfxSpotFills.ts`
- Modify: `src/lib/paperPdfxSpotFills.test.ts`
- Modify: `src/lib/paperPdfxVectorTextFrames.ts`
- Modify: `src/lib/paperPdfxVectorTextFrames.test.ts`
- Modify: `src/lib/paperInkLimit.ts`
- Modify: `src/lib/paperInkLimit.test.ts`

**Interfaces:**
- Consumes: `PaperRenderPlan` and exact profile from Tasks 11-12.
- Produces: `appendPaperNativeContent`, native content evidence, and hybrid PDF/X bytes.

- [ ] **Step 1: Write failing low-level PDF operator tests**

```ts
it('writes exact process CMYK operands and real overprint state', async () => {
  const bytes = await exportPlan(planWithProcessFill({ c: 0.12, m: 0.34, y: 0.56, k: 0.78 }, { overprint: true }));
  const streams = await decodedPageContent(bytes);
  expect(streams).toMatch(/0\.12 0\.34 0\.56 0\.78 k/);
  expect(streams).toMatch(/\/GSOP\d+ gs/);
  expect(Buffer.from(bytes).toString('latin1')).toMatch(/\/OP true|\/op true/);
});

it('keeps rich spot text on one named plate', async () => {
  const bytes = await exportPlan(planWithRichSpotText('PANTONE 185 C'));
  expect(Buffer.from(bytes).toString('latin1')).toContain('/Separation');
  expect(await countProcessPixelsWithGhostscript(bytes)).toBe(0);
  expect(await countSpotPixelsWithGhostscript(bytes, 'PANTONE 185 C')).toBeGreaterThan(0);
});
```

Add X-1a/X-4 tests: X-1a contains no live transparency; X-4 retains supported opacity graphics state. Add duplicate spot-name/different-alternate rejection.

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run src/lib/paperPdfxNativeContent.test.ts src/lib/paperPdfxExport.test.ts src/lib/paperPdfxPipeline.test.ts src/lib/paperPdfxPipelineVectorText.test.ts`

Expected: FAIL because process swatches still live in the raster and overprint is not emitted.

- [ ] **Step 3: Implement plan-driven native content**

```ts
export interface PaperPdfxNativeEvidence {
  processObjectIds: string[];
  spotPlates: Array<{ name: string; objectIds: string[] }>;
  embeddedFontIds: string[];
  outlinedObjectIds: string[];
  flattenedObjectIds: Array<{ objectId: string; reasons: string[] }>;
  overprintObjectIds: string[];
}

export async function appendPaperNativeContent(
  pdf: PDFDocument,
  page: PDFPage,
  nodes: readonly PaperRenderNode[],
  context: PaperPdfxNativeContext,
): Promise<PaperPdfxNativeEvidence>;
```

Emit `k/K` for process CMYK, gray operators for gray, `/Separation` or `/DeviceN` for named spots, and `/ExtGState` with `OP`, `op`, and `OPM` for overprint. Embed the exact managed font bytes for positioned rich runs; use glyph curves only for explicit outline paths. Rasterize only `flatten-group` children through the exact ICC transform and prevent native nodes from appearing in the backdrop.

Replace silent post-conversion UCR with TAC measurement. A plan over the configured limit becomes a preflight blocker; exported authored CMYK is not rewritten.

- [ ] **Step 4: Run separations and regression verification**

Run:

```bash
npx vitest run src/lib/paperPdfxNativeContent.test.ts src/lib/paperPdfxExport.test.ts src/lib/paperPdfxPipeline.test.ts src/lib/paperPdfxPipelineVectorText.test.ts src/lib/paperPdfxSpotFills.test.ts src/lib/paperPdfxVectorTextFrames.test.ts src/lib/paperInkLimit.test.ts
npm run build
```

Expected: PASS; exact CMYK operands, spot plates, fonts, and overprint are inspectable.

- [ ] **Step 5: Commit**

```bash
git add src/lib/paperPdfxNativeContent.ts src/lib/paperPdfxNativeContent.test.ts src/lib/paperPdfxExport.ts src/lib/paperPdfxExport.test.ts src/lib/paperPdfxPipeline.ts src/lib/paperPdfxPipeline.test.ts src/lib/paperPdfxPipelineVectorText.test.ts src/lib/paperPdfxSpotFills.ts src/lib/paperPdfxSpotFills.test.ts src/lib/paperPdfxVectorTextFrames.ts src/lib/paperPdfxVectorTextFrames.test.ts src/lib/paperInkLimit.ts src/lib/paperInkLimit.test.ts
git commit -m "feat(paper): emit exact hybrid PDF print content"
```

### Task 14: Make Production Preflight And PDF/X Saving Fail Closed

**Files:**
- Create: `src/lib/paperProductionPreflight.ts`
- Create: `src/lib/paperProductionPreflight.test.ts`
- Create: `src/lib/paperProductionReport.ts`
- Create: `src/lib/paperProductionReport.test.ts`
- Modify: `src/lib/paperPdfxValidate.ts`
- Create: `src/lib/paperPdfxValidate.test.ts`
- Create: `src/lib/licenseGates.test.ts`
- Modify: `src/lib/paperPreflight.ts`
- Modify: `src/lib/paperPreflight.test.ts`
- Modify: `src/components/Paper/PaperWorkspaceUtils.ts`
- Modify: `src/components/Paper/PaperWorkspaceUtils.test.ts`
- Modify: `src/features/paper/workspace/PaperWorkspace.tsx`

**Interfaces:**
- Consumes: render plan, PDF bytes, and evidence from Task 13.
- Produces: `PaperProductionIssue`, `PaperProductionPreflightReport`, `PaperProductionExportReport`, `exportValidatedPaperPdfx`.

- [ ] **Step 1: Write failing save-gate and honest-label tests**

```ts
it('does not download bytes when PDF/X validation fails', async () => {
  const download = vi.fn();
  const result = await exportValidatedPaperPdfx(fixtureDocument(), deps({ validate: async () => failedValidation(), download }));
  expect(result.status).toBe('blocked');
  expect(download).not.toHaveBeenCalled();
});

it('does not claim ISO certification from the internal validator', () => {
  const copy = formatProductionValidationStatus(passingInternalReport());
  expect(copy).toContain('Structurally verified');
  expect(copy).not.toMatch(/certified|ISO validation passed/i);
});
```

Add blockers for missing exact profile/font/glyph/asset, unplateable requested spot, TAC overflow, insufficient PPI, and unsupported X-1a transparency.

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run src/lib/paperProductionPreflight.test.ts src/lib/paperProductionReport.test.ts src/lib/paperPdfxValidate.test.ts src/components/Paper/PaperWorkspaceUtils.test.ts src/lib/paperPreflight.test.ts`

Expected: FAIL because the current save path downloads before enforcing `report.pass`.

- [ ] **Step 3: Implement transaction and stable issue codes**

```ts
export type PaperProductionSeverity = 'blocker' | 'warning' | 'information';

export interface PaperProductionIssue {
  code: string;
  severity: PaperProductionSeverity;
  message: string;
  pageId?: string;
  objectId?: string;
  assetId?: BinaryAssetId;
  fixAction?: 'select-object' | 'manage-font' | 'manage-profile' | 'relink-asset' | 'upscale-image';
}

export type ValidatedPaperPdfxResult =
  | { status: 'saved'; bytes: Uint8Array; report: PaperProductionExportReport }
  | { status: 'blocked'; issues: PaperProductionIssue[]; report?: PaperProductionExportReport }
  | { status: 'cancelled' };
```

Freeze document revision and reachable asset IDs, preflight, generate to memory/temporary storage, validate structure/render/fonts/plates, and invoke download only for `saved`. Keep a separate proof export path that omits all PDF/X identity fields.

- [ ] **Step 4: Verify commercial gate and save behavior**

Run:

```bash
npx vitest run src/lib/licenseGates.test.ts src/lib/paperProductionPreflight.test.ts src/lib/paperProductionReport.test.ts src/lib/paperPdfxValidate.test.ts src/components/Paper/PaperWorkspaceUtils.test.ts src/lib/paperPreflight.test.ts
npm run build
```

Expected: PASS; license behavior is unchanged and invalid PDF/X never downloads.

- [ ] **Step 5: Commit**

```bash
git add src/lib/licenseGates.test.ts src/lib/paperProductionPreflight.ts src/lib/paperProductionPreflight.test.ts src/lib/paperProductionReport.ts src/lib/paperProductionReport.test.ts src/lib/paperPdfxValidate.ts src/lib/paperPdfxValidate.test.ts src/lib/paperPreflight.ts src/lib/paperPreflight.test.ts src/components/Paper/PaperWorkspaceUtils.ts src/components/Paper/PaperWorkspaceUtils.test.ts src/features/paper/workspace/PaperWorkspace.tsx
git commit -m "fix(paper): block invalid PDF/X output"
```

### Task 15: Normalize Stability For Honest Print Resolution

**Files:**
- Create: `src/lib/paperStabilityUpscale.ts`
- Create: `src/lib/paperStabilityUpscale.test.ts`
- Modify: `src/lib/paperImageUpscale.ts`
- Modify: `src/lib/paperImageUpscale.test.ts`
- Modify: `src/features/paper/workspace/PaperWorkspace.tsx`
- Modify: `src/lib/paperPreflight.ts`
- Modify: `src/lib/paperPreflight.test.ts`

**Interfaces:**
- Consumes: Task 3 repository and existing encrypted `apiKeys.stability` through the current settings selector.
- Produces: `planPaperStabilityUpscale`, `runPaperStabilityUpscale`, `PaperStabilityUpscaleResult` with binary asset and achieved PPI.

- [ ] **Step 1: Write failing provider-contract and PPI tests**

```ts
it('normalizes Fast input within every documented limit without changing aspect', async () => {
  const plan = await planPaperStabilityUpscale({ mode: 'fast', source: imageMeta(3000, 2000), requiredPixels: { width: 3300, height: 2200 } });
  expect(plan.request.width).toBeLessThanOrEqual(1536);
  expect(plan.request.height).toBeLessThanOrEqual(1536);
  expect(plan.request.width * plan.request.height).toBeLessThanOrEqual(1_048_576);
  expect(plan.request.width / plan.request.height).toBeCloseTo(1.5, 2);
});

it('rejects Conservative creativity outside 0.2 through 0.5', () => {
  expect(() => validatePaperStabilityOptions({ mode: 'conservative', prompt: 'comic line art', creativity: 0.1 })).toThrow(/0\.2.*0\.5/);
});

it('does not call a 4 MP result print-ready when placed PPI is below target', () => {
  const result = assessUpscaleResolution({ outputWidth: 2449, outputHeight: 1633, placedWidthIn: 8.5, placedHeightIn: 11, requiredPpi: 300 });
  expect(result.printReady).toBe(false);
  expect(result.effectivePpi).toBeLessThan(300);
});
```

Add tests that preserve frame locator/crop/offset/rotation, return bytes rather than a data URL/object URL, deduplicate one source used by several frames, and leave state unchanged on 400/403/413/422/429/500/cancel/timeout.

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run src/lib/paperStabilityUpscale.test.ts src/lib/paperImageUpscale.test.ts src/lib/paperPreflight.test.ts`

Expected: FAIL because Paper fits provider output to target data URLs and reports target dimensions rather than achieved detail.

- [ ] **Step 3: Implement Paper-owned binary provider adapter**

```ts
export interface PaperStabilityUpscaleResult {
  asset: BinaryAssetRef;
  providerWidthPx: number;
  providerHeightPx: number;
  effectivePpi: number;
  requiredPpi: number;
  printReady: boolean;
  mode: 'fast' | 'conservative';
  estimatedCostUsd: number;
}

export async function runPaperStabilityUpscale(input: {
  apiKey: string;
  source: BinaryAssetRecord;
  placement: PaperImagePlacementRequirement;
  options: PaperStabilityOptions;
  repository: PaperAssetRepository;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}): Promise<PaperStabilityUpscaleResult>;
```

Preprocess to a supported PNG/JPEG/WebP Blob while preserving aspect. Fast must fit 32-1536 per side and 1,024-1,048,576 pixels; Conservative requires 64-pixel minimum sides, 4,096-9,437,184 pixels, 1:2.5-2.5:1 aspect, non-empty prompt, and creativity 0.2-0.5. Request `Accept: image/*`, validate returned MIME/dimensions, hash/store bytes, and compute achieved effective PPI. Do not locally crop the result to frame dimensions or claim local interpolation adds detail.

- [ ] **Step 4: Verify and commit**

Run:

```bash
npx vitest run src/lib/paperStabilityUpscale.test.ts src/lib/paperImageUpscale.test.ts src/lib/paperPreflight.test.ts
npm run build
```

Expected: PASS; `rg -n "fitProviderResultToTargetDataUrl|dataUrl" src/lib/paperImageUpscale.ts` shows no Stability result fitting or new persisted data URL.

```bash
git add src/lib/paperStabilityUpscale.ts src/lib/paperStabilityUpscale.test.ts src/lib/paperImageUpscale.ts src/lib/paperImageUpscale.test.ts src/features/paper/workspace/PaperWorkspace.tsx src/lib/paperPreflight.ts src/lib/paperPreflight.test.ts
git commit -m "fix(paper): make Stability print resolution honest"
```

### Task 16: Add Golden Print Fixtures And Local External-Tool Verification

**Files:**
- Create: `src/lib/paperProductionGolden.test.ts`
- Create: `test/fixtures/paper/production-golden.ts`
- Create: `scripts/verify-paper-production.mjs`
- Create: `scripts/paper-production-verification-lib.mjs`
- Create: `scripts/paper-production-verification-lib.test.mjs`
- Modify: `package.json`
- Modify: `docs/audits/paper-workspace-project1.md`

**Interfaces:**
- Consumes: all Project 1 outputs.
- Produces: `npm run verify:paper-production` and deterministic files under a user-supplied output directory.

- [ ] **Step 1: Write the failing golden integration test**

```ts
it.each(['pdf-x-1a', 'pdf-x-4'] as const)('exports the production golden as %s', async (standard) => {
  const fixture = await buildPaperProductionGoldenFixture();
  const result = await exportValidatedPaperPdfx(fixture.document, fixture.deps(standard));
  expect(result.status).toBe('saved');
  if (result.status !== 'saved') return;
  expect(result.report.blockers).toEqual([]);
  expect(result.report.processObjects).toContain('exact-cmyk-panel');
  expect(result.report.spotPlates).toContain('PANTONE 185 C');
  expect(result.report.embeddedFonts.length).toBeGreaterThan(1);
  expect(result.report.imagePpi.every((entry) => entry.effectivePpi >= 300)).toBe(true);
});
```

The golden contains mixed rich text, managed serif/sans faces, vertical Japanese, a process CMYK panel, two spot tints, overprint, transparency, an ICC-converted sRGB image, bleed, and a Stability-upscaled placed asset fixture.

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run src/lib/paperProductionGolden.test.ts`

Expected: FAIL until fixture helpers and verification report integration exist.

- [ ] **Step 3: Implement the verification runner**

```js
export const PAPER_VERIFY_TOOLS = [
  { command: 'qpdf', args: (pdf) => ['--check', pdf] },
  { command: 'pdfinfo', args: (pdf) => [pdf] },
  { command: 'pdffonts', args: (pdf) => [pdf] },
  { command: 'pdfimages', args: (pdf) => ['-list', pdf] },
  { command: 'gs', args: (pdf, prefix) => ['-q', '-dNOPAUSE', '-dBATCH', '-sDEVICE=tiffsep', `-sOutputFile=${prefix}-%d.tif`, pdf] },
];
```

The runner creates both standards, calls each available tool, records missing tools as pending, verifies process/spot plate files, extracts fonts and images, and writes `paper-production-verification.json`. It must not invoke Acrobat or describe local checks as certification.

Add `"verify:paper-production": "node scripts/verify-paper-production.mjs"` to `package.json`.

- [ ] **Step 4: Run Project 1 local verification**

Run:

```bash
npx vitest run src/lib/paperProductionGolden.test.ts
node --test scripts/paper-production-verification-lib.test.mjs
npm run verify:paper-production
npm run build
```

Expected: golden tests PASS; qpdf/Poppler/Ghostscript checks pass where installed; Acrobat remains `external-pending`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/paperProductionGolden.test.ts test/fixtures/paper/production-golden.ts scripts/verify-paper-production.mjs scripts/paper-production-verification-lib.mjs scripts/paper-production-verification-lib.test.mjs package.json docs/audits/paper-workspace-project1.md
git commit -m "test(paper): add production print verification gate"
```

### Task 17: Run The Authorized Live Stability Smokes

**Files:**
- Create: `docs/audits/paper-stability-live-2026-07-14.md`
- Modify: `docs/audits/paper-workspace-project1.md`
- Modify: `src/lib/paperProductionAudit.ts`
- Modify: `src/lib/paperProductionAudit.test.ts`

**Interfaces:**
- Consumes: the live Paper UI, existing encrypted settings state, and Task 15.
- Produces: credential-free evidence for one Fast and one Conservative result.

- [ ] **Step 1: Confirm the local suite and key presence through the app**

Run:

```bash
npm run build
npx vitest run src/lib/paperStabilityUpscale.test.ts src/lib/paperImageUpscale.test.ts src/lib/paperProductionGolden.test.ts
npm run dev -- --host 127.0.0.1 --port 5175
```

Expected: build/tests PASS and the dev server stays running at `http://127.0.0.1:5175`. Open Settings through the UI and confirm Stability is configured without reading, printing, or copying the key.

- [ ] **Step 2: Run one Fast request through the Paper workflow**

Use a non-sensitive fixture under the Fast input limits. Capture request endpoint, input dimensions, HTTP status, output MIME/dimensions, content hash, effective placed PPI, estimated cost, and resulting asset reference. Do not capture authorization headers.

Expected: binary 200 response, validated asset in the repository, unchanged crop/transform, and honest `printReady` based on achieved PPI.

- [ ] **Step 3: Run one Conservative request through the Paper workflow**

Use a 64+ pixel-per-side fixture, non-empty prompt, and creativity `0.35`. Capture the same credential-free fields.

Expected: binary 200 response and approximately 4 MP output. If its placed PPI is below 300, the UI must show that deficit and strict export must remain blocked.

- [ ] **Step 4: Record results or a precise pending failure**

Write the audit note with timestamps, provider modes, dimensions, hashes, PPI, cost, and outcome. A missing/invalid key, moderation response, insufficient credits, or provider outage is recorded verbatim by status category without secrets and leaves the audit entry `external-pending`.

- [ ] **Step 5: Stop the server, verify, and commit**

Stop the dev server, then run: `npx vitest run src/lib/paperProductionAudit.test.ts`

Expected: PASS and the ledger status matches the evidence note.

```bash
git add docs/audits/paper-stability-live-2026-07-14.md docs/audits/paper-workspace-project1.md src/lib/paperProductionAudit.ts src/lib/paperProductionAudit.test.ts
git commit -m "test(paper): verify live Stability print upscale"
```

### Task 18: Final Project 1 Audit, Documentation, And Release Claim Gate

**Files:**
- Modify: `src/lib/paperProductionAudit.ts`
- Modify: `src/lib/paperProductionAudit.test.ts`
- Modify: `docs/audits/paper-workspace-project1.md`
- Modify: `docs/PRINT-STATUS.md`
- Modify: `docs/TASK_LIST.md`
- Create: `docs/notes/900-paper-managed-print-core.md`
- Modify only if claims require correction: `README.md`
- Modify only if claims require correction: `docs/FEATURE_BREAKDOWN.md`

**Interfaces:**
- Consumes: all Project 1 evidence.
- Produces: honest completion state and handoff for Projects 2-4.

- [ ] **Step 1: Run the complete focused suite**

```bash
npx vitest run \
  src/shared/assets/contentAddressedAsset.test.ts \
  src/shared/files/ValidatedAssetContainer.test.ts \
  src/features/paper/SlpprFormat.test.ts \
  src/features/paper/assets \
  src/lib/paperFontVetting.test.ts \
  src/lib/paperManagedFonts.test.ts \
  src/lib/paperOpenFontCatalog.test.ts \
  src/lib/paperTextShaper.test.ts \
  src/lib/paperTextComposition.test.ts \
  src/lib/paperManagedIccProfiles.test.ts \
  src/lib/paperRenderPlan.test.ts \
  src/lib/paperPdfxNativeContent.test.ts \
  src/lib/paperProductionPreflight.test.ts \
  src/lib/paperProductionReport.test.ts \
  src/lib/paperStabilityUpscale.test.ts \
  src/lib/paperProductionGolden.test.ts \
  src/lib/paperBubblePaths.test.ts \
  src/lib/paperDocument.test.ts \
  src/components/Paper/PaperWorkspaceUtils.test.ts
npm run verify:paper-production
npm run build
```

Expected: all automated tests PASS; local external tools pass or are named pending; Claude's protected speech-bubble behavior remains green.

- [ ] **Step 2: Run the complete repository test suite**

Run: `npm test`

Expected: PASS. Failures in concurrently changed Flow/Image files are not ignored: record the owning session and exact failing test, then wait for reconciliation before declaring Project 1 complete.

- [ ] **Step 3: Scan invariants and repository state**

```bash
rg -n "dataBase64|data:image|data:application|nearest bundled|isSubstitutedOutputIntent" src/types/paper.ts src/store/paperStore.ts src/lib/paper* src/features/paper src/components/Paper
rg -n "PDF/X.*certif|ISO.*validat" src/lib/paper* src/components/Paper src/features/paper README.md docs/PRINT-STATUS.md
git diff --check
git status --short
```

Expected: binary strings occur only in named legacy migration/provider-boundary code; no profile substitution; no unsupported certification claim; no unrelated Flow/Image file staged.

- [ ] **Step 4: Update evidence and write the required note**

Mark an audit row `verified` only when its tests/evidence pass. Use `external-pending` for Acrobat/real-press/KDP/InDesign gates. `docs/notes/900-paper-managed-print-core.md` must describe the asset architecture, fonts/licenses, shaping, ICC/color, PDF/X behavior, Stability results, exact commands run, remaining external gates, and Projects 2-4 handoff.

Update public claims only to the strongest evidence-supported wording. Keep PDF/X licensed and keep the open-font downloader available to Community.

- [ ] **Step 5: Commit the Project 1 closeout**

```bash
git add src/lib/paperProductionAudit.ts src/lib/paperProductionAudit.test.ts docs/audits/paper-workspace-project1.md docs/PRINT-STATUS.md docs/TASK_LIST.md docs/notes/900-paper-managed-print-core.md README.md docs/FEATURE_BREAKDOWN.md
git commit -m "docs(paper): close managed print core audit"
```

Expected: the commit includes only files actually changed; omit unchanged optional claim files from `git add` if no correction is required.

## Execution Checkpoints

1. **After Task 6:** Paper runtime and project snapshots contain references only; `.slppr` v2 is portable; no Flow/Image snapshot shape changed.
2. **After Task 10:** managed fonts and deterministic rich-text composition render in the editor and are ready for export.
3. **After Task 14:** exact profiles/process/spot/overprint/font content export through both PDF/X standards, and invalid output cannot save.
4. **After Task 17:** Stability is validated locally and, when the configured key/provider permit, live in both modes.
5. **After Task 18:** Project 1 has evidence-backed claims and a clean handoff to the separate Layout/Interoperability, Document Integrity, and Runtime Quality plans.
