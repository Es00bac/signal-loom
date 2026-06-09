import { describe, expect, it } from 'vitest';
import {
  buildFloatingPanelWindowFeatures,
  createExternalFloatingPanelDragAnchor,
  resolveExternalFloatingPanelWindowPosition,
  resolveExternalFloatingPanelWindowSize,
  resolveExternalFloatingPanelMoveEndRect,
  resolveOwnerRelativeFloatingPanelRect,
  shouldResizeExternalFloatingPanelWindow,
  shouldRenderFloatingPanelInOwnerWindow,
  shouldUseExternalFloatingPanelWindow,
} from './floatingPanelWindow';

describe('floating panel window helpers', () => {
  it('uses external windows only for native floating panel layouts', () => {
    expect(shouldUseExternalFloatingPanelWindow({ isNative: true, mode: 'floating' })).toBe(true);
    expect(shouldUseExternalFloatingPanelWindow({ isNative: true, mode: 'docked' })).toBe(false);
    expect(shouldUseExternalFloatingPanelWindow({ isNative: false, mode: 'floating' })).toBe(false);
  });

  it('converts owner-window-relative panel rects to screen window features', () => {
    expect(
      buildFloatingPanelWindowFeatures(
        { x: 120, y: 88, width: 640, height: 420 },
        { screenX: 2000, screenY: 80 },
      ),
    ).toBe('popup=yes,frame=false,width=640,height=420,left=2120,top=168');
  });

  it('keeps floating panels visible in the owner window when the external popup is unavailable', () => {
    expect(shouldRenderFloatingPanelInOwnerWindow({
      shouldUseExternalWindow: false,
      externalPanelRootAvailable: false,
      externalWindowClosed: false,
    })).toBe(true);
    expect(shouldRenderFloatingPanelInOwnerWindow({
      shouldUseExternalWindow: true,
      externalPanelRootAvailable: true,
      externalWindowClosed: false,
    })).toBe(false);
    expect(shouldRenderFloatingPanelInOwnerWindow({
      shouldUseExternalWindow: true,
      externalPanelRootAvailable: false,
      externalWindowClosed: false,
    })).toBe(true);
    expect(shouldRenderFloatingPanelInOwnerWindow({
      shouldUseExternalWindow: true,
      externalPanelRootAvailable: true,
      externalWindowClosed: true,
    })).toBe(true);
  });

  it('keeps an external floating panel window anchored under the pointer while dragging', () => {
    const anchor = createExternalFloatingPanelDragAnchor({
      pointerScreenX: 2168,
      pointerScreenY: 132,
      windowScreenX: 2120,
      windowScreenY: 88,
    });

    expect(resolveExternalFloatingPanelWindowPosition({
      pointerScreenX: 2300,
      pointerScreenY: 190,
      anchor,
    })).toEqual({ screenX: 2252, screenY: 146 });
  });

  it('stores external popup placement back as owner-window-relative panel rects', () => {
    expect(resolveOwnerRelativeFloatingPanelRect({
      ownerScreenX: 2000,
      ownerScreenY: 80,
      windowScreenX: 2252,
      windowScreenY: 146,
      width: 640,
      height: 420,
    })).toEqual({ x: 252, y: 66, width: 640, height: 420 });
  });

  it('persists external popup content size instead of chrome-inclusive outer size', () => {
    expect(resolveExternalFloatingPanelWindowSize({
      innerWidth: 640,
      innerHeight: 420,
      outerWidth: 656,
      outerHeight: 456,
      fallbackWidth: 600,
      fallbackHeight: 400,
    })).toEqual({ width: 640, height: 420 });
  });

  it('preserves the drag-start panel size when storing an external popup move', () => {
    expect(resolveExternalFloatingPanelMoveEndRect({
      ownerScreenX: 2000,
      ownerScreenY: 80,
      windowScreenX: 2252,
      windowScreenY: 146,
      dragStartWidth: 640,
      dragStartHeight: 420,
      reportedInnerWidth: 652,
      reportedInnerHeight: 431,
    })).toEqual({ x: 252, y: 66, width: 640, height: 420 });
  });

  it('does not reapply the same external popup size during move-only layout sync', () => {
    expect(shouldResizeExternalFloatingPanelWindow({
      targetWidth: 640,
      targetHeight: 420,
      lastRequestedWidth: 640,
      lastRequestedHeight: 420,
    })).toBe(false);

    expect(shouldResizeExternalFloatingPanelWindow({
      targetWidth: 720,
      targetHeight: 420,
      lastRequestedWidth: 640,
      lastRequestedHeight: 420,
    })).toBe(true);
  });

  it('repairs external popup size drift even when the requested target size did not change', () => {
    expect(shouldResizeExternalFloatingPanelWindow({
      targetWidth: 352,
      targetHeight: 640,
      currentWidth: 388,
      currentHeight: 684,
      lastRequestedWidth: 352,
      lastRequestedHeight: 640,
    })).toBe(true);
  });
});
