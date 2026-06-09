import type { DockablePanelDefinition } from '../DockablePanel/DockablePanelHost';

export const IMAGE_DOCKABLE_WORKSPACE_ID = 'image';

export const IMAGE_DOCKABLE_PANEL_IDS = {
  tools: 'tools',
  layers: 'layers',
  properties: 'properties',
  assets: 'assets',
} as const;

export type ImageDockablePanelId = (typeof IMAGE_DOCKABLE_PANEL_IDS)[keyof typeof IMAGE_DOCKABLE_PANEL_IDS];

export type ImageDockablePanelDefinitionInput = Omit<DockablePanelDefinition, 'content'>;

export const IMAGE_DOCKABLE_PANEL_DEFINITIONS: ImageDockablePanelDefinitionInput[] = [
  {
    workspaceId: IMAGE_DOCKABLE_WORKSPACE_ID,
    panelId: IMAGE_DOCKABLE_PANEL_IDS.tools,
    title: 'Tools',
    dockZone: 'left',
    floatingRect: { x: 72, y: 96, width: 104, height: 620 },
    minSize: { width: 64, height: 240 },
    allowedDockZones: ['left', 'right', 'top', 'bottom'],
    className: 'h-auto w-20',
  },
  {
    workspaceId: IMAGE_DOCKABLE_WORKSPACE_ID,
    panelId: IMAGE_DOCKABLE_PANEL_IDS.layers,
    title: 'Layers',
    dockZone: 'right',
    floatingRect: { x: 1120, y: 96, width: 300, height: 560 },
    minSize: { width: 224, height: 220 },
    allowedDockZones: ['right', 'left', 'bottom'],
    className: 'w-72',
  },
  {
    workspaceId: IMAGE_DOCKABLE_WORKSPACE_ID,
    panelId: IMAGE_DOCKABLE_PANEL_IDS.properties,
    title: 'Properties / Tool Options',
    dockZone: 'right',
    floatingRect: { x: 1120, y: 680, width: 300, height: 380 },
    minSize: { width: 224, height: 180 },
    allowedDockZones: ['right', 'left', 'bottom'],
    className: 'w-72',
    bodyClassName: 'min-h-0 overflow-hidden p-0',
  },
  {
    workspaceId: IMAGE_DOCKABLE_WORKSPACE_ID,
    panelId: IMAGE_DOCKABLE_PANEL_IDS.assets,
    title: 'Asset / Source Handoff',
    dockZone: 'bottom',
    floatingRect: { x: 220, y: 720, width: 960, height: 170 },
    minSize: { width: 420, height: 96 },
    allowedDockZones: ['bottom', 'top'],
    className: 'h-28',
  },
];

export function getImageDockablePanelDefinition(panelId: ImageDockablePanelId) {
  return IMAGE_DOCKABLE_PANEL_DEFINITIONS.find((panel) => panel.panelId === panelId) ?? null;
}
