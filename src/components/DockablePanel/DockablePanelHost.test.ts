// @vitest-environment jsdom
import { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createDefaultDockablePanelLayout, panelKey, type DockablePanelDefault, type DockablePanelLayout } from '../../lib/dockablePanel';
import {
  resolveActiveDockZoneLayout,
  shouldSplitDockZoneLayouts,
} from '../../lib/dockablePanelStack';
import { useDockablePanelStore } from '../../store/dockablePanelStore';
import { DockablePanelHost, prepareDockablePanelRenderLayout, type DockablePanelDefinition } from './DockablePanelHost';

function layout(panelId: string, zOrder: number): DockablePanelLayout {
  return {
    workspaceId: 'video',
    panelId,
    mode: 'docked',
    dockZone: 'center',
    floatingRect: { x: 0, y: 0, width: 400, height: 300 },
    minSize: { width: 220, height: 160 },
    zOrder,
  };
}

describe('DockablePanelHost active center panels', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    useDockablePanelStore.setState({ defaults: {}, layouts: {} });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('keeps the Program Monitor active by default when Source Monitor shares the center stack', () => {
    const source = layout('source-monitor', 1);
    const program = layout('program-monitor', 2);

    expect(resolveActiveDockZoneLayout([source, program], null)?.panelId).toBe('program-monitor');
    expect(resolveActiveDockZoneLayout([source, program], 'source-monitor')?.panelId).toBe('source-monitor');
  });

  it('chooses split presentation for center panels that are all marked as split-capable', () => {
    expect(shouldSplitDockZoneLayouts(
      'center',
      [layout('source-monitor', 1), layout('program-monitor', 2)],
      (panelId) => panelId === 'source-monitor' || panelId === 'program-monitor',
    )).toBe(true);

    expect(shouldSplitDockZoneLayouts(
      'center',
      [layout('source-monitor', 1), layout('project-source-bin', 2)],
      (panelId) => panelId === 'source-monitor',
    )).toBe(false);
  });

  it('does not clamp floating render geometry before native external panels can use desktop coordinates', () => {
    const floatingLayout: DockablePanelLayout = {
      workspaceId: 'image',
      panelId: 'tools',
      mode: 'floating',
      dockZone: 'left',
      floatingRect: { x: -1800, y: 140, width: 1600, height: 1200 },
      minSize: { width: 66, height: 456 },
      zOrder: 8,
    };

    expect(
      prepareDockablePanelRenderLayout(
        floatingLayout,
        {
          fixedSize: false,
        },
        { width: 1280, height: 720 },
      ).floatingRect,
    ).toEqual({ x: -1800, y: 140, width: 1600, height: 1200 });

    expect(
      prepareDockablePanelRenderLayout(
        floatingLayout,
        {
          floatingRect: { width: 66, height: 456 },
          minSize: { width: 66, height: 456 },
          fixedSize: true,
        },
        { width: 1280, height: 720 },
      ).floatingRect,
    ).toEqual({ x: -1800, y: 140, width: 66, height: 456 });
  });

  it('makes stacked side-docked panels vertically scrollable so lower Image panels remain reachable at 1080p', () => {
    const panels: DockablePanelDefinition[] = [
      createTestDockedPanelDefinition('layers', 220),
      createTestDockedPanelDefinition('properties', 180),
      createTestDockedPanelDefinition('channels', 220),
      createTestDockedPanelDefinition('history', 220),
      createTestDockedPanelDefinition('paths', 220),
    ];
    const defaults = Object.fromEntries(
      panels.map((panel, index) => {
        const key = panelKey(panel.workspaceId, panel.panelId);
        const layout = createDefaultDockablePanelLayout(
          {
            workspaceId: panel.workspaceId,
            panelId: panel.panelId,
            mode: panel.mode,
            dockZone: panel.dockZone,
            floatingRect: panel.floatingRect,
            minSize: panel.minSize,
          } satisfies DockablePanelDefault,
          index,
        );
        return [key, layout];
      }),
    ) as Record<string, DockablePanelLayout>;

    useDockablePanelStore.setState({ defaults, layouts: defaults });

    act(() => {
      root.render(
        createElement(
          DockablePanelHost,
          { workspaceId: 'image', panels },
          createElement('div', null, 'Canvas'),
        ),
      );
    });

    const stack = container.querySelector<HTMLElement>('[data-dock-zone-stack="right"]');
    expect(stack).not.toBeNull();
    expect(stack!.className).toContain('overflow-y-auto');
    expect(stack!.className).toContain('flex-col');
  });

  it('renders side-docked stacks as one scroll surface with same-width static panel items', () => {
    const panels: DockablePanelDefinition[] = [
      createTestDockedPanelDefinition('paths', 220, 280),
      createTestDockedPanelDefinition('history', 260, 320),
      createTestDockedPanelDefinition('layers', 300, 360),
    ];
    const defaults = Object.fromEntries(
      panels.map((panel, index) => {
        const key = panelKey(panel.workspaceId, panel.panelId);
        const layout = createDefaultDockablePanelLayout(
          {
            workspaceId: panel.workspaceId,
            panelId: panel.panelId,
            mode: panel.mode,
            dockZone: panel.dockZone,
            floatingRect: panel.floatingRect,
            minSize: panel.minSize,
          } satisfies DockablePanelDefault,
          index,
        );
        return [key, layout];
      }),
    ) as Record<string, DockablePanelLayout>;

    useDockablePanelStore.setState({ defaults, layouts: defaults });

    act(() => {
      root.render(
        createElement(
          DockablePanelHost,
          { workspaceId: 'image', panels },
          createElement('div', null, 'Canvas'),
        ),
      );
    });

    const stack = container.querySelector<HTMLElement>('[data-dock-zone-stack="right"]');
    const stackItems = Array.from(container.querySelectorAll<HTMLElement>('[data-dock-zone-stack-panel="right"]'));
    const dockedPanels = Array.from(container.querySelectorAll<HTMLElement>('[data-dockable-panel-mode="docked"]'));

    expect(stack).not.toBeNull();
    expect(stack!.className).toContain('overflow-y-auto');
    expect(stackItems).toHaveLength(3);
    expect(stackItems.every((item) => item.className.includes('shrink-0'))).toBe(true);
    expect(stackItems.some((item) => item.className.includes('flex-1'))).toBe(false);
    expect(new Set(dockedPanels.map((panel) => panel.style.width))).toEqual(new Set(['360px']));
    expect(dockedPanels.every((panel) => panel.style.height === '')).toBe(true);
    expect(dockedPanels.some((panel) => panel.className.includes('h-full'))).toBe(false);
  });

  it('lets default side-docked panel bodies expand instead of creating per-panel scroll regions', () => {
    const panels: DockablePanelDefinition[] = [
      createTestDockedPanelDefinition('layers', 300, 320),
      createTestDockedPanelDefinition('history', 260, 320),
    ];
    const defaults = Object.fromEntries(
      panels.map((panel, index) => {
        const key = panelKey(panel.workspaceId, panel.panelId);
        const layout = createDefaultDockablePanelLayout(
          {
            workspaceId: panel.workspaceId,
            panelId: panel.panelId,
            mode: panel.mode,
            dockZone: panel.dockZone,
            floatingRect: panel.floatingRect,
            minSize: panel.minSize,
          } satisfies DockablePanelDefault,
          index,
        );
        return [key, layout];
      }),
    ) as Record<string, DockablePanelLayout>;

    useDockablePanelStore.setState({ defaults, layouts: defaults });

    act(() => {
      root.render(
        createElement(
          DockablePanelHost,
          { workspaceId: 'image', panels },
          createElement('div', null, 'Canvas'),
        ),
      );
    });

    const panelBodies = Array.from(container.querySelectorAll<HTMLElement>('[data-dockable-panel-body]'));

    expect(panelBodies).toHaveLength(2);
    expect(panelBodies.every((body) => body.className.includes('overflow-visible'))).toBe(true);
    expect(panelBodies.some((body) => body.className.includes('overflow-auto'))).toBe(false);
  });

  it('renders grouped side panels as one dock slot with tabs and only the active tab body', () => {
    const panels: DockablePanelDefinition[] = [
      createTestDockedPanelDefinition('layers', 220, 320),
      createTestDockedPanelDefinition('properties', 220, 320),
      createTestDockedPanelDefinition('history', 220, 320),
    ];
    const defaults = Object.fromEntries(
      panels.map((panel, index) => {
        const key = panelKey(panel.workspaceId, panel.panelId);
        const layout = createDefaultDockablePanelLayout(
          {
            workspaceId: panel.workspaceId,
            panelId: panel.panelId,
            mode: panel.mode,
            dockZone: panel.dockZone,
            floatingRect: panel.floatingRect,
            minSize: panel.minSize,
          } satisfies DockablePanelDefault,
          index,
        );
        return [key, layout];
      }),
    ) as Record<string, DockablePanelLayout>;
    const layouts = { ...defaults };
    layouts[panelKey('image', 'layers')] = {
      ...layouts[panelKey('image', 'layers')],
      tabGroupId: 'image-right-stack-a',
      tabGroupOrder: 0,
      tabGroupActive: true,
    };
    layouts[panelKey('image', 'properties')] = {
      ...layouts[panelKey('image', 'properties')],
      tabGroupId: 'image-right-stack-a',
      tabGroupOrder: 1,
      tabGroupActive: false,
    };

    useDockablePanelStore.setState({ defaults, layouts });

    act(() => {
      root.render(
        createElement(
          DockablePanelHost,
          { workspaceId: 'image', panels },
          createElement('div', null, 'Canvas'),
        ),
      );
    });

    const stackItems = Array.from(container.querySelectorAll<HTMLElement>('[data-dock-zone-stack-panel="right"]'));
    const tabList = container.querySelector<HTMLElement>('[data-dockable-tab-list="image-right-stack-a"]');
    const activeBody = container.querySelector<HTMLElement>('[data-dockable-tab-panel="layers"]');

    expect(stackItems).toHaveLength(2);
    expect(tabList).not.toBeNull();
    expect(Array.from(tabList!.querySelectorAll('[role="tab"]')).map((tab) => tab.textContent)).toEqual(['layers', 'properties']);
    expect(activeBody?.textContent).toBe('layers');
    expect(container.querySelector('[data-dockable-tab-panel="properties"]')).toBeNull();

    act(() => {
      tabList!.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1].click();
    });

    expect(useDockablePanelStore.getState().layouts[panelKey('image', 'properties')].tabGroupActive).toBe(true);
    expect(container.querySelector<HTMLElement>('[data-dockable-tab-panel="properties"]')?.textContent).toBe('properties');
  });

  it('opens a tab context menu with reorder, ungroup, float, and reset actions', () => {
    const panels: DockablePanelDefinition[] = [
      {
        ...createTestDockedPanelDefinition('layers', 220),
        tabGroupId: 'image-right-stack-a',
        tabGroupOrder: 0,
        tabGroupActive: true,
      },
      {
        ...createTestDockedPanelDefinition('properties', 180),
        tabGroupId: 'image-right-stack-a',
        tabGroupOrder: 1,
        tabGroupActive: false,
      },
    ];
    const defaults = Object.fromEntries(
      panels.map((panel, index) => {
        const key = panelKey(panel.workspaceId, panel.panelId);
        const layout = createDefaultDockablePanelLayout(
          {
            workspaceId: panel.workspaceId,
            panelId: panel.panelId,
            mode: panel.mode,
            dockZone: panel.dockZone,
            floatingRect: panel.floatingRect,
            minSize: panel.minSize,
            tabGroupId: 'image-right-stack-a',
            tabGroupOrder: index,
            tabGroupActive: index === 0,
          } satisfies DockablePanelDefault,
          index,
        );
        return [key, layout];
      }),
    ) as Record<string, DockablePanelLayout>;

    useDockablePanelStore.setState({ defaults, layouts: defaults });

    act(() => {
      root.render(
        createElement(
          DockablePanelHost,
          { workspaceId: 'image', panels },
          createElement('div', null, 'Canvas'),
        ),
      );
    });

    const propertiesTab = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
      .find((tab) => tab.textContent === 'properties');
    expect(propertiesTab).toBeTruthy();

    act(() => {
      propertiesTab!.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: 128,
        clientY: 96,
      }));
    });

    const menu = container.querySelector<HTMLElement>('[data-dockable-tab-context-menu="true"]');
    expect(menu).not.toBeNull();
    expect(menu?.style.left).toBe('128px');
    expect(menu?.style.top).toBe('96px');
    expect(Array.from(menu!.querySelectorAll('button')).map((button) => button.textContent)).toEqual([
      'Activate Tab',
      'Move Tab Left',
      'Move Tab Right',
      'Ungroup Tab',
      'Float Tab',
      'Reset Panel',
    ]);

    act(() => {
      menu!.querySelector<HTMLButtonElement>('[data-dockable-tab-menu-action="ungroup"]')?.click();
    });

    expect(useDockablePanelStore.getState().layouts[panelKey('image', 'properties')].tabGroupId).toBeUndefined();
    expect(container.querySelector('[data-dockable-tab-context-menu="true"]')).toBeNull();
  });

  it('registers tab group metadata from panel definitions before rendering docked defaults', () => {
    const panels: DockablePanelDefinition[] = [
      {
        ...createTestDockedPanelDefinition('layers', 220, 320),
        tabGroupId: 'image-layer-tabs',
        tabGroupOrder: 0,
        tabGroupActive: true,
      },
      {
        ...createTestDockedPanelDefinition('channels', 220, 320),
        tabGroupId: 'image-layer-tabs',
        tabGroupOrder: 1,
        tabGroupActive: false,
      },
      createTestDockedPanelDefinition('history', 220, 320),
    ];

    act(() => {
      root.render(
        createElement(
          DockablePanelHost,
          { workspaceId: 'image', panels },
          createElement('div', null, 'Canvas'),
        ),
      );
    });

    const stackItems = Array.from(container.querySelectorAll<HTMLElement>('[data-dock-zone-stack-panel="right"]'));
    const tabList = container.querySelector<HTMLElement>('[data-dockable-tab-list="image-layer-tabs"]');

    expect(stackItems).toHaveLength(2);
    expect(tabList).not.toBeNull();
    expect(Array.from(tabList!.querySelectorAll('[role="tab"]')).map((tab) => tab.textContent)).toEqual(['layers', 'channels']);
    expect(container.querySelector<HTMLElement>('[data-dockable-tab-panel="layers"]')?.textContent).toBe('layers');
    expect(container.querySelector('[data-dockable-tab-panel="channels"]')).toBeNull();
  });

  it('preserves the active floating Image tab group rect instead of ballooning to a larger sibling tab', async () => {
    window.signalLoomNative = {} as never;
    const popupDocument = document.implementation.createHTMLDocument('Layers');
    const popup = {
      closed: false,
      document: popupDocument,
      screenX: 112,
      screenY: 88,
      innerWidth: 420,
      innerHeight: 520,
      outerWidth: 420,
      outerHeight: 520,
      addEventListener: vi.fn(),
      close: vi.fn(),
      moveTo: vi.fn(),
      removeEventListener: vi.fn(),
      resizeTo: vi.fn(),
    };
    const open = vi.spyOn(window, 'open').mockImplementation(() => popup as unknown as Window);
    const panels: DockablePanelDefinition[] = [
      createTestFloatingPanelDefinition('layers', 'Layers'),
      {
        ...createTestFloatingPanelDefinition('properties', 'Properties'),
        floatingRect: { x: 112, y: 88, width: 640, height: 760 },
        minSize: { width: 300, height: 260 },
      },
    ];
    const defaults = Object.fromEntries(
      panels.map((panel, index) => {
        const key = panelKey(panel.workspaceId, panel.panelId);
        const layout = createDefaultDockablePanelLayout(
          {
            workspaceId: panel.workspaceId,
            panelId: panel.panelId,
            mode: panel.mode,
            dockZone: panel.dockZone,
            floatingRect: panel.floatingRect,
            minSize: panel.minSize,
            tabGroupId: panel.tabGroupId,
            tabGroupOrder: panel.tabGroupOrder,
            tabGroupActive: panel.tabGroupActive,
          } satisfies DockablePanelDefault,
          index,
        );
        return [key, layout];
      }),
    ) as Record<string, DockablePanelLayout>;

    useDockablePanelStore.setState({ defaults, layouts: defaults });

    await act(async () => {
      root.render(
        createElement(
          DockablePanelHost,
          { workspaceId: 'image', panels },
          createElement('div', null, 'Canvas'),
        ),
      );
      await Promise.resolve();
    });

    expect(open).toHaveBeenCalledWith(
      '',
      'signal-loom-image-image-floating-tabs',
      'popup=yes,frame=false,width=420,height=520,left=112,top=88',
    );
    expect(popup.resizeTo).not.toHaveBeenCalled();
  });

  it('keeps a native floating tab group in one stable-size palette while switching active tabs', async () => {
    window.signalLoomNative = {} as never;
    const popupDocument = document.implementation.createHTMLDocument('Layers');
    const popup = {
      closed: false,
      document: popupDocument,
      screenX: 112,
      screenY: 88,
      innerWidth: 420,
      innerHeight: 520,
      outerWidth: 420,
      outerHeight: 520,
      addEventListener: vi.fn(),
      close: vi.fn(),
      moveTo: vi.fn(),
      removeEventListener: vi.fn(),
      resizeTo: vi.fn(),
    };
    const open = vi.spyOn(window, 'open').mockImplementation(() => popup as unknown as Window);
    const panels: DockablePanelDefinition[] = [
      createTestFloatingPanelDefinition('layers', 'Layers'),
      createTestFloatingPanelDefinition('properties', 'Properties'),
    ];
    const defaults = Object.fromEntries(
      panels.map((panel, index) => {
        const key = panelKey(panel.workspaceId, panel.panelId);
        const layout = createDefaultDockablePanelLayout(
          {
            workspaceId: panel.workspaceId,
            panelId: panel.panelId,
            mode: panel.mode,
            dockZone: panel.dockZone,
            floatingRect: panel.floatingRect,
            minSize: panel.minSize,
            tabGroupId: panel.tabGroupId,
            tabGroupOrder: panel.tabGroupOrder,
            tabGroupActive: panel.tabGroupActive,
          } satisfies DockablePanelDefault,
          index,
        );
        return [key, layout];
      }),
    ) as Record<string, DockablePanelLayout>;

    useDockablePanelStore.setState({ defaults, layouts: defaults });

    await act(async () => {
      root.render(
        createElement(
          DockablePanelHost,
          { workspaceId: 'image', panels },
          createElement('div', null, 'Canvas'),
        ),
      );
      await Promise.resolve();
    });

    const initialPanel = popupDocument.querySelector<HTMLElement>('[data-dockable-panel-mode="floating"]');
    const propertiesTab = Array.from(popupDocument.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
      .find((tab) => tab.textContent === 'Properties');

    expect(open).toHaveBeenCalledWith(
      '',
      'signal-loom-image-image-floating-tabs',
      'popup=yes,frame=false,width=420,height=520,left=112,top=88',
    );
    expect(propertiesTab).not.toBeUndefined();
    const initialWidth = initialPanel?.style.width;
    const initialHeight = initialPanel?.style.height;

    await act(async () => {
      propertiesTab?.click();
      await Promise.resolve();
    });

    const switchedPanel = popupDocument.querySelector<HTMLElement>('[data-dockable-panel-mode="floating"]');

    expect(open).toHaveBeenCalledTimes(1);
    expect(popup.close).not.toHaveBeenCalled();
    expect(switchedPanel?.style.width).toBe(initialWidth);
    expect(switchedPanel?.style.height).toBe(initialHeight);
    expect(popup.resizeTo).not.toHaveBeenCalled();
    expect(popupDocument.querySelector<HTMLElement>('[data-dockable-tab-panel="properties"]')?.textContent).toBe('Properties content');
  });

  it('keeps an ungrouped docked tab adjacent to its former group in tab order', () => {
    const store = useDockablePanelStore.getState();
    store.registerPanelDefaults([
      createTestDockedPanelDefinition('layers', 220, 300),
      createTestDockedPanelDefinition('properties', 220, 300),
      createTestDockedPanelDefinition('history', 220, 300),
    ]);

    store.groupPanelWithPanel('image', 'history', 'layers');
    store.ungroupPanelTab('image', 'history');

    const rightStackOrder = Object.values(useDockablePanelStore.getState().layouts)
      .filter((entry) => entry.workspaceId === 'image' && entry.dockZone === 'right' && entry.mode === 'docked')
      .sort((left, right) => left.zOrder - right.zOrder || left.panelId.localeCompare(right.panelId))
      .map((entry) => entry.panelId);

    expect(rightStackOrder).toEqual(['layers', 'history', 'properties']);
  });
});

function createTestDockedPanelDefinition(panelId: string, minHeight: number, width = 300): DockablePanelDefinition {
  return {
    workspaceId: 'image',
    panelId,
    title: panelId,
    mode: 'docked',
    dockZone: 'right',
    floatingRect: { x: 0, y: 0, width, height: minHeight },
    minSize: { width: 224, height: minHeight },
    content: createElement('div', null, panelId),
  };
}

function createTestFloatingPanelDefinition(panelId: string, title: string): DockablePanelDefinition {
  return {
    workspaceId: 'image',
    panelId,
    title,
    mode: 'floating',
    dockZone: 'right',
    floatingRect: { x: 112, y: 88, width: 420, height: 520 },
    minSize: { width: 260, height: 180 },
    tabGroupId: 'image-floating-tabs',
    tabGroupOrder: panelId === 'layers' ? 0 : 1,
    tabGroupActive: panelId === 'layers',
    content: createElement('div', null, `${title} content`),
  };
}
