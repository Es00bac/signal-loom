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

function isEntirelyBase64Text(bytes: Uint8Array): boolean {
  // base64 alphabet + padding + whitespace, as byte codes.
  if (bytes.length < 16) {
    return false;
  }
  const sample = bytes.subarray(0, Math.min(bytes.length, 512));
  for (let i = 0; i < sample.length; i += 1) {
    const b = sample[i];
    const ok =
      (b >= 0x41 && b <= 0x5a) || // A-Z
      (b >= 0x61 && b <= 0x7a) || // a-z
      (b >= 0x30 && b <= 0x39) || // 0-9
      b === 0x2b || b === 0x2f || b === 0x3d || // + / =
      b === 0x0a || b === 0x0d; // \n \r
    if (!ok) {
      return false;
    }
  }
  return true;
}

/**
 * Read an image Blob from a fetch Response that is supposed to carry raw binary image bytes.
 *
 * On Android, Capacitor's patched fetch returns binary POST responses base64-wrapped — the body of
 * the `Response` is the base64 *text*, not the decoded image — so a direct `response.blob()` yields
 * a corrupt blob. This detects that by content (real PNG/JPEG/WebP/GIF magic bytes are not valid
 * base64) and decodes when needed. It's a no-op on desktop/web where the bytes are already binary,
 * so it's safe everywhere.
 */
export async function readBinaryImageResponseBlob(response: Response, fallbackMimeType = 'image/png'): Promise<Blob> {
  const mimeType = (response.headers.get('content-type') || fallbackMimeType).split(';', 1)[0] || fallbackMimeType;
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (isEntirelyBase64Text(bytes)) {
    const text = new TextDecoder().decode(bytes).replace(/\s/g, '');
    const binary = atob(text);
    const decoded = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      decoded[i] = binary.charCodeAt(i);
    }
    return new Blob([decoded as BlobPart], { type: mimeType });
  }
  return new Blob([bytes as BlobPart], { type: mimeType });
}
