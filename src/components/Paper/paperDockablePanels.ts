import type { DockablePanelDefault, DockablePanelLayout } from '../../lib/dockablePanel';

export const PAPER_DOCKABLE_WORKSPACE_ID = 'paper';

export const PAPER_DOCKABLE_PANEL_IDS = {
  tools: 'tools',
  documentStrip: 'document-strip',
  inspector: 'inspector',
  preflight: 'preflight',
  linkedAssets: 'linked-assets',
  dtpParity: 'dtp-parity',
  findChange: 'find-change',
} as const;

export type PaperDockablePanelId = typeof PAPER_DOCKABLE_PANEL_IDS[keyof typeof PAPER_DOCKABLE_PANEL_IDS];

export function createPaperDockablePanelDefaults(): DockablePanelDefault[] {
  return [
    {
      workspaceId: PAPER_DOCKABLE_WORKSPACE_ID,
      panelId: PAPER_DOCKABLE_PANEL_IDS.inspector,
      dockZone: 'right',
      floatingRect: { x: 1040, y: 96, width: 340, height: 720 },
      minSize: { width: 260, height: 360 },
    },
    {
      workspaceId: PAPER_DOCKABLE_WORKSPACE_ID,
      panelId: PAPER_DOCKABLE_PANEL_IDS.preflight,
      mode: 'hidden',
      dockZone: 'right',
      floatingRect: { x: 980, y: 128, width: 320, height: 420 },
      minSize: { width: 260, height: 240 },
    },
    {
      workspaceId: PAPER_DOCKABLE_WORKSPACE_ID,
      panelId: PAPER_DOCKABLE_PANEL_IDS.linkedAssets,
      mode: 'hidden',
      dockZone: 'right',
      floatingRect: { x: 1020, y: 168, width: 340, height: 420 },
      minSize: { width: 260, height: 240 },
    },
    {
      workspaceId: PAPER_DOCKABLE_WORKSPACE_ID,
      panelId: PAPER_DOCKABLE_PANEL_IDS.dtpParity,
      mode: 'hidden',
      dockZone: 'right',
      floatingRect: { x: 1060, y: 208, width: 360, height: 520 },
      minSize: { width: 280, height: 260 },
    },
    {
      workspaceId: PAPER_DOCKABLE_WORKSPACE_ID,
      panelId: PAPER_DOCKABLE_PANEL_IDS.findChange,
      mode: 'hidden',
      dockZone: 'right',
      floatingRect: { x: 1000, y: 148, width: 340, height: 400 },
      minSize: { width: 280, height: 240 },
    },
  ];
}

export function getPaperDockableCanvasOffsetClassName(
  sourceBinLayout?: Pick<DockablePanelLayout, 'dockZone' | 'mode'>,
): string {
  if (!sourceBinLayout || sourceBinLayout.dockZone !== 'left') {
    return 'ml-0';
  }

  return sourceBinLayout.mode === 'docked'
    ? 'ml-[22rem]'
    : 'ml-0';
}
