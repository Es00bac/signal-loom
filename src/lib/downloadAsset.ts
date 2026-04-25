function inferExtensionFromMimeType(mimeType: string | undefined, fallback: string): string {
  if (!mimeType) {
    return fallback;
  }

  if (mimeType.includes('png')) {
    return 'png';
  }

  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) {
    return 'jpg';
  }

  if (mimeType.includes('webp')) {
    return 'webp';
  }

  if (mimeType.includes('mp4')) {
    return 'mp4';
  }

  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) {
    return 'mp3';
  }

  if (mimeType.includes('wav') || mimeType.includes('pcm')) {
    return 'wav';
  }

  return fallback;
}

export function buildDownloadFilename(
  baseName: string,
  mimeType: string | undefined,
  fallbackExtension: string,
): string {
  const safeBaseName = baseName.replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '') || 'flow-asset';
  return `${safeBaseName}.${inferExtensionFromMimeType(mimeType, fallbackExtension)}`;
}

export async function downloadAsset(
  assetUrl: string,
  fileName: string,
): Promise<void> {
  const anchor = document.createElement('a');

  try {
    const response = await fetch(assetUrl);

    if (!response.ok) {
      throw new Error(`Download failed with status ${response.status}.`);
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);

    anchor.href = objectUrl;
    anchor.download = fileName;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();

    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    return;
  } catch {
    anchor.href = assetUrl;
    anchor.download = fileName;
    anchor.target = '_blank';
    anchor.rel = 'noreferrer';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  }
}
