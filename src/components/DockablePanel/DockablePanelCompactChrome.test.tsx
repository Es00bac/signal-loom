// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDockablePanelStore } from '../../store/dockablePanelStore';
import { DockablePanel } from './DockablePanel';

describe('DockablePanel compact floating chrome', () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;
  let originalSetPointerCapture: typeof HTMLElement.prototype.setPointerCapture | undefined;
  let originalReleasePointerCapture: typeof HTMLElement.prototype.releasePointerCapture | undefined;

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    useDockablePanelStore.setState({ defaults: {}, layouts: {} });
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    originalSetPointerCapture = HTMLElement.prototype.setPointerCapture;
    originalReleasePointerCapture = HTMLElement.prototype.releasePointerCapture;
    HTMLElement.prototype.setPointerCapture = vi.fn();
    HTMLElement.prototype.releasePointerCapture = vi.fn();
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    host?.remove();
    root = null;
    host = null;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete window.signalLoomNative;
    if (originalSetPointerCapture) {
      HTMLElement.prototype.setPointerCapture = originalSetPointerCapture;
    } else {
      delete (HTMLElement.prototype as Partial<typeof HTMLElement.prototype>).setPointerCapture;
    }
    if (originalReleasePointerCapture) {
      HTMLElement.prototype.releasePointerCapture = originalReleasePointerCapture;
    } else {
      delete (HTMLElement.prototype as Partial<typeof HTMLElement.prototype>).releasePointerCapture;
    }
  });

  it('renders a movable fixed palette without dock buttons or resize handles', () => {
    const html = renderToStaticMarkup(
      <DockablePanel
        chrome="compact-floating"
        fixedSize
        layout={{
          workspaceId: 'image',
          panelId: 'tools',
          mode: 'floating',
          dockZone: 'left',
          floatingRect: { x: 20, y: 30, width: 66, height: 120 },
          minSize: { width: 66, height: 120 },
          zOrder: 10,
        }}
        title="Tools"
      >
        <div>Palette</div>
      </DockablePanel>,
    );

    expect(html).toContain('data-dockable-panel-chrome="compact-floating"');
    expect(html).toContain('aria-label="Tools drag handle"');
    expect(html).not.toContain('data-dockable-tab-target="true"');
    expect(html).not.toContain('Dock</button>');
    expect(html).not.toContain('Resize bottom');
    expect(html).not.toContain('Resize right');
  });

  it('renders compact palette chrome without resizable flex-fill body behavior', () => {
    const html = renderToStaticMarkup(
      <DockablePanel
        chrome="compact-floating"
        fixedSize
        layout={{
          workspaceId: 'image',
          panelId: 'tools',
          mode: 'floating',
          dockZone: 'left',
          floatingRect: { x: 20, y: 30, width: 66, height: 456 },
          minSize: { width: 66, height: 456 },
          zOrder: 10,
        }}
        title="Tools"
      >
        <div>Palette</div>
      </DockablePanel>,
    );

    expect(html).not.toContain('role="separator"');
    expect(html).not.toContain('flex-1');
    expect(html).toContain('flex-none');
  });

  it('does not render a dock button for fixed native Photoshop-style palettes', async () => {
    window.signalLoomNative = {} as never;
    const popupDocument = document.implementation.createHTMLDocument('Color');
    const popup = {
      closed: false,
      document: popupDocument,
      screenX: 220,
      screenY: 120,
      innerWidth: 180,
      innerHeight: 260,
      outerWidth: 180,
      outerHeight: 260,
      addEventListener: vi.fn(),
      close: vi.fn(),
      moveTo: vi.fn(),
      removeEventListener: vi.fn(),
      resizeTo: vi.fn(),
    };
    vi.spyOn(window, 'open').mockImplementation(() => popup as unknown as Window);

    await act(async () => {
      root?.render(
        <DockablePanel
          fixedSize
          layout={{
            workspaceId: 'image',
            panelId: 'color',
            mode: 'floating',
            dockZone: 'right',
            floatingRect: { x: 220, y: 120, width: 180, height: 260 },
            minSize: { width: 180, height: 260 },
            zOrder: 10,
          }}
          title="Color"
        >
          <div>Color</div>
        </DockablePanel>,
      );
      await Promise.resolve();
    });

    expect(popupDocument.querySelector('[data-dockable-workspace-id="image"]')?.textContent).not.toContain('Dock');
  });

  it('opens fixed native compact palettes at the real palette size without native resize affordances', async () => {
    window.signalLoomNative = {} as never;
    Object.defineProperty(window, 'screenX', { configurable: true, value: 2000 });
    Object.defineProperty(window, 'screenY', { configurable: true, value: 80 });
    const popupDocument = document.implementation.createHTMLDocument('Tools');
    const popup = {
      closed: false,
      document: popupDocument,
      screenX: 2368,
      screenY: 192,
      innerWidth: 66,
      innerHeight: 456,
      outerWidth: 66,
      outerHeight: 456,
      addEventListener: vi.fn(),
      close: vi.fn(),
      moveTo: vi.fn(),
      removeEventListener: vi.fn(),
      resizeTo: vi.fn(),
    };
    const open = vi.spyOn(window, 'open').mockImplementation(() => popup as unknown as Window);

    await act(async () => {
      root?.render(
        <DockablePanel
          chrome="compact-floating"
          fixedSize
          layout={{
            workspaceId: 'image',
            panelId: 'tools',
            mode: 'floating',
            dockZone: 'left',
            floatingRect: { x: 368, y: 112, width: 66, height: 456 },
            minSize: { width: 66, height: 456 },
            zOrder: 10,
          }}
          title="Tools"
        >
          <div>Palette</div>
        </DockablePanel>,
      );
      await Promise.resolve();
    });

    expect(open).toHaveBeenCalledWith(
      '',
      'signal-loom-image-tools',
      'popup=yes,frame=false,width=66,height=456,left=2368,top=192,resizable=no',
    );
  });

  it('treats compact native chrome as fixed-size even if fixedSize is omitted', async () => {
    window.signalLoomNative = {} as never;
    Object.defineProperty(window, 'screenX', { configurable: true, value: 2000 });
    Object.defineProperty(window, 'screenY', { configurable: true, value: 80 });
    const popupDocument = document.implementation.createHTMLDocument('Tools');
    const popup = {
      closed: false,
      document: popupDocument,
      screenX: 2368,
      screenY: 192,
      innerWidth: 66,
      innerHeight: 456,
      outerWidth: 66,
      outerHeight: 456,
      addEventListener: vi.fn(),
      close: vi.fn(),
      moveTo: vi.fn(),
      removeEventListener: vi.fn(),
      resizeTo: vi.fn(),
    };
    const open = vi.spyOn(window, 'open').mockImplementation(() => popup as unknown as Window);

    await act(async () => {
      root?.render(
        <DockablePanel
          chrome="compact-floating"
          layout={{
            workspaceId: 'image',
            panelId: 'tools',
            mode: 'floating',
            dockZone: 'left',
            floatingRect: { x: 368, y: 112, width: 66, height: 456 },
            minSize: { width: 66, height: 456 },
            zOrder: 10,
          }}
          title="Tools"
        >
          <div>Palette</div>
        </DockablePanel>,
      );
      await Promise.resolve();
    });

    expect(open).toHaveBeenCalledWith(
      '',
      'signal-loom-image-tools',
      'popup=yes,frame=false,width=66,height=456,left=2368,top=192,resizable=no',
    );
    expect(popupDocument.querySelector('[data-dockable-workspace-id="image"]')?.textContent).not.toContain('Dock');
    expect(popupDocument.documentElement.style.width).toBe('66px');
    expect(popupDocument.documentElement.style.height).toBe('456px');
  });

  it('opens native floating dialogs at explicit desktop-screen coordinates without owner offset drift', async () => {
    window.signalLoomNative = {} as never;
    Object.defineProperty(window, 'screenX', { configurable: true, value: 2000 });
    Object.defineProperty(window, 'screenY', { configurable: true, value: 80 });
    const popupDocument = document.implementation.createHTMLDocument('Layers');
    const popup = {
      closed: false,
      document: popupDocument,
      screenX: -1720,
      screenY: 140,
      innerWidth: 640,
      innerHeight: 420,
      outerWidth: 640,
      outerHeight: 420,
      addEventListener: vi.fn(),
      close: vi.fn(),
      moveTo: vi.fn(),
      removeEventListener: vi.fn(),
      resizeTo: vi.fn(),
    };
    const open = vi.spyOn(window, 'open').mockImplementation(() => popup as unknown as Window);

    await act(async () => {
      root?.render(
        <DockablePanel
          layout={{
            workspaceId: 'image',
            panelId: 'layers',
            mode: 'floating',
            dockZone: 'right',
            floatingRect: { x: -1720, y: 140, width: 640, height: 420 },
            floatingRectSpace: 'screen',
            minSize: { width: 240, height: 180 },
            zOrder: 10,
          }}
          title="Layers"
        >
          <div>Layers</div>
        </DockablePanel>,
      );
      await Promise.resolve();
    });

    expect(open).toHaveBeenCalledWith(
      '',
      'signal-loom-image-layers',
      'popup=yes,frame=false,width=640,height=420,left=-1720,top=140',
    );
  });

  it('does not mutate fixed palette geometry while dragging compact chrome panels in owner-window mode', () => {
    useDockablePanelStore.setState({
      defaults: {},
      layouts: {
        'image/tools': {
          workspaceId: 'image',
          panelId: 'tools',
          mode: 'floating',
          dockZone: 'left',
          floatingRect: { x: 20, y: 30, width: 66, height: 456 },
          minSize: { width: 66, height: 456 },
          zOrder: 10,
        },
      },
    });

    const resizeFloatingPanelSpy = vi.spyOn(useDockablePanelStore.getState(), 'resizeFloatingPanel');

    act(() => {
      root?.render(
        <DockablePanel
          chrome="compact-floating"
          fixedSize
          layout={{
            workspaceId: 'image',
            panelId: 'tools',
            mode: 'floating',
            dockZone: 'left',
            floatingRect: { x: 20, y: 30, width: 66, height: 456 },
            minSize: { width: 66, height: 456 },
            zOrder: 10,
          }}
          title="Tools"
        >
          <div>Palette</div>
        </DockablePanel>,
      );
    });

    const handle = host?.querySelector('[aria-label="Tools drag handle"]');
    expect(handle).not.toBeNull();
    const before = useDockablePanelStore.getState().layouts['image/tools'];

    const pointerDown = new MouseEvent('pointerdown', {
      bubbles: true,
      clientX: 25,
      clientY: 34,
      screenX: 50,
      screenY: 80,
    });
    Object.defineProperty(pointerDown, 'pointerId', { value: 17 });

    act(() => {
      handle?.dispatchEvent(pointerDown);
    });

    const pointerMove = new MouseEvent('pointermove', {
      bubbles: true,
      clientX: 49,
      clientY: 58,
      screenX: 74,
      screenY: 104,
    });
    Object.defineProperty(pointerMove, 'pointerId', { value: 17 });
    Object.defineProperty(pointerMove, 'preventDefault', { value: vi.fn() });
    Object.defineProperty(pointerMove, 'stopPropagation', { value: vi.fn() });

    act(() => {
      window.dispatchEvent(pointerMove);
    });

    const pointerUp = new MouseEvent('pointerup', {
      bubbles: true,
      clientX: 49,
      clientY: 58,
      screenX: 74,
      screenY: 104,
    });
    Object.defineProperty(pointerUp, 'pointerId', { value: 17 });
    Object.defineProperty(pointerUp, 'preventDefault', { value: vi.fn() });
    Object.defineProperty(pointerUp, 'stopPropagation', { value: vi.fn() });

    act(() => {
      window.dispatchEvent(pointerUp);
    });

    const after = useDockablePanelStore.getState().layouts['image/tools'];
    expect(before).toBeDefined();
    expect(after).toBeDefined();
    expect(after?.floatingRect.width).toBe(before?.floatingRect.width);
    expect(after?.floatingRect.height).toBe(before?.floatingRect.height);
    expect(resizeFloatingPanelSpy).not.toHaveBeenCalled();
  });

  it('repairs fixed native compact palette popup size when the OS surface is larger than the saved content size', async () => {
    window.signalLoomNative = {} as never;
    Object.defineProperty(window, 'screenX', { configurable: true, value: 2000 });
    Object.defineProperty(window, 'screenY', { configurable: true, value: 80 });
    const popupDocument = document.implementation.createHTMLDocument('Tools');
    const popup = {
      closed: false,
      document: popupDocument,
      screenX: 2368,
      screenY: 192,
      innerWidth: 102,
      innerHeight: 457,
      outerWidth: 102,
      outerHeight: 457,
      addEventListener: vi.fn(),
      close: vi.fn(),
      moveTo: vi.fn(),
      removeEventListener: vi.fn(),
      resizeTo: vi.fn(),
    };
    vi.spyOn(window, 'open').mockImplementation(() => popup as unknown as Window);

    await act(async () => {
      root?.render(
        <DockablePanel
          chrome="compact-floating"
          fixedSize
          layout={{
            workspaceId: 'image',
            panelId: 'tools',
            mode: 'floating',
            dockZone: 'left',
            floatingRect: { x: 368, y: 112, width: 66, height: 456 },
            minSize: { width: 66, height: 456 },
            zOrder: 10,
          }}
          title="Tools"
        >
          <div>Palette</div>
        </DockablePanel>,
      );
      await Promise.resolve();
    });

    const externalPanel = popupDocument.querySelector('[data-dockable-workspace-id="image"][data-dockable-panel-id="tools"]');

    expect(externalPanel?.getAttribute('style')).toContain('width: 66px');
    expect(externalPanel?.getAttribute('style')).toContain('height: 456px');
    expect(popupDocument.documentElement.style.width).toBe('66px');
    expect(popupDocument.documentElement.style.height).toBe('456px');
    expect(popupDocument.body.style.width).toBe('66px');
    expect(popupDocument.body.style.height).toBe('456px');
    expect(popupDocument.body.style.background).toBe('transparent');
    const externalRoot = popupDocument.getElementById('signal-loom-floating-panel-root');
    expect(externalRoot?.style.width).toBe('66px');
    expect(externalRoot?.style.height).toBe('456px');
    expect(popup.resizeTo).toHaveBeenCalledWith(66, 456);
  });

  it('reasserts fixed compact palette size while dragging if the native popup surface drifts larger', async () => {
    window.signalLoomNative = {} as never;
    Object.defineProperty(window, 'screenX', { configurable: true, value: 2000 });
    Object.defineProperty(window, 'screenY', { configurable: true, value: 80 });
    const popupDocument = document.implementation.createHTMLDocument('Tools');
    const listeners = new Map<string, Set<(event: Record<string, unknown>) => void>>();
    const popup = {
      closed: false,
      document: popupDocument,
      screenX: 2368,
      screenY: 192,
      innerWidth: 66,
      innerHeight: 456,
      outerWidth: 66,
      outerHeight: 456,
      addEventListener: vi.fn((type: string, listener: (event: Record<string, unknown>) => void) => {
        const set = listeners.get(type) ?? new Set<(event: Record<string, unknown>) => void>();
        set.add(listener);
        listeners.set(type, set);
      }),
      close: vi.fn(),
      moveTo: vi.fn(),
      removeEventListener: vi.fn((type: string, listener: (event: Record<string, unknown>) => void) => {
        listeners.get(type)?.delete(listener);
      }),
      resizeTo: vi.fn(),
    };
    Object.defineProperty(popupDocument, 'defaultView', { configurable: true, value: popup });
    vi.spyOn(window, 'open').mockImplementation(() => popup as unknown as Window);

    await act(async () => {
      root?.render(
        <DockablePanel
          chrome="compact-floating"
          fixedSize
          layout={{
            workspaceId: 'image',
            panelId: 'tools',
            mode: 'floating',
            dockZone: 'left',
            floatingRect: { x: 368, y: 112, width: 66, height: 456 },
            minSize: { width: 66, height: 456 },
            zOrder: 10,
          }}
          title="Tools"
        >
          <div>Palette</div>
        </DockablePanel>,
      );
      await Promise.resolve();
    });

    const handle = popupDocument.querySelector('[aria-label="Tools drag handle"]') as HTMLElement | null;
    expect(handle).not.toBeNull();

    const pointerDown = new MouseEvent('pointerdown', {
      bubbles: true,
      clientX: 390,
      clientY: 120,
      screenX: 2390,
      screenY: 200,
    });
    Object.defineProperty(pointerDown, 'pointerId', { configurable: true, value: 7 });

    act(() => {
      handle?.dispatchEvent(pointerDown);
    });

    popup.innerWidth = 224;
    popup.innerHeight = 640;
    popup.outerWidth = 224;
    popup.outerHeight = 640;

    const pointerMove = {
      pointerId: 7,
      clientX: 420,
      clientY: 156,
      screenX: 2420,
      screenY: 236,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };

    act(() => {
      listeners.get('pointermove')?.forEach((listener) => listener(pointerMove));
    });

    expect(popup.moveTo).toHaveBeenCalled();
    expect(popup.resizeTo).toHaveBeenCalledWith(66, 456);
  });

  it('reasserts standard native floating dialog size while dragging if the popup surface drifts larger', async () => {
    window.signalLoomNative = {} as never;
    Object.defineProperty(window, 'screenX', { configurable: true, value: 2000 });
    Object.defineProperty(window, 'screenY', { configurable: true, value: 80 });
    const popupDocument = document.implementation.createHTMLDocument('Layers');
    const listeners = new Map<string, Set<(event: Record<string, unknown>) => void>>();
    const popup = {
      closed: false,
      document: popupDocument,
      screenX: 2368,
      screenY: 192,
      innerWidth: 300,
      innerHeight: 560,
      outerWidth: 300,
      outerHeight: 560,
      addEventListener: vi.fn((type: string, listener: (event: Record<string, unknown>) => void) => {
        const set = listeners.get(type) ?? new Set<(event: Record<string, unknown>) => void>();
        set.add(listener);
        listeners.set(type, set);
      }),
      close: vi.fn(),
      moveTo: vi.fn(),
      removeEventListener: vi.fn((type: string, listener: (event: Record<string, unknown>) => void) => {
        listeners.get(type)?.delete(listener);
      }),
      resizeTo: vi.fn(),
    };
    Object.defineProperty(popupDocument, 'defaultView', { configurable: true, value: popup });
    vi.spyOn(window, 'open').mockImplementation(() => popup as unknown as Window);

    await act(async () => {
      root?.render(
        <DockablePanel
          layout={{
            workspaceId: 'image',
            panelId: 'layers',
            mode: 'floating',
            dockZone: 'right',
            floatingRect: { x: 1120, y: 96, width: 300, height: 560 },
            minSize: { width: 224, height: 220 },
            zOrder: 10,
          }}
          title="Layers"
        >
          <div>Layers</div>
        </DockablePanel>,
      );
      await Promise.resolve();
    });

    const handle = popupDocument.querySelector('[aria-label="Layers drag handle"]') as HTMLElement | null;
    expect(handle).not.toBeNull();

    const pointerDown = new MouseEvent('pointerdown', {
      bubbles: true,
      clientX: 1180,
      clientY: 120,
      screenX: 3180,
      screenY: 200,
    });
    Object.defineProperty(pointerDown, 'pointerId', { configurable: true, value: 9 });

    act(() => {
      handle?.dispatchEvent(pointerDown);
    });

    popup.innerWidth = 388;
    popup.innerHeight = 684;
    popup.outerWidth = 388;
    popup.outerHeight = 684;

    const pointerMove = {
      pointerId: 9,
      clientX: 1210,
      clientY: 156,
      screenX: 3210,
      screenY: 236,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };

    act(() => {
      listeners.get('pointermove')?.forEach((listener) => listener(pointerMove));
    });

    expect(popup.moveTo).toHaveBeenCalled();
    expect(popup.resizeTo).toHaveBeenCalledWith(300, 560);
  });
});
