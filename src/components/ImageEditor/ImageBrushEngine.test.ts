import { describe, expect, it } from 'vitest';
import { DEFAULT_BRUSH_SETTINGS } from '../../types/imageEditor';
import {
  buildBrushDabs,
  normalizeBrushSettings,
  resolveBrushDynamics,
  smoothBrushPoint,
} from './ImageBrushEngine';

describe('ImageBrushEngine', () => {
  it('normalizes brush settings with desktop-style controls and safe bounds', () => {
    expect(normalizeBrushSettings({
      size: 2048,
      opacity: 3,
      hardness: -1,
      flow: 2,
      spacing: 0,
      roundness: 0,
      scatter: 5,
      angleDeg: 725,
      pressureSize: 3,
      pressureOpacity: -2,
      pressureFlow: 2,
      smoothing: 4,
      tipShape: 'square',
    })).toMatchObject({
      size: 512,
      opacity: 1,
      hardness: 0,
      flow: 1,
      spacing: 0.02,
      roundness: 0.05,
      scatter: 2,
      angleDeg: 5,
      pressureSize: 1,
      pressureOpacity: 0,
      pressureFlow: 1,
      smoothing: 1,
      tipShape: 'square',
    });
  });

  it('resolves pressure-sensitive size, opacity, flow, and spacing without mutating defaults', () => {
    const dynamics = resolveBrushDynamics({
      ...DEFAULT_BRUSH_SETTINGS,
      size: 40,
      opacity: 0.8,
      flow: 0.5,
      spacing: 0.25,
      pressureSize: 1,
      pressureOpacity: 0.5,
      pressureFlow: 1,
    }, 0.25);

    expect(dynamics.size).toBe(10);
    expect(dynamics.opacity).toBe(0.5);
    expect(dynamics.flow).toBe(0.125);
    expect(dynamics.spacingPx).toBe(2.5);
    expect(DEFAULT_BRUSH_SETTINGS.size).toBe(12);
  });

  it('builds deterministic spaced dabs with scatter and tip rotation', () => {
    const dabs = buildBrushDabs(
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      {
        ...DEFAULT_BRUSH_SETTINGS,
        size: 20,
        spacing: 0.25,
        scatter: 0.5,
        angleDeg: 30,
        roundness: 0.6,
      },
      1,
      { seed: 7 },
    );

    expect(dabs.length).toBe(21);
    expect(dabs[0]).toMatchObject({
      size: 20,
      opacity: 1,
      flow: 1,
      angleDeg: 30,
      roundness: 0.6,
    });
    expect(dabs[0].y).not.toBe(0);
    expect(buildBrushDabs(
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { ...DEFAULT_BRUSH_SETTINGS, size: 20, spacing: 0.25, scatter: 0.5 },
      1,
      { seed: 7 },
    ).map((dab) => [dab.x, dab.y])).toEqual(dabs.map((dab) => [dab.x, dab.y]));
  });

  it('smooths pointer input according to the brush smoothing value', () => {
    expect(smoothBrushPoint({ x: 0, y: 0 }, { x: 100, y: 0 }, 0)).toEqual({ x: 100, y: 0 });
    expect(smoothBrushPoint({ x: 0, y: 0 }, { x: 100, y: 0 }, 1)).toEqual({ x: 15, y: 0 });
    expect(smoothBrushPoint({ x: 0, y: 0 }, { x: 100, y: 0 }, 0.5)).toEqual({ x: 57.5, y: 0 });
  });
});
