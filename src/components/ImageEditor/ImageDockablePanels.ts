import type { DockablePanelDefinition } from '../DockablePanel/DockablePanelHost';
import type { DockablePanelLayout, DockablePanelMode, DockZone } from '../../lib/dockablePanel';

export const IMAGE_DOCKABLE_WORKSPACE_ID = 'image';

export const IMAGE_DOCKABLE_PANEL_IDS = {
  tools: 'tools',
  layers: 'layers',
  properties: 'properties',
  brushes: 'brushes',
  channels: 'channels',
  paths: 'paths',
  history: 'history',
  assets: 'assets',
} as const;

export type ImageDockablePanelId = (typeof IMAGE_DOCKABLE_PANEL_IDS)[keyof typeof IMAGE_DOCKABLE_PANEL_IDS];

export type ImageDockablePanelDefinitionInput = Omit<DockablePanelDefinition, 'content'>;

export type ImageLayoutPresetId =
  | 'quick-edit'
  | 'full-suite'
  | 'retouching'
  | 'painting'
  | 'typography'
  | 'print-prep';

export interface ImageWorkspaceLayoutState {
  toolbarVisible: boolean;
  rightPanelVisible: boolean;
  assetBarVisible: boolean;
}

export interface ImageLayoutPreset {
  id: ImageLayoutPresetId;
  label: string;
  description: string;
  layout: ImageWorkspaceLayoutState;
  panelModes: Record<ImageDockablePanelId, DockablePanelMode>;
}

export interface ImageDockablePanelTabGroup {
  id: string;
  label: string;
  panelIds: readonly ImageDockablePanelId[];
  activePanelId: ImageDockablePanelId;
}

export interface ImageDockedPanelColumnContract {
  dockZone: DockZone;
  panelIds: readonly ImageDockablePanelId[];
  scrollMode: 'shared-column';
  equalWidth: true;
  itemScrollMode: 'content-only';
  orderPersistence: 'zOrder';
}

export interface CreateImageDockablePanelDefinitionsOptions {
  enableTabbedPanelGroups?: boolean;
  layoutByPanelId?: Partial<Record<ImageDockablePanelId, Pick<DockablePanelLayout, 'mode' | 'dockZone' | 'zOrder'>>>;
}

const IMAGE_FLOATING_PANEL_WIDTH_CLASS_NAME = 'w-72';
const IMAGE_SHARED_DOCKED_COLUMN_WIDTH_CLASS_NAME = 'w-full';
const IMAGE_FLOATING_PANEL_BODY_CLASS_NAME = 'min-h-0 overflow-hidden p-0';
const IMAGE_SHARED_DOCKED_COLUMN_BODY_CLASS_NAME = 'min-h-0 overflow-visible p-0';
// Includes the edit-actions row (Undo/Redo/Cut/Copy/Paste, ~96px) above the tool grid + the colour well.
const IMAGE_TOOLS_PALETTE_HEIGHT_PX = 588;

export const IMAGE_DOCKED_PANEL_COLUMN_PANEL_IDS = [
  IMAGE_DOCKABLE_PANEL_IDS.layers,
  IMAGE_DOCKABLE_PANEL_IDS.properties,
  IMAGE_DOCKABLE_PANEL_IDS.brushes,
  IMAGE_DOCKABLE_PANEL_IDS.channels,
  IMAGE_DOCKABLE_PANEL_IDS.paths,
  IMAGE_DOCKABLE_PANEL_IDS.history,
] as const;

const IMAGE_DOCKED_PANEL_COLUMN_PANEL_ID_SET = new Set<ImageDockablePanelId>(IMAGE_DOCKED_PANEL_COLUMN_PANEL_IDS);

const IMAGE_DOCKABLE_PANEL_BASE_DEFINITIONS: ImageDockablePanelDefinitionInput[] = [
  {
    workspaceId: IMAGE_DOCKABLE_WORKSPACE_ID,
    panelId: IMAGE_DOCKABLE_PANEL_IDS.tools,
    title: 'Tools',
    mode: 'floating',
    dockZone: 'left',
    floatingRect: { x: 368, y: 112, width: 66, height: IMAGE_TOOLS_PALETTE_HEIGHT_PX },
    minSize: { width: 66, height: IMAGE_TOOLS_PALETTE_HEIGHT_PX },
    allowedDockZones: [],
    chrome: 'compact-floating',
    fixedSize: true,
    bodyClassName: 'min-h-0 overflow-hidden p-0',
  },
  {
    workspaceId: IMAGE_DOCKABLE_WORKSPACE_ID,
    panelId: IMAGE_DOCKABLE_PANEL_IDS.layers,
    title: 'Layers',
    dockZone: 'right',
    floatingRect: { x: 1120, y: 96, width: 300, height: 560 },
    minSize: { width: 224, height: 220 },
    allowedDockZones: ['right', 'left', 'bottom'],
  },
  {
    workspaceId: IMAGE_DOCKABLE_WORKSPACE_ID,
    panelId: IMAGE_DOCKABLE_PANEL_IDS.properties,
    title: 'Properties / Tool Options',
    dockZone: 'right',
    floatingRect: { x: 1120, y: 680, width: 300, height: 380 },
    minSize: { width: 224, height: 180 },
    allowedDockZones: ['right', 'left', 'bottom'],
  },
  {
    workspaceId: IMAGE_DOCKABLE_WORKSPACE_ID,
    panelId: IMAGE_DOCKABLE_PANEL_IDS.brushes,
    title: 'Brushes',
    dockZone: 'right',
    floatingRect: { x: 1120, y: 300, width: 300, height: 360 },
    minSize: { width: 224, height: 200 },
    allowedDockZones: ['right', 'left', 'bottom'],
  },
  {
    workspaceId: IMAGE_DOCKABLE_WORKSPACE_ID,
    panelId: IMAGE_DOCKABLE_PANEL_IDS.channels,
    title: 'Channels',
    dockZone: 'right',
    floatingRect: { x: 1120, y: 500, width: 300, height: 320 },
    minSize: { width: 224, height: 220 },
    allowedDockZones: ['right', 'left', 'bottom'],
  },
  {
    workspaceId: IMAGE_DOCKABLE_WORKSPACE_ID,
    panelId: IMAGE_DOCKABLE_PANEL_IDS.paths,
    title: 'Paths',
    dockZone: 'right',
    floatingRect: { x: 1120, y: 420, width: 300, height: 280 },
    minSize: { width: 224, height: 220 },
    allowedDockZones: ['right', 'left', 'bottom'],
  },
  {
    workspaceId: IMAGE_DOCKABLE_WORKSPACE_ID,
    panelId: IMAGE_DOCKABLE_PANEL_IDS.history,
    title: 'History',
    dockZone: 'right',
    floatingRect: { x: 1120, y: 540, width: 300, height: 320 },
    minSize: { width: 224, height: 220 },
    allowedDockZones: ['right', 'left', 'bottom'],
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

export const IMAGE_DOCKABLE_PANEL_DEFINITIONS: ImageDockablePanelDefinitionInput[] = IMAGE_DOCKABLE_PANEL_BASE_DEFINITIONS.map((panel) =>
  getResolvedImageDockablePanelDefinition(panel, null),
);

export const IMAGE_DOCKABLE_PANEL_TAB_GROUPS: readonly ImageDockablePanelTabGroup[] = [
  {
    id: 'image-layer-channel-path-tabs',
    label: 'Layers / Channels / Paths',
    panelIds: [
      IMAGE_DOCKABLE_PANEL_IDS.layers,
      IMAGE_DOCKABLE_PANEL_IDS.channels,
      IMAGE_DOCKABLE_PANEL_IDS.paths,
    ],
    activePanelId: IMAGE_DOCKABLE_PANEL_IDS.layers,
  },
];

export function getImageDockedPanelColumnContract(
  layoutByPanelId: CreateImageDockablePanelDefinitionsOptions['layoutByPanelId'] = {},
): ImageDockedPanelColumnContract {
  return {
    dockZone: 'right',
    panelIds: [...IMAGE_DOCKED_PANEL_COLUMN_PANEL_IDS].sort((leftPanelId, rightPanelId) => {
      const leftOrder = resolveImageDockedPanelColumnOrder(leftPanelId, layoutByPanelId[leftPanelId] ?? null);
      const rightOrder = resolveImageDockedPanelColumnOrder(rightPanelId, layoutByPanelId[rightPanelId] ?? null);
      return leftOrder - rightOrder || leftPanelId.localeCompare(rightPanelId);
    }),
    scrollMode: 'shared-column',
    equalWidth: true,
    itemScrollMode: 'content-only',
    orderPersistence: 'zOrder',
  };
}

export function createImageDockablePanelDefinitions(
  options: CreateImageDockablePanelDefinitionsOptions = {},
): ImageDockablePanelDefinitionInput[] {
  return IMAGE_DOCKABLE_PANEL_BASE_DEFINITIONS.map((panel) => {
    const basePanel = getResolvedImageDockablePanelDefinition(
      panel,
      options.layoutByPanelId?.[panel.panelId as ImageDockablePanelId] ?? null,
    );
    if (!options.enableTabbedPanelGroups) {
      return basePanel;
    }

    const tabGroup = getImageDockablePanelTabGroup(panel.panelId as ImageDockablePanelId);
    if (!tabGroup) {
      return basePanel;
    }

    return {
      ...basePanel,
      tabGroupId: tabGroup.id,
      tabGroupOrder: tabGroup.panelIds.indexOf(panel.panelId as ImageDockablePanelId),
      tabGroupActive: panel.panelId === tabGroup.activePanelId,
    };
  });
}

export function getImageDockablePanelDefinition(
  panelId: ImageDockablePanelId,
  layout: Pick<DockablePanelLayout, 'mode' | 'dockZone' | 'zOrder'> | null = null,
) {
  const definition = IMAGE_DOCKABLE_PANEL_BASE_DEFINITIONS.find((panel) => panel.panelId === panelId);
  return definition ? getResolvedImageDockablePanelDefinition(definition, layout) : null;
}

export function getImageDockablePanelTabGroup(panelId: ImageDockablePanelId): ImageDockablePanelTabGroup | null {
  return IMAGE_DOCKABLE_PANEL_TAB_GROUPS.find((group) => group.panelIds.includes(panelId)) ?? null;
}

export function resolveImagePanelsForWorkspaceChrome<TPanel extends { panelId: string }>(
  panels: readonly TPanel[],
  showWorkspaceChrome: boolean,
): TPanel[] {
  if (showWorkspaceChrome) return [...panels];
  return panels.filter((panel) => panel.panelId === IMAGE_DOCKABLE_PANEL_IDS.tools);
}

function getResolvedImageDockablePanelDefinition(
  panel: ImageDockablePanelDefinitionInput,
  layout: Pick<DockablePanelLayout, 'mode' | 'dockZone' | 'zOrder'> | null,
): ImageDockablePanelDefinitionInput {
  if (!IMAGE_DOCKED_PANEL_COLUMN_PANEL_ID_SET.has(panel.panelId as ImageDockablePanelId)) {
    return {
      ...panel,
      className: panel.className,
      bodyClassName: panel.bodyClassName,
    };
  }

  if (isImageDockedPanelSharedColumnLayout(layout)) {
    return {
      ...panel,
      className: IMAGE_SHARED_DOCKED_COLUMN_WIDTH_CLASS_NAME,
      bodyClassName: IMAGE_SHARED_DOCKED_COLUMN_BODY_CLASS_NAME,
    };
  }

  return {
    ...panel,
    className: IMAGE_FLOATING_PANEL_WIDTH_CLASS_NAME,
    bodyClassName: panel.panelId === IMAGE_DOCKABLE_PANEL_IDS.properties
      ? IMAGE_FLOATING_PANEL_BODY_CLASS_NAME
      : panel.bodyClassName,
  };
}

function isImageDockedPanelSharedColumnLayout(
  layout: Pick<DockablePanelLayout, 'mode' | 'dockZone' | 'zOrder'> | null,
): boolean {
  if (!layout) return false;
  return (layout.mode === 'docked' || layout.mode === 'collapsed') && (layout.dockZone === 'left' || layout.dockZone === 'right');
}

function resolveImageDockedPanelColumnOrder(
  panelId: ImageDockablePanelId,
  layout: Pick<DockablePanelLayout, 'mode' | 'dockZone' | 'zOrder'> | null,
): number {
  if (isImageDockedPanelSharedColumnLayout(layout) && typeof layout?.zOrder === 'number') {
    return layout.zOrder;
  }
  return IMAGE_DOCKED_PANEL_COLUMN_PANEL_IDS.indexOf(panelId as (typeof IMAGE_DOCKED_PANEL_COLUMN_PANEL_IDS)[number]);
}

export const IMAGE_LAYOUT_PRESETS: ImageLayoutPreset[] = [
  {
    id: 'quick-edit',
    label: 'Quick Edit',
    description: 'Maximum canvas space with only the fixed tools palette visible.',
    layout: { toolbarVisible: true, rightPanelVisible: false, assetBarVisible: false },
    panelModes: {
      tools: 'floating',
      brushes: 'hidden',
      layers: 'hidden',
      properties: 'hidden',
      channels: 'hidden',
      paths: 'hidden',
      history: 'hidden',
      assets: 'hidden',
    },
  },
  {
    id: 'full-suite',
    label: 'Full Suite',
    description: 'All Image panels visible for source handoff and layer work.',
    layout: { toolbarVisible: true, rightPanelVisible: true, assetBarVisible: true },
    panelModes: {
      tools: 'floating',
      brushes: 'docked',
      layers: 'docked',
      properties: 'docked',
      channels: 'docked',
      paths: 'docked',
      history: 'docked',
      assets: 'docked',
    },
  },
  {
    id: 'retouching',
    label: 'Retouching',
    description: 'Tools, layers, and properties visible; source handoff hidden.',
    layout: { toolbarVisible: true, rightPanelVisible: true, assetBarVisible: false },
    panelModes: {
      tools: 'floating',
      brushes: 'docked',
      layers: 'docked',
      properties: 'docked',
      channels: 'docked',
      paths: 'docked',
      history: 'docked',
      assets: 'hidden',
    },
  },
  {
    id: 'painting',
    label: 'Painting',
    description: 'Brush/tool controls and layers visible with handoff hidden.',
    layout: { toolbarVisible: true, rightPanelVisible: true, assetBarVisible: false },
    panelModes: {
      tools: 'floating',
      brushes: 'docked',
      layers: 'docked',
      properties: 'docked',
      channels: 'docked',
      paths: 'docked',
      history: 'docked',
      assets: 'hidden',
    },
  },
  {
    id: 'typography',
    label: 'Typography',
    description: 'Text/tool properties and layers visible for type work.',
    layout: { toolbarVisible: true, rightPanelVisible: true, assetBarVisible: false },
    panelModes: {
      tools: 'floating',
      brushes: 'docked',
      layers: 'docked',
      properties: 'docked',
      channels: 'docked',
      paths: 'docked',
      history: 'docked',
      assets: 'hidden',
    },
  },
  {
    id: 'print-prep',
    label: 'Print Prep',
    description: 'Layers, properties, and asset handoff visible for export checks.',
    layout: { toolbarVisible: true, rightPanelVisible: true, assetBarVisible: true },
    panelModes: {
      tools: 'floating',
      brushes: 'docked',
      layers: 'docked',
      properties: 'docked',
      channels: 'docked',
      paths: 'docked',
      history: 'docked',
      assets: 'docked',
    },
  },
];

export function getImageLayoutPreset(presetId: ImageLayoutPresetId): ImageLayoutPreset | undefined {
  return IMAGE_LAYOUT_PRESETS.find((preset) => preset.id === presetId);
}

export function getImageLayoutPresetIdForLayout(layout: ImageWorkspaceLayoutState): ImageLayoutPresetId | 'custom' {
  const matchingPreset = IMAGE_LAYOUT_PRESETS.find((preset) => (
    preset.layout.toolbarVisible === layout.toolbarVisible
    && preset.layout.rightPanelVisible === layout.rightPanelVisible
    && preset.layout.assetBarVisible === layout.assetBarVisible
  ));
  return matchingPreset?.id ?? 'custom';
}
