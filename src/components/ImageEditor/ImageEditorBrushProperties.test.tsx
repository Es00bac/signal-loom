// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_BRUSH_SETTINGS, DEFAULT_RETOUCH_TOOL_SETTINGS } from '../../types/imageEditor';
import { useImageEditorStore } from '../../store/imageEditorStore';
import { useSettingsStore } from '../../store/settingsStore';
import { BrushPanel } from './ImageEditorBrushProperties';

function setInputValue(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = Object.getPrototypeOf(input);
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('BrushPanel', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const localStorageStub = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    vi.stubGlobal('localStorage', localStorageStub);
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: localStorageStub,
    });
    (useSettingsStore as typeof useSettingsStore & {
      persist?: {
        setOptions?: (options: {
          storage: {
            getItem: (name: string) => string | null;
            setItem: (name: string, value: string) => void;
            removeItem: (name: string) => void;
          };
        }) => void;
      };
    }).persist?.setOptions?.({
      storage: localStorageStub,
    });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    useImageEditorStore.setState({
      tool: 'brush',
      brushSettings: { ...DEFAULT_BRUSH_SETTINGS },
      retouchToolSettings: { ...DEFAULT_RETOUCH_TOOL_SETTINGS },
    });
    useSettingsStore.setState({
      customBrushPresets: [],
    } as Partial<ReturnType<typeof useSettingsStore.getState>>);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it('updates centered brush symmetry mode from the panel controls', () => {
    act(() => {
      root.render(<BrushPanel />);
    });

    const verticalButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.trim() === 'Vertical');
    const fourWayButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.trim() === 'Four-Way');
    expect(verticalButton).not.toBeUndefined();
    expect(fourWayButton).not.toBeUndefined();

    act(() => {
      verticalButton?.click();
    });

    expect(useImageEditorStore.getState().brushSettings.symmetryMode).toBe('vertical');

    act(() => {
      fourWayButton?.click();
    });

    expect(useImageEditorStore.getState().brushSettings.symmetryMode).toBe('both');
  });

  it('updates advanced brush engine controls for velocity, texture, wet media, GPU, device routes, and ABR fidelity', () => {
    act(() => {
      root.render(<BrushPanel />);
    });

    const velocitySize = container.querySelector<HTMLInputElement>('input[aria-label="Velocity size"]');
    const textureName = container.querySelector<HTMLInputElement>('input[aria-label="Brush texture name"]');
    const textureDepth = container.querySelector<HTMLInputElement>('input[aria-label="Texture depth"]');
    const dualBrush = container.querySelector<HTMLInputElement>('input[aria-label="Dual-brush composition"]');
    const wetMedia = container.querySelector<HTMLInputElement>('input[aria-label="Wet media"]');
    const wetMix = container.querySelector<HTMLInputElement>('input[aria-label="Wet media mix"]');
    const gpuBrushEngine = container.querySelector<HTMLInputElement>('input[aria-label="GPU brush engine"]');
    const androidBrushControls = container.querySelector<HTMLInputElement>('input[aria-label="Android brush controls"]');
    const gamepadBrushControls = container.querySelector<HTMLInputElement>('input[aria-label="Gamepad brush controls"]');
    const abrPresetId = container.querySelector<HTMLInputElement>('input[aria-label="ABR preset id"]');
    const abrVersion = container.querySelector<HTMLInputElement>('input[aria-label="ABR version"]');

    expect(velocitySize).not.toBeNull();
    expect(textureName).not.toBeNull();
    expect(textureDepth).not.toBeNull();
    expect(dualBrush).not.toBeNull();
    expect(wetMedia).not.toBeNull();
    expect(wetMix).not.toBeNull();
    expect(gpuBrushEngine).not.toBeNull();
    expect(androidBrushControls).not.toBeNull();
    expect(gamepadBrushControls).not.toBeNull();
    expect(abrPresetId).not.toBeNull();
    expect(abrVersion).not.toBeNull();

    act(() => {
      setInputValue(velocitySize!, '0.7');
      setInputValue(textureName!, 'canvas-grain');
      setInputValue(textureDepth!, '0.6');
      dualBrush!.click();
      wetMedia!.click();
      setInputValue(wetMix!, '0.35');
      gpuBrushEngine!.click();
      androidBrushControls!.click();
      gamepadBrushControls!.click();
      setInputValue(abrPresetId!, 'abr:dry-media-01');
      setInputValue(abrVersion!, '12');
    });

    expect(useImageEditorStore.getState().brushSettings).toMatchObject({
      velocitySize: 0.7,
      texture: 'canvas-grain',
      textureDepth: 0.6,
      dualBrush: true,
      wetMedia: true,
      wetMix: 0.35,
      gpuBrushEngine: true,
      gpuAcceleration: true,
      androidBrushControls: true,
      androidStylusControls: true,
      gamepadBrushControls: true,
      gamepadPressure: true,
      abrPresetId: 'abr:dry-media-01',
      abrVersion: 12,
    });
  });

  it('updates clone stamp sample mode and aligned behavior from retouch controls', () => {
    useImageEditorStore.setState({
      tool: 'cloneStamp',
      retouchToolSettings: { ...DEFAULT_RETOUCH_TOOL_SETTINGS, sampleMode: 'currentLayer', aligned: true },
    });

    act(() => {
      root.render(<BrushPanel />);
    });

    const sampleSelect = container.querySelector<HTMLSelectElement>('select[aria-label="Retouch sample mode"]');
    expect(sampleSelect).not.toBeNull();
    const alignedCheckbox = container.querySelector<HTMLInputElement>('input[aria-label="Aligned clone stamp"]');
    expect(alignedCheckbox).not.toBeNull();

    act(() => {
      sampleSelect!.value = 'allLayers';
      sampleSelect!.dispatchEvent(new Event('change', { bubbles: true }));
      alignedCheckbox!.click();
    });

    expect(useImageEditorStore.getState().retouchToolSettings).toMatchObject({
      sampleMode: 'allLayers',
      aligned: false,
    });
  });

  it('updates finishing brush tonal options from dedicated retouch controls', () => {
    useImageEditorStore.setState({
      tool: 'dodgeBrush',
      retouchToolSettings: {
        ...DEFAULT_RETOUCH_TOOL_SETTINGS,
        toneRange: 'midtones',
        protectTones: true,
      },
    });

    act(() => {
      root.render(<BrushPanel />);
    });

    const rangeSelect = container.querySelector<HTMLSelectElement>('select[aria-label="Dodge and burn tonal range"]');
    expect(rangeSelect).not.toBeNull();
    const protectTonesCheckbox = container.querySelector<HTMLInputElement>('input[aria-label="Protect tones"]');
    expect(protectTonesCheckbox).not.toBeNull();
    const airbrushCheckbox = container.querySelector<HTMLInputElement>('input[aria-label="Airbrush"]');
    const rateInput = container.querySelector<HTMLInputElement>('input[aria-label="Dodge and burn rate"]');
    expect(airbrushCheckbox).not.toBeNull();
    expect(rateInput).not.toBeNull();

    act(() => {
      rangeSelect!.value = 'highlights';
      rangeSelect!.dispatchEvent(new Event('change', { bubbles: true }));
      protectTonesCheckbox!.click();
      airbrushCheckbox!.click();
      rateInput!.value = '0.8';
      rateInput!.dispatchEvent(new Event('input', { bubbles: true }));
      rateInput!.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(useImageEditorStore.getState().retouchToolSettings).toMatchObject({
      toneRange: 'highlights',
      protectTones: false,
      airbrush: true,
      rate: 0.8,
    });
  });

  it('exposes local finishing brush source semantics without showing clone-only controls', () => {
    useImageEditorStore.setState({
      tool: 'smudgeBrush',
      retouchToolSettings: {
        ...DEFAULT_RETOUCH_TOOL_SETTINGS,
        toneRange: 'all',
        protectTones: false,
      },
    });

    act(() => {
      root.render(<BrushPanel />);
    });

    expect(container.textContent).toContain('Finishing Brush');
    expect(container.textContent).toContain('Previous stroke point');
    expect(container.querySelector<HTMLInputElement>('input[aria-label="Aligned clone stamp"]')).toBeNull();
  });

  it('updates blur and sharpen finishing brush sample modes without clone-only controls', () => {
    useImageEditorStore.setState({
      tool: 'blurBrush',
      retouchToolSettings: {
        ...DEFAULT_RETOUCH_TOOL_SETTINGS,
        sampleMode: 'currentLayer',
      },
    });

    act(() => {
      root.render(<BrushPanel />);
    });

    expect(container.textContent).toContain('Selectable layer/composite snapshot');
    const sampleSelect = container.querySelector<HTMLSelectElement>('select[aria-label="Finishing brush sample mode"]');
    expect(sampleSelect).not.toBeNull();
    expect(container.querySelector<HTMLInputElement>('input[aria-label="Aligned clone stamp"]')).toBeNull();

    act(() => {
      sampleSelect!.value = 'currentAndBelow';
      sampleSelect!.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(useImageEditorStore.getState().retouchToolSettings.sampleMode).toBe('currentAndBelow');
  });

  it('updates sponge vibrance and luminosity controls from dedicated retouch controls', () => {
    useImageEditorStore.setState({
      tool: 'spongeSaturateBrush',
      retouchToolSettings: {
        ...DEFAULT_RETOUCH_TOOL_SETTINGS,
        spongeVibrance: 0.35,
        spongePreserveLuminosity: true,
      },
    });

    act(() => {
      root.render(<BrushPanel />);
    });

    const vibranceInput = container.querySelector<HTMLInputElement>('input[aria-label="Sponge vibrance"]');
    expect(vibranceInput).not.toBeNull();
    const preserveCheckbox = container.querySelector<HTMLInputElement>('input[aria-label="Preserve sponge luminosity"]');
    expect(preserveCheckbox).not.toBeNull();
    expect(container.querySelector<HTMLSelectElement>('select[aria-label="Dodge and burn tonal range"]')).toBeNull();
    const airbrushCheckbox = container.querySelector<HTMLInputElement>('input[aria-label="Airbrush"]');
    const rateInput = container.querySelector<HTMLInputElement>('input[aria-label="Sponge rate"]');
    expect(airbrushCheckbox).not.toBeNull();
    expect(rateInput).not.toBeNull();

    act(() => {
      vibranceInput!.value = '0.8';
      vibranceInput!.dispatchEvent(new Event('input', { bubbles: true }));
      vibranceInput!.dispatchEvent(new Event('change', { bubbles: true }));
      preserveCheckbox!.click();
      airbrushCheckbox!.click();
      rateInput!.value = '0.25';
      rateInput!.dispatchEvent(new Event('input', { bubbles: true }));
      rateInput!.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(useImageEditorStore.getState().retouchToolSettings).toMatchObject({
      spongeVibrance: 0.8,
      spongePreserveLuminosity: false,
      airbrush: true,
      rate: 0.25,
    });
  });
});
