import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  createDefaultDockablePanelLayout,
  panelKey,
  sanitizeDockablePanelLayout,
  type DockZone,
  type PanelRect,
  type PanelSize,
  type ViewportSize,
} from '../../lib/dockablePanel';
import { createDockableDialogPanelDefault } from '../../lib/dockableDialog';
import { Z_INDEX } from '../../lib/zIndex';
import { useDockablePanelStore } from '../../store/dockablePanelStore';
import { DockablePanel } from './DockablePanel';

export interface DockableDialogProps {
  open: boolean;
  workspaceId: string;
  dialogId: string;
  title: string;
  children: ReactNode;
  onClose: () => void;
  modal?: boolean;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  defaultFloatingRect?: Partial<PanelRect>;
  minSize?: Partial<PanelSize>;
  dockZone?: DockZone;
  allowedDockZones?: DockZone[];
  className?: string;
  bodyClassName?: string;
  backdropClassName?: string;
}

export function DockableDialog({
  open,
  workspaceId,
  dialogId,
  title,
  children,
  onClose,
  modal = true,
  closeOnBackdrop = true,
  closeOnEscape = true,
  defaultFloatingRect,
  minSize,
  dockZone = 'overlay',
  allowedDockZones = ['overlay', 'center', 'left', 'right', 'top', 'bottom'],
  className = '',
  bodyClassName = 'min-h-0 flex-1 overflow-auto p-0',
  backdropClassName = 'bg-black/60 backdrop-blur-sm',
}: DockableDialogProps) {
  const registerPanelDefaults = useDockablePanelStore((state) => state.registerPanelDefaults);
  const layouts = useDockablePanelStore((state) => state.layouts);
  const floatPanel = useDockablePanelStore((state) => state.floatPanel);
  const hidePanel = useDockablePanelStore((state) => state.hidePanel);
  const layoutKey = panelKey(workspaceId, dialogId);
  const defaultLayout = useMemo(
    () => createDockableDialogPanelDefault({ workspaceId, dialogId, dockZone, defaultFloatingRect, minSize }),
    [defaultFloatingRect, dialogId, dockZone, minSize, workspaceId],
  );
  const fallbackLayout = createDefaultDockablePanelLayout(defaultLayout);
  const layout = sanitizeDockablePanelLayout(layouts[layoutKey], fallbackLayout);
  const viewport = useViewportSize();

  useEffect(() => {
    registerPanelDefaults([defaultLayout]);
  }, [defaultLayout, registerPanelDefaults]);

  useEffect(() => {
    if (open) {
      if (layout.mode === 'hidden') {
        floatPanel(workspaceId, dialogId, undefined, viewport);
      }
      return;
    }
    hidePanel(workspaceId, dialogId);
  }, [dialogId, floatPanel, hidePanel, layout.mode, open, viewport, workspaceId]);

  useEffect(() => {
    if (!open || !closeOnEscape) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [closeOnEscape, onClose, open]);

  if (!open || layout.mode === 'hidden') return null;

  const dialog = (
    <div className="fixed inset-0 pointer-events-none" style={{ zIndex: Z_INDEX.floatingPanelBase + 400 }}>
      {modal ? (
        <button
          aria-label={`Close ${title}`}
          className={`pointer-events-auto absolute inset-0 ${backdropClassName}`}
          onClick={closeOnBackdrop ? onClose : undefined}
          tabIndex={-1}
          type="button"
        />
      ) : null}
      <DockablePanel
        allowedDockZones={allowedDockZones}
        ariaModal={modal}
        bodyClassName={bodyClassName}
        className={`pointer-events-auto ${className}`}
        layout={layout}
        onClose={onClose}
        role="dialog"
        title={title}
        viewport={viewport}
      >
        {children}
      </DockablePanel>
    </div>
  );

  return createPortal(dialog, document.body);
}

function useViewportSize(): ViewportSize {
  const read = () => ({
    width: typeof window === 'undefined' ? 1280 : window.innerWidth,
    height: typeof window === 'undefined' ? 720 : window.innerHeight,
  });
  const [size, setSize] = useState(read);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onResize = () => setSize(read());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return size;
}
