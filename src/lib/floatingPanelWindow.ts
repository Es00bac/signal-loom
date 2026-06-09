import type { DockablePanelMode, PanelRect } from './dockablePanel';

interface FloatingPanelWindowDecision {
  isNative: boolean;
  mode: DockablePanelMode;
}

interface OwnerWindowScreenPosition {
  screenX: number;
  screenY: number;
}

interface FloatingPanelOwnerRenderDecision {
  shouldUseExternalWindow: boolean;
  externalPanelRootAvailable: boolean;
  externalWindowClosed: boolean;
}

interface ExternalFloatingPanelDragStart {
  pointerScreenX: number;
  pointerScreenY: number;
  windowScreenX: number;
  windowScreenY: number;
}

export interface ExternalFloatingPanelDragAnchor {
  offsetX: number;
  offsetY: number;
}

interface ExternalFloatingPanelDragPosition {
  pointerScreenX: number;
  pointerScreenY: number;
  anchor: ExternalFloatingPanelDragAnchor;
}

interface OwnerRelativeFloatingPanelRectInput {
  ownerScreenX: number;
  ownerScreenY: number;
  windowScreenX: number;
  windowScreenY: number;
  width: number;
  height: number;
}

interface ExternalFloatingPanelMoveEndRectInput {
  ownerScreenX: number;
  ownerScreenY: number;
  windowScreenX: number;
  windowScreenY: number;
  dragStartWidth: number;
  dragStartHeight: number;
  reportedInnerWidth?: number;
  reportedInnerHeight?: number;
}

interface ExternalFloatingPanelWindowSizeInput {
  innerWidth?: number;
  innerHeight?: number;
  outerWidth?: number;
  outerHeight?: number;
  fallbackWidth: number;
  fallbackHeight: number;
}

interface ExternalFloatingPanelResizeSyncInput {
  targetWidth: number;
  targetHeight: number;
  currentWidth?: number;
  currentHeight?: number;
  lastRequestedWidth?: number;
  lastRequestedHeight?: number;
}

export function shouldUseExternalFloatingPanelWindow({
  isNative,
  mode,
}: FloatingPanelWindowDecision): boolean {
  return isNative && mode === 'floating';
}

export function buildFloatingPanelWindowFeatures(
  rect: PanelRect,
  ownerWindow: OwnerWindowScreenPosition,
): string {
  const width = Math.max(160, Math.round(rect.width));
  const height = Math.max(120, Math.round(rect.height));
  const left = Math.round(ownerWindow.screenX + rect.x);
  const top = Math.round(ownerWindow.screenY + rect.y);

  return [
    'popup=yes',
    'frame=false',
    `width=${width}`,
    `height=${height}`,
    `left=${left}`,
    `top=${top}`,
  ].join(',');
}

export function shouldRenderFloatingPanelInOwnerWindow({
  shouldUseExternalWindow,
  externalPanelRootAvailable,
  externalWindowClosed,
}: FloatingPanelOwnerRenderDecision): boolean {
  return !shouldUseExternalWindow || externalWindowClosed || !externalPanelRootAvailable;
}

export function createExternalFloatingPanelDragAnchor({
  pointerScreenX,
  pointerScreenY,
  windowScreenX,
  windowScreenY,
}: ExternalFloatingPanelDragStart): ExternalFloatingPanelDragAnchor {
  return {
    offsetX: Math.round(pointerScreenX - windowScreenX),
    offsetY: Math.round(pointerScreenY - windowScreenY),
  };
}

export function resolveExternalFloatingPanelWindowPosition({
  pointerScreenX,
  pointerScreenY,
  anchor,
}: ExternalFloatingPanelDragPosition): { screenX: number; screenY: number } {
  return {
    screenX: Math.round(pointerScreenX - anchor.offsetX),
    screenY: Math.round(pointerScreenY - anchor.offsetY),
  };
}

export function resolveOwnerRelativeFloatingPanelRect({
  ownerScreenX,
  ownerScreenY,
  windowScreenX,
  windowScreenY,
  width,
  height,
}: OwnerRelativeFloatingPanelRectInput): PanelRect {
  return {
    x: Math.round(windowScreenX - ownerScreenX),
    y: Math.round(windowScreenY - ownerScreenY),
    width: Math.max(160, Math.round(width)),
    height: Math.max(120, Math.round(height)),
  };
}

export function resolveExternalFloatingPanelMoveEndRect({
  ownerScreenX,
  ownerScreenY,
  windowScreenX,
  windowScreenY,
  dragStartWidth,
  dragStartHeight,
}: ExternalFloatingPanelMoveEndRectInput): PanelRect {
  return resolveOwnerRelativeFloatingPanelRect({
    ownerScreenX,
    ownerScreenY,
    windowScreenX,
    windowScreenY,
    width: dragStartWidth,
    height: dragStartHeight,
  });
}

export function resolveExternalFloatingPanelWindowSize({
  innerWidth,
  innerHeight,
  outerWidth,
  outerHeight,
  fallbackWidth,
  fallbackHeight,
}: ExternalFloatingPanelWindowSizeInput): { width: number; height: number } {
  return {
    width: Math.max(160, Math.round(finiteOr(innerWidth, finiteOr(outerWidth, fallbackWidth)))),
    height: Math.max(120, Math.round(finiteOr(innerHeight, finiteOr(outerHeight, fallbackHeight)))),
  };
}

export function shouldResizeExternalFloatingPanelWindow({
  targetWidth,
  targetHeight,
  currentWidth,
  currentHeight,
  lastRequestedWidth,
  lastRequestedHeight,
}: ExternalFloatingPanelResizeSyncInput): boolean {
  const roundedTargetWidth = Math.round(finiteOr(targetWidth, 160));
  const roundedTargetHeight = Math.round(finiteOr(targetHeight, 120));
  const roundedCurrentWidth = roundOptionalPositive(currentWidth);
  const roundedCurrentHeight = roundOptionalPositive(currentHeight);

  if (roundedCurrentWidth !== undefined && roundedCurrentHeight !== undefined) {
    return roundedCurrentWidth !== roundedTargetWidth || roundedCurrentHeight !== roundedTargetHeight;
  }

  return Math.round(finiteOr(lastRequestedWidth, -1)) !== roundedTargetWidth
    || Math.round(finiteOr(lastRequestedHeight, -1)) !== roundedTargetHeight;
}

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function roundOptionalPositive(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : undefined;
}
