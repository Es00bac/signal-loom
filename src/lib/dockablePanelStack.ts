const PREFERRED_CENTER_PANEL_IDS = ['program-monitor'] as const;

export function shouldSplitDockZoneLayouts<T extends { panelId: string }>(
  zone: string,
  zoneLayouts: T[],
  isSplitCapablePanel: (panelId: string) => boolean,
): boolean {
  return zone === 'center'
    && zoneLayouts.length > 1
    && zoneLayouts.every((layout) => isSplitCapablePanel(layout.panelId));
}

export function resolveActiveDockZoneLayout<T extends { panelId: string }>(
  zoneLayouts: T[],
  activePanelId: string | null,
): T | undefined {
  return zoneLayouts.find((layout) => layout.panelId === activePanelId)
    ?? PREFERRED_CENTER_PANEL_IDS
      .map((panelId) => zoneLayouts.find((layout) => layout.panelId === panelId))
      .find((layout): layout is T => Boolean(layout))
    ?? zoneLayouts[0];
}
