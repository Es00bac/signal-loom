import { describe, expect, it } from 'vitest';
import { IMAGE_PHOTOSHOP_PARITY_ITEMS } from './ImagePhotoshopParity';

describe('ImagePhotoshopParity puppet warp row', () => {
  it('tracks the bounded deterministic helper without claiming full Photoshop puppet warp UI parity', () => {
    expect(IMAGE_PHOTOSHOP_PARITY_ITEMS.find((item) => item.id === 'puppet-warp-advanced-warp')).toMatchObject({
      status: 'partial',
      signalLoom: expect.stringContaining('deterministic weighted pin-displacement helper'),
      parityEstimate: expect.any(Number),
    });
    expect(IMAGE_PHOTOSHOP_PARITY_ITEMS.find((item) => item.id === 'puppet-warp-advanced-warp')?.signalLoom).toContain('no mesh UI');
    expect(IMAGE_PHOTOSHOP_PARITY_ITEMS.find((item) => item.id === 'puppet-warp-advanced-warp')?.signalLoom).toContain('Perspective Warp');
    expect(IMAGE_PHOTOSHOP_PARITY_ITEMS.find((item) => item.id === 'puppet-warp-advanced-warp')?.signalLoom).toContain('deterministic add/move/remove pin mutation helpers');
    expect(IMAGE_PHOTOSHOP_PARITY_ITEMS.find((item) => item.id === 'puppet-warp-advanced-warp')?.signalLoom).toContain('non-destructive');
    expect(IMAGE_PHOTOSHOP_PARITY_ITEMS.find((item) => item.id === 'puppet-warp-advanced-warp')?.parityEstimate).toBeGreaterThanOrEqual(8);
  });
});
