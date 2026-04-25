import { describe, expect, it } from 'vitest';
import type { AppNode } from '../types/flow';
import { collectNodeBookmarks, resolveNodeDisplayTitle } from './nodeBookmarks';

function createNode(id: string, type: AppNode['type'], customTitle?: string): AppNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: { customTitle },
  } as AppNode;
}

describe('node bookmarks', () => {
  it('uses the custom title when present and falls back to the default title otherwise', () => {
    expect(resolveNodeDisplayTitle('Image Generation', '  Hero image  ')).toBe('Hero image');
    expect(resolveNodeDisplayTitle('Image Generation', '')).toBe('Image Generation');
    expect(resolveNodeDisplayTitle('Image Generation', undefined)).toBe('Image Generation');
  });

  it('collects only renamed nodes into bookmark entries', () => {
    const bookmarks = collectNodeBookmarks([
      createNode('text-1', 'textNode', 'Scene prompt'),
      createNode('image-1', 'imageGen'),
      createNode('video-1', 'videoGen', 'Hero clip'),
    ]);

    expect(bookmarks).toEqual([
      { id: 'text-1', title: 'Scene prompt', type: 'textNode' },
      { id: 'video-1', title: 'Hero clip', type: 'videoGen' },
    ]);
  });
});
