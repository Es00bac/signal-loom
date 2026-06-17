import { describe, expect, it } from 'vitest';
import { EYEDROPPER_MODIFIER_TOOLS, shouldUseEyedropperOverride } from './dispatcher';

const noMods = { shift: false, alt: false, ctrl: false, meta: false };

describe('shouldUseEyedropperOverride', () => {
  it('treats Ctrl over a paint tool as the eyedropper', () => {
    expect(shouldUseEyedropperOverride('brush', { ...noMods, ctrl: true })).toBe(true);
    expect(shouldUseEyedropperOverride('paintBucket', { ...noMods, ctrl: true })).toBe(true);
    expect(shouldUseEyedropperOverride('gradientTool', { ...noMods, ctrl: true })).toBe(true);
  });

  it('does not trigger without Ctrl, or on non-paint tools', () => {
    expect(shouldUseEyedropperOverride('brush', noMods)).toBe(false);
    expect(shouldUseEyedropperOverride('hand', { ...noMods, ctrl: true })).toBe(false);
    expect(shouldUseEyedropperOverride('marquee', { ...noMods, ctrl: true })).toBe(false);
    expect(shouldUseEyedropperOverride('eyedropper', { ...noMods, ctrl: true })).toBe(false);
  });

  it('keeps the modifier tool set focused on colour-using paint tools', () => {
    expect(EYEDROPPER_MODIFIER_TOOLS.has('brush')).toBe(true);
    expect(EYEDROPPER_MODIFIER_TOOLS.has('crop')).toBe(false);
    expect(EYEDROPPER_MODIFIER_TOOLS.has('move')).toBe(false);
  });
});
