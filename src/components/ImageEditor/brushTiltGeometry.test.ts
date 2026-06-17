import { describe, expect, it } from 'vitest';
import {
  resolveBrushTiltState,
  applyBrushTiltDynamics,
  computeBrushTiltPreview,
  normalizeDegrees,
  type BrushTiltDynamicsSettings,
} from './brushTiltGeometry';

const SETTINGS: BrushTiltDynamicsSettings = {
  tiltAngle: 1,
  tiltRoundness: 1,
  tiltSize: 0.5,
  rotationFollowsTwist: true,
};

describe('resolveBrushTiltState', () => {
  it('is upright with no tilt input', () => {
    const s = resolveBrushTiltState({});
    expect(s.hasTilt).toBe(false);
    expect(s.altitudeDeg).toBe(90);
    expect(s.tiltAmount).toBe(0);
    expect(s.hasTwist).toBe(false);
  });

  it('derives altitude/azimuth from tiltX/tiltY (Wacom-style)', () => {
    // Leaning purely along +X by 45°.
    const s = resolveBrushTiltState({ tiltX: 45, tiltY: 0 });
    expect(s.hasTilt).toBe(true);
    expect(s.altitudeDeg).toBeCloseTo(45, 5);
    expect(s.azimuthDeg).toBeCloseTo(0, 5);
    expect(s.tiltAmount).toBeCloseTo(0.5, 5);
  });

  it('reads azimuth direction from the tilt vector', () => {
    const down = resolveBrushTiltState({ tiltX: 0, tiltY: 60 });
    expect(down.azimuthDeg).toBeCloseTo(90, 5); // +Y is downward on screen
    const left = resolveBrushTiltState({ tiltX: -30, tiltY: 0 });
    expect(left.azimuthDeg).toBeCloseTo(180, 5);
  });

  it('prefers altitudeAngle/azimuthAngle (radians) when present', () => {
    const s = resolveBrushTiltState({ altitudeAngle: Math.PI / 4, azimuthAngle: Math.PI / 2, tiltX: 80, tiltY: 80 });
    expect(s.altitudeDeg).toBeCloseTo(45, 4);
    expect(s.azimuthDeg).toBeCloseTo(90, 4);
  });

  it('reads barrel twist', () => {
    const s = resolveBrushTiltState({ twist: 270 });
    expect(s.hasTwist).toBe(true);
    expect(s.twistDeg).toBe(270);
  });
});

describe('applyBrushTiltDynamics', () => {
  const base = { baseAngleDeg: 0, baseRoundness: 1, baseSize: 100 };

  it('passes base values through when upright', () => {
    const r = applyBrushTiltDynamics({ ...base, tilt: resolveBrushTiltState({}), settings: SETTINGS });
    expect(r.roundness).toBe(1);
    expect(r.size).toBe(100);
    expect(r.angleDeg).toBe(0);
  });

  it('flattens the tip and grows it as the pen tilts', () => {
    const flat = resolveBrushTiltState({ tiltX: 80, tiltY: 0 }); // altitude 10, tiltAmount ~0.89
    const r = applyBrushTiltDynamics({ ...base, tilt: flat, settings: SETTINGS });
    expect(r.roundness).toBeLessThan(0.3);     // squashed
    expect(r.size).toBeGreaterThan(100);       // grown
  });

  it('steers the angle toward the lean direction, scaled by tilt amount', () => {
    // A barely-tilted pen barely steers; a flat pen steers most of the way.
    const mild = applyBrushTiltDynamics({ ...base, tilt: resolveBrushTiltState({ tiltX: 0, tiltY: 45 }), settings: SETTINGS });
    expect(mild.angleDeg).toBeGreaterThan(5);
    expect(mild.angleDeg).toBeLessThan(85);
    const flat = applyBrushTiltDynamics({ ...base, tilt: resolveBrushTiltState({ tiltX: 0, tiltY: 80 }), settings: SETTINGS });
    expect(flat.angleDeg).toBeGreaterThan(mild.angleDeg);
    expect(Math.abs(flat.angleDeg - 90)).toBeLessThan(20); // azimuth 90, nearly there
  });

  it('rotates the tip with barrel twist when enabled', () => {
    const tilt = resolveBrushTiltState({ twist: 90 });
    const r = applyBrushTiltDynamics({ ...base, tilt, settings: SETTINGS });
    expect(normalizeDegrees(r.angleDeg)).toBeCloseTo(90, 4);
  });
});

describe('computeBrushTiltPreview', () => {
  it('returns a flattened, rotated footprint plus a shaft when tilted', () => {
    const tilt = resolveBrushTiltState({ tiltX: 0, tiltY: 70 });
    const p = computeBrushTiltPreview({ sizePx: 120, baseRoundness: 1, tilt, settings: SETTINGS });
    expect(p.footprint.height).toBeLessThan(p.footprint.width); // flattened ellipse
    expect(p.shaft).not.toBeNull();
    expect(p.shaft?.lengthPx).toBeGreaterThan(60);
    // shaft points opposite the lean (azimuth 90 -> shaft 270)
    expect(p.shaft ? normalizeDegrees(p.shaft.angleDeg) : null).toBeCloseTo(270, 4);
  });

  it('has no shaft when upright', () => {
    const p = computeBrushTiltPreview({ sizePx: 120, baseRoundness: 1, tilt: resolveBrushTiltState({}), settings: SETTINGS });
    expect(p.shaft).toBeNull();
    expect(p.footprint.width).toBe(120);
  });
});
