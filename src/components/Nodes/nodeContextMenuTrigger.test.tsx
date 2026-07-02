// @vitest-environment jsdom
import { ReactFlowProvider } from '@xyflow/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BaseNode } from './BaseNode';
import {
  detectCoarsePointer,
  dispatchNodeContextMenu,
  getNodeContextMenuAnchor,
} from './nodeContextMenuTrigger';

describe('dispatchNodeContextMenu', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('re-dispatches a bubbling contextmenu event an ancestor (React Flow) can catch', () => {
    const wrapper = document.createElement('div');
    const node = document.createElement('div');
    wrapper.appendChild(node);
    document.body.appendChild(wrapper);

    const received: MouseEvent[] = [];
    // Stand-in for React Flow's onNodeContextMenu listener on the .react-flow__node wrapper.
    wrapper.addEventListener('contextmenu', (event) => received.push(event as MouseEvent));

    const dispatched = dispatchNodeContextMenu(node, 128, 240);

    expect(dispatched).toBe(true);
    expect(received).toHaveLength(1);
    expect(received[0].type).toBe('contextmenu');
    expect(received[0].clientX).toBe(128);
    expect(received[0].clientY).toBe(240);
    expect(received[0].bubbles).toBe(true);
  });

  it('is a no-op when the target element is missing', () => {
    expect(dispatchNodeContextMenu(null, 0, 0)).toBe(false);
  });
});

describe('getNodeContextMenuAnchor', () => {
  it('anchors under the bottom-left of the button', () => {
    expect(getNodeContextMenuAnchor({ left: 42, bottom: 90 })).toEqual({ clientX: 42, clientY: 90 });
  });
});

describe('detectCoarsePointer', () => {
  it('reports touch when maxTouchPoints is present', () => {
    const win = { navigator: { maxTouchPoints: 5 } } as unknown as Window;
    expect(detectCoarsePointer(win)).toBe(true);
  });

  it('falls back to a coarse-pointer media query', () => {
    const win = {
      navigator: { maxTouchPoints: 0 },
      matchMedia: vi.fn(() => ({ matches: true })),
    } as unknown as Window;
    expect(detectCoarsePointer(win)).toBe(true);
  });

  it('returns false for a fine-pointer desktop', () => {
    const win = {
      navigator: { maxTouchPoints: 0 },
      matchMedia: () => ({ matches: false }),
    } as unknown as Window;
    expect(detectCoarsePointer(win)).toBe(false);
  });
});

describe('BaseNode more-actions button', () => {
  it('renders a visible node-actions button when the node has an id', () => {
    const html = renderToStaticMarkup(
      <ReactFlowProvider>
        <BaseNode nodeId="node-1" nodeType="loopNode" icon={() => null} title="Simple Loop">
          <div>content</div>
        </BaseNode>
      </ReactFlowProvider>,
    );

    expect(html).toContain('aria-label="Node actions"');
  });
});
