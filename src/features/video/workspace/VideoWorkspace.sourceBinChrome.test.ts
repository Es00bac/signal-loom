import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Video Source Bin chrome density', () => {
  const source = readFileSync(new URL('./VideoWorkspace.tsx', import.meta.url), 'utf8');

  it('uses compact tab/count/action rows in both dockable and fallback Video layouts', () => {
    expect(source).toContain('data-video-source-bin-compact-header="true"');
    expect(source).toContain('data-video-source-bin-compact-header="legacy"');
    expect(source).toContain('aria-label="Collapse all source items"');
    expect(source).toContain('aria-label="Expand all source items"');
    expect(source).not.toContain('Mixed media, generated assets, captions, and reusable timeline elements.');
    expect(source).not.toContain('Switch between source media and reusable editor assets for timeline compositing.');
  });
});

