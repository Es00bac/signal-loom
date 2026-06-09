import { describe, expect, it, vi } from 'vitest';
import {
  clampContextMenuPosition,
  getContextMenuMaxHeight,
  getContextMenuPortalTarget,
  normalizeContextMenuItems,
} from './sharedContextMenu';

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

  it('opens upward from the pointer when there is not enough room below', () => {
    expect(
      clampContextMenuPosition(
        { x: 200, y: 560 },
        { width: 800, height: 600 },
        { width: 240, height: 180 },
      ),
    ).toEqual({ x: 200, y: 380 });
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

  it('caps tall context menus to the viewport with padding', () => {
    expect(getContextMenuMaxHeight({ width: 3840, height: 2160 })).toBe(2136);
    expect(getContextMenuMaxHeight({ width: 800, height: 160 })).toBe(136);
  });

  it('uses document.body when a browser document exists', () => {
    const body = {} as HTMLElement;

    expect(getContextMenuPortalTarget({ body } as Document)).toBe(body);
  });

  it('stays inline when no document exists', () => {
    expect(getContextMenuPortalTarget(undefined)).toBeUndefined();
  });
});
