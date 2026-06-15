// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImageLayer, LayerBitmap } from '../../types/imageEditor';
import { EditableVectorShapeLayerControls } from './ImageEditorVectorLayerControls';

function makeLayer(): ImageLayer {
  return {
    id: 'layer-star',
    name: 'Badge Star',
    type: 'vector',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    x: 24,
    y: 32,
    bitmap: { width: 120, height: 120 } as LayerBitmap,
    bitmapVersion: 0,
    mask: null,
    metadata: {
      vectorShape: {
        kind: 'path',
        width: 120,
        height: 120,
        closed: true,
        points: Array.from({ length: 10 }, (_, index) => ({
          x: index * 10,
          y: index % 2 === 0 ? 0 : 60,
        })),
        preset: {
          kind: 'star',
          polygonSides: 5,
          starInnerRadius: 0.45,
        },
        fillColor: '#ffcc00',
        fillOpacity: 1,
        strokeColor: '#222222',
        strokeOpacity: 1,
        strokeWidth: 3,
      },
    },
    vectorRecipe: '<svg />',
  };
}

function setInputValue(input: HTMLInputElement | HTMLSelectElement, value: string) {
  const prototype = input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('EditableVectorShapeLayerControls', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it('renders custom preset controls for retained star path layers and emits preset patches', () => {
    const onChange = vi.fn();

    act(() => {
      root.render(<EditableVectorShapeLayerControls layer={makeLayer()} onChange={onChange} />);
    });

    expect(container.textContent).toContain('Star');

    const pointsSelect = container.querySelector<HTMLSelectElement>('select[aria-label="Vector preset points"]');
    const innerRadiusInput = container.querySelector<HTMLInputElement>('input[aria-label="Vector star inner radius"]');

    expect(pointsSelect).not.toBeNull();
    expect(innerRadiusInput).not.toBeNull();

    act(() => {
      setInputValue(pointsSelect!, '7');
      setInputValue(innerRadiusInput!, '0.3');
    });

    expect(onChange).toHaveBeenCalledWith({
      preset: {
        kind: 'star',
        polygonSides: 7,
        starInnerRadius: 0.45,
      },
    });
    expect(onChange).toHaveBeenCalledWith({
      preset: {
        kind: 'star',
        polygonSides: 5,
        starInnerRadius: 0.3,
      },
    });
    expect(container.textContent).toContain('Straight anchors ready');
    expect(container.textContent).toContain('Bezier handles editable on retained paths');
    expect(container.textContent).toContain('Boolean combine uses separate vector layers');
    expect(container.textContent).toContain('Live boolean stack not retained');
    expect(container.textContent).toContain('Preset metadata retained');
    expect(container.textContent).toContain('Native custom shape library instance not retained');
    expect(container.textContent).toContain('Exact boolean outputs export as materialized paths');
    expect(container.textContent).toContain('Vector mask stores a closed local copy');
    expect(container.textContent).toContain('SVG keeps straight segments only');
    expect(container.textContent).toContain('PSD keeps layer-backed paths only');
    expect(container.textContent).toContain('Custom preset regenerates until points are edited');
    expect(container.querySelector('[data-vector-controls-signature]')?.getAttribute('data-vector-controls-signature')).toContain(
      'image-vector-layer-controls:v1:',
    );
  });
});
