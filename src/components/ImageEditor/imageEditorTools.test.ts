import { describe, expect, it } from 'vitest';
import { IMAGE_EDITOR_TOOL_DEFINITIONS } from './imageEditorTools';

describe('imageEditorTools', () => {
  it('registers a dedicated hand tool for viewport panning', () => {
    const ids = IMAGE_EDITOR_TOOL_DEFINITIONS.map((definition) => definition.tool);
    expect(ids).toContain('hand');
    expect(new Set(ids).size).toBe(ids.length);
    expect(IMAGE_EDITOR_TOOL_DEFINITIONS.find((definition) => definition.tool === 'hand')).toMatchObject({
      label: 'Hand',
      shortcut: 'H',
    });
  });
});
