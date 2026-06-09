import { describe, expect, it } from 'vitest';
import { createDefaultDockablePanelLayout, panelKey } from '../../lib/dockablePanel';
import {
  IMAGE_DOCKABLE_PANEL_DEFINITIONS,
  IMAGE_DOCKABLE_PANEL_IDS,
  IMAGE_DOCKABLE_WORKSPACE_ID,
  getImageDockablePanelDefinition,
} from './ImageDockablePanels';

describe('ImageDockablePanels', () => {
  it('defines the expected Image workspace dockable panels', () => {
    expect(IMAGE_DOCKABLE_PANEL_DEFINITIONS.map((panel) => panel.panelId)).toEqual([
      IMAGE_DOCKABLE_PANEL_IDS.tools,
      IMAGE_DOCKABLE_PANEL_IDS.layers,
      IMAGE_DOCKABLE_PANEL_IDS.properties,
      IMAGE_DOCKABLE_PANEL_IDS.assets,
    ]);
    expect(IMAGE_DOCKABLE_PANEL_DEFINITIONS.every((panel) => panel.workspaceId === IMAGE_DOCKABLE_WORKSPACE_ID)).toBe(true);
  });

  it('preserves the legacy default Image workspace layout zones', () => {
    const layouts = Object.fromEntries(
      IMAGE_DOCKABLE_PANEL_DEFINITIONS.map((panel, index) => [
        panelKey(panel.workspaceId, panel.panelId),
        createDefaultDockablePanelLayout(panel, index),
      ]),
    );

    expect(layouts[panelKey('image', 'tools')]).toMatchObject({ mode: 'docked', dockZone: 'left' });
    expect(layouts[panelKey('image', 'layers')]).toMatchObject({ mode: 'docked', dockZone: 'right' });
    expect(layouts[panelKey('image', 'properties')]).toMatchObject({ mode: 'docked', dockZone: 'right' });
    expect(layouts[panelKey('image', 'assets')]).toMatchObject({ mode: 'docked', dockZone: 'bottom' });
  });

  it('limits panel dock-back zones to sensible Image workspace surfaces', () => {
    expect(getImageDockablePanelDefinition('tools')?.allowedDockZones).toEqual(['left', 'right', 'top', 'bottom']);
    expect(getImageDockablePanelDefinition('layers')?.allowedDockZones).toContain('right');
    expect(getImageDockablePanelDefinition('properties')?.allowedDockZones).toContain('right');
    expect(getImageDockablePanelDefinition('assets')?.allowedDockZones).toEqual(['bottom', 'top']);
  });

  it('lets the Properties panel own one scroll surface when floating or stretched', () => {
    const properties = getImageDockablePanelDefinition('properties');

    expect(properties?.bodyClassName).toBe('min-h-0 overflow-hidden p-0');
  });
});
