import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BottomToolbar } from './BottomToolbar';

describe('BottomToolbar topbar presentation', () => {
  it('renders the top Flow node toolbar as categorized menus instead of one long flat strip', () => {
    const html = renderToStaticMarkup(<BottomToolbar onAddNode={() => undefined} variant="topbar" />);

    expect(html).toContain('data-toolbar-variant="topbar"');
    expect(html).not.toContain('overflow-x-auto');
    expect(html).toContain('data-node-category-menu="true"');
    expect(html).toContain('Flow Control');
    expect(html).toContain('Stop When');
    expect(html).toContain('Value');
    expect(html).toContain('Color Swatch');
    expect(html).toContain('Crop Image');
  });

  it('keeps compact topbar category labels hidden until extra-wide desktops', () => {
    const html = renderToStaticMarkup(<BottomToolbar onAddNode={() => undefined} variant="topbar" />);

    expect(html).toContain('hidden 2xl:inline');
    expect(html).not.toContain('hidden xl:inline');
  });

  it('surfaces provider-specific Image node templates from the toolbar', () => {
    const html = renderToStaticMarkup(<BottomToolbar onAddNode={() => undefined} variant="topbar" />);

    expect(html).toContain('data-image-provider-menu="true"');
    expect(html).toContain('Add FLUX.2 Multi-Reference image node');
    expect(html).toContain('Add Stability Inpaint image node');
    expect(html).toContain('Add Local/Open Qwen Edit image node');
  });
});
