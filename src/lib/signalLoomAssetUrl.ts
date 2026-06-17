/** Helpers for the `signal-loom-asset://` URL scheme.
 *
 * This scheme is resolved natively ONLY by the Electron desktop app (a registered
 * custom protocol in electron/main.mjs). In the Android WebView and plain web there
 * is no resolver, so an `<img src="signal-loom-asset://…">` silently fails (the
 * generated asset shows as MISSING). On those platforms the renderer must resolve
 * the URL to local bytes (IndexedDB asset store) before display. */

const ASSET_ID_PATTERN = /^signal-loom-asset:\/\/asset\/([0-9a-fA-F][0-9a-fA-F-]{7,})/;

/** True for any `signal-loom-asset:` URL (asset/, file/, …). */
export function isSignalLoomAssetUrl(url: unknown): boolean {
  return typeof url === 'string' && url.startsWith('signal-loom-asset:');
}

/** Extract the asset id from `signal-loom-asset://asset/<id>` (the id matches the
 * local asset-store key), or null if the URL isn't an asset-id reference. */
export function parseSignalLoomAssetId(url: unknown): string | null {
  if (typeof url !== 'string') {
    return null;
  }
  const match = ASSET_ID_PATTERN.exec(url);
  return match ? match[1] : null;
}

/** A URL the WebView/browser can load directly (no native protocol needed). The
 * `signal-loom-asset:` scheme is explicitly NOT directly loadable off Electron. */
export function isDirectlyLoadableAssetUrl(url: unknown): url is string {
  if (typeof url !== 'string' || url.length === 0) {
    return false;
  }
  if (isSignalLoomAssetUrl(url)) {
    return false;
  }
  return (
    url.startsWith('data:') ||
    url.startsWith('blob:') ||
    url.startsWith('http://') ||
    url.startsWith('https://') ||
    url.startsWith('capacitor://') ||
    // Capacitor convertFileSrc output, e.g. https://localhost/_capacitor_file_/…
    url.includes('_capacitor_file_')
  );
}
