import { Capacitor } from '@capacitor/core';
import { getSignalLoomNativeBridge } from './nativeApp';
import { createAbortError, isAbortError, raceWithAbort, throwIfAborted } from './abortSignals';

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
  cancellationId?: string,
) => Promise<{ base64?: string; mimeType?: string; error?: string } | null>;

export interface RemoteMediaFetchRuntime {
  isAndroidNative?: boolean;
  capacitorHttp?: CapacitorHttpPlugin;
  electronDownload?: ElectronRemoteMediaDownloader;
  electronCancelDownload?: (cancellationId: string) => Promise<{ cancelled?: boolean }>;
}

let nativeDownloadSequence = 0;

function createNativeDownloadCancellationId(): string {
  nativeDownloadSequence += 1;
  return `flow-media-${Date.now()}-${nativeDownloadSequence}`;
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

  const bridge = getSignalLoomNativeBridge();
  const electronDownload = bridge?.downloadRemoteMedia;
  const electronCancelDownload = bridge?.cancelRemoteMediaDownload;

  return { isAndroidNative, capacitorHttp, electronDownload, electronCancelDownload };
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
  signal?: AbortSignal,
): Promise<RemoteMediaBytes | undefined> {
  throwIfAborted(signal);
  if (!/^https?:\/\//i.test(url)) {
    return undefined;
  }

  if (runtime.electronDownload) {
    const cancellationId = signal && runtime.electronCancelDownload
      ? createNativeDownloadCancellationId()
      : undefined;
    let cancellationSent = false;
    const cancelNativeDownload = () => {
      if (!cancellationId || cancellationSent) return;
      cancellationSent = true;
      void runtime.electronCancelDownload?.(cancellationId).catch(() => undefined);
    };
    signal?.addEventListener('abort', cancelNativeDownload, { once: true });
    try {
      const result = await raceWithAbort(
        cancellationId
          ? runtime.electronDownload(url, cancellationId)
          : runtime.electronDownload(url),
        signal,
      );
      if (result && result.base64 && !result.error) {
        const mimeType = normalizeMimeType(result.mimeType);
        return { dataUrl: `data:${mimeType};base64,${result.base64}`, mimeType };
      }
    } catch (error) {
      if (isAbortError(error)) throw error;
      if (signal?.aborted) throw createAbortError();
      // Fall through to other strategies.
    } finally {
      signal?.removeEventListener('abort', cancelNativeDownload);
    }
  }

  if (runtime.isAndroidNative && runtime.capacitorHttp) {
    try {
      const response = await raceWithAbort(runtime.capacitorHttp.get({ url, responseType: 'blob' }), signal);
      if (
        response.status >= 200 &&
        response.status < 300 &&
        typeof response.data === 'string' &&
        response.data.length > 0
      ) {
        const mimeType = normalizeMimeType(headerValue(response.headers, 'content-type'));
        return { dataUrl: `data:${mimeType};base64,${response.data}`, mimeType };
      }
    } catch (error) {
      if (isAbortError(error)) throw error;
      if (signal?.aborted) throw createAbortError();
      // Fall through.
    }
  }

  return undefined;
}

function base64DataUrlToBlob(dataUrl: string, fallbackMimeType = 'application/octet-stream'): Blob {
  const comma = dataUrl.indexOf(',');
  const mimeType = comma > 5 ? dataUrl.slice(5, comma).split(';', 1)[0] || fallbackMimeType : fallbackMimeType;
  const binary = atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes as BlobPart], { type: mimeType });
}

/**
 * Download a provider *result* image as a Blob through a path that survives the Android WebView.
 *
 * Provider result CDNs (Atlas `aliyuncs`/`static.atlascloud.ai`, BFL `delivery.bfl.ai`, …) serve
 * **signed** URLs and send no CORS headers. A renderer `fetch()` works on desktop (Electron
 * bypasses CORS), but on Android — where CapacitorHttp patches `fetch` and routes GETs through a
 * proxy URL — the signed query string gets re-encoded and the CDN rejects it (**HTTP 403**).
 * `fetchRemoteMediaAsDataUrl` pulls the bytes through a direct, non-proxied native GET
 * (`CapacitorHttp.get` / Electron `net.fetch`) that preserves the URL untouched. This mirrors
 * flowExecution's `materializeRemoteMediaResult` for the Image-editor adapters.
 */
export async function fetchProviderResultBlob(
  url: string,
  errorLabel: string,
  signal?: AbortSignal,
  runtime?: RemoteMediaFetchRuntime,
): Promise<Blob> {
  if (/^(blob:|data:)/i.test(url)) {
    const response = await fetch(url, { signal });
    if (!response.ok) {
      throw new Error(`${errorLabel} (${response.status}).`);
    }
    return response.blob();
  }

  // Try the renderer fetch first — succeeds on desktop and on permissive-CORS web. On Android this
  // hits the CapacitorHttp proxy and a signed CDN URL comes back 403; we then fall through.
  try {
    const response = await fetch(url, { signal });
    if (response.ok) {
      return await response.blob();
    }
  } catch (error) {
    if (isAbortError(error)) throw error;
    if (signal?.aborted) throw createAbortError();
    // CORS / network error — fall through to the native path.
  }

  const native = runtime ? await fetchRemoteMediaAsDataUrl(url, runtime, signal) : await fetchRemoteMediaAsDataUrl(url, undefined, signal);
  if (native) {
    return base64DataUrlToBlob(native.dataUrl, native.mimeType);
  }

  throw new Error(`${errorLabel}.`);
}
