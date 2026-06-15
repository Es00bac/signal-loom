import { describe, expect, it } from 'vitest';
import { compositeBoxesToCanonicalAlpha } from './objectMaskDetectors';

describe('compositeBoxesToCanonicalAlpha', () => {
  it('marks the box region opaque (edit) and the rest transparent (keep)', () => {
    // 10x10 image; box covering the top-left quadrant in 0-1000 space
    const alpha = compositeBoxesToCanonicalAlpha(
      [{ label: 'cat', box: [0, 0, 500, 500] }],
      10,
      10,
    );
    expect(alpha[0 * 10 + 0]).toBe(255);  // inside box
    expect(alpha[9 * 10 + 9]).toBe(0);    // outside box
  });
  it('returns all-transparent when there are no objects', () => {
    const alpha = compositeBoxesToCanonicalAlpha([], 4, 4);
    expect(Array.from(alpha).every((v) => v === 0)).toBe(true);
  });
});
