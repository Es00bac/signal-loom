import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PaperTopStrip } from './PaperWorkspace';

const noop = vi.fn();

describe('PaperTopStrip titlebar placement', () => {
  it('renders the Paper document/export controls for the app titlebar slot', () => {
    const html = renderToStaticMarkup(
      <PaperTopStrip
        docTitle="Chronicle"
        onAddPage={noop}
        onDuplicatePage={noop}
        onExportCbz={noop}
        onExportIdml={noop}
        onExportJson={noop}
        onExportKdpAssets={noop}
        onExportPageToImage={noop}
        onExportPageToSource={noop}
        onExportPagesToEnvelope={noop}
        onExportPdf={noop}
        onExportReaderSpreadsPdf={noop}
        onExportBookletProofPdf={noop}
        onExportStoriesDocx={noop}
        onExportStoriesHtml={noop}
        onExportStoriesRtf={noop}
        onExportStoriesTxt={noop}
        onExportWebcomicImages={noop}
        onFinalizePrintUpscale={noop}
        onImportJson={noop}
        onNew={noop}
        onPackagePrint={noop}
        onShowPreflight={noop}
        showPreflight={false}
        onToggleGrid={noop}
        onToggleGuides={noop}
        onToggleSnapToGrid={noop}
        onToggleSnapToGuides={noop}
        onToggleInspector={noop}
        onToggleRulers={noop}
        onToggleSpreads={noop}
        onToggleStartOnRight={noop}
        onToggleToolbar={noop}
        onZoomIn={noop}
        onZoomOut={noop}
        placement="titlebar"
        preflightStatus={{
          tone: 'warning',
          label: '3 warnings',
          countsLabel: '3 warnings, 1 info',
          detail: 'Preflight found 3 warnings. First: No bleed configured',
        }}
        showGrid={false}
        showGuides
        showInspector
        showRulers
        showSpreads
        showToolbar
        snapToGrid={false}
        snapToGuides
        startOnRight={false}
        zoom={1.59}
      />,
    );

    expect(html).toContain('data-paper-topbar-controls="true"');
    expect(html).toContain('data-paper-topbar-placement="titlebar"');
    expect(html).toContain('Chronicle');
    expect(html).toContain('PDF');
    expect(html).toContain('KDP');
    expect(html).toContain('Web PNG');
    expect(html).toContain('data-paper-preflight-status="true"');
    expect(html).toContain('data-paper-preflight-tone="warning"');
    expect(html).toContain('3 warnings');
    expect(html).toContain('Preflight found 3 warnings');
    expect(html).toContain('Snap Guides');
    expect(html).toContain('Snap Grid');
    expect(html).toContain('overflow-x-auto');
  });

  it('marks the preflight button when the panel is visible', () => {
    const html = renderToStaticMarkup(
      <PaperTopStrip
        docTitle="Chronicle"
        onAddPage={noop}
        onDuplicatePage={noop}
        onExportCbz={noop}
        onExportIdml={noop}
        onExportJson={noop}
        onExportKdpAssets={noop}
        onExportPageToImage={noop}
        onExportPageToSource={noop}
        onExportPagesToEnvelope={noop}
        onExportPdf={noop}
        onExportReaderSpreadsPdf={noop}
        onExportBookletProofPdf={noop}
        onExportStoriesDocx={noop}
        onExportStoriesHtml={noop}
        onExportStoriesRtf={noop}
        onExportStoriesTxt={noop}
        onExportWebcomicImages={noop}
        onFinalizePrintUpscale={noop}
        onImportJson={noop}
        onNew={noop}
        onPackagePrint={noop}
        onShowPreflight={noop}
        showPreflight
        onToggleGrid={noop}
        onToggleGuides={noop}
        onToggleSnapToGrid={noop}
        onToggleSnapToGuides={noop}
        onToggleInspector={noop}
        onToggleRulers={noop}
        onToggleSpreads={noop}
        onToggleStartOnRight={noop}
        onToggleToolbar={noop}
        onZoomIn={noop}
        onZoomOut={noop}
        placement="titlebar"
        preflightStatus={{
          tone: 'ready',
          label: 'Ready',
          countsLabel: 'No issues',
          detail: 'No Paper preflight issues detected.',
        }}
        showGrid={false}
        showGuides
        showInspector
        showRulers
        showSpreads
        showToolbar
        snapToGrid={false}
        snapToGuides
        startOnRight={false}
        zoom={1}
      />,
    );

    expect(html).toContain('data-paper-preflight-visible="true"');
  });
});
