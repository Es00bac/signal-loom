import { beforeEach, describe, expect, it } from 'vitest';
import { panelKey } from '../lib/dockablePanel';
import { useDockablePanelStore } from './dockablePanelStore';

const defaults = [
  {
    workspaceId: 'image',
    panelId: 'layers',
    dockZone: 'right' as const,
    floatingRect: { x: 100, y: 80, width: 300, height: 400 },
    minSize: { width: 240, height: 180 },
  },
  {
    workspaceId: 'image',
    panelId: 'assets',
    dockZone: 'left' as const,
    floatingRect: { x: 220, y: 120, width: 280, height: 300 },
  },
];

describe('dockablePanelStore', () => {
  beforeEach(() => {
    useDockablePanelStore.setState({ defaults: {}, layouts: {} });
  });

  it('registers default panel layouts keyed by workspace and panel id', () => {
    useDockablePanelStore.getState().registerPanelDefaults(defaults);

    const layout = useDockablePanelStore.getState().layouts[panelKey('image', 'layers')];
    expect(layout).toMatchObject({
      workspaceId: 'image',
      panelId: 'layers',
      mode: 'docked',
      dockZone: 'right',
      minSize: { width: 240, height: 180 },
    });
  });

  it('does not notify subscribers when registering equivalent defaults again', () => {
    const store = useDockablePanelStore.getState();
    store.registerPanelDefaults(defaults);
    const stateBefore = useDockablePanelStore.getState();
    let updates = 0;
    const unsubscribe = useDockablePanelStore.subscribe(() => {
      updates += 1;
    });

    store.registerPanelDefaults(defaults.map((panel) => ({ ...panel })));
    unsubscribe();

    expect(updates).toBe(0);
    expect(useDockablePanelStore.getState()).toBe(stateBefore);
  });

  it('does not mutate when repeated host-style registrations only change React content', () => {
    const firstRenderDefaults = defaults.map((panel, index) => ({
      ...panel,
      content: { render: index },
    }));
    const secondRenderDefaults = defaults.map((panel, index) => ({
      ...panel,
      content: { render: index + 10 },
      onClick: () => index,
    }));
    const store = useDockablePanelStore.getState();
    store.registerPanelDefaults(firstRenderDefaults);
    store.hidePanel('image', 'layers');
    const stateBefore = useDockablePanelStore.getState();
    let updates = 0;
    const unsubscribe = useDockablePanelStore.subscribe(() => {
      updates += 1;
    });

    for (let index = 0; index < 20; index += 1) {
      store.registerPanelDefaults(secondRenderDefaults.map((panel) => ({ ...panel, content: { render: index } })));
    }
    unsubscribe();

    expect(updates).toBe(0);
    expect(useDockablePanelStore.getState()).toBe(stateBefore);
    expect(useDockablePanelStore.getState().layouts[panelKey('image', 'layers')].mode).toBe('hidden');
  });

  it('repairs malformed persisted layouts when defaults are registered', () => {
    const key = panelKey('image', 'layers');
    useDockablePanelStore.setState({
      defaults: {},
      layouts: {
        [key]: {
          workspaceId: 'wrong',
          panelId: 'wrong',
          mode: 'detached',
          dockZone: 'sideways',
          floatingRect: null,
          minSize: { width: Number.POSITIVE_INFINITY },
          zOrder: Number.NaN,
        } as never,
      },
    });

    useDockablePanelStore.getState().registerPanelDefaults([defaults[0]]);

    expect(useDockablePanelStore.getState().layouts[key]).toMatchObject({
      workspaceId: 'image',
      panelId: 'layers',
      mode: 'docked',
      dockZone: 'right',
      floatingRect: { x: 100, y: 80, width: 300, height: 400 },
      minSize: { width: 240, height: 180 },
      zOrder: 0,
    });
  });

  it('migrates untouched layouts when registered defaults change', () => {
    const key = panelKey('video', 'source-monitor');
    const store = useDockablePanelStore.getState();
    store.registerPanelDefaults([{
      workspaceId: 'video',
      panelId: 'source-monitor',
      mode: 'hidden',
      dockZone: 'center',
      floatingRect: { x: 40, y: 80, width: 420, height: 320 },
      minSize: { width: 320, height: 200 },
    }]);

    expect(useDockablePanelStore.getState().layouts[key].mode).toBe('hidden');

    useDockablePanelStore.getState().registerPanelDefaults([{
      workspaceId: 'video',
      panelId: 'source-monitor',
      mode: 'docked',
      dockZone: 'center',
      floatingRect: { x: 40, y: 80, width: 420, height: 320 },
      minSize: { width: 320, height: 200 },
    }]);

    expect(useDockablePanelStore.getState().layouts[key].mode).toBe('docked');
  });

  it('floats, moves, and resizes panels without clamping position to the owner viewport', () => {
    const store = useDockablePanelStore.getState();
    store.registerPanelDefaults(defaults);
    store.floatPanel('image', 'layers', { x: 760, y: 560 }, { width: 900, height: 700 });
    store.moveFloatingPanel('image', 'layers', 200, 200, { width: 900, height: 700 });
    store.resizeFloatingPanel(
      'image',
      'layers',
      { edgeX: 1, edgeY: 1, deltaX: 900, deltaY: 900 },
      { width: 900, height: 700 },
    );

    expect(useDockablePanelStore.getState().layouts[panelKey('image', 'layers')]).toMatchObject({
      mode: 'floating',
      floatingRect: { x: 960, y: 760, width: 774, height: 602 },
    });
  });

  it('resizes docked bottom and side panels through controlled layout state', () => {
    const store = useDockablePanelStore.getState();
    store.registerPanelDefaults([
      {
        workspaceId: 'video',
        panelId: 'timeline',
        dockZone: 'bottom' as const,
        floatingRect: { x: 40, y: 600, width: 1120, height: 420 },
        minSize: { width: 520, height: 320 },
      },
      {
        workspaceId: 'video',
        panelId: 'project-source-bin',
        dockZone: 'left' as const,
        floatingRect: { x: 16, y: 80, width: 280, height: 720 },
        minSize: { width: 240, height: 260 },
      },
    ]);

    const resizeDockedPanel = (useDockablePanelStore.getState() as {
      resizeDockedPanel?: (
        workspaceId: string,
        panelId: string,
        resize: { edgeX: -1 | 0 | 1; edgeY: -1 | 0 | 1; deltaX: number; deltaY: number },
        viewport: { width: number; height: number },
      ) => void;
    }).resizeDockedPanel;

    expect(resizeDockedPanel).toBeTypeOf('function');
    resizeDockedPanel?.(
      'video',
      'timeline',
      { edgeX: 0, edgeY: -1, deltaX: 0, deltaY: -160 },
      { width: 1600, height: 1000 },
    );
    resizeDockedPanel?.(
      'video',
      'project-source-bin',
      { edgeX: 1, edgeY: 0, deltaX: 180, deltaY: 0 },
      { width: 1600, height: 1000 },
    );

    expect(useDockablePanelStore.getState().layouts[panelKey('video', 'timeline')].floatingRect.height).toBe(580);
    expect(useDockablePanelStore.getState().layouts[panelKey('video', 'project-source-bin')].floatingRect.width).toBe(460);
  });

  it('resizes adjacent center-docked split panels from the divider between them', () => {
    const store = useDockablePanelStore.getState();
    store.registerPanelDefaults([
      {
        workspaceId: 'video',
        panelId: 'source-monitor',
        dockZone: 'center' as const,
        floatingRect: { x: 0, y: 0, width: 480, height: 320 },
        minSize: { width: 320, height: 200 },
      },
      {
        workspaceId: 'video',
        panelId: 'program-monitor',
        dockZone: 'center' as const,
        floatingRect: { x: 480, y: 0, width: 480, height: 320 },
        minSize: { width: 420, height: 240 },
      },
    ]);

    store.resizeDockedPanel(
      'video',
      'source-monitor',
      { edgeX: 1, edgeY: 0, deltaX: 60, deltaY: 0 },
      { width: 1600, height: 1000 },
    );

    const source = useDockablePanelStore.getState().layouts[panelKey('video', 'source-monitor')];
    const program = useDockablePanelStore.getState().layouts[panelKey('video', 'program-monitor')];

    expect(source.floatingRect.width).toBe(540);
    expect(program.floatingRect.width).toBe(420);
    expect(source.floatingRect.width + program.floatingRect.width).toBe(960);
  });

  it('resizes every docked panel in the same side column to prevent stacked panel width jumps', () => {
    const store = useDockablePanelStore.getState();
    store.registerPanelDefaults([
      {
        workspaceId: 'image',
        panelId: 'layers',
        dockZone: 'right' as const,
        floatingRect: { x: 0, y: 0, width: 320, height: 420 },
        minSize: { width: 240, height: 180 },
      },
      {
        workspaceId: 'image',
        panelId: 'properties',
        dockZone: 'right' as const,
        floatingRect: { x: 0, y: 430, width: 320, height: 420 },
        minSize: { width: 260, height: 180 },
      },
      {
        workspaceId: 'image',
        panelId: 'tools',
        dockZone: 'left' as const,
        floatingRect: { x: 0, y: 0, width: 280, height: 420 },
      },
    ]);

    store.resizeDockedPanel(
      'image',
      'layers',
      { edgeX: -1, edgeY: 0, deltaX: -80, deltaY: 0 },
      { width: 1600, height: 1000 },
    );

    expect(useDockablePanelStore.getState().layouts[panelKey('image', 'layers')].floatingRect.width).toBe(400);
    expect(useDockablePanelStore.getState().layouts[panelKey('image', 'properties')].floatingRect.width).toBe(400);
    expect(useDockablePanelStore.getState().layouts[panelKey('image', 'tools')].floatingRect.width).toBe(280);
  });

  it('does not change docked side-panel z-order when a docked panel receives pointer focus', () => {
    const store = useDockablePanelStore.getState();
    store.registerPanelDefaults([
      {
        workspaceId: 'image',
        panelId: 'layers',
        dockZone: 'right' as const,
        floatingRect: { x: 0, y: 0, width: 320, height: 420 },
      },
      {
        workspaceId: 'image',
        panelId: 'properties',
        dockZone: 'right' as const,
        floatingRect: { x: 0, y: 430, width: 320, height: 420 },
      },
    ]);

    const before = Object.values(useDockablePanelStore.getState().layouts)
      .filter((layout) => layout.workspaceId === 'image' && layout.dockZone === 'right')
      .sort((a, b) => a.zOrder - b.zOrder)
      .map((layout) => `${layout.panelId}:${layout.zOrder}`);

    store.bringPanelToFront('image', 'layers');

    const after = Object.values(useDockablePanelStore.getState().layouts)
      .filter((layout) => layout.workspaceId === 'image' && layout.dockZone === 'right')
      .sort((a, b) => a.zOrder - b.zOrder)
      .map((layout) => `${layout.panelId}:${layout.zOrder}`);

    expect(after).toEqual(before);
  });

  it('brings floating panels to the front by increasing z-order', () => {
    const store = useDockablePanelStore.getState();
    store.registerPanelDefaults(defaults);
    store.floatPanel('image', 'layers');
    store.floatPanel('image', 'assets');
    const before = useDockablePanelStore.getState().layouts[panelKey('image', 'layers')].zOrder;
    store.bringPanelToFront('image', 'layers');
    const after = useDockablePanelStore.getState().layouts[panelKey('image', 'layers')].zOrder;

    expect(after).toBeGreaterThan(before);
    expect(after).toBeGreaterThan(useDockablePanelStore.getState().layouts[panelKey('image', 'assets')].zOrder);
  });

  it('docks, hides, collapses, and resets panels to registered defaults', () => {
    const store = useDockablePanelStore.getState();
    store.registerPanelDefaults(defaults);
    store.floatPanel('image', 'layers');
    store.dockPanel('image', 'layers', 'left');
    expect(useDockablePanelStore.getState().layouts[panelKey('image', 'layers')]).toMatchObject({
      mode: 'docked',
      dockZone: 'left',
    });

    store.collapsePanel('image', 'layers');
    expect(useDockablePanelStore.getState().layouts[panelKey('image', 'layers')].mode).toBe('collapsed');

    store.hidePanel('image', 'layers');
    expect(useDockablePanelStore.getState().layouts[panelKey('image', 'layers')].mode).toBe('hidden');

    store.resetPanelLayout('image', 'layers');
    expect(useDockablePanelStore.getState().layouts[panelKey('image', 'layers')]).toMatchObject({
      mode: 'docked',
      dockZone: 'right',
      floatingRect: { x: 100, y: 80, width: 300, height: 400 },
    });
  });

  it('stacks snapped side panels before or after existing dock layers', () => {
    const store = useDockablePanelStore.getState();
    store.registerPanelDefaults([
      ...defaults,
      {
        workspaceId: 'image',
        panelId: 'history',
        dockZone: 'right' as const,
        floatingRect: { x: 260, y: 160, width: 280, height: 300 },
      },
    ]);

    store.dockPanel('image', 'assets', 'left');
    store.dockPanel('image', 'history', 'left');
    store.snapPanelToDockTarget('image', 'layers', {
      mode: 'docked',
      dockZone: 'left',
      placement: 'before',
      referencePanelId: 'assets',
    });

    const leftPanels = Object.values(useDockablePanelStore.getState().layouts)
      .filter((layout) => layout.workspaceId === 'image' && layout.dockZone === 'left')
      .sort((a, b) => a.zOrder - b.zOrder)
      .map((layout) => layout.panelId);

    expect(leftPanels).toEqual(['layers', 'assets', 'history']);

    store.snapPanelToDockTarget('image', 'layers', {
      mode: 'docked',
      dockZone: 'left',
      placement: 'after',
      referencePanelId: 'history',
    });

    const reorderedLeftPanels = Object.values(useDockablePanelStore.getState().layouts)
      .filter((layout) => layout.workspaceId === 'image' && layout.dockZone === 'left')
      .sort((a, b) => a.zOrder - b.zOrder)
      .map((layout) => layout.panelId);

    expect(reorderedLeftPanels).toEqual(['assets', 'history', 'layers']);
  });

  it('resets all panels in a workspace without affecting other registered defaults', () => {
    const store = useDockablePanelStore.getState();
    store.registerPanelDefaults([...defaults, { workspaceId: 'paper', panelId: 'inspector', dockZone: 'right' as const }]);
    store.hidePanel('image', 'layers');
    store.hidePanel('paper', 'inspector');
    store.resetWorkspacePanels('image');

    expect(useDockablePanelStore.getState().layouts[panelKey('image', 'layers')].mode).toBe('docked');
    expect(useDockablePanelStore.getState().layouts[panelKey('paper', 'inspector')].mode).toBe('hidden');
  });

  it('applies workspace view defaults for recovery and focused editing', () => {
    const store = useDockablePanelStore.getState();
    store.registerPanelDefaults([
      {
        workspaceId: 'video',
        panelId: 'project-source-bin',
        dockZone: 'left' as const,
        mode: 'docked' as const,
      },
      {
        workspaceId: 'video',
        panelId: 'program-monitor',
        dockZone: 'center' as const,
        mode: 'docked' as const,
      },
      {
        workspaceId: 'video',
        panelId: 'timeline',
        dockZone: 'bottom' as const,
        mode: 'docked' as const,
      },
      {
        workspaceId: 'video',
        panelId: 'diagnostics',
        dockZone: 'right' as const,
        mode: 'hidden' as const,
      },
      {
        workspaceId: 'paper',
        panelId: 'inspector',
        dockZone: 'right' as const,
        mode: 'docked' as const,
      },
    ]);

    store.floatPanel('video', 'project-source-bin', { x: 2000, y: 1600, width: 1600, height: 1200 }, { width: 1280, height: 720 });
    store.hidePanel('video', 'timeline');
    store.dockPanel('video', 'diagnostics', 'right');

    const applyWorkspaceViewDefault = (useDockablePanelStore.getState() as {
      applyWorkspaceViewDefault?: (workspaceId: string, preset: 'reset' | 'balanced' | 'focus' | 'all-panels') => void;
    }).applyWorkspaceViewDefault;

    expect(applyWorkspaceViewDefault).toBeTypeOf('function');
    applyWorkspaceViewDefault?.('video', 'focus');

    expect(useDockablePanelStore.getState().layouts[panelKey('video', 'program-monitor')]).toMatchObject({
      mode: 'docked',
      dockZone: 'center',
    });
    expect(useDockablePanelStore.getState().layouts[panelKey('video', 'timeline')]).toMatchObject({
      mode: 'docked',
      dockZone: 'bottom',
    });
    expect(useDockablePanelStore.getState().layouts[panelKey('video', 'project-source-bin')].mode).toBe('hidden');
    expect(useDockablePanelStore.getState().layouts[panelKey('video', 'diagnostics')].mode).toBe('hidden');
    expect(useDockablePanelStore.getState().layouts[panelKey('paper', 'inspector')].mode).toBe('docked');

    applyWorkspaceViewDefault?.('video', 'all-panels');
    expect(useDockablePanelStore.getState().layouts[panelKey('video', 'project-source-bin')]).toMatchObject({
      mode: 'docked',
      dockZone: 'left',
    });
    expect(useDockablePanelStore.getState().layouts[panelKey('video', 'diagnostics')]).toMatchObject({
      mode: 'docked',
      dockZone: 'right',
    });

    applyWorkspaceViewDefault?.('video', 'balanced');
    expect(useDockablePanelStore.getState().layouts[panelKey('video', 'diagnostics')].mode).toBe('hidden');

    store.hidePanel('video', 'program-monitor');
    applyWorkspaceViewDefault?.('video', 'reset');
    expect(useDockablePanelStore.getState().layouts[panelKey('video', 'program-monitor')].mode).toBe('docked');
  });
});
