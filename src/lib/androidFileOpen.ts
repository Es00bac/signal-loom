import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { showUserNotice } from '../shared/ui/userNotice';

export interface OpenedNativeFile {
  bytes: Uint8Array;
  fileName: string;
}

/**
 * Best-effort display filename from a `content://` or `file://` URI.
 *
 * Document-provider URIs often encode the real name in a colon-separated, percent-encoded
 * segment (e.g. `…/document/primary%3ADownload%2FMy.sloom`), so we decode and peel off any
 * `:`/`/` prefixes. Falls back to a generic name rather than throwing.
 */
export function fileNameFromUri(uri: string): string {
  try {
    const path = uri.split('?')[0].split('#')[0];
    const tail = path.substring(path.lastIndexOf('/') + 1);
    const decoded = decodeURIComponent(tail);
    const afterColon = decoded.substring(decoded.lastIndexOf(':') + 1);
    const afterSlash = afterColon.substring(afterColon.lastIndexOf('/') + 1);
    return afterSlash.trim() || decoded.trim() || 'opened-file';
  } catch {
    return 'opened-file';
  }
}

/**
 * Read the bytes behind a `content://` / `file://` URI handed to us by an ACTION_VIEW intent.
 *
 * `@capacitor/filesystem`'s `readFile` rejects `content://` URIs (NotSupportedForContentScheme),
 * so we route through the Capacitor bridge's local-server proxy: `convertFileSrc()` rewrites the
 * URI to `…/_capacitor_content_/…`, which the native `AndroidProtocolHandler` serves by reading
 * the URI through the `ContentResolver`. We must use the *unpatched* WebView fetch
 * (`CapacitorWebFetch`): the CapacitorHttp fetch patch (enabled app-wide for CORS) would otherwise
 * route this same-origin URL through the native HTTP proxy and fail to read it.
 */
export async function readOpenedUriBytes(uri: string): Promise<Uint8Array> {
  const proxied = Capacitor.convertFileSrc(uri);
  const webFetch =
    (globalThis as typeof globalThis & { CapacitorWebFetch?: typeof fetch }).CapacitorWebFetch ?? fetch;
  const response = await webFetch(proxied);
  if (!response.ok) {
    throw new Error(`Could not read the opened file (HTTP ${response.status}).`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * Wire up Android "Open with" / file-manager taps. When the app is launched (cold) or resumed
 * (warm, via `singleTask` → `onNewIntent`) by an ACTION_VIEW intent for a Signal Loom file, read
 * the bytes and hand them to `onOpen`. No-ops off native. Returns a cleanup function.
 */
export function registerAndroidFileOpenHandler(
  onOpen: (file: OpenedNativeFile) => void | Promise<void>,
): () => void {
  if (!Capacitor.isNativePlatform()) {
    return () => {};
  }

  let disposed = false;
  let lastUri: string | undefined;
  let lastAt = 0;

  const handleUri = async (uri: string | null | undefined): Promise<void> => {
    if (disposed || !uri || !/^(content:|file:)/i.test(uri)) {
      return;
    }
    // The cold-start launch URL can also arrive via the listener; ignore an identical
    // URI seen within a short window so a single tap doesn't open the document twice.
    const now = Date.now();
    if (uri === lastUri && now - lastAt < 2000) {
      return;
    }
    lastUri = uri;
    lastAt = now;

    try {
      const bytes = await readOpenedUriBytes(uri);
      await onOpen({ bytes, fileName: fileNameFromUri(uri) });
    } catch (error) {
      console.error('[Signal Loom] Failed to open file from intent:', uri, error);
      showUserNotice(
        `Couldn’t open “${fileNameFromUri(uri)}”: ${error instanceof Error ? error.message : String(error)}`,
        'error',
      );
    }
  };

  // Cold start: launched by tapping a file in a file manager.
  void App.getLaunchUrl()
    .then((result) => handleUri(result?.url))
    .catch(() => {});

  // Warm start: already running, user taps another file.
  const listener = App.addListener('appUrlOpen', (event) => {
    void handleUri(event.url);
  });

  return () => {
    disposed = true;
    void listener.then((handle) => handle.remove()).catch(() => {});
  };
}
