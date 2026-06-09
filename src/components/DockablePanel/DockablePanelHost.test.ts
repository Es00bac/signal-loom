import { beforeEach, describe, expect, it } from 'vitest';
import type { DockablePanelLayout } from '../../lib/dockablePanel';
import {
  resolveActiveDockZoneLayout,
  shouldSplitDockZoneLayouts,
} from '../../lib/dockablePanelStack';
import { useDockablePanelStore } from '../../store/dockablePanelStore';

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
  beforeEach(() => {
    useDockablePanelStore.setState({ defaults: {}, layouts: {} });
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
});
