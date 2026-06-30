import { isAndroidLanServerAvailable, setServedMutationPublisher } from './androidLanServer';
import {
  applySourceLibraryNativeChange,
  shouldAcceptSourceLibraryNativeVersion,
  type SourceLibraryNativeChange,
  type SourceLibraryNativeEvent,
} from './sourceLibraryNativeSync';

/**
 * Client (served-browser) side of "phone as data authority" (task #20; design
 * `docs/notes/724-shared-state-design.md`). When a desktop browser opens the app served from a phone's
 * LAN host, this module makes the browser read/sync the *phone's* projects and source library over the
 * network instead of its own (empty) origin storage.
 *
 * **Security without HTTPS.** The host serves over plain HTTP and gates `/__loom/api/*` behind a
 * pairing PIN → per-session bearer token (the phone shows the PIN; the desktop enters it once). The
 * token is carried on every API call; CORS on the host is same-origin-only. We dropped self-signed
 * TLS because it only produced browser warnings and never provided access control. See `LanAppServer`.
 *
 * **Phase A** is a read-only mirror (open the phone's projects). **Phase B** (this module's live half)
 * tails the phone's source-library change log over a long-poll stream and applies each event with the
 * shared `applySourceLibraryNativeChange` reducer — so an asset added on the phone appears in Flow,
 * Video, and Paper on the desktop — and pushes the desktop's own source-library changes back to the
 * phone via `mutate`. Project writes remain Phase C.
 */

/** Namespaced so it cannot collide with any app/provider route called `/api`. */
export const REMOTE_HOST_API_BASE = '/__loom/api';

const TOKEN_STORAGE_KEY = 'signal-loom-remote-host-token';
/** Cap a single best-effort asset upload (data-URL chars) pushed desktop → phone. */
const MAX_UPLOAD_DATA_URL_LENGTH = 12 * 1024 * 1024;

export type RemoteHostPairingState = 'unknown' | 'unpaired' | 'paired';

let servedSession = false;
let authRequired = false;
let probeCompleted = false;
let sessionToken: string | null = null;
let pairingState: RemoteHostPairingState = 'unknown';
let subscriberRunning = false;

const pairingListeners = new Set<(state: RemoteHostPairingState) => void>();

/**
 * True once a boot probe has confirmed this page is being served by a Signal Loom phone host.
 * Synchronous so the storage layers (`projectLibrary`, `assetStore`) can branch without awaiting;
 * `initializeRemoteHostSession()` resolves the probe before the app renders.
 */
export function isServedLanSession(): boolean {
  return servedSession;
}

export function isRemoteHostAuthRequired(): boolean {
  return authRequired;
}

export function getRemoteHostPairingState(): RemoteHostPairingState {
  return pairingState;
}

export function subscribeRemoteHostPairing(listener: (state: RemoteHostPairingState) => void): () => void {
  pairingListeners.add(listener);
  return () => pairingListeners.delete(listener);
}

function setPairingState(next: RemoteHostPairingState): void {
  if (pairingState === next) return;
  pairingState = next;
  for (const listener of pairingListeners) listener(next);
}

function loadStoredToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function persistToken(token: string | null): void {
  try {
    if (token) window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    else window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // storage may be unavailable; the in-memory token still works for this session
  }
}

function setToken(token: string | null): void {
  sessionToken = token;
  persistToken(token);
}

/** URL a served client should use to fetch a host-side asset blob by id. */
export function remoteHostAssetUrl(id: string): string {
  return `${REMOTE_HOST_API_BASE}/asset/${encodeURIComponent(id)}`;
}

/**
 * Ask the host to resolve a source-library item's bytes by its source-item id and return them as a
 * same-origin data URL. Covers every backing the host knows (native file / scratch / IndexedDB) — the
 * universal path for opening a served library item, since the item's own `assetUrl` may be a phone-local
 * or blob: URL the served browser can't fetch. Returns null when not a served session, unpaired, the
 * host lacks the endpoint (older APK), or the item has no resolvable bytes.
 */
export async function fetchRemoteHostSourceAssetDataUrl(itemId: string): Promise<string | null> {
  const res = await remoteHostFetch(`/source-asset/${encodeURIComponent(itemId)}`, { timeoutMs: 15_000 });
  if (!res || !res.ok) return null;
  try {
    const data = (await res.json()) as { dataUrl?: string } | null;
    return data?.dataUrl ?? null;
  } catch {
    return null;
  }
}

interface RemoteHostFetchInit extends RequestInit {
  timeoutMs?: number;
}

/**
 * Authenticated fetch against the host API. Adds the bearer token, defaults the JSON content type for
 * bodies, and on a 401 clears the (now invalid) token and flips the session to `unpaired` so the
 * pairing prompt reappears. Returns `null` only when this isn't a served session / no token is held.
 */
export async function remoteHostFetch(path: string, init: RemoteHostFetchInit = {}): Promise<Response | null> {
  if (!servedSession) return null;
  if (authRequired && !sessionToken) return null;

  const headers = new Headers(init.headers);
  if (sessionToken) headers.set('Authorization', `Bearer ${sessionToken}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  const controller = new AbortController();
  const timer = init.timeoutMs ? setTimeout(() => controller.abort(), init.timeoutMs) : null;
  try {
    const res = await fetch(`${REMOTE_HOST_API_BASE}${path}`, {
      ...init,
      headers,
      cache: 'no-store',
      signal: init.signal ?? controller.signal,
    });
    if (res.status === 401 && authRequired) {
      setToken(null);
      setPairingState('unpaired');
    }
    return res;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal, cache: 'no-store' });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Detect a served session and, if present, either seed from the phone (when already paired) or leave
 * the session `unpaired` for the pairing prompt. Safe in every runtime: no-ops instantly for native
 * Android (the phone is the authority) and Electron, and for a normal web app the probe simply fails.
 */
export async function initializeRemoteHostSession(): Promise<void> {
  if (probeCompleted) return;
  probeCompleted = true;

  if (typeof window === 'undefined') return;
  if (isAndroidLanServerAvailable()) return;
  // @ts-expect-error injected by the Electron preload
  if (window.electron) return;

  try {
    const res = await fetchWithTimeout(`${REMOTE_HOST_API_BASE}/health`, 1500);
    if (!res.ok) return;
    // A static host (e.g. sloom.studio) answers the SPA fallback with HTML, not JSON — guard on it so
    // a normal web visitor is never mistaken for a served LAN session.
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) return;
    const data = (await res.json()) as { name?: string; authRequired?: boolean } | null;
    if (!data || data.name !== 'Signal Loom') return;
    servedSession = true;
    authRequired = Boolean(data.authRequired);
  } catch {
    return;
  }

  if (!authRequired) {
    // Legacy/open host (no pairing) — behave like Phase A.
    setPairingState('paired');
    await seedAndSubscribe().catch(() => undefined);
    return;
  }

  sessionToken = loadStoredToken();
  if (sessionToken) {
    // Validate the stored token by seeding; a 401 inside flips us back to unpaired.
    await seedAndSubscribe().catch(() => undefined);
    if (sessionToken) setPairingState('paired');
  } else {
    setPairingState('unpaired');
  }
}

/**
 * Exchange the phone-displayed PIN for a session token, then seed + start the live subscriber. Called
 * by the pairing UI (`RemoteHostBanner`).
 */
export async function pairServedSession(pin: string): Promise<{ ok: boolean; error?: string }> {
  const trimmed = pin.trim();
  if (!trimmed) return { ok: false, error: 'Enter the code shown on your phone.' };

  let res: Response;
  try {
    res = await fetch(`${REMOTE_HOST_API_BASE}/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: trimmed }),
      cache: 'no-store',
    });
  } catch {
    return { ok: false, error: 'Could not reach the phone host.' };
  }

  if (res.status === 401) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    if (body?.error === 'locked') {
      return { ok: false, error: 'Too many attempts — wait a moment, then try again.' };
    }
    return { ok: false, error: 'That code didn’t match. Check the phone and retry.' };
  }
  if (!res.ok) return { ok: false, error: 'Could not reach the phone host.' };

  const body = (await res.json().catch(() => null)) as { token?: string } | null;
  if (!body?.token) return { ok: false, error: 'Pairing failed — please try again.' };

  setToken(body.token);
  setPairingState('paired');
  await seedAndSubscribe().catch(() => undefined);
  return { ok: true };
}

/**
 * Pull the phone's source-library snapshot, hydrate the local store from it (read-only seed), and
 * start tailing the live change log. Dynamic import of the (large) source-bin store keeps this module
 * free of a static dependency on it and avoids an import cycle.
 */
async function seedAndSubscribe(): Promise<void> {
  const res = await remoteHostFetch('/source-library', { timeoutMs: 5000 });
  if (!res || !res.ok) return;

  const payload = (await res.json().catch(() => null)) as
    | { snapshot?: unknown; version?: number }
    | null;
  const snapshot = payload?.snapshot;
  const version = typeof payload?.version === 'number' ? payload.version : 0;

  if (snapshot) {
    const { useSourceBinStore } = await import('../store/sourceBinStore');
    await useSourceBinStore.getState().restoreProjectSnapshot(snapshot as never, { publishNative: false });
    // `restoreProjectSnapshot` keeps a native-file item's *phone-local* `assetUrl` (an unreachable
    // `https://localhost/_capacitor_file_/…` URL on a served desktop client) and does NOT call
    // `hydrateAssets`. `hydrateAssets` carries the served-client branch that re-resolves every item's
    // bytes through the host's `/source-asset/:itemId` endpoint, so the library *thumbnails* render the
    // phone's files instead of failing with ERR_CONNECTION_REFUSED. The live subscriber only runs
    // `hydrateAssets` on a later change event, so without this the seeded thumbnails never resolve.
    await useSourceBinStore.getState().hydrateAssets().catch(() => undefined);
  }

  startSourceLibrarySubscriber(version);

  // Now that the session is paired + seeded, bring up the generic op-sync channels (Flow today; Paper/
  // Image next). Dynamic import keeps `remoteHostClient` free of a static dependency on the client loop;
  // any channel registered later (when its workspace loads) self-starts via `ensureProjectSyncChannelStarted`.
  void import('./projectSyncClient')
    .then((module) => module.startAllRegisteredProjectChannels())
    .catch(() => undefined);
}

/**
 * Long-poll the phone's source-library change log and apply each event through the shared reducer.
 * Applying via `setState` (not the public store actions) means a received event is never re-broadcast,
 * so there's no echo loop. Self-echoes of our own pushed mutations are version-deduped and idempotent.
 */
function startSourceLibrarySubscriber(initialVersion: number): void {
  if (subscriberRunning) return;
  subscriberRunning = true;
  let since = initialVersion;

  const loop = async () => {
    while (servedSession && sessionToken !== null) {
      let res: Response | null;
      try {
        res = await remoteHostFetch(`/source-library/events?since=${since}`, { timeoutMs: 35_000 });
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
        | { version?: number; events?: SourceLibraryNativeEvent[] }
        | null;
      const events = payload?.events ?? [];
      for (const event of events) {
        if (shouldAcceptSourceLibraryNativeVersion(since, event.version)) {
          await applyHostSourceLibraryEvent(event.change);
          since = event.version;
        }
      }
      if (typeof payload?.version === 'number' && payload.version > since) since = payload.version;
      if (events.length === 0) await delay(500); // guard against a non-holding host hot-looping
    }
    subscriberRunning = false;
  };

  void loop();
}

async function applyHostSourceLibraryEvent(change: SourceLibraryNativeChange): Promise<void> {
  const { useSourceBinStore } = await import('../store/sourceBinStore');
  let changed = false;
  useSourceBinStore.setState((state) => {
    const next = applySourceLibraryNativeChange(
      { bins: state.bins, dismissedSourceKeys: state.dismissedSourceKeys },
      change,
    );
    changed = next.bins !== state.bins || next.dismissedSourceKeys !== state.dismissedSourceKeys;
    return changed ? next : {};
  });
  if (changed) void useSourceBinStore.getState().hydrateAssets();
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Push a local (desktop) source-library change to the phone. For newly added items we first upload the
 * referenced asset bytes (best-effort, size-capped) so the phone can render them; then we POST the
 * change so the phone applies it and re-broadcasts it on the version log. Registered as the served
 * mutation publisher so `sourceBinStore`'s broadcast hooks reach the phone without an import cycle.
 */
function publishServedSourceLibraryMutation(change: SourceLibraryNativeChange): void {
  if (!servedSession || !sessionToken) return;
  void (async () => {
    if (change.type === 'source-bin-items-added') {
      for (const item of change.items) {
        if (item.assetId) await uploadServedSessionAsset(item.assetId).catch(() => undefined);
      }
    }
    await remoteHostFetch('/source-library/mutate', {
      method: 'POST',
      body: JSON.stringify(change),
    }).catch(() => undefined);
  })();
}

async function uploadServedSessionAsset(assetId: string): Promise<void> {
  const { loadImportedAssetAsDataUrl } = await import('./assetStore');
  // Read this browser's own copy directly (not the host) — these are desktop-origin bytes.
  const payload = await loadImportedAssetAsDataUrl(assetId).catch(() => undefined);
  if (!payload?.dataUrl || payload.dataUrl.length > MAX_UPLOAD_DATA_URL_LENGTH) return;

  const record = {
    id: payload.id,
    name: payload.name,
    mimeType: payload.mimeType,
    dataUrl: payload.dataUrl,
    createdAt: Date.now(),
  };
  await remoteHostFetch(`/asset/${encodeURIComponent(assetId)}`, {
    method: 'PUT',
    body: JSON.stringify(record),
  }).catch(() => undefined);
}

// Register the publisher seam at module load; it no-ops until a served+paired session exists.
setServedMutationPublisher(publishServedSourceLibraryMutation);
