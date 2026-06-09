import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import {
  areDockablePanelLayoutsEqual,
  createDefaultDockablePanelLayout,
  moveFloatingPanelRect,
  nextPanelZOrder,
  normalizeFloatingPanelRect,
  panelKey,
  resizeDockedPanelRect,
  resizeFloatingPanelRect,
  sanitizeDockablePanelLayout,
  type DockablePanelDefault,
  type DockablePanelLayout,
  type DockablePanelMode,
  type DockablePanelSnapTarget,
  type DockZone,
  type PanelRect,
  type ResizeDelta,
  type ViewportSize,
} from '../lib/dockablePanel';

export type WorkspaceViewDefaultPreset = 'reset' | 'balanced' | 'focus' | 'all-panels';

export interface DockablePanelSnapshot {
  layouts: Record<string, DockablePanelLayout>;
}

interface DockablePanelState extends DockablePanelSnapshot {
  defaults: Record<string, DockablePanelLayout>;
  registerPanelDefaults: (defaults: DockablePanelDefault[]) => void;
  setPanelMode: (workspaceId: string, panelId: string, mode: DockablePanelMode) => void;
  dockPanel: (workspaceId: string, panelId: string, zone: DockZone) => void;
  snapPanelToDockTarget: (workspaceId: string, panelId: string, target: DockablePanelSnapTarget) => void;
  floatPanel: (workspaceId: string, panelId: string, rect?: Partial<PanelRect>, viewport?: ViewportSize) => void;
  hidePanel: (workspaceId: string, panelId: string) => void;
  collapsePanel: (workspaceId: string, panelId: string) => void;
  closePanel: (workspaceId: string, panelId: string) => void;
  moveFloatingPanel: (workspaceId: string, panelId: string, deltaX: number, deltaY: number, viewport: ViewportSize) => void;
  resizeFloatingPanel: (workspaceId: string, panelId: string, resize: ResizeDelta, viewport: ViewportSize) => void;
  resizeDockedPanel: (workspaceId: string, panelId: string, resize: ResizeDelta, viewport: ViewportSize) => void;
  bringPanelToFront: (workspaceId: string, panelId: string) => void;
  resetPanelLayout: (workspaceId: string, panelId: string) => void;
  resetWorkspacePanels: (workspaceId: string) => void;
  applyWorkspaceViewDefault: (workspaceId: string, preset: WorkspaceViewDefaultPreset) => void;
  resetAllPanelLayouts: () => void;
}

export const useDockablePanelStore = create<DockablePanelState>()(
  persist(
    (set, get) => ({
      defaults: {},
      layouts: {},
      registerPanelDefaults: (defaults) => {
        const registered = buildRegisteredPanelDefaults(get(), defaults);
        if (!registered.changed) return;
        set({ defaults: registered.defaults, layouts: registered.layouts });
      },
      setPanelMode: (workspaceId, panelId, mode) => {
        updatePanel(set, get, workspaceId, panelId, (layout) => ({ ...layout, mode }));
      },
      dockPanel: (workspaceId, panelId, zone) => {
        updatePanel(set, get, workspaceId, panelId, (layout) => ({
          ...layout,
          mode: 'docked',
          dockZone: zone,
        }));
      },
      snapPanelToDockTarget: (workspaceId, panelId, target) => {
        if (target.mode !== 'docked') {
          return;
        }

        const key = panelKey(workspaceId, panelId);
        set((state) => {
          const current = state.layouts[key] ?? state.defaults[key] ?? createDefaultDockablePanelLayout({ workspaceId, panelId });
          const nextLayouts = { ...state.layouts };
          const dockedCurrent: DockablePanelLayout = {
            ...current,
            mode: 'docked',
            dockZone: target.dockZone,
          };

          const orderedZoneEntries = Object.entries(state.layouts)
            .filter(([entryKey, layout]) => (
              entryKey !== key
              && layout.workspaceId === workspaceId
              && layout.dockZone === target.dockZone
              && (layout.mode === 'docked' || layout.mode === 'collapsed')
            ))
            .sort(([, a], [, b]) => a.zOrder - b.zOrder || a.panelId.localeCompare(b.panelId));

          let insertIndex = orderedZoneEntries.length;
          if (target.placement === 'start') {
            insertIndex = 0;
          } else if ((target.placement === 'before' || target.placement === 'after') && target.referencePanelId) {
            const referenceIndex = orderedZoneEntries.findIndex(([, layout]) => layout.panelId === target.referencePanelId);
            if (referenceIndex >= 0) {
              insertIndex = referenceIndex + (target.placement === 'after' ? 1 : 0);
            }
          }

          const orderedWithCurrent: Array<[string, DockablePanelLayout]> = [...orderedZoneEntries];
          orderedWithCurrent.splice(insertIndex, 0, [key, dockedCurrent]);

          orderedWithCurrent.forEach(([entryKey, layout], index) => {
            nextLayouts[entryKey] = {
              ...layout,
              mode: entryKey === key ? 'docked' : layout.mode,
              dockZone: target.dockZone,
              zOrder: index,
            };
          });

          return { layouts: nextLayouts };
        });
      },
      floatPanel: (workspaceId, panelId, rect, viewport = defaultViewport()) => {
        updatePanel(set, get, workspaceId, panelId, (layout, layouts) => ({
          ...layout,
          mode: 'floating',
          floatingRect: normalizeFloatingPanelRect(
            { ...layout.floatingRect, ...rect },
            viewport,
            layout.minSize,
            { constrainPosition: false },
          ),
          zOrder: nextPanelZOrder(Object.values(layouts)),
        }));
      },
      hidePanel: (workspaceId, panelId) => {
        updatePanel(set, get, workspaceId, panelId, (layout) => ({ ...layout, mode: 'hidden' }));
      },
      collapsePanel: (workspaceId, panelId) => {
        updatePanel(set, get, workspaceId, panelId, (layout) => ({ ...layout, mode: 'collapsed' }));
      },
      closePanel: (workspaceId, panelId) => {
        get().hidePanel(workspaceId, panelId);
      },
      moveFloatingPanel: (workspaceId, panelId, deltaX, deltaY, viewport) => {
        updatePanel(set, get, workspaceId, panelId, (layout) => ({
          ...layout,
          floatingRect: moveFloatingPanelRect(
            layout.floatingRect,
            deltaX,
            deltaY,
            viewport,
            layout.minSize,
            { constrainPosition: false },
          ),
        }));
      },
      resizeFloatingPanel: (workspaceId, panelId, resize, viewport) => {
        updatePanel(set, get, workspaceId, panelId, (layout) => ({
          ...layout,
          floatingRect: resizeFloatingPanelRect(
            layout.floatingRect,
            resize,
            viewport,
            layout.minSize,
            { constrainPosition: false },
          ),
        }));
      },
      resizeDockedPanel: (workspaceId, panelId, resize, viewport) => {
        const key = panelKey(workspaceId, panelId);
        set((state) => {
          const current = state.layouts[key] ?? state.defaults[key] ?? createDefaultDockablePanelLayout({ workspaceId, panelId });
          if (current.dockZone === 'center' && resize.edgeX !== 0) {
            return resizeCenterDockedSplitPanel(state.layouts, current, resize);
          }

          const resizedCurrent = resizeDockedPanelRect(current.floatingRect, current.dockZone, resize, viewport, current.minSize);
          const nextLayouts = { ...state.layouts };

          for (const [entryKey, layout] of Object.entries(state.layouts)) {
            if (
              layout.workspaceId !== workspaceId
              || layout.dockZone !== current.dockZone
              || layout.mode !== 'docked'
            ) {
              continue;
            }

            // Do not link sizes between shared workspace panels (source-bin/bookmarks) and standard tool panels
            const isShared = layout.panelId === 'source-bin' || layout.panelId === 'bookmarks';
            const isCurrentShared = current.panelId === 'source-bin' || current.panelId === 'bookmarks';
            if (isShared !== isCurrentShared) {
              continue;
            }

            nextLayouts[entryKey] = {
              ...layout,
              floatingRect: resizeDockedPanelRectToMatch(layout, resizedCurrent, viewport),
            };
          }

          if (!nextLayouts[key]) {
            nextLayouts[key] = {
              ...current,
              floatingRect: resizedCurrent,
            };
          }

          return { layouts: nextLayouts };
        });
      },
      bringPanelToFront: (workspaceId, panelId) => {
        updatePanel(set, get, workspaceId, panelId, (layout, layouts) => (
          layout.mode === 'floating'
            ? {
                ...layout,
                zOrder: nextPanelZOrder(Object.values(layouts)),
              }
            : layout
        ));
      },
      resetPanelLayout: (workspaceId, panelId) => {
        const key = panelKey(workspaceId, panelId);
        set((state) => ({
          layouts: {
            ...state.layouts,
            [key]: state.defaults[key] ?? createDefaultDockablePanelLayout({ workspaceId, panelId }),
          },
        }));
      },
      resetWorkspacePanels: (workspaceId) => {
        set((state) => {
          const layouts = { ...state.layouts };
          for (const [key, layout] of Object.entries(state.defaults)) {
            if (layout.workspaceId === workspaceId) {
              layouts[key] = layout;
            }
          }
          return { layouts };
        });
      },
      applyWorkspaceViewDefault: (workspaceId, preset) => {
        set((state) => {
          const layouts = { ...state.layouts };
          for (const [key, defaultLayout] of Object.entries(state.defaults)) {
            if (defaultLayout.workspaceId !== workspaceId) continue;
            layouts[key] = createWorkspaceViewDefaultLayout(defaultLayout, preset);
          }
          return { layouts };
        });
      },
      resetAllPanelLayouts: () => {
        set((state) => ({ layouts: { ...state.defaults } }));
      },
    }),
    {
      name: 'signal-loom-dockable-panels',
      storage: createJSONStorage(() => getPanelLayoutStorage()),
      partialize: (state) => ({ layouts: state.layouts }),
      merge: (persisted, current) => ({
        ...current,
        layouts: sanitizePersistedLayouts((persisted as Partial<DockablePanelSnapshot> | undefined)?.layouts, current.layouts),
      }),
    },
  ),
);

function buildRegisteredPanelDefaults(
  state: DockablePanelState,
  defaults: DockablePanelDefault[],
): { defaults: Record<string, DockablePanelLayout>; layouts: Record<string, DockablePanelLayout>; changed: boolean } {
  const nextDefaults = { ...state.defaults };
  const nextLayouts = { ...state.layouts };
  let changed = false;

  for (const input of defaults) {
    const key = panelKey(input.workspaceId, input.panelId);
    const previousDefault = nextDefaults[key];
    const defaultLayout = createDefaultDockablePanelLayout(
      input,
      nextDefaults[key]?.zOrder ?? Object.keys(nextDefaults).length,
    );
    const persistedLayout = nextLayouts[key];
    const nextLayout = previousDefault && areDockablePanelLayoutsEqual(persistedLayout, previousDefault)
      ? defaultLayout
      : mergePersistedLayout(persistedLayout, defaultLayout);
    if (!areDockablePanelLayoutsEqual(nextDefaults[key], defaultLayout)) {
      nextDefaults[key] = defaultLayout;
      changed = true;
    }
    if (!areDockablePanelLayoutsEqual(nextLayouts[key], nextLayout)) {
      nextLayouts[key] = nextLayout;
      changed = true;
    }
  }

  return {
    defaults: changed ? nextDefaults : state.defaults,
    layouts: changed ? nextLayouts : state.layouts,
    changed,
  };
}

function mergePersistedLayout(
  persisted: unknown,
  defaultLayout: DockablePanelLayout,
): DockablePanelLayout {
  return sanitizeDockablePanelLayout(persisted, defaultLayout);
}

function resizeDockedPanelRectToMatch(
  layout: DockablePanelLayout,
  targetRect: PanelRect,
  viewport: ViewportSize,
): PanelRect {
  if (layout.dockZone === 'left' || layout.dockZone === 'right') {
    const targetDelta = targetRect.width - layout.floatingRect.width;
    return resizeDockedPanelRect(
      layout.floatingRect,
      layout.dockZone,
      {
        edgeX: layout.dockZone === 'right' ? -1 : 1,
        edgeY: 0,
        deltaX: layout.dockZone === 'right' ? -targetDelta : targetDelta,
        deltaY: 0,
      },
      viewport,
      layout.minSize,
    );
  }

  if (layout.dockZone === 'top' || layout.dockZone === 'bottom') {
    const targetDelta = targetRect.height - layout.floatingRect.height;
    return resizeDockedPanelRect(
      layout.floatingRect,
      layout.dockZone,
      {
        edgeX: 0,
        edgeY: layout.dockZone === 'bottom' ? -1 : 1,
        deltaX: 0,
        deltaY: layout.dockZone === 'bottom' ? -targetDelta : targetDelta,
      },
      viewport,
      layout.minSize,
    );
  }

  return targetRect;
}

function resizeCenterDockedSplitPanel(
  layouts: Record<string, DockablePanelLayout>,
  current: DockablePanelLayout,
  resize: ResizeDelta,
): { layouts: Record<string, DockablePanelLayout> } {
  const zoneEntries = Object.entries(layouts)
    .filter(([, layout]) => (
      layout.workspaceId === current.workspaceId
      && layout.dockZone === 'center'
      && layout.mode === 'docked'
    ))
    .sort(([, a], [, b]) => a.zOrder - b.zOrder || a.panelId.localeCompare(b.panelId));
  const currentIndex = zoneEntries.findIndex(([, layout]) => layout.panelId === current.panelId);
  const neighborIndex = resize.edgeX > 0 ? currentIndex + 1 : currentIndex - 1;

  if (currentIndex < 0 || neighborIndex < 0 || neighborIndex >= zoneEntries.length) {
    return { layouts };
  }

  const [currentKey, currentLayout] = zoneEntries[currentIndex];
  const [neighborKey, neighborLayout] = zoneEntries[neighborIndex];
  const [leftKey, leftLayout, rightKey, rightLayout] = resize.edgeX > 0
    ? [currentKey, currentLayout, neighborKey, neighborLayout]
    : [neighborKey, neighborLayout, currentKey, currentLayout];
  const totalWidth = Math.max(
    leftLayout.minSize.width + rightLayout.minSize.width,
    leftLayout.floatingRect.width + rightLayout.floatingRect.width,
  );
  const rawLeftWidth = leftLayout.floatingRect.width + (resize.edgeX > 0 ? resize.deltaX : -resize.deltaX);
  const maxLeftWidth = Math.max(leftLayout.minSize.width, totalWidth - rightLayout.minSize.width);
  const nextLeftWidth = clampNumber(rawLeftWidth, leftLayout.minSize.width, maxLeftWidth);
  const nextRightWidth = totalWidth - nextLeftWidth;

  return {
    layouts: {
      ...layouts,
      [leftKey]: {
        ...leftLayout,
        floatingRect: {
          ...leftLayout.floatingRect,
          width: nextLeftWidth,
        },
      },
      [rightKey]: {
        ...rightLayout,
        floatingRect: {
          ...rightLayout.floatingRect,
          width: nextRightWidth,
        },
      },
    },
  };
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(Number.isFinite(value) ? value : min)));
}

function createWorkspaceViewDefaultLayout(
  defaultLayout: DockablePanelLayout,
  preset: WorkspaceViewDefaultPreset,
): DockablePanelLayout {
  if (preset === 'reset' || preset === 'balanced') {
    return defaultLayout;
  }

  if (preset === 'all-panels') {
    return {
      ...defaultLayout,
      mode: 'docked',
    };
  }

  return {
    ...defaultLayout,
    mode: isFocusWorkspacePanel(defaultLayout) ? 'docked' : 'hidden',
  };
}

const FOCUS_WORKSPACE_PANEL_IDS = new Set([
  'bottom-toolbar',
  'document-strip',
  'program-monitor',
  'timeline',
  'tools',
]);

function isFocusWorkspacePanel(layout: DockablePanelLayout): boolean {
  return layout.dockZone === 'center' || FOCUS_WORKSPACE_PANEL_IDS.has(layout.panelId);
}

function sanitizePersistedLayouts(
  persisted: unknown,
  currentLayouts: Record<string, DockablePanelLayout>,
): Record<string, DockablePanelLayout> {
  if (!isRecord(persisted)) return currentLayouts;
  const layouts: Record<string, DockablePanelLayout> = {};
  for (const [key, value] of Object.entries(persisted)) {
    const fallback = currentLayouts[key] ?? fallbackLayoutFromKey(key);
    layouts[key] = sanitizeDockablePanelLayout(value, fallback);
  }
  return layouts;
}

function fallbackLayoutFromKey(key: string): DockablePanelLayout {
  const [workspaceId = 'workspace', panelId = 'panel'] = key.split('/');
  return createDefaultDockablePanelLayout({ workspaceId, panelId });
}

function updatePanel(
  set: (partial: (state: DockablePanelState) => Partial<DockablePanelState>) => void,
  get: () => DockablePanelState,
  workspaceId: string,
  panelId: string,
  updater: (layout: DockablePanelLayout, layouts: Record<string, DockablePanelLayout>) => DockablePanelLayout,
): void {
  const key = panelKey(workspaceId, panelId);
  set((state) => {
    const current = state.layouts[key] ?? state.defaults[key] ?? createDefaultDockablePanelLayout({ workspaceId, panelId });
    const nextLayout = updater(current, state.layouts);
    return {
      layouts: {
        ...state.layouts,
        [key]: nextLayout,
      },
    };
  });
  void get;
}

function defaultViewport(): ViewportSize {
  if (typeof window === 'undefined') return { width: 1280, height: 720 };
  return { width: window.innerWidth, height: window.innerHeight };
}

const memoryPanelStorage = new Map<string, string>();

function getPanelLayoutStorage(): StateStorage {
  let browserStorage: Storage | undefined;
  try {
    browserStorage = typeof globalThis === 'undefined' ? undefined : globalThis.localStorage;
  } catch {
    browserStorage = undefined;
  }
  if (
    browserStorage &&
    typeof browserStorage.getItem === 'function' &&
    typeof browserStorage.setItem === 'function' &&
    typeof browserStorage.removeItem === 'function'
  ) {
    return {
      getItem: (name) => {
        try {
          return browserStorage.getItem(name);
        } catch {
          return null;
        }
      },
      setItem: (name, value) => {
        try {
          browserStorage.setItem(name, value);
        } catch {
          // Ignore unavailable/quota-limited storage during startup.
        }
      },
      removeItem: (name) => {
        try {
          browserStorage.removeItem(name);
        } catch {
          // Ignore unavailable storage during startup.
        }
      },
    };
  }
  return {
    getItem: (name) => memoryPanelStorage.get(name) ?? null,
    setItem: (name, value) => {
      memoryPanelStorage.set(name, value);
    },
    removeItem: (name) => {
      memoryPanelStorage.delete(name);
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
