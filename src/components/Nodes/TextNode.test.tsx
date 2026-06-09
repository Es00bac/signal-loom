import { ReactFlowProvider } from '@xyflow/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TextNode } from './TextNode';

describe('TextNode prompt editor expansion', () => {
  it('renders a larger-editor affordance for prompt-mode text input', () => {
    const html = renderToStaticMarkup(
      <ReactFlowProvider>
        <TextNode
          data={{
            mode: 'prompt',
            prompt: 'A longer prompt that needs room.',
            onChange: () => undefined,
          }}
          deletable
          dragging={false}
          draggable
          id="text-1"
          isConnectable
          positionAbsoluteX={0}
          positionAbsoluteY={0}
          selectable
          selected={false}
          type="textNode"
          zIndex={0}
        />
      </ReactFlowProvider>,
    );

    expect(html).toContain('aria-label="Open Prompt Editor"');
  });
});
