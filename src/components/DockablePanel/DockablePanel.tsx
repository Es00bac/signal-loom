import { type AriaRole, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { GripHorizontal } from 'lucide-react';
import { DockExpandContext } from './dockExpandContext';
import {
  attachDockablePanelGlobalPointerDragListeners,
  DEFAULT_VIEWPORT_MARGIN,
  normalizeFloatingPanelRect,
  resolveDetachedFloatingPanelRect,
  resolveDockedPanelStyleMetrics,
  resolveDockablePanelSnapPreviewRect,
  resolveDockablePanelSnapTarget,
  type DockablePanelLayout,
  type DockablePanelStackRect,
  type DockZone,
  type PanelRect,
  type ResizeDelta,
  type ViewportSize,
} from '../../lib/dockablePanel';
import {
  buildFloatingPanelWindowFeatures,
  createExternalFloatingPanelDragAnchor,
  resolveFloatingPanelOwnerRect,
  resolveFloatingPanelScreenRect,
  resolveExternalFloatingPanelWindowSize,
  resolveExternalFloatingPanelWindowPosition,
  resolveExternalFloatingPanelMoveEndRect,
  type ExternalFloatingPanelDragAnchor,
  shouldResizeExternalFloatingPanelWindow,
  shouldRenderFloatingPanelInOwnerWindow,
  shouldUseExternalFloatingPanelWindow,
} from '../../lib/floatingPanelWindow';
import { getSignalLoomNativeBridge } from '../../lib/nativeApp';
import { zIndexForFloatingPanel } from '../../lib/zIndex';
import { useDockablePanelStore } from '../../store/dockablePanelStore';
import { ErrorBoundary } from '../Recovery/ErrorBoundary';

export interface DockablePanelProps {
  layout: DockablePanelLayout;
  title: string;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  allowedDockZones?: DockZone[];
  chrome?: DockablePanelChrome;
  fixedSize?: boolean;
  viewport?: ViewportSize;
  role?: AriaRole;
  ariaModal?: boolean;
  onClose?: () => void;
  tabs?: ReactNode;
  externalWindowKey?: string;
}

export type DockablePanelChrome = 'standard' | 'compact-floating';

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  action: 'move' | 'floating-resize' | 'docked-resize';
  detachedFromDock?: boolean;
  originRect?: PanelRect;
  pointerOffsetX?: number;
  pointerOffsetY?: number;
  captureElement?: HTMLElement;
  ownerWindow?: Window;
  cleanupGlobalPointerDrag?: () => void;
  externalWindowDrag?: {
    anchor: ExternalFloatingPanelDragAnchor;
    ownerScreenX: number;
    ownerScreenY: number;
    width: number;
    height: number;
  };
  resize?: Pick<ResizeDelta, 'edgeX' | 'edgeY'>;
}

const RESIZE_HANDLES: Array<Pick<ResizeDelta, 'edgeX' | 'edgeY'> & { label: string; className: string }> = [
  { edgeX: 0, edgeY: -1, label: 'Resize top', className: 'left-3 right-3 top-0 h-1 cursor-ns-resize' },
  { edgeX: 0, edgeY: 1, label: 'Resize bottom', className: 'bottom-0 left-3 right-3 h-1 cursor-ns-resize' },
  { edgeX: -1, edgeY: 0, label: 'Resize left', className: 'bottom-3 left-0 top-3 w-1 cursor-ew-resize' },
  { edgeX: 1, edgeY: 0, label: 'Resize right', className: 'bottom-3 right-0 top-3 w-1 cursor-ew-resize' },
  { edgeX: -1, edgeY: -1, label: 'Resize top left', className: 'left-0 top-0 h-3 w-3 cursor-nwse-resize' },
  { edgeX: 1, edgeY: -1, label: 'Resize top right', className: 'right-0 top-0 h-3 w-3 cursor-nesw-resize' },
  { edgeX: -1, edgeY: 1, label: 'Resize bottom left', className: 'bottom-0 left-0 h-3 w-3 cursor-nesw-resize' },
  { edgeX: 1, edgeY: 1, label: 'Resize bottom right', className: 'bottom-0 right-0 h-3 w-3 cursor-nwse-resize' },
];

const DOCKED_RESIZE_HANDLES: Partial<Record<DockZone, Pick<ResizeDelta, 'edgeX' | 'edgeY'> & { label: string; className: string }>> = {
  left: {
    edgeX: 1,
    edgeY: 0,
    label: 'Resize right divider',
    className: 'bottom-0 right-0 top-0 z-20 w-2 cursor-ew-resize border-r border-cyan-200/0 bg-cyan-300/0 hover:border-cyan-200/50 hover:bg-cyan-300/20',
  },
  right: {
    edgeX: -1,
    edgeY: 0,
    label: 'Resize left divider',
    className: 'bottom-0 left-0 top-0 z-20 w-2 cursor-ew-resize border-l border-cyan-200/0 bg-cyan-300/0 hover:border-cyan-200/50 hover:bg-cyan-300/20',
  },
  top: {
    edgeX: 0,
    edgeY: 1,
    label: 'Resize bottom divider',
    className: 'bottom-0 left-0 right-0 z-20 h-2 cursor-ns-resize border-b border-cyan-200/0 bg-cyan-300/0 hover:border-cyan-200/50 hover:bg-cyan-300/20',
  },
  bottom: {
    edgeX: 0,
    edgeY: -1,
    label: 'Resize top divider',
    className: 'left-0 right-0 top-0 z-20 h-2 cursor-ns-resize border-t border-cyan-200/0 bg-cyan-300/0 hover:border-cyan-200/50 hover:bg-cyan-300/20',
  },
};

const FLOATING_PANEL_THEME_CSS_VARIABLES = [
  '--sl-bg',
  '--sl-surface',
  '--sl-panel',
  '--sl-border',
  '--sl-text',
  '--sl-muted',
  '--sl-accent',
  '--sl-accent-contrast',
  '--sl-danger',
];
const DEFAULT_DOCKABLE_PANEL_BODY_CLASS_NAME = 'min-h-0 overflow-auto p-3';
const SIDE_DOCKED_DOCKABLE_PANEL_BODY_CLASS_NAME = 'min-h-0 overflow-visible p-3';

export function DockablePanel({
  layout,
  title,
  children,
  className = '',
  bodyClassName = DEFAULT_DOCKABLE_PANEL_BODY_CLASS_NAME,
  allowedDockZones = ['left', 'right', 'top', 'bottom', 'center', 'overlay'],
  chrome = 'standard',
  fixedSize = false,
  viewport,
  role = 'region',
  ariaModal,
  onClose,
  tabs,
  externalWindowKey,
}: DockablePanelProps) {
  const dragState = useRef<DragState | null>(null);
  const mountedRef = useRef(false);
  const externalWindowRef = useRef<Window | null>(null);
  const [snapPreviewRect, setSnapPreviewRect] = useState<PanelRect | null>(null);
  const [externalPanelRoot, setExternalPanelRoot] = useState<HTMLElement | null>(null);
  const floatPanel = useDockablePanelStore((state) => state.floatPanel);
  const setPanelMode = useDockablePanelStore((state) => state.setPanelMode);
  const snapPanelToDockTarget = useDockablePanelStore((state) => state.snapPanelToDockTarget);
  const groupPanelWithPanel = useDockablePanelStore((state) => state.groupPanelWithPanel);
  const moveFloatingPanel = useDockablePanelStore((state) => state.moveFloatingPanel);
  const resizeFloatingPanel = useDockablePanelStore((state) => state.resizeFloatingPanel);
  const resizeDockedPanel = useDockablePanelStore((state) => state.resizeDockedPanel);
  const bringPanelToFront = useDockablePanelStore((state) => state.bringPanelToFront);
  const resolvedViewport = useMemo(() => viewport ?? readViewport(), [viewport]);
  const isFloating = layout.mode === 'floating';
  const isCompactFloatingChrome = chrome === 'compact-floating' && isFloating;
  const hasFixedFloatingGeometry = fixedSize || isCompactFloatingChrome;
  const floatingRectSpace = layout.floatingRectSpace === 'screen' ? 'screen' : 'owner';
  const floatingWindowKey = externalWindowKey ?? layout.panelId;
  const shouldUseExternalWindow = shouldUseExternalFloatingPanelWindow({
    isNative: Boolean(getSignalLoomNativeBridge()),
    mode: layout.mode,
  });
  const shouldRenderInOwnerWindow = shouldRenderFloatingPanelInOwnerWindow({
    shouldUseExternalWindow,
    externalPanelRootAvailable: Boolean(externalPanelRoot),
    externalWindowClosed: false,
  });
  const useExternalPanelChrome = shouldUseExternalWindow && !shouldRenderInOwnerWindow;
  const isCollapsed = layout.mode === 'collapsed';
  const isHorizontalDock = layout.dockZone === 'top' || layout.dockZone === 'bottom';
  const isVerticalDock = layout.dockZone === 'left' || layout.dockZone === 'right';
  const ownerFloatingRect = useMemo(
    () => resolveFloatingPanelOwnerRect({
      rect: layout.floatingRect,
      ownerScreenX: typeof window === 'undefined' ? 0 : window.screenX,
      ownerScreenY: typeof window === 'undefined' ? 0 : window.screenY,
      floatingRectSpace,
    }),
    [floatingRectSpace, layout.floatingRect],
  );
  const renderedFloatingRect = useMemo(
    () => normalizeFloatingPanelRect(
      ownerFloatingRect,
      resolvedViewport,
      layout.minSize,
      { constrainPosition: shouldRenderInOwnerWindow },
    ),
    [ownerFloatingRect, layout.minSize, resolvedViewport, shouldRenderInOwnerWindow],
  );
  const externalFloatingRect = useMemo(
    () => normalizeFloatingPanelRect(
      layout.floatingRect,
      resolvedViewport,
      layout.minSize,
      { constrainPosition: false, constrainSize: false },
    ),
    [layout.floatingRect, layout.minSize, resolvedViewport],
  );
  const externalFloatingRectRef = useRef(externalFloatingRect);
  const lastExternalResizeTargetRef = useRef<{ width: number; height: number } | null>(null);
  const panelStyle: CSSProperties = isFloating
    ? useExternalPanelChrome
      ? {
        left: 0,
        top: 0,
        width: hasFixedFloatingGeometry ? externalFloatingRect.width : '100vw',
        height: isCollapsed ? undefined : hasFixedFloatingGeometry ? externalFloatingRect.height : '100vh',
        minWidth: layout.minSize.width,
        minHeight: isCollapsed ? undefined : layout.minSize.height,
        zIndex: zIndexForFloatingPanel(layout.zOrder),
      }
      : {
        left: renderedFloatingRect.x,
        top: renderedFloatingRect.y,
        width: renderedFloatingRect.width,
        height: isCollapsed ? undefined : renderedFloatingRect.height,
        minWidth: layout.minSize.width,
        minHeight: isCollapsed ? undefined : layout.minSize.height,
        zIndex: zIndexForFloatingPanel(layout.zOrder),
      }
    : {
        ...resolveDockedPanelStyleMetrics(layout),
      };
  const dockedFullHeightClassName = !isFloating && !isHorizontalDock && !isVerticalDock ? 'h-full' : '';
  const bodyFlexClassName = isCompactFloatingChrome
    ? 'flex-none'
    : !isFloating && isVerticalDock
      ? 'flex-none'
      : 'flex-1';
  const resolvedBodyClassName = !isFloating && isVerticalDock && bodyClassName === DEFAULT_DOCKABLE_PANEL_BODY_CLASS_NAME
    ? SIDE_DOCKED_DOCKABLE_PANEL_BODY_CLASS_NAME
    : bodyClassName;
  const dockedResizeHandle = !isFloating && !isCollapsed ? DOCKED_RESIZE_HANDLES[layout.dockZone] : undefined;
  const canDockExternalPanel = shouldUseExternalWindow && !hasFixedFloatingGeometry;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (dragState.current?.cleanupGlobalPointerDrag && !dragState.current.detachedFromDock) {
        dragState.current.cleanupGlobalPointerDrag();
        dragState.current = null;
      }
    };
  }, []);

  useEffect(() => {
    externalFloatingRectRef.current = externalFloatingRect;
  }, [externalFloatingRect]);

  useEffect(() => {
    let disposed = false;
    const setExternalPanelRootLater = (root: HTMLElement | null) => {
      queueMicrotask(() => {
        if (!disposed) {
          setExternalPanelRoot(root);
        }
      });
    };

    if (!shouldUseExternalWindow || !isFloating || typeof window === 'undefined') {
      if (externalWindowRef.current && !externalWindowRef.current.closed) {
        externalWindowRef.current.close();
      }
      externalWindowRef.current = null;
      lastExternalResizeTargetRef.current = null;
      setExternalPanelRootLater(null);
      return () => {
        disposed = true;
      };
    }

    const popup = window.open(
      '',
      `signal-loom-${layout.workspaceId}-${floatingWindowKey}`,
      buildFloatingPanelWindowFeatures(externalFloatingRectRef.current, {
        screenX: window.screenX,
        screenY: window.screenY,
      }, {
        ...(hasFixedFloatingGeometry ? { resizable: false } : {}),
        floatingRectSpace,
      }),
    );

    if (!popup) {
      lastExternalResizeTargetRef.current = null;
      setExternalPanelRootLater(null);
      return () => {
        disposed = true;
      };
    }

    externalWindowRef.current = popup;
    lastExternalResizeTargetRef.current = null;
    popup.document.title = title;
    prepareExternalPanelDocument(popup.document);
    let root = popup.document.getElementById('signal-loom-floating-panel-root');
    if (!root) {
      root = popup.document.createElement('div');
      root.id = 'signal-loom-floating-panel-root';
      popup.document.body.append(root);
    }
    configureExternalPanelDocumentGeometry(
      popup.document,
      root,
      hasFixedFloatingGeometry ? externalFloatingRectRef.current : undefined,
    );
    setExternalPanelRootLater(root);

    const handlePopupClosed = () => {
      if (externalWindowRef.current === popup) {
        externalWindowRef.current = null;
      }
      lastExternalResizeTargetRef.current = null;
      setExternalPanelRootLater(null);
    };
    const closePopup = () => {
      if (!popup.closed) {
        popup.close();
      }
    };
    popup.addEventListener('beforeunload', handlePopupClosed);
    popup.addEventListener('pagehide', handlePopupClosed);
    window.addEventListener('beforeunload', closePopup);

    return () => {
      disposed = true;
      popup.removeEventListener('beforeunload', handlePopupClosed);
      popup.removeEventListener('pagehide', handlePopupClosed);
      window.removeEventListener('beforeunload', closePopup);
      if (!popup.closed) {
        popup.close();
      }
      if (externalWindowRef.current === popup) {
        externalWindowRef.current = null;
      }
      lastExternalResizeTargetRef.current = null;
    };
  }, [
    floatingRectSpace,
    hasFixedFloatingGeometry,
    floatingWindowKey,
    isFloating,
    layout.workspaceId,
    shouldUseExternalWindow,
  ]);

  useEffect(() => {
    const popup = externalWindowRef.current;
    if (!popup || popup.closed) return;
    popup.document.title = title;
  }, [externalPanelRoot, title]);

  useEffect(() => {
    if (!externalPanelRoot) return;
    configureExternalPanelDocumentGeometry(
      externalPanelRoot.ownerDocument,
      externalPanelRoot,
      hasFixedFloatingGeometry ? externalFloatingRect : undefined,
    );
  }, [externalFloatingRect, externalPanelRoot, hasFixedFloatingGeometry]);

  useEffect(() => {
    if (!shouldUseExternalWindow || !isFloating || !externalPanelRoot) return;
    let disposed = false;
    const popup = externalWindowRef.current;
    if (!popup || popup.closed || dragState.current?.externalWindowDrag) return;
    const targetScreenRect = resolveFloatingPanelScreenRect({
      rect: externalFloatingRect,
      ownerScreenX: window.screenX,
      ownerScreenY: window.screenY,
      floatingRectSpace,
    });
    const targetX = Math.round(targetScreenRect.x);
    const targetY = Math.round(targetScreenRect.y);
    const targetWidth = Math.max(1, Math.round(externalFloatingRect.width));
    const targetHeight = Math.max(1, Math.round(externalFloatingRect.height));

    try {
      if (Math.round(popup.screenX) !== targetX || Math.round(popup.screenY) !== targetY) {
        popup.moveTo(targetX, targetY);
      }
      const popupSize = resolveExternalFloatingPanelWindowSize({
        innerWidth: popup.innerWidth,
        innerHeight: popup.innerHeight,
        outerWidth: popup.outerWidth,
        outerHeight: popup.outerHeight,
        fallbackWidth: externalFloatingRect.width,
        fallbackHeight: externalFloatingRect.height,
      });
      const shouldResize = shouldResizeExternalFloatingPanelWindow({
        targetWidth,
        targetHeight,
        currentWidth: popupSize.width,
        currentHeight: popupSize.height,
        lastRequestedWidth: lastExternalResizeTargetRef.current?.width,
        lastRequestedHeight: lastExternalResizeTargetRef.current?.height,
      });
      if (shouldResize) {
        lastExternalResizeTargetRef.current = { width: targetWidth, height: targetHeight };
        if (popupSize.width !== targetWidth || popupSize.height !== targetHeight) {
          popup.resizeTo(targetWidth, targetHeight);
        }
      }
    } catch {
      queueMicrotask(() => {
        if (!disposed) {
          setExternalPanelRoot(null);
        }
      });
    }
    return () => {
      disposed = true;
    };
  }, [externalFloatingRect, externalPanelRoot, hasFixedFloatingGeometry, floatingRectSpace, isFloating, shouldUseExternalWindow]);

  if (layout.mode === 'hidden') return null;

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    bringPanelToFront(layout.workspaceId, layout.panelId);
    const panelRect = readElementRect(event.currentTarget.closest('[data-dockable-panel-id]'));
    const originRect = panelRect ?? renderedFloatingRect;
    const eventWindow = event.currentTarget.ownerDocument.defaultView;
    const captureElement = event.currentTarget;
    const cleanupGlobalPointerDrag = attachDockablePanelGlobalPointerDragListeners(
      eventWindow ?? window,
      event.pointerId,
      {
        onMove: continueDrag,
        onEnd: endDrag,
      },
    );
    const externalWindowDrag = useExternalPanelChrome && eventWindow
      ? {
          anchor: createExternalFloatingPanelDragAnchor({
            pointerScreenX: event.screenX,
            pointerScreenY: event.screenY,
            windowScreenX: eventWindow.screenX,
            windowScreenY: eventWindow.screenY,
          }),
          ownerScreenX: window.screenX,
          ownerScreenY: window.screenY,
          width: externalFloatingRect.width,
          height: externalFloatingRect.height,
        }
      : undefined;
    dragState.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      action: 'move',
      detachedFromDock: isFloating,
      originRect,
      pointerOffsetX: event.clientX - originRect.x,
      pointerOffsetY: event.clientY - originRect.y,
      captureElement,
      ownerWindow: eventWindow ?? window,
      cleanupGlobalPointerDrag,
      externalWindowDrag,
    };
  };

  const startResize = (event: ReactPointerEvent<HTMLDivElement>, resize: Pick<ResizeDelta, 'edgeX' | 'edgeY'>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    bringPanelToFront(layout.workspaceId, layout.panelId);
    const eventWindow = event.currentTarget.ownerDocument.defaultView;
    const captureElement = event.currentTarget;
    const cleanupGlobalPointerDrag = attachDockablePanelGlobalPointerDragListeners(
      eventWindow ?? window,
      event.pointerId,
      {
        onMove: continueDrag,
        onEnd: endDrag,
      },
    );
    dragState.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      action: isFloating ? 'floating-resize' : 'docked-resize',
      resize,
      captureElement,
      ownerWindow: eventWindow ?? window,
      cleanupGlobalPointerDrag,
    };
  };

  const continueDrag = (event: ReactPointerEvent<HTMLDivElement> | PointerEvent) => {
    const current = dragState.current;
    if (!current || current.pointerId !== event.pointerId) return;
    event.preventDefault?.();
    event.stopPropagation?.();
    const deltaX = event.clientX - current.lastX;
    const deltaY = event.clientY - current.lastY;
    if (current.action === 'floating-resize' && current.resize) {
      resizeFloatingPanel(
        layout.workspaceId,
        layout.panelId,
        { ...current.resize, deltaX, deltaY },
        resolvedViewport,
        { constrainSize: !useExternalPanelChrome },
      );
      dragState.current = { ...current, lastX: event.clientX, lastY: event.clientY };
    } else if (current.action === 'docked-resize' && current.resize) {
      resizeDockedPanel(
        layout.workspaceId,
        layout.panelId,
        { ...current.resize, deltaX, deltaY },
        resolvedViewport,
      );
      dragState.current = { ...current, lastX: event.clientX, lastY: event.clientY };
    } else if (current.action === 'move') {
      if (current.externalWindowDrag) {
        const popup = externalWindowRef.current ?? current.ownerWindow;
        if (popup && !popup.closed) {
          const nextPosition = resolveExternalFloatingPanelWindowPosition({
            pointerScreenX: event.screenX,
            pointerScreenY: event.screenY,
            anchor: current.externalWindowDrag.anchor,
          });
          try {
            popup.moveTo(nextPosition.screenX, nextPosition.screenY);
            const targetWidth = Math.max(1, Math.round(current.externalWindowDrag.width));
            const targetHeight = Math.max(1, Math.round(current.externalWindowDrag.height));
            const popupSize = resolveExternalFloatingPanelWindowSize({
              innerWidth: popup.innerWidth,
              innerHeight: popup.innerHeight,
              outerWidth: popup.outerWidth,
              outerHeight: popup.outerHeight,
              fallbackWidth: targetWidth,
              fallbackHeight: targetHeight,
            });
            if (shouldResizeExternalFloatingPanelWindow({
              targetWidth,
              targetHeight,
              currentWidth: popupSize.width,
              currentHeight: popupSize.height,
              lastRequestedWidth: targetWidth,
              lastRequestedHeight: targetHeight,
            })) {
              popup.resizeTo(targetWidth, targetHeight);
            }
          } catch {
            setExternalPanelRoot(null);
          }
        }
        dragState.current = { ...current, lastX: event.clientX, lastY: event.clientY };
        return;
      }
      if (!current.detachedFromDock) {
        const totalDeltaX = event.clientX - current.startX;
        const totalDeltaY = event.clientY - current.startY;
        if (Math.abs(totalDeltaX) < 4 && Math.abs(totalDeltaY) < 4) {
          return;
        }
        const originRect = current.originRect ?? renderedFloatingRect;
        floatPanel(
          layout.workspaceId,
          layout.panelId,
          resolveDetachedFloatingPanelRect({
            layout,
            originRect,
            pointerX: event.clientX,
            pointerY: event.clientY,
            pointerOffsetX: current.pointerOffsetX ?? originRect.width / 2,
            pointerOffsetY: current.pointerOffsetY ?? 24,
          }),
          resolvedViewport,
        );
        dragState.current = { ...current, detachedFromDock: true, lastX: event.clientX, lastY: event.clientY };
        return;
      }
      moveFloatingPanel(layout.workspaceId, layout.panelId, deltaX, deltaY, resolvedViewport);
      const stackRects = collectDockedPanelStackRects(layout.workspaceId, layout.panelId);
      const snapTarget = resolveDockablePanelSnapTarget(
        { x: event.clientX, y: event.clientY },
        resolvedViewport,
        stackRects,
        allowedDockZones,
      );
      if (mountedRef.current) {
        setSnapPreviewRect(resolveDockablePanelSnapPreviewRect(snapTarget, resolvedViewport, stackRects) ?? null);
      }
      dragState.current = { ...current, lastX: event.clientX, lastY: event.clientY };
    }
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement> | PointerEvent) => {
    const current = dragState.current;
    if (current?.pointerId !== event.pointerId) return;
    current.cleanupGlobalPointerDrag?.();
    if (current.captureElement?.hasPointerCapture?.(event.pointerId)) {
      current.captureElement.releasePointerCapture(event.pointerId);
    }
    if (current.action === 'move' && current.externalWindowDrag) {
      const popup = externalWindowRef.current ?? current.ownerWindow;
      const fallbackPosition = resolveExternalFloatingPanelWindowPosition({
        pointerScreenX: event.screenX,
        pointerScreenY: event.screenY,
        anchor: current.externalWindowDrag.anchor,
      });
      const nextRect = resolveExternalFloatingPanelMoveEndRect({
        ownerScreenX: current.externalWindowDrag.ownerScreenX,
        ownerScreenY: current.externalWindowDrag.ownerScreenY,
        windowScreenX: popup && !popup.closed ? popup.screenX : fallbackPosition.screenX,
        windowScreenY: popup && !popup.closed ? popup.screenY : fallbackPosition.screenY,
        dragStartWidth: current.externalWindowDrag.width,
        dragStartHeight: current.externalWindowDrag.height,
        floatingRectSpace: 'screen',
      });
      floatPanel(layout.workspaceId, layout.panelId, nextRect, resolvedViewport, { constrainSize: false, floatingRectSpace: 'screen' });
    } else if (current.action === 'move' && current.detachedFromDock) {
      const snapTarget = resolveDockablePanelSnapTarget(
        { x: event.clientX, y: event.clientY },
        resolvedViewport,
        collectDockedPanelStackRects(layout.workspaceId, layout.panelId),
        allowedDockZones,
      );
      if (snapTarget.mode === 'docked') {
        snapPanelToDockTarget(layout.workspaceId, layout.panelId, snapTarget);
      } else if (snapTarget.mode === 'tab') {
        groupPanelWithPanel(layout.workspaceId, layout.panelId, snapTarget.referencePanelId);
      }
    }
    dragState.current = null;
    if (mountedRef.current) {
      setSnapPreviewRect(null);
    }
  };

  const panel = (
    <section
      aria-label={title}
      aria-modal={ariaModal}
      className={isCollapsed && !isFloating
        ? `theme-popover relative flex flex-col items-center justify-center bg-[#08111d]/95 font-bold uppercase tracking-widest text-cyan-100 shadow-xl backdrop-blur-md transition-colors hover:bg-cyan-400/15 border-cyan-300/35 border ${
            isVerticalDock
              ? `h-24 w-7 py-3 text-xs [writing-mode:vertical-rl] ${
                  layout.dockZone === 'left' ? 'rounded-r-lg border-l-0' : 'rounded-l-lg border-r-0'
                }`
              : `h-7 w-24 px-3 text-xs ${
                  layout.dockZone === 'top' ? 'rounded-b-lg border-t-0' : 'rounded-t-lg border-b-0'
                }`
          } ${className}`
        : isCompactFloatingChrome
        ? `theme-popover fixed flex min-h-0 flex-col overflow-hidden rounded-[3px] border border-cyan-300/25 bg-[#11131a]/95 text-cyan-50 shadow-2xl ${className}`
        : `theme-popover ${isFloating ? 'fixed flex min-h-0 flex-col' : `relative flex min-h-0 flex-col ${dockedFullHeightClassName}`} overflow-hidden rounded-xl border border-cyan-300/15 bg-[#0d1522]/95 text-cyan-50 shadow-2xl ${className}`}
      data-dock-zone={layout.dockZone}
      data-dockable-panel-chrome={chrome}
      data-dockable-panel-mode={layout.mode}
      data-dockable-panel-id={layout.panelId}
      data-dockable-tab-target={!isCompactFloatingChrome && !fixedSize && allowedDockZones.length > 0 ? 'true' : undefined}
      data-dockable-workspace-id={layout.workspaceId}
      onPointerDown={() => bringPanelToFront(layout.workspaceId, layout.panelId)}
      role={role}
      style={panelStyle}
    >
      {isCollapsed && !isFloating ? (
        <button
          aria-label={`Expand ${title}`}
          className="h-full w-full outline-none flex items-center justify-center pointer-events-auto"
          onClick={(event) => {
            event.stopPropagation();
            setPanelMode(layout.workspaceId, layout.panelId, 'docked');
          }}
          title={`Expand ${title}`}
          type="button"
        >
          {title}
        </button>
      ) : (
        isCompactFloatingChrome ? (
          <div
            aria-label={`${title} drag handle`}
            className="relative z-10 flex h-3 shrink-0 touch-none cursor-grab items-center justify-center border-b border-cyan-300/20 bg-[#171a22] active:cursor-grabbing"
            onPointerDown={startDrag}
            role="button"
            tabIndex={0}
            title={`${title} drag handle`}
          >
            <GripHorizontal aria-hidden size={11} className="shrink-0 text-cyan-100/50" />
          </div>
        ) : (
          <div
            aria-label={`${title} drag handle`}
            className="theme-header relative z-10 flex touch-none cursor-grab items-center gap-2 border-b border-cyan-300/10 bg-[#111c2c] px-2 py-1.5 active:cursor-grabbing"
            onPointerDown={startDrag}
            onDoubleClick={() => {
              if (isCollapsed) {
                setPanelMode(layout.workspaceId, layout.panelId, isFloating ? 'floating' : 'docked');
              }
            }}
            role="button"
            tabIndex={0}
            title={`${title} drag handle`}
          >
            <GripHorizontal aria-hidden size={14} className="shrink-0 text-cyan-100/45" />
            <span className="min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100/80">
              {title}
            </span>
            {canDockExternalPanel ? (
              <button
                className="theme-button rounded border border-cyan-300/20 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-100/70 hover:border-cyan-200/50 hover:text-white"
                onClick={(event) => {
                  event.stopPropagation();
                  setPanelMode(layout.workspaceId, layout.panelId, 'docked');
                }}
                onPointerDown={(event) => event.stopPropagation()}
                type="button"
              >
                Dock
              </button>
            ) : null}
            {onClose ? (
              <button
                className="theme-button rounded border border-cyan-300/20 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-100/70 hover:border-cyan-200/50 hover:text-white"
                onClick={(event) => {
                  event.stopPropagation();
                  onClose();
                }}
                onPointerDown={(event) => event.stopPropagation()}
                type="button"
              >
                Close
              </button>
            ) : null}
          </div>
        )
      )}
      {!isCollapsed && tabs ? (
        <div
          className="shrink-0 border-b border-cyan-300/10 bg-[#0a1320]/95"
          onPointerDown={(event) => event.stopPropagation()}
        >
          {tabs}
        </div>
      ) : null}
      {!isCollapsed ? (
        <div
          className={`min-h-0 ${bodyFlexClassName} ${resolvedBodyClassName}`}
          data-dockable-panel-body={layout.panelId}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <ErrorBoundary
            className="min-h-full"
            level="panel"
            resetKeys={[layout.workspaceId, layout.panelId, layout.mode]}
            title={`${title} Panel`}
          >
            <DockExpandContext.Provider value={!isFloating && isVerticalDock}>
              {children}
            </DockExpandContext.Provider>
          </ErrorBoundary>
        </div>
      ) : null}
      {isFloating && !isCollapsed && !fixedSize && !isCompactFloatingChrome
        ? RESIZE_HANDLES.map((handle) => (
            <div
              aria-label={`${title} ${handle.label.toLowerCase()}`}
              className={`absolute touch-none ${handle.className}`}
              key={handle.label}
              onPointerDown={(event) => startResize(event, handle)}
              role="separator"
            />
          ))
        : null}
      {dockedResizeHandle ? (
        <div
          aria-label={`${title} ${dockedResizeHandle.label.toLowerCase()}`}
          className={`absolute touch-none transition-colors ${dockedResizeHandle.className}`}
          onPointerDown={(event) => startResize(event, dockedResizeHandle)}
          role="separator"
          title={`${title} resize handle`}
        />
      ) : null}
      {snapPreviewRect ? <DockSnapPreview rect={snapPreviewRect} /> : null}
    </section>
  );

  if (shouldUseExternalWindow && externalPanelRoot && !shouldRenderInOwnerWindow) {
    return createPortal(panel, externalPanelRoot);
  }

  return panel;
}

function DockSnapPreview({ rect }: { rect: PanelRect }) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      aria-hidden
      className="fixed pointer-events-none rounded-sm border border-cyan-100/80 bg-cyan-300/20 shadow-[0_0_24px_rgba(103,232,249,0.65),0_0_2px_rgba(255,255,255,0.9)_inset]"
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
        zIndex: zIndexForFloatingPanel(900),
      }}
    />,
    document.body,
  );
}

function readViewport(): ViewportSize {
  if (typeof window === 'undefined') return { width: 1280, height: 720 };
  return {
    width: Math.max(DEFAULT_VIEWPORT_MARGIN * 2 + 1, window.innerWidth),
    height: Math.max(DEFAULT_VIEWPORT_MARGIN * 2 + 1, window.innerHeight),
  };
}

function readElementRect(element: Element | null): PanelRect | undefined {
  if (!(element instanceof HTMLElement)) return undefined;
  const rect = element.getBoundingClientRect();
  return {
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

function prepareExternalPanelDocument(targetDocument: Document): void {
  const themedRoot = document.querySelector<HTMLElement>('.signal-loom-themed');
  const themedRootStyle = themedRoot ? getComputedStyle(themedRoot) : null;

  targetDocument.documentElement.classList.add('signal-loom-themed');
  targetDocument.documentElement.style.margin = '0';
  targetDocument.documentElement.style.background = themedRootStyle?.getPropertyValue('--sl-bg') || '#08111d';
  targetDocument.body.style.margin = '0';
  targetDocument.body.style.overflow = 'hidden';
  targetDocument.body.style.background = themedRootStyle?.getPropertyValue('--sl-bg') || '#08111d';
  targetDocument.body.classList.add('signal-loom-themed');

  if (themedRootStyle) {
    for (const variable of FLOATING_PANEL_THEME_CSS_VARIABLES) {
      const value = themedRootStyle.getPropertyValue(variable).trim();
      if (value) {
        targetDocument.documentElement.style.setProperty(variable, value);
      }
    }
  }

  if (targetDocument.getElementById('signal-loom-floating-panel-style-copy')) {
    return;
  }

  let copiedStyle = false;
  for (const node of document.querySelectorAll('style, link[rel="stylesheet"]')) {
    const clone = node.cloneNode(true) as HTMLElement;
    if (!copiedStyle && clone.tagName === 'STYLE') {
      clone.id = 'signal-loom-floating-panel-style-copy';
      copiedStyle = true;
    }
    targetDocument.head.append(clone);
  }

  if (!copiedStyle) {
    const marker = targetDocument.createElement('style');
    marker.id = 'signal-loom-floating-panel-style-copy';
    targetDocument.head.append(marker);
  }
}

function configureExternalPanelDocumentGeometry(
  targetDocument: Document,
  root: HTMLElement,
  fixedRect?: PanelRect,
): void {
  if (!fixedRect) {
    targetDocument.documentElement.style.width = '';
    targetDocument.documentElement.style.height = '';
    targetDocument.documentElement.style.overflow = '';
    targetDocument.body.style.width = '';
    targetDocument.body.style.height = '';
    targetDocument.body.style.overflow = 'hidden';
    root.style.width = '';
    root.style.height = '';
    root.style.overflow = '';
    return;
  }

  const width = `${Math.max(1, Math.round(fixedRect.width))}px`;
  const height = `${Math.max(1, Math.round(fixedRect.height))}px`;
  targetDocument.documentElement.style.width = width;
  targetDocument.documentElement.style.height = height;
  targetDocument.documentElement.style.overflow = 'hidden';
  targetDocument.documentElement.style.background = 'transparent';
  targetDocument.body.style.width = width;
  targetDocument.body.style.height = height;
  targetDocument.body.style.overflow = 'hidden';
  targetDocument.body.style.background = 'transparent';
  root.style.width = width;
  root.style.height = height;
  root.style.overflow = 'hidden';
}

function collectDockedPanelStackRects(workspaceId: string, activePanelId: string): DockablePanelStackRect[] {
  if (typeof document === 'undefined') return [];
  const elements = document.querySelectorAll<HTMLElement>('[data-dockable-panel-id][data-dockable-workspace-id][data-dock-zone][data-dockable-tab-target="true"]');
  const rects: DockablePanelStackRect[] = [];

  elements.forEach((element) => {
    if (element.dataset.dockableWorkspaceId !== workspaceId) return;
    const panelId = element.dataset.dockablePanelId;
    if (!panelId || panelId === activePanelId) return;
    if (
      element.dataset.dockablePanelMode !== 'docked'
      && element.dataset.dockablePanelMode !== 'collapsed'
      && element.dataset.dockablePanelMode !== 'floating'
    ) return;
    const dockZone = element.dataset.dockZone;
    if (!isDockZone(dockZone)) return;
    const rect = readElementRect(element);
    if (!rect) return;
    rects.push({
      panelId,
      dockZone,
      rect,
    });
  });

  return rects;
}

function isDockZone(value: unknown): value is DockZone {
  return value === 'left'
    || value === 'right'
    || value === 'top'
    || value === 'bottom'
    || value === 'center'
    || value === 'overlay';
}
