import { Fragment, type AriaRole, type CSSProperties, type PointerEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  createDockablePanelDefaultSignature,
  sortDockedPanels,
  sortPanelsByZOrder,
  sanitizeDockablePanelLayout,
  type DockZone,
  type DockablePanelDefault,
  type DockablePanelLayout,
} from '../../lib/dockablePanel';
import {
  resolveActiveDockZoneLayout,
  shouldSplitDockZoneLayouts,
} from '../../lib/dockablePanelStack';
import { Z_INDEX } from '../../lib/zIndex';
import { useDockablePanelStore } from '../../store/dockablePanelStore';
import { ErrorBoundary } from '../Recovery/ErrorBoundary';
import { DockablePanel } from './DockablePanel';

export interface DockablePanelDefinition extends DockablePanelDefault {
  title: string;
  content: ReactNode;
  className?: string;
  bodyClassName?: string;
  allowedDockZones?: DockZone[];
  role?: AriaRole;
  ariaModal?: boolean;
  centerDockPresentation?: 'tabs' | 'split';
}

export interface DockablePanelHostProps {
  workspaceId: string;
  panels: DockablePanelDefinition[];
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function DockablePanelHost({ workspaceId, panels, children, className = '', style }: DockablePanelHostProps) {
  const registerPanelDefaults = useDockablePanelStore((state) => state.registerPanelDefaults);
  const layouts = useDockablePanelStore((state) => state.layouts);
  const definitions = useMemo(
    () => new Map(panels.map((panel) => [panel.panelId, panel])),
    [panels],
  );
  const panelDefaultSignature = useMemo(
    () => createDockablePanelDefaultSignature(panels.map((panel) => ({
      workspaceId,
      panelId: panel.panelId,
      mode: panel.mode,
      dockZone: panel.dockZone,
      floatingRect: panel.floatingRect,
      minSize: panel.minSize,
    }))),
    [panels, workspaceId],
  );
  const viewport = useViewportSize();

  useEffect(() => {
    const panelDefaults = JSON.parse(panelDefaultSignature) as DockablePanelDefault[];
    registerPanelDefaults(panelDefaults);
  }, [panelDefaultSignature, registerPanelDefaults]);

  const workspaceLayouts = useMemo(
    () => Object.values(layouts).filter((layout) => layout.workspaceId === workspaceId && definitions.has(layout.panelId)),
    [definitions, layouts, workspaceId],
  );
  const floatingPanels = sortPanelsByZOrder(workspaceLayouts.filter((layout) => layout.mode === 'floating'));
  const dockedPanels = sortDockedPanels(
    workspaceLayouts.filter((layout) => layout.mode === 'docked' || layout.mode === 'collapsed'),
  );

  return (
    <div className={`relative min-h-0 min-w-0 overflow-hidden ${className}`} style={style}>
      <div className="grid h-full min-h-0 min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] grid-rows-[auto_minmax(0,1fr)_auto] gap-0">
        <DockZoneStack className="col-span-3 row-start-1" layouts={dockedPanels} zone="top" definitions={definitions} viewport={viewport} />
        <DockZoneStack className="col-start-1 row-start-2" layouts={dockedPanels} zone="left" definitions={definitions} viewport={viewport} />
        <main className="relative col-start-2 row-start-2 min-h-0 min-w-0 overflow-hidden border border-white/5 bg-black/10">
          {children}
          <DockZoneStack className="absolute inset-3" layouts={dockedPanels} zone="center" definitions={definitions} viewport={viewport} />
          <DockZoneStack className="pointer-events-none absolute inset-3" layouts={dockedPanels} zone="overlay" definitions={definitions} viewport={viewport} />
        </main>
        <DockZoneStack className="col-start-3 row-start-2" layouts={dockedPanels} zone="right" definitions={definitions} viewport={viewport} />
        <DockZoneStack className="col-span-3 row-start-3" layouts={dockedPanels} zone="bottom" definitions={definitions} viewport={viewport} />
      </div>
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: Z_INDEX.floatingPanelBase }}>
        {floatingPanels.map((layout) => renderPanel(layout, definitions, viewport, 'pointer-events-auto'))}
      </div>
    </div>
  );
}

function DockZoneStack({
  zone,
  layouts,
  definitions,
  viewport,
  className = '',
}: {
  zone: DockZone;
  layouts: DockablePanelLayout[];
  definitions: Map<string, DockablePanelDefinition>;
  viewport: { width: number; height: number };
  className?: string;
}) {
  const zoneLayouts = layouts.filter((layout) => layout.dockZone === zone);
  const [activePanelId, setActivePanelId] = useState<string | null>(null);
  const splitResizeRef = useRef<{ pointerId: number; panelId: string; workspaceId: string; lastX: number } | null>(null);
  const resizeDockedPanel = useDockablePanelStore((state) => state.resizeDockedPanel);
  const activeLayout = resolveActiveDockZoneLayout(zoneLayouts, activePanelId);
  const shouldSplitCenter = shouldSplitDockZoneLayouts(
    zone,
    zoneLayouts,
    (panelId) => definitions.get(panelId)?.centerDockPresentation === 'split',
  );

  if (zoneLayouts.length === 0) return null;
  if (!activeLayout) return null;

  const startSplitResize = (event: PointerEvent<HTMLDivElement>, layout: DockablePanelLayout) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    splitResizeRef.current = {
      pointerId: event.pointerId,
      panelId: layout.panelId,
      workspaceId: layout.workspaceId,
      lastX: event.clientX,
    };
  };

  const continueSplitResize = (event: PointerEvent<HTMLDivElement>) => {
    const current = splitResizeRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const deltaX = event.clientX - current.lastX;
    if (deltaX !== 0) {
      resizeDockedPanel(
        current.workspaceId,
        current.panelId,
        { edgeX: 1, edgeY: 0, deltaX, deltaY: 0 },
        viewport,
      );
      splitResizeRef.current = { ...current, lastX: event.clientX };
    }
  };

  const endSplitResize = (event: PointerEvent<HTMLDivElement>) => {
    const current = splitResizeRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    splitResizeRef.current = null;
  };

  return (
    <aside className={`min-h-0 min-w-0 ${className}`} style={{ zIndex: Z_INDEX.dockedPanel }}>
      {shouldSplitCenter ? (
        <div className="flex h-full min-h-0 min-w-0 gap-2">
          {zoneLayouts.map((layout, index) => (
            <Fragment key={layout.panelId}>
              <div
                className="flex min-h-0 min-w-0"
                style={{ flex: `${Math.max(1, layout.floatingRect.width)} 1 0` }}
              >
                {renderPanel(
                  layout,
                  definitions,
                  viewport,
                  'h-full min-w-0 flex-1',
                )}
              </div>
              {index < zoneLayouts.length - 1 ? (
                <div
                  aria-label={`${definitions.get(layout.panelId)?.title ?? layout.panelId} split resize divider`}
                  className="w-2 shrink-0 cursor-col-resize touch-none rounded-full border-x border-cyan-200/0 bg-cyan-300/0 transition-colors hover:border-cyan-200/60 hover:bg-cyan-300/25"
                  onPointerCancel={endSplitResize}
                  onPointerDown={(event) => startSplitResize(event, layout)}
                  onPointerMove={continueSplitResize}
                  onPointerUp={endSplitResize}
                  role="separator"
                  title="Resize docked panels"
                />
              ) : null}
            </Fragment>
          ))}
        </div>
      ) : zoneLayouts.length > 1 && (zone === 'center' || zone === 'overlay') ? (
        <div className="mb-1 flex max-w-full gap-1 overflow-auto rounded-lg border border-cyan-300/10 bg-[#08111d]/90 p-1">
          {zoneLayouts.map((layout) => {
            const definition = definitions.get(layout.panelId);
            return (
              <button
                className={`rounded-md px-2 py-1 text-xs ${layout.panelId === activeLayout.panelId ? 'bg-cyan-300/20 text-white' : 'text-cyan-100/60 hover:bg-cyan-300/10'}`}
                key={layout.panelId}
                onClick={() => setActivePanelId(layout.panelId)}
                type="button"
              >
                {definition?.title ?? layout.panelId}
              </button>
            );
          })}
        </div>
      ) : null}
      {shouldSplitCenter ? null : zoneLayouts.length > 1 && zone !== 'center' && zone !== 'overlay' ? (
        <div className={`flex h-full min-h-0 min-w-0 gap-0 ${zone === 'left' || zone === 'right' ? 'flex-col' : 'flex-row'}`}>
          {zoneLayouts.map((layout) => renderPanel(
            layout,
            definitions,
            viewport,
            zone === 'left' || zone === 'right'
              ? 'h-auto min-h-0 flex-1'
              : 'min-w-0 flex-1',
          ))}
        </div>
      ) : activeLayout ? renderPanel(activeLayout, definitions, viewport) : null}
    </aside>
  );
}

function renderPanel(
  layout: DockablePanelLayout,
  definitions: Map<string, DockablePanelDefinition>,
  viewport: { width: number; height: number },
  className = '',
) {
  const definition = definitions.get(layout.panelId);
  if (!definition) return null;
  const safeLayout = sanitizeDockablePanelLayout(layout, layout, viewport);
  return (
    <DockablePanel
      allowedDockZones={definition.allowedDockZones}
      bodyClassName={definition.bodyClassName}
      className={`${definition.className ?? ''} ${className}`}
      key={layout.panelId}
      layout={safeLayout}
      ariaModal={definition.ariaModal}
      role={definition.role}
      title={definition.title}
      viewport={viewport}
    >
      <ErrorBoundary
        className="min-h-full"
        level="panel"
        resetKeys={[layout.workspaceId, layout.panelId, layout.mode]}
        title={`${definition.title} Panel`}
      >
        {definition.content}
      </ErrorBoundary>
    </DockablePanel>
  );
}

function useViewportSize() {
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
