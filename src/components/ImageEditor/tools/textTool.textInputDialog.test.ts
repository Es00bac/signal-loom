import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('image editor text tool dialog wiring', () => {
  it('uses the themed async text-input dialog instead of browser prompt', () => {
    const source = readFileSync(new URL('./textTool.ts', import.meta.url), 'utf8');

    expect(source).not.toContain('window.prompt');
    expect(source).toContain('useTextInputDialogStore');
    expect(source).toContain('Add Image Text');
    expect(source).toContain('Place Text');
  });
});
