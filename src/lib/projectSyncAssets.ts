import { isAndroidLanServerAvailable } from './androidLanServer';
import {
  getHostProjectSyncAsset,
  recordProjectSyncAsset,
  retainProjectSyncAssets,
  type ProjectSyncChannelId,
} from './projectSyncService';
import { isServedLanSession, remoteHostFetch } from './remoteHostClient';

/**
 * Out-of-band binary transport for channel payloads too large for the JSON op stream — the Image
 * channel's layer pixels (task #53). Content-addressed by `${layerId}@${bitmapVersion}`. Role-branched
 * exactly like {@link notifyLanProjectChange}:
 *
 *  - **phone authority** → read/write the host-local cache directly (same process, no network),
 *  - **served client** → `PUT`/`GET /project/:channel/asset/:assetId` over the plain-HTTP relay,
 *  - **any other session** (normal web/desktop) → no-op (`get` returns null), so non-sync sessions
 *    never touch the network.
 *
 * The address is the content version, so an asset is immutable once stored and a receiver fetches a
 * given `layerId@version` at most once — re-seeding or a self-echoed op costs no extra bytes.
 */

const assetPath = (channel: ProjectSyncChannelId, assetId: string): string =>
  `/project/${encodeURIComponent(channel)}/asset/${encodeURIComponent(assetId)}`;

const assetInventoryPath = (channel: ProjectSyncChannelId): string =>
  `/project/${encodeURIComponent(channel)}/assets`;

/**
 * Declare a channel's complete immutable inventory before uploading it. The authority pins these
 * hashes together, so a workspace with more than the generic cache tail cannot evict its own first
 * records before the final envelope becomes visible.
 */
export async function prepareVerifiedProjectSyncAssets(
  channel: ProjectSyncChannelId,
  assetIds: readonly string[],
): Promise<boolean> {
  if (isAndroidLanServerAvailable()) {
    retainProjectSyncAssets(channel, assetIds);
    return true;
  }
  if (!isServedLanSession()) return false;
  try {
    const response = await remoteHostFetch(assetInventoryPath(channel), {
      method: 'PUT',
      body: JSON.stringify({ assetIds }),
    });
    return Boolean(response?.ok);
  } catch {
    return false;
  }
}

/** Make a layer's encoded pixels (a base64 PNG data URL) available to other devices on this channel. */
export async function putProjectSyncAsset(
  channel: ProjectSyncChannelId,
  assetId: string,
  dataUrl: string,
): Promise<void> {
  if (isAndroidLanServerAvailable()) {
    recordProjectSyncAsset(channel, assetId, dataUrl);
    return;
  }
  if (!isServedLanSession()) return;
  await remoteHostFetch(assetPath(channel, assetId), {
    method: 'PUT',
    body: JSON.stringify({ asset: dataUrl }),
  }).catch(() => undefined);
}

/**
 * Store an asset and report whether the authority acknowledged it. Metadata-first channels such as
 * Paper must not publish references after a best-effort upload: a false result keeps the entire
 * workspace envelope deferred. The historical void helper above remains for Image's retry-tolerant
 * pixel stream.
 */
export async function putVerifiedProjectSyncAsset(
  channel: ProjectSyncChannelId,
  assetId: string,
  dataUrl: string,
): Promise<boolean> {
  if (isAndroidLanServerAvailable()) {
    recordProjectSyncAsset(channel, assetId, dataUrl);
    return true;
  }
  if (!isServedLanSession()) return false;
  try {
    const response = await remoteHostFetch(assetPath(channel, assetId), {
      method: 'PUT',
      body: JSON.stringify({ asset: dataUrl }),
    });
    return Boolean(response?.ok);
  } catch {
    return false;
  }
}

/** Fetch a content-addressed asset's bytes (base64 PNG data URL), or null if unavailable. */
export async function getProjectSyncAsset(
  channel: ProjectSyncChannelId,
  assetId: string,
): Promise<string | null> {
  if (isAndroidLanServerAvailable()) {
    return getHostProjectSyncAsset(channel, assetId);
  }
  if (!isServedLanSession()) return null;
  let res: Response | null;
  try {
    res = await remoteHostFetch(assetPath(channel, assetId), { timeoutMs: 15_000 });
  } catch {
    return null;
  }
  if (!res || !res.ok) return null;
  const body = (await res.json().catch(() => null)) as { asset?: string | null } | null;
  return body?.asset ?? null;
}
