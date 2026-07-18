import { usePaperStore } from '../store/paperStore';
import { isAndroidLanServerAvailable, notifyLanProjectChange } from './androidLanServer';
import { isServedLanSession } from './remoteHostClient';
import { ensureProjectSyncChannelStarted } from './projectSyncClient';
import { registerProjectSyncChannel, type ProjectSyncChannel } from './projectSyncService';
import {
  commitVerifiedProjectSyncAssets,
  getProjectSyncAsset,
  prepareVerifiedProjectSyncAssets,
  putVerifiedProjectSyncAsset,
} from './projectSyncAssets';
import {
  createPaperWorkspaceSnapshotChange,
  isPaperWorkspaceSnapshotChange,
  type PaperDocumentNativeChange,
  type PaperWorkspaceSnapshotChange,
} from './paperDocumentNativeSync';
import { paperAssetRepository } from '../features/paper/assets/PaperAssetRuntime';
import type { PaperAssetRepository } from '../features/paper/assets/PaperAssetRepository';
import { collectReachablePaperAssetRefs } from '../features/paper/assets/PaperDocumentAssets';
import {
  isBinaryAssetRef,
  verifyBinaryAssetRecord,
  type BinaryAssetId,
  type BinaryAssetRecord,
  type BinaryAssetRef,
} from '../shared/assets/contentAddressedAsset';
import { sanitizePaperSnapshot as sanitizeProjectPaperSnapshot } from './projectValidation';

/**
 * Paper's cross-device policy layer. Current peers exchange a schema-v1 workspace envelope that
 * preserves the complete ordered tab catalog and active tab. Its discriminator and active `document`
 * remain the historical `paper-document-snapshot` shape, so an older peer safely applies the active
 * document while a current peer authenticates all managed records and atomically applies the workspace.
 *
 * Managed image, font/license, and ICC bytes travel out-of-band under their immutable SHA-256 id.
 * Outbound publication is bytes-before-envelope; inbound application stages and verifies every
 * reachable record before changing the store. Missing/corrupt records defer the whole envelope.
 */

export const PAPER_SYNC_CHANNEL = 'paper';

const EMIT_COALESCE_MS = 90;
const EMIT_MAX_WAIT_MS = 220;

let applyingRemote = false;
let canEmit = false;
let lastWorkspaceFingerprint: string | null = null;
let initialized = false;
let unsubscribeStore: (() => void) | null = null;
let emitTimer: ReturnType<typeof setTimeout> | null = null;
let firstPendingAt = 0;

let assetRepository: PaperAssetRepository = paperAssetRepository;
let prepareAssets = prepareVerifiedProjectSyncAssets;
let putAsset = putVerifiedProjectSyncAsset;
let getAsset = getProjectSyncAsset;
let commitAssets = commitVerifiedProjectSyncAssets;

/** Serialize async asset publication and apply so a slower older envelope cannot land after a newer one. */
let outboundTail: Promise<void> = Promise.resolve();
let inboundTail: Promise<void> = Promise.resolve();

function isPaperSyncActive(): boolean {
  return isAndroidLanServerAvailable() || isServedLanSession();
}

function currentWorkspaceChange(): PaperWorkspaceSnapshotChange {
  return createPaperWorkspaceSnapshotChange(usePaperStore.getState().exportSnapshot());
}

function workspaceFingerprint(change: PaperWorkspaceSnapshotChange): string {
  return JSON.stringify(change.workspace);
}

function sameAssetRef(left: BinaryAssetRef, right: BinaryAssetRef): boolean {
  return left.id === right.id
    && left.sha256 === right.sha256
    && left.mimeType === right.mimeType
    && left.byteLength === right.byteLength
    && left.fileName === right.fileName;
}

function validateWorkspaceChange(change: PaperDocumentNativeChange): PaperWorkspaceSnapshotChange | null {
  if (!isPaperWorkspaceSnapshotChange(change)) return null;
  const { workspace } = change;
  if (!workspace.documents.length) return null;
  const tabIds = new Set<string>();
  for (const candidate of workspace.documents) {
    if (!candidate || typeof candidate.id !== 'string' || !candidate.id || tabIds.has(candidate.id)) return null;
    if (!candidate.document || !Array.isArray(candidate.document.pages)) return null;
    tabIds.add(candidate.id);
  }
  if (!tabIds.has(workspace.activeDocumentId)) return null;
  const activeDocument = workspace.documents.find(
    (candidate) => candidate.id === workspace.activeDocumentId,
  )?.document;
  if (!activeDocument || JSON.stringify(change.document) !== JSON.stringify(activeDocument)) return null;

  let expectedRefs: BinaryAssetRef[];
  try {
    const byId = new Map<BinaryAssetId, BinaryAssetRef>();
    for (const candidate of workspace.documents) {
      for (const ref of collectReachablePaperAssetRefs(candidate.document)) {
        const existing = byId.get(ref.id);
        if (existing && !sameAssetRef(existing, ref)) return null;
        if (!existing) byId.set(ref.id, ref);
      }
    }
    expectedRefs = [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
  } catch {
    return null;
  }
  if (workspace.assetRefs.length !== expectedRefs.length) return null;
  for (let index = 0; index < expectedRefs.length; index += 1) {
    const declared = workspace.assetRefs[index];
    if (!isBinaryAssetRef(declared) || !sameAssetRef(declared, expectedRefs[index])) return null;
  }

  // Project validation rejects malformed/inline managed references. Sync is stricter than file restore:
  // any quarantine or repair means the envelope is deferred, never partially repaired into live state.
  const sanitized = sanitizeProjectPaperSnapshot({
    document: change.document,
    documents: workspace.documents,
    activeDocumentId: workspace.activeDocumentId,
    assetIds: expectedRefs.map((ref) => ref.id),
  });
  if (!sanitized || sanitized.recovery) return null;
  if (sanitized.documents?.length !== workspace.documents.length) return null;
  if (sanitized.activeDocumentId !== workspace.activeDocumentId) return null;
  return change;
}

function bytesToDataUrl(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return `data:application/octet-stream;base64,${btoa(binary)}`;
}

function bytesFromDataUrl(value: string): Uint8Array | null {
  const match = /^data:[^,]*;base64,([a-z0-9+/=]*)$/i.exec(value);
  if (!match) return null;
  try {
    const binary = atob(match[1]);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch {
    return null;
  }
}

async function recordMatchesRef(record: BinaryAssetRecord | undefined, ref: BinaryAssetRef): Promise<boolean> {
  return Boolean(record && sameAssetRef(record.ref, ref) && await verifyBinaryAssetRecord(record));
}

function sameAssetRecord(left: BinaryAssetRecord | undefined, right: BinaryAssetRecord | undefined): boolean {
  if (!left || !right) return left === right;
  return sameAssetRef(left.ref, right.ref)
    && left.bytes.byteLength === right.bytes.byteLength
    && left.bytes.every((value, index) => value === right.bytes[index]);
}

async function publishWorkspaceAssets(change: PaperWorkspaceSnapshotChange): Promise<void> {
  const assetIds = change.workspace.assetRefs.map((ref) => ref.id);
  if (!await prepareAssets(PAPER_SYNC_CHANNEL, assetIds)) {
    throw new Error('Paper sync deferred: the managed asset inventory was not acknowledged by the authority.');
  }
  for (const ref of change.workspace.assetRefs) {
    const record = await assetRepository.get(ref.id);
    if (!await recordMatchesRef(record, ref)) {
      throw new Error(`Paper sync deferred: managed asset ${ref.id} is missing, corrupt, or mismatched.`);
    }
    if (!await putAsset(PAPER_SYNC_CHANNEL, ref.id, bytesToDataUrl(record!.bytes))) {
      throw new Error(`Paper sync deferred: managed asset ${ref.id} was not acknowledged by the authority.`);
    }
  }
}

interface StagedInboundAssetWrite {
  record: BinaryAssetRecord;
  previous: BinaryAssetRecord | undefined;
}

interface StagedInboundAssets {
  resolved: Map<BinaryAssetId, BinaryAssetRecord>;
  writes: StagedInboundAssetWrite[];
}

/** Fetch and verify the complete asset set without mutating the repository. */
async function stageInboundAssets(change: PaperWorkspaceSnapshotChange): Promise<StagedInboundAssets | null> {
  const resolved = new Map<BinaryAssetId, BinaryAssetRecord>();
  const writes: StagedInboundAssetWrite[] = [];
  for (const ref of change.workspace.assetRefs) {
    const existing = await assetRepository.get(ref.id);
    if (await recordMatchesRef(existing, ref)) {
      resolved.set(ref.id, existing!);
      continue;
    }
    const encoded = await getAsset(PAPER_SYNC_CHANNEL, ref.id);
    if (!encoded) return null;
    const bytes = bytesFromDataUrl(encoded);
    if (!bytes) return null;
    const record: BinaryAssetRecord = { ref: { ...ref }, bytes };
    if (!await recordMatchesRef(record, ref)) return null;
    resolved.set(ref.id, record);
    writes.push({ record, previous: existing });
  }
  return { resolved, writes };
}

type PaperManagedAssetRole = 'image' | 'font' | 'font-license' | 'icc-profile';

function recordKindMatchesRole(record: BinaryAssetRecord, role: PaperManagedAssetRole): boolean {
  const mimeType = record.ref.mimeType.trim().toLowerCase();
  switch (role) {
    case 'image': return mimeType.startsWith('image/');
    case 'font': return mimeType.startsWith('font/');
    case 'font-license': return mimeType.startsWith('text/');
    case 'icc-profile': return mimeType === 'application/vnd.iccprofile';
  }
}

/** Bind every immutable record to the authored role that will consume it before any publication. */
function validateResolvedAssetRoles(
  change: PaperWorkspaceSnapshotChange,
  resolved: ReadonlyMap<BinaryAssetId, BinaryAssetRecord>,
): boolean {
  const roles = new Map<BinaryAssetId, Set<PaperManagedAssetRole>>();
  const add = (ref: BinaryAssetRef, role: PaperManagedAssetRole): void => {
    const existing = roles.get(ref.id) ?? new Set<PaperManagedAssetRole>();
    existing.add(role);
    roles.set(ref.id, existing);
  };

  for (const { document } of change.workspace.documents) {
    for (const page of [...document.pages, ...(document.parentPages ?? [])]) {
      for (const frame of page.frames) {
        const locator = frame.asset?.locator;
        if (frame.kind === 'image' && locator?.kind === 'managed') add(locator.ref, 'image');
      }
    }
    for (const font of document.importedFonts ?? []) {
      add(font.fontAsset, 'font');
      if (font.license.textAsset) add(font.license.textAsset, 'font-license');
    }
    for (const profile of document.managedIccProfiles ?? []) add(profile.asset, 'icc-profile');
  }

  for (const [id, expectedRoles] of roles) {
    const record = resolved.get(id);
    if (!record || [...expectedRoles].some((role) => !recordKindMatchesRole(record, role))) return false;
  }
  return roles.size === resolved.size;
}

async function rollbackStagedAssets(writes: readonly StagedInboundAssetWrite[]): Promise<boolean> {
  try {
    for (const { record, previous } of [...writes].reverse()) {
      if (previous) await assetRepository.put(previous);
      else await assetRepository.delete(record.ref.id);
    }
    for (const { record, previous } of writes) {
      if (!sameAssetRecord(await assetRepository.get(record.ref.id), previous)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

interface CommittedStagedAssets {
  rollback: () => Promise<boolean>;
}

async function commitStagedAssets(writes: readonly StagedInboundAssetWrite[]): Promise<CommittedStagedAssets | null> {
  try {
    const records = writes.map(({ record }) => record);
    if (assetRepository.putAllAtomic) {
      const stored = await assetRepository.putAllAtomic(records);
      if (stored.length !== records.length
        || stored.some((ref, index) => !sameAssetRef(ref, records[index].ref))) {
        throw new Error('Paper asset repository returned a mismatched atomic commit result.');
      }
    } else {
      for (const record of records) {
        const stored = await assetRepository.put(record);
        if (!sameAssetRef(stored, record.ref)) {
          throw new Error('Paper asset repository returned a mismatched commit result.');
        }
      }
    }
    return { rollback: () => rollbackStagedAssets(writes) };
  } catch {
    await rollbackStagedAssets(writes);
    return null;
  }
}

function clearPendingEmit(): void {
  if (emitTimer) {
    clearTimeout(emitTimer);
    emitTimer = null;
  }
  firstPendingAt = 0;
}

async function flushEmitWork(): Promise<void> {
  if (!canEmit || !isPaperSyncActive()) {
    lastWorkspaceFingerprint = workspaceFingerprint(currentWorkspaceChange());
    return;
  }
  const change = currentWorkspaceChange();
  const fingerprint = workspaceFingerprint(change);
  if (fingerprint === lastWorkspaceFingerprint) return;
  await publishWorkspaceAssets(change);
  if (!await commitAssets(PAPER_SYNC_CHANNEL, change.workspace.assetRefs.map((ref) => ref.id))) {
    throw new Error('Paper sync deferred: the managed asset inventory could not be committed.');
  }
  notifyLanProjectChange(PAPER_SYNC_CHANNEL, change);
  lastWorkspaceFingerprint = fingerprint;
}

function flushEmit(): Promise<void> {
  clearPendingEmit();
  const work = outboundTail.then(flushEmitWork);
  outboundTail = work.catch((error: unknown) => {
    console.warn('[paper-sync] Workspace publication deferred.', error);
  });
  return outboundTail;
}

function scheduleEmit(): void {
  const now = Date.now();
  if (!firstPendingAt) firstPendingAt = now;
  if (emitTimer) clearTimeout(emitTimer);
  const delay = Math.max(0, Math.min(EMIT_COALESCE_MS, EMIT_MAX_WAIT_MS - (now - firstPendingAt)));
  emitTimer = setTimeout(() => void flushEmit(), delay);
}

function handleStoreChange(): void {
  if (applyingRemote) {
    canEmit = true;
    lastWorkspaceFingerprint = workspaceFingerprint(currentWorkspaceChange());
    clearPendingEmit();
    return;
  }
  if (!canEmit || !isPaperSyncActive()) return;
  scheduleEmit();
}

async function applyRemoteChange(change: PaperDocumentNativeChange): Promise<boolean> {
  // A payload that claims the workspace-envelope shape must never be reinterpreted as a legacy
  // active-document snapshot merely because its schema version is unknown.
  if (change.type === 'paper-document-snapshot' && change.workspace !== undefined) {
    const validated = validateWorkspaceChange(change);
    if (!validated) {
      console.warn('[paper-sync] Rejected malformed or unsupported workspace envelope.');
      return false;
    }
    const staged = await stageInboundAssets(validated);
    if (!staged || !validateResolvedAssetRoles(validated, staged.resolved)) {
      console.warn('[paper-sync] Workspace application rejected an asset with the wrong authored role.');
      return false;
    }
    const committed = await commitStagedAssets(staged.writes);
    if (!committed) {
      console.warn('[paper-sync] Workspace application deferred until every managed asset verifies.');
      return false;
    }
    if (!await commitAssets(PAPER_SYNC_CHANNEL, validated.workspace.assetRefs.map((ref) => ref.id))) {
      await committed.rollback();
      return false;
    }
    applyingRemote = true;
    try {
      const changed = usePaperStore.getState().applyRemotePaperWorkspaceSnapshot(validated.workspace);
      if (!changed) {
        await committed.rollback();
        return false;
      }
      canEmit = true;
      lastWorkspaceFingerprint = workspaceFingerprint(currentWorkspaceChange());
      clearPendingEmit();
      return changed;
    } catch (error) {
      await committed.rollback();
      throw error;
    } finally {
      applyingRemote = false;
    }
  }

  // Deliberate legacy path. The store routes by document/page identity and rejects ambiguous
  // multi-tab replacement while keeping its live body and catalog entry coherent.
  applyingRemote = true;
  try {
    const changed = usePaperStore.getState().applyRemotePaperDocumentChange(change);
    canEmit = true;
    lastWorkspaceFingerprint = workspaceFingerprint(currentWorkspaceChange());
    clearPendingEmit();
    return changed;
  } finally {
    applyingRemote = false;
  }
}

const paperChannel: ProjectSyncChannel<PaperDocumentNativeChange> = {
  id: PAPER_SYNC_CHANNEL,
  applyRemote(change) {
    let result = false;
    const work = inboundTail.then(async () => {
      result = await applyRemoteChange(change);
    });
    inboundTail = work.catch((error: unknown) => {
      console.warn('[paper-sync] Remote workspace application failed.', error);
    });
    return inboundTail.then(() => result);
  },
  async snapshot() {
    const change = currentWorkspaceChange();
    await publishWorkspaceAssets(change);
    if (!await commitAssets(PAPER_SYNC_CHANNEL, change.workspace.assetRefs.map((ref) => ref.id))) {
      throw new Error('Paper sync deferred: the managed asset inventory could not be committed.');
    }
    return change;
  },
};

export function initializePaperSyncChannel(): void {
  if (initialized) return;
  initialized = true;
  registerProjectSyncChannel(paperChannel);
  canEmit = isAndroidLanServerAvailable();
  lastWorkspaceFingerprint = workspaceFingerprint(currentWorkspaceChange());
  unsubscribeStore = usePaperStore.subscribe(handleStoreChange);
  void ensureProjectSyncChannelStarted(PAPER_SYNC_CHANNEL);
}

export function __resetPaperSyncChannelForTests(): void {
  applyingRemote = false;
  canEmit = false;
  lastWorkspaceFingerprint = null;
  initialized = false;
  unsubscribeStore?.();
  unsubscribeStore = null;
  assetRepository = paperAssetRepository;
  prepareAssets = prepareVerifiedProjectSyncAssets;
  putAsset = putVerifiedProjectSyncAsset;
  getAsset = getProjectSyncAsset;
  commitAssets = commitVerifiedProjectSyncAssets;
  outboundTail = Promise.resolve();
  inboundTail = Promise.resolve();
  clearPendingEmit();
}

export function __setPaperSyncDepsForTests(deps: {
  repository?: PaperAssetRepository;
  prepareAssets?: typeof prepareVerifiedProjectSyncAssets;
  putAsset?: typeof putVerifiedProjectSyncAsset;
  getAsset?: typeof getProjectSyncAsset;
  commitAssets?: typeof commitVerifiedProjectSyncAssets;
}): void {
  if (deps.repository) assetRepository = deps.repository;
  if (deps.prepareAssets) prepareAssets = deps.prepareAssets;
  if (deps.putAsset) putAsset = deps.putAsset;
  if (deps.getAsset) getAsset = deps.getAsset;
  if (deps.commitAssets) commitAssets = deps.commitAssets;
}

export async function __flushPaperSyncEmitForTests(): Promise<void> {
  await flushEmit();
}
