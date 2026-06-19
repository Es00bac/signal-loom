import { describe, expect, it } from 'vitest';
import { readBinaryImageResponseBlob } from './blobUtils';

function imageResponse(body: Uint8Array, contentType = 'image/png'): Response {
  return new Response(body as BodyInit, { headers: { 'content-type': contentType } });
}

describe('readBinaryImageResponseBlob', () => {
  it('passes real binary image bytes through unchanged (desktop / web)', async () => {
    // PNG magic 0x89504E47 — not valid base64, so it is treated as raw binary.
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 250, 251, 252, 0, 9]);
    const blob = await readBinaryImageResponseBlob(imageResponse(png));

    expect(blob.type).toBe('image/png');
    expect(Array.from(new Uint8Array(await blob.arrayBuffer()))).toEqual(Array.from(png));
  });

  it('decodes a base64-text body (the Android CapacitorHttp-wrapped POST response)', async () => {
    const original = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    let raw = '';
    for (const b of original) raw += String.fromCharCode(b);
    const base64Text = btoa(raw);

    const blob = await readBinaryImageResponseBlob(imageResponse(new TextEncoder().encode(base64Text)));

    expect(Array.from(new Uint8Array(await blob.arrayBuffer()))).toEqual(Array.from(original));
  });

  it('honours the response content-type for the decoded blob', async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    const blob = await readBinaryImageResponseBlob(imageResponse(jpeg, 'image/jpeg; charset=binary'));
    expect(blob.type).toBe('image/jpeg');
  });
});
