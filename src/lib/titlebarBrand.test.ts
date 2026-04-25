import { describe, expect, it } from 'vitest';
import {
  TITLEBAR_LOGO_ALT,
  TITLEBAR_LOGO_CONTAINER_CLASS,
  TITLEBAR_LOGO_IMAGE_CLASS,
} from './titlebarBrand';

describe('titlebar brand asset', () => {
  it('uses a cropped Signal Loom mark without increasing the titlebar height', () => {
    expect(TITLEBAR_LOGO_ALT).toBe('Signal Loom');
    expect(TITLEBAR_LOGO_CONTAINER_CLASS).toContain('h-10');
    expect(TITLEBAR_LOGO_CONTAINER_CLASS).not.toContain('h-12');
    expect(TITLEBAR_LOGO_IMAGE_CLASS).toContain('object-contain');
  });
});
