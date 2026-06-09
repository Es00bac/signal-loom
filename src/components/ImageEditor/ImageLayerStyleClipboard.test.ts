import { describe, expect, it } from 'vitest';
import { copyImageLayerStyle, pasteImageLayerStyle } from './ImageLayerStyleClipboard';
import type { ImageLayer } from '../../types/imageEditor';

function layer(id: string): ImageLayer {
  return {
    id,
    name: id,
    type: 'image',
    visible: true,
    locked: false,
    opacity: 0.5,
    blendMode: 'multiply',
    x: 0,
    y: 0,
    bitmap: null,
    bitmapVersion: 0,
    mask: null,
    effects: [{ id: 'fx-1', kind: 'outerGlow', enabled: true, color: '#00ffff', opacity: 0.8, size: 20 }],
    filters: [{ id: 'filter-1', kind: 'blur', enabled: true, amount: 4 }],
  };
}

describe('ImageLayerStyleClipboard', () => {
  it('copies layer style settings and pastes cloned values onto another layer', () => {
    const source = layer('source');
    const target = { ...layer('target'), effects: [], filters: [], opacity: 1, blendMode: 'normal' as const };

    const clipboard = copyImageLayerStyle(source);
    const pasted = pasteImageLayerStyle(target, clipboard);

    expect(pasted).toMatchObject({
      id: 'target',
      opacity: 0.5,
      blendMode: 'multiply',
    });
    expect(pasted.effects).toEqual(source.effects);
    expect(pasted.filters).toEqual(source.filters);
    expect(pasted.effects).not.toBe(source.effects);
    expect(pasted.filters).not.toBe(source.filters);
  });
});
