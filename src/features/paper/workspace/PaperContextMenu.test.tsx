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
        onFitFrameToText={noop}
        onPasteFrameStyle={noop}
        onPlaceSourceInFrame={noop}
        onQuickEditImageFrame={noop}
        onAiFixImageFrame={noop}
        onSendFrameSourceToFlow={noop}
        onSendFrameSourceToVideo={noop}
        onSendPageToSourceLibrary={noop}
        onSendAllPagesToSourceLibrary={noop}
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

  it('offers page-level Send to Source Library commands so a whole page composition can be reused as an Image/Video/Flow asset', () => {
    const html = renderToStaticMarkup(
      <PaperContextMenu
        context={{ x: 400, y: 300, pageId: 'page-1', point: { xMm: 10, yMm: 10 } }}
        hasStyleClipboard={false}
        onAddComicSfx={noop}
        onApplyFrameAction={noop}
        onApplyPageAction={noop}
        onChainSelectedBubbles={noop}
        onClose={noop}
        onCopyFrameStyle={noop}
        onEditComicSfxFrame={noop}
        onOpenImageFrame={noop}
        onFitFrameToText={noop}
        onPasteFrameStyle={noop}
        onPlaceSourceInFrame={noop}
        onQuickEditImageFrame={noop}
        onAiFixImageFrame={noop}
        onSendFrameSourceToFlow={noop}
        onSendFrameSourceToVideo={noop}
        onSendPageToSourceLibrary={noop}
        onSendAllPagesToSourceLibrary={noop}
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

    expect(html).toContain('Send This Page to Source Library');
    expect(html).toContain('Send All Pages to Source Library');
  });
});
