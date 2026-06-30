import { useFlowStore } from '../store/flowStore';
import { isAndroidLanServerAvailable, notifyLanProjectChange } from './androidLanServer';
import { isServedLanSession } from './remoteHostClient';
import { ensureProjectSyncChannelStarted } from './projectSyncClient';
import { registerProjectSyncChannel, type ProjectSyncChannel } from './projectSyncService';
import {
  diffFlowGraphNativeChanges,
  type FlowGraphNativeChange,
  type FlowGraphRendererState,
} from './flowGraphNativeSync';

/**
 * Flow workspace's seat on the unified cross-device op-sync (task #51). This is the **policy** layer
 * that connects the pure op model ([[flowGraphNativeSync]]) and the live store (`flowStore`) to the
 * shared transport ([[projectSyncService]] + `androidLanServer` + `projectSyncClient`):
 *
 *  - **Apply (inbound):** registers a `ProjectSyncChannel` whose `applyRemote` drives
 *    `flowStore.applyRemoteFlowGraphChange` inside an **echo guard**, and whose `snapshot` exports the
 *    serializable graph for a client's seed.
 *  - **Emit (outbound):** a single passive `useFlowStore.subscribe` that diffs the serializable graph
 *    after every store change and pushes the minimal granular ops via `notifyLanProjectChange`.
 *
 * Why a passive subscription instead of threading emit through each store action: the flow graph is
 * mutated from ~a dozen code paths (drag, connect, paste, group, collapse, run-result writeback, …) and
 * the store re-normalizes nodes/edges (portals, exclusive video frames, list edges) inside `set`. Diffing
 * the *post-`set`* serializable result is the only robust seam — it captures every path and never emits a
 * transient runtime field. The diff is O(nodes+edges) and gated so it is a true no-op off a sync session.
 *
 * Echo-loop + authority safety:
 *  - `applyingRemote` suppresses the emit that our own `applyRemote` provokes (it would otherwise diff and
 *    re-broadcast the very op we just received).
 *  - `canEmit` starts true only on the phone authority. A served client stays mute until it has applied
 *    its first remote op (the seed snapshot), so it can **never push its stale local graph over the
 *    phone's** on connect — it only emits the deltas a user makes *after* it is in sync.
 *  - mid-drag changes are skipped; the drag-end commit (`dragging:false`) emits the final position only.
 */

export const FLOW_SYNC_CHANNEL = 'flow';

/** True while we are applying a remote op — the emit subscription must not re-broadcast it. */
let applyingRemote = false;
/** A served client only earns the right to emit after it has synced from the authority once. */
let canEmit = false;
/** Baseline serializable graph the subscription diffs against; null until the first observation. */
let lastGraph: FlowGraphRendererState | null = null;
let initialized = false;

/** The fully-serialized (runtime-stripped) graph — the shape the op model + diff operate on. */
function currentSerializableGraph(): FlowGraphRendererState {
  const snapshot = useFlowStore.getState().exportProjectFlowSnapshot();
  return { nodes: snapshot.nodes, edges: snapshot.edges };
}

/** Cheap predicate: does this client participate in project sync at all? Keeps non-sync sessions free. */
function isFlowSyncActive(): boolean {
  return isAndroidLanServerAvailable() || isServedLanSession();
}

const flowChannel: ProjectSyncChannel<FlowGraphNativeChange> = {
  id: FLOW_SYNC_CHANNEL,
  applyRemote(change) {
    applyingRemote = true;
    try {
      return useFlowStore.getState().applyRemoteFlowGraphChange(change);
    } finally {
      applyingRemote = false;
    }
  },
  snapshot() {
    return { type: 'flow-graph-snapshot', snapshot: useFlowStore.getState().exportProjectFlowSnapshot() };
  },
};

function handleStoreChange(): void {
  if (applyingRemote) {
    // We just synced from the authority. From now on our edits are safe to push, and the baseline must
    // track the applied state so the next user edit diffs against it (not the pre-apply graph).
    canEmit = true;
    lastGraph = currentSerializableGraph();
    return;
  }
  if (!canEmit || !isFlowSyncActive()) return;
  // Don't emit while a node is being dragged; the drag-end commit produces the single final move op.
  if (useFlowStore.getState().nodes.some((node) => node.dragging)) return;

  const next = currentSerializableGraph();
  if (lastGraph === null) {
    lastGraph = next;
    return;
  }
  const ops = diffFlowGraphNativeChanges(lastGraph, next);
  lastGraph = next;
  for (const op of ops) notifyLanProjectChange(FLOW_SYNC_CHANNEL, op);
}

/**
 * Register the Flow channel and wire its passive emit subscription. Idempotent. Called when `flowStore`
 * loads (so channel-init is tied to the Flow workspace being present, with zero app-startup cost), and
 * it asks the client to begin syncing this channel if a served session is already paired.
 */
export function initializeFlowSyncChannel(): void {
  if (initialized) return;
  initialized = true;

  registerProjectSyncChannel(flowChannel);
  // The phone authority's own edits are canonical — emit from the start. A served client earns `canEmit`
  // only after its first remote apply (the seed), so it cannot clobber the authority on connect.
  canEmit = isAndroidLanServerAvailable();
  lastGraph = currentSerializableGraph();
  useFlowStore.subscribe(handleStoreChange);

  // If we're a served+paired session, start tailing this channel now; otherwise this no-ops and the
  // post-pair `startAllRegisteredProjectChannels` picks it up.
  void ensureProjectSyncChannelStarted(FLOW_SYNC_CHANNEL);
}

/** Test-only: reset module state between cases. */
export function __resetFlowSyncChannelForTests(): void {
  applyingRemote = false;
  canEmit = false;
  lastGraph = null;
  initialized = false;
}
