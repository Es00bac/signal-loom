import { Capacitor } from '@capacitor/core';
import { getSignalLoomNativeBridge } from './nativeApp';

export interface RemoteMediaBytes {
  dataUrl: string;
  mimeType?: string;
}

interface CapacitorHttpResponse {
  status: number;
  data: unknown;
  headers?: Record<string, string>;
}

interface CapacitorHttpPlugin {
  get(options: { url: string; responseType?: string }): Promise<CapacitorHttpResponse>;
}

export type ElectronRemoteMediaDownloader = (
  url: string,
) => Promise<{ base64?: string; mimeType?: string; error?: string } | null>;

export interface RemoteMediaFetchRuntime {
  isAndroidNative?: boolean;
  capacitorHttp?: CapacitorHttpPlugin;
  electronDownload?: ElectronRemoteMediaDownloader;
}

function headerValue(headers: Record<string, string> | undefined, name: string): string | undefined {
  if (!headers) {
    return undefined;
  }

  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lower) {
      return value;
    }
  }

  return undefined;
}

function normalizeMimeType(value: string | undefined, fallback = 'application/octet-stream'): string {
  const trimmed = value?.split(';', 1)[0]?.trim();
  return trimmed || fallback;
}

function resolveDefaultRuntime(): RemoteMediaFetchRuntime {
  let isAndroidNative = false;
  let capacitorHttp: CapacitorHttpPlugin | undefined;

  try {
    isAndroidNative = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
    const plugins = (Capacitor as unknown as { Plugins?: Record<string, unknown> }).Plugins;
    capacitorHttp = plugins?.CapacitorHttp as CapacitorHttpPlugin | undefined;
  } catch {
    isAndroidNative = false;
    capacitorHttp = undefined;
  }

  const electronDownload = getSignalLoomNativeBridge()?.downloadRemoteMedia;

  return { isAndroidNative, capacitorHttp, electronDownload };
}

/**
 * Download a remote media URL through a path that is NOT subject to the
 * renderer's CORS policy and that ignores `Content-Disposition: attachment`,
 * returning an inline data URL the renderer can display and persist.
 *
 * Provider result CDNs (Atlas `atlas-media.*.aliyuncs.com` / `static.atlascloud.ai`,
 * BFL `delivery.bfl.ai`, …) send no CORS headers AND force-download, so a
 * renderer `fetch()` is blocked *and* an `<img src>` of the raw URL refuses to
 * render. The Electron main process (`net.fetch`) and the Android
 * `CapacitorHttp` plugin are not CORS-bound and return the raw bytes.
 *
 * Returns `undefined` when no native download path is available (plain web/dev),
 * so callers can fall back to their own behaviour.
 */
export async function fetchRemoteMediaAsDataUrl(
  url: string,
  runtime: RemoteMediaFetchRuntime = resolveDefaultRuntime(),
): Promise<RemoteMediaBytes | undefined> {
  if (!/^https?:\/\//i.test(url)) {
    return undefined;
  }

  if (runtime.electronDownload) {
    try {
      const result = await runtime.electronDownload(url);
      if (result && result.base64 && !result.error) {
        const mimeType = normalizeMimeType(result.mimeType);
        return { dataUrl: `data:${mimeType};base64,${result.base64}`, mimeType };
      }
    } catch {
      // Fall through to other strategies.
    }
  }

  if (runtime.isAndroidNative && runtime.capacitorHttp) {
    try {
      const response = await runtime.capacitorHttp.get({ url, responseType: 'blob' });
      if (
        response.status >= 200 &&
        response.status < 300 &&
        typeof response.data === 'string' &&
        response.data.length > 0
      ) {
        const mimeType = normalizeMimeType(headerValue(response.headers, 'content-type'));
        return { dataUrl: `data:${mimeType};base64,${response.data}`, mimeType };
      }
    } catch {
      // Fall through.
    }
  }

  return undefined;
}
