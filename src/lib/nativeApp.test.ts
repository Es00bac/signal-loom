import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  dispatchNativeRendererCommand,
  getSignalLoomNativeBridge,
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
});
