import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  dispatchNativeRendererCommand,
  getSignalLoomNativeBridge,
  isNativeMenuCommand,
  NATIVE_RENDERER_COMMAND_EVENT,
  onNativeRendererCommand,
} from './nativeApp';

describe('native app bridge helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns undefined in the browser when Electron preload is absent', () => {
    vi.stubGlobal('window', {});

    expect(getSignalLoomNativeBridge()).toBeUndefined();
  });

  it('returns the preload bridge when Electron exposes it', () => {
    const bridge = {
      getNativeState: vi.fn(),
      onMenuCommand: vi.fn(),
    };
    vi.stubGlobal('window', { signalLoomNative: bridge });

    expect(getSignalLoomNativeBridge()).toBe(bridge);
  });

  it('dispatches renderer commands through a typed custom event', () => {
    const received: string[] = [];
    const eventTarget = new EventTarget();
    vi.stubGlobal('window', {
      addEventListener: eventTarget.addEventListener.bind(eventTarget),
      removeEventListener: eventTarget.removeEventListener.bind(eventTarget),
      dispatchEvent: eventTarget.dispatchEvent.bind(eventTarget),
    });
    const remove = onNativeRendererCommand((command) => received.push(command));

    dispatchNativeRendererCommand('timeline:cut');
    window.dispatchEvent(new CustomEvent(NATIVE_RENDERER_COMMAND_EVENT, {
      detail: {
        command: 'invalid-command',
      },
    }));
    remove();
    dispatchNativeRendererCommand('timeline:select');

    expect(received).toEqual(['timeline:cut']);
  });

  it('accepts workspace layout default menu commands from native menus', () => {
    expect(isNativeMenuCommand('view:layout-reset')).toBe(true);
    expect(isNativeMenuCommand('view:command-palette')).toBe(true);
    expect(isNativeMenuCommand('view:activity-trail')).toBe(true);
    expect(isNativeMenuCommand('view:layout-balanced')).toBe(true);
    expect(isNativeMenuCommand('view:layout-focus')).toBe(true);
    expect(isNativeMenuCommand('view:layout-all-panels')).toBe(true);
  });

  it('types workspace window bridge methods exposed by Electron preload', () => {
    const bridge = {
      getNativeState: vi.fn(),
      openWorkspaceWindow: vi.fn(),
      generateVertexText: vi.fn(),
      normalizeImportedMediaBatch: vi.fn(),
      materializeSourceAsset: vi.fn(),
      getSourceLibrarySnapshot: vi.fn(),
      applySourceLibraryChange: vi.fn(),
      onSourceLibraryChanged: vi.fn(),
      onMenuCommand: vi.fn(),
    };
    vi.stubGlobal('window', { signalLoomNative: bridge });

    expect(getSignalLoomNativeBridge()?.openWorkspaceWindow).toBe(bridge.openWorkspaceWindow);
    expect(getSignalLoomNativeBridge()?.generateVertexText).toBe(bridge.generateVertexText);
    expect(getSignalLoomNativeBridge()?.normalizeImportedMediaBatch).toBe(bridge.normalizeImportedMediaBatch);
    expect(getSignalLoomNativeBridge()?.materializeSourceAsset).toBe(bridge.materializeSourceAsset);
    expect(getSignalLoomNativeBridge()?.getSourceLibrarySnapshot).toBe(bridge.getSourceLibrarySnapshot);
    expect(getSignalLoomNativeBridge()?.applySourceLibraryChange).toBe(bridge.applySourceLibraryChange);
    expect(getSignalLoomNativeBridge()?.onSourceLibraryChanged).toBe(bridge.onSourceLibraryChanged);
  });

  it('accepts common edit clipboard commands from native menus', () => {
    expect(isNativeMenuCommand('edit:cut')).toBe(true);
    expect(isNativeMenuCommand('edit:copy')).toBe(true);
    expect(isNativeMenuCommand('edit:paste')).toBe(true);
  });

  it('accepts expanded Image and Paper tool commands from native menus', () => {
    expect(isNativeMenuCommand('image:tool-hand')).toBe(true);
    expect(isNativeMenuCommand('image:tool-sharpen-brush')).toBe(true);
    expect(isNativeMenuCommand('image:tool-eyedropper')).toBe(true);
    expect(isNativeMenuCommand('paper:tool-select')).toBe(true);
    expect(isNativeMenuCommand('paper:tool-text')).toBe(true);
    expect(isNativeMenuCommand('paper:export-kdp-assets')).toBe(true);
  });

  it('accepts Paper dockable panel menu commands from native menus', () => {
    expect(isNativeMenuCommand('paper:toggle-snap-to-guides')).toBe(true);
    expect(isNativeMenuCommand('paper:toggle-snap-to-grid')).toBe(true);
    expect(isNativeMenuCommand('paper:toggle-tools-panel')).toBe(true);
    expect(isNativeMenuCommand('paper:toggle-document-strip-panel')).toBe(true);
    expect(isNativeMenuCommand('paper:toggle-inspector-panel')).toBe(true);
    expect(isNativeMenuCommand('paper:toggle-preflight-panel')).toBe(true);
    expect(isNativeMenuCommand('paper:toggle-linked-assets-panel')).toBe(true);
    expect(isNativeMenuCommand('paper:toggle-dtp-parity-panel')).toBe(true);
    expect(isNativeMenuCommand('paper:reset-panels')).toBe(true);
  });
});
