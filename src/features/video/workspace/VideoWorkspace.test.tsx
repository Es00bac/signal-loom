import { createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProgramStageClip } from '../../../components/Editor/ManualEditorWorkspaceUtils';
import { getVideoCanvasDimensions } from '../../../lib/videoCanvas';
import { createEditorVisualClip } from '../../../lib/manualEditorState';
import { buildVideoParityDiagnostics, buildVideoSequenceSummary } from '../../../lib/videoPremiereParity';
import type { VideoExportReadinessSummary } from '../../../lib/videoExportReadiness';
import type { VideoRenderBackendSummary } from '../../../lib/videoRenderBackendStatus';
import type { AspectRatio, VideoResolution } from '../../../types/flow';
import { ProgramMonitorPanel, SourceItemCard } from './VideoWorkspace';
import type { SourceBinItem } from '../../../lib/sourceBin';

function renderProgramMonitor({
  aspectRatio = '16:9',
  videoResolution = '1080p',
  canvas = getVideoCanvasDimensions(aspectRatio, videoResolution),
  exportReadiness = {
    tone: 'ready',
    label: 'Ready',
    detail: 'Video export sources are available.',
    issueCount: 0,
  },
  renderBackendStatus = {
    tone: 'gpu',
    label: 'Auto GPU-first',
    detail: 'Auto prefers AMD VAAPI GPU, then native CPU, then browser FFmpeg.',
  },
  incrementalRenderSummary,
  renderCacheDetailLines,
  previewUrl,
  stageClips = [],
  stageMode = 'stage',
  selectedClip = stageClips[0]?.clip,
}: {
  aspectRatio?: AspectRatio;
  videoResolution?: VideoResolution;
  canvas?: { width: number; height: number };
  exportReadiness?: VideoExportReadinessSummary;
  renderBackendStatus?: VideoRenderBackendSummary;
  incrementalRenderSummary?: string;
  renderCacheDetailLines?: string[];
  previewUrl?: string;
  stageMode?: 'stage' | 'rendered';
  selectedClip?: ProgramStageClip['clip'];
  stageClips?: ProgramStageClip[];
} = {}): string {
  const visualClips = stageClips.map((stageClip) => stageClip.clip);
  const durationSeconds = Math.max(0, ...stageClips.map((stageClip) => stageClip.durationSeconds));

  return renderToStaticMarkup(
    <ProgramMonitorPanel
      activeTool="select"
      aspectRatio={aspectRatio}
      audioClipCount={0}
      canvas={canvas}
      errorMessage={undefined}
      exportPresetPlan={{ presetId: 'review-h264-1080p' }}
      exportReadiness={exportReadiness}
      frameRate={30}
      hasCaptionCues={false}
      incrementalRenderSummary={incrementalRenderSummary}
      isRunning={false}
      monitorParityNotices={[]}
      onAddEditorAsset={vi.fn()}
      onAspectRatioChange={vi.fn()}
      onExportCaptions={vi.fn()}
      onExportPresetPlanChange={vi.fn()}
      onFrameRateChange={vi.fn()}
      onOpenClipContextMenu={vi.fn()}
      onOpenContextMenu={vi.fn()}
      onResolutionChange={vi.fn()}
      onRun={vi.fn()}
      onSelectClip={vi.fn()}
      onSelectStageObject={vi.fn()}
      onSetMonitorMode={vi.fn()}
      onUpdateClip={vi.fn()}
      onUpdateStageObject={vi.fn()}
      parityDiagnostics={buildVideoParityDiagnostics({ visualClips, stageObjects: [] })}
      previewOutputMetadata={undefined}
      previewUrl={previewUrl}
      renderBackendStatus={renderBackendStatus}
      renderCacheDetailLines={renderCacheDetailLines}
      renderStatusMessage={undefined}
      selectedClip={selectedClip}
      selectedStageObject={undefined}
      sequenceSummary={buildVideoSequenceSummary(aspectRatio, videoResolution, canvas, durationSeconds, 30)}
      stageClips={stageClips}
      stageMode={stageMode}
      stageObjects={[]}
      videoRef={createRef<HTMLVideoElement>()}
      videoResolution={videoResolution}
      visualClipCount={visualClips.length}
    />,
  );
}

function makeImageStageClip(clip: ProgramStageClip['clip'], sourceWidth = 1280, sourceHeight = 720): ProgramStageClip {
  return {
    clip,
    durationSeconds: clip.durationSeconds ?? 4,
    localTimeSeconds: 0,
    sourceHeight,
    sourceWidth,
    item: {
      id: clip.sourceNodeId,
      nodeId: clip.sourceNodeId,
      kind: 'image',
      label: 'Program source',
      assetUrl: 'data:image/png;base64,stub',
      createdAt: 1,
    },
  };
}

describe('ProgramMonitorPanel', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps the edit stage and Program Tools primary instead of embedding full secondary panels', () => {
    const html = renderProgramMonitor();

    expect(html).toContain('Program Tools');
    expect(html).toContain('data-program-stage-shell');
    expect(html).toContain('data-video-render-button="true"');
    expect(html).toContain('data-video-rendered-preview-tab="true"');
    expect(html).not.toContain('Sequence Settings');
    expect(html).not.toContain('Export Preset');
  });

  it('marks rendered video previews with a stable smoke selector', () => {
    const html = renderProgramMonitor({
      previewUrl: 'blob:native-video-render-smoke',
      stageMode: 'rendered',
    });

    expect(html).toContain('data-video-rendered-preview="true"');
    expect(html).toContain('blob:native-video-render-smoke');
  });

  it('renders clip stroke, opacity, filters, and incremental render cache summary in the program monitor', () => {
    const clip = createEditorVisualClip('source-1', 'image', {
      id: 'visual-stroked',
      durationSeconds: 4,
      fitMode: 'contain',
      opacityPercent: 65,
      scalePercent: 50,
      filterStack: [
        { id: 'contrast', kind: 'contrast', amount: 20, enabled: true },
      ],
      stroke: {
        enabled: true,
        color: '#ff00cc',
        widthPx: 8,
        opacityPercent: 80,
      },
    });
    const html = renderProgramMonitor({
      incrementalRenderSummary: 'Incremental render plan: 1/3 timeline spans changed.',
      stageClips: [makeImageStageClip(clip)],
    });

    expect(html).toContain('Render cache');
    expect(html).toContain('Incremental render plan: 1/3 timeline spans changed.');
    expect(html).toContain('opacity:0.65');
    expect(html).toContain('filter:contrast(1.2)');
    expect(html).toContain('box-shadow:inset 0 0 0');
    expect(html).toContain('rgba(255, 0, 204, 0.800)');
  });

  it('renders export readiness and legacy analysis-only cache status in the program monitor', () => {
    const html = renderProgramMonitor({
      exportReadiness: {
        tone: 'info',
        label: 'Analysis only',
        detail: 'Dirty spans are analysis-only until cached segment artifacts exist.',
        issueCount: 1,
      },
      incrementalRenderSummary: 'Incremental render plan: 1/3 timeline spans changed.',
    });

    expect(html).toContain('data-video-export-readiness="true"');
    expect(html).toContain('data-video-export-readiness-tone="info"');
    expect(html).toContain('Export');
    expect(html).toContain('Analysis only');
    expect(html).toContain('until cached segment artifacts exist');
  });

  it('renders inspectable render-cache assembly details in the program monitor', () => {
    const html = renderProgramMonitor({
      incrementalRenderSummary: 'Segment artifact reuse: 1 reusable cached span, 1 queued dirty span.',
      renderCacheDetailLines: [
        'Reuse 0.0s-1.0s from cached segment (1 clip).',
        'Extract 1.0s-2.5s from the new full render because timeline span changed (2 clips).',
        'Native segment assembly fallback: used the full rendered output because Cached segment 0-1000 must be a materialized data URL for native assembly.',
      ],
    });

    expect(html).toContain('data-video-render-cache-details="true"');
    expect(html).toContain('Reuse 0.0s-1.0s from cached segment (1 clip).');
    expect(html).toContain('Extract 1.0s-2.5s from the new full render because timeline span changed (2 clips).');
    expect(html).toContain('Native segment assembly fallback: used the full rendered output because Cached segment 0-1000 must be a materialized data URL for native assembly.');
  });

  it('renders the configured render backend in the program monitor', () => {
    const html = renderProgramMonitor({
      renderBackendStatus: {
        tone: 'gpu',
        label: 'AMD VAAPI',
        detail: 'Forced AMD VAAPI GPU encode through the local native render service.',
      },
    });

    expect(html).toContain('data-video-render-backend="true"');
    expect(html).toContain('data-video-render-backend-tone="gpu"');
    expect(html).toContain('Backend');
    expect(html).toContain('AMD VAAPI');
    expect(html).toContain('Forced AMD VAAPI GPU encode');
  });

  it('disables rendering when export readiness reports missing media', () => {
    const html = renderProgramMonitor({
      exportReadiness: {
        tone: 'error',
        label: 'Missing media',
        detail: '1 missing timeline source must be restored before export is reliable.',
        issueCount: 1,
      },
    });

    const renderButton = html.match(/<button[^>]*data-video-render-button="true"[^>]*>/)?.[0];

    expect(renderButton).toBeDefined();
    expect(renderButton).toContain('disabled=""');
    expect(renderButton).toContain('title="1 missing timeline source must be restored before export is reliable."');
  });

  it('renders vertical program monitor clip geometry from the active canvas dimensions', () => {
    const canvas = getVideoCanvasDimensions('9:16', '1080p');
    const clip = createEditorVisualClip('source-vertical', 'image', {
      id: 'visual-vertical',
      durationSeconds: 4,
      fitMode: 'contain',
      scalePercent: 100,
    });

    const html = renderProgramMonitor({
      aspectRatio: '9:16',
      canvas,
      stageClips: [makeImageStageClip(clip, 1920, 1080)],
    });

    expect(html).toContain('width:1080px');
    expect(html).toContain('height:607.5px');
    expect(html).toContain('left:0px');
    expect(html).toContain('top:656.25px');
  });

  it('renders chroma key clips as keyed Program Monitor previews while preserving styling', () => {
    const clip = createEditorVisualClip('source-chroma', 'image', {
      id: 'visual-chroma',
      durationSeconds: 4,
      fitMode: 'contain',
      opacityPercent: 75,
      filterStack: [
        { id: 'brightness', kind: 'brightness', amount: 15, enabled: true },
      ],
      chromaKey: {
        enabled: true,
        color: '#00ff00',
        similarityPercent: 22,
        blendPercent: 7,
      },
      stroke: {
        enabled: true,
        color: '#22d3ee',
        widthPx: 6,
        opacityPercent: 90,
      },
    });
    const html = renderProgramMonitor({
      stageClips: [makeImageStageClip(clip)],
    });

    expect(html).toContain('data-chroma-key-preview="true"');
    expect(html).toContain('Chroma keyed preview for Program source');
    expect(html).not.toContain('Chroma key preview is export-only');
    expect(html).not.toContain('Program Monitor shows the unkeyed source');
    expect(html).not.toContain('data-chroma-key-export-notice="true"');
    expect(html).toContain('opacity:0.75');
    expect(html).toContain('filter:brightness(1.15)');
    expect(html).toContain('box-shadow:inset 0 0 0');
    expect(html).toContain('rgba(34, 211, 238, 0.900)');
  });
});

function renderSourceItemCard(item: SourceBinItem): string {
  return renderToStaticMarkup(
    <SourceItemCard
      durationSeconds={undefined}
      isSelected={false}
      item={item}
      onAddAudio={vi.fn()}
      onAddVisual={vi.fn()}
      onOpenPreview={vi.fn()}
      onRemove={vi.fn()}
      onSelect={vi.fn()}
      onToggleCollapsed={vi.fn()}
      onToggleStarred={vi.fn()}
    />,
  );
}

describe('SourceItemCard', () => {
  it('surfaces Page N import envelope labels for Paper-dropped source assets in Video', () => {
    const html = renderSourceItemCard({
      id: 'paper-import-item-1',
      nodeId: 'paper-import-item-1',
      label: 'native-paper-os-drop.png',
      kind: 'image',
      mimeType: 'image/png',
      assetUrl: 'data:image/png;base64,stub',
      createdAt: 1,
      envelopeId: 'paper-page-imports:paper-1:page-2',
      envelopeLabel: 'Page 2 imports',
      envelopeIndex: 0,
    });

    expect(html).toContain('native-paper-os-drop.png');
    expect(html).toContain('Page 2 imports');
  });
});
