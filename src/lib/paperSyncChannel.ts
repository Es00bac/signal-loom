import { usePaperStore } from '../store/paperStore';
import { isAndroidLanServerAvailable, notifyLanProjectChange } from './androidLanServer';
import { isServedLanSession } from './remoteHostClient';
import { ensureProjectSyncChannelStarted } from './projectSyncClient';
import { registerProjectSyncChannel, type ProjectSyncChannel } from './projectSyncService';
import {
  diffPaperDocumentNativeChanges,
  type PaperDocumentNativeChange,
} from './paperDocumentNativeSync';
import type { PaperDocument } from '../types/paper';

/**
 * Paper workspace's seat on the unified cross-device op-sync (task #52). The **policy** layer wiring the
 * pure op model ([[paperDocumentNativeSync]]) and the live store (`paperStore`) to the shared transport
 * ([[projectSyncService]] + `androidLanServer` + `projectSyncClient`) — the Paper analog of
 * [[flowSyncChannel]], reusing the exact generic transport/client proven by Flow (`docs/notes/766`):
 *
 *  - **Apply (inbound):** a `ProjectSyncChannel` whose `applyRemote` drives
 *    `paperStore.applyRemotePaperDocumentChange` inside an **echo guard**, and whose `snapshot` exports
 *    the live document for a client's seed.
 *  - **Emit (outbound):** one passive `usePaperStore.subscribe` that diffs the document after store
 *    changes and pushes the minimal frame ops via `notifyLanProjectChange`.
 *
 * Difference from Flow: Paper has **no store-visible drag flag** (the canvas interaction lives in
 * component-local React state and commits to the store on every pointer-move during a frame drag/resize).
 * So instead of skipping while `node.dragging`, the emit is **coalesced** with a short trailing debounce
 * (collapses a drag's burst of per-move writes into the final position) plus a max-wait so a sustained
 * drag still streams periodically for liveness. Ops are idempotent, so the worst case of an extra emit is
 * a remote no-op, not corruption.
 *
 * Echo-loop + authority safety (identical to Flow):
 *  - `applyingRemote` suppresses the emit our own `applyRemote` provokes.
 *  - `canEmit` starts true only on the phone authority; a served client stays mute until it has applied
 *    its first remote op (the seed), so it can never push its stale local document over the phone's on
 *    connect — it only emits deltas a user makes *after* it is in sync.
 */

export const PAPER_SYNC_CHANNEL = 'paper';

/** Trailing-debounce window — collapses the per-pointer-move writes of a frame drag into one emit. */
const EMIT_COALESCE_MS = 90;
/** …but never hold a sustained drag longer than this before streaming an interim op (liveness). */
const EMIT_MAX_WAIT_MS = 220;

/** True while we are applying a remote op — the emit subscription must not re-broadcast it. */
let applyingRemote = false;
/** A served client only earns the right to emit after it has synced from the authority once. */
let canEmit = false;
/** Baseline document the subscription diffs against; null until the first observation. */
let lastDocument: PaperDocument | null = null;
let initialized = false;
/** Pending coalesced-emit timer + when the current pending burst began (for the max-wait). */
let emitTimer: ReturnType<typeof setTimeout> | null = null;
let firstPendingAt = 0;

function currentDocument(): PaperDocument {
  return usePaperStore.getState().document;
}

/** Cheap predicate: does this client participate in project sync at all? Keeps non-sync sessions free. */
function isPaperSyncActive(): boolean {
  return isAndroidLanServerAvailable() || isServedLanSession();
}

const paperChannel: ProjectSyncChannel<PaperDocumentNativeChange> = {
  id: PAPER_SYNC_CHANNEL,
  applyRemote(change) {
    applyingRemote = true;
    try {
      return usePaperStore.getState().applyRemotePaperDocumentChange(change);
    } finally {
      applyingRemote = false;
    }
  },
  snapshot() {
    return { type: 'paper-document-snapshot', document: currentDocument() };
  },
};

function clearPendingEmit(): void {
  if (emitTimer) {
    clearTimeout(emitTimer);
    emitTimer = null;
  }
  firstPendingAt = 0;
}

/** Diff the live document against the baseline and push the minimal ops. Resets the coalescer. */
function flushEmit(): void {
  clearPendingEmit();
  if (!canEmit || !isPaperSyncActive()) {
    lastDocument = currentDocument();
    return;
  }
  const next = currentDocument();
  if (lastDocument === null) {
    lastDocument = next;
    return;
  }
  const ops = diffPaperDocumentNativeChanges(lastDocument, next);
  lastDocument = next;
  for (const op of ops) notifyLanProjectChange(PAPER_SYNC_CHANNEL, op);
}

/** Schedule a coalesced emit: debounce by EMIT_COALESCE_MS, but never wait past EMIT_MAX_WAIT_MS. */
function scheduleEmit(): void {
  const now = Date.now();
  if (!firstPendingAt) firstPendingAt = now;
  if (emitTimer) clearTimeout(emitTimer);
  const delay = Math.max(0, Math.min(EMIT_COALESCE_MS, EMIT_MAX_WAIT_MS - (now - firstPendingAt)));
  emitTimer = setTimeout(flushEmit, delay);
}

function handleStoreChange(): void {
  if (applyingRemote) {
    // We just synced from the authority. From now on our edits are safe to push, and the baseline must
    // track the applied state so the next user edit diffs against it. Drop any pending local emit so we
    // never diff across the freshly-applied baseline.
    canEmit = true;
    lastDocument = currentDocument();
    clearPendingEmit();
    return;
  }
  if (!canEmit || !isPaperSyncActive()) return;
  scheduleEmit();
}

/**
 * Register the Paper channel and wire its passive (coalesced) emit subscription. Idempotent. Called when
 * `paperStore` loads (channel-init tied to the Paper workspace being present, zero app-startup cost), and
 * it asks the client to begin syncing this channel if a served session is already paired.
 */
export function initializePaperSyncChannel(): void {
  if (initialized) return;
  initialized = true;

  registerProjectSyncChannel(paperChannel);
  canEmit = isAndroidLanServerAvailable();
  lastDocument = currentDocument();
  usePaperStore.subscribe(handleStoreChange);

  void ensureProjectSyncChannelStarted(PAPER_SYNC_CHANNEL);
}

/** Test-only: reset module state between cases. */
export function __resetPaperSyncChannelForTests(): void {
  applyingRemote = false;
  canEmit = false;
  lastDocument = null;
  initialized = false;
  clearPendingEmit();
}

/** Test-only: force any pending coalesced emit to run now (bypasses the debounce timer). */
export function __flushPaperSyncEmitForTests(): void {
  flushEmit();
}
