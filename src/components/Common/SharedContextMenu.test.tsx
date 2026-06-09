import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SharedContextMenu } from './SharedContextMenu';

describe('SharedContextMenu', () => {
  it('renders submenu groups without flattening large menus into one column', () => {
    const html = renderToStaticMarkup(
      <SharedContextMenu
        items={[
          {
            id: 'flow-control',
            label: 'Flow Control',
            children: [
              { id: 'loop', label: 'Loop', action: () => undefined },
              { id: 'break', label: 'Stop When', action: () => undefined },
            ],
          },
        ]}
        x={10}
        y={10}
      />,
    );

    expect(html).toContain('Flow Control');
    expect(html).toContain('Stop When');
    expect(html).toContain('data-context-submenu="true"');
    expect(html).toContain('overflow-y-auto');
  });
});
