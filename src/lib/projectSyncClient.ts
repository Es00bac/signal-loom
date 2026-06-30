import { setServedProjectMutationPublisher } from './androidLanServer';
import { getLocalDevice } from './deviceIdentity';
import { isServedLanSession, remoteHostFetch } from './remoteHostClient';
import {
  getProjectSyncChannel,
  getRegisteredProjectSyncChannelIds,
  type ProjectSyncChannelId,
  type ProjectSyncEvent,
} from './projectSyncService';

/**
 * Generic served-client half of the unified op-sync (task #51+). The source library still runs its own
 * bespoke seed/subscribe in [[remoteHostClient]]; this is the **workspace-agnostic** loop that drives
 * every *registered* channel (Flow today; Paper/Image next) over the `/project/:channel/*` transport:
 *
 *  - **seed** `GET /project/:channel/snapshot` → `channel.applyRemote(snapshot-op)`,
 *  - **subscribe** long-poll `GET /project/:channel/events?since=N` → `channel.applyRemote(event.change)`,
 *  - **publish** `notifyLanProjectChange` → `POST /project/:channel/mutate` (registered seam below).
 *
 * All applies go through the channel's `applyRemote`, which is non-broadcasting (the echo-loop rule lives
 * in each channel, e.g. `flowSyncChannel`'s guard). Ops are id-addressed + idempotent, so a self-echoed
 * mutation is a no-op. No websocket/SSE — long-poll only (lan-host-security-and-sync).
 */

const startedChannels = new Set<ProjectSyncChannelId>();

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Pull the channel's snapshot and apply it as the seed. Returns the authority version, or -1 on failure. */
async function seedChannel(channelId: ProjectSyncChannelId): Promise<number> {
  const res = await remoteHostFetch(`/project/${encodeURIComponent(channelId)}/snapshot`, { timeoutMs: 8000 });
  if (!res || !res.ok) return -1;

  const payload = (await res.json().catch(() => null)) as { snapshot?: unknown; version?: number } | null;
  if (!payload) return -1;
  const version = typeof payload.version === 'number' ? payload.version : 0;

  const channel = getProjectSyncChannel(channelId);
  if (channel && payload.snapshot != null) {
    await channel.applyRemote(payload.snapshot);
  }
  return version;
}

/** Long-poll the channel's slice of the shared log and apply each op through the channel's reducer. */
function startSubscriber(channelId: ProjectSyncChannelId, initialVersion: number): void {
  let since = initialVersion;
  const loop = async () => {
    while (isServedLanSession()) {
      let res: Response | null;
      try {
        res = await remoteHostFetch(`/project/${encodeURIComponent(channelId)}/events?since=${since}`, {
          timeoutMs: 35_000,
        });
      } catch {
        await delay(3000);
        continue;
      }
      if (!res) break; // token cleared (unpaired)
      if (!res.ok) {
        await delay(3000);
        continue;
      }

      const payload = (await res.json().catch(() => null)) as
        | { version?: number; events?: ProjectSyncEvent[] }
        | null;
      const events = payload?.events ?? [];
      const channel = getProjectSyncChannel(channelId);
      for (const event of events) {
        if (event.version > since) {
          if (channel) await channel.applyRemote(event.change);
          since = event.version;
        }
      }
      if (typeof payload?.version === 'number' && payload.version > since) since = payload.version;
      if (events.length === 0) await delay(500); // guard against a non-holding host hot-looping
    }
    startedChannels.delete(channelId); // allow a clean restart on a later session
  };
  void loop();
}

/**
 * Begin syncing one registered channel if this is a served session and it isn't already running.
 * Idempotent. A seed failure (e.g. not yet paired → no token) is released so a later trigger can retry.
 */
export async function ensureProjectSyncChannelStarted(channelId: ProjectSyncChannelId): Promise<void> {
  if (!isServedLanSession()) return;
  if (startedChannels.has(channelId)) return;
  startedChannels.add(channelId);

  const version = await seedChannel(channelId);
  if (version < 0) {
    startedChannels.delete(channelId);
    return;
  }
  startSubscriber(channelId, version);
}

/** Start every channel registered so far. Called once a served session pairs + seeds. */
export function startAllRegisteredProjectChannels(): void {
  for (const id of getRegisteredProjectSyncChannelIds()) {
    void ensureProjectSyncChannelStarted(id);
  }
}

/**
 * Push a local op on `channel` to the phone. No-ops off a served session. The actor device id rides in
 * the query string so the host's baton write-gate can reject ops from a non-holder (the relay forwards no
 * headers); a rejected push is silently dropped — the read-only UI is what actually stops the user editing.
 */
function publishProjectMutation(channel: ProjectSyncChannelId, change: unknown): void {
  if (!isServedLanSession()) return;
  const device = encodeURIComponent(getLocalDevice().id);
  void remoteHostFetch(`/project/${encodeURIComponent(channel)}/mutate?device=${device}`, {
    method: 'POST',
    body: JSON.stringify(change),
  }).catch(() => undefined);
}

/** Test-only: forget which channels have started so a fresh session can re-seed. */
export function __resetProjectSyncClientForTests(): void {
  startedChannels.clear();
}

// Register the served publisher seam at module load; it no-ops until a served+paired session exists.
setServedProjectMutationPublisher(publishProjectMutation);
