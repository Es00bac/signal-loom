import { createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProgramStageClip } from '../../../components/Editor/ManualEditorWorkspaceUtils';
import { getVideoCanvasDimensions } from '../../../lib/videoCanvas';
import { createEditorVisualClip } from '../../../lib/manualEditorState';
import { createEditorAsset } from '../../../lib/editorAssets';
import { buildVideoParityDiagnostics, buildVideoSequenceSummary } from '../../../lib/videoPremiereParity';
import type { VideoExportReadinessSummary } from '../../../lib/videoExportReadiness';
import type { VideoRenderBackendSummary } from '../../../lib/videoRenderBackendStatus';
import type { AspectRatio, VideoResolution } from '../../../types/flow';
import { ProgramMonitorPanel, SourceItemCard, TrackAddControl, buildTrackMenuOptions, buildVisualClipFromEditorAsset, resolveClipFitState } from './VideoWorkspace';
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
  previewOutputMetadata,
  errorMessage,
  isRunning = false,
  renderStatusMessage,
  stageClips = [],
  stageMode = 'stage',
  selectedClip = stageClips[0]?.clip,
  hasActiveComposition = true,
  onCreateStarterSequence,
  onRevealSourceBin,
  initialSidebarTab,
}: {
  aspectRatio?: AspectRatio;
  videoResolution?: VideoResolution;
  canvas?: { width: number; height: number };
  exportReadiness?: VideoExportReadinessSummary;
  renderBackendStatus?: VideoRenderBackendSummary;
  incrementalRenderSummary?: string;
  renderCacheDetailLines?: string[];
  previewUrl?: string;
  previewOutputMetadata?: Record<string, unknown>;
  errorMessage?: string;
  isRunning?: boolean;
  renderStatusMessage?: string;
  stageMode?: 'stage' | 'rendered';
  selectedClip?: ProgramStageClip['clip'];
  stageClips?: ProgramStageClip[];
  hasActiveComposition?: boolean;
  onCreateStarterSequence?: () => void;
  onRevealSourceBin?: () => void;
  initialSidebarTab?: 'tools' | 'info' | 'output';
} = {}): string {
  const visualClips = stageClips.map((stageClip) => stageClip.clip);
  const durationSeconds = Math.max(0, ...stageClips.map((stageClip) => stageClip.durationSeconds));

  return renderToStaticMarkup(
    <ProgramMonitorPanel
      activeTool="select"
      aspectRatio={aspectRatio}
      audioClipCount={0}
      canvas={canvas}
      errorMessage={errorMessage}
      exportPresetPlan={{ presetId: 'review-h264-1080p' }}
      exportReadiness={exportReadiness}
      frameRate={30}
      hasActiveComposition={hasActiveComposition}
      hasCaptionCues={false}
      initialSidebarTab={initialSidebarTab}
      onCreateStarterSequence={onCreateStarterSequence}
      onRevealSourceBin={onRevealSourceBin}
      incrementalRenderSummary={incrementalRenderSummary}
      isRunning={isRunning}
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
      previewOutputMetadata={previewOutputMetadata}
      previewUrl={previewUrl}
      renderBackendStatus={renderBackendStatus}
      renderCacheDetailLines={renderCacheDetailLines}
      renderStatusMessage={renderStatusMessage}
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
    expect(html).toContain('data-video-rendered-preview-state="ready"');
    expect(html).toContain('blob:native-video-render-smoke');
  });

  it('surfaces an explicit idle rendered-preview descriptor before any render starts', () => {
    const html = renderProgramMonitor({
      stageMode: 'rendered',
    });

    expect(html).toContain('data-video-render-preview-status="idle"');
    expect(html).toContain('Ready to render');
    expect(html).toContain('Run Render to build a playable Program Monitor preview for this composition.');
  });

  it('shows an explicit waiting state when rendered preview mode is active before a preview asset exists', () => {
    const html = renderProgramMonitor({
      stageMode: 'rendered',
      isRunning: true,
      renderStatusMessage: 'Rendering editor sequence locally…',
    });

    expect(html).toContain('data-video-render-preview-status="rendering"');
    expect(html).toContain('data-video-rendered-preview-state="waiting"');
    expect(html).toContain('Rendering preview');
    expect(html).toContain('Rendering editor sequence locally…');
    expect(html).not.toContain('data-program-stage-shell');
  });

  it('surfaces a completed rendered-preview descriptor with output metadata for playable video renders', () => {
    const html = renderProgramMonitor({
      previewUrl: 'blob:native-video-render-smoke',
      previewOutputMetadata: {
        fileName: 'signal-loom-program.mp4',
        mimeType: 'video/mp4',
        frameCount: 180,
        durationSeconds: 6,
      },
      stageMode: 'rendered',
    });

    expect(html).toContain('data-video-render-preview-status="completed"');
    expect(html).toContain('Preview ready');
    expect(html).toContain('signal-loom-program.mp4');
    expect(html).toContain('video/mp4');
    expect(html).toContain('180 frames');
  });

  it('shows an explicit error state when rendered preview mode has no playable preview', () => {
    const html = renderProgramMonitor({
      stageMode: 'rendered',
      errorMessage: 'Render failed because ffmpeg could not open one source clip.',
    });

    expect(html).toContain('data-video-render-preview-status="failed"');
    expect(html).toContain('data-video-rendered-preview-state="error"');
    expect(html).toContain('Rendered preview unavailable');
    expect(html).toContain('Render failed because ffmpeg could not open one source clip.');
    expect(html).not.toContain('data-program-stage-shell');
  });

  it('surfaces a no-playable-output reason when the render completes without a browser-previewable video', () => {
    const html = renderProgramMonitor({
      previewOutputMetadata: {
        fileName: 'signal-loom-program.mov',
        mimeType: 'video/quicktime',
      },
      renderStatusMessage: 'Render completed to a native-only QuickTime output.',
      stageMode: 'rendered',
    });

    expect(html).toContain('data-video-render-preview-status="unsupported"');
    expect(html).toContain('Preview unavailable');
    expect(html).toContain('Render completed to a native-only QuickTime output.');
    expect(html).toContain('browser preview may be unsupported');
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
      initialSidebarTab: 'info',
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
      initialSidebarTab: 'info',
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
      initialSidebarTab: 'info',
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
      initialSidebarTab: 'info',
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

  it('renders a plain image clip with a wall-clock <img>, not a canvas', () => {
    const clip = createEditorVisualClip('source-1', 'image', {
      id: 'visual-plain',
      durationSeconds: 4,
    });
    const html = renderProgramMonitor({
      stageClips: [makeImageStageClip(clip)],
    });

    expect(html).toContain('<img');
    expect(html).not.toContain('<canvas');
  });

  it('renders a GIF image clip (detected via mimeType) with a canvas instead of a wall-clock <img>', () => {
    const clip = createEditorVisualClip('source-gif', 'image', {
      id: 'visual-gif',
      durationSeconds: 4,
    });
    const stageClip = makeImageStageClip(clip);
    const html = renderProgramMonitor({
      stageClips: [{
        ...stageClip,
        item: { ...stageClip.item!, mimeType: 'image/gif' },
      }],
    });

    expect(html).toContain('<canvas');
    expect(html).not.toContain('<img');
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

  it('shows the primary "+Add" affordance instead of cryptic V1-V4 clip buttons (F05)', () => {
    const html = renderSourceItemCard({
      id: 'image-item-1',
      nodeId: 'image-item-1',
      label: 'hero-frame.png',
      kind: 'image',
      mimeType: 'image/png',
      assetUrl: 'data:image/png;base64,stub',
      createdAt: 1,
    });

    // Primary add + labelled track menu.
    expect(html).toContain('Add Video');
    expect(html).toContain('aria-label="Choose Video track"');
    expect(html).toContain('Video 4');
    // The bare "V1" cryptic buttons are gone (the visible label is now "Video 1").
    expect(html).not.toContain('>V1<');
  });
});

describe('ProgramMonitorPanel empty state (F10)', () => {
  it('offers actionable starter templates and a Source Library shortcut when no composition exists', () => {
    const html = renderProgramMonitor({
      hasActiveComposition: false,
      onCreateStarterSequence: vi.fn(),
      onRevealSourceBin: vi.fn(),
    });

    expect(html).toContain('Create 1080p sequence');
    expect(html).toContain('Add media from the Source Library');
  });
});

describe('resolveClipFitState (F09 shared fit state)', () => {
  it('reads fit mode from the single clip source of truth regardless of playhead progress', () => {
    const clip = createEditorVisualClip('node-1', 'image', { fitMode: 'cover', scalePercent: 140 });

    // The Program Tools panel and the Inspector call this helper at different playhead
    // progress values — the fit mode must stay identical (one source of truth).
    const programToolsView = resolveClipFitState(clip, 0);
    const inspectorView = resolveClipFitState(clip, 75);

    expect(programToolsView.fitMode).toBe('cover');
    expect(inspectorView.fitMode).toBe('cover');
    expect(programToolsView.fitMode).toBe(inspectorView.fitMode);
    // It still carries the keyframe-derived transform fields both surfaces rely on.
    expect(programToolsView).toHaveProperty('scalePercent');
    expect(programToolsView).toHaveProperty('opacityPercent');
    expect(programToolsView).toHaveProperty('rotationDeg');
  });
});

describe('buildTrackMenuOptions (F05)', () => {
  it('produces labelled options for each track', () => {
    expect(buildTrackMenuOptions(4, 'Video')).toEqual([
      { trackIndex: 0, label: 'Video 1' },
      { trackIndex: 1, label: 'Video 2' },
      { trackIndex: 2, label: 'Video 3' },
      { trackIndex: 3, label: 'Video 4' },
    ]);
    expect(buildTrackMenuOptions(0, 'Audio')).toEqual([]);
  });
});

describe('TrackAddControl (F05)', () => {
  const StubIcon = () => null;

  it('renders a primary Add button plus a labelled track menu', () => {
    const html = renderToStaticMarkup(
      <TrackAddControl icon={StubIcon} noun="Video" onAdd={vi.fn()} trackCount={4} />,
    );

    expect(html).toContain('Add Video');
    expect(html).toContain('title="Add to Video 1"');
    expect(html).toContain('aria-label="Choose Video track"');
    expect(html).toContain('Video 1');
    expect(html).toContain('Video 4');
  });

  it('omits the track menu when there is a single track', () => {
    const html = renderToStaticMarkup(
      <TrackAddControl icon={StubIcon} noun="Audio" onAdd={vi.fn()} trackCount={1} />,
    );

    expect(html).toContain('Add Audio');
    expect(html).not.toContain('aria-label="Choose Audio track"');
  });
});
function makeTextStageClip(clip: ProgramStageClip['clip'], asset?: ProgramStageClip['asset']): ProgramStageClip {
  return {
    clip,
    durationSeconds: clip.durationSeconds ?? 4,
    localTimeSeconds: 0,
    sourceWidth: 1280,
    sourceHeight: 720,
    asset,
  };
}

describe('ProgramMonitorPanel text preview', () => {
  it('quotes multi-word bundled families in the straight text preview (FBL-012)', () => {
    const clip = createEditorVisualClip('asset-1', 'text', {
      textFontFamily: 'M PLUS 1, sans-serif',
      textSizePx: 96,
      textTypography: { fontWeight: 700, fontStyle: 'italic' },
    });
    const html = renderProgramMonitor({
      stageClips: [makeTextStageClip(clip)],
    });

    expect(html).toContain('font-family:&quot;M PLUS 1&quot;, sans-serif');
    expect(html).toContain('font-weight:700');
    expect(html).toContain('font-style:italic');
  });
});

describe('buildVisualClipFromEditorAsset', () => {
  it('carries family/weight/style from a text asset into the clip typography (AUD-026)', () => {
    const asset = createEditorAsset('text', { label: 'Title' });
    asset.textDefaults = {
      ...asset.textDefaults!,
      fontFamily: 'M PLUS 1, sans-serif',
      fontWeight: 700,
      fontStyle: 'italic',
    };

    const clip = buildVisualClipFromEditorAsset(asset, { trackIndex: 1, startMs: 250 });

    expect(clip.sourceKind).toBe('text');
    expect(clip.textFontFamily).toBe('M PLUS 1, sans-serif');
    expect(clip.textTypography).toEqual({ fontWeight: 700, fontStyle: 'italic' });
    expect(clip.trackIndex).toBe(1);
    expect(clip.startMs).toBe(250);
  });

  it('survives normalization and save/load boundaries intact', () => {
    const asset = createEditorAsset('text', { label: 'Title' });
    asset.textDefaults = {
      ...asset.textDefaults!,
      fontFamily: 'Source Sans 3, sans-serif',
      fontWeight: 600,
      fontStyle: 'italic',
    };

    const clip = buildVisualClipFromEditorAsset(asset, { trackIndex: 0, startMs: 0 });
    const normalized = createEditorVisualClip(clip.sourceNodeId, clip.sourceKind, clip);

    expect(normalized.textTypography).toEqual({ fontWeight: 600, fontStyle: 'italic' });
  });
});
