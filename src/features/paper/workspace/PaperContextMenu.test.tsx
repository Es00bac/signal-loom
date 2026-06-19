import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PaperContextMenu } from './PaperWorkspace';

const noop = () => {};

describe('PaperContextMenu', () => {
  it('renders with a viewport-bounded max height so every item remains reachable near screen edges', () => {
    const html = renderToStaticMarkup(
      <PaperContextMenu
        context={{ x: 900, y: 740, pageId: 'page-1', point: { xMm: 10, yMm: 10 } }}
        hasStyleClipboard={false}
        onAddComicSfx={noop}
        onApplyFrameAction={noop}
        onApplyPageAction={noop}
        onChainSelectedBubbles={noop}
        onClose={noop}
        onCopyFrameStyle={noop}
        onEditComicSfxFrame={noop}
        onOpenImageFrame={noop}
        onPasteFrameStyle={noop}
        onPlaceSourceInFrame={noop}
        onQuickEditImageFrame={noop}
        onSendFrameSourceToFlow={noop}
        onSendFrameSourceToVideo={noop}
        onUnchainSelectedBubbles={noop}
        onThreadSelectedFrames={noop}
        onUnthreadSelectedFrames={noop}
        onAlignSelectedFrames={noop}
        onDistributeSelectedFrames={noop}
        onUpscaleFrameForPrint={noop}
        selectedBubbleCount={0}
        selectedTextFrameCount={0}
        selectedFrameCount={0}
        sourceItems={[]}
      />,
    );

    expect(html).toContain('data-paper-context-menu="true"');
    expect(html).toContain('max-height:744px');
    expect(html).not.toContain('max-h-[72vh]');
  });
});
