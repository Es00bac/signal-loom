import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('FlowSourceBinSidebar production dialog wiring', () => {
  it('uses the themed text-input dialog instead of browser prompts for bin naming', () => {
    const source = readFileSync(new URL('./FlowSourceBinSidebar.tsx', import.meta.url), 'utf8');

    expect(source).not.toContain('window.prompt');
    expect(source).toContain('useTextInputDialogStore');
    expect(source).toContain('requestTextInput');
    expect(source).toContain('New Source Bin');
    expect(source).toContain('Rename Source Bin');
  });

  it('uses a virtualized generated-pool list for large project source libraries', () => {
    const source = readFileSync(new URL('./FlowSourceBinSidebar.tsx', import.meta.url), 'utf8');

    expect(source).toContain('VirtualizedSourceBinList');
    expect(source).toContain('data-source-library-generated-list');
  });

  it('uses flattened virtualized rows for regular source-library bins too', () => {
    const source = readFileSync(new URL('./FlowSourceBinSidebar.tsx', import.meta.url), 'utf8');

    expect(source).toContain('buildSourceLibraryDisplayRows');
    expect(source).toContain('data-source-library-bin-list');
  });
});
