export type SharedContextMenuTone = 'default' | 'danger';

export interface SharedContextMenuItem {
  id: string;
  label: string;
  action?: () => void;
  children?: SharedContextMenuItem[];
  shortcut?: string;
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
      children: item.children ? normalizeContextMenuItems(item.children) : undefined,
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
  const maxX = Math.max(VIEWPORT_PADDING, viewport.width - menuSize.width - VIEWPORT_PADDING);
  const maxY = Math.max(VIEWPORT_PADDING, viewport.height - menuSize.height - VIEWPORT_PADDING);
  const opensUpward = point.y + menuSize.height + VIEWPORT_PADDING > viewport.height;
  const preferredY = opensUpward ? point.y - menuSize.height : point.y;

  return {
    x: clamp(point.x, VIEWPORT_PADDING, maxX),
    y: clamp(preferredY, VIEWPORT_PADDING, maxY),
  };
}

export function getContextMenuMaxHeight(viewport: ContextMenuSize): number {
  return Math.max(96, viewport.height - VIEWPORT_PADDING * 2);
}

export function getContextMenuPortalTarget(
  doc: Pick<Document, 'body'> | undefined = typeof document === 'undefined' ? undefined : document,
): HTMLElement | undefined {
  return doc?.body || undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
