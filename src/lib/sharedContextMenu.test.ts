import { describe, expect, it, vi } from 'vitest';
import { clampContextMenuPosition, normalizeContextMenuItems } from './sharedContextMenu';

describe('shared context menu helpers', () => {
  it('clamps the menu inside the viewport with padding', () => {
    expect(
      clampContextMenuPosition(
        { x: 790, y: 590 },
        { width: 800, height: 600 },
        { width: 240, height: 180 },
      ),
    ).toEqual({ x: 548, y: 408 });
  });

  it('keeps hidden items out and preserves disabled items without actions', () => {
    const action = vi.fn();
    const items = normalizeContextMenuItems([
      { id: 'rename', label: 'Rename', action },
      { id: 'separator', label: 'Separator', hidden: true, action: vi.fn() },
      { id: 'disabled', label: 'Disabled', disabled: true, action: vi.fn() },
    ]);

    expect(items).toEqual([
      expect.objectContaining({ id: 'rename', label: 'Rename', disabled: false }),
      expect.objectContaining({ id: 'disabled', label: 'Disabled', disabled: true, action: undefined }),
    ]);
  });
});
