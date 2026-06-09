import { type AriaRole, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { GripHorizontal } from 'lucide-react';
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
  viewport?: ViewportSize;
  role?: AriaRole;
  ariaModal?: boolean;
  onClose?: () => void;
}

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

export function DockablePanel({
  layout,
  title,
  children,
  className = '',
  bodyClassName = 'min-h-0 overflow-auto p-3',
  allowedDockZones = ['left', 'right', 'top', 'bottom', 'center', 'overlay'],
  viewport,
  role = 'region',
  ariaModal,
  onClose,
}: DockablePanelProps) {
  const dragState = useRef<DragState | null>(null);
  const mountedRef = useRef(false);
  const externalWindowRef = useRef<Window | null>(null);
  const [snapPreviewRect, setSnapPreviewRect] = useState<PanelRect | null>(null);
  const [externalPanelRoot, setExternalPanelRoot] = useState<HTMLElement | null>(null);
  const floatPanel = useDockablePanelStore((state) => state.floatPanel);
  const setPanelMode = useDockablePanelStore((state) => state.setPanelMode);
  const snapPanelToDockTarget = useDockablePanelStore((state) => state.snapPanelToDockTarget);
  const moveFloatingPanel = useDockablePanelStore((state) => state.moveFloatingPanel);
  const resizeFloatingPanel = useDockablePanelStore((state) => state.resizeFloatingPanel);
  const resizeDockedPanel = useDockablePanelStore((state) => state.resizeDockedPanel);
  const bringPanelToFront = useDockablePanelStore((state) => state.bringPanelToFront);
  const resolvedViewport = useMemo(() => viewport ?? readViewport(), [viewport]);
  const isFloating = layout.mode === 'floating';
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
  const renderedFloatingRect = useMemo(
    () => normalizeFloatingPanelRect(
      layout.floatingRect,
      resolvedViewport,
      layout.minSize,
      { constrainPosition: shouldRenderInOwnerWindow },
    ),
    [layout.floatingRect, layout.minSize, resolvedViewport, shouldRenderInOwnerWindow],
  );
  const externalFloatingRect = useMemo(
    () => normalizeFloatingPanelRect(
      layout.floatingRect,
      resolvedViewport,
      layout.minSize,
      { constrainPosition: false },
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
        width: '100vw',
        height: isCollapsed ? undefined : '100vh',
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
  const dockedFullHeightClassName = !isFloating && !isHorizontalDock ? 'h-full' : '';
  const dockedResizeHandle = !isFloating && !isCollapsed ? DOCKED_RESIZE_HANDLES[layout.dockZone] : undefined;

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
      `signal-loom-${layout.workspaceId}-${layout.panelId}`,
      buildFloatingPanelWindowFeatures(externalFloatingRectRef.current, {
        screenX: window.screenX,
        screenY: window.screenY,
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
    isFloating,
    layout.panelId,
    layout.workspaceId,
    shouldUseExternalWindow,
    title,
  ]);

  useEffect(() => {
    if (!shouldUseExternalWindow || !isFloating || !externalPanelRoot) return;
    let disposed = false;
    const popup = externalWindowRef.current;
    if (!popup || popup.closed || dragState.current?.externalWindowDrag) return;
    const targetX = Math.round(window.screenX + externalFloatingRect.x);
    const targetY = Math.round(window.screenY + externalFloatingRect.y);
    const targetWidth = Math.max(160, Math.round(externalFloatingRect.width));
    const targetHeight = Math.max(120, Math.round(externalFloatingRect.height));

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
  }, [externalFloatingRect, externalPanelRoot, isFloating, shouldUseExternalWindow]);

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
      });
      floatPanel(layout.workspaceId, layout.panelId, nextRect, resolvedViewport);
    } else if (current.action === 'move' && current.detachedFromDock) {
      const snapTarget = resolveDockablePanelSnapTarget(
        { x: event.clientX, y: event.clientY },
        resolvedViewport,
        collectDockedPanelStackRects(layout.workspaceId, layout.panelId),
        allowedDockZones,
      );
      if (snapTarget.mode === 'docked') {
        snapPanelToDockTarget(layout.workspaceId, layout.panelId, snapTarget);
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
      className={`theme-popover ${isFloating ? 'fixed flex min-h-0 flex-col' : `relative flex min-h-0 flex-col ${dockedFullHeightClassName}`} overflow-hidden rounded-xl border border-cyan-300/15 bg-[#0d1522]/95 text-cyan-50 shadow-2xl ${className}`}
      data-dock-zone={layout.dockZone}
      data-dockable-panel-mode={layout.mode}
      data-dockable-panel-id={layout.panelId}
      data-dockable-workspace-id={layout.workspaceId}
      onPointerDown={() => bringPanelToFront(layout.workspaceId, layout.panelId)}
      role={role}
      style={panelStyle}
    >
      {isCollapsed && !isFloating ? (
        <button
          aria-label={`Expand ${title}`}
          className={`theme-button flex min-h-0 min-w-0 flex-1 items-center justify-center bg-[#111c2c] px-1 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-100/80 transition-colors hover:bg-cyan-300/15 hover:text-white ${
            isVerticalDock ? '[writing-mode:vertical-rl]' : ''
          }`}
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
          {shouldUseExternalWindow ? (
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
      )}
      {!isCollapsed ? (
        <div className={`min-h-0 flex-1 ${bodyClassName}`} onPointerDown={(event) => event.stopPropagation()}>
          <ErrorBoundary
            className="min-h-full"
            level="panel"
            resetKeys={[layout.workspaceId, layout.panelId, layout.mode]}
            title={`${title} Panel`}
          >
            {children}
          </ErrorBoundary>
        </div>
      ) : null}
      {isFloating && !isCollapsed
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

function collectDockedPanelStackRects(workspaceId: string, activePanelId: string): DockablePanelStackRect[] {
  if (typeof document === 'undefined') return [];
  const elements = document.querySelectorAll<HTMLElement>('[data-dockable-panel-id][data-dockable-workspace-id][data-dock-zone]');
  const rects: DockablePanelStackRect[] = [];

  elements.forEach((element) => {
    if (element.dataset.dockableWorkspaceId !== workspaceId) return;
    const panelId = element.dataset.dockablePanelId;
    if (!panelId || panelId === activePanelId) return;
    if (element.dataset.dockablePanelMode !== 'docked' && element.dataset.dockablePanelMode !== 'collapsed') return;
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
