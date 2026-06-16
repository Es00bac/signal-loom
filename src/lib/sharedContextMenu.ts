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

export interface ContextMenuHeightEstimateOptions {
  headerHeight: number;
  itemHeight: number;
  maxHeight: number;
  paddingY: number;
}

export interface ContextMenuLayoutOptions {
  point: ContextMenuPoint;
  viewport: ContextMenuSize;
  menuWidth: number;
  estimatedHeight: number;
  maxHeight: number;
  headerHeight: number;
  measuredSize?: ContextMenuSize;
}

export interface ContextMenuLayout {
  position: ContextMenuPoint;
  menuSize: ContextMenuSize;
  maxHeight: number;
  contentMaxHeight: number;
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

export function resolveContextMenuLayout(options: ContextMenuLayoutOptions): ContextMenuLayout {
  const boundedWidth = Math.min(options.menuWidth, getContextMenuMaxWidth(options.viewport));
  const measuredWidth = options.measuredSize ? Math.min(options.measuredSize.width, boundedWidth) : boundedWidth;
  const measuredHeight = options.measuredSize
    ? Math.min(options.measuredSize.height, options.maxHeight)
    : Math.min(options.estimatedHeight, options.maxHeight);
  const menuSize = {
    width: measuredWidth,
    height: measuredHeight,
  };

  return {
    position: clampContextMenuPosition(options.point, options.viewport, menuSize),
    menuSize,
    maxHeight: options.maxHeight,
    contentMaxHeight: Math.max(1, options.maxHeight - options.headerHeight),
  };
}

export function getContextMenuMaxHeight(viewport: ContextMenuSize): number {
  return Math.max(1, viewport.height - VIEWPORT_PADDING * 2);
}

export function getContextMenuMaxWidth(viewport: ContextMenuSize): number {
  return Math.max(1, viewport.width - VIEWPORT_PADDING * 2);
}

export function estimateContextMenuHeight(
  items: SharedContextMenuItem[],
  options: ContextMenuHeightEstimateOptions,
): number {
  const rowCount = countContextMenuRows(items);
  return Math.min(options.maxHeight, options.headerHeight + rowCount * options.itemHeight + options.paddingY);
}

export function getContextMenuPortalTarget(
  doc: Pick<Document, 'body'> | undefined = typeof document === 'undefined' ? undefined : document,
): HTMLElement | undefined {
  return doc?.body || undefined;
}

function countContextMenuRows(items: SharedContextMenuItem[]): number {
  return items.reduce((count, item) => {
    const childCount = item.children ? countContextMenuRows(item.children) : 0;
    return count + 1 + childCount;
  }, 0);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Whether a `contextmenu` event raised by the given pointer type should open the menu.
 *
 * A stylus/pen long-press must NOT open the context menu — the pen should keep drawing
 * on the canvas. Only a finger long-press (touch) or a mouse right-click opens it. An
 * unknown pointer type (e.g. the keyboard menu key, where no pointer preceded the event)
 * is allowed through.
 */
export function shouldOpenContextMenuForPointerType(pointerType: string | null | undefined): boolean {
  return pointerType !== 'pen';
}
