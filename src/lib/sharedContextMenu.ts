export type SharedContextMenuTone = 'default' | 'danger';

export interface SharedContextMenuItem {
  id: string;
  label: string;
  action?: () => void;
  disabled?: boolean;
  hidden?: boolean;
  tone?: SharedContextMenuTone;
}

export interface ContextMenuPoint {
  x: number;
  y: number;
}

export interface ContextMenuSize {
  width: number;
  height: number;
}

const VIEWPORT_PADDING = 12;

export function normalizeContextMenuItems(items: SharedContextMenuItem[]): SharedContextMenuItem[] {
  return items
    .filter((item) => !item.hidden)
    .map((item) => ({
      ...item,
      disabled: item.disabled ?? false,
      tone: item.tone ?? 'default',
      action: item.disabled ? undefined : item.action,
    }));
}

export function clampContextMenuPosition(
  point: ContextMenuPoint,
  viewport: ContextMenuSize,
  menuSize: ContextMenuSize,
): ContextMenuPoint {
  return {
    x: clamp(point.x, VIEWPORT_PADDING, Math.max(VIEWPORT_PADDING, viewport.width - menuSize.width - VIEWPORT_PADDING)),
    y: clamp(point.y, VIEWPORT_PADDING, Math.max(VIEWPORT_PADDING, viewport.height - menuSize.height - VIEWPORT_PADDING)),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
