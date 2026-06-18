import { describe, expect, it } from 'vitest';
import { packContainer } from '../../shared/files/SignalLoomContainer';
import { deserializeSlppr, serializeSlppr } from './SlpprFormat';
import type { PaperDocument } from '../../types/paper';

// A small PNG-ish payload as a data URL (bytes 1,2,3,253,254,255 base64-encoded).
const PNG_DATA_URL = 'data:image/png;base64,AQID/f7/';

function fakeDoc(): PaperDocument {
  return {
    id: 'p1', name: 'Zine', width: 800, height: 600,
    pages: [
      { id: 'pg1', frames: [
        { id: 'f1', kind: 'image', asset: { src: PNG_DATA_URL } },
        { id: 'f2', kind: 'text', text: 'hello (not a data url)' },
      ] },
    ],
  } as unknown as PaperDocument;
}

describe('SlpprFormat', () => {
  it('round-trips a paper doc, carrying data-URL assets as binary (structure + pixels preserved)', () => {
    const bytes = serializeSlppr(fakeDoc());
    const out = deserializeSlppr(bytes) as unknown as ReturnType<typeof fakeDoc>;
    expect(out.name).toBe('Zine');
    expect(out.pages[0].frames[1].text).toBe('hello (not a data url)'); // non-asset strings untouched
    expect(out.pages[0].frames[0].asset.src).toBe(PNG_DATA_URL);        // data URL restored exactly
  });

  it('stores assets as decoded binary, not inline base64 (lean container)', () => {
    const bytes = serializeSlppr(fakeDoc());
    // the raw container bytes must NOT contain the base64 payload substring
    const asText = new TextDecoder('latin1').decode(bytes);
    expect(asText.includes('AQID/f7/')).toBe(false);
  });

  it('rejects a non-.slppr container', () => {
    const foreign = packContainer({ format: 'signal-loom-image', formatVersion: 1, kind: 'image', document: {}, assets: [] }, new Map());
    expect(() => deserializeSlppr(foreign)).toThrow();
  });
});
