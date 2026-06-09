import { describe, expect, it, vi } from 'vitest';

interface ElectronWindowOptionsModule {
  buildWorkspaceWindowOpenResult: (
    details: { frameName?: string; features?: string },
    parentWindow: unknown,
  ) => {
    action: 'allow' | 'deny';
    overrideBrowserWindowOptions?: Record<string, unknown>;
  };
  focusFloatingPanelChildWindow: (parentWindow: unknown, childWindow: Record<string, unknown>) => void;
  isSignalLoomFloatingPanelWindow: (details: { frameName?: string; features?: string }) => boolean;
}

async function loadWindowOptionsModule(): Promise<ElectronWindowOptionsModule> {
  // @ts-expect-error CommonJS Electron helper lives outside the renderer tsconfig module graph.
  return await import('../../electron/window-options.cjs') as ElectronWindowOptionsModule;
}

describe('Electron floating panel window options', () => {
  it('parents Signal Loom popup windows to the owning workspace window', async () => {
    const { buildWorkspaceWindowOpenResult } = await loadWindowOptionsModule();
    const parentWindow = { id: 1 };
    const result = buildWorkspaceWindowOpenResult({
      frameName: 'signal-loom-flow-source-bin',
      features: 'popup=yes,frame=false,width=360,height=420',
    }, parentWindow);

    expect(result.action).toBe('allow');
    expect(result.overrideBrowserWindowOptions).toMatchObject({
      parent: parentWindow,
      modal: false,
      frame: false,
      show: true,
      skipTaskbar: false,
    });
  });

  it('denies unrelated renderer-created windows', async () => {
    const { buildWorkspaceWindowOpenResult } = await loadWindowOptionsModule();

    expect(buildWorkspaceWindowOpenResult({
      frameName: 'external',
      features: 'width=800,height=600',
    }, {})).toEqual({ action: 'deny' });
  });

  it('focuses floating panel child windows above their owner', async () => {
    const { focusFloatingPanelChildWindow } = await loadWindowOptionsModule();
    const parentWindow = { id: 1 };
    const childWindow = {
      focus: vi.fn(),
      isDestroyed: vi.fn(() => false),
      isMinimized: vi.fn(() => true),
      moveTop: vi.fn(),
      restore: vi.fn(),
      setParentWindow: vi.fn(),
      show: vi.fn(),
    };

    focusFloatingPanelChildWindow(parentWindow, childWindow);

    expect(childWindow.setParentWindow).toHaveBeenCalledWith(parentWindow);
    expect(childWindow.restore).toHaveBeenCalled();
    expect(childWindow.show).toHaveBeenCalled();
    expect(childWindow.moveTop).toHaveBeenCalled();
    expect(childWindow.focus).toHaveBeenCalled();
  });
});
