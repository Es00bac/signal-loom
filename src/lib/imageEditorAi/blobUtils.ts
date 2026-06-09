export async function blobToDataUrl(blob: Blob): Promise<string> {
  const base64 = await blobToBase64(blob);
  return `data:${blob.type || 'image/png'};base64,${base64}`;
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export async function blobToFile(blob: Blob, name: string): Promise<File> {
  return new File([blob], name, { type: blob.type || 'image/png' });
}

export function base64ToBlob(base64: string, mimeType = 'image/png'): Blob {
  const bytes = Uint8Array.from(base64, (character) => character.charCodeAt(0));
  return new Blob([bytes as BlobPart], { type: mimeType });
}

export function dataUrlToBlob(dataUrl: string, fallbackMimeType = 'image/png'): Blob {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error('Unsupported image data URL.');
  }

  return base64ToBlob(match[2], match[1] || fallbackMimeType);
}
