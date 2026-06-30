import { isAndroidLanServerAvailable } from './androidLanServer';
import { getHostProjectSyncAsset, recordProjectSyncAsset, type ProjectSyncChannelId } from './projectSyncService';
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
