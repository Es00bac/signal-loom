export type DockablePanelMode = 'docked' | 'floating' | 'hidden' | 'collapsed';

export type DockZone = 'left' | 'right' | 'top' | 'bottom' | 'center' | 'overlay';

export interface PanelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PanelSize {
  width: number;
  height: number;
}

export interface ViewportSize {
  width: number;
  height: number;
}

export interface DockablePanelLayout {
  workspaceId: string;
  panelId: string;
  mode: DockablePanelMode;
  dockZone: DockZone;
  floatingRect: PanelRect;
  minSize: PanelSize;
  zOrder: number;
}

export interface DockablePanelDefault {
  workspaceId: string;
  panelId: string;
  mode?: DockablePanelMode;
  dockZone?: DockZone;
  floatingRect?: Partial<PanelRect>;
  minSize?: Partial<PanelSize>;
}

export interface SerializableDockablePanelDefault {
  workspaceId: string;
  panelId: string;
  mode?: DockablePanelMode;
  dockZone?: DockZone;
  floatingRect?: Partial<PanelRect>;
  minSize?: Partial<PanelSize>;
}

export interface ResizeDelta {
  edgeX: -1 | 0 | 1;
  edgeY: -1 | 0 | 1;
  deltaX: number;
  deltaY: number;
}

export interface DetachedFloatingPanelRectInput {
  layout: DockablePanelLayout;
  originRect: PanelRect;
  pointerX: number;
  pointerY: number;
  pointerOffsetX: number;
  pointerOffsetY: number;
}

export interface DockablePanelGlobalPointerEvent {
  pointerId: number;
  preventDefault?: () => void;
  stopPropagation?: () => void;
}

export interface DockablePanelGlobalPointerDragTarget {
  addEventListener: (type: 'pointermove' | 'pointerup' | 'pointercancel', listener: EventListener) => void;
  removeEventListener: (type: 'pointermove' | 'pointerup' | 'pointercancel', listener: EventListener) => void;
}

export interface DockablePanelGlobalPointerDragHandlers<TEvent extends DockablePanelGlobalPointerEvent> {
  onMove: (event: TEvent) => void;
  onEnd: (event: TEvent) => void;
}

export type DockablePanelPlacement = 'start' | 'end' | 'before' | 'after';

export interface PointerPosition {
  x: number;
  y: number;
}

export interface DockablePanelStackRect {
  panelId: string;
  dockZone: DockZone;
  rect: PanelRect;
}

export type DockablePanelSnapTarget =
  | {
      mode: 'floating';
    }
  | {
      mode: 'docked';
      dockZone: DockZone;
      placement: DockablePanelPlacement;
      referencePanelId?: string;
    };

export const DEFAULT_FLOATING_RECT: PanelRect = {
  x: 96,
  y: 96,
  width: 360,
  height: 420,
};

export const DEFAULT_PANEL_MIN_SIZE: PanelSize = {
  width: 220,
  height: 160,
};

export const DEFAULT_VIEWPORT_MARGIN = 8;
export const MAX_FLOATING_PANEL_VIEWPORT_RATIO = 0.86;
export const MAX_DOCKED_SIDE_PANEL_VIEWPORT_RATIO = 0.34;
export const MAX_DOCKED_SIDE_PANEL_WIDTH = 720;
export const MAX_DOCKED_HORIZONTAL_PANEL_VIEWPORT_RATIO = 0.62;
export const COLLAPSED_DOCKED_SIDE_PANEL_WIDTH = 44;
export const COLLAPSED_DOCKED_HORIZONTAL_PANEL_HEIGHT = 38;
export const DOCK_SNAP_EDGE_SIZE = 56;

const VALID_PANEL_MODES: readonly DockablePanelMode[] = ['docked', 'floating', 'hidden', 'collapsed'];
const VALID_DOCK_ZONES: readonly DockZone[] = ['left', 'right', 'top', 'bottom', 'center', 'overlay'];

export function panelKey(workspaceId: string, panelId: string): string {
  return `${workspaceId}/${panelId}`;
}

export function createDockablePanelDefaultSignature(defaults: readonly DockablePanelDefault[]): string {
  return JSON.stringify(defaults.map(toSerializableDockablePanelDefault));
}

export function toSerializableDockablePanelDefault(input: DockablePanelDefault): SerializableDockablePanelDefault {
  const output: SerializableDockablePanelDefault = {
    workspaceId: input.workspaceId,
    panelId: input.panelId,
  };
  if (input.mode !== undefined) output.mode = input.mode;
  if (input.dockZone !== undefined) output.dockZone = input.dockZone;
  if (input.floatingRect !== undefined) output.floatingRect = { ...input.floatingRect };
  if (input.minSize !== undefined) output.minSize = { ...input.minSize };
  return output;
}

export function createDefaultDockablePanelLayout(
  input: DockablePanelDefault,
  zOrder = 0,
): DockablePanelLayout {
  return normalizeDockablePanelLayout(
    {
      workspaceId: input.workspaceId,
      panelId: input.panelId,
      mode: input.mode ?? 'docked',
      dockZone: input.dockZone ?? 'right',
      floatingRect: {
        ...DEFAULT_FLOATING_RECT,
        ...input.floatingRect,
      },
      minSize: {
        ...DEFAULT_PANEL_MIN_SIZE,
        ...input.minSize,
      },
      zOrder,
    },
    { width: 1920, height: 1080 },
  );
}

export function normalizeDockablePanelLayout(
  layout: DockablePanelLayout,
  viewport: ViewportSize,
): DockablePanelLayout {
  const minSize = normalizeMinSize(layout.minSize);
  return {
    ...layout,
    minSize,
    floatingRect: clampPanelRect(layout.floatingRect, viewport, minSize),
    zOrder: normalizeZOrder(layout.zOrder),
  };
}

export function sanitizeDockablePanelLayout(
  value: unknown,
  defaultLayout: DockablePanelLayout,
  viewport: ViewportSize = { width: 1920, height: 1080 },
): DockablePanelLayout {
  const input = isRecord(value) ? value : {};
  const mode = isDockablePanelMode(input.mode) ? input.mode : defaultLayout.mode;
  const dockZone = isDockZone(input.dockZone) ? input.dockZone : defaultLayout.dockZone;
  const minSizeInput = isRecord(input.minSize) ? input.minSize : {};
  const floatingRectInput = isRecord(input.floatingRect) ? input.floatingRect : {};

  return normalizeDockablePanelLayout(
    {
      ...defaultLayout,
      mode,
      dockZone,
      minSize: {
        width: finiteOrUnknown(minSizeInput.width, defaultLayout.minSize.width),
        height: finiteOrUnknown(minSizeInput.height, defaultLayout.minSize.height),
      },
      floatingRect: {
        x: finiteOrUnknown(floatingRectInput.x, defaultLayout.floatingRect.x),
        y: finiteOrUnknown(floatingRectInput.y, defaultLayout.floatingRect.y),
        width: finiteOrUnknown(floatingRectInput.width, defaultLayout.floatingRect.width),
        height: finiteOrUnknown(floatingRectInput.height, defaultLayout.floatingRect.height),
      },
      zOrder: finiteOrUnknown(input.zOrder, defaultLayout.zOrder),
    },
    viewport,
  );
}

export interface DockedPanelStyleMetrics {
  minWidth?: number;
  minHeight?: number;
  width?: number;
  height?: number;
  maxWidth?: string;
  maxHeight?: string;
}

export function resolveDockedPanelStyleMetrics(layout: DockablePanelLayout): DockedPanelStyleMetrics {
  const isCollapsed = layout.mode === 'collapsed';
  const isVerticalDock = layout.dockZone === 'left' || layout.dockZone === 'right';
  const isHorizontalDock = layout.dockZone === 'top' || layout.dockZone === 'bottom';

  return {
    minWidth: isCollapsed && isVerticalDock
      ? COLLAPSED_DOCKED_SIDE_PANEL_WIDTH
      : layout.minSize.width,
    minHeight: isCollapsed
      ? isHorizontalDock
        ? COLLAPSED_DOCKED_HORIZONTAL_PANEL_HEIGHT
        : undefined
      : layout.minSize.height,
    width: isVerticalDock
      ? isCollapsed
        ? COLLAPSED_DOCKED_SIDE_PANEL_WIDTH
        : layout.floatingRect.width
      : undefined,
    height: isHorizontalDock
      ? isCollapsed
        ? COLLAPSED_DOCKED_HORIZONTAL_PANEL_HEIGHT
        : layout.floatingRect.height
      : undefined,
    maxWidth: isVerticalDock && !isCollapsed
      ? `min(${MAX_DOCKED_SIDE_PANEL_VIEWPORT_RATIO * 100}vw, ${MAX_DOCKED_SIDE_PANEL_WIDTH}px)`
      : undefined,
    maxHeight: isHorizontalDock && !isCollapsed
      ? `${MAX_DOCKED_HORIZONTAL_PANEL_VIEWPORT_RATIO * 100}vh`
      : undefined,
  };
}

export function resolveSharedDockablePanelCanvasOffsetPx(
  sourceBinLayout?: {
    dockZone?: DockZone;
    mode?: DockablePanelMode;
    floatingRect?: Partial<PanelRect>;
  },
): number {
  if (!sourceBinLayout || sourceBinLayout.dockZone !== 'left') {
    return 0;
  }

  if (sourceBinLayout.mode === 'collapsed') {
    return COLLAPSED_DOCKED_SIDE_PANEL_WIDTH;
  }

  if (sourceBinLayout.mode !== 'docked') {
    return 0;
  }

  return Math.max(0, Math.round(finiteOrUnknown(sourceBinLayout.floatingRect?.width, DEFAULT_FLOATING_RECT.width)));
}

export function areDockablePanelLayoutsEqual(a: DockablePanelLayout | undefined, b: DockablePanelLayout | undefined): boolean {
  if (!a || !b) return false;
  return a.workspaceId === b.workspaceId
    && a.panelId === b.panelId
    && a.mode === b.mode
    && a.dockZone === b.dockZone
    && a.zOrder === b.zOrder
    && a.minSize.width === b.minSize.width
    && a.minSize.height === b.minSize.height
    && a.floatingRect.x === b.floatingRect.x
    && a.floatingRect.y === b.floatingRect.y
    && a.floatingRect.width === b.floatingRect.width
    && a.floatingRect.height === b.floatingRect.height;
}

export function clampPanelRect(
  rect: PanelRect,
  viewport: ViewportSize,
  minSize: PanelSize = DEFAULT_PANEL_MIN_SIZE,
  margin = DEFAULT_VIEWPORT_MARGIN,
): PanelRect {
  return normalizeFloatingPanelRect(rect, viewport, minSize, { constrainPosition: true, margin });
}

export function normalizeFloatingPanelRect(
  rect: PanelRect,
  viewport: ViewportSize,
  minSize: PanelSize = DEFAULT_PANEL_MIN_SIZE,
  options: { constrainPosition?: boolean; margin?: number } = {},
): PanelRect {
  const normalizedViewport = normalizeViewport(viewport);
  const normalizedMin = normalizeMinSize(minSize);
  const constrainPosition = options.constrainPosition ?? true;
  const margin = options.margin ?? DEFAULT_VIEWPORT_MARGIN;
  const maxRecoverableWidth = Math.floor(normalizedViewport.width * MAX_FLOATING_PANEL_VIEWPORT_RATIO);
  const maxRecoverableHeight = Math.floor(normalizedViewport.height * MAX_FLOATING_PANEL_VIEWPORT_RATIO);
  const maxWidth = Math.max(
    normalizedMin.width,
    Math.min(normalizedViewport.width - margin * 2, maxRecoverableWidth),
  );
  const maxHeight = Math.max(
    normalizedMin.height,
    Math.min(normalizedViewport.height - margin * 2, maxRecoverableHeight),
  );
  const width = clampNumber(rect.width, normalizedMin.width, maxWidth);
  const height = clampNumber(rect.height, normalizedMin.height, maxHeight);

  if (!constrainPosition) {
    return {
      x: Math.round(finiteOr(rect.x, DEFAULT_FLOATING_RECT.x)),
      y: Math.round(finiteOr(rect.y, DEFAULT_FLOATING_RECT.y)),
      width,
      height,
    };
  }

  const minX = margin;
  const minY = margin;
  const maxX = Math.max(minX, normalizedViewport.width - width - margin);
  const maxY = Math.max(minY, normalizedViewport.height - height - margin);

  return {
    x: clampNumber(rect.x, minX, maxX),
    y: clampNumber(rect.y, minY, maxY),
    width,
    height,
  };
}

export function moveFloatingPanelRect(
  rect: PanelRect,
  deltaX: number,
  deltaY: number,
  viewport: ViewportSize,
  minSize: PanelSize = DEFAULT_PANEL_MIN_SIZE,
  options: { constrainPosition?: boolean } = {},
): PanelRect {
  const normalizedViewport = normalizeViewport(viewport);
  const normalizedMin = normalizeMinSize(minSize);
  const constrainPosition = options.constrainPosition ?? true;
  const width = Math.max(normalizedMin.width, Math.round(finiteOr(rect.width, DEFAULT_FLOATING_RECT.width)));
  const height = Math.max(normalizedMin.height, Math.round(finiteOr(rect.height, DEFAULT_FLOATING_RECT.height)));
  const nextX = Math.round(finiteOr(rect.x, DEFAULT_FLOATING_RECT.x) + finiteOr(deltaX, 0));
  const nextY = Math.round(finiteOr(rect.y, DEFAULT_FLOATING_RECT.y) + finiteOr(deltaY, 0));

  if (!constrainPosition) {
    return {
      ...rect,
      x: nextX,
      y: nextY,
      width,
      height,
    };
  }

  const margin = DEFAULT_VIEWPORT_MARGIN;
  const minX = margin;
  const minY = margin;
  const maxX = Math.max(minX, normalizedViewport.width - width - margin);
  const maxY = Math.max(minY, normalizedViewport.height - height - margin);

  return {
    ...rect,
    x: clampNumber(nextX, minX, maxX),
    y: clampNumber(nextY, minY, maxY),
    width,
    height,
  };
}

export function attachDockablePanelGlobalPointerDragListeners<TEvent extends DockablePanelGlobalPointerEvent>(
  target: DockablePanelGlobalPointerDragTarget,
  pointerId: number,
  handlers: DockablePanelGlobalPointerDragHandlers<TEvent>,
): () => void {
  let active = true;
  const cleanup = () => {
    if (!active) return;
    active = false;
    target.removeEventListener('pointermove', handleMove);
    target.removeEventListener('pointerup', handleEnd);
    target.removeEventListener('pointercancel', handleEnd);
  };
  const handleMove: EventListener = (event) => {
    const pointerEvent = event as unknown as TEvent;
    if (pointerEvent.pointerId !== pointerId) return;
    handlers.onMove(pointerEvent);
  };
  const handleEnd: EventListener = (event) => {
    const pointerEvent = event as unknown as TEvent;
    if (pointerEvent.pointerId !== pointerId) return;
    cleanup();
    handlers.onEnd(pointerEvent);
  };

  target.addEventListener('pointermove', handleMove);
  target.addEventListener('pointerup', handleEnd);
  target.addEventListener('pointercancel', handleEnd);

  return cleanup;
}

export function resolveDetachedFloatingPanelRect({
  layout,
  originRect,
  pointerX,
  pointerY,
  pointerOffsetX,
  pointerOffsetY,
}: DetachedFloatingPanelRectInput): PanelRect {
  const mountedWidth = Math.round(finiteOr(originRect.width, layout.floatingRect.width));
  const mountedHeight = Math.round(finiteOr(originRect.height, layout.floatingRect.height));
  const savedWidth = Math.round(finiteOr(layout.floatingRect.width, mountedWidth));
  const savedHeight = Math.round(finiteOr(layout.floatingRect.height, mountedHeight));
  return {
    x: Math.round(finiteOr(pointerX, originRect.x) - finiteOr(pointerOffsetX, originRect.width / 2)),
    y: Math.round(finiteOr(pointerY, originRect.y) - finiteOr(pointerOffsetY, 24)),
    width: Math.max(layout.minSize.width, Math.min(mountedWidth, savedWidth)),
    height: Math.max(layout.minSize.height, Math.min(mountedHeight, savedHeight)),
  };
}

export function resizeFloatingPanelRect(
  rect: PanelRect,
  resize: ResizeDelta,
  viewport: ViewportSize,
  minSize: PanelSize = DEFAULT_PANEL_MIN_SIZE,
  options: { constrainPosition?: boolean } = {},
): PanelRect {
  let nextX = rect.x;
  let nextY = rect.y;
  let nextWidth = rect.width;
  let nextHeight = rect.height;

  if (resize.edgeX < 0) {
    nextX = rect.x + resize.deltaX;
    nextWidth = rect.width - resize.deltaX;
  } else if (resize.edgeX > 0) {
    nextWidth = rect.width + resize.deltaX;
  }

  if (resize.edgeY < 0) {
    nextY = rect.y + resize.deltaY;
    nextHeight = rect.height - resize.deltaY;
  } else if (resize.edgeY > 0) {
    nextHeight = rect.height + resize.deltaY;
  }

  const normalizedMin = normalizeMinSize(minSize);

  if (nextWidth < normalizedMin.width && resize.edgeX < 0) {
    nextX -= normalizedMin.width - nextWidth;
  }

  if (nextHeight < normalizedMin.height && resize.edgeY < 0) {
    nextY -= normalizedMin.height - nextHeight;
  }

  return normalizeFloatingPanelRect(
    {
      x: nextX,
      y: nextY,
      width: nextWidth,
      height: nextHeight,
    },
    viewport,
    normalizedMin,
    options,
  );
}

export function resizeDockedPanelRect(
  rect: PanelRect,
  dockZone: DockZone,
  resize: ResizeDelta,
  viewport: ViewportSize,
  minSize: PanelSize = DEFAULT_PANEL_MIN_SIZE,
): PanelRect {
  const normalizedViewport = normalizeViewport(viewport);
  const normalizedMin = normalizeMinSize(minSize);
  let width = Math.round(finiteOr(rect.width, DEFAULT_FLOATING_RECT.width));
  let height = Math.round(finiteOr(rect.height, DEFAULT_FLOATING_RECT.height));

  if (dockZone === 'left' && resize.edgeX > 0) {
    width += resize.deltaX;
  } else if (dockZone === 'right' && resize.edgeX < 0) {
    width -= resize.deltaX;
  } else if (dockZone === 'top' && resize.edgeY > 0) {
    height += resize.deltaY;
  } else if (dockZone === 'bottom' && resize.edgeY < 0) {
    height -= resize.deltaY;
  }

  if (dockZone === 'left' || dockZone === 'right') {
    const maxWidth = Math.max(
      normalizedMin.width,
      Math.min(
        MAX_DOCKED_SIDE_PANEL_WIDTH,
        Math.floor(normalizedViewport.width * MAX_DOCKED_SIDE_PANEL_VIEWPORT_RATIO),
      ),
    );
    width = clampNumber(width, normalizedMin.width, maxWidth);
  }

  if (dockZone === 'top' || dockZone === 'bottom') {
    const maxHeight = Math.max(
      normalizedMin.height,
      Math.floor(normalizedViewport.height * MAX_DOCKED_HORIZONTAL_PANEL_VIEWPORT_RATIO),
    );
    height = clampNumber(height, normalizedMin.height, maxHeight);
  }

  return {
    ...rect,
    width,
    height,
  };
}

export function resolveDockablePanelSnapTarget(
  point: PointerPosition,
  viewport: ViewportSize,
  stackRects: readonly DockablePanelStackRect[] = [],
  allowedDockZones: readonly DockZone[] = VALID_DOCK_ZONES,
  edgeSize = DOCK_SNAP_EDGE_SIZE,
): DockablePanelSnapTarget {
  const allowed = new Set(allowedDockZones);
  const normalizedViewport = normalizeViewport(viewport);

  for (const stackRect of stackRects) {
    if (!allowed.has(stackRect.dockZone) || !isPointInsideRect(point, stackRect.rect)) {
      continue;
    }

    const sideStack = stackRect.dockZone === 'left' || stackRect.dockZone === 'right';
    const midpoint = sideStack
      ? stackRect.rect.y + stackRect.rect.height / 2
      : stackRect.rect.x + stackRect.rect.width / 2;
    const before = sideStack ? point.y < midpoint : point.x < midpoint;

    return {
      mode: 'docked',
      dockZone: stackRect.dockZone,
      placement: before ? 'before' : 'after',
      referencePanelId: stackRect.panelId,
    };
  }

  const edgeTargets: Array<{ dockZone: DockZone; active: boolean }> = [
    { dockZone: 'left', active: point.x <= edgeSize },
    { dockZone: 'right', active: point.x >= normalizedViewport.width - edgeSize },
    { dockZone: 'top', active: point.y <= edgeSize },
    { dockZone: 'bottom', active: point.y >= normalizedViewport.height - edgeSize },
  ];

  for (const target of edgeTargets) {
    if (target.active && allowed.has(target.dockZone)) {
      return {
        mode: 'docked',
        dockZone: target.dockZone,
        placement: 'end',
      };
    }
  }

  return { mode: 'floating' };
}

export function resolveDockablePanelSnapPreviewRect(
  target: DockablePanelSnapTarget,
  viewport: ViewportSize,
  stackRects: readonly DockablePanelStackRect[] = [],
  edgePreviewSize = 48,
  stackPreviewThickness = 8,
): PanelRect | undefined {
  if (target.mode !== 'docked') {
    return undefined;
  }

  const normalizedViewport = normalizeViewport(viewport);
  const referenceRect = target.referencePanelId
    ? stackRects.find((stackRect) => stackRect.panelId === target.referencePanelId && stackRect.dockZone === target.dockZone)?.rect
    : undefined;

  if (referenceRect && (target.placement === 'before' || target.placement === 'after')) {
    const sideStack = target.dockZone === 'left' || target.dockZone === 'right';
    const halfThickness = Math.round(stackPreviewThickness / 2);
    if (sideStack) {
      const y = target.placement === 'before'
        ? referenceRect.y - halfThickness
        : referenceRect.y + referenceRect.height - halfThickness;
      return {
        x: referenceRect.x,
        y,
        width: referenceRect.width,
        height: stackPreviewThickness,
      };
    }

    const x = target.placement === 'before'
      ? referenceRect.x - halfThickness
      : referenceRect.x + referenceRect.width - halfThickness;
    return {
      x,
      y: referenceRect.y,
      width: stackPreviewThickness,
      height: referenceRect.height,
    };
  }

  switch (target.dockZone) {
    case 'left':
      return { x: 0, y: 0, width: edgePreviewSize, height: normalizedViewport.height };
    case 'right':
      return { x: normalizedViewport.width - edgePreviewSize, y: 0, width: edgePreviewSize, height: normalizedViewport.height };
    case 'top':
      return { x: 0, y: 0, width: normalizedViewport.width, height: edgePreviewSize };
    case 'bottom':
      return { x: 0, y: normalizedViewport.height - edgePreviewSize, width: normalizedViewport.width, height: edgePreviewSize };
    case 'center':
    case 'overlay':
      return {
        x: Math.round(normalizedViewport.width * 0.25),
        y: Math.round(normalizedViewport.height * 0.18),
        width: Math.round(normalizedViewport.width * 0.5),
        height: Math.round(normalizedViewport.height * 0.64),
      };
  }
}

export function nextPanelZOrder(layouts: Iterable<DockablePanelLayout>): number {
  let highest = 0;
  for (const layout of layouts) {
    highest = Math.max(highest, normalizeZOrder(layout.zOrder));
  }
  return highest + 1;
}

export function sortPanelsByZOrder<T extends { zOrder: number; panelId: string }>(panels: T[]): T[] {
  return [...panels].sort((a, b) => a.zOrder - b.zOrder || a.panelId.localeCompare(b.panelId));
}

export function sortDockedPanels<T extends { dockZone: DockZone; zOrder: number; panelId: string }>(panels: T[]): T[] {
  return [...panels].sort((a, b) => a.dockZone.localeCompare(b.dockZone) || a.zOrder - b.zOrder || a.panelId.localeCompare(b.panelId));
}

function normalizeMinSize(size: PanelSize): PanelSize {
  return {
    width: Math.max(80, Math.round(finiteOr(size.width, DEFAULT_PANEL_MIN_SIZE.width))),
    height: Math.max(60, Math.round(finiteOr(size.height, DEFAULT_PANEL_MIN_SIZE.height))),
  };
}

function normalizeViewport(viewport: ViewportSize): ViewportSize {
  return {
    width: Math.max(1, Math.round(finiteOr(viewport.width, 1))),
    height: Math.max(1, Math.round(finiteOr(viewport.height, 1))),
  };
}

function normalizeZOrder(value: number): number {
  return Math.max(0, Math.round(finiteOr(value, 0)));
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(finiteOr(value, min))));
}

function isPointInsideRect(point: PointerPosition, rect: PanelRect): boolean {
  return point.x >= rect.x
    && point.x <= rect.x + rect.width
    && point.y >= rect.y
    && point.y <= rect.y + rect.height;
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function finiteOrUnknown(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isDockablePanelMode(value: unknown): value is DockablePanelMode {
  return typeof value === 'string' && VALID_PANEL_MODES.includes(value as DockablePanelMode);
}

function isDockZone(value: unknown): value is DockZone {
  return typeof value === 'string' && VALID_DOCK_ZONES.includes(value as DockZone);
}
