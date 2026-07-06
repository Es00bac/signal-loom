import { Capacitor, registerPlugin } from '@capacitor/core';

import type { SourceLibraryNativeChange } from './sourceLibraryNativeSync';
import {
  getHostSourceLibraryVersion,
  recordHostSourceLibraryChange,
  waitForHostSourceLibraryEvents,
} from './lanHostService';
import {
  getHostProjectSyncAsset,
  getProjectSyncChannel,
  getProjectSyncVersion,
  recordProjectSyncAsset,
  recordProjectSyncChange,
  waitForProjectSyncEvents,
  type ProjectSyncChannelId,
} from './projectSyncService';
import { getEditLockState, type EditLockDevice } from './projectEditLock';
import { hostClaim, hostForceClaim, hostHeartbeat, hostRelease, hostYield } from './editLockHost';

/**
 * Bridge to the native SignalLoomLanServer plugin, which serves the bundled web app over the local
 * network so a desktop browser on the same Wi-Fi can open the full Sloom Studio interface from the
 * phone. The served app runs in plain web mode (no Capacitor bridge), like the Chrome build.
 *
 * Served over plain HTTP; the data API is secured by a pairing PIN → bearer token (see
 * `LanAppServer.java` and `remoteHostClient.ts`), not HTTPS.
 */
export interface SignalLoomLanServerStatus {
  running: boolean;
  port: number;
  ip: string;
  /** Pairing code shown on the phone; a served desktop browser enters it once to get a session token. */
  pin: string;
  url: string | null;
}

export interface SignalLoomLanServerPlugin {
  start(options: { port?: number; pin?: string }): Promise<SignalLoomLanServerStatus>;
  stop(): Promise<SignalLoomLanServerStatus>;
  status(): Promise<SignalLoomLanServerStatus>;
  respond(options: { id: string; data: string }): Promise<void>;
  addListener(
    eventName: 'lanRequest',
    listenerFunc: (req: { id: string; method: string; path: string; body?: string }) => void,
  ): Promise<{ remove: () => void }>;
}

/** Default port the phone serves the desktop app on. */
export const SIGNAL_LOOM_LAN_SERVER_DEFAULT_PORT = 8723;

/** How long the phone holds a long-poll open before a heartbeat — kept under the native relay latch. */
const SOURCE_LIBRARY_LONG_POLL_MS = 25_000;

/** Same heartbeat budget for the generic per-channel `/project/*` long-poll (Flow/Paper/Image/…). */
const PROJECT_LONG_POLL_MS = 25_000;

const SIGNAL_LOOM_LAN_SERVER_PLUGIN_KEY = '__signalLoomLanServerPlugin';

function getSignalLoomLanServerPlugin(): SignalLoomLanServerPlugin {
  const globalState = globalThis as typeof globalThis & {
    [SIGNAL_LOOM_LAN_SERVER_PLUGIN_KEY]?: SignalLoomLanServerPlugin;
  };
  const cachedPlugin = globalState[SIGNAL_LOOM_LAN_SERVER_PLUGIN_KEY];
  if (cachedPlugin) {
    return cachedPlugin;
  }
  const plugin = registerPlugin<SignalLoomLanServerPlugin>('SignalLoomLanServer');
  globalState[SIGNAL_LOOM_LAN_SERVER_PLUGIN_KEY] = plugin;
  return plugin;
}

/** True only in the native Android app, where the embedded LAN server exists. */
export function isAndroidLanServerAvailable(): boolean {
  return Capacitor.getPlatform() === 'android';
}

/** Start serving the app on the LAN; resolves with the URL + pairing PIN a desktop browser needs. */
export async function startAndroidLanServer(
  port = SIGNAL_LOOM_LAN_SERVER_DEFAULT_PORT,
  pin = '',
): Promise<SignalLoomLanServerStatus | null> {
  if (!isAndroidLanServerAvailable()) return null;
  try {
    return await getSignalLoomLanServerPlugin().start({ port, pin });
  } catch {
    return null;
  }
}

/** Stop serving the app on the LAN. */
export async function stopAndroidLanServer(): Promise<SignalLoomLanServerStatus | null> {
  if (!isAndroidLanServerAvailable()) return null;
  try {
    return await getSignalLoomLanServerPlugin().stop();
  } catch {
    return null;
  }
}

/** Current LAN-server state (running / url / ip / port / pin), or null when unavailable. */
export async function getAndroidLanServerStatus(): Promise<SignalLoomLanServerStatus | null> {
  if (!isAndroidLanServerAvailable()) return null;
  try {
    return await getSignalLoomLanServerPlugin().status();
  } catch {
    return null;
  }
}

let isLanProxyInitialized = false;

interface LanProxyHandlers {
  getProjects?: () => Promise<unknown>;
  getProject?: (id: string) => Promise<unknown>;
  getSourceLibrary?: () => Promise<unknown>;
  getAsset?: (id: string) => Promise<unknown>;
  /**
   * Resolve a source-library item's bytes by its *source-item* id (not assetId), via the universal
   * `loadItemAsDataUrl` resolver. Unlike `getAsset` (IndexedDB only), this serves native-file- and
   * scratch-backed items too — the bytes a served browser can't reach through the item's phone-local
   * `assetUrl`. Returns a same-origin `{ dataUrl }` (or null when the item/bytes are unavailable).
   */
  getSourceAsset?: (itemId: string) => Promise<unknown>;
  /** Phase B: apply a source-library mutation pushed by a served client to the phone's live store. */
  applySourceLibraryMutation?: (change: SourceLibraryNativeChange) => Promise<void>;
  /** Phase B: store an asset blob (data-URL record) uploaded by a served client. Additive only. */
  putAsset?: (id: string, record: unknown) => Promise<void>;
}
const proxyHandlers: LanProxyHandlers = {};

/**
 * The namespaced data API the phone host answers for served desktop browsers (task #20; see
 * `docs/notes/724-shared-state-design.md`, `remoteHostClient.ts`). Phase A is a read-only mirror;
 * Phase B adds live source-library sync (`/source-library/events` long-poll + `/source-library/mutate`)
 * and additive asset upload (`PUT /asset/:id`). Project writes remain out of scope until Phase C, so a
 * served session still cannot clobber the phone's project.
 */
const REMOTE_HOST_API_BASE = '/__loom/api';

/**
 * Register the phone-side handlers that service the mirror/sync API. Called once each from
 * `projectLibrary` (projects), `assetStore` (assets), and `sourceBinStore` (source-library + mutate);
 * the handler maps are merged so every store contributes only what it owns.
 */
export function initializeLanServerProxy(handlers: LanProxyHandlers) {
  if (!isAndroidLanServerAvailable()) return;
  Object.assign(proxyHandlers, handlers);

  if (isLanProxyInitialized) return;
  isLanProxyInitialized = true;

  getSignalLoomLanServerPlugin().addListener('lanRequest', async (req) => {
    try {
      const result = await resolveLanRequest(req);
      await getSignalLoomLanServerPlugin().respond({
        id: req.id,
        data: JSON.stringify(result ?? null),
      });
    } catch (err) {
      console.error('LAN Server Proxy Error:', err);
      await getSignalLoomLanServerPlugin().respond({
        id: req.id,
        data: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      });
    }
  });
}

/**
 * Map an incoming relayed request (already authenticated by the native layer) to a host handler.
 * Exported for tests (e.g. the baton write-gate); production callers go through the relay listener.
 */
export async function resolveLanRequest(req: { method: string; path: string; body?: string }): Promise<unknown> {
  const [rawPath, queryString = ''] = req.path.split('?');
  const path = rawPath;

  if (req.method === 'GET') {
    if (path === `${REMOTE_HOST_API_BASE}/projects`) {
      return proxyHandlers.getProjects ? await proxyHandlers.getProjects() : [];
    }
    if (path.startsWith(`${REMOTE_HOST_API_BASE}/projects/`)) {
      const id = decodeURIComponent(path.slice(`${REMOTE_HOST_API_BASE}/projects/`.length));
      return proxyHandlers.getProject ? await proxyHandlers.getProject(id) : null;
    }
    if (path === `${REMOTE_HOST_API_BASE}/source-library`) {
      return proxyHandlers.getSourceLibrary ? await proxyHandlers.getSourceLibrary() : null;
    }
    if (path === `${REMOTE_HOST_API_BASE}/source-library/events`) {
      const since = Number(new URLSearchParams(queryString).get('since') ?? 0);
      return waitForHostSourceLibraryEvents(since, SOURCE_LIBRARY_LONG_POLL_MS);
    }
    if (path.startsWith(`${REMOTE_HOST_API_BASE}/source-asset/`)) {
      const itemId = decodeURIComponent(path.slice(`${REMOTE_HOST_API_BASE}/source-asset/`.length));
      return proxyHandlers.getSourceAsset ? await proxyHandlers.getSourceAsset(itemId) : null;
    }
    if (path.startsWith(`${REMOTE_HOST_API_BASE}/asset/`)) {
      const id = decodeURIComponent(path.slice(`${REMOTE_HOST_API_BASE}/asset/`.length));
      return proxyHandlers.getAsset ? await proxyHandlers.getAsset(id) : null;
    }
    if (path === `${REMOTE_HOST_API_BASE}/lock`) {
      // Current cross-device edit-baton state (memory: cross-device-sync-baton-model). The live stream
      // is the `edit-lock` slice of the project-sync log below; this is a one-shot read.
      return { state: getEditLockState() };
    }

    // Out-of-band channel asset fetch (task #53): `GET /project/:channel/asset/:assetId`. Pixels that
    // are too large for the JSON op stream (a layer's OffscreenCanvas) ride here, content-addressed by
    // `layerId@bitmapVersion`, so a receiver fetches a version only once. Checked before the 2-segment
    // channel route below, which it can't match (this path has 3 segments).
    const assetRoute = parseProjectAssetRoute(path);
    if (assetRoute) {
      return { asset: getHostProjectSyncAsset(assetRoute.channel, assetRoute.assetId) };
    }

    // Generic op-sync channels (task #51+): `/project/:channel/{snapshot,events}`. The phone is the
    // authority; a registered channel (e.g. Flow) supplies the snapshot, and the shared monotonic log
    // (filtered to this channel) supplies the long-poll stream every workspace rides identically.
    const route = parseProjectChannelRoute(path);
    if (route?.action === 'snapshot') {
      const channel = getProjectSyncChannel(route.channel);
      const snapshot = channel ? await channel.snapshot() : null;
      return { snapshot, version: getProjectSyncVersion() };
    }
    if (route?.action === 'events') {
      const since = Number(new URLSearchParams(queryString).get('since') ?? 0);
      return waitForProjectSyncEvents(since, PROJECT_LONG_POLL_MS, route.channel);
    }
    return null;
  }

  if (req.method === 'POST' && path === `${REMOTE_HOST_API_BASE}/source-library/mutate`) {
    const change = parseJsonBody<SourceLibraryNativeChange>(req.body);
    if (change && proxyHandlers.applySourceLibraryMutation) {
      await proxyHandlers.applySourceLibraryMutation(change);
    }
    return { ok: true, version: getHostSourceLibraryVersion() };
  }

  // Generic op-sync mutate: a served client pushes a channel op. The phone applies it to its own live
  // store (via the registered channel's non-broadcasting `applyRemote`) AND records it on the shared
  // log so every *other* served client tails it. The pusher's own op echoes back idempotently.
  {
    const route = req.method === 'POST' ? parseProjectChannelRoute(path) : null;
    if (route?.action === 'mutate') {
      // Baton write-gate (defense-in-depth behind the Stage-3 read-only UI; memory:
      // cross-device-sync-baton-model). A served client may push workspace ops only while it holds the edit
      // baton. The actor id rides in the query string — the relay forwards no headers (the same constraint
      // that puts the device in the lock-action bodies). When the baton is free/unmanaged (holder == null)
      // writes pass untouched: a single-device or pre-claim session is never gated. This is the backstop
      // for the UI gate, not its replacement — a rejected op is dropped, so the read-only overlay (which
      // stops the user before they edit) remains the primary protection.
      const { holder } = getEditLockState();
      if (holder && new URLSearchParams(queryString).get('device') !== holder.id) {
        return { ok: false, error: 'edit-locked', state: getEditLockState(), version: getProjectSyncVersion() };
      }
      const change = parseJsonBody<unknown>(req.body);
      const channel = getProjectSyncChannel(route.channel);
      if (change != null && channel) {
        await channel.applyRemote(change);
        recordProjectSyncChange(route.channel, change);
      }
      return { ok: true, version: getProjectSyncVersion() };
    }
  }

  if (req.method === 'PUT' && path.startsWith(`${REMOTE_HOST_API_BASE}/asset/`)) {
    const id = decodeURIComponent(path.slice(`${REMOTE_HOST_API_BASE}/asset/`.length));
    const record = parseJsonBody<unknown>(req.body);
    if (record && proxyHandlers.putAsset) {
      await proxyHandlers.putAsset(id, record);
    }
    return { ok: true };
  }

  // Out-of-band channel asset upload (task #53): a served client PUTs a layer's encoded pixels here
  // (content-addressed by `layerId@bitmapVersion`) just before publishing the pixel-pointer op, so the
  // phone can serve them to every other client. Body: `{ asset: <base64 data URL> }`.
  if (req.method === 'PUT') {
    const assetRoute = parseProjectAssetRoute(path.split('?')[0]);
    if (assetRoute) {
      const body = parseJsonBody<{ asset?: string }>(req.body);
      if (typeof body?.asset === 'string') {
        recordProjectSyncAsset(assetRoute.channel, assetRoute.assetId, body.asset);
      }
      return { ok: true };
    }
  }

  // Edit-baton control plane (memory: cross-device-sync-baton-model). A served client POSTs its action
  // here with `{ device }` in the body — the relay does NOT forward headers, so the actor's identity
  // must ride in the body. Each handler mutates the host-authoritative baton (which broadcasts the new
  // state over the `edit-lock` project-sync channel) and echoes the resulting state to the caller.
  if (req.method === 'POST' && path.startsWith(`${REMOTE_HOST_API_BASE}/lock/`)) {
    const action = path.slice(`${REMOTE_HOST_API_BASE}/lock/`.length);
    const parsed = parseJsonBody<{ device?: EditLockDevice }>(req.body);
    const device = parsed?.device;
    if (!device || typeof device.id !== 'string' || typeof device.label !== 'string') {
      return { ok: false, error: 'invalid-device' };
    }
    switch (action) {
      case 'claim': {
        const result = hostClaim(device);
        return { ok: true, granted: result.granted, state: result.state };
      }
      case 'force': {
        const result = hostForceClaim(device);
        return { ok: true, granted: result.granted, state: result.state };
      }
      case 'yield':
        return { ok: true, state: hostYield(device) };
      case 'release':
        return { ok: true, state: hostRelease(device) };
      case 'heartbeat':
        return { ok: true, state: hostHeartbeat(device) };
      default:
        return { ok: false, error: 'unknown-lock-action' };
    }
  }

  return null;
}

function parseJsonBody<T>(body: string | undefined): T | null {
  if (!body) return null;
  try {
    return JSON.parse(body) as T;
  } catch {
    return null;
  }
}

/**
 * Parse a generic op-sync path `/__loom/api/project/:channel/:action` into its channel id + action
 * (`snapshot` | `events` | `mutate`). Returns null for any non-`/project/` path or a malformed one, so
 * the existing source-library/asset routes are never shadowed.
 */
function parseProjectChannelRoute(
  path: string,
): { channel: ProjectSyncChannelId; action: string } | null {
  const prefix = `${REMOTE_HOST_API_BASE}/project/`;
  if (!path.startsWith(prefix)) return null;
  const segments = path.slice(prefix.length).split('/');
  if (segments.length !== 2) return null;
  const channel = decodeURIComponent(segments[0]);
  const action = segments[1];
  if (!channel || !action) return null;
  return { channel, action };
}

/**
 * Parse an out-of-band asset path `/__loom/api/project/:channel/asset/:assetId` into its channel id +
 * content-addressed asset id (task #53). Three segments where the middle is the literal `asset`, so it
 * never collides with the 2-segment `{snapshot,events,mutate}` channel routes above.
 */
function parseProjectAssetRoute(
  path: string,
): { channel: ProjectSyncChannelId; assetId: string } | null {
  const prefix = `${REMOTE_HOST_API_BASE}/project/`;
  if (!path.startsWith(prefix)) return null;
  const segments = path.slice(prefix.length).split('/');
  if (segments.length !== 3 || segments[1] !== 'asset') return null;
  const channel = decodeURIComponent(segments[0]);
  const assetId = decodeURIComponent(segments[2]);
  if (!channel || !assetId) return null;
  return { channel, assetId };
}

/**
 * Publisher a served client registers so a source-library change it makes is pushed to the phone.
 * Kept as a registration seam (not a direct import) so `androidLanServer` never depends on
 * `remoteHostClient`, avoiding an import cycle.
 */
type ServedMutationPublisher = (change: SourceLibraryNativeChange) => void;
let servedMutationPublisher: ServedMutationPublisher | null = null;

export function setServedMutationPublisher(publisher: ServedMutationPublisher | null): void {
  servedMutationPublisher = publisher;
}

/**
 * Route a local source-library change into the LAN channel. On the phone (authority) it is recorded
 * as the next version so served clients tail it; on a served client it is pushed to the phone via the
 * registered publisher. A no-op on a normal web/desktop session. Called from the source-bin broadcast
 * hooks in `sourceBinStore`.
 */
export function notifyLanSourceLibraryChange(change: SourceLibraryNativeChange): void {
  if (isAndroidLanServerAvailable()) {
    recordHostSourceLibraryChange(change);
    return;
  }
  servedMutationPublisher?.(change);
}

/**
 * Generic version of {@link setServedMutationPublisher} for the workspace-agnostic op-sync channels
 * (task #51+). A served client registers one publisher that routes `(channel, change)` to the right
 * `POST /project/:channel/mutate`. Registration seam (not a direct import) so `androidLanServer` stays
 * free of a `projectSyncClient` dependency, mirroring the source-library publisher.
 */
type ServedProjectMutationPublisher = (channel: ProjectSyncChannelId, change: unknown) => void;
let servedProjectMutationPublisher: ServedProjectMutationPublisher | null = null;

export function setServedProjectMutationPublisher(publisher: ServedProjectMutationPublisher | null): void {
  servedProjectMutationPublisher = publisher;
}

/**
 * Route a local op on any project-sync channel into the LAN. On the phone (authority) it is recorded as
 * the next version on the shared monotonic log so every served client tails it; on a served client it is
 * pushed to the phone via the registered publisher. A no-op on a normal web/desktop session. Called from
 * each workspace's emit seam (e.g. `flowSyncChannel`).
 */
export function notifyLanProjectChange(channel: ProjectSyncChannelId, change: unknown): void {
  if (isAndroidLanServerAvailable()) {
    recordProjectSyncChange(channel, change);
    return;
  }
  servedProjectMutationPublisher?.(channel, change);
}
