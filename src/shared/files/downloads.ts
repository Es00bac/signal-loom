import { inferDownloadExtension } from '../../lib/mediaFormatRegistry';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';

export interface DownloadRuntime {
  document?: Document;
  fetch?: typeof fetch;
  setTimeout?: (callback: () => void, delay?: number) => unknown;
  url?: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'>;
}

export function buildDownloadFilename(
  baseName: string,
  mimeType: string | undefined,
  fallbackExtension: string,
): string {
  const safeBaseName = baseName.replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '') || 'flow-asset';
  return `${safeBaseName}.${inferDownloadExtension(mimeType, fallbackExtension)}`;
}

export function downloadBlob(
  blob: Blob,
  fileName: string,
  runtime: DownloadRuntime = {},
): void {
  if (Capacitor.isNativePlatform()) {
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const base64data = reader.result as string;
        const base64 = base64data.split(',')[1];
        
        // Request permissions if needed
        const perm = await Filesystem.checkPermissions();
        if (perm.publicStorage !== 'granted') {
          await Filesystem.requestPermissions();
        }

        const result = await Filesystem.writeFile({
          path: fileName,
          data: base64,
          directory: Directory.Documents,
        });
        console.log(`[Capacitor] Saved file successfully to: ${result.uri}`);
      } catch (err) {
        console.error('[Capacitor] Failed to save file:', err);
      }
    };
    reader.readAsDataURL(blob);
    return;
  }

  const { document, setTimeout, url } = resolveRuntime(runtime);
  const objectUrl = url.createObjectURL(blob);
  triggerHrefDownload(objectUrl, fileName, { document });
  setTimeout(() => url.revokeObjectURL(objectUrl), 1000);
}

export function downloadTextFile(
  fileName: string,
  contents: string,
  mimeType = 'text/plain',
  runtime: DownloadRuntime = {},
): void {
  downloadBlob(new Blob([contents], { type: mimeType }), fileName, runtime);
}

export function downloadJsonFile(
  fileName: string,
  payload: unknown,
  runtime: DownloadRuntime = {},
): void {
  downloadTextFile(fileName, JSON.stringify(payload, null, 2), 'application/json', runtime);
}

export async function downloadUrlAsFile(
  assetUrl: string,
  fileName: string,
  runtime: DownloadRuntime = {},
): Promise<void> {
  const resolved = resolveRuntime(runtime);

  try {
    const response = await resolved.fetch(assetUrl);

    if (!response.ok) {
      throw new Error(`Download failed with status ${response.status}.`);
    }

    downloadBlob(await response.blob(), fileName, resolved);
    return;
  } catch {
    triggerHrefDownload(assetUrl, fileName, {
      document: resolved.document,
      rel: 'noreferrer',
      target: '_blank',
    });
  }
}

export const downloadAsset = downloadUrlAsFile;

function triggerHrefDownload(
  href: string,
  fileName: string,
  options: {
    document: Document;
    rel?: string;
    target?: string;
  },
): void {
  const anchor = options.document.createElement('a');
  anchor.href = href;
  anchor.download = fileName;
  if (options.target) anchor.target = options.target;
  if (options.rel) anchor.rel = options.rel;
  options.document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

function resolveRuntime(runtime: DownloadRuntime): Required<DownloadRuntime> {
  return {
    document: runtime.document ?? document,
    fetch: runtime.fetch ?? fetch,
    setTimeout: runtime.setTimeout ?? ((callback, delay) => window.setTimeout(callback, delay)),
    url: runtime.url ?? URL,
  };
}
