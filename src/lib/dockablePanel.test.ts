import { describe, expect, it } from 'vitest';
import {
  attachDockablePanelGlobalPointerDragListeners,
  clampPanelRect,
  createDefaultDockablePanelLayout,
  createDockablePanelDefaultSignature,
  normalizeFloatingPanelRect,
  moveFloatingPanelRect,
  nextPanelZOrder,
  panelKey,
  resolveDetachedFloatingPanelRect,
  resolveDockablePanelSnapTarget,
  resolveDockablePanelSnapPreviewRect,
  resizeDockedPanelRect,
  resizeFloatingPanelRect,
  sanitizeDockablePanelLayout,
  sortPanelsByZOrder,
  resolveDockedPanelStyleMetrics,
  COLLAPSED_DOCKED_SIDE_PANEL_WIDTH,
  COLLAPSED_DOCKED_HORIZONTAL_PANEL_HEIGHT,
} from './dockablePanel';
import { Z_INDEX, zIndexForFloatingPanel } from './zIndex';

describe('dockablePanel helpers', () => {
  it('keeps forwarding drag events from the owner window until the active pointer ends', () => {
    const listeners = new Map<string, Set<(event: { pointerId: number }) => void>>();
    const target = {
      addEventListener: (type: string, listener: EventListener) => {
        const set = listeners.get(type) ?? new Set();
        set.add(listener as unknown as (event: { pointerId: number }) => void);
        listeners.set(type, set);
      },
      removeEventListener: (type: string, listener: EventListener) => {
        listeners.get(type)?.delete(listener as unknown as (event: { pointerId: number }) => void);
      },
    };
    const moved: number[] = [];
    const ended: number[] = [];

    attachDockablePanelGlobalPointerDragListeners(target, 7, {
      onMove: (event) => moved.push(event.pointerId),
      onEnd: (event) => ended.push(event.pointerId),
    });

    listeners.get('pointermove')?.forEach((listener) => listener({ pointerId: 3 }));
    listeners.get('pointermove')?.forEach((listener) => listener({ pointerId: 7 }));
    listeners.get('pointerup')?.forEach((listener) => listener({ pointerId: 7 }));
    listeners.get('pointermove')?.forEach((listener) => listener({ pointerId: 7 }));

    expect(moved).toEqual([7]);
    expect(ended).toEqual([7]);
    expect(listeners.get('pointermove')?.size).toBe(0);
    expect(listeners.get('pointerup')?.size).toBe(0);
    expect(listeners.get('pointercancel')?.size).toBe(0);
  });

  it('creates default docked panel layouts with normalized rects and keys', () => {
    const layout = createDefaultDockablePanelLayout({ workspaceId: 'image', panelId: 'layers' }, 4);

    expect(panelKey('image', 'layers')).toBe('image/layers');
    expect(layout).toMatchObject({
      workspaceId: 'image',
      panelId: 'layers',
      mode: 'docked',
      dockZone: 'right',
      minSize: { width: 220, height: 160 },
      zOrder: 4,
    });
  });

  it('builds panel default signatures from serializable layout fields only', () => {
    const withContent = {
      workspaceId: 'image',
      panelId: 'layers',
      dockZone: 'right' as const,
      floatingRect: { x: 100, y: 80, width: 300, height: 400 },
      minSize: { width: 240, height: 180 },
      content: { unstable: true },
      onRender: () => undefined,
    };
    const withDifferentContent = {
      ...withContent,
      content: { unstable: false },
      onRender: () => 'changed',
    };

    expect(createDockablePanelDefaultSignature([withContent])).toBe(
      createDockablePanelDefaultSignature([withDifferentContent]),
    );
  });

  it('clamps floating rects to viewport and panel min size', () => {
    expect(
      clampPanelRect(
        { x: -100, y: 999, width: 40, height: 900 },
        { width: 800, height: 600 },
        { width: 240, height: 180 },
      ),
    ).toEqual({ x: 8, y: 76, width: 240, height: 516 });
  });

  it('keeps oversized floating panels within a recoverable viewport area', () => {
    const rect = clampPanelRect(
      { x: -200, y: -160, width: 3000, height: 2400 },
      { width: 1200, height: 800 },
      { width: 240, height: 180 },
    );

    expect(rect).toEqual({ x: 8, y: 8, width: 1032, height: 688 });
  });

  it('moves floating panels while preserving viewport clamping', () => {
    const moved = moveFloatingPanelRect(
      { x: 700, y: 500, width: 160, height: 140 },
      120,
      80,
      { width: 800, height: 600 },
      { width: 120, height: 100 },
    );

    expect(moved).toEqual({ x: 632, y: 452, width: 160, height: 140 });
  });

  it('moves already-floating panels without resizing their saved dimensions', () => {
    const moved = moveFloatingPanelRect(
      { x: 24, y: 32, width: 980, height: 760 },
      96,
      48,
      { width: 900, height: 700 },
      { width: 240, height: 180 },
      { constrainPosition: false },
    );

    expect(moved).toEqual({ x: 120, y: 80, width: 980, height: 760 });
  });

  it('can normalize floating panel size without clamping position to the owner viewport', () => {
    const rect = normalizeFloatingPanelRect(
      { x: -420, y: 840, width: 40, height: 900 },
      { width: 800, height: 600 },
      { width: 240, height: 180 },
      { constrainPosition: false },
    );

    expect(rect).toEqual({ x: -420, y: 840, width: 240, height: 516 });
  });

  it('detaches a docked panel using the mounted panel size instead of stale saved dimensions', () => {
    const rightStackPanel = createDefaultDockablePanelLayout({
      workspaceId: 'image',
      panelId: 'layers',
      dockZone: 'right',
      floatingRect: { x: 1120, y: 96, width: 300, height: 560 },
      minSize: { width: 224, height: 220 },
    });

    expect(
      resolveDetachedFloatingPanelRect({
        layout: rightStackPanel,
        originRect: { x: 1140, y: 96, width: 300, height: 367 },
        pointerX: 1200,
        pointerY: 128,
        pointerOffsetX: 60,
        pointerOffsetY: 32,
      }),
    ).toEqual({ x: 1140, y: 96, width: 300, height: 367 });
  });

  it('caps a full-height docked side panel to its saved floating size while detaching', () => {
    const fullHeightBookmarks = createDefaultDockablePanelLayout({
      workspaceId: 'flow',
      panelId: 'bookmarks',
      dockZone: 'right',
      floatingRect: { x: 1536, y: 80, width: 352, height: 640 },
      minSize: { width: 300, height: 260 },
    });

    expect(
      resolveDetachedFloatingPanelRect({
        layout: fullHeightBookmarks,
        originRect: { x: 1088, y: 64, width: 352, height: 936 },
        pointerX: 720,
        pointerY: 260,
        pointerOffsetX: 92,
        pointerOffsetY: 16,
      }),
    ).toEqual({ x: 628, y: 244, width: 352, height: 640 });
  });

  it('resizes from edges and keeps the opposite edge stable at min size', () => {
    const resized = resizeFloatingPanelRect(
      { x: 100, y: 100, width: 300, height: 220 },
      { edgeX: -1, edgeY: -1, deltaX: 260, deltaY: 190 },
      { width: 1000, height: 800 },
      { width: 180, height: 120 },
    );

    expect(resized).toEqual({ x: 220, y: 200, width: 180, height: 120 });
  });

  it('resizes a bottom-docked timeline from the divider above it', () => {
    const resized = resizeDockedPanelRect(
      { x: 40, y: 600, width: 1120, height: 420 },
      'bottom',
      { edgeX: 0, edgeY: -1, deltaX: 0, deltaY: -140 },
      { width: 1600, height: 1000 },
      { width: 520, height: 320 },
    );

    expect(resized).toEqual({ x: 40, y: 600, width: 1120, height: 560 });
  });

  it('resizes side-docked panels only from the divider facing the canvas and clamps width', () => {
    const expandedRight = resizeDockedPanelRect(
      { x: 1220, y: 80, width: 320, height: 720 },
      'right',
      { edgeX: -1, edgeY: 0, deltaX: -900, deltaY: 0 },
      { width: 1600, height: 1000 },
      { width: 260, height: 280 },
    );
    const ignoredWrongEdge = resizeDockedPanelRect(
      { x: 12, y: 80, width: 280, height: 720 },
      'left',
      { edgeX: -1, edgeY: 0, deltaX: -120, deltaY: 0 },
      { width: 1600, height: 1000 },
      { width: 240, height: 260 },
    );

    expect(expandedRight.width).toBe(544);
    expect(ignoredWrongEdge.width).toBe(280);
  });

  it('snaps dragged panels to allowed viewport edges', () => {
    expect(
      resolveDockablePanelSnapTarget(
        { x: 12, y: 420 },
        { width: 1600, height: 1000 },
        [],
        ['left', 'right', 'overlay'],
      ),
    ).toEqual({ mode: 'docked', dockZone: 'left', placement: 'end' });

    expect(
      resolveDockablePanelSnapTarget(
        { x: 1584, y: 420 },
        { width: 1600, height: 1000 },
        [],
        ['left', 'right', 'overlay'],
      ),
    ).toEqual({ mode: 'docked', dockZone: 'right', placement: 'end' });

    expect(
      resolveDockablePanelSnapTarget(
        { x: 1584, y: 420 },
        { width: 1600, height: 1000 },
        [],
        ['left', 'overlay'],
      ),
    ).toEqual({ mode: 'floating' });
  });

  it('resolves before and after placement inside existing dock stacks', () => {
    const stackRects = [
      {
        panelId: 'source-bin',
        dockZone: 'left' as const,
        rect: { x: 0, y: 80, width: 352, height: 420 },
      },
      {
        panelId: 'bookmarks',
        dockZone: 'left' as const,
        rect: { x: 0, y: 500, width: 352, height: 360 },
      },
    ];

    expect(
      resolveDockablePanelSnapTarget(
        { x: 160, y: 110 },
        { width: 1600, height: 1000 },
        stackRects,
        ['left', 'right', 'overlay'],
      ),
    ).toEqual({
      mode: 'docked',
      dockZone: 'left',
      placement: 'before',
      referencePanelId: 'source-bin',
    });

    expect(
      resolveDockablePanelSnapTarget(
        { x: 160, y: 820 },
        { width: 1600, height: 1000 },
        stackRects,
        ['left', 'right', 'overlay'],
      ),
    ).toEqual({
      mode: 'docked',
      dockZone: 'left',
      placement: 'after',
      referencePanelId: 'bookmarks',
    });
  });

  it('builds visible snap preview rectangles for edge and stacked-panel dock targets', () => {
    const viewport = { width: 1600, height: 1000 };
    const stackRects = [
      {
        panelId: 'source-bin',
        dockZone: 'left' as const,
        rect: { x: 0, y: 80, width: 352, height: 420 },
      },
    ];

    expect(
      resolveDockablePanelSnapPreviewRect(
        { mode: 'docked', dockZone: 'right', placement: 'end' },
        viewport,
        stackRects,
      ),
    ).toEqual({ x: 1552, y: 0, width: 48, height: 1000 });

    expect(
      resolveDockablePanelSnapPreviewRect(
        { mode: 'docked', dockZone: 'left', placement: 'before', referencePanelId: 'source-bin' },
        viewport,
        stackRects,
      ),
    ).toEqual({ x: 0, y: 76, width: 352, height: 8 });
  });

  it('computes z-order and central z-indexes deterministically', () => {
    const layouts = [
      createDefaultDockablePanelLayout({ workspaceId: 'image', panelId: 'a' }, 2),
      createDefaultDockablePanelLayout({ workspaceId: 'image', panelId: 'b' }, 9),
    ];

    expect(nextPanelZOrder(layouts)).toBe(10);
    expect(sortPanelsByZOrder(layouts).map((layout) => layout.panelId)).toEqual(['a', 'b']);
    expect(zIndexForFloatingPanel(3)).toBe(Z_INDEX.floatingPanelBase + 3);
    expect(zIndexForFloatingPanel(999)).toBeLessThan(Z_INDEX.contextMenu);
  });

  it('shrinks collapsed docked panels to chrome-only occupancy instead of their full saved size', () => {
    const left = createDefaultDockablePanelLayout({
      workspaceId: 'paper',
      panelId: 'source-bin',
      dockZone: 'left',
      floatingRect: { width: 352, height: 640 },
      minSize: { width: 320, height: 240 },
    });
    const top = createDefaultDockablePanelLayout({
      workspaceId: 'paper',
      panelId: 'document-strip',
      dockZone: 'top',
      floatingRect: { width: 900, height: 120 },
      minSize: { width: 520, height: 72 },
    });

    expect(resolveDockedPanelStyleMetrics(left)).toMatchObject({
      width: 352,
      minWidth: 320,
    });
    expect(resolveDockedPanelStyleMetrics({ ...left, mode: 'collapsed' })).toMatchObject({
      width: COLLAPSED_DOCKED_SIDE_PANEL_WIDTH,
      minWidth: COLLAPSED_DOCKED_SIDE_PANEL_WIDTH,
    });
    expect(resolveDockedPanelStyleMetrics({ ...top, mode: 'collapsed' })).toMatchObject({
      height: COLLAPSED_DOCKED_HORIZONTAL_PANEL_HEIGHT,
      minHeight: COLLAPSED_DOCKED_HORIZONTAL_PANEL_HEIGHT,
    });
  });

  it('normalizes malformed persisted dockable layouts before render', () => {
    const fallback = createDefaultDockablePanelLayout({
      workspaceId: 'flow',
      panelId: 'source-bin',
      dockZone: 'left',
      floatingRect: { x: 40, y: 50, width: 320, height: 360 },
      minSize: { width: 240, height: 180 },
    });

    expect(
      sanitizeDockablePanelLayout(
        {
          mode: 'bad',
          dockZone: 'elsewhere',
          floatingRect: { x: Number.NaN, y: Number.POSITIVE_INFINITY, width: -1, height: null },
          minSize: null,
          zOrder: Number.NEGATIVE_INFINITY,
        },
        fallback,
        { width: 800, height: 600 },
      ),
    ).toEqual({
      ...fallback,
      floatingRect: { x: 40, y: 50, width: 240, height: 360 },
      zOrder: 0,
    });
  });
});
