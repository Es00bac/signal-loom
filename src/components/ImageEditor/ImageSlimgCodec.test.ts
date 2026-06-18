import { describe, expect, it } from 'vitest';
import { openSlimgDocument, saveImageDocumentAsSlimg, slimgPixelCodec } from './ImageSlimgCodec';

// The encode/decode use browser canvas APIs (convertToBlob / createImageBitmap) that the Node test
// env lacks, so they're exercised in-app; here we guard that the module loads and exposes its
// contract (the structural serialization it drives is fully unit-tested in ImageSlimgFormat.test.ts).
describe('ImageSlimgCodec', () => {
  it('exposes a pixel codec and save/open helpers', () => {
    expect(typeof slimgPixelCodec.encode).toBe('function');
    expect(typeof slimgPixelCodec.decode).toBe('function');
    expect(typeof saveImageDocumentAsSlimg).toBe('function');
    expect(typeof openSlimgDocument).toBe('function');
  });
});
