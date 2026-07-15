import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { PaperTopStrip } from './PaperWorkspace';

const noop = vi.fn();

describe('PaperTopStrip titlebar placement', () => {
  it('keeps export progress and the exact result path visible outside the Inspector', () => {
    const source = readFileSync(join(process.cwd(), 'src/features/paper/workspace/PaperWorkspace.tsx'), 'utf8');

    expect(source).toContain('function PaperExportStatusNotice');
    expect(source).toContain('data-paper-export-status="true"');
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain('notice.path');
    expect(source).toContain('nativeBridge.openPath(notice.path)');
  });

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
        onShowFindChange={noop}
        showFindChange={false}
        onToggleGrid={noop}
        onToggleGuides={noop}
        onToggleFrameEdges={noop}
        onToggleSnapToGrid={noop}
        onToggleSnapToGuides={noop}
        onToggleInspector={noop}
        onToggleRulers={noop}
        onToggleSpreads={noop}
        onToggleStartOnRight={noop}
        onToggleRtlBinding={noop}
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
        showFrameEdges={false}
        showGuides
        showInspector
        showRulers
        showSpreads
        showToolbar
        snapToGrid={false}
        snapToGuides
        startOnRight={false}
        rtlBinding={false}
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
    expect(html).toContain('min-w-max');
    expect(html).toContain('shrink-0');
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
        onShowFindChange={noop}
        showFindChange={false}
        onToggleGrid={noop}
        onToggleGuides={noop}
        onToggleFrameEdges={noop}
        onToggleSnapToGrid={noop}
        onToggleSnapToGuides={noop}
        onToggleInspector={noop}
        onToggleRulers={noop}
        onToggleSpreads={noop}
        onToggleStartOnRight={noop}
        onToggleRtlBinding={noop}
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
        showFrameEdges={false}
        showGuides
        showInspector
        showRulers
        showSpreads
        showToolbar
        snapToGrid={false}
        snapToGuides
        startOnRight={false}
        rtlBinding={false}
        zoom={1}
      />,
    );

    expect(html).toContain('data-paper-preflight-visible="true"');
  });
});
