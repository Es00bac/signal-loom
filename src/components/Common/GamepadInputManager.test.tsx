// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultGamepadBindings } from '../../lib/gamepadBindings';
import { GamepadInputManager } from './GamepadInputManager';

describe('GamepadInputManager binding scaffold', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders bounded workspace tabs plus button and d-pad binding rows', () => {
    const html = renderToStaticMarkup(
      <GamepadInputManager
        activeWorkspace="flow"
        bindings={createDefaultGamepadBindings()}
        onBindingProfileChange={() => undefined}
        onCommand={() => undefined}
        renderBindingScaffold
      />,
    );

    expect(html).toContain('data-gamepad-binding-scaffold="true"');
    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-label="Flow gamepad bindings"');
    expect(html).toContain('aria-label="Image gamepad bindings"');
    expect(html).toContain('aria-label="Paper gamepad bindings"');
    expect(html).toContain('aria-label="Video gamepad bindings"');
    expect(html).toContain('Buttons');
    expect(html).toContain('D-pad');
    expect(html).toContain('aria-label="Flow A / Cross command"');
    expect(html).toContain('aria-label="Flow D-pad up command"');
  });

  it('renders analog stick and trigger advanced controls for the selected workspace tab', () => {
    act(() => {
      root.render(
        <GamepadInputManager
          activeWorkspace="flow"
          bindings={createDefaultGamepadBindings()}
          onBindingProfileChange={() => undefined}
          onCommand={() => undefined}
          renderBindingScaffold
        />,
      );
    });

    act(() => {
      container.querySelector<HTMLButtonElement>('button[aria-label="Image gamepad bindings"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelector('input[aria-label="Image Left stick up threshold"]')).not.toBeNull();
    expect(container.querySelector('input[aria-label="Image Left stick up deadzone"]')).not.toBeNull();
    expect(container.querySelector('input[aria-label="Image Left stick up sensitivity"]')).not.toBeNull();
    expect(container.querySelector('select[aria-label="Image Left stick up curve"]')).not.toBeNull();
    expect(container.querySelector('input[aria-label="Image Left stick up invert"]')).not.toBeNull();

    expect(container.querySelector('input[aria-label="Image Left trigger threshold"]')).not.toBeNull();
    expect(container.querySelector('input[aria-label="Image Left trigger trigger minimum"]')).not.toBeNull();
    expect(container.querySelector('input[aria-label="Image Left trigger trigger maximum"]')).not.toBeNull();
    expect(container.querySelector('select[aria-label="Image Left trigger curve"]')).not.toBeNull();
  });

  it('emits a rebinding callback with an immutable next profile when a command changes', () => {
    const bindings = createDefaultGamepadBindings();
    const onBindingProfileChange = vi.fn();
    const onRebind = vi.fn();

    act(() => {
      root.render(
        <GamepadInputManager
          activeWorkspace="flow"
          bindings={bindings}
          onBindingProfileChange={onBindingProfileChange}
          onBindingRebind={onRebind}
          onCommand={() => undefined}
          renderBindingScaffold
        />,
      );
    });

    const commandSelect = container.querySelector<HTMLSelectElement>('select[aria-label="Flow A / Cross command"]');
    expect(commandSelect).not.toBeNull();

    act(() => {
      if (commandSelect) {
        commandSelect.value = '';
        commandSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    expect(onBindingProfileChange).toHaveBeenCalledTimes(1);
    const nextProfile = onBindingProfileChange.mock.calls[0]?.[0];
    expect(nextProfile).not.toBe(bindings);
    expect(nextProfile.flow).not.toBe(bindings.flow);
    expect(nextProfile.image).toBe(bindings.image);
    expect(nextProfile.flow.buttonSouth.command).toBe('');
    expect(bindings.flow.buttonSouth.command).toBe('view:command-palette');

    expect(onRebind).toHaveBeenCalledWith(expect.objectContaining({
      workspace: 'flow',
      controlId: 'buttonSouth',
      patch: { command: '' },
      nextProfile,
    }));
  });
});
