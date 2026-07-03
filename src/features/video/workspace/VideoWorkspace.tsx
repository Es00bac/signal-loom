import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentType, CSSProperties, ReactNode, RefObject } from 'react';
import {
  Archive,
  BookOpen,
  Film,
  Image as ImageIcon,
  MousePointer2,
  Music2,
  Play,
  Plus,
  Scissors,
  Search,
  Square,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Diamond,
  Star,
  Trash2,
  Type,
} from 'lucide-react';
import { addTimelineMarker, normalizeTimelineMarkers, removeTimelineMarker, type TimelineMarker } from '../../../lib/editorTimelineMarkers';
import { applyAudioFade, resolveCrossfadePercents } from '../../../lib/editorAudioFades';
import { drawComicStageObject, renderComicCard } from '../../../lib/mediaComposition';
import { isTrackLocked, normalizeLockedTracks, toggleLockedTrack } from '../../../lib/editorTrackLocks';
import { isTrackCollapsed, normalizeCollapsedTracks, toggleCollapsedTrack } from '../../../lib/editorTrackCollapse';
import { advanceShuttleCursor, stepShuttleRate, toggleShuttlePlay } from './timelineTransport';
import { normalizeSourceMarks, overwriteTrackRange, shiftTrackClipsForInsert } from './threePointEdit';
import { findNearestEditPoint, rippleTrimClipToTarget, rollEditPointToTarget } from './trimEdit';
import { useFlowStore } from '../../../store/flowStore';
import { useConfirmationStore } from '../../../store/confirmationStore';
import { showAlertDialog } from '../../../store/alertDialogStore';
import { useEditorStore } from '../../../store/editorStore';
import { useMobileInterfaceStore } from '../../../store/mobileInterfaceStore';
import { useMobilePhoneInterfaceDescriptor } from '../../../lib/mobilePhoneInterface';
import type { SourceBinItem } from '../../../lib/sourceBin';
import { buildDownloadFilename, downloadAsset } from '../../../lib/downloadAsset';
import {
  normalizeAutomationPoints,
} from '../../../lib/clipAutomation';
import {
  buildAudioTimelineBlocks,
  buildVisualTimelineBlocks,
  getTimelineDurationSeconds,
  resolveVisualClipDuration,
} from '../../../lib/manualEditorTimeline';
import { resolveVisualClipSourceRangeMs } from '../../../lib/editorTimelineSourceRange';
import {
  mergeTimelinePreviewResults,
  pruneTimelinePreviewMap,
  takePendingTimelinePreviewRequests,
} from '../../../lib/editorTimelinePreview';
import {
  pruneTimelineWaveformMap,
  takePendingTimelineWaveformRequests,
} from '../../../lib/editorTimelineWaveform';
import {
  addTimelineSnapPoint,
  normalizeTimelineSnapPoints,
  resolveTimelineSnapSeconds,
} from '../../../lib/editorTimelineSnap';
import {
  createEditorAudioClip,
  createEditorVisualClip,
  getEditorAudioTrackVolumes,
  getEditorAudioClips,
  getEditorVisualClips,
} from '../../../lib/manualEditorState';
import type {
  AppNode,
  AspectRatio,
  AudioProvider,
  EditorAudioClip,
  EditorAsset,
  EditorAssetKind,
  EditorClipChromaKeySettings,
  EditorClipFilter,
  EditorClipFilterKind,
  EditorStageBlendMode,
  EditorStageObject,
  EditorVisualClip,
  NodeData,
  TextClipEffect,
  TimelineAutomationPoint,
  VideoExportPresetPlanData,
  VideoExportPresetPlanId,
  VideoResolution,
} from '../../../types/flow';
import { useSourceBinStore } from '../../../store/sourceBinStore';
import { recordActivityTrailWorkspaceEvent } from '../../../store/activityTrailStore';
import { usePaperStore } from '../../../store/paperStore';
import type { ActivityTrailSource } from '../../../lib/activityTrail';
import { useShallow } from 'zustand/react/shallow';
import {
  captureFrameFromVideoElement,
  extractVideoFrameAtTime,
} from '../../../lib/videoFrameExtraction';
import { getAspectRatioValue, getVideoCanvasDimensions } from '../../../lib/videoCanvas';
import { DEFAULT_EXECUTION_CONFIG } from '../../../lib/providerCatalog';
import { EXPORT_BASENAME } from '../../../lib/brand';
import { extractWaveformPeaks } from '../../../lib/audioWaveform';
import {
  createEditorHistorySnapshot,
  createEditorHistoryState,
  pushEditorHistoryEntry,
  redoEditorHistory,
  undoEditorHistory,
} from '../../../lib/editorHistory';
import {
  buildTimelineOpacityPoint,
  isPrimaryTimelinePointerButton,
  resizeTimelineTrackHeight,
} from '../../../lib/editorTimelineInteraction';
import {
  buildEditorSourceItemLookup,
  mapLibraryItemToEditorSourceItem,
} from '../../../lib/editorSourceItems';
import {
  buildSourceBinKindCounts,
  filterSourceBinItemsForDisplay,
  getSourceBinPreviewKind,
  sortSourceBinItemsForDisplay,
  type SourceBinKindFilter,
} from '../../../lib/sourceBinLayout';
import {
  buildFlowNodePatchForSourceBinItem,
  getFlowNodeTypeForSourceBinItem,
} from '../../../lib/sourceBinFlowBridge';
import {
  buildTimelineClipFrameExportLabel,
  getTimelineClipFrameExportTimeSeconds,
} from '../../../lib/timelineClipFrameExport';
import type { TimelineClipFrameEdge } from '../../../lib/timelineClipFrameExport';
import { cropImageDataUrl } from '../../../lib/localImageEditing';
import { executeNodeRequest } from '../../../lib/flowExecution';
import { useSettingsStore } from '../../../store/settingsStore';
import { AdvancedColorPicker } from '../../../components/Common/AdvancedColorPicker';
import {
  getEditorStageObjects,
  getStageObjectBlendModes,
} from '../../../lib/editorStageObjects';
import {
  copyVisualClipProperties,
  formatVisualClipPropertyList,
  getDefaultVisualClipPropertySelection,
  pasteVisualClipProperties,
  VISUAL_CLIP_PROPERTY_OPTIONS,
} from '../../../lib/editorClipPropertyClipboard';
import type {
  VisualClipCopiedProperty,
  VisualClipPropertyClipboard,
} from '../../../lib/editorClipPropertyClipboard';
import {
  createEditorAsset,
  getEditorAssets,
  getProjectEditorAssets,
  migrateStageObjectsToEditorAssets,
} from '../../../lib/editorAssets';
import {
  buildPaperStoryboardPageDescriptors,
  buildPaperStoryboardPageSourcePayload,
  getPaperStoryboardExistingItemIds,
} from '../../../lib/paperVideoAssets';
import type { NativeMenuCommand } from '../../../lib/nativeApp';
import { useNativeMenuCommand } from '../../../shared/native/useNativeMenuCommand';
import { fillTimelineGap, findTimelineGaps } from '../../../lib/editorTimelineGaps';
import type { TimelineGap } from '../../../lib/editorTimelineGaps';
import {
  getSelectedVisualClipCutTarget,
  splitVisualClipNonDestructively,
  trimVisualClipEdge,
} from '../../../lib/editorTimelineTrim';
import type { TimelineClipEdge } from '../../../lib/editorTimelineTrim';
import {
  buildClipEffectDescriptorForClip,
  getClipBlendModes,
  getClipFilterKinds,
  normalizeClipChromaKey,
  normalizeClipCrop,
  normalizeClipStroke,
} from '../../../lib/editorClipEffects';
import {
  buildStageObjectLayoutDescriptor,
  TEXT_LINE_HEIGHT,
} from '../../../lib/editorVisualLayout';
import { SharedContextMenu } from '../../../components/Common/SharedContextMenu';
import { MediaPreviewModal } from '../../../components/Nodes/MediaPreviewModal';
import type { SharedContextMenuItem } from '../../../lib/sharedContextMenu';
import {
  getAcceptStringForKinds,
  getBrowserPreviewSupportLabel,
  inferSourceKindFromFile,
} from '../../../lib/mediaFormatRegistry';
import {
  applyVisualClipPatchAtProgress,
  audioKeyframesToVolumeAutomation,
  ensureVisualClipHasKeyframes,
  getAdjacentKeyframePercent,
  getAudioKeyframePercents,
  getVisualKeyframePercents,
  getVisualKeyframeStateAtProgress,
  normalizeAudioKeyframes,
  normalizeVisualKeyframes,
  removeAudioKeyframe,
  removeVisualKeyframe,
  updateAudioKeyframe,
  updateVisualKeyframe,
  upsertAudioKeyframe,
  upsertVisualKeyframe,
  visualKeyframesToOpacityAutomation,
} from '../../../lib/editorKeyframes';
import { applyChromaKeyToImageData } from '../../../lib/chromaKeyPreview';
import {
  analyzeVideoExportReadiness,
  type VideoExportReadinessSummary,
  type VideoExportReadinessTone,
} from '../../../lib/videoExportReadiness';
import {
  summarizeVideoRenderBackend,
  type VideoRenderBackendSummary,
  type VideoRenderBackendTone,
} from '../../../lib/videoRenderBackendStatus';

import {
  VIDEO_EXPORT_PRESET_OPTIONS,
  VIDEO_PREMIERE_PARITY_ROWS,
  buildVideoParityDiagnostics,
  buildVideoSequenceSummary,
  getHighPriorityVideoParityRows,
  getVideoExportPresetOption,
  getVideoMonitorParityNotices,
} from '../../../lib/videoPremiereParity';
import {
  captionCuesToTextClips,
  getCaptionFormatFromFileName,
  parseCaptionText,
  serializeSrtCaptions,
  serializeWebVttCaptions,
  textClipsToCaptionCues,
} from '../../../lib/videoCaptions';
import { DockableDialog, DockablePanelHost, type DockablePanelDefinition } from '../../../components/DockablePanel';
import { VideoWorkspaceMobileShell } from './VideoWorkspaceMobileShell';
import { useDockablePanelStore } from '../../../store/dockablePanelStore';
import { panelKey } from '../../../lib/dockablePanel';
import { getDockablePanelToggleMode, resolveDockablePanelMode } from '../../../lib/dockablePanelVisibility';
import {
  VIDEO_PANEL_IDS,
  VIDEO_WORKSPACE_ID,
  buildVideoDockablePanelDefaults,
} from '../../../lib/videoDockablePanels';
import {
  buildVideoRenderClipSignature,
  buildVideoRenderDirtyPlan,
} from '../../../lib/videoRenderSegments';
import {
  buildVideoCompositionRenderCacheSignature,
  buildVideoRenderSegmentArtifactsForCompletedRender,
  buildVideoRenderAssemblyManifest,
  buildVideoRenderSegmentReusePlan,
  formatVideoRenderAssemblyManifestDetails,
  formatVideoRenderAssemblyResultDetail,
  normalizeVideoRenderAssemblyResult,
  normalizeVideoRenderCacheSegmentArtifacts,
  normalizeVideoRenderCacheSegmentSignatures,
  resolveVideoRenderCacheAction,
} from '../../../lib/videoRenderCache';
import {
  areMediaInfosEqual,
  blobToDataUrl,
  buildAudioWaveformSignature,
  buildClipPreviewSignature,
  buildTimelineClipEdgePreview,
  buildTimelineFallbackWaveformPeaks,
  canUseSourceItemAsAudio,
  canUseSourceItemAsVisual,
  createDerivedVisualClipId,
  getAudioClipProgressPercent,
  getAudioTrackEndMs,
  getDefaultAudioTrackVolumes,
  getDraggedSourceItemId,
  getProgramStageClips,
  getSourceItemDurationSeconds,
  getSourceItemIcon,
  getSourceMediaInfo,
  getStageClipProgress,
  getStageClipLayout,
  getVisualClipProgressPercent,
  getVisualTrackEndMs,
  isEditableKeyboardTarget,
  mapWithConcurrency,
  normalizeAspectRatio,
  normalizeVideoFrameRate,
  normalizeVideoResolution,
  resolveSourceAspectRatio,
  roundNudgeCoordinate,
  type ProgramStageClip,
  type SourceMediaInfo,
  type TimelineBlockKind,
  type TimelineClipEdgePreview,
} from '../../../components/Editor/ManualEditorWorkspaceUtils';

const EDITOR_MEDIA_IMPORT_ACCEPT = getAcceptStringForKinds(['video', 'audio']);
const EDITOR_VIDEO_IMPORT_ACCEPT = getAcceptStringForKinds(['video']);
const EDITOR_AUDIO_IMPORT_ACCEPT = getAcceptStringForKinds(['audio']);
const EDITOR_IMAGE_IMPORT_ACCEPT = getAcceptStringForKinds(['image']);
const EDITOR_CAPTION_IMPORT_ACCEPT = getAcceptStringForKinds(['subtitle']);
const VIDEO_PANEL_TOGGLE_COMMANDS: Record<string, string> = {
  'editor:toggle-source-bin-panel': VIDEO_PANEL_IDS.projectSourceBin,
  'editor:toggle-source-monitor-panel': VIDEO_PANEL_IDS.sourceMonitor,
  'editor:toggle-program-monitor-panel': VIDEO_PANEL_IDS.programMonitor,
  'editor:toggle-inspector-panel': VIDEO_PANEL_IDS.inspector,
  'editor:toggle-timeline-panel': VIDEO_PANEL_IDS.timeline,
  'editor:toggle-premiere-parity-panel': VIDEO_PANEL_IDS.premiereParity,
  'editor:toggle-sequence-settings-panel': VIDEO_PANEL_IDS.sequenceSettings,
  'editor:toggle-export-preset-panel': VIDEO_PANEL_IDS.exportPreset,
  'editor:toggle-diagnostics-panel': VIDEO_PANEL_IDS.diagnostics,
};

const VIDEO_NATIVE_MENU_COMMANDS = [
  'edit:undo',
  'edit:redo',
  'edit:delete',
  'timeline:select',
  'timeline:cut',
  'timeline:slip',
  'timeline:hand',
  'timeline:snap',
  'timeline:add-keyframe',
  'timeline:previous-keyframe',
  'timeline:next-keyframe',
  'editor:toggle-source-bin-panel',
  'editor:toggle-source-monitor-panel',
  'editor:toggle-program-monitor-panel',
  'editor:toggle-inspector-panel',
  'editor:toggle-timeline-panel',
  'editor:toggle-premiere-parity-panel',
  'editor:toggle-sequence-settings-panel',
  'editor:toggle-export-preset-panel',
  'editor:toggle-diagnostics-panel',
  'editor:reset-panels',
  'help:keyboard-shortcuts',
] satisfies readonly NativeMenuCommand[];
const panelClassName = 'relative isolate rounded-xl border border-gray-700/60 bg-[#131821] shadow-2xl';
const activeTabClassName = 'rounded-md bg-blue-500/20 px-2 py-1.5 text-[11px] font-semibold text-blue-100';
const inactiveTabClassName = 'rounded-md px-2 py-1.5 text-[11px] font-semibold text-gray-400 transition-colors hover:text-white';
const smallEditorButtonClassName = 'inline-flex items-center gap-1.5 rounded-lg border border-gray-700/60 bg-[#0f131b] px-2.5 py-1.5 text-[11px] font-semibold text-gray-200 transition-colors hover:border-gray-500 hover:text-white';
const miniTrackButtonClassName = 'rounded-md border border-gray-700/60 bg-[#0f131b] px-2 py-1 text-[10px] font-semibold text-gray-300 transition-colors hover:border-gray-500 hover:text-white';
const sourceBinFilterButtonClassName = 'rounded-full border px-2 py-1 text-[10px] font-semibold transition-colors';
// Shared SECTION-LABEL styling for the Program Tools clusters (UX review F09) so every
// cluster heading reads as one consistent small-uppercase label.
const PROGRAM_TOOLS_SECTION_LABEL_CLASS = 'text-[10px] font-bold uppercase tracking-wider text-gray-400';
type SourceBinMediaPoolKind = 'image' | 'video' | 'audio';
const SOURCE_BIN_KIND_FILTER_OPTIONS: Array<{ id: SourceBinKindFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'visual', label: 'Visual' },
  { id: 'video', label: 'Video' },
  { id: 'image', label: 'Image' },
  { id: 'audio', label: 'Audio' },
  { id: 'text', label: 'Text' },
];
const VISUAL_TRACK_COUNT = 4;
const AUDIO_TRACK_COUNT = 4;

/**
 * Single source of truth for the selected clip's fit + transform at a playhead progress,
 * shared by the Program Tools cluster and the Inspector (UX review F09) so the two surfaces
 * always reflect the same fit/zoom state instead of deriving it independently.
 */
/** Friendly timeline label for clips without a bin item (comic bubbles/captions, text). */
function visualBlockLabel(clip: EditorVisualClip, itemLabel?: string): string {
  if (itemLabel) return itemLabel;
  if (clip.sourceKind === 'comic') {
    const text = clip.textContent?.trim();
    if (text) return text.length > 24 ? `${text.slice(0, 24)}…` : text;
    return clip.comicKind === 'caption' ? 'Caption' : clip.comicKind === 'thought-bubble' ? 'Thought Bubble' : 'Speech Bubble';
  }
  if (clip.sourceKind === 'text' && clip.textContent?.trim()) {
    const text = clip.textContent.trim();
    return text.length > 24 ? `${text.slice(0, 24)}…` : text;
  }
  return clip.sourceNodeId;
}

export function resolveClipFitState(clip: EditorVisualClip, progressPercent: number) {
  return {
    ...getVisualKeyframeStateAtProgress(clip, progressPercent),
    fitMode: clip.fitMode,
  };
}
const TIMELINE_PREVIEW_DEBOUNCE_MS = 220;
const TIMELINE_PREVIEW_MAX_CLIPS = 32;
const TIMELINE_PREVIEW_CONCURRENCY = 2;
const TIMELINE_WAVEFORM_CONCURRENCY = 1;
const TIMELINE_WAVEFORM_SAMPLE_COUNT = 80;
const TIMELINE_FALLBACK_WAVEFORM_PEAKS = buildTimelineFallbackWaveformPeaks(TIMELINE_WAVEFORM_SAMPLE_COUNT);
const EDITOR_CLIP_FILTER_KINDS: EditorClipFilterKind[] = getClipFilterKinds();

type TimelineTool = 'select' | 'cut' | 'slip' | 'hand' | 'snap';
type EditorContextMenuItem = Omit<SharedContextMenuItem, 'id'> & { id?: string };

interface TextEditDraft {
  text: string;
  fontFamily: string;
  fontSizePx: number;
  color: string;
  textEffect: TextClipEffect;
}

interface TextEditDialogState {
  mode: 'asset' | 'clip';
  targetId: string;
  title: string;
  draft: TextEditDraft;
}

export interface ManualEditorWorkspaceProps {
  getNewFlowNodePosition: () => { x: number; y: number };
}

export function VideoWorkspace({ getNewFlowNodePosition }: ManualEditorWorkspaceProps) {
  const nodes = useFlowStore((state) => state.nodes);
  const patchNodeData = useFlowStore((state) => state.patchNodeData);
  const addNode = useFlowStore((state) => state.addNode);
  const runNode = useFlowStore((state) => state.runNode);
  const removeEditorSourceReferences = useFlowStore((state) => state.removeEditorSourceReferences);
  const activeSourceBinId = useEditorStore((state) => state.activeSourceBinId);
  const activeCompositionId = useEditorStore((state) => state.activeCompositionId);
  const selectedSourceItemId = useEditorStore((state) => state.selectedSourceItemId);
  const selectedVisualClipId = useEditorStore((state) => state.selectedVisualClipId);
  const selectedAudioClipId = useEditorStore((state) => state.selectedAudioClipId);
  const sourceBinTab = useEditorStore((state) => state.sourceBinTab);
  const setActiveSourceBinId = useEditorStore((state) => state.setActiveSourceBinId);
  const setActiveCompositionId = useEditorStore((state) => state.setActiveCompositionId);
  const setSelectedSourceItemId = useEditorStore((state) => state.setSelectedSourceItemId);
  const setSelectedVisualClipId = useEditorStore((state) => state.setSelectedVisualClipId);
  const setSelectedAudioClipId = useEditorStore((state) => state.setSelectedAudioClipId);
  const setSourceBinTab = useEditorStore((state) => state.setSourceBinTab);
  const setPanelVisibility = useEditorStore((state) => state.setPanelVisibility);
  const setWorkspaceView = useEditorStore((state) => state.setWorkspaceView);
  const clearTimelineSelection = useEditorStore((state) => state.clearTimelineSelection);
  const sourceMonitorVisible = useEditorStore((state) => state.sourceMonitorVisible);
  const programMonitorVisible = useEditorStore((state) => state.programMonitorVisible);
  const inspectorVisible = useEditorStore((state) => state.inspectorVisible);
  const sourceBinVisible = useEditorStore((state) => state.sourceBinVisible);
  const inspectorWidth = useEditorStore((state) => state.inspectorWidth);
  const sourceBinWidth = useEditorStore((state) => state.sourceBinWidth);
  const monitorSplitPercent = useEditorStore((state) => state.monitorSplitPercent);
  const monitorSectionHeight = useEditorStore((state) => state.monitorSectionHeight);
  const timelineVisualTrackHeight = useEditorStore((state) => state.timelineVisualTrackHeight);
  const timelineAudioTrackHeight = useEditorStore((state) => state.timelineAudioTrackHeight);
  const setPanelWidth = useEditorStore((state) => state.setPanelWidth);
  const setMonitorSplitPercent = useEditorStore((state) => state.setMonitorSplitPercent);
  const setMonitorSectionHeight = useEditorStore((state) => state.setMonitorSectionHeight);
  const setTimelineTrackHeight = useEditorStore((state) => state.setTimelineTrackHeight);
  const restoreWorkspaceSnapshot = useEditorStore((state) => state.restoreWorkspaceSnapshot);
  const resetWorkspacePanels = useDockablePanelStore((state) => state.resetWorkspacePanels);
  const libraryItems = useSourceBinStore(useShallow((state) => state.bins.flatMap((bin) => bin.items)));
  const importFiles = useSourceBinStore((state) => state.importFiles);
  const addAssetItem = useSourceBinStore((state) => state.addAssetItem);
  const removeSourceBinItem = useSourceBinStore((state) => state.removeItem);
  const toggleSourceBinItemStarred = useSourceBinStore((state) => state.toggleItemStarred);
  const setSourceBinItemCollapsed = useSourceBinStore((state) => state.setItemCollapsed);
  const setAllSourceBinItemsCollapsed = useSourceBinStore((state) => state.setAllItemsCollapsed);
  const renderBackendPreference = useSettingsStore((state) => state.providerSettings.renderBackendPreference);
  const paperDocument = usePaperStore((state) => state.document);
  const importAcceptRef = useRef<HTMLInputElement>(null);
  const sourceMonitorVideoRef = useRef<HTMLVideoElement | null>(null);
  const programMonitorVideoRef = useRef<HTMLVideoElement | null>(null);
  const timelineScrollRef = useRef<HTMLDivElement | null>(null);
  const displayTimelineSecondsRef = useRef(10);
  const cutSelectedVisualClipAtPlayheadRef = useRef<(shiftKey?: boolean) => boolean>(() => false);
  const renderSegmentSignaturesRef = useRef<Record<string, string>>({});
  const [programMonitorMode, setProgramMonitorMode] = useState<'stage' | 'rendered'>('stage');
  const [timelineTool, setTimelineTool] = useState<TimelineTool>('select');
  const setTimelineToolWithActivity = useCallback((nextTool: TimelineTool, source: ActivityTrailSource = 'toolbar') => {
    setTimelineTool(nextTool);
    recordActivityTrailWorkspaceEvent('editor', 'Select Video timeline tool', nextTool, source);
  }, []);
  const [timelineZoomPercent, setTimelineZoomPercent] = useState(150);
  const [incrementalRenderSummary, setIncrementalRenderSummary] = useState<string | undefined>();
  const [isHelpOpen, setHelpOpen] = useState(false);
  const [mediaInfoMap, setMediaInfoMap] = useState<Record<string, SourceMediaInfo>>({});
  const [clipEdgePreviewMap, setClipEdgePreviewMap] = useState<Record<string, TimelineClipEdgePreview>>({});
  const [audioWaveformMap, setAudioWaveformMap] = useState<Record<string, number[]>>({});
  const [sourceBinSearchQuery, setSourceBinSearchQuery] = useState('');
  const [sourceBinKindFilter, setSourceBinKindFilter] = useState<SourceBinKindFilter>('all');
  const [paperStoryboardImportStatus, setPaperStoryboardImportStatus] = useState<string | null>(null);
  const [isImportingPaperStoryboardPages, setIsImportingPaperStoryboardPages] = useState(false);
  const [sourceBinMediaPoolCollapsed, setSourceBinMediaPoolCollapsed] = useState<Record<SourceBinMediaPoolKind, boolean>>({
    image: false,
    video: false,
    audio: false,
  });
  const clipPreviewSignatureRef = useRef<Record<string, string>>({});
  const audioWaveformSignatureRef = useRef<Record<string, string>>({});

  const sourceBinNodes = nodes.filter((node) => node.type === 'sourceBin');
  const compositionNodes = nodes.filter((node) => node.type === 'composition');

  useEffect(() => {
    if (!activeSourceBinId && sourceBinNodes[0]) {
      setActiveSourceBinId(sourceBinNodes[0].id);
    }
  }, [activeSourceBinId, setActiveSourceBinId, sourceBinNodes]);

  useEffect(() => {
    if (!activeCompositionId && compositionNodes[0]) {
      setActiveCompositionId(compositionNodes[0].id);
    }
  }, [activeCompositionId, compositionNodes, setActiveCompositionId]);

  const activeComposition = compositionNodes.find((node) => node.id === activeCompositionId);
  const activeCompositionCachedResult = typeof activeComposition?.data.result === 'string' && activeComposition.data.result.length > 0
    ? activeComposition.data.result
    : undefined;
  const activeCompositionCachedRenderSignature = typeof activeComposition?.data.editorRenderCacheCompositionSignature === 'string'
    ? activeComposition.data.editorRenderCacheCompositionSignature
    : undefined;
  const activeCompositionCacheSignatures = useMemo(
    () => normalizeVideoRenderCacheSegmentSignatures(activeComposition?.data.editorRenderCacheSegmentSignatures),
    [activeComposition?.data.editorRenderCacheSegmentSignatures],
  );
  const activeCompositionSegmentArtifacts = useMemo(
    () => normalizeVideoRenderCacheSegmentArtifacts(activeComposition?.data.editorRenderCacheSegmentArtifacts),
    [activeComposition?.data.editorRenderCacheSegmentArtifacts],
  );
  const renderCacheDetailLines = useMemo(
    () => {
      const manifestLines = formatVideoRenderAssemblyManifestDetails(
        activeComposition?.data.editorRenderCacheAssemblyManifest
          ?? activeComposition?.data.editorRenderCacheLastAssemblyManifest,
      );
      const assemblyResultLine = formatVideoRenderAssemblyResultDetail(
        activeComposition?.data.resultOutputMetadata?.assemblyResult
          ?? activeComposition?.data.editorRenderCacheLastAssemblyResult,
      );
      return assemblyResultLine ? [...manifestLines, assemblyResultLine] : manifestLines;
    },
    [
      activeComposition?.data.editorRenderCacheAssemblyManifest,
      activeComposition?.data.editorRenderCacheLastAssemblyManifest,
      activeComposition?.data.editorRenderCacheLastAssemblyResult,
      activeComposition?.data.resultOutputMetadata,
    ],
  );

  useEffect(() => {
    renderSegmentSignaturesRef.current = activeCompositionCachedResult
      ? activeCompositionCacheSignatures
      : {};
  }, [activeComposition?.id, activeCompositionCacheSignatures, activeCompositionCachedResult]);

  const orderedLibraryItems = useMemo(
    () => sortSourceBinItemsForDisplay(libraryItems),
    [libraryItems],
  );
  const sourceItems = useMemo(
    () => orderedLibraryItems.map(mapLibraryItemToEditorSourceItem),
    [orderedLibraryItems],
  );
  const timelineSourceItems = useMemo(
    () => sourceItems.filter((item) => canUseSourceItemAsVisual(item) || canUseSourceItemAsAudio(item)),
    [sourceItems],
  );
  const sourceBinKindCounts = useMemo(
    () => buildSourceBinKindCounts(timelineSourceItems),
    [timelineSourceItems],
  );
  const mediaSourceItems = useMemo(
    () => filterSourceBinItemsForDisplay(timelineSourceItems, {
      kind: sourceBinKindFilter,
      query: sourceBinSearchQuery,
    }),
    [sourceBinKindFilter, sourceBinSearchQuery, timelineSourceItems],
  );
  const mediaSourceItemsByPool = useMemo(
    () => ({
      image: filterSourceBinItemsForDisplay(mediaSourceItems, { kind: 'image', query: '' }),
      video: filterSourceBinItemsForDisplay(mediaSourceItems, { kind: 'video', query: '' }),
      audio: filterSourceBinItemsForDisplay(mediaSourceItems, { kind: 'audio', query: '' }),
    }),
    [mediaSourceItems],
  );
  const hasAnyMediaPoolItems = mediaSourceItemsByPool.image.length > 0
    || mediaSourceItemsByPool.video.length > 0
    || mediaSourceItemsByPool.audio.length > 0;
  const visualClips = useMemo(
    () => (activeComposition ? getEditorVisualClips(activeComposition.data) : []),
    [activeComposition],
  );
  const audioClips = useMemo(
    () => (activeComposition ? getEditorAudioClips(activeComposition.data) : []),
    [activeComposition],
  );
  const stageObjects = useMemo(
    () => (activeComposition ? getEditorStageObjects(activeComposition.data) : []),
    [activeComposition],
  );
  const compositionEditorAssets = useMemo(
    () => (activeComposition ? getEditorAssets(activeComposition.data) : []),
    [activeComposition],
  );
  const editorAssets = useMemo(
    () => getProjectEditorAssets(compositionEditorAssets, orderedLibraryItems),
    [compositionEditorAssets, orderedLibraryItems],
  );
  const paperStoryboardPageDescriptors = useMemo(
    () => buildPaperStoryboardPageDescriptors(paperDocument),
    [paperDocument],
  );
  const paperStoryboardExistingItemIds = useMemo(
    () => getPaperStoryboardExistingItemIds(libraryItems, paperStoryboardPageDescriptors),
    [libraryItems, paperStoryboardPageDescriptors],
  );
  const timelineSnapPoints = useMemo(
    () => normalizeTimelineSnapPoints(activeComposition?.data.editorTimelineSnapPoints),
    [activeComposition?.data.editorTimelineSnapPoints],
  );
  const timelineMarkers = useMemo(
    () => normalizeTimelineMarkers(activeComposition?.data.editorTimelineMarkers),
    [activeComposition?.data.editorTimelineMarkers],
  );
  const lockedVisualTracks = useMemo(
    () => normalizeLockedTracks(activeComposition?.data.editorLockedVisualTracks),
    [activeComposition?.data.editorLockedVisualTracks],
  );
  const lockedAudioTracks = useMemo(
    () => normalizeLockedTracks(activeComposition?.data.editorLockedAudioTracks),
    [activeComposition?.data.editorLockedAudioTracks],
  );
  const isVisualTrackLocked = (trackIndex: number) => isTrackLocked(lockedVisualTracks, trackIndex);
  const isAudioTrackLocked = (trackIndex: number) => isTrackLocked(lockedAudioTracks, trackIndex);
  const toggleVisualTrackLock = (trackIndex: number) => {
    if (!activeComposition) return;
    commitActiveCompositionPatch(
      { editorLockedVisualTracks: toggleLockedTrack(lockedVisualTracks, trackIndex) },
      isVisualTrackLocked(trackIndex) ? 'Unlock video track' : 'Lock video track',
    );
  };
  const toggleAudioTrackLock = (trackIndex: number) => {
    if (!activeComposition) return;
    commitActiveCompositionPatch(
      { editorLockedAudioTracks: toggleLockedTrack(lockedAudioTracks, trackIndex) },
      isAudioTrackLocked(trackIndex) ? 'Unlock audio track' : 'Lock audio track',
    );
  };
  const collapsedVisualTracks = useMemo(
    () => normalizeCollapsedTracks(activeComposition?.data.editorCollapsedVisualTracks),
    [activeComposition?.data.editorCollapsedVisualTracks],
  );
  const collapsedAudioTracks = useMemo(
    () => normalizeCollapsedTracks(activeComposition?.data.editorCollapsedAudioTracks),
    [activeComposition?.data.editorCollapsedAudioTracks],
  );
  const isVisualTrackCollapsed = (trackIndex: number) => isTrackCollapsed(collapsedVisualTracks, trackIndex);
  const isAudioTrackCollapsed = (trackIndex: number) => isTrackCollapsed(collapsedAudioTracks, trackIndex);
  const toggleVisualTrackCollapse = (trackIndex: number) => {
    if (!activeComposition) return;
    commitActiveCompositionPatch(
      { editorCollapsedVisualTracks: toggleCollapsedTrack(collapsedVisualTracks, trackIndex) },
      isVisualTrackCollapsed(trackIndex) ? 'Expand video track' : 'Collapse video track',
    );
  };
  const toggleAudioTrackCollapse = (trackIndex: number) => {
    if (!activeComposition) return;
    commitActiveCompositionPatch(
      { editorCollapsedAudioTracks: toggleCollapsedTrack(collapsedAudioTracks, trackIndex) },
      isAudioTrackCollapsed(trackIndex) ? 'Expand audio track' : 'Collapse audio track',
    );
  };
  const editorAssetById = useMemo(
    () => new Map(editorAssets.map((asset) => [asset.id, asset])),
    [editorAssets],
  );
  const audioTrackVolumes = useMemo(
    () => (activeComposition ? getEditorAudioTrackVolumes(activeComposition.data, AUDIO_TRACK_COUNT) : getDefaultAudioTrackVolumes()),
    [activeComposition],
  );
  const sourceItemByNodeId = useMemo(
    () => buildEditorSourceItemLookup(libraryItems),
    [libraryItems],
  );
  const [timelineCursorSeconds, setTimelineCursorSeconds] = useState(0);
  // JKL shuttle transport: 0 = paused; ±1/±2/±4/±8 = play rate (see timelineTransport.ts).
  const [shuttleRate, setShuttleRate] = useState(0);
  // Source monitor I/O marks for three-point editing (threePointEdit.ts); keyed to the marked item.
  const [sourceMarks, setSourceMarks] = useState<{ itemId: string; inSeconds?: number; outSeconds?: number } | null>(null);

  useEffect(() => {
    if (shuttleRate === 0) return undefined;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const deltaMs = now - last;
      last = now;
      setTimelineCursorSeconds((current) => {
        const { nextSeconds, stopped } = advanceShuttleCursor(current, shuttleRate, deltaMs, displayTimelineSecondsRef.current);
        if (stopped) {
          setShuttleRate(0);
        }
        return nextSeconds;
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [shuttleRate]);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    items: EditorContextMenuItem[];
  } | null>(null);
  const [visualClipPropertyClipboard, setVisualClipPropertyClipboard] =
    useState<VisualClipPropertyClipboard | null>(null);
  const [visualClipPropertyDialog, setVisualClipPropertyDialog] = useState<{
    clipId: string;
    sourceLabel: string;
    selectedProperties: VisualClipCopiedProperty[];
  } | null>(null);
  const [textEditDialog, setTextEditDialog] = useState<TextEditDialogState | null>(null);
  const [selectedStageObjectId, setSelectedStageObjectId] = useState<string | undefined>(undefined);
  const [selectedTimelineGap, setSelectedTimelineGap] = useState<TimelineGap | null>(null);
  const [sourceBinPreview, setSourceBinPreview] = useState<{
    kind: 'image' | 'video';
    src: string;
    label: string;
  } | null>(null);
  const [editorHistory, setEditorHistory] = useState(createEditorHistoryState);

  const applyEditorHistorySnapshot = useCallback((
    compositionId: string,
    snapshot: ReturnType<typeof createEditorHistorySnapshot>,
  ) => {
    setActiveCompositionId(compositionId);
    patchNodeData(compositionId, snapshot.toPatch());
    clearTimelineSelection();
    setContextMenu(null);
  }, [clearTimelineSelection, patchNodeData, setActiveCompositionId, setContextMenu]);

  const undoEditor = useCallback(() => {
    const result = undoEditorHistory(editorHistory);

    if (!result.entry || !result.snapshot) {
      return;
    }

    setEditorHistory(result.history);
    applyEditorHistorySnapshot(result.entry.compositionId, result.snapshot);
  }, [applyEditorHistorySnapshot, editorHistory]);

  const redoEditor = useCallback(() => {
    const result = redoEditorHistory(editorHistory);

    if (!result.entry || !result.snapshot) {
      return;
    }

    setEditorHistory(result.history);
    applyEditorHistorySnapshot(result.entry.compositionId, result.snapshot);
  }, [applyEditorHistorySnapshot, editorHistory]);

  const commitActiveCompositionPatch = useCallback((patch: Partial<NodeData>, label: string) => {
    if (!activeComposition) {
      return;
    }

    const before = createEditorHistorySnapshot(activeComposition.data);
    const after = createEditorHistorySnapshot({
      ...activeComposition.data,
      ...patch,
    });

    setEditorHistory((current) =>
      pushEditorHistoryEntry(current, {
        compositionId: activeComposition.id,
        before,
        after,
        label,
      }),
    );
    patchNodeData(activeComposition.id, patch);
  }, [activeComposition, patchNodeData]);

  useEffect(() => {
    if (timelineSourceItems.length === 0) {
      if (selectedSourceItemId) {
        setSelectedSourceItemId(undefined);
      }
      return;
    }

    if (!selectedSourceItemId || !timelineSourceItems.some((item) => item.id === selectedSourceItemId)) {
      setSelectedSourceItemId(timelineSourceItems[0].id);
    }
  }, [selectedSourceItemId, setSelectedSourceItemId, timelineSourceItems]);

  useEffect(() => {
    if (selectedVisualClipId && !visualClips.some((clip) => clip.id === selectedVisualClipId)) {
      setSelectedVisualClipId(undefined);
    }
  }, [selectedVisualClipId, setSelectedVisualClipId, visualClips]);

  useEffect(() => {
    if (selectedAudioClipId && !audioClips.some((clip) => clip.id === selectedAudioClipId)) {
      setSelectedAudioClipId(undefined);
    }
  }, [audioClips, selectedAudioClipId, setSelectedAudioClipId]);

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    const close = () => setContextMenu(null);
    window.addEventListener('pointerdown', close);
    window.addEventListener('contextmenu', close);

    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('contextmenu', close);
    };
  }, [contextMenu]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableKeyboardTarget(event.target)) {
        if (event.key !== 'Escape') {
          return;
        }
      }

      if (event.key === 'F1' || (event.key === '/' && event.shiftKey)) {
        event.preventDefault();
        setHelpOpen((current) => !current);
        return;
      }

      if (event.key === 'Escape') {
        setContextMenu(null);
        setHelpOpen(false);
        return;
      }

      if (isEditableKeyboardTarget(event.target)) {
        return;
      }

      const shortcutKey = event.key.toLowerCase();
      const isCommandShortcut = event.ctrlKey || event.metaKey;

      if (isCommandShortcut && shortcutKey === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          redoEditor();
        } else {
          undoEditor();
        }
        return;
      }

      if (isCommandShortcut && shortcutKey === 'y') {
        event.preventDefault();
        redoEditor();
        return;
      }

      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        const stepPx = event.shiftKey ? 10 : event.altKey ? 0.25 : 1;
        const deltaX = event.key === 'ArrowLeft' ? -stepPx : event.key === 'ArrowRight' ? stepPx : 0;
        const deltaY = event.key === 'ArrowUp' ? -stepPx : event.key === 'ArrowDown' ? stepPx : 0;

        if (selectedStageObjectId && activeComposition) {
          event.preventDefault();
          commitActiveCompositionPatch({
            editorStageObjects: stageObjects.map((object) =>
              object.id === selectedStageObjectId
                ? { ...object, x: roundNudgeCoordinate(object.x + deltaX), y: roundNudgeCoordinate(object.y + deltaY) }
                : object,
            ),
          }, 'Nudge stage object');
          return;
        }

        if (selectedVisualClipId && activeComposition) {
          event.preventDefault();
          commitActiveCompositionPatch({
            editorVisualClips: visualClips.map((clip) =>
              clip.id === selectedVisualClipId
                ? {
                    ...clip,
                    positionX: roundNudgeCoordinate(clip.positionX + deltaX),
                    positionY: roundNudgeCoordinate(clip.positionY + deltaY),
                    endPositionX: clip.motionEnabled ? roundNudgeCoordinate(clip.endPositionX + deltaX) : clip.endPositionX,
                    endPositionY: clip.motionEnabled ? roundNudgeCoordinate(clip.endPositionY + deltaY) : clip.endPositionY,
                  }
                : clip,
            ),
          }, 'Nudge visual clip');
          return;
        }

        if (selectedAudioClipId && activeComposition && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
          event.preventDefault();
          const deltaMs = (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 1000 : 100);
          commitActiveCompositionPatch({
            editorAudioClips: audioClips.map((clip) =>
              clip.id === selectedAudioClipId
                ? { ...clip, offsetMs: Math.max(0, clip.offsetMs + deltaMs) }
                : clip,
            ),
          }, 'Nudge audio clip');
          return;
        }
      }

      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        setTimelineCursorSeconds((current) => {
          const direction = event.key === 'ArrowRight' ? 1 : -1;
          const nextSeconds = event.shiftKey
            ? direction > 0
              ? Math.ceil(current + 0.001)
              : Math.floor(current - 0.001)
            : current + direction * 0.1;

          return Math.max(0, Math.min(displayTimelineSecondsRef.current, nextSeconds));
        });
        return;
      }

      if (!isCommandShortcut && shortcutKey === 'v') {
        setTimelineToolWithActivity('select', 'keyboard');
        return;
      }

      if (!isCommandShortcut && shortcutKey === 'c') {
        event.preventDefault();
        if (!cutSelectedVisualClipAtPlayheadRef.current(event.shiftKey)) {
          setTimelineToolWithActivity('cut', 'keyboard');
        }
        return;
      }

      if (!isCommandShortcut && shortcutKey === 's') {
        setTimelineToolWithActivity('slip', 'keyboard');
        return;
      }

      if (!isCommandShortcut && shortcutKey === 'h') {
        setTimelineToolWithActivity('hand', 'keyboard');
        return;
      }

      if (!isCommandShortcut && shortcutKey === 'm' && !event.shiftKey) {
        setTimelineToolWithActivity('snap', 'keyboard');
        return;
      }
      if (!isCommandShortcut && shortcutKey === 'm' && event.shiftKey) {
        event.preventDefault();
        addTimelineMarkerAtPlayheadRef.current();
        return;
      }

      // JKL shuttle + space transport (owner-approved pro-editor quartet, item 1).
      if (event.key === ' ' && !isCommandShortcut) {
        event.preventDefault();
        setShuttleRate((current) => toggleShuttlePlay(current));
        return;
      }
      if (!isCommandShortcut && shortcutKey === 'l') {
        event.preventDefault();
        setShuttleRate((current) => stepShuttleRate(current, 1));
        return;
      }
      if (!isCommandShortcut && shortcutKey === 'j') {
        event.preventDefault();
        setShuttleRate((current) => stepShuttleRate(current, -1));
        return;
      }
      if (!isCommandShortcut && shortcutKey === 'k' && !event.shiftKey) {
        event.preventDefault();
        setShuttleRate(0);
        return;
      }
      if (event.key === 'Home') {
        event.preventDefault();
        setShuttleRate(0);
        setTimelineCursorSeconds(0);
        return;
      }
      if (event.key === 'End') {
        event.preventDefault();
        setShuttleRate(0);
        setTimelineCursorSeconds(displayTimelineSecondsRef.current);
        return;
      }
      if (!isCommandShortcut && shortcutKey === 'i') {
        event.preventDefault();
        markSourcePointRef.current('in');
        return;
      }
      if (!isCommandShortcut && shortcutKey === 'o') {
        event.preventDefault();
        markSourcePointRef.current('out');
        return;
      }
      if (!isCommandShortcut && event.key === ',') {
        event.preventDefault();
        performThreePointEditRef.current('insert');
        return;
      }
      if (!isCommandShortcut && event.key === '.') {
        event.preventDefault();
        performThreePointEditRef.current('overwrite');
        return;
      }
      if (!isCommandShortcut && shortcutKey === 'q') {
        event.preventDefault();
        performTrimEditRef.current('ripple-in');
        return;
      }
      if (!isCommandShortcut && shortcutKey === 'w') {
        event.preventDefault();
        performTrimEditRef.current('ripple-out');
        return;
      }
      if (!isCommandShortcut && shortcutKey === 'e') {
        event.preventDefault();
        performTrimEditRef.current('roll');
        return;
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (selectedStageObjectId && activeComposition) {
          event.preventDefault();
          commitActiveCompositionPatch({
            editorStageObjects: stageObjects.filter((object) => object.id !== selectedStageObjectId),
          }, 'Remove stage object');
          setSelectedStageObjectId(undefined);
          return;
        }

        if (selectedVisualClipId && activeComposition) {
          event.preventDefault();
          const deleteTarget = visualClips.find((candidate) => candidate.id === selectedVisualClipId);
          if (deleteTarget && isVisualTrackLocked(deleteTarget.trackIndex)) return;
          commitActiveCompositionPatch({
            editorVisualClips: visualClips.filter((candidate) => candidate.id !== selectedVisualClipId),
          }, 'Remove visual clip');
          setSelectedVisualClipId(undefined);
          return;
        }

        if (selectedAudioClipId && activeComposition) {
          event.preventDefault();
          const deleteAudioTarget = audioClips.find((candidate) => candidate.id === selectedAudioClipId);
          if (deleteAudioTarget && isAudioTrackLocked(deleteAudioTarget.trackIndex)) return;
          commitActiveCompositionPatch({
            editorAudioClips: audioClips.filter((candidate) => candidate.id !== selectedAudioClipId),
          }, 'Remove audio clip');
          setSelectedAudioClipId(undefined);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [
    activeComposition,
    audioClips,
    commitActiveCompositionPatch,
    patchNodeData,
    redoEditor,
    selectedAudioClipId,
    selectedStageObjectId,
    setSelectedAudioClipId,
    setTimelineToolWithActivity,
    setSelectedVisualClipId,
    stageObjects,
    selectedVisualClipId,
    undoEditor,
    visualClips,
  ]);

  useEffect(() => {
    let cancelled = false;
    const mediaItems = sourceItems.filter((item) => item.kind === 'image' || item.kind === 'video' || item.kind === 'audio' || item.kind === 'composition');

    if (mediaItems.length === 0) {
      return;
    }

    void Promise.all(
      mediaItems.map(async (item) => [item.id, await getSourceMediaInfo(item)] as const),
    ).then((entries) => {
      if (cancelled) {
        return;
      }

      setMediaInfoMap((current) => {
        const next = { ...current };
        let changed = false;

        for (const [id, duration] of entries) {
          if (!areMediaInfosEqual(current[id], duration)) {
            next[id] = duration;
            changed = true;
          }
        }

        return changed ? next : current;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [sourceItems]);

  const durationMap = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(mediaInfoMap).map(([id, info]) => [id, info.durationSeconds ?? 0]),
      ),
    [mediaInfoMap],
  );

  const visualBlocks = useMemo(
    () => buildVisualTimelineBlocks(visualClips, sourceItemByNodeId, durationMap),
    [durationMap, sourceItemByNodeId, visualClips],
  );
  const buildCurrentRenderDirtyPlan = useCallback((previousSegmentSignatures: Record<string, string>) => buildVideoRenderDirtyPlan({
    clips: visualBlocks.map((block) => ({
      id: block.clip.id,
      trackIndex: block.clip.trackIndex,
      startMs: Math.round(block.startSeconds * 1000),
      durationMs: Math.round(block.durationSeconds * 1000),
      signature: buildVideoRenderClipSignature({
        ...block.clip,
        durationMs: Math.round(block.durationSeconds * 1000),
        sourceSignature: block.item?.assetUrl ?? block.item?.id,
      }),
    })),
    previousSegmentSignatures,
  }), [visualBlocks]);
  const visualGapsByTrack = useMemo(
    () =>
      Array.from({ length: VISUAL_TRACK_COUNT }, (_, trackIndex) =>
        findTimelineGaps(
          visualBlocks.map((block) => ({
            id: block.clip.id,
            trackIndex: block.clip.trackIndex,
            startSeconds: block.startSeconds,
            endSeconds: block.endSeconds,
          })),
          trackIndex,
        ),
      ),
    [visualBlocks],
  );
  const audioBlocks = useMemo(
    () => buildAudioTimelineBlocks(audioClips, sourceItemByNodeId, durationMap),
    [audioClips, durationMap, sourceItemByNodeId],
  );
  const sourceItemById = useMemo(
    () => new Map(sourceItems.map((item) => [item.id, item])),
    [sourceItems],
  );
  const selectedSourceItem = selectedSourceItemId ? sourceItemById.get(selectedSourceItemId) : undefined;
  const selectedVisualClip = useMemo(
    () => selectedVisualClipId
      ? visualClips.find((clip) => clip.id === selectedVisualClipId)
      : undefined,
    [selectedVisualClipId, visualClips],
  );
  const selectedAudioClip = selectedAudioClipId
    ? audioClips.find((clip) => clip.id === selectedAudioClipId)
    : undefined;
  const selectedStageObject = selectedStageObjectId
    ? stageObjects.find((object) => object.id === selectedStageObjectId)
    : undefined;

  useEffect(() => {
    const activeClipIds = visualClips.map((clip) => clip.id);
    const activeClipIdSet = new Set(activeClipIds);

    for (const clipId of Object.keys(clipPreviewSignatureRef.current)) {
      if (!activeClipIdSet.has(clipId)) {
        delete clipPreviewSignatureRef.current[clipId];
      }
    }

    const pruneTimer = window.setTimeout(() => {
      setClipEdgePreviewMap((current) =>
        pruneTimelinePreviewMap(current, activeClipIds, TIMELINE_PREVIEW_MAX_CLIPS),
      );
    }, 0);

    return () => window.clearTimeout(pruneTimer);
  }, [visualClips]);

  useEffect(() => {
    let cancelled = false;
    const previewTimer = window.setTimeout(() => {
      if (cancelled) {
        return;
      }

      const candidateClips = visualClips.slice(-TIMELINE_PREVIEW_MAX_CLIPS);
      const previewRequests = takePendingTimelinePreviewRequests(candidateClips.flatMap((clip) => {
        const sourceItem = sourceItemByNodeId.get(clip.sourceNodeId);
        const signature = buildClipPreviewSignature(clip, sourceItem, durationMap);

        if (!sourceItem) {
          return [];
        }

        return [{
          clipId: clip.id,
          signature,
          payload: {
            clip,
            sourceItem,
          },
        }];
      }), clipPreviewSignatureRef.current);

      if (previewRequests.length === 0) {
        return;
      }

      void mapWithConcurrency(
        previewRequests,
        TIMELINE_PREVIEW_CONCURRENCY,
        async ({ clipId, signature, payload }) => ({
          clipId,
          signature,
          preview: await buildTimelineClipEdgePreview(payload.clip, payload.sourceItem, durationMap).catch(() => undefined),
        }),
      ).then((results) => {
        if (cancelled) {
          return;
        }

        setClipEdgePreviewMap((current) =>
          mergeTimelinePreviewResults(
            current,
            results,
            visualClips.map((clip) => clip.id),
            TIMELINE_PREVIEW_MAX_CLIPS,
          ),
        );
      });
    }, TIMELINE_PREVIEW_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(previewTimer);
    };
  }, [durationMap, sourceItemByNodeId, visualClips]);

  useEffect(() => {
    const activeClipIds = audioClips.map((clip) => clip.id);
    const activeClipIdSet = new Set(activeClipIds);

    for (const clipId of Object.keys(audioWaveformSignatureRef.current)) {
      if (!activeClipIdSet.has(clipId)) {
        delete audioWaveformSignatureRef.current[clipId];
      }
    }

    const pruneTimer = window.setTimeout(() => {
      setAudioWaveformMap((current) => pruneTimelineWaveformMap(current, activeClipIds));
    }, 0);

    return () => window.clearTimeout(pruneTimer);
  }, [audioClips]);

  useEffect(() => {
    let cancelled = false;
    let fallbackTimer: number | undefined;
    const fallbackClipIds: string[] = [];
    const waveformRequests = takePendingTimelineWaveformRequests(audioClips.map((clip) => {
      const sourceItem = sourceItemByNodeId.get(clip.sourceNodeId);
      const signature = buildAudioWaveformSignature(sourceItem);

      if (sourceItem && sourceItem.kind !== 'audio') {
        fallbackClipIds.push(clip.id);
      }

      return {
        clipId: clip.id,
        signature,
        sourceUrl: sourceItem?.kind === 'audio' ? sourceItem.assetUrl : undefined,
      };
    }), audioWaveformSignatureRef.current);

    if (fallbackClipIds.length > 0) {
      fallbackTimer = window.setTimeout(() => {
        if (cancelled) {
          return;
        }

        setAudioWaveformMap((current) => {
          let changed = false;
          const next = { ...current };

          for (const clipId of fallbackClipIds) {
            if (next[clipId] !== TIMELINE_FALLBACK_WAVEFORM_PEAKS) {
              next[clipId] = TIMELINE_FALLBACK_WAVEFORM_PEAKS;
              changed = true;
            }
          }

          return changed ? next : current;
        });
      }, 0);
    }

    if (waveformRequests.length === 0) {
      return () => {
        cancelled = true;

        if (fallbackTimer !== undefined) {
          window.clearTimeout(fallbackTimer);
        }
      };
    }

    void mapWithConcurrency(
      waveformRequests,
      TIMELINE_WAVEFORM_CONCURRENCY,
      async ({ clipIds, sourceUrl, signature }) => ({
        clipIds,
        signature,
        peaks: await extractWaveformPeaks(sourceUrl, TIMELINE_WAVEFORM_SAMPLE_COUNT),
      }),
    ).then((results) => {
      if (cancelled) {
        return;
      }

      if (results.length === 0) {
        return;
      }

      setAudioWaveformMap((current) => {
        const next = { ...current };

        for (const entry of results) {
          for (const clipId of entry.clipIds) {
            next[clipId] = entry.peaks;
          }
        }

        return next;
      });
    });

    return () => {
      cancelled = true;

      if (fallbackTimer !== undefined) {
        window.clearTimeout(fallbackTimer);
      }
    };
  }, [audioClips, sourceItemByNodeId]);
  const sequenceDurationSeconds = getTimelineDurationSeconds(visualBlocks, audioBlocks);
  const displayTimelineSeconds = Math.max(
    Number(activeComposition?.data.compositionTimelineSeconds ?? 10),
    Math.ceil(sequenceDurationSeconds),
    1,
  );

  useEffect(() => {
    if (!activeComposition || stageObjects.length === 0) {
      return;
    }

    const migrated = migrateStageObjectsToEditorAssets(stageObjects, {
      durationSeconds: Math.max(4, sequenceDurationSeconds || 4),
      trackIndex: 0,
    });

    queueMicrotask(() => {
      commitActiveCompositionPatch({
        editorAssets: [...compositionEditorAssets, ...migrated.assets],
        editorVisualClips: [...visualClips, ...migrated.clips],
        editorStageObjects: [],
      }, 'Migrate stage objects to editor assets');
      setSelectedStageObjectId(undefined);
    });
  }, [
    activeComposition,
    compositionEditorAssets,
    commitActiveCompositionPatch,
    sequenceDurationSeconds,
    stageObjects,
    visualClips,
  ]);

  useEffect(() => {
    displayTimelineSecondsRef.current = displayTimelineSeconds;
  }, [displayTimelineSeconds]);
  const previewUrl = activeComposition?.data.result;
  const previewOutputMetadata = activeComposition?.data.resultOutputMetadata;
  const isProgramImageSequenceOutput = activeComposition?.data.resultMimeType === 'application/zip' &&
    Boolean(previewOutputMetadata && 'imageSequence' in previewOutputMetadata);
  const secondMarkers = Array.from({ length: Math.ceil(displayTimelineSeconds) + 1 }, (_, index) => index);
  const selectedVisualSourceItem = selectedVisualClip
    ? sourceItemByNodeId.get(selectedVisualClip.sourceNodeId)
    : undefined;
  const selectedVisualEditorAsset = selectedVisualClip
    ? editorAssetById.get(selectedVisualClip.sourceNodeId)
    : undefined;
  const selectedVisualBackingImageItem =
    selectedVisualSourceItem?.kind === 'image'
      ? selectedVisualSourceItem
      : selectedVisualEditorAsset?.kind === 'image' && selectedVisualEditorAsset.imageSourceId
        ? sourceItemByNodeId.get(selectedVisualEditorAsset.imageSourceId)
        : undefined;
  const selectedVisualSourceDurationSeconds = getSourceItemDurationSeconds(selectedVisualSourceItem, durationMap);
  const selectedVisualDurationSeconds = selectedVisualClip
    ? resolveVisualClipDuration(selectedVisualClip, sourceItemByNodeId, durationMap)
    : undefined;
  const selectedAudioDurationSeconds = selectedAudioClip
    ? audioBlocks.find((block) => block.clip.id === selectedAudioClip.id)?.durationSeconds
    : undefined;
  const canKeyframeSelectedClip = Boolean(selectedVisualClip || selectedAudioClip);
  const compositionAspectRatio = normalizeAspectRatio(activeComposition?.data.aspectRatio);
  const compositionResolution = normalizeVideoResolution(activeComposition?.data.videoResolution);
  const compositionFrameRate = normalizeVideoFrameRate(activeComposition?.data.videoFrameRate);
  const programCanvas = getVideoCanvasDimensions(compositionAspectRatio, compositionResolution);
  const exportPresetPlan = normalizeVideoExportPresetPlan(activeComposition?.data.editorExportPresetPlan);
  const currentCompositionRenderCacheSignature = buildVideoCompositionRenderCacheSignature({
    aspectRatio: compositionAspectRatio,
    videoResolution: compositionResolution,
    frameRate: compositionFrameRate,
    timelineDurationSeconds: sequenceDurationSeconds,
    exportPresetPlan,
    audioClips,
    stageObjects,
  });
  const sequenceSummary = buildVideoSequenceSummary(
    compositionAspectRatio,
    compositionResolution,
    programCanvas,
    sequenceDurationSeconds,
    compositionFrameRate,
  );
  const parityDiagnostics = useMemo(
    () => buildVideoParityDiagnostics({ visualClips, stageObjects }),
    [stageObjects, visualClips],
  );
  const monitorParityNotices = getVideoMonitorParityNotices({
    visualClips,
    stageObjects,
    exportPresetPlan,
  });
  const programStageClips = useMemo(
    () =>
      getProgramStageClips(
        visualClips,
        sourceItemByNodeId,
        editorAssetById,
        durationMap,
        mediaInfoMap,
        timelineCursorSeconds,
      ),
    [durationMap, editorAssetById, mediaInfoMap, sourceItemByNodeId, timelineCursorSeconds, visualClips],
  );
  const exportReadiness = useMemo(
    () => analyzeVideoExportReadiness({
      audioClips,
      availableSourceIds: sourceItemByNodeId.keys(),
      dirtySpanSummary: incrementalRenderSummary,
      hasComposition: Boolean(activeComposition),
      stageObjectCount: stageObjects.length,
      visualClips,
    }).summary,
    [activeComposition, audioClips, incrementalRenderSummary, sourceItemByNodeId, stageObjects.length, visualClips],
  );
  const renderBackendStatus = useMemo(
    () => summarizeVideoRenderBackend(renderBackendPreference),
    [renderBackendPreference],
  );

  const selectSourceItem = (itemId: string) => {
    clearTimelineSelection();
    setSelectedStageObjectId(undefined);
    setSelectedTimelineGap(null);
    setSelectedSourceItemId(itemId);
  };

  const openSourceBinPreview = (item: SourceBinItem) => {
    const previewKind = getSourceBinPreviewKind(item);

    if (!previewKind || !item.assetUrl) {
      selectSourceItem(item.id);
      return;
    }

    setSourceBinPreview({
      kind: previewKind,
      src: item.assetUrl,
      label: item.label,
    });
  };

  const selectVisualClip = (clip: EditorVisualClip) => {
    setSelectedVisualClipId(clip.id);
    setSelectedAudioClipId(undefined);
    setSelectedStageObjectId(undefined);
    setSelectedTimelineGap(null);
    const sourceItem = sourceItemByNodeId.get(clip.sourceNodeId);
    if (sourceItem) {
      setSelectedSourceItemId(sourceItem.id);
    }
  };

  const selectAudioClip = (clip: EditorAudioClip) => {
    setSelectedAudioClipId(clip.id);
    setSelectedVisualClipId(undefined);
    setSelectedStageObjectId(undefined);
    setSelectedTimelineGap(null);
    const sourceItem = sourceItemByNodeId.get(clip.sourceNodeId);
    if (sourceItem) {
      setSelectedSourceItemId(sourceItem.id);
    }
  };

  const selectStageObject = (objectId: string) => {
    clearTimelineSelection();
    setSelectedSourceItemId(undefined);
    setSelectedTimelineGap(null);
    setSelectedStageObjectId(objectId);
  };

  const addVisualClip = (item: SourceBinItem, trackIndex = 0) => {
    if (!activeComposition) {
      return;
    }

    if (!['image', 'video', 'composition', 'text'].includes(item.kind)) {
      return;
    }
    if (isVisualTrackLocked(trackIndex)) return;

    const nextClip = createEditorVisualClip(
      item.nodeId,
      item.kind as 'image' | 'video' | 'composition' | 'text',
      {
        trackIndex,
        startMs: getVisualTrackEndMs(visualBlocks, trackIndex),
      },
    );
    commitActiveCompositionPatch({
      editorVisualClips: [...visualClips, nextClip],
    }, 'Add visual clip');
    setSelectedVisualClipId(nextClip.id);
    setSelectedAudioClipId(undefined);
    setSelectedSourceItemId(item.id);
    recordActivityTrailWorkspaceEvent('editor', 'Add visual clip to timeline', `V${trackIndex + 1}`, 'toolbar');
  };

  const addAudioClip = (item: SourceBinItem, trackIndex = 0) => {
    if (!activeComposition || !canUseSourceItemAsAudio(item)) {
      return;
    }
    if (isAudioTrackLocked(trackIndex)) return;

    const nextClip = createEditorAudioClip(item.nodeId, trackIndex);
    nextClip.offsetMs = getAudioTrackEndMs(audioBlocks, trackIndex);
    commitActiveCompositionPatch({
      editorAudioClips: [...audioClips, nextClip],
    }, 'Add audio clip');
    setSelectedAudioClipId(nextClip.id);
    setSelectedVisualClipId(undefined);
    setSelectedSourceItemId(item.id);
    recordActivityTrailWorkspaceEvent('editor', 'Add audio clip to timeline', `A${trackIndex + 1}`, 'toolbar');
  };

  const markSourcePoint = (which: 'in' | 'out') => {
    if (!selectedSourceItem) return;
    const atSeconds = sourceMonitorVideoRef.current?.currentTime ?? 0;
    setSourceMarks((current) => ({
      itemId: selectedSourceItem.id,
      ...(current?.itemId === selectedSourceItem.id ? current : {}),
      [which === 'in' ? 'inSeconds' : 'outSeconds']: atSeconds,
    }));
  };

  // Three-point edit: marked source range lands on V1 at the playhead.
  // Insert splits any straddling clip (zero-length overwrite) and ripples the rest right;
  // Overwrite clears the landing range. Both are a single undo step.
  const performThreePointEdit = (mode: 'insert' | 'overwrite') => {
    if (!activeComposition || !selectedSourceItem) return;
    if (!['image', 'video', 'composition'].includes(selectedSourceItem.kind)) return;
    const trackIndex = 0;
    if (isVisualTrackLocked(trackIndex)) return;
    const sourceDurationSeconds = getSourceItemDurationSeconds(selectedSourceItem, durationMap) ?? 4;
    const marks = sourceMarks?.itemId === selectedSourceItem.id ? sourceMarks : {};
    const { sourceInMs, sourceOutMs } = normalizeSourceMarks(marks, sourceDurationSeconds);
    const editDurationMs = sourceOutMs - sourceInMs;
    const playheadMs = Math.max(0, Math.round(timelineCursorSeconds * 1000));
    // visualBlocks measure in seconds; the edit math runs in ms like the clip model.
    const blocksMs = visualBlocks.map((blockEntry) => ({
      clip: blockEntry.clip,
      startMs: Math.round(blockEntry.startSeconds * 1000),
      durationMs: Math.round(blockEntry.durationSeconds * 1000),
    }));
    const newClip = createEditorVisualClip(
      selectedSourceItem.nodeId,
      selectedSourceItem.kind as 'image' | 'video' | 'composition',
      selectedSourceItem.kind === 'video'
        ? { trackIndex, startMs: playheadMs, sourceInMs, sourceOutMs }
        : { trackIndex, startMs: playheadMs, durationSeconds: editDurationMs / 1000 },
    );
    if (mode === 'overwrite') {
      const { clips } = overwriteTrackRange(blocksMs, trackIndex, playheadMs, editDurationMs);
      commitActiveCompositionPatch({ editorVisualClips: [...clips, newClip] }, 'Overwrite edit');
    } else {
      const { clips: splitClips } = overwriteTrackRange(blocksMs, trackIndex, playheadMs, 0);
      const shifted = shiftTrackClipsForInsert(splitClips, trackIndex, playheadMs, editDurationMs);
      commitActiveCompositionPatch({ editorVisualClips: [...shifted, newClip] }, 'Insert edit');
    }
    setSelectedVisualClipId(newClip.id);
    recordActivityTrailWorkspaceEvent('editor', mode === 'insert' ? 'Insert edit at playhead' : 'Overwrite edit at playhead', 'V1', 'toolbar');
  };

  // Playhead-driven ripple/roll (quartet item 4): Q ripples the selected clip's IN edge to the
  // playhead, W its OUT edge, E rolls the nearest cut on the clip's lane to the playhead.
  const performTrimEdit = (kind: 'ripple-in' | 'ripple-out' | 'roll') => {
    if (!activeComposition || !selectedVisualClipId) return;
    const selected = visualClips.find((candidate) => candidate.id === selectedVisualClipId);
    if (!selected || isVisualTrackLocked(selected.trackIndex)) return;
    const playheadMs = Math.max(0, Math.round(timelineCursorSeconds * 1000));
    const blocksMs = visualBlocks.map((blockEntry) => ({
      clip: blockEntry.clip,
      startMs: Math.round(blockEntry.startSeconds * 1000),
      durationMs: Math.round(blockEntry.durationSeconds * 1000),
    }));
    if (kind === 'roll') {
      const editPoint = findNearestEditPoint(blocksMs, selected.trackIndex, playheadMs);
      if (!editPoint) return;
      const rolled = rollEditPointToTarget(blocksMs, editPoint.leftClipId, editPoint.rightClipId, playheadMs);
      if (rolled) commitActiveCompositionPatch({ editorVisualClips: rolled }, 'Roll edit point');
      return;
    }
    const trimmed = rippleTrimClipToTarget(blocksMs, selected.id, kind === 'ripple-in' ? 'in' : 'out', playheadMs);
    if (trimmed) commitActiveCompositionPatch({ editorVisualClips: trimmed }, kind === 'ripple-in' ? 'Ripple trim in' : 'Ripple trim out');
  };
  const performTrimEditRef = useRef(performTrimEdit);
  performTrimEditRef.current = performTrimEdit;

  // Motion comics: a bubble/caption is an editor ASSET + a timeline CLIP at the playhead —
  // clips inherit keyframes, opacity/position animation, transitions, and track rules.
  // (Stage objects are a migrated-away concept: a legacy effect converts them to assets.)
  const addComicStageObject = (kind: 'speech-bubble' | 'thought-bubble' | 'caption') => {
    if (!activeComposition) return;
    const asset = createEditorAsset('comic', { comicKind: kind });
    const defaults = asset.comicDefaults;
    const nextClip = createEditorVisualClip(asset.id, 'comic', {
      trackIndex: 0,
      startMs: Math.max(0, Math.round(timelineCursorSeconds * 1000)),
      durationSeconds: 4,
      comicKind: kind,
      comicTailAngleDeg: defaults?.tailAngleDeg,
      comicTailLengthPx: defaults?.tailLengthPx,
      comicLineHeightPercent: defaults?.lineHeightPercent,
      comicLetterSpacingPx: defaults?.letterSpacingPx,
      comicTextAlign: defaults?.textAlign,
      textContent: defaults?.text,
      textFontFamily: defaults?.fontFamily,
      textSizePx: defaults?.fontSizePx,
      textColor: defaults?.textColor,
      shapeFillColor: defaults?.fillColor,
      shapeBorderColor: defaults?.strokeColor,
      shapeBorderWidth: defaults?.strokeWidthPx,
      scalePercent: 40,
      positionX: -20,
      positionY: -20,
    });
    commitActiveCompositionPatch({
      editorAssets: [asset, ...compositionEditorAssets],
      editorVisualClips: [...visualClips, nextClip],
    }, kind === 'caption' ? 'Add caption' : kind === 'thought-bubble' ? 'Add thought bubble' : 'Add speech bubble');
    setSelectedVisualClipId(nextClip.id);
    setSelectedStageObjectId(undefined);
    recordActivityTrailWorkspaceEvent('editor', 'Add motion-comic element', kind, 'toolbar');
  };

  const markSourcePointRef = useRef(markSourcePoint);
  markSourcePointRef.current = markSourcePoint;
  const performThreePointEditRef = useRef(performThreePointEdit);
  performThreePointEditRef.current = performThreePointEdit;

  const updateVisualClips = useCallback((nextClips: EditorVisualClip[], label = 'Update visual clips') => {
    commitActiveCompositionPatch({ editorVisualClips: nextClips }, label);
  }, [commitActiveCompositionPatch]);

  const updateAudioClips = useCallback((nextClips: EditorAudioClip[], label = 'Update audio clips') => {
    commitActiveCompositionPatch({ editorAudioClips: nextClips }, label);
  }, [commitActiveCompositionPatch]);

  const updateActiveCompositionSettings = (patch: Record<string, unknown>) => {
    if (!activeComposition) {
      return;
    }

    commitActiveCompositionPatch(patch, 'Update composition settings');
  };

  const handleCreateComposition = () => {
    const compositionId = addNode('composition', getNewFlowNodePosition());
    patchNodeData(compositionId, {
      customTitle: 'Video Composition',
      editorAssets: [],
    });
    setActiveCompositionId(compositionId);
    recordActivityTrailWorkspaceEvent('editor', 'Create Video Composition', 'composition', 'toolbar');
  };

  // F10 starter template — creates a composition pre-set to a 1080p 16:9 sequence.
  const handleCreateStarterSequence = () => {
    const compositionId = addNode('composition', getNewFlowNodePosition());
    patchNodeData(compositionId, {
      customTitle: '1080p Sequence',
      editorAssets: [],
      aspectRatio: '16:9',
      videoResolution: '1080p',
    });
    setActiveCompositionId(compositionId);
    recordActivityTrailWorkspaceEvent('editor', 'Create 1080p starter sequence', 'composition', 'toolbar');
  };

  // F10 empty-state action — reveals the Source Library media panel so the user can add media.
  const handleRevealSourceBin = () => {
    setPanelVisibility('sourceBinVisible', true);
    setSourceBinTab('media');
  };

  const addEditorAsset = (kind: EditorAssetKind) => {
    const nextAsset = createEditorAsset(kind);
    if (!activeComposition) {
      const compositionId = addNode('composition', getNewFlowNodePosition());
      patchNodeData(compositionId, {
        customTitle: 'Video Composition',
        editorAssets: [nextAsset],
      });
      setActiveCompositionId(compositionId);
    } else {
      commitActiveCompositionPatch({
        editorAssets: [nextAsset, ...compositionEditorAssets],
      }, `Add ${kind} editor asset`);
    }
    setSourceBinTab('editorAssets');
    recordActivityTrailWorkspaceEvent('editor', 'Create Video editor asset', kind, 'toolbar');

    if (nextAsset.kind === 'text') {
      setTextEditDialog({
        mode: 'asset',
        targetId: nextAsset.id,
        title: 'Edit Text Asset',
        draft: buildTextDraftFromAsset(nextAsset),
      });
    }
  };

  const placeEditorAssetOnTrack = (asset: EditorAsset, trackIndex = 0) => {
    if (!activeComposition) {
      return;
    }

    const sourceKind =
      asset.kind === 'shape'
        ? 'shape'
        : asset.kind === 'image'
          ? 'image'
          : asset.kind === 'comic'
            ? 'comic'
            : 'text';
    const sourceNodeId = asset.kind === 'image' ? asset.imageSourceId ?? asset.id : asset.id;
    const nextClip = createEditorVisualClip(sourceNodeId, sourceKind, {
      trackIndex,
      startMs: getVisualTrackEndMs(visualBlocks, trackIndex),
      durationSeconds: 4,
      textContent: asset.textDefaults?.text,
      textFontFamily: asset.textDefaults?.fontFamily,
      textSizePx: asset.textDefaults?.fontSizePx,
      textColor: asset.textDefaults?.color,
      textEffect: asset.textDefaults?.textEffect,
      textBackgroundOpacityPercent: asset.textDefaults?.textBackgroundOpacityPercent,
      shapeFillColor: asset.shapeDefaults?.fillColor,
      shapeBorderColor: asset.shapeDefaults?.borderColor,
      shapeBorderWidth: asset.shapeDefaults?.borderWidth,
      shapeCornerRadius: asset.shapeDefaults?.cornerRadius,
    });

    commitActiveCompositionPatch({
      editorVisualClips: [...visualClips, nextClip],
    }, 'Place editor asset on timeline');
    setSelectedVisualClipId(nextClip.id);
    setSelectedAudioClipId(undefined);
    setSelectedStageObjectId(undefined);
    recordActivityTrailWorkspaceEvent('editor', 'Place editor asset on timeline', `V${trackIndex + 1}`, 'toolbar');
  };

  const updateStageObject = (objectId: string, patch: Partial<EditorStageObject>) => {
    if (!activeComposition) {
      return;
    }

    commitActiveCompositionPatch({
      editorStageObjects: stageObjects.map((object) =>
        object.id === objectId
          ? ({ ...object, ...patch } as EditorStageObject)
          : object,
      ),
    }, 'Update stage object');
  };

  const removeStageObject = (objectId: string) => {
    if (!activeComposition) {
      return;
    }

    commitActiveCompositionPatch({
      editorStageObjects: stageObjects.filter((object) => object.id !== objectId),
    }, 'Remove stage object');
    setSelectedStageObjectId(undefined);
  };

  const updateSelectedVisualClip = (patch: Partial<EditorVisualClip>) => {
    if (!selectedVisualClip) {
      return;
    }

    const progressPercent = selectedVisualDurationSeconds
      ? getVisualClipProgressPercent(selectedVisualClip, selectedVisualDurationSeconds, timelineCursorSeconds)
      : 0;

    updateVisualClips(
      visualClips.map((clip) =>
        clip.id === selectedVisualClip.id
          ? applyVisualClipPatchAtProgress(clip, progressPercent, patch)
          : clip,
      ),
    );
  };

  const updateVisualClipById = (clipId: string, patch: Partial<EditorVisualClip>) => {
    updateVisualClips(
      visualClips.map((clip) =>
        clip.id === clipId
          ? 'keyframes' in patch
            ? ensureVisualClipHasKeyframes({ ...clip, ...patch })
            : { ...clip, ...patch }
          : clip,
      ),
    );
  };

  const openTextAssetEditDialog = (asset: EditorAsset) => {
    if (asset.kind !== 'text') {
      return;
    }

    if (!compositionEditorAssets.some((candidate) => candidate.id === asset.id)) {
      commitActiveCompositionPatch({
        editorAssets: [asset, ...compositionEditorAssets],
      }, 'Materialize source text asset');
    }

    setContextMenu(null);
    setTextEditDialog({
      mode: 'asset',
      targetId: asset.id,
      title: 'Edit Text Asset',
      draft: buildTextDraftFromAsset(asset),
    });
  };

  const openTextClipEditDialog = (clip: EditorVisualClip) => {
    if (clip.sourceKind !== 'text') {
      return;
    }

    const sourceItem = sourceItemByNodeId.get(clip.sourceNodeId);
    const asset = editorAssetById.get(clip.sourceNodeId);

    setContextMenu(null);
    setTextEditDialog({
      mode: 'clip',
      targetId: clip.id,
      title: 'Edit Timeline Text',
      draft: buildTextDraftFromClip(clip, asset, sourceItem),
    });
  };

  const updateTextEditDraft = (patch: Partial<TextEditDraft>) => {
    setTextEditDialog((current) =>
      current
        ? {
            ...current,
            draft: { ...current.draft, ...patch },
          }
        : current,
    );
  };

  const saveTextEditDialog = () => {
    if (!textEditDialog || !activeComposition) {
      return;
    }

    const draft = normalizeTextEditDraft(textEditDialog.draft);

    if (textEditDialog.mode === 'asset') {
      commitActiveCompositionPatch({
        editorAssets: compositionEditorAssets.map((asset) =>
          asset.id === textEditDialog.targetId && asset.kind === 'text'
            ? {
                ...asset,
                label: buildTextAssetLabel(draft.text),
                updatedAt: Date.now(),
                textDefaults: {
                  text: draft.text,
                  fontFamily: draft.fontFamily,
                  fontSizePx: draft.fontSizePx,
                  color: draft.color,
                  textEffect: draft.textEffect,
                  textBackgroundOpacityPercent: 0,
                },
              }
            : asset,
        ),
      }, 'Edit text asset');
    } else {
      updateVisualClipById(textEditDialog.targetId, {
        textContent: draft.text,
        textFontFamily: draft.fontFamily,
        textSizePx: draft.fontSizePx,
        textColor: draft.color,
        textEffect: draft.textEffect,
        textBackgroundOpacityPercent: 0,
      });
    }

    setTextEditDialog(null);
  };

  const addVisualOpacityAutomationPoint = (clipId: string, point: TimelineAutomationPoint) => {
    const clip = visualClips.find((candidate) => candidate.id === clipId);

    if (!clip) {
      return;
    }

    updateVisualClips(
      visualClips.map((candidate) =>
        candidate.id === clipId
          ? upsertVisualKeyframe(candidate, point.timePercent, { opacityPercent: Math.round(point.valuePercent) })
          : candidate,
      ),
      'Add opacity keyframe',
    );
  };

  const updateVisualOpacityAutomationPoint = (
    clipId: string,
    pointIndex: number,
    point: TimelineAutomationPoint,
  ) => {
    const clip = visualClips.find((candidate) => candidate.id === clipId);

    if (!clip) {
      return;
    }

    const keyframes = normalizeVisualKeyframes(clip);

    if (!keyframes[pointIndex]) {
      return;
    }

    const nextKeyframes = keyframes.map((candidate, index) => {
      if (index !== pointIndex) {
        return candidate;
      }

      return {
        ...candidate,
        timePercent: index === 0 ? 0 : index === keyframes.length - 1 ? 100 : point.timePercent,
        opacityPercent: Math.round(point.valuePercent),
      };
    });

    updateVisualClips(
      visualClips.map((candidate) =>
        candidate.id === clipId
          ? ensureVisualClipHasKeyframes({ ...candidate, keyframes: nextKeyframes })
          : candidate,
      ),
      'Update opacity keyframe',
    );
  };

  const removeVisualOpacityAutomationPoint = (clipId: string, pointIndex: number) => {
    const clip = visualClips.find((candidate) => candidate.id === clipId);

    if (!clip) {
      return;
    }

    const keyframes = normalizeVisualKeyframes(clip);

    if (pointIndex <= 0 || pointIndex >= keyframes.length - 1) {
      return;
    }

    updateVisualClips(
      visualClips.map((candidate) =>
        candidate.id === clipId
          ? removeVisualKeyframe(candidate, pointIndex)
          : candidate,
      ),
      'Remove opacity keyframe',
    );
  };

  const updateSelectedAudioClip = (patch: Partial<EditorAudioClip>) => {
    if (!selectedAudioClip) {
      return;
    }

    updateAudioClips(
      audioClips.map((clip) => (clip.id === selectedAudioClip.id ? { ...clip, ...patch } : clip)),
    );
  };

  const updateAudioClipById = (clipId: string, patch: Partial<EditorAudioClip>) => {
    updateAudioClips(
      audioClips.map((clip) => (clip.id === clipId ? { ...clip, ...patch } : clip)),
    );
  };

  const updateAudioTrackVolume = (trackIndex: number, volumePercent: number) => {
    if (!activeComposition) {
      return;
    }

    const nextVolumes = [...audioTrackVolumes];
    nextVolumes[trackIndex] = Math.max(0, Math.min(100, Math.round(volumePercent)));
    commitActiveCompositionPatch({
      editorAudioTrackVolumes: nextVolumes,
    }, 'Update audio track volume');
  };

  const addAudioVolumeAutomationPoint = (clipId: string, point: TimelineAutomationPoint) => {
    const clip = audioClips.find((candidate) => candidate.id === clipId);

    if (!clip) {
      return;
    }

    updateAudioClipById(clipId, {
      volumeAutomationPoints: normalizeAutomationPoints(
        [...normalizeAutomationPoints(clip.volumeAutomationPoints, 100), point],
        100,
      ),
    });
  };

  const updateAudioVolumeAutomationPoint = (
    clipId: string,
    pointIndex: number,
    point: TimelineAutomationPoint,
  ) => {
    const clip = audioClips.find((candidate) => candidate.id === clipId);

    if (!clip) {
      return;
    }

    const normalizedPoints = normalizeAutomationPoints(clip.volumeAutomationPoints, 100);

    if (!normalizedPoints[pointIndex]) {
      return;
    }

    const nextPoints = normalizedPoints.map((candidate, index) => {
      if (index !== pointIndex) {
        return candidate;
      }

      return {
        timePercent:
          index === 0 ? 0 : index === normalizedPoints.length - 1 ? 100 : point.timePercent,
        valuePercent: point.valuePercent,
      };
    });

    updateAudioClipById(clipId, {
      volumeAutomationPoints: normalizeAutomationPoints(nextPoints, 100),
    });
  };

  const removeAudioVolumeAutomationPoint = (clipId: string, pointIndex: number) => {
    const clip = audioClips.find((candidate) => candidate.id === clipId);

    if (!clip) {
      return;
    }

    const normalizedPoints = normalizeAutomationPoints(clip.volumeAutomationPoints, 100);

    if (pointIndex <= 0 || pointIndex >= normalizedPoints.length - 1) {
      return;
    }

    updateAudioClipById(clipId, {
      volumeAutomationPoints: normalizeAutomationPoints(
        normalizedPoints.filter((_, index) => index !== pointIndex),
        100,
      ),
    });
  };

  const addOrUpdateKeyframeAtPlayhead = useCallback(() => {
    if (selectedVisualClip && selectedVisualDurationSeconds) {
      const progressPercent = getVisualClipProgressPercent(
        selectedVisualClip,
        selectedVisualDurationSeconds,
        timelineCursorSeconds,
      );
      const nextClip = upsertVisualKeyframe(selectedVisualClip, progressPercent);

      updateVisualClips(
        visualClips.map((clip) => (clip.id === selectedVisualClip.id ? nextClip : clip)),
        'Add visual keyframe',
      );
      return;
    }

    if (selectedAudioClip && selectedAudioDurationSeconds) {
      const progressPercent = getAudioClipProgressPercent(
        selectedAudioClip,
        selectedAudioDurationSeconds,
        timelineCursorSeconds,
      );
      const nextClip = upsertAudioKeyframe(selectedAudioClip, progressPercent);

      updateAudioClips(
        audioClips.map((clip) => (clip.id === selectedAudioClip.id ? nextClip : clip)),
        'Add volume keyframe',
      );
    }
  }, [
    audioClips,
    selectedAudioClip,
    selectedAudioDurationSeconds,
    selectedVisualClip,
    selectedVisualDurationSeconds,
    timelineCursorSeconds,
    updateAudioClips,
    updateVisualClips,
    visualClips,
  ]);

  const jumpToAdjacentSelectedKeyframe = useCallback((direction: 'previous' | 'next') => {
    if (selectedVisualClip && selectedVisualDurationSeconds) {
      const currentPercent = getVisualClipProgressPercent(
        selectedVisualClip,
        selectedVisualDurationSeconds,
        timelineCursorSeconds,
      );
      const targetPercent = getAdjacentKeyframePercent(
        getVisualKeyframePercents(selectedVisualClip),
        currentPercent,
        direction,
      );
      const targetSeconds = selectedVisualClip.startMs / 1000 + (targetPercent / 100) * selectedVisualDurationSeconds;

      setTimelineCursorSeconds(Math.max(0, Math.min(displayTimelineSecondsRef.current, targetSeconds)));
      return;
    }

    if (selectedAudioClip && selectedAudioDurationSeconds) {
      const currentPercent = getAudioClipProgressPercent(
        selectedAudioClip,
        selectedAudioDurationSeconds,
        timelineCursorSeconds,
      );
      const targetPercent = getAdjacentKeyframePercent(
        getAudioKeyframePercents(selectedAudioClip),
        currentPercent,
        direction,
      );
      const targetSeconds = selectedAudioClip.offsetMs / 1000 + (targetPercent / 100) * selectedAudioDurationSeconds;

      setTimelineCursorSeconds(Math.max(0, Math.min(displayTimelineSecondsRef.current, targetSeconds)));
    }
  }, [
    selectedAudioClip,
    selectedAudioDurationSeconds,
    selectedVisualClip,
    selectedVisualDurationSeconds,
    setTimelineCursorSeconds,
    timelineCursorSeconds,
  ]);

  const handleNativeMenuCommand = useCallback((command: NativeMenuCommand) => {
    const togglePanelId = VIDEO_PANEL_TOGGLE_COMMANDS[command];
    if (togglePanelId) {
      // Window > Panels toggle: hide a shown panel, restore a hidden one to docked
      // (same contract as the Image/Paper workspaces).
      const panels = useDockablePanelStore.getState();
      const key = panelKey(VIDEO_WORKSPACE_ID, togglePanelId);
      const mode = resolveDockablePanelMode(panels.layouts[key]?.mode, panels.defaults[key]?.mode);
      if (getDockablePanelToggleMode(mode) === 'hidden') {
        panels.hidePanel(VIDEO_WORKSPACE_ID, togglePanelId);
      } else {
        panels.setPanelMode(VIDEO_WORKSPACE_ID, togglePanelId, 'docked');
      }
      return;
    }
    if (command === 'editor:reset-panels') {
      // Full reset (legacy workspace snapshot + dockable layout) — the same behavior the old
      // floating "Reset Video Panels" pill performed before it was removed with the dead top band.
      resetVideoPanelLayout();
      return;
    }
    switch (command) {
      case 'edit:undo':
        undoEditor();
        return;
      case 'edit:redo':
        redoEditor();
        return;
      case 'edit:delete':
        if (selectedStageObjectId && activeComposition) {
          commitActiveCompositionPatch({
            editorStageObjects: stageObjects.filter((object) => object.id !== selectedStageObjectId),
          }, 'Remove stage object');
          setSelectedStageObjectId(undefined);
          return;
        }

        if (selectedVisualClipId && activeComposition) {
          commitActiveCompositionPatch({
            editorVisualClips: visualClips.filter((candidate) => candidate.id !== selectedVisualClipId),
          }, 'Remove visual clip');
          setSelectedVisualClipId(undefined);
          return;
        }

        if (selectedAudioClipId && activeComposition) {
          commitActiveCompositionPatch({
            editorAudioClips: audioClips.filter((candidate) => candidate.id !== selectedAudioClipId),
          }, 'Remove audio clip');
          setSelectedAudioClipId(undefined);
        }
        return;
      case 'timeline:select':
        setTimelineTool('select');
        return;
      case 'timeline:cut':
        if (!cutSelectedVisualClipAtPlayheadRef.current(false)) {
          setTimelineTool('cut');
        }
        return;
      case 'timeline:slip':
        setTimelineTool('slip');
        return;
      case 'timeline:hand':
        setTimelineTool('hand');
        return;
      case 'timeline:snap':
        setTimelineTool('snap');
        return;
      case 'timeline:add-keyframe':
        addOrUpdateKeyframeAtPlayhead();
        return;
      case 'timeline:previous-keyframe':
        jumpToAdjacentSelectedKeyframe('previous');
        return;
      case 'timeline:next-keyframe':
        jumpToAdjacentSelectedKeyframe('next');
        return;
      case 'help:keyboard-shortcuts':
        setHelpOpen(true);
        return;
      default:
        return;
    }
  }, [
    activeComposition,
    addOrUpdateKeyframeAtPlayhead,
    audioClips,
    commitActiveCompositionPatch,
    jumpToAdjacentSelectedKeyframe,
    redoEditor,
    selectedAudioClipId,
    selectedStageObjectId,
    selectedVisualClipId,
    setSelectedAudioClipId,
    setSelectedStageObjectId,
    setSelectedVisualClipId,
    setHelpOpen,
    setTimelineTool,
    stageObjects,
    undoEditor,
    visualClips,
  ]);

  useNativeMenuCommand(handleNativeMenuCommand, {
    commands: VIDEO_NATIVE_MENU_COMMANDS,
  });

  const updateSelectedVisualKeyframe = (
    keyframeIndex: number,
    patch: Parameters<typeof updateVisualKeyframe>[2],
  ) => {
    if (!selectedVisualClip) {
      return;
    }

    updateVisualClips(
      visualClips.map((clip) =>
        clip.id === selectedVisualClip.id
          ? updateVisualKeyframe(clip, keyframeIndex, patch)
          : clip,
      ),
      'Update visual keyframe',
    );
  };

  const removeSelectedVisualKeyframe = (keyframeIndex: number) => {
    if (!selectedVisualClip) {
      return;
    }

    updateVisualClips(
      visualClips.map((clip) =>
        clip.id === selectedVisualClip.id
          ? removeVisualKeyframe(clip, keyframeIndex)
          : clip,
      ),
      'Remove visual keyframe',
    );
  };

  const updateSelectedAudioKeyframe = (
    keyframeIndex: number,
    patch: Parameters<typeof updateAudioKeyframe>[2],
  ) => {
    if (!selectedAudioClip) {
      return;
    }

    updateAudioClips(
      audioClips.map((clip) =>
        clip.id === selectedAudioClip.id
          ? updateAudioKeyframe(clip, keyframeIndex, patch)
          : clip,
      ),
      'Update volume keyframe',
    );
  };

  const removeSelectedAudioKeyframe = (keyframeIndex: number) => {
    if (!selectedAudioClip) {
      return;
    }

    updateAudioClips(
      audioClips.map((clip) =>
        clip.id === selectedAudioClip.id
          ? removeAudioKeyframe(clip, keyframeIndex)
          : clip,
      ),
      'Remove volume keyframe',
    );
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableKeyboardTarget(event.target) || event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }

      if (event.key === '[') {
        event.preventDefault();
        jumpToAdjacentSelectedKeyframe('previous');
        return;
      }

      if (event.key === ']') {
        event.preventDefault();
        jumpToAdjacentSelectedKeyframe('next');
        return;
      }

      // Shift+K adds/updates a keyframe. Bare K became the JKL transport STOP (the NLE-standard
      // binding) — without the shift requirement, stopping the shuttle also dropped a keyframe.
      if (event.key.toLowerCase() === 'k' && event.shiftKey) {
        event.preventDefault();
        addOrUpdateKeyframeAtPlayhead();
      }
    };

    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [addOrUpdateKeyframeAtPlayhead, jumpToAdjacentSelectedKeyframe]);

  const snapTimelineInteractionSeconds = useCallback((seconds: number, shiftKey: boolean) =>
    resolveTimelineSnapSeconds(seconds, {
      // labeled markers snap like snap points do
      snapPoints: [...timelineSnapPoints, ...timelineMarkers.map((marker) => marker.seconds)],
      shiftKey,
      maxSeconds: displayTimelineSeconds,
    }), [displayTimelineSeconds, timelineMarkers, timelineSnapPoints]);

  const commitTimelineSnapPoints = (nextPoints: number[], label = 'Update timeline snap points') => {
    commitActiveCompositionPatch({ editorTimelineSnapPoints: nextPoints }, label);
  };

  const addTimelineMarkerAtPlayhead = () => {
    if (!activeComposition) return;
    commitActiveCompositionPatch(
      { editorTimelineMarkers: addTimelineMarker(timelineMarkers, timelineCursorSeconds) },
      'Add timeline marker',
    );
  };
  const addTimelineMarkerAtPlayheadRef = useRef(addTimelineMarkerAtPlayhead);
  addTimelineMarkerAtPlayheadRef.current = addTimelineMarkerAtPlayhead;

  const removeTimelineMarkerById = (markerId: string) => {
    if (!activeComposition) return;
    commitActiveCompositionPatch(
      { editorTimelineMarkers: removeTimelineMarker(timelineMarkers, markerId) },
      'Remove timeline marker',
    );
  };

  const addTimelineSnapAtSeconds = (seconds: number, shiftKey: boolean): number => {
    const nextPoints = addTimelineSnapPoint(timelineSnapPoints, seconds, shiftKey, displayTimelineSeconds);
    const snappedSeconds = resolveTimelineSnapSeconds(seconds, {
      snapPoints: nextPoints,
      shiftKey,
      maxSeconds: displayTimelineSeconds,
    });

    commitTimelineSnapPoints(nextPoints, 'Add timeline snap point');
    setTimelineCursorSeconds(snappedSeconds);
    return snappedSeconds;
  };

  const clearTimelineSnapPoints = () => {
    commitTimelineSnapPoints([], 'Clear timeline snap points');
  };

  const moveVisualClip = (clipId: string, nextStartSeconds: number, shiftKey = false) => {
    const snappedStartSeconds = snapTimelineInteractionSeconds(nextStartSeconds, shiftKey);

    updateVisualClips(
      visualClips.map((clip) =>
        clip.id === clipId
          ? { ...clip, startMs: Math.max(0, Math.round(snappedStartSeconds * 1000)) }
          : clip,
      ),
    );
  };

  const moveAudioClip = (clipId: string, nextStartSeconds: number, shiftKey = false) => {
    const snappedStartSeconds = snapTimelineInteractionSeconds(nextStartSeconds, shiftKey);

    updateAudioClips(
      audioClips.map((clip) =>
        clip.id === clipId
          ? { ...clip, offsetMs: Math.max(0, Math.round(snappedStartSeconds * 1000)) }
          : clip,
      ),
    );
  };

  const slipVisualClip = (clipId: string, deltaSeconds: number) => {
    const clip = visualClips.find((candidate) => candidate.id === clipId);

    if (!clip || (clip.sourceKind !== 'video' && clip.sourceKind !== 'composition')) {
      return;
    }

    const sourceItem = sourceItemByNodeId.get(clip.sourceNodeId);
    const sourceDurationSeconds = sourceItem ? (getSourceItemDurationSeconds(sourceItem, durationMap) ?? 0) : 0;

    if (sourceDurationSeconds <= 0) {
      return;
    }

    const sourceDurationMs = Math.max(250, Math.round(sourceDurationSeconds * 1000));
    const sourceRange = resolveVisualClipSourceRangeMs(clip, sourceDurationSeconds);
    const deltaMs = Math.round(deltaSeconds * 1000 * Math.max(0.25, clip.playbackRate || 1));
    const sourceWindowMs = Math.max(250, sourceRange.durationMs);
    const nextSourceInMs = Math.max(
      0,
      Math.min(sourceDurationMs - sourceWindowMs, sourceRange.sourceInMs + deltaMs),
    );
    const nextSourceOutMs = Math.min(sourceDurationMs, nextSourceInMs + sourceWindowMs);

    updateVisualClipById(clipId, {
      sourceInMs: nextSourceInMs,
      sourceOutMs: nextSourceOutMs,
      trimStartMs: nextSourceInMs,
      trimEndMs: Math.max(0, sourceDurationMs - nextSourceOutMs),
    });
  };

  // Alt-drag edge trims RIPPLE: later clips on the lane follow the length change. The lane fires
  // phase 'start' on pointerdown so every move recomputes from this snapshot (nothing compounds).
  const trimRippleBaseRef = useRef<EditorVisualClip[] | null>(null);

  const trimVisualClipFromEdge = (
    clip: EditorVisualClip,
    edge: TimelineClipEdge,
    deltaSeconds: number,
    shiftKey: boolean,
    options?: { altKey?: boolean; phase?: 'start' | 'move' },
  ) => {
    if (options?.phase === 'start') {
      trimRippleBaseRef.current = visualClips;
      return;
    }
    if (isVisualTrackLocked(clip.trackIndex)) return;
    const baseClips = trimRippleBaseRef.current ?? visualClips;
    const baseClip = baseClips.find((candidate) => candidate.id === clip.id) ?? clip;
    const sourceItem = sourceItemByNodeId.get(clip.sourceNodeId);
    const sourceDurationSeconds =
      sourceItem ? getSourceItemDurationSeconds(sourceItem, durationMap) ?? 0 : clip.durationSeconds ?? 4;
    const nextClip = trimVisualClipEdge(baseClip, {
      edge,
      deltaSeconds,
      sourceDurationSeconds: Math.max(0.25, sourceDurationSeconds),
      shiftKey,
    });

    if (!options?.altKey) {
      updateVisualClips(
        baseClips.map((candidate) => (candidate.id === clip.id ? nextClip : candidate)),
        'Trim visual clip edge',
      );
      return;
    }

    // RIPPLE: timeline length of a clip = still duration, or source window / playback rate.
    const lengthMs = (candidate: EditorVisualClip): number => {
      if (candidate.sourceOutMs === undefined && (candidate.sourceKind === 'image' || candidate.sourceKind === 'text' || candidate.sourceKind === 'shape')) {
        return Math.round((candidate.durationSeconds ?? 4) * 1000);
      }
      const rate = Math.max(0.25, candidate.playbackRate || 1);
      const inMs = candidate.sourceInMs ?? candidate.trimStartMs ?? 0;
      const outMs = candidate.sourceOutMs ?? Math.round(Math.max(0.25, sourceDurationSeconds) * 1000) - (candidate.trimEndMs ?? 0);
      return Math.round(Math.max(40, outMs - inMs) / rate);
    };
    const lengthDeltaMs = lengthMs(nextClip) - lengthMs(baseClip);
    // Ripple keeps the clip's own START anchored on both edges (the lib shifts startMs for
    // start-edge trims to keep the end fixed — ripple wants the opposite).
    const rippledClip = edge === 'start' ? { ...nextClip, startMs: baseClip.startMs } : nextClip;

    updateVisualClips(
      baseClips.map((candidate) => {
        if (candidate.id === clip.id) return rippledClip;
        if (candidate.trackIndex === baseClip.trackIndex && candidate.startMs > baseClip.startMs) {
          return { ...candidate, startMs: Math.max(0, candidate.startMs + lengthDeltaMs) };
        }
        return candidate;
      }),
      'Ripple trim visual clip edge',
    );
  };

  const fillVisualTimelineGap = (gap: TimelineGap) => {
    updateVisualClips(fillTimelineGap(visualClips, gap), 'Fill timeline gap');
    setSelectedTimelineGap(null);
    setContextMenu(null);
  };

  const startTimelineHandPan = (event: React.PointerEvent<HTMLElement> | React.MouseEvent<HTMLElement>) => {
    const container = timelineScrollRef.current;

    if (!container) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startY = event.clientY;
    const startScrollLeft = container.scrollLeft;
    const startScrollTop = container.scrollTop;

    const onMove = (moveEvent: PointerEvent) => {
      container.scrollLeft = startScrollLeft - (moveEvent.clientX - startX);
      container.scrollTop = startScrollTop - (moveEvent.clientY - startY);
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const startPanelResize = (
    event: React.PointerEvent<HTMLDivElement>,
    panel: 'inspectorWidth' | 'sourceBinWidth',
    invert = false,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startWidth = panel === 'inspectorWidth' ? inspectorWidth : sourceBinWidth;

    const onMove = (moveEvent: PointerEvent) => {
      const delta = invert ? startX - moveEvent.clientX : moveEvent.clientX - startX;
      setPanelWidth(panel, startWidth + delta);
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const startMonitorSplitResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const container = event.currentTarget.parentElement;

    if (!container) {
      return;
    }

    const bounds = container.getBoundingClientRect();

    const onMove = (moveEvent: PointerEvent) => {
      const nextPercent = ((moveEvent.clientX - bounds.left) / bounds.width) * 100;
      setMonitorSplitPercent(nextPercent);
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const startMonitorHeightResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const startY = event.clientY;
    const startHeight = monitorSectionHeight;

    const onMove = (moveEvent: PointerEvent) => {
      setMonitorSectionHeight(startHeight + (moveEvent.clientY - startY));
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const startTimelineTrackResize = (
    event: React.PointerEvent<HTMLElement>,
    trackType: 'visual' | 'audio',
  ) => {
    event.preventDefault();
    event.stopPropagation();

    const startY = event.clientY;
    const startHeight = trackType === 'visual' ? timelineVisualTrackHeight : timelineAudioTrackHeight;

    const onMove = (moveEvent: PointerEvent) => {
      setTimelineTrackHeight(trackType, resizeTimelineTrackHeight(startHeight, startY, moveEvent.clientY));
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const openSourceBinImportPicker = (accept: string) => {
    if (!importAcceptRef.current) {
      return;
    }

    importAcceptRef.current.accept = accept;
    importAcceptRef.current.value = '';
    importAcceptRef.current.click();
  };

  const importFilesForActiveBin = async (files: FileList) => {
    const fileList = Array.from(files);
    const imageFiles = fileList.filter((file) => inferSourceKindFromFile(file.name, file.type) === 'image');
    const captionFiles = fileList.filter((file) => inferSourceKindFromFile(file.name, file.type) === 'subtitle');
    const mediaFiles = fileList.filter((file) => {
      const kind = inferSourceKindFromFile(file.name, file.type);
      return kind !== 'image' && kind !== 'subtitle';
    });

    if (mediaFiles.length > 0) {
      await importFiles(mediaFiles);
    }

    if (captionFiles.length > 0) {
      const importedCaptionClips: EditorVisualClip[] = [];

      for (const file of captionFiles) {
        const text = await file.text();
        const cues = parseCaptionText(text, getCaptionFormatFromFileName(file.name));
        const libraryItem = await addAssetItem({
          label: file.name,
          kind: 'subtitle',
          mimeType: file.type || (file.name.toLowerCase().endsWith('.srt') ? 'application/x-subrip' : 'text/vtt'),
          dataUrl: await blobToDataUrl(file),
        });

        if (activeComposition && cues.length > 0) {
          importedCaptionClips.push(...captionCuesToTextClips(cues, {
            sourceNodeId: libraryItem.id,
            trackIndex: VISUAL_TRACK_COUNT - 1,
          }));
        }
      }

      if (activeComposition && importedCaptionClips.length > 0) {
        commitActiveCompositionPatch({
          editorVisualClips: [...visualClips, ...importedCaptionClips],
        }, 'Import caption clips');
      }
    }

    if (imageFiles.length === 0) {
      return;
    }

    if (!activeComposition) {
      await importFiles(imageFiles);
      return;
    }

    const importedImageAssets: EditorAsset[] = [];

    for (const file of imageFiles) {
      const libraryItem = await addAssetItem({
        label: file.name,
        kind: 'image',
        mimeType: file.type || 'image/png',
        dataUrl: await blobToDataUrl(file),
      });

      importedImageAssets.push(createEditorAsset('image', {
        label: libraryItem.label,
        imageSourceId: libraryItem.id,
      }));
    }

    if (importedImageAssets.length > 0) {
      commitActiveCompositionPatch({
        editorAssets: [...importedImageAssets, ...compositionEditorAssets],
      }, 'Import editor image assets');
      setSourceBinTab('editorAssets');
    }
  };

  const importPaperStoryboardPages = async () => {
    if (isImportingPaperStoryboardPages) {
      return;
    }

    if (paperDocument.pages.length === 0) {
      setPaperStoryboardImportStatus('No Paper pages are available.');
      return;
    }

    setIsImportingPaperStoryboardPages(true);
    setPaperStoryboardImportStatus(`Preparing ${paperDocument.pages.length} Paper page${paperDocument.pages.length === 1 ? '' : 's'}...`);

    try {
      const importedItemIds: string[] = [];

      for (const page of paperDocument.pages) {
        const payload = await buildPaperStoryboardPageSourcePayload(paperDocument, page.id);
        const libraryItem = await addAssetItem(payload);
        importedItemIds.push(libraryItem.id);
      }

      setSourceBinSearchQuery('');
      setSourceBinKindFilter('image');
      setSourceBinTab('editorAssets');
      if (importedItemIds[0]) {
        setSelectedSourceItemId(importedItemIds[0]);
      }
      setPaperStoryboardImportStatus(`Ready: ${importedItemIds.length} Paper page${importedItemIds.length === 1 ? '' : 's'} in Video assets.`);
    } catch (error) {
      setPaperStoryboardImportStatus(error instanceof Error ? error.message : 'Could not prepare Paper pages for Video.');
    } finally {
      setIsImportingPaperStoryboardPages(false);
    }
  };

  const sendSourceItemToFlow = (item: SourceBinItem) => {
    const position = getNewFlowNodePosition();
    const type = getFlowNodeTypeForSourceBinItem(item);
    const nodeId = addNode(type, position);
    const libraryItem = libraryItems.find((candidate) => candidate.id === item.id);
    patchNodeData(nodeId, buildFlowNodePatchForSourceBinItem({
      ...item,
      assetId: libraryItem?.assetId,
    }));

    setWorkspaceView('flow');
    setContextMenu(null);
  };

  const captureVideoFrameToFlow = async (video: HTMLVideoElement | null, label: string) => {
    if (!video) {
      return;
    }

    const frameBlob = await captureFrameFromVideoElement(video);
    const dataUrl = await blobToDataUrl(frameBlob);
    const libraryItem = await addAssetItem({
      label,
      kind: 'image',
      mimeType: 'image/png',
      dataUrl,
    });

    sendSourceItemToFlow(mapLibraryItemToEditorSourceItem(libraryItem));
  };

  const exportTimelineClipFrameToSourceBin = async (
    clip: EditorVisualClip,
    edge: TimelineClipFrameEdge,
  ) => {
    setContextMenu(null);

    const sourceItem = sourceItemByNodeId.get(clip.sourceNodeId);

    if (!sourceItem?.assetUrl || (sourceItem.kind !== 'video' && sourceItem.kind !== 'composition')) {
      await showAlertDialog({
        title: 'Frame Export Unavailable',
        message: 'This timeline clip does not have a video source frame to export.',
        tone: 'warning',
      });
      return;
    }

    const sourceDurationSeconds = getSourceItemDurationSeconds(sourceItem, durationMap) ?? 0;
    const targetTimeSeconds = getTimelineClipFrameExportTimeSeconds(clip, sourceDurationSeconds, edge);

    try {
      const frameBlob = await extractVideoFrameAtTime(sourceItem.assetUrl, targetTimeSeconds);
      const dataUrl = await blobToDataUrl(frameBlob);
      const libraryItem = await addAssetItem({
        label: buildTimelineClipFrameExportLabel(sourceItem.label, edge),
        kind: 'image',
        mimeType: 'image/png',
        dataUrl,
        sourceKey: `timeline-frame:${clip.id}:${edge}:${targetTimeSeconds.toFixed(3)}`,
        originNodeId: clip.sourceNodeId,
      });

      setSelectedSourceItemId(libraryItem.id);
    } catch (error) {
      await showAlertDialog({
        title: 'Frame Export Failed',
        message: error instanceof Error ? error.message : 'The timeline frame could not be exported.',
        tone: 'danger',
      });
    }
  };

  const commitSelectedImageCropAsAsset = async () => {
    if (!activeComposition || !selectedVisualClip || selectedVisualClip.sourceKind !== 'image') {
      return;
    }

    if (!selectedVisualBackingImageItem?.assetUrl) {
      await showAlertDialog({
        title: 'Crop Unavailable',
        message: 'This image clip does not have a local source image to crop.',
        tone: 'warning',
      });
      return;
    }

    try {
      const croppedDataUrl = await cropImageDataUrl({
        dataUrl: selectedVisualBackingImageItem.assetUrl,
        mimeType: 'image/png',
        cropLeftPercent: selectedVisualClip.cropLeftPercent,
        cropRightPercent: selectedVisualClip.cropRightPercent,
        cropTopPercent: selectedVisualClip.cropTopPercent,
        cropBottomPercent: selectedVisualClip.cropBottomPercent,
      });
      const libraryItem = await addAssetItem({
        label: `${selectedVisualBackingImageItem.label} crop`,
        kind: 'image',
        mimeType: 'image/png',
        dataUrl: croppedDataUrl,
        sourceKey: `image-crop:${selectedVisualBackingImageItem.id}:${selectedVisualClip.cropLeftPercent}:${selectedVisualClip.cropRightPercent}:${selectedVisualClip.cropTopPercent}:${selectedVisualClip.cropBottomPercent}`,
        originNodeId: selectedVisualClip.sourceNodeId,
      });
      const nextAsset = createEditorAsset('image', {
        label: libraryItem.label,
        imageSourceId: libraryItem.id,
      });

      commitActiveCompositionPatch({
        editorAssets: [nextAsset, ...compositionEditorAssets],
      }, 'Commit cropped image asset');
      setSourceBinTab('editorAssets');
    } catch (error) {
      await showAlertDialog({
        title: 'Image Crop Failed',
        message: error instanceof Error ? error.message : 'The image crop could not be committed.',
        tone: 'danger',
      });
    }
  };

  const generateNarrationForSelectedTextClip = async () => {
    if (!activeComposition || !selectedVisualClip || selectedVisualClip.sourceKind !== 'text') {
      return;
    }

    const narrationText = (
      selectedVisualClip.textContent ??
      selectedVisualSourceItem?.text ??
      selectedVisualEditorAsset?.textDefaults?.text ??
      ''
    ).trim();

    if (!narrationText) {
      await showAlertDialog({
        title: 'Narration Unavailable',
        message: 'This text clip is empty.',
        tone: 'warning',
      });
      return;
    }

    const settings = useSettingsStore.getState();
    const audioProvider = resolveEditorNarrationProvider(settings.apiKeys, settings.providerSettings.backendProxyEnabled);
    const audioNode = {
      id: `editor-narration-${Date.now()}`,
      type: 'audioGen',
      position: { x: 0, y: 0 },
      data: {
        mediaMode: 'generate',
        provider: audioProvider,
        modelId: settings.defaultModels.audio[audioProvider],
        voiceId: settings.providerSettings.elevenlabsVoiceId,
        geminiVoiceName: 'Kore',
        audioGenerationMode: 'speech',
      },
    } as AppNode;

    try {
      const execution = await executeNodeRequest(
        audioNode,
        {
          prompt: narrationText,
          config: DEFAULT_EXECUTION_CONFIG,
        },
        settings,
      );

      if (!execution.result.startsWith('data:')) {
        throw new Error('The narration provider returned a remote URL. Import the audio result manually or use a provider/proxy that returns a data URL.');
      }

      const libraryItem = await addAssetItem({
        label: buildNarrationAssetLabel(narrationText),
        kind: 'audio',
        mimeType: execution.result.startsWith('data:audio/wav') ? 'audio/wav' : 'audio/mpeg',
        dataUrl: execution.result,
        sourceKey: `editor-narration:${selectedVisualClip.id}:${narrationText}`,
        originNodeId: selectedVisualClip.sourceNodeId,
      });
      const nextClip = createEditorAudioClip(libraryItem.id, 0, {
        offsetMs: getAudioTrackEndMs(audioBlocks, 0),
      });

      updateAudioClips([...audioClips, nextClip], 'Generate narration audio');
      setSelectedAudioClipId(nextClip.id);
      setSelectedVisualClipId(undefined);
      setSourceBinTab('media');
    } catch (error) {
      await showAlertDialog({
        title: 'Narration Generation Failed',
        message: error instanceof Error ? error.message : 'Narration generation failed.',
        tone: 'danger',
      });
    }
  };

  const splitVisualClipAtSeconds = useCallback((clipId: string, splitSeconds: number, shiftKey = false) => {
    const clip = visualClips.find((candidate) => candidate.id === clipId);

    if (!clip) {
      return;
    }

    const clipDurationSeconds = resolveVisualClipDuration(clip, sourceItemByNodeId, durationMap);
    const clipStartSeconds = clip.startMs / 1000;
    const clipEndSeconds = clipStartSeconds + clipDurationSeconds;
    const snappedSplitSeconds = snapTimelineInteractionSeconds(splitSeconds, shiftKey);
    const normalizedSplitSeconds = Math.min(Math.max(snappedSplitSeconds, clipStartSeconds + 0.1), clipEndSeconds - 0.1);

    if (normalizedSplitSeconds <= clipStartSeconds || normalizedSplitSeconds >= clipEndSeconds) {
      return;
    }

    const sourceItem = sourceItemByNodeId.get(clip.sourceNodeId);
    const sourceDurationSeconds =
      clip.sourceKind === 'video' || clip.sourceKind === 'composition'
        ? sourceItem
          ? getSourceItemDurationSeconds(sourceItem, durationMap) ?? clipDurationSeconds
          : clipDurationSeconds
        : clipDurationSeconds;
    const [leftClip, rightClip] = splitVisualClipNonDestructively(
      clip,
      normalizedSplitSeconds,
      sourceDurationSeconds,
    );
    const nextClips: EditorVisualClip[] = [];

    for (const candidate of visualClips) {
      if (candidate.id !== clipId) {
        nextClips.push(candidate);
        continue;
      }

      nextClips.push(leftClip, { ...rightClip, id: createDerivedVisualClipId() });
    }

    updateVisualClips(nextClips);
    setContextMenu(null);
  }, [
    durationMap,
    snapTimelineInteractionSeconds,
    setContextMenu,
    sourceItemByNodeId,
    updateVisualClips,
    visualClips,
  ]);

  const splitSelectedVisualClipAtCursor = (clipId: string) => {
    splitVisualClipAtSeconds(clipId, timelineCursorSeconds);
  };

  const cutSelectedVisualClipAtPlayhead = useCallback((shiftKey = false) => {
    const splitSeconds = snapTimelineInteractionSeconds(timelineCursorSeconds, shiftKey);
    const target = getSelectedVisualClipCutTarget({
      clips: visualClips,
      selectedClipId: selectedVisualClipId,
      playheadSeconds: splitSeconds,
      resolveDurationSeconds: (clip) => resolveVisualClipDuration(clip, sourceItemByNodeId, durationMap),
    });

    if (!target) {
      return false;
    }

    splitVisualClipAtSeconds(target.clipId, target.splitSeconds, shiftKey);
    return true;
  }, [
    durationMap,
    selectedVisualClipId,
    sourceItemByNodeId,
    snapTimelineInteractionSeconds,
    splitVisualClipAtSeconds,
    timelineCursorSeconds,
    visualClips,
  ]);

  useEffect(() => {
    cutSelectedVisualClipAtPlayheadRef.current = cutSelectedVisualClipAtPlayhead;
  }, [cutSelectedVisualClipAtPlayhead]);

  const openVisualClipPropertyCopyDialog = (clip: EditorVisualClip, sourceLabel: string) => {
    setVisualClipPropertyDialog({
      clipId: clip.id,
      sourceLabel,
      selectedProperties: getDefaultVisualClipPropertySelection(),
    });
    setContextMenu(null);
  };

  const toggleVisualClipPropertySelection = (property: VisualClipCopiedProperty) => {
    setVisualClipPropertyDialog((current) => {
      if (!current) {
        return current;
      }

      const selectedProperties = current.selectedProperties.includes(property)
        ? current.selectedProperties.filter((candidate) => candidate !== property)
        : [...current.selectedProperties, property];

      return {
        ...current,
        selectedProperties,
      };
    });
  };

  const copySelectedVisualClipProperties = () => {
    if (!visualClipPropertyDialog || visualClipPropertyDialog.selectedProperties.length === 0) {
      return;
    }

    const clip = visualClips.find((candidate) => candidate.id === visualClipPropertyDialog.clipId);

    if (!clip) {
      setVisualClipPropertyDialog(null);
      return;
    }

    setVisualClipPropertyClipboard(
      copyVisualClipProperties(
        clip,
        visualClipPropertyDialog.selectedProperties,
        visualClipPropertyDialog.sourceLabel,
      ),
    );
    setVisualClipPropertyDialog(null);
  };

  const openVisualClipContextMenu = (id: string, event: React.MouseEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const clip = visualClips.find((candidate) => candidate.id === id);

    if (!clip) {
      return;
    }

    const item = sourceItemByNodeId.get(clip.sourceNodeId);
    const asset = editorAssetById.get(clip.sourceNodeId);
    const sourceLabel = item?.label ?? asset?.label ?? clip.sourceNodeId;
    const clipboard = visualClipPropertyClipboard;
    const menuItems: Array<{ label: string; action: () => void; tone?: 'danger' | 'default' }> = [];

    selectVisualClip(clip);

    if (clip.sourceKind === 'text') {
      menuItems.push({
        label: 'Edit Text...',
        action: () => openTextClipEditDialog(clip),
      });
    }

    if (clip.sourceKind === 'video' || clip.sourceKind === 'composition') {
      menuItems.push({
        label: 'Split Clip At Playhead',
        action: () => splitSelectedVisualClipAtCursor(clip.id),
      });
    }

    if (item && (item.kind === 'video' || item.kind === 'composition')) {
      menuItems.push(
        {
          label: 'Export First Frame To Source Bin',
          action: () => void exportTimelineClipFrameToSourceBin(clip, 'first'),
        },
        {
          label: 'Export Last Frame To Source Bin',
          action: () => void exportTimelineClipFrameToSourceBin(clip, 'last'),
        },
      );
    }

    if (item) {
      menuItems.push({
        label: 'Send Source To Flow Workspace',
        action: () => sendSourceItemToFlow(item),
      });
    }

    menuItems.push({
      label: 'Copy Selected Properties...',
      action: () => openVisualClipPropertyCopyDialog(clip, sourceLabel),
    });

    if (clipboard && clipboard.properties.length > 0) {
      const propertySummary = formatVisualClipPropertyList(clipboard.properties);
      const sourceSummary = clipboard.sourceLabel ? ` From ${clipboard.sourceLabel}` : '';

      menuItems.push(
        {
          label: `Paste ${propertySummary}${sourceSummary} To Start Keyframe`,
          action: () => {
            updateVisualClipById(clip.id, pasteVisualClipProperties(clip, clipboard, 'start'));
            setContextMenu(null);
          },
        },
        {
          label: `Paste ${propertySummary}${sourceSummary} To End Keyframe`,
          action: () => {
            updateVisualClipById(clip.id, pasteVisualClipProperties(clip, clipboard, 'end'));
            setContextMenu(null);
          },
        },
      );
    }

    menuItems.push({
      label: 'Remove From Cut',
      tone: 'danger',
      action: () => {
        updateVisualClips(visualClips.filter((candidate) => candidate.id !== id));
        setContextMenu(null);
      },
    });

    setContextMenu({ x: event.clientX, y: event.clientY, items: menuItems });
  };

  const openTimelineGapContextMenu = (gap: TimelineGap, event: React.MouseEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setSelectedTimelineGap(gap);
    clearTimelineSelection();
    setSelectedSourceItemId(undefined);
    setSelectedStageObjectId(undefined);
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      items: [
        {
          label: `Fill ${gap.durationSeconds.toFixed(1)}s Gap`,
          action: () => fillVisualTimelineGap(gap),
        },
      ],
    });
  };

  const openEditorAssetContextMenu = (asset: EditorAsset, event: React.MouseEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const menuItems: Array<{ label: string; action: () => void; tone?: 'danger' | 'default' }> = [];

    if (asset.kind === 'text') {
      menuItems.push({
        label: 'Edit Text Asset...',
        action: () => openTextAssetEditDialog(asset),
      });
    }

    for (let trackIndex = 0; trackIndex < VISUAL_TRACK_COUNT; trackIndex += 1) {
      menuItems.push({
        label: `Place On V${trackIndex + 1}`,
        action: () => {
          placeEditorAssetOnTrack(asset, trackIndex);
          setContextMenu(null);
        },
      });
    }

    setContextMenu({ x: event.clientX, y: event.clientY, items: menuItems });
  };

  const removeSourceLibraryItem = async (item: SourceBinItem) => {
    const confirmed = await useConfirmationStore.getState().requestConfirmation(
      `Remove "${item.label}" from this project's saved source library? Timeline clips that depend on it will also be removed.`,
      'Remove Asset'
    );

    if (!confirmed) {
      return;
    }

    removeSourceBinItem(item.id);
    removeEditorSourceReferences(item.nodeId);
  };

  const toggleMediaPoolCollapsed = (kind: SourceBinMediaPoolKind) => {
    setSourceBinMediaPoolCollapsed((prev) => ({ ...prev, [kind]: !prev[kind] }));
  };
  const renderMediaSourcePools = () => {
    const mediaPoolSections: Array<{ kind: SourceBinMediaPoolKind; title: string; icon: ReactNode; items: SourceBinItem[] }> = [
      { kind: 'image', title: 'Image Assets', icon: <ImageIcon size={13} />, items: mediaSourceItemsByPool.image },
      { kind: 'video', title: 'Video Assets', icon: <Film size={13} />, items: mediaSourceItemsByPool.video },
      { kind: 'audio', title: 'Audio Assets', icon: <Music2 size={13} />, items: mediaSourceItemsByPool.audio },
    ];

    if (!mediaSourceItems.length || !hasAnyMediaPoolItems) {
      return (
        <EmptyState
          body={
            timelineSourceItems.length > 0
              ? 'No source-library items match the current search and filter.'
              : 'Import media directly into the source bin or connect outputs into any source-bin node in the canvas to make them available here.'
          }
          title={timelineSourceItems.length > 0 ? 'No matching sources' : 'No saved project assets'}
        />
      );
    }

    return (
      <div className="space-y-2">
        {mediaPoolSections.map((section) => (
          section.items.length > 0 ? (
            <div className="overflow-hidden rounded-lg border border-gray-700/60 bg-[#111217]/45" key={section.kind}>
              <button
                className="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left text-xs font-semibold text-gray-200"
                onClick={() => toggleMediaPoolCollapsed(section.kind)}
                type="button"
              >
                <span className="flex items-center gap-2">
                  {section.icon}
                  {section.title}
                  <span className="text-[11px] text-gray-500">{section.items.length}</span>
                </span>
                {sourceBinMediaPoolCollapsed[section.kind]
                  ? <ChevronRight size={13} />
                  : <ChevronDown size={13} />}
              </button>
              {!sourceBinMediaPoolCollapsed[section.kind] ? (
                <div className="space-y-2 border-t border-gray-700/60 p-2">
                  {section.items.map((item) => (
                    <SourceItemCard
                      key={item.id}
                      durationSeconds={getSourceItemDurationSeconds(item, durationMap)}
                      isSelected={item.id === selectedSourceItem?.id}
                      item={item}
                      onAddAudio={(trackIndex) => addAudioClip(item, trackIndex)}
                      onAddVisual={(trackIndex) => addVisualClip(item, trackIndex)}
                      onOpenPreview={() => openSourceBinPreview(item)}
                      onRemove={() => removeSourceLibraryItem(item)}
                      onSelect={() => selectSourceItem(item.id)}
                      onToggleCollapsed={() => setSourceBinItemCollapsed(item.id, !item.collapsed)}
                      onToggleStarred={() => toggleSourceBinItemStarred(item.id)}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          ) : null
        ))}
      </div>
    );
  };

  const hasVisibleMonitors = sourceMonitorVisible || programMonitorVisible;
  const sourceEntryCount = sourceBinNodes.length;
  const isCompositionRendering = Boolean(activeComposition?.data.isRunning);
  const compositionRenderStatus = typeof activeComposition?.data.statusMessage === 'string'
    ? activeComposition.data.statusMessage
    : undefined;
  const compositionRenderError = typeof activeComposition?.data.error === 'string'
    ? activeComposition.data.error
    : undefined;
  const renderActiveComposition = () => {
    if (!activeComposition || isCompositionRendering) {
      return;
    }

    const canUseCachedComposition = Boolean(
      activeCompositionCachedResult
      && activeCompositionCachedRenderSignature === currentCompositionRenderCacheSignature,
    );
    const dirtyPlan = buildCurrentRenderDirtyPlan(
      canUseCachedComposition ? renderSegmentSignaturesRef.current : {},
    );
    const cacheAction = resolveVideoRenderCacheAction({
      dirtyPlan,
      cachedResultUrl: activeCompositionCachedResult,
      cacheInvalidationReason: activeCompositionCachedResult && !canUseCachedComposition
        ? 'composition inputs changed'
        : undefined,
    });
    const segmentReusePlan = canUseCachedComposition
      ? buildVideoRenderSegmentReusePlan({
        dirtyPlan,
        cachedArtifacts: activeCompositionSegmentArtifacts,
      })
      : undefined;
    const hasSegmentArtifactManifest = Object.keys(activeCompositionSegmentArtifacts).length > 0;
    const assemblyManifest = segmentReusePlan?.summary && hasSegmentArtifactManifest
      ? buildVideoRenderAssemblyManifest(segmentReusePlan)
      : undefined;
    const renderCacheSummary = cacheAction.kind === 'render'
      && dirtyPlan.dirtySegments.length > 0
      && hasSegmentArtifactManifest
      && segmentReusePlan?.summary
      ? segmentReusePlan.summary
      : cacheAction.summary;

    setIncrementalRenderSummary(renderCacheSummary);
    setProgramMonitorMode('rendered');

    if (cacheAction.kind === 'reuse-cache') {
      patchNodeData(activeComposition.id, {
        error: undefined,
        statusMessage: cacheAction.summary,
      });
      return;
    }

    patchNodeData(activeComposition.id, {
      editorRenderCacheAssemblyManifest: assemblyManifest,
      editorRenderCacheLastAssemblyManifest: undefined,
    });

    void runNode(activeComposition.id).then(() => {
      const latestComposition = useFlowStore
        .getState()
        .nodes
        .find((node) => node.id === activeComposition.id);
      const hasRenderedOutput = typeof latestComposition?.data.result === 'string'
        && latestComposition.data.result.length > 0;

      if (!latestComposition || latestComposition.data.error || !hasRenderedOutput) {
        return;
      }

      renderSegmentSignaturesRef.current = dirtyPlan.segmentSignatures;
      const renderCacheUpdatedAt = new Date().toISOString();
      const assemblyResult = normalizeVideoRenderAssemblyResult(latestComposition.data.resultOutputMetadata?.assemblyResult);
      patchNodeData(activeComposition.id, {
        editorRenderCacheCompositionSignature: currentCompositionRenderCacheSignature,
        editorRenderCacheSegmentSignatures: dirtyPlan.segmentSignatures,
        editorRenderCacheSegmentArtifacts: buildVideoRenderSegmentArtifactsForCompletedRender({
          reusePlan: segmentReusePlan,
          cachedArtifacts: activeCompositionSegmentArtifacts,
          segmentArtifacts: latestComposition.data.resultOutputMetadata?.segmentArtifacts,
          updatedAt: renderCacheUpdatedAt,
        }),
        editorRenderCacheAssemblyManifest: undefined,
        editorRenderCacheLastAssemblyManifest: assemblyManifest,
        editorRenderCacheLastAssemblyResult: assemblyResult,
        editorRenderCacheUpdatedAt: renderCacheUpdatedAt,
      });
    });
  };
  const exportTimelineCaptions = (format: 'srt' | 'vtt') => {
    const cues = textClipsToCaptionCues(visualClips);

    if (cues.length === 0) {
      return;
    }

    const mimeType = format === 'srt' ? 'application/x-subrip' : 'text/vtt';
    const body = format === 'srt' ? serializeSrtCaptions(cues) : serializeWebVttCaptions(cues);
    const objectUrl = URL.createObjectURL(new Blob([body], { type: mimeType }));

    void downloadAsset(
      objectUrl,
      buildDownloadFilename(`${EXPORT_BASENAME}-captions`, mimeType, format),
    ).finally(() => window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000));
  };
  const handleTimelineSourceDrop = (
    event: React.DragEvent<HTMLDivElement>,
    trackType: 'visual' | 'audio',
    trackIndex: number,
  ) => {
    const itemId = getDraggedSourceItemId(event.dataTransfer);

    if (!itemId) {
      return;
    }

    const item = sourceItemById.get(itemId);

    if (!item) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (trackType === 'visual') {
      if (canUseSourceItemAsVisual(item)) {
        addVisualClip(item, trackIndex);
      }
      return;
    }

    if (canUseSourceItemAsAudio(item)) {
      addAudioClip(item, trackIndex);
    }
  };

  const resetVideoPanelLayout = () => {
    restoreWorkspaceSnapshot({ workspaceView: 'editor' });
    resetWorkspacePanels(VIDEO_WORKSPACE_ID);
  };

  const videoPanelDefaults = buildVideoDockablePanelDefaults({
    sourceBinVisible,
    sourceMonitorVisible,
    programMonitorVisible,
    inspectorVisible,
    sourceBinWidth,
    inspectorWidth,
    monitorSplitPercent,
    monitorSectionHeight,
  });
  const videoPanelDefaultById = new Map(videoPanelDefaults.map((panel) => [panel.panelId, panel]));
  const withVideoPanelDefault = (
    panelId: keyof typeof VIDEO_PANEL_IDS,
    definition: Omit<DockablePanelDefinition, 'workspaceId' | 'panelId'>,
  ): DockablePanelDefinition => ({
    ...videoPanelDefaultById.get(VIDEO_PANEL_IDS[panelId])!,
    ...definition,
    panelId: VIDEO_PANEL_IDS[panelId],
    workspaceId: VIDEO_WORKSPACE_ID,
  });

  const videoPanels: DockablePanelDefinition[] = [
    withVideoPanelDefault('projectSourceBin', {
      title: 'Project Source Bin',
      allowedDockZones: ['left', 'right', 'center', 'overlay'],
      bodyClassName: 'overflow-hidden p-0',
      content: (
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
          <div className="border-b border-gray-700/60 px-3 py-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[13px] font-semibold text-gray-100">
                  <Archive size={14} />
                  Source Library
                </div>
                <div className="mt-1 truncate text-[11px] text-gray-500">
                  Mixed media, generated assets, captions, and reusable timeline elements.
                </div>
              </div>
              <div className="shrink-0 rounded-full border border-cyan-300/15 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-semibold text-cyan-100">
                {timelineSourceItems.length}
              </div>
            </div>
            <div className="mt-2 grid grid-cols-2 rounded-lg border border-gray-700/60 bg-[#0f131b] p-1">
              <button className={sourceBinTab === 'media' ? activeTabClassName : inactiveTabClassName} onClick={() => setSourceBinTab('media')} type="button">
                Library
              </button>
              <button className={sourceBinTab === 'editorAssets' ? activeTabClassName : inactiveTabClassName} onClick={() => setSourceBinTab('editorAssets')} type="button">
                Design Assets
              </button>
            </div>
            {sourceBinTab === 'media' ? (
              <div className="mt-2 flex items-center gap-2 rounded-lg border border-gray-700/60 bg-[#090d13] px-2 py-1.5 text-gray-300">
                <Search className="shrink-0 text-gray-500" size={13} />
                <input
                  className="min-w-0 flex-1 bg-transparent text-xs text-gray-100 outline-none placeholder:text-gray-600"
                  onChange={(event) => setSourceBinSearchQuery(event.target.value)}
                  placeholder="Search sources"
                  type="search"
                  value={sourceBinSearchQuery}
                />
              </div>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {sourceBinTab === 'media' ? (
                <>
                  <button className={smallEditorButtonClassName} onClick={() => openSourceBinImportPicker(EDITOR_MEDIA_IMPORT_ACCEPT)} type="button">
                    <Archive size={12} />
                    Import Media
                  </button>
                  <button className={smallEditorButtonClassName} onClick={() => openSourceBinImportPicker(EDITOR_VIDEO_IMPORT_ACCEPT)} type="button">
                    <Film size={12} />
                    Video
                  </button>
                  <button className={smallEditorButtonClassName} onClick={() => openSourceBinImportPicker(EDITOR_AUDIO_IMPORT_ACCEPT)} type="button">
                    <Music2 size={12} />
                    Audio
                  </button>
                  <button className={smallEditorButtonClassName} onClick={() => openSourceBinImportPicker(EDITOR_CAPTION_IMPORT_ACCEPT)} type="button">
                    <Type size={12} />
                    Captions
                  </button>
                </>
              ) : (
                <>
                  <button className={smallEditorButtonClassName} onClick={() => openSourceBinImportPicker(EDITOR_IMAGE_IMPORT_ACCEPT)} type="button">
                    <ImageIcon size={12} />
                    Image
                  </button>
                  <button className={smallEditorButtonClassName} onClick={() => addEditorAsset('text')} type="button">
                    <Type size={12} />
                    Text
                  </button>
                  <button className={smallEditorButtonClassName} onClick={() => addEditorAsset('shape')} type="button">
                    <Square size={12} />
                    Shape
                  </button>
                  <button
                    className={`${smallEditorButtonClassName} disabled:cursor-wait disabled:opacity-50`}
                    disabled={isImportingPaperStoryboardPages || paperStoryboardPageDescriptors.length === 0}
                    onClick={() => void importPaperStoryboardPages()}
                    type="button"
                  >
                    <BookOpen size={12} />
                    {isImportingPaperStoryboardPages ? 'Preparing' : 'Paper Pages'}
                  </button>
                </>
              )}
              <input
                className="hidden"
                multiple
                onChange={(event) => {
                  if (event.target.files?.length) {
                    void importFilesForActiveBin(event.target.files);
                  }
                }}
                ref={importAcceptRef}
                type="file"
              />
            </div>
            {sourceBinTab === 'editorAssets' && (paperStoryboardPageDescriptors.length > 0 || paperStoryboardImportStatus) ? (
              <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-indigo-300/15 bg-indigo-400/10 px-2 py-1.5 text-[11px] text-indigo-100">
                <span className="flex min-w-0 items-center gap-1.5">
                  <BookOpen className="shrink-0" size={12} />
                  <span className="truncate">
                    {paperStoryboardExistingItemIds.size} of {paperStoryboardPageDescriptors.length} Paper page{paperStoryboardPageDescriptors.length === 1 ? '' : 's'} available
                  </span>
                </span>
                {paperStoryboardImportStatus ? (
                  <span className="min-w-0 truncate text-indigo-100/75">{paperStoryboardImportStatus}</span>
                ) : null}
              </div>
            ) : null}
            {sourceBinTab === 'media' ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {SOURCE_BIN_KIND_FILTER_OPTIONS.map((option) => {
                  const count = sourceBinKindCounts[option.id];
                  const isActive = sourceBinKindFilter === option.id;

                  if (option.id !== 'all' && count === 0) {
                    return null;
                  }

                  return (
                    <button
                      className={`${sourceBinFilterButtonClassName} ${
                        isActive
                          ? 'border-cyan-300/50 bg-cyan-400/15 text-cyan-50'
                          : 'border-gray-700/60 bg-[#0f131b] text-gray-400 hover:border-gray-500 hover:text-white'
                      }`}
                      key={option.id}
                      onClick={() => setSourceBinKindFilter(option.id)}
                      type="button"
                    >
                      {option.label} {count}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-700/60 px-3 py-2 text-[11px] text-gray-400">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span>{sourceEntryCount} entry node{sourceEntryCount === 1 ? '' : 's'}</span>
              <span>
                {sourceBinTab === 'media'
                  ? `${mediaSourceItems.length} of ${timelineSourceItems.length} source${timelineSourceItems.length === 1 ? '' : 's'}`
                  : `${editorAssets.length} editor asset${editorAssets.length === 1 ? '' : 's'}`}
              </span>
            </div>
            {sourceBinTab === 'media' && mediaSourceItems.length > 0 ? (
              <div className="flex items-center gap-1">
                <button
                  className={miniTrackButtonClassName}
                  onClick={() => setSourceBinMediaPoolCollapsed({ image: true, video: true, audio: true })}
                  type="button"
                >
                  Hide Pools
                </button>
                <button
                  className={miniTrackButtonClassName}
                  onClick={() => setSourceBinMediaPoolCollapsed({ image: false, video: false, audio: false })}
                  type="button"
                >
                  Show Pools
                </button>
                <button className={miniTrackButtonClassName} onClick={() => setAllSourceBinItemsCollapsed(true)} type="button">
                  Collapse All
                </button>
                <button className={miniTrackButtonClassName} onClick={() => setAllSourceBinItemsCollapsed(false)} type="button">
                  Expand All
                </button>
              </div>
            ) : null}
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
            {sourceBinTab === 'media' ? (
              mediaSourceItems.length > 0 ? (
                renderMediaSourcePools()
              ) : (
                <EmptyState
                  body={
                    timelineSourceItems.length > 0
                      ? 'No source-library items match the current search and filter.'
                      : 'Import media directly into the source bin or connect outputs into any source-bin node in the canvas to make them available here.'
                  }
                  title={timelineSourceItems.length > 0 ? 'No matching sources' : 'No saved project assets'}
                />
              )
            ) : editorAssets.length > 0 ? (
              editorAssets.map((asset) => (
                <EditorAssetCard
                  asset={asset}
                  key={asset.id}
                  onOpenContextMenu={(event) => openEditorAssetContextMenu(asset, event)}
                  onPlace={(trackIndex) => placeEditorAssetOnTrack(asset, trackIndex)}
                  previewSourceItem={asset.kind === 'image' && asset.imageSourceId ? sourceItemByNodeId.get(asset.imageSourceId) : undefined}
                />
              ))
            ) : (
              <EmptyState body="Create text and shape assets or import image assets here, then place them on visual tracks like normal clips." title="No editor assets" />
            )}
          </div>
        </div>
      ),
    }),
    withVideoPanelDefault('sourceMonitor', {
      title: 'Source Monitor',
      centerDockPresentation: 'split',
      allowedDockZones: ['top', 'left', 'right', 'center', 'overlay'],
      bodyClassName: 'overflow-hidden p-0',
      content: (
        <div className="h-full min-h-0">
          <SourceMonitorPanel
            item={selectedSourceItem}
            marks={selectedSourceItem && sourceMarks?.itemId === selectedSourceItem.id ? sourceMarks : undefined}
            mediaInfo={selectedSourceItem ? mediaInfoMap[selectedSourceItem.id] : undefined}
            onAddAudio={addAudioClip}
            onAddVisual={addVisualClip}
            onMarkIn={() => markSourcePoint('in')}
            onMarkOut={() => markSourcePoint('out')}
            onInsertEdit={() => performThreePointEdit('insert')}
            onOverwriteEdit={() => performThreePointEdit('overwrite')}
            onOpenContextMenu={(event) => {
              event.preventDefault();
              const menuItems: Array<{ label: string; action: () => void; tone?: 'danger' | 'default' }> = [];
              if (selectedSourceItem) {
                menuItems.push({ label: 'Send Source To Flow Workspace', action: () => sendSourceItemToFlow(selectedSourceItem) });
              }
              if (selectedSourceItem && (selectedSourceItem.kind === 'video' || selectedSourceItem.kind === 'composition')) {
                menuItems.push({ label: 'Capture Current Frame To Flow', action: () => void captureVideoFrameToFlow(sourceMonitorVideoRef.current, `${selectedSourceItem.label}-frame`) });
              }
              if (menuItems.length > 0) setContextMenu({ x: event.clientX, y: event.clientY, items: menuItems });
            }}
            sourceDurationSeconds={getSourceItemDurationSeconds(selectedSourceItem, durationMap)}
            videoRef={sourceMonitorVideoRef}
          />
        </div>
      ),
    }),
    withVideoPanelDefault('programMonitor', {
      title: 'Program Monitor',
      centerDockPresentation: 'split',
      allowedDockZones: ['center', 'top', 'left', 'right', 'overlay'],
      bodyClassName: 'overflow-hidden p-0',
      content: (
        <div className="h-full min-h-0">
          <ProgramMonitorPanel
            activeTool={timelineTool}
            aspectRatio={compositionAspectRatio}
            audioClipCount={audioClips.length}
            canvas={programCanvas}
            errorMessage={compositionRenderError}
            exportReadiness={exportReadiness}
            incrementalRenderSummary={incrementalRenderSummary}
            isRunning={isCompositionRendering}
            onAddEditorAsset={addEditorAsset}
            onAddComicStageObject={addComicStageObject}
            renderStatusMessage={compositionRenderStatus ?? incrementalRenderSummary}
            renderBackendStatus={renderBackendStatus}
            renderCacheDetailLines={renderCacheDetailLines}
            hasActiveComposition={Boolean(activeComposition)}
            onCreateComposition={handleCreateComposition}
            onCreateStarterSequence={handleCreateStarterSequence}
            onRevealSourceBin={handleRevealSourceBin}
            onAspectRatioChange={(aspectRatio) => updateActiveCompositionSettings({ aspectRatio })}
            onOpenClipContextMenu={openVisualClipContextMenu}
            onOpenContextMenu={(event) => {
              event.preventDefault();
              const menuItems: Array<{ label: string; action: () => void; tone?: 'danger' | 'default' }> = [];
              if (previewUrl && !isProgramImageSequenceOutput) {
                const exportPreset = getVideoExportPresetOption(exportPresetPlan.presetId);
                menuItems.push({
                  label: 'Send Program Video To Flow Workspace',
                  action: () => sendSourceItemToFlow({
                    id: `program-${activeComposition?.id ?? 'preview'}`,
                    nodeId: activeComposition?.id ?? `program-${Date.now()}`,
                    kind: 'video',
                    label: activeComposition?.data.modelId ?? 'Program render',
                    assetUrl: previewUrl,
                    mimeType: exportPreset.mimeType,
                  }),
                });
                menuItems.push({ label: 'Capture Current Frame To Flow', action: () => void captureVideoFrameToFlow(programMonitorVideoRef.current, 'program-frame') });
              }
              if (menuItems.length > 0) setContextMenu({ x: event.clientX, y: event.clientY, items: menuItems });
            }}
            onResolutionChange={(videoResolution) => updateActiveCompositionSettings({ videoResolution })}
            onFrameRateChange={(videoFrameRate) => updateActiveCompositionSettings({ videoFrameRate })}
            onExportPresetPlanChange={(presetId) => updateActiveCompositionSettings({ editorExportPresetPlan: { ...exportPresetPlan, presetId } })}
            hasCaptionCues={textClipsToCaptionCues(visualClips).length > 0}
            onExportCaptions={exportTimelineCaptions}
            onRun={renderActiveComposition}
            onSelectClip={(clipId) => {
              const clip = visualClips.find((candidate) => candidate.id === clipId);
              if (clip) selectVisualClip(clip);
            }}
            onSelectStageObject={selectStageObject}
            onSetMonitorMode={setProgramMonitorMode}
            onUpdateClip={updateVisualClipById}
            onUpdateStageObject={updateStageObject}
            previewUrl={previewUrl}
            previewOutputMetadata={previewOutputMetadata}
            selectedClip={selectedVisualClip}
            selectedStageObject={selectedStageObject}
            exportPresetPlan={exportPresetPlan}
            monitorParityNotices={monitorParityNotices}
            parityDiagnostics={parityDiagnostics}
            sequenceSummary={sequenceSummary}
            stageClips={programStageClips}
            stageObjects={stageObjects}
            stageMode={programMonitorMode}
            videoRef={programMonitorVideoRef}
            videoResolution={compositionResolution}
            frameRate={compositionFrameRate}
            visualClipCount={visualClips.length}
          />
        </div>
      ),
    }),
    withVideoPanelDefault('timeline', {
      title: 'Timeline',
      allowedDockZones: ['bottom', 'center', 'top', 'overlay'],
      bodyClassName: 'overflow-hidden p-0',
      content: (
        <SequencerTimelinePanel
          activeComposition={activeComposition}
          addAudioVolumeAutomationPoint={addAudioVolumeAutomationPoint}
          addOrUpdateKeyframeAtPlayhead={addOrUpdateKeyframeAtPlayhead}
          addTimelineSnapAtSeconds={addTimelineSnapAtSeconds}
          addVisualOpacityAutomationPoint={addVisualOpacityAutomationPoint}
          audioBlocks={audioBlocks}
          audioClips={audioClips}
          audioTrackVolumes={audioTrackVolumes}
          audioWaveformMap={audioWaveformMap}
          canKeyframeSelectedClip={canKeyframeSelectedClip}
          clearTimelineSelection={clearTimelineSelection}
          clearTimelineSnapPoints={clearTimelineSnapPoints}
          clipEdgePreviewMap={clipEdgePreviewMap}
          displayTimelineSeconds={displayTimelineSeconds}
          handleTimelineSourceDrop={handleTimelineSourceDrop}
          jumpToAdjacentSelectedKeyframe={jumpToAdjacentSelectedKeyframe}
          onCutSelectedVisualClipAtPlayhead={cutSelectedVisualClipAtPlayhead}
          onOpenTimelineGapContextMenu={openTimelineGapContextMenu}
          onOpenAudioClipContextMenu={(id, event) => {
            event.preventDefault();
            const item = sourceItemByNodeId.get(audioClips.find((candidate) => candidate.id === id)?.sourceNodeId ?? '');
            const menuItems: Array<{ label: string; action: () => void; tone?: 'danger' | 'default' }> = [];

            if (item) {
              menuItems.push({ label: 'Send Source To Flow Workspace', action: () => sendSourceItemToFlow(item) });
            }

            // Fades write onto the clip's volume automation (renders through the shipped path).
            const clipBlock = audioBlocks.find((candidate) => candidate.clip.id === id);
            if (clipBlock && clipBlock.durationSeconds > 0) {
              const fadeSeconds = Math.min(0.5, clipBlock.durationSeconds / 4);
              const fadePercent = (fadeSeconds / clipBlock.durationSeconds) * 100;
              const patchFade = (direction: 'in' | 'out') => {
                updateAudioClips(
                  audioClips.map((candidate) =>
                    candidate.id === id
                      ? { ...candidate, volumeAutomationPoints: applyAudioFade(candidate.volumeAutomationPoints, direction, fadePercent) }
                      : candidate,
                  ),
                  direction === 'in' ? 'Audio fade in' : 'Audio fade out',
                );
                setContextMenu(null);
              };
              menuItems.push({ label: `Fade In (${fadeSeconds.toFixed(1)}s)`, action: () => patchFade('in') });
              menuItems.push({ label: `Fade Out (${fadeSeconds.toFixed(1)}s)`, action: () => patchFade('out') });

              // Crossfade with the previous overlapping clip on the same lane.
              const previous = audioBlocks
                .filter((candidate) => candidate.clip.trackIndex === clipBlock.clip.trackIndex
                  && candidate.clip.id !== id
                  && candidate.startSeconds < clipBlock.startSeconds)
                .sort((a, b) => b.startSeconds - a.startSeconds)[0];
              const crossfade = previous ? resolveCrossfadePercents(previous, clipBlock) : null;
              if (previous && crossfade) {
                menuItems.push({
                  label: `Crossfade With Previous Clip (${crossfade.overlapSeconds.toFixed(1)}s overlap)`,
                  action: () => {
                    updateAudioClips(
                      audioClips.map((candidate) => {
                        if (candidate.id === previous.clip.id) {
                          return { ...candidate, volumeAutomationPoints: applyAudioFade(candidate.volumeAutomationPoints, 'out', crossfade.aFadeOutPercent) };
                        }
                        if (candidate.id === id) {
                          return { ...candidate, volumeAutomationPoints: applyAudioFade(candidate.volumeAutomationPoints, 'in', crossfade.bFadeInPercent) };
                        }
                        return candidate;
                      }),
                      'Audio crossfade',
                    );
                    setContextMenu(null);
                  },
                });
              }
            }

            menuItems.push({
              label: 'Remove From Lane',
              tone: 'danger',
              action: () => {
                updateAudioClips(audioClips.filter((candidate) => candidate.id !== id));
                setContextMenu(null);
              },
            });

            setContextMenu({ x: event.clientX, y: event.clientY, items: menuItems });
          }}
          onOpenVisualClipContextMenu={openVisualClipContextMenu}
          onSelectAudioClip={selectAudioClip}
          onSelectVisualClip={selectVisualClip}
          onSetSelectedSourceItemId={setSelectedSourceItemId}
          onSetSelectedStageObjectId={setSelectedStageObjectId}
          onSetSelectedTimelineGap={setSelectedTimelineGap}
          onSetTimelineCursorSeconds={setTimelineCursorSeconds}
          onSetTimelineTool={setTimelineToolWithActivity}
          onSetTimelineZoomPercent={setTimelineZoomPercent}
          onSetTrackHeight={setTimelineTrackHeight}
          onStartTimelineHandPan={startTimelineHandPan}
          onStartTimelineTrackResize={startTimelineTrackResize}
          onUpdateAudioTrackVolume={updateAudioTrackVolume}
          removeAudioVolumeAutomationPoint={removeAudioVolumeAutomationPoint}
          removeVisualOpacityAutomationPoint={removeVisualOpacityAutomationPoint}
          secondMarkers={secondMarkers}
          selectedAudioClip={selectedAudioClip}
          selectedTimelineGap={selectedTimelineGap}
          selectedVisualClip={selectedVisualClip}
          sequenceDurationSeconds={sequenceDurationSeconds}
          shuttleRate={shuttleRate}
          timelineMarkers={timelineMarkers}
          onJumpToMarker={(seconds) => setTimelineCursorSeconds(seconds)}
          onRemoveMarker={removeTimelineMarkerById}
          isVisualTrackLockedProp={isVisualTrackLocked}
          isAudioTrackLockedProp={isAudioTrackLocked}
          onToggleVisualTrackLock={toggleVisualTrackLock}
          onToggleAudioTrackLock={toggleAudioTrackLock}
          isVisualTrackCollapsedProp={isVisualTrackCollapsed}
          isAudioTrackCollapsedProp={isAudioTrackCollapsed}
          onToggleVisualTrackCollapse={toggleVisualTrackCollapse}
          onToggleAudioTrackCollapse={toggleAudioTrackCollapse}
          snapTimelineInteractionSeconds={snapTimelineInteractionSeconds}
          timelineAudioTrackHeight={timelineAudioTrackHeight}
          timelineCursorSeconds={timelineCursorSeconds}
          timelineScrollRef={timelineScrollRef}
          timelineSnapPoints={timelineSnapPoints}
          timelineTool={timelineTool}
          timelineVisualTrackHeight={timelineVisualTrackHeight}
          timelineZoomPercent={timelineZoomPercent}
          updateAudioVolumeAutomationPoint={updateAudioVolumeAutomationPoint}
          updateVisualOpacityAutomationPoint={updateVisualOpacityAutomationPoint}
          visualBlocks={visualBlocks}
          visualClips={visualClips}
          visualGapsByTrack={visualGapsByTrack}
          moveAudioClip={moveAudioClip}
          moveVisualClip={moveVisualClip}
          splitVisualClipAtSeconds={splitVisualClipAtSeconds}
          slipVisualClip={slipVisualClip}
          trimVisualClipFromEdge={trimVisualClipFromEdge}
        />
      ),
    }),
    withVideoPanelDefault('inspector', {
      title: 'Inspector',
      allowedDockZones: ['right', 'left', 'center', 'overlay'],
      content: (
        <InspectorPanel
          audioClip={selectedAudioClip}
          audioTrackVolumes={audioTrackVolumes}
          audioSourceItem={selectedAudioClip ? sourceItemByNodeId.get(selectedAudioClip.sourceNodeId) : undefined}
          onMoveAudioToTrack={(trackIndex) => updateSelectedAudioClip({ trackIndex })}
          onMoveVisualToTrack={(trackIndex) => updateSelectedVisualClip({ trackIndex })}
          onEditVisualText={openTextClipEditDialog}
          onRemoveAudioClip={() => {
            if (!selectedAudioClip) return;
            updateAudioClips(audioClips.filter((clip) => clip.id !== selectedAudioClip.id));
            setSelectedAudioClipId(undefined);
          }}
          onRemoveStageObject={() => {
            if (selectedStageObject) removeStageObject(selectedStageObject.id);
          }}
          onRemoveVisualClip={() => {
            if (!selectedVisualClip) return;
            updateVisualClips(visualClips.filter((clip) => clip.id !== selectedVisualClip.id));
            setSelectedVisualClipId(undefined);
          }}
          onSelectSource={() => {
            if (selectedSourceItem) selectSourceItem(selectedSourceItem.id);
          }}
          onUpdateAudioClip={updateSelectedAudioClip}
          onAddOrUpdateKeyframe={addOrUpdateKeyframeAtPlayhead}
          onCommitVisualCropAsImageAsset={() => void commitSelectedImageCropAsAsset()}
          onGenerateNarrationFromText={() => void generateNarrationForSelectedTextClip()}
          onUpdateStageObject={(patch) => {
            if (selectedStageObject) updateStageObject(selectedStageObject.id, patch);
          }}
          onUpdateVisualClip={updateSelectedVisualClip}
          onJumpKeyframe={jumpToAdjacentSelectedKeyframe}
          onRemoveAudioKeyframe={removeSelectedAudioKeyframe}
          onRemoveVisualKeyframe={removeSelectedVisualKeyframe}
          onUpdateAudioKeyframe={updateSelectedAudioKeyframe}
          onUpdateVisualKeyframe={updateSelectedVisualKeyframe}
          selectedStageObject={selectedStageObject}
          selectedSourceItem={selectedSourceItem}
          sequenceDurationSeconds={sequenceDurationSeconds}
          timelineCursorSeconds={timelineCursorSeconds}
          visualEditorAsset={selectedVisualEditorAsset}
          visualClip={selectedVisualClip}
          audioDurationSeconds={selectedAudioDurationSeconds}
          visualDurationSeconds={selectedVisualDurationSeconds}
          visualBackingImageItem={selectedVisualBackingImageItem}
          visualSourceDurationSeconds={selectedVisualSourceDurationSeconds}
          visualSourceItem={selectedVisualSourceItem}
        />
      ),
    }),
    withVideoPanelDefault('premiereParity', {
      title: 'Export Readiness',
      allowedDockZones: ['left', 'right', 'bottom', 'overlay'],
      content: <VideoPremiereParityPanel />,
    }),
    withVideoPanelDefault('sequenceSettings', {
      title: 'Sequence',
      allowedDockZones: ['right', 'left', 'top', 'overlay'],
      content: (
        <SequenceSettingsPanel
          aspectRatio={compositionAspectRatio}
          frameRate={compositionFrameRate}
          onAspectRatioChange={(aspectRatio) => updateActiveCompositionSettings({ aspectRatio })}
          onFrameRateChange={(videoFrameRate) => updateActiveCompositionSettings({ videoFrameRate })}
          onResolutionChange={(videoResolution) => updateActiveCompositionSettings({ videoResolution })}
          sequenceSummary={sequenceSummary}
          videoResolution={compositionResolution}
        />
      ),
    }),
    withVideoPanelDefault('exportPreset', {
      title: 'Export',
      allowedDockZones: ['right', 'left', 'bottom', 'overlay'],
      content: (
        <ExportPresetPanel
          exportPresetPlan={exportPresetPlan}
          hasCaptionCues={textClipsToCaptionCues(visualClips).length > 0}
          onExportCaptions={exportTimelineCaptions}
          onExportPresetPlanChange={(presetId) => updateActiveCompositionSettings({ editorExportPresetPlan: { ...exportPresetPlan, presetId } })}
        />
      ),
    }),
    withVideoPanelDefault('diagnostics', {
      title: 'Diagnostics',
      allowedDockZones: ['right', 'left', 'bottom', 'overlay'],
      content: <ParityDiagnosticsPanel diagnostics={parityDiagnostics} />,
    }),
  ];
  const renderLegacyVideoFallback = false;
  const mobilePhoneInterface = useMobilePhoneInterfaceDescriptor();
  const mobileChromeMode = useMobileInterfaceStore((state) => state.chromeMode);
  const workspaceChromePaddingClassName = mobilePhoneInterface.enabled
    ? mobileChromeMode === 'hidden'
      ? mobilePhoneInterface.hiddenTopPaddingClassName
      : mobilePhoneInterface.collapsedTopPaddingClassName
    // Desktop: the shared top bar is in-flow (the workspace mounts below it), so pt-16 here was a
    // 64px dead band trapped under the menu bar — the same dead padding already removed from the
    // Image and Paper workspaces. pt-3 keeps the gutter symmetric with px-3/pb-3.
    : 'pt-3';

  if (mobilePhoneInterface.enabled) {
    // Phone: a multi-pane desktop NLE can't fit, so render the dedicated tabbed mobile
    // shell over the same panel contents. Desktop layout below is left untouched.
    return (
      <div
        className={`absolute inset-0 z-30 bg-[radial-gradient(circle_at_top,#182236_0%,#0b0e14_45%,#06080d_100%)] px-2 pb-2 ${workspaceChromePaddingClassName}`}
      >
        <VideoWorkspaceMobileShell panels={videoPanels} previewPanelId={VIDEO_PANEL_IDS.programMonitor} />
      </div>
    );
  }

  return (
    <div className={`absolute inset-0 z-30 bg-[radial-gradient(circle_at_top,#182236_0%,#0b0e14_45%,#06080d_100%)] px-3 pb-3 ${workspaceChromePaddingClassName}`}>
      {/* The old floating "Reset Video Panels" pill lived in the (now removed) dead band and would
          cover the Inspector's header; the action lives in Window > Panels > Reset Video Panels. */}
      <DockablePanelHost className="h-full" panels={videoPanels} workspaceId={VIDEO_WORKSPACE_ID}>
        {renderLegacyVideoFallback ? (
        <section className="flex h-full min-h-0 gap-3">
          {sourceBinVisible ? (
            <>
              <aside className={`${panelClassName} flex min-h-0 shrink-0 flex-col overflow-hidden`} style={{ width: sourceBinWidth }}>
                <div className="border-b border-gray-700/60 px-3 py-2.5">
                  <div className="flex items-center gap-2 text-[13px] font-semibold text-gray-100">
                    <Archive size={14} />
                    Project Source Bin
                  </div>
                  <div className="mt-1 text-[11px] text-gray-500">
                    Switch between source media and reusable editor assets for timeline compositing.
                  </div>
                  <div className="mt-2 grid grid-cols-2 rounded-lg border border-gray-700/60 bg-[#0f131b] p-1">
                    <button
                      className={sourceBinTab === 'media' ? activeTabClassName : inactiveTabClassName}
                      onClick={() => setSourceBinTab('media')}
                      type="button"
                    >
                      Media
                    </button>
                    <button
                      className={sourceBinTab === 'editorAssets' ? activeTabClassName : inactiveTabClassName}
                      onClick={() => setSourceBinTab('editorAssets')}
                      type="button"
                    >
                      Video Assets
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {sourceBinTab === 'media' ? (
                      <>
                        <button
                          className={smallEditorButtonClassName}
                          onClick={() => openSourceBinImportPicker(EDITOR_MEDIA_IMPORT_ACCEPT)}
                          type="button"
                        >
                          <Archive size={12} />
                          Import Media
                        </button>
                        <button
                          className={smallEditorButtonClassName}
                          onClick={() => openSourceBinImportPicker(EDITOR_VIDEO_IMPORT_ACCEPT)}
                          type="button"
                        >
                          <Film size={12} />
                          Video
                        </button>
                        <button
                          className={smallEditorButtonClassName}
                          onClick={() => openSourceBinImportPicker(EDITOR_AUDIO_IMPORT_ACCEPT)}
                          type="button"
                        >
                          <Music2 size={12} />
                          Audio
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className={smallEditorButtonClassName}
                          onClick={() => openSourceBinImportPicker(EDITOR_IMAGE_IMPORT_ACCEPT)}
                          type="button"
                        >
                          <ImageIcon size={12} />
                          Image
                        </button>
                        <button
                          className={smallEditorButtonClassName}
                          onClick={() => addEditorAsset('text')}
                          type="button"
                        >
                          <Type size={12} />
                          Text
                        </button>
                        <button
                          className={smallEditorButtonClassName}
                          onClick={() => addEditorAsset('shape')}
                          type="button"
                        >
                          <Square size={12} />
                          Shape
                        </button>
                        <button
                          className={`${smallEditorButtonClassName} disabled:cursor-wait disabled:opacity-50`}
                          disabled={isImportingPaperStoryboardPages || paperStoryboardPageDescriptors.length === 0}
                          onClick={() => void importPaperStoryboardPages()}
                          type="button"
                        >
                          <BookOpen size={12} />
                          {isImportingPaperStoryboardPages ? 'Preparing' : 'Paper Pages'}
                        </button>
                      </>
                    )}
                    <input
                      className="hidden"
                      multiple
                      onChange={(event) => {
                        if (event.target.files?.length) {
                          void importFilesForActiveBin(event.target.files);
                        }
                      }}
                      ref={importAcceptRef}
                      type="file"
                    />
                  </div>
                  {sourceBinTab === 'editorAssets' && (paperStoryboardPageDescriptors.length > 0 || paperStoryboardImportStatus) ? (
                    <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-indigo-300/15 bg-indigo-400/10 px-2 py-1.5 text-[11px] text-indigo-100">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <BookOpen className="shrink-0" size={12} />
                        <span className="truncate">
                          {paperStoryboardExistingItemIds.size} of {paperStoryboardPageDescriptors.length} Paper page{paperStoryboardPageDescriptors.length === 1 ? '' : 's'} available
                        </span>
                      </span>
                      {paperStoryboardImportStatus ? (
                        <span className="min-w-0 truncate text-indigo-100/75">{paperStoryboardImportStatus}</span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-700/60 px-3 py-2 text-[11px] text-gray-400">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span>{sourceEntryCount} entry node{sourceEntryCount === 1 ? '' : 's'}</span>
                    <span>
                      {sourceBinTab === 'media'
                        ? `${mediaSourceItems.length} media asset${mediaSourceItems.length === 1 ? '' : 's'}`
                        : `${editorAssets.length} editor asset${editorAssets.length === 1 ? '' : 's'}`}
                    </span>
                  </div>
                  {sourceBinTab === 'media' && mediaSourceItems.length > 0 ? (
                    <div className="flex items-center gap-1">
                      <button
                        className={miniTrackButtonClassName}
                        onClick={() => setSourceBinMediaPoolCollapsed({ image: true, video: true, audio: true })}
                        type="button"
                      >
                        Hide Pools
                      </button>
                      <button
                        className={miniTrackButtonClassName}
                        onClick={() => setSourceBinMediaPoolCollapsed({ image: false, video: false, audio: false })}
                        type="button"
                      >
                        Show Pools
                      </button>
                      <button
                        className={miniTrackButtonClassName}
                        onClick={() => setAllSourceBinItemsCollapsed(true)}
                        type="button"
                      >
                        Collapse All
                      </button>
                      <button
                        className={miniTrackButtonClassName}
                        onClick={() => setAllSourceBinItemsCollapsed(false)}
                        type="button"
                      >
                        Expand All
                      </button>
                    </div>
                  ) : null}
                </div>
                <VideoPremiereParityPanel />
                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
                  {sourceBinTab === 'media' ? (
                    mediaSourceItems.length > 0 ? (
                      renderMediaSourcePools()
                    ) : (
                      <EmptyState
                        body="Import media directly into the source bin or connect outputs into any source-bin node in the canvas to make them available here."
                        title="No saved project assets"
                      />
                    )
                  ) : editorAssets.length > 0 ? (
                    editorAssets.map((asset) => (
                      <EditorAssetCard
                        asset={asset}
                        key={asset.id}
                        onOpenContextMenu={(event) => openEditorAssetContextMenu(asset, event)}
                        onPlace={(trackIndex) => placeEditorAssetOnTrack(asset, trackIndex)}
                        previewSourceItem={
                          asset.kind === 'image' && asset.imageSourceId
                            ? sourceItemByNodeId.get(asset.imageSourceId)
                            : undefined
                        }
                      />
                    ))
                  ) : (
                    <EmptyState
                      body="Create text and shape assets or import image assets here, then place them on visual tracks like normal clips."
                      title="No editor assets"
                    />
                  )}
                </div>
              </aside>
              <ResizeHandle onPointerDown={(event) => startPanelResize(event, 'sourceBinWidth')} />
            </>
          ) : null}

          <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
            {hasVisibleMonitors ? (
              <div className="min-h-0 shrink-0" style={{ height: monitorSectionHeight }}>
                <div className="flex h-full min-h-0 gap-2">
                  {sourceMonitorVisible ? (
                    <div
                      className={programMonitorVisible ? 'h-full min-w-0 shrink-0' : 'h-full min-w-0 flex-1'}
                      style={programMonitorVisible ? { width: `${monitorSplitPercent}%` } : undefined}
                    >
                      <SourceMonitorPanel
                        item={selectedSourceItem}
                        marks={selectedSourceItem && sourceMarks?.itemId === selectedSourceItem.id ? sourceMarks : undefined}
                        mediaInfo={selectedSourceItem ? mediaInfoMap[selectedSourceItem.id] : undefined}
                        onAddAudio={addAudioClip}
                        onAddVisual={addVisualClip}
                        onMarkIn={() => markSourcePoint('in')}
                        onMarkOut={() => markSourcePoint('out')}
                        onInsertEdit={() => performThreePointEdit('insert')}
                        onOverwriteEdit={() => performThreePointEdit('overwrite')}
                        onOpenContextMenu={(event) => {
                          event.preventDefault();

                          const menuItems: Array<{ label: string; action: () => void; tone?: 'danger' | 'default' }> = [];

                          if (selectedSourceItem) {
                            menuItems.push({
                              label: 'Send Source To Flow Workspace',
                              action: () => sendSourceItemToFlow(selectedSourceItem),
                            });
                          }

                          if (selectedSourceItem && (selectedSourceItem.kind === 'video' || selectedSourceItem.kind === 'composition')) {
                            menuItems.push({
                              label: 'Capture Current Frame To Flow',
                              action: () => void captureVideoFrameToFlow(sourceMonitorVideoRef.current, `${selectedSourceItem.label}-frame`),
                            });
                          }

                          if (menuItems.length > 0) {
                            setContextMenu({ x: event.clientX, y: event.clientY, items: menuItems });
                          }
                        }}
                        sourceDurationSeconds={getSourceItemDurationSeconds(selectedSourceItem, durationMap)}
                        videoRef={sourceMonitorVideoRef}
                      />
                    </div>
                  ) : null}

                  {sourceMonitorVisible && programMonitorVisible ? (
                    <ResizeHandle onPointerDown={startMonitorSplitResize} />
                  ) : null}

                  {programMonitorVisible ? (
                    <div className="h-full min-w-0 flex-1">
                      <ProgramMonitorPanel
                        activeTool={timelineTool}
                        aspectRatio={compositionAspectRatio}
                        audioClipCount={audioClips.length}
                        canvas={programCanvas}
                        errorMessage={compositionRenderError}
                        exportReadiness={exportReadiness}
                        incrementalRenderSummary={incrementalRenderSummary}
                        isRunning={isCompositionRendering}
                        onAddEditorAsset={addEditorAsset}
                        onAddComicStageObject={addComicStageObject}
                        renderStatusMessage={compositionRenderStatus ?? incrementalRenderSummary}
                        renderBackendStatus={renderBackendStatus}
                        renderCacheDetailLines={renderCacheDetailLines}
                        hasActiveComposition={Boolean(activeComposition)}
                        onCreateComposition={handleCreateComposition}
                        onCreateStarterSequence={handleCreateStarterSequence}
                        onRevealSourceBin={handleRevealSourceBin}
                        onAspectRatioChange={(aspectRatio) =>
                          updateActiveCompositionSettings({ aspectRatio })
                        }
                        onOpenClipContextMenu={openVisualClipContextMenu}
                        onOpenContextMenu={(event) => {
                          event.preventDefault();

                          const menuItems: Array<{ label: string; action: () => void; tone?: 'danger' | 'default' }> = [];

                          if (previewUrl && !isProgramImageSequenceOutput) {
                            const exportPreset = getVideoExportPresetOption(exportPresetPlan.presetId);
                            menuItems.push({
                              label: 'Send Program Video To Flow Workspace',
                              action: () =>
                                sendSourceItemToFlow({
                                  id: `program-${activeComposition?.id ?? 'preview'}`,
                                  nodeId: activeComposition?.id ?? `program-${Date.now()}`,
                                   kind: 'video',
                                   label: activeComposition?.data.modelId ?? 'Program render',
                                   assetUrl: previewUrl,
                                   mimeType: exportPreset.mimeType,
                                 }),
                            });
                            menuItems.push({
                              label: 'Capture Current Frame To Flow',
                              action: () => void captureVideoFrameToFlow(programMonitorVideoRef.current, 'program-frame'),
                            });
                          }

                          if (menuItems.length > 0) {
                            setContextMenu({ x: event.clientX, y: event.clientY, items: menuItems });
                          }
                        }}
                        onResolutionChange={(videoResolution) =>
                          updateActiveCompositionSettings({ videoResolution })
                        }
                        onFrameRateChange={(videoFrameRate) =>
                          updateActiveCompositionSettings({ videoFrameRate })
                        }
                        onExportPresetPlanChange={(presetId) =>
                          updateActiveCompositionSettings({
                            editorExportPresetPlan: {
                              ...exportPresetPlan,
                              presetId,
                            },
                          })
                        }
                        hasCaptionCues={textClipsToCaptionCues(visualClips).length > 0}
                        onExportCaptions={exportTimelineCaptions}
                        onRun={renderActiveComposition}
                        onSelectClip={(clipId) => {
                          const clip = visualClips.find((candidate) => candidate.id === clipId);
                          if (clip) {
                            selectVisualClip(clip);
                          }
                        }}
                        onSelectStageObject={selectStageObject}
                        onSetMonitorMode={setProgramMonitorMode}
                        onUpdateClip={updateVisualClipById}
                        onUpdateStageObject={updateStageObject}
                        previewUrl={previewUrl}
                        previewOutputMetadata={previewOutputMetadata}
                        selectedClip={selectedVisualClip}
                        selectedStageObject={selectedStageObject}
                        exportPresetPlan={exportPresetPlan}
                        monitorParityNotices={monitorParityNotices}
                        parityDiagnostics={parityDiagnostics}
                        sequenceSummary={sequenceSummary}
                        stageClips={programStageClips}
                        stageObjects={stageObjects}
                        stageMode={programMonitorMode}
                        videoRef={programMonitorVideoRef}
                        videoResolution={compositionResolution}
                        frameRate={compositionFrameRate}
                        visualClipCount={visualClips.length}
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {hasVisibleMonitors ? (
              <ResizeHandle onPointerDown={startMonitorHeightResize} orientation="horizontal" />
            ) : null}

            <section className={`${panelClassName} min-h-0 min-w-0 flex-1 overflow-hidden`}>
              <div className="border-b border-gray-700/60 px-3 py-2">
                <div className="flex items-center gap-2 text-[13px] font-semibold text-gray-100">
                  <Film size={14} />
                  Sequencer Timeline
                </div>
              </div>
              <div className="border-b border-gray-700/60 px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[13px] font-semibold text-gray-100">Timeline</div>
                    <div className="mt-0.5 text-[11px] text-gray-500">
                      Visual clips and audio clips live on independent timed lanes. Use the tool strip for select vs cut, drag clips for rough placement, then use the inspector and program stage for precise timing and framing.
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <ToolToggleButton
                      active={timelineTool === 'select'}
                      icon={<MousePointer2 size={12} />}
                      label="Select"
                      onClick={() => setTimelineToolWithActivity('select', 'toolbar')}
                    />
                    <ToolToggleButton
                      active={timelineTool === 'cut'}
                      icon={<Scissors size={12} />}
                      label="Cut"
                      onClick={() => {
                        if (!cutSelectedVisualClipAtPlayhead()) {
                          setTimelineToolWithActivity('cut', 'toolbar');
                        }
                      }}
                    />
                    <ToolToggleButton
                      active={timelineTool === 'slip'}
                      icon={<Film size={12} />}
                      label="Slip"
                      onClick={() => setTimelineToolWithActivity('slip', 'toolbar')}
                    />
                    <ToolToggleButton
                      active={timelineTool === 'hand'}
                      icon={<Archive size={12} />}
                      label="Hand"
                      onClick={() => setTimelineToolWithActivity('hand', 'toolbar')}
                    />
                    <ToolToggleButton
                      active={timelineTool === 'snap'}
                      icon={<Plus size={12} />}
                      label="Snap"
                      onClick={() => setTimelineToolWithActivity('snap', 'toolbar')}
                    />
                    <button
                      className="inline-flex items-center gap-1.5 rounded-full border border-gray-700/60 bg-[#111217]/70 px-3 py-1 text-xs font-semibold text-gray-200 transition-colors hover:border-gray-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={!canKeyframeSelectedClip}
                      onClick={() => jumpToAdjacentSelectedKeyframe('previous')}
                      title="Jump to previous keyframe ([)"
                      type="button"
                    >
                      <ChevronLeft size={12} />
                      Key
                    </button>
                    <button
                      className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/30 bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-100 transition-colors hover:border-cyan-200/70 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={!canKeyframeSelectedClip}
                      onClick={addOrUpdateKeyframeAtPlayhead}
                      title="Add or update a keyframe at the playhead (K)"
                      type="button"
                    >
                      <Diamond size={12} />
                      Add Key
                    </button>
                    <button
                      className="inline-flex items-center gap-1.5 rounded-full border border-gray-700/60 bg-[#111217]/70 px-3 py-1 text-xs font-semibold text-gray-200 transition-colors hover:border-gray-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={!canKeyframeSelectedClip}
                      onClick={() => jumpToAdjacentSelectedKeyframe('next')}
                      title="Jump to next keyframe (])"
                      type="button"
                    >
                      Key
                      <ChevronRight size={12} />
                    </button>
                    {timelineSnapPoints.length > 0 ? (
                      <button
                        className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-100 transition-colors hover:border-cyan-200/70 hover:text-white"
                        onClick={clearTimelineSnapPoints}
                        type="button"
                      >
                        Clear {timelineSnapPoints.length} snap{timelineSnapPoints.length === 1 ? '' : 's'}
                      </button>
                    ) : null}
                    <label className="flex items-center gap-2 rounded-full border border-gray-700/60 bg-[#111217]/45 px-3 py-1 text-xs text-gray-300">
                      <span>Zoom</span>
                      <input
                        className="w-24"
                        max={300}
                        min={100}
                        onChange={(event) => setTimelineZoomPercent(Number(event.target.value))}
                        step={10}
                        type="range"
                        value={timelineZoomPercent}
                      />
                      <span>{timelineZoomPercent}%</span>
                    </label>
                    <label className="flex items-center gap-2 rounded-full border border-gray-700/60 bg-[#111217]/45 px-3 py-1 text-xs text-gray-300">
                      <span>V H</span>
                      <input
                        className="w-20"
                        max={180}
                        min={60}
                        onChange={(event) => setTimelineTrackHeight('visual', Number(event.target.value))}
                        step={4}
                        type="range"
                        value={timelineVisualTrackHeight}
                      />
                      <span>{timelineVisualTrackHeight}</span>
                    </label>
                    <label className="flex items-center gap-2 rounded-full border border-gray-700/60 bg-[#111217]/45 px-3 py-1 text-xs text-gray-300">
                      <span>A H</span>
                      <input
                        className="w-20"
                        max={180}
                        min={44}
                        onChange={(event) => setTimelineTrackHeight('audio', Number(event.target.value))}
                        step={4}
                        type="range"
                        value={timelineAudioTrackHeight}
                      />
                      <span>{timelineAudioTrackHeight}</span>
                    </label>
                    <button
                      className="rounded-full border border-gray-700/60 bg-[#111217]/45 px-3 py-1 text-xs text-gray-300 transition-colors hover:border-gray-500 hover:text-white"
                      onClick={() => {
                        setTimelineZoomPercent(100);
                        setTimelineTrackHeight('visual', 84);
                        setTimelineTrackHeight('audio', 64);
                        timelineScrollRef.current?.scrollTo({ left: 0 });
                      }}
                      type="button"
                    >
                      Zoom To Fit
                    </button>
                    <div className="rounded-full border border-gray-700/60 bg-[#111217]/45 px-3 py-1 text-xs text-gray-300">
                      {sequenceDurationSeconds > 0 ? `${sequenceDurationSeconds.toFixed(1)}s cut` : 'No clips yet'}
                    </div>
                    <div
                      className={`rounded-full border px-3 py-1 font-mono text-xs ${shuttleRate === 0 ? 'border-gray-700/60 bg-[#111217]/45 text-gray-500' : 'border-emerald-300/45 bg-emerald-400/10 text-emerald-200'}`}
                      data-video-transport-rate={shuttleRate}
                      title="J/K/L shuttle · Space play/pause · Home/End to sequence bounds"
                    >
                      {shuttleRate === 0 ? '⏸ JKL' : shuttleRate > 0 ? `▶ ${shuttleRate}×` : `◀ ${Math.abs(shuttleRate)}×`}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)]">
                <div className="border-b border-gray-700/60 px-2.5 py-2">
                  <div className="overflow-x-auto">
                    <div className="grid min-w-full grid-cols-[96px_minmax(0,1fr)] gap-2" style={{ width: `${timelineZoomPercent}%` }}>
                      <div />
                      <div className="relative h-8 overflow-hidden rounded-md border border-gray-700/60 bg-[#203847]">
                        <button
                          className="absolute inset-0 z-10 h-full w-full cursor-pointer bg-transparent"
                          onClick={(event) => {
                            if (timelineTool === 'hand') {
                              return;
                            }
                            const bounds = event.currentTarget.getBoundingClientRect();
                            const ratio = (event.clientX - bounds.left) / bounds.width;
                            const timelineSeconds = Math.max(0, Math.min(displayTimelineSeconds, ratio * displayTimelineSeconds));

                            if (timelineTool === 'snap') {
                              addTimelineSnapAtSeconds(timelineSeconds, event.shiftKey);
                              return;
                            }

                            setTimelineCursorSeconds(snapTimelineInteractionSeconds(timelineSeconds, event.shiftKey));
                          }}
                          onPointerDown={(event) => {
                            if (timelineTool === 'hand') {
                              startTimelineHandPan(event);
                            }
                          }}
                          type="button"
                        />
                        {secondMarkers.map((second) => (
                          <div
                            key={second}
                            className="absolute bottom-0 top-0 border-l border-gray-700/50"
                            style={{ left: `${(second / displayTimelineSeconds) * 100}%` }}
                          >
                            <span className="absolute left-1 top-0.5 text-[9px] text-gray-400">{second}s</span>
                          </div>
                        ))}
                        {timelineSnapPoints.map((snapSecond) => (
                          <div
                            key={`snap-${snapSecond}`}
                            className="pointer-events-none absolute bottom-0 top-0 z-20 border-l-2 border-cyan-200/80"
                            style={{ left: `${(snapSecond / displayTimelineSeconds) * 100}%` }}
                          >
                            <span className="absolute left-1 top-4 rounded bg-cyan-950/80 px-1 text-[9px] font-semibold text-cyan-100">
                              {snapSecond.toFixed(snapSecond % 1 === 0 ? 0 : 1)}s
                            </span>
                          </div>
                        ))}
                        {timelineMarkers.map((marker) => (
                          <button
                            key={marker.id}
                            className="absolute bottom-0 top-0 z-30 w-2 -translate-x-1/2 cursor-pointer bg-transparent"
                            onClick={(event) => {
                              event.stopPropagation();
                              if (event.altKey) { removeTimelineMarkerById(marker.id); return; }
                              setTimelineCursorSeconds(marker.seconds);
                            }}
                            style={{ left: `${(marker.seconds / displayTimelineSeconds) * 100}%` }}
                            title={`${marker.label} · ${marker.seconds.toFixed(1)}s — click to jump, Alt-click to remove`}
                            type="button"
                          >
                            <span className="absolute left-1/2 top-0 h-2.5 w-2.5 -translate-x-1/2 rotate-45 rounded-[2px]" style={{ background: marker.color }} />
                            <span className="absolute bottom-0 left-1/2 top-2 w-px -translate-x-1/2" style={{ background: marker.color, opacity: 0.75 }} />
                          </button>
                        ))}
                        <div
                          className="absolute bottom-0 top-0 z-20 w-px bg-red-400/90"
                          style={{ left: `${(timelineCursorSeconds / displayTimelineSeconds) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="min-h-0 overflow-auto px-2.5 py-2" ref={timelineScrollRef}>
                  {activeComposition ? (
                    <div className="min-w-full space-y-1.5" style={{ width: `${timelineZoomPercent}%` }}>
                      {Array.from({ length: VISUAL_TRACK_COUNT }, (_, trackIndex) => (
                        <TimelineLane
                          key={`visual-${trackIndex}`}
                          blocks={visualBlocks
                            .filter((block) => block.clip.trackIndex === trackIndex)
                            .map((block) => ({
                              id: block.clip.id,
                              label: visualBlockLabel(block.clip, block.item?.label),
                              secondaryLabel: `${block.startSeconds.toFixed(1)}s -> ${block.endSeconds.toFixed(1)}s`,
                              startSeconds: block.startSeconds,
                              durationSeconds: block.durationSeconds,
                              kind: block.item?.kind ?? block.clip.sourceKind,
                              trimClip: block.clip,
                              selected: block.clip.id === selectedVisualClip?.id,
                              opacityPercent: block.clip.opacityPercent,
                              opacityAutomationPoints: block.clip.keyframes?.length
                                ? visualKeyframesToOpacityAutomation(block.clip)
                                : normalizeAutomationPoints(
                                    block.clip.opacityAutomationPoints,
                                    block.clip.opacityPercent,
                                  ),
                              keyframePercents: getVisualKeyframePercents(block.clip),
                            }))}
                          emptyMessage="Add image, video, composition, or text items from the source bin into this video lane."
                          automationLabel="Opacity"
                          gaps={visualGapsByTrack[trackIndex] ?? []}
                          selectedGapId={selectedTimelineGap?.id}
                          onOpenGapContextMenu={openTimelineGapContextMenu}
                          onSelectGap={(gap) => {
                            setSelectedTimelineGap(gap);
                            clearTimelineSelection();
                            setSelectedSourceItemId(undefined);
                            setSelectedStageObjectId(undefined);
                          }}
                          onAddAutomationPoint={addVisualOpacityAutomationPoint}
                          onCutBlock={splitVisualClipAtSeconds}
                          onSlipBlock={slipVisualClip}
                          onTrimBlockEdge={trimVisualClipFromEdge}
                          onOpenContextMenu={openVisualClipContextMenu}
                          onMoveBlock={moveVisualClip}
                          onDropSourceItem={(event) => handleTimelineSourceDrop(event, 'visual', trackIndex)}
                          onRemoveAutomationPoint={removeVisualOpacityAutomationPoint}
                          onResizeLane={(event) => startTimelineTrackResize(event, 'visual')}
                          onStartHandPan={startTimelineHandPan}
                          onSetPlayhead={setTimelineCursorSeconds}
                          playheadSeconds={timelineCursorSeconds}
                          snapPoints={timelineSnapPoints}
                          laneHeight={timelineVisualTrackHeight}
                          toolMode={timelineTool}
                          onUpdateAutomationPoint={updateVisualOpacityAutomationPoint}
                          previewById={clipEdgePreviewMap}
                          onSelect={(id) => {
                            const clip = visualClips.find((candidate) => candidate.id === id);
                            if (clip) {
                              selectVisualClip(clip);
                            }
                          }}
                          timelineSeconds={displayTimelineSeconds}
                          locked={isVisualTrackLocked(trackIndex)}
                          onToggleLock={() => toggleVisualTrackLock(trackIndex)}
                          collapsed={isVisualTrackCollapsed(trackIndex)}
                          onToggleCollapse={() => toggleVisualTrackCollapse(trackIndex)}
                          trackLabel={`V${trackIndex + 1}`}
                        />
                      ))}

                      {Array.from({ length: AUDIO_TRACK_COUNT }, (_, trackIndex) => (
                        <TimelineLane
                          key={trackIndex}
                          blocks={audioBlocks
                            .filter((block) => block.clip.trackIndex === trackIndex)
                            .map((block) => ({
                              id: block.clip.id,
                              label: block.item?.label ?? block.clip.sourceNodeId,
                              secondaryLabel: `${block.startSeconds.toFixed(1)}s -> ${block.endSeconds.toFixed(1)}s`,
                              startSeconds: block.startSeconds,
                              durationSeconds: block.durationSeconds,
                              kind: block.item?.kind ?? ('audio' as const),
                              selected: block.clip.id === selectedAudioClip?.id,
                              muted: !block.clip.enabled,
                              opacityAutomationPoints: block.clip.volumeKeyframes?.length
                                ? audioKeyframesToVolumeAutomation(block.clip)
                                : normalizeAutomationPoints(
                                    block.clip.volumeAutomationPoints,
                                    100,
                                  ),
                              keyframePercents: getAudioKeyframePercents(block.clip),
                            }))}
                          emptyMessage="Add audio clips or video-with-audio clips from the source bin into this lane."
                          automationLabel="Volume"
                          onAddAutomationPoint={addAudioVolumeAutomationPoint}
                          onOpenContextMenu={(id, event) => {
                            event.preventDefault();
                            const item = sourceItemByNodeId.get(audioClips.find((candidate) => candidate.id === id)?.sourceNodeId ?? '');
                            const menuItems: Array<{ label: string; action: () => void; tone?: 'danger' | 'default' }> = [];

                            if (item) {
                              menuItems.push({
                                label: 'Send Source To Flow Workspace',
                                action: () => sendSourceItemToFlow(item),
                              });
                            }

                            menuItems.push({
                              label: 'Remove From Lane',
                              tone: 'danger',
                              action: () => {
                                updateAudioClips(audioClips.filter((candidate) => candidate.id !== id));
                                setContextMenu(null);
                              },
                            });

                            setContextMenu({ x: event.clientX, y: event.clientY, items: menuItems });
                          }}
                          onMoveBlock={moveAudioClip}
                          onDropSourceItem={(event) => handleTimelineSourceDrop(event, 'audio', trackIndex)}
                          onRemoveAutomationPoint={removeAudioVolumeAutomationPoint}
                          onResizeLane={(event) => startTimelineTrackResize(event, 'audio')}
                          onStartHandPan={startTimelineHandPan}
                          onSetPlayhead={setTimelineCursorSeconds}
                          playheadSeconds={timelineCursorSeconds}
                          snapPoints={timelineSnapPoints}
                          laneHeight={timelineAudioTrackHeight}
                          trackVolumePercent={audioTrackVolumes[trackIndex] ?? 100}
                          toolMode={timelineTool === 'hand' ? 'hand' : 'select'}
                          onTrackVolumeChange={(volumePercent) => updateAudioTrackVolume(trackIndex, volumePercent)}
                          onUpdateAutomationPoint={updateAudioVolumeAutomationPoint}
                          waveformById={audioWaveformMap}
                          onSelect={(id) => {
                            const clip = audioClips.find((candidate) => candidate.id === id);
                            if (clip) {
                              selectAudioClip(clip);
                            }
                          }}
                          timelineSeconds={displayTimelineSeconds}
                          locked={isAudioTrackLocked(trackIndex)}
                          onToggleLock={() => toggleAudioTrackLock(trackIndex)}
                          collapsed={isAudioTrackCollapsed(trackIndex)}
                          onToggleCollapse={() => toggleAudioTrackCollapse(trackIndex)}
                          trackLabel={`A${trackIndex + 1}`}
                        />
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      body="Create or select a composition to start sequencing clips and rendering a finished program."
                      title="No composition selected"
                    />
                  )}
                </div>
              </div>
            </section>
          </section>

          {inspectorVisible ? (
            <>
              <ResizeHandle onPointerDown={(event) => startPanelResize(event, 'inspectorWidth', true)} />
              <div style={{ width: inspectorWidth }} className="h-full min-h-0 shrink-0">
                <InspectorPanel
                  audioClip={selectedAudioClip}
                  audioTrackVolumes={audioTrackVolumes}
                  audioSourceItem={selectedAudioClip ? sourceItemByNodeId.get(selectedAudioClip.sourceNodeId) : undefined}
                  onMoveAudioToTrack={(trackIndex) => updateSelectedAudioClip({ trackIndex })}
                  onMoveVisualToTrack={(trackIndex) => updateSelectedVisualClip({ trackIndex })}
                  onEditVisualText={openTextClipEditDialog}
                  onRemoveAudioClip={() => {
                    if (!selectedAudioClip) {
                      return;
                    }

                    updateAudioClips(audioClips.filter((clip) => clip.id !== selectedAudioClip.id));
                    setSelectedAudioClipId(undefined);
                  }}
                  onRemoveStageObject={() => {
                    if (selectedStageObject) {
                      removeStageObject(selectedStageObject.id);
                    }
                  }}
                  onRemoveVisualClip={() => {
                    if (!selectedVisualClip) {
                      return;
                    }

                    updateVisualClips(visualClips.filter((clip) => clip.id !== selectedVisualClip.id));
                    setSelectedVisualClipId(undefined);
                  }}
                  onSelectSource={() => {
                    if (!selectedSourceItem) {
                      return;
                    }

                    selectSourceItem(selectedSourceItem.id);
                  }}
                  onUpdateAudioClip={updateSelectedAudioClip}
                  onAddOrUpdateKeyframe={addOrUpdateKeyframeAtPlayhead}
                  onCommitVisualCropAsImageAsset={() => void commitSelectedImageCropAsAsset()}
                  onGenerateNarrationFromText={() => void generateNarrationForSelectedTextClip()}
                  onUpdateStageObject={(patch) => {
                    if (selectedStageObject) {
                      updateStageObject(selectedStageObject.id, patch);
                    }
                  }}
                  onUpdateVisualClip={updateSelectedVisualClip}
                  onJumpKeyframe={jumpToAdjacentSelectedKeyframe}
                  onRemoveAudioKeyframe={removeSelectedAudioKeyframe}
                  onRemoveVisualKeyframe={removeSelectedVisualKeyframe}
                  onUpdateAudioKeyframe={updateSelectedAudioKeyframe}
                  onUpdateVisualKeyframe={updateSelectedVisualKeyframe}
                  selectedStageObject={selectedStageObject}
                  selectedSourceItem={selectedSourceItem}
                  sequenceDurationSeconds={sequenceDurationSeconds}
                  timelineCursorSeconds={timelineCursorSeconds}
                  visualEditorAsset={selectedVisualEditorAsset}
                  visualClip={selectedVisualClip}
                  audioDurationSeconds={selectedAudioDurationSeconds}
                  visualDurationSeconds={selectedVisualDurationSeconds}
                  visualBackingImageItem={selectedVisualBackingImageItem}
                  visualSourceDurationSeconds={selectedVisualSourceDurationSeconds}
                  visualSourceItem={selectedVisualSourceItem}
                />
              </div>
            </>
          ) : null}
        </section>
        ) : (
          <section className="flex h-full min-h-0 items-center justify-center rounded-xl border border-white/5 bg-black/20 p-6 text-center text-sm text-gray-500">
            Dockable Video panels are the active editing surfaces. Use Window &gt; Panels &gt; Reset Video Panels to restore the default source bin, monitors, inspector, and timeline layout.
          </section>
        )}
      </DockablePanelHost>
        {isHelpOpen ? <EditorHelpModal onClose={() => setHelpOpen(false)} /> : null}
        {visualClipPropertyDialog ? (
          <VisualClipPropertyCopyDialog
            onCancel={() => setVisualClipPropertyDialog(null)}
            onCopy={copySelectedVisualClipProperties}
            onToggleProperty={toggleVisualClipPropertySelection}
            selectedProperties={visualClipPropertyDialog.selectedProperties}
            sourceLabel={visualClipPropertyDialog.sourceLabel}
          />
        ) : null}
        {textEditDialog ? (
          <TextEditDialog
            draft={textEditDialog.draft}
            onCancel={() => setTextEditDialog(null)}
            onChange={updateTextEditDraft}
            onSave={saveTextEditDialog}
            title={textEditDialog.title}
          />
        ) : null}
        {contextMenu ? (
          <SharedContextMenu
            ariaLabel="Editor context menu"
            items={contextMenu.items.map((item, index) => ({
              ...item,
              id: item.id ?? `${index}-${item.label}`,
            }))}
            onClose={() => setContextMenu(null)}
            title="Editor Actions"
            x={contextMenu.x}
            y={contextMenu.y}
          />
        ) : null}
        {sourceBinPreview ? (
          <MediaPreviewModal
            kind={sourceBinPreview.kind}
            label={sourceBinPreview.label}
            onClose={() => setSourceBinPreview(null)}
            src={sourceBinPreview.src}
          />
        ) : null}
    </div>
  );
}

interface SequencerTimelinePanelProps {
  activeComposition?: AppNode;
  addAudioVolumeAutomationPoint: (clipId: string, point: TimelineAutomationPoint) => void;
  addOrUpdateKeyframeAtPlayhead: () => void;
  addTimelineSnapAtSeconds: (seconds: number, shiftKey: boolean) => number;
  addVisualOpacityAutomationPoint: (clipId: string, point: TimelineAutomationPoint) => void;
  audioBlocks: ReturnType<typeof buildAudioTimelineBlocks>;
  audioClips: EditorAudioClip[];
  audioTrackVolumes: number[];
  audioWaveformMap: Record<string, number[]>;
  canKeyframeSelectedClip: boolean;
  clearTimelineSelection: () => void;
  clearTimelineSnapPoints: () => void;
  clipEdgePreviewMap: Record<string, TimelineClipEdgePreview>;
  displayTimelineSeconds: number;
  handleTimelineSourceDrop: (event: React.DragEvent<HTMLDivElement>, trackType: 'visual' | 'audio', trackIndex: number) => void;
  jumpToAdjacentSelectedKeyframe: (direction: 'previous' | 'next') => void;
  moveAudioClip: (id: string, nextStartSeconds: number, shiftKey: boolean) => void;
  moveVisualClip: (id: string, nextStartSeconds: number, shiftKey: boolean) => void;
  onCutSelectedVisualClipAtPlayhead: () => boolean;
  onOpenAudioClipContextMenu: (id: string, event: React.MouseEvent<HTMLElement>) => void;
  onOpenTimelineGapContextMenu: (gap: TimelineGap, event: React.MouseEvent<HTMLElement>) => void;
  onOpenVisualClipContextMenu: (id: string, event: React.MouseEvent<HTMLElement>) => void;
  onSelectAudioClip: (clip: EditorAudioClip) => void;
  onSelectVisualClip: (clip: EditorVisualClip) => void;
  onSetSelectedSourceItemId: (itemId?: string) => void;
  onSetSelectedStageObjectId: (objectId?: string) => void;
  onSetSelectedTimelineGap: (gap: TimelineGap | null) => void;
  onSetTimelineCursorSeconds: (seconds: number) => void;
  onSetTimelineTool: (tool: TimelineTool) => void;
  onSetTimelineZoomPercent: (percent: number) => void;
  onSetTrackHeight: (trackType: 'visual' | 'audio', height: number) => void;
  onStartTimelineHandPan: (event: React.PointerEvent<HTMLElement>) => void;
  onStartTimelineTrackResize: (event: React.PointerEvent<HTMLElement>, trackType: 'visual' | 'audio') => void;
  onUpdateAudioTrackVolume: (trackIndex: number, volumePercent: number) => void;
  removeAudioVolumeAutomationPoint: (clipId: string, pointIndex: number) => void;
  removeVisualOpacityAutomationPoint: (clipId: string, pointIndex: number) => void;
  secondMarkers: number[];
  selectedAudioClip?: EditorAudioClip;
  selectedTimelineGap: TimelineGap | null;
  selectedVisualClip?: EditorVisualClip;
  sequenceDurationSeconds: number;
  shuttleRate: number;
  timelineMarkers: TimelineMarker[];
  onJumpToMarker: (seconds: number) => void;
  onRemoveMarker: (markerId: string) => void;
  isVisualTrackLockedProp: (trackIndex: number) => boolean;
  isAudioTrackLockedProp: (trackIndex: number) => boolean;
  onToggleVisualTrackLock: (trackIndex: number) => void;
  onToggleAudioTrackLock: (trackIndex: number) => void;
  isVisualTrackCollapsedProp: (trackIndex: number) => boolean;
  isAudioTrackCollapsedProp: (trackIndex: number) => boolean;
  onToggleVisualTrackCollapse: (trackIndex: number) => void;
  onToggleAudioTrackCollapse: (trackIndex: number) => void;
  snapTimelineInteractionSeconds: (seconds: number, shiftKey: boolean) => number;
  splitVisualClipAtSeconds: (id: string, splitSeconds: number, shiftKey: boolean) => void;
  slipVisualClip: (id: string, deltaSeconds: number) => void;
  timelineAudioTrackHeight: number;
  timelineCursorSeconds: number;
  timelineScrollRef: RefObject<HTMLDivElement | null>;
  timelineSnapPoints: number[];
  timelineTool: TimelineTool;
  timelineVisualTrackHeight: number;
  timelineZoomPercent: number;
  trimVisualClipFromEdge: (clip: EditorVisualClip, edge: TimelineClipEdge, deltaSeconds: number, shiftKey: boolean) => void;
  updateAudioVolumeAutomationPoint: (clipId: string, pointIndex: number, point: TimelineAutomationPoint) => void;
  updateVisualOpacityAutomationPoint: (clipId: string, pointIndex: number, point: TimelineAutomationPoint) => void;
  visualBlocks: ReturnType<typeof buildVisualTimelineBlocks>;
  visualClips: EditorVisualClip[];
  visualGapsByTrack: Required<TimelineGap>[][];
}

function SequencerTimelinePanel({
  activeComposition,
  addAudioVolumeAutomationPoint,
  addOrUpdateKeyframeAtPlayhead,
  addTimelineSnapAtSeconds,
  addVisualOpacityAutomationPoint,
  audioBlocks,
  audioClips,
  audioTrackVolumes,
  audioWaveformMap,
  canKeyframeSelectedClip,
  clearTimelineSelection,
  clearTimelineSnapPoints,
  clipEdgePreviewMap,
  displayTimelineSeconds,
  handleTimelineSourceDrop,
  jumpToAdjacentSelectedKeyframe,
  moveAudioClip,
  moveVisualClip,
  onCutSelectedVisualClipAtPlayhead,
  onOpenAudioClipContextMenu,
  onOpenTimelineGapContextMenu,
  onOpenVisualClipContextMenu,
  onSelectAudioClip,
  onSelectVisualClip,
  onSetSelectedSourceItemId,
  onSetSelectedStageObjectId,
  onSetSelectedTimelineGap,
  onSetTimelineCursorSeconds,
  onSetTimelineTool,
  onSetTimelineZoomPercent,
  onSetTrackHeight,
  onStartTimelineHandPan,
  onStartTimelineTrackResize,
  onUpdateAudioTrackVolume,
  removeAudioVolumeAutomationPoint,
  removeVisualOpacityAutomationPoint,
  secondMarkers,
  selectedAudioClip,
  selectedTimelineGap,
  selectedVisualClip,
  sequenceDurationSeconds,
  shuttleRate,
  timelineMarkers,
  onJumpToMarker,
  onRemoveMarker,
  isVisualTrackLockedProp,
  isAudioTrackLockedProp,
  onToggleVisualTrackLock,
  onToggleAudioTrackLock,
  isVisualTrackCollapsedProp,
  isAudioTrackCollapsedProp,
  onToggleVisualTrackCollapse,
  onToggleAudioTrackCollapse,
  snapTimelineInteractionSeconds,
  splitVisualClipAtSeconds,
  slipVisualClip,
  timelineAudioTrackHeight,
  timelineCursorSeconds,
  timelineScrollRef,
  timelineSnapPoints,
  timelineTool,
  timelineVisualTrackHeight,
  timelineZoomPercent,
  trimVisualClipFromEdge,
  updateAudioVolumeAutomationPoint,
  updateVisualOpacityAutomationPoint,
  visualBlocks,
  visualClips,
  visualGapsByTrack,
}: SequencerTimelinePanelProps) {
  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-[#131821]">
      <div className="border-b border-gray-700/60 px-3 py-2">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-gray-100">
          <Film size={14} />
          Sequencer Timeline
        </div>
      </div>
      <div className="border-b border-gray-700/60 px-3 py-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[13px] font-semibold text-gray-100">Timeline</div>
            <div className="mt-0.5 text-[11px] text-gray-500">
              Visual clips and audio clips live on independent timed lanes. Use the tool strip for select vs cut, drag clips for rough placement, then use the inspector and program stage for precise timing and framing.
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <ToolToggleButton active={timelineTool === 'select'} icon={<MousePointer2 size={12} />} label="Select" onClick={() => onSetTimelineTool('select')} />
            <ToolToggleButton
              active={timelineTool === 'cut'}
              icon={<Scissors size={12} />}
              label="Cut"
              onClick={() => {
                if (!onCutSelectedVisualClipAtPlayhead()) onSetTimelineTool('cut');
              }}
            />
            <ToolToggleButton active={timelineTool === 'slip'} icon={<Film size={12} />} label="Slip" onClick={() => onSetTimelineTool('slip')} />
            <ToolToggleButton active={timelineTool === 'hand'} icon={<Archive size={12} />} label="Hand" onClick={() => onSetTimelineTool('hand')} />
            <ToolToggleButton active={timelineTool === 'snap'} icon={<Plus size={12} />} label="Snap" onClick={() => onSetTimelineTool('snap')} />
            <button className="inline-flex items-center gap-1.5 rounded-full border border-gray-700/60 bg-[#111217]/70 px-3 py-1 text-xs font-semibold text-gray-200 transition-colors hover:border-gray-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40" disabled={!canKeyframeSelectedClip} onClick={() => jumpToAdjacentSelectedKeyframe('previous')} title="Jump to previous keyframe ([)" type="button">
              <ChevronLeft size={12} />
              Key
            </button>
            <button className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/30 bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-100 transition-colors hover:border-cyan-200/70 hover:text-white disabled:cursor-not-allowed disabled:opacity-40" disabled={!canKeyframeSelectedClip} onClick={addOrUpdateKeyframeAtPlayhead} title="Add or update a keyframe at the playhead (K)" type="button">
              <Diamond size={12} />
              Add Key
            </button>
            <button className="inline-flex items-center gap-1.5 rounded-full border border-gray-700/60 bg-[#111217]/70 px-3 py-1 text-xs font-semibold text-gray-200 transition-colors hover:border-gray-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40" disabled={!canKeyframeSelectedClip} onClick={() => jumpToAdjacentSelectedKeyframe('next')} title="Jump to next keyframe (])" type="button">
              Key
              <ChevronRight size={12} />
            </button>
            {timelineSnapPoints.length > 0 ? (
              <button className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-100 transition-colors hover:border-cyan-200/70 hover:text-white" onClick={clearTimelineSnapPoints} type="button">
                Clear {timelineSnapPoints.length} snap{timelineSnapPoints.length === 1 ? '' : 's'}
              </button>
            ) : null}
            <label className="flex items-center gap-2 rounded-full border border-gray-700/60 bg-[#111217]/45 px-3 py-1 text-xs text-gray-300">
              <span>Zoom</span>
              <input className="w-24" max={300} min={100} onChange={(event) => onSetTimelineZoomPercent(Number(event.target.value))} step={10} type="range" value={timelineZoomPercent} />
              <span>{timelineZoomPercent}%</span>
            </label>
            <label className="flex items-center gap-2 rounded-full border border-gray-700/60 bg-[#111217]/45 px-3 py-1 text-xs text-gray-300">
              <span>V H</span>
              <input className="w-20" max={180} min={60} onChange={(event) => onSetTrackHeight('visual', Number(event.target.value))} step={4} type="range" value={timelineVisualTrackHeight} />
              <span>{timelineVisualTrackHeight}</span>
            </label>
            <label className="flex items-center gap-2 rounded-full border border-gray-700/60 bg-[#111217]/45 px-3 py-1 text-xs text-gray-300">
              <span>A H</span>
              <input className="w-20" max={180} min={44} onChange={(event) => onSetTrackHeight('audio', Number(event.target.value))} step={4} type="range" value={timelineAudioTrackHeight} />
              <span>{timelineAudioTrackHeight}</span>
            </label>
            <button
              className="rounded-full border border-gray-700/60 bg-[#111217]/45 px-3 py-1 text-xs text-gray-300 transition-colors hover:border-gray-500 hover:text-white"
              onClick={() => {
                onSetTimelineZoomPercent(100);
                onSetTrackHeight('visual', 84);
                onSetTrackHeight('audio', 64);
                timelineScrollRef.current?.scrollTo({ left: 0 });
              }}
              type="button"
            >
              Zoom To Fit
            </button>
            <div className="rounded-full border border-gray-700/60 bg-[#111217]/45 px-3 py-1 text-xs text-gray-300">
              {sequenceDurationSeconds > 0 ? `${sequenceDurationSeconds.toFixed(1)}s cut` : 'No clips yet'}
            </div>
            <div
              className={`rounded-full border px-3 py-1 font-mono text-xs ${shuttleRate === 0 ? 'border-gray-700/60 bg-[#111217]/45 text-gray-500' : 'border-emerald-300/45 bg-emerald-400/10 text-emerald-200'}`}
              data-video-transport-rate={shuttleRate}
              title="J/K/L shuttle · Space play/pause · Home/End to sequence bounds"
            >
              {shuttleRate === 0 ? '⏸ JKL' : shuttleRate > 0 ? `▶ ${shuttleRate}×` : `◀ ${Math.abs(shuttleRate)}×`}
            </div>
          </div>
        </div>
      </div>

      <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)]">
        <div className="border-b border-gray-700/60 px-2.5 py-2">
          <div className="overflow-x-auto">
            <div className="grid min-w-full grid-cols-[96px_minmax(0,1fr)] gap-2" style={{ width: `${timelineZoomPercent}%` }}>
              <div />
              <div className="relative h-8 overflow-hidden rounded-md border border-gray-700/60 bg-[#203847]">
                <button
                  className="absolute inset-0 z-10 h-full w-full cursor-pointer bg-transparent"
                  onClick={(event) => {
                    if (timelineTool === 'hand') return;
                    const bounds = event.currentTarget.getBoundingClientRect();
                    const ratio = (event.clientX - bounds.left) / bounds.width;
                    const timelineSeconds = Math.max(0, Math.min(displayTimelineSeconds, ratio * displayTimelineSeconds));
                    if (timelineTool === 'snap') {
                      addTimelineSnapAtSeconds(timelineSeconds, event.shiftKey);
                      return;
                    }
                    onSetTimelineCursorSeconds(snapTimelineInteractionSeconds(timelineSeconds, event.shiftKey));
                  }}
                  onPointerDown={(event) => {
                    if (timelineTool === 'hand') onStartTimelineHandPan(event);
                  }}
                  type="button"
                />
                {secondMarkers.map((second) => (
                  <div key={second} className="absolute bottom-0 top-0 border-l border-gray-700/50" style={{ left: `${(second / displayTimelineSeconds) * 100}%` }}>
                    <span className="absolute left-1 top-0.5 text-[9px] text-gray-400">{second}s</span>
                  </div>
                ))}
                {timelineSnapPoints.map((snapSecond) => (
                  <div key={`snap-${snapSecond}`} className="pointer-events-none absolute bottom-0 top-0 z-20 border-l-2 border-cyan-200/80" style={{ left: `${(snapSecond / displayTimelineSeconds) * 100}%` }}>
                    <span className="absolute left-1 top-4 rounded bg-cyan-950/80 px-1 text-[9px] font-semibold text-cyan-100">
                      {snapSecond.toFixed(snapSecond % 1 === 0 ? 0 : 1)}s
                    </span>
                  </div>
                ))}
                {timelineMarkers.map((marker) => (
                  <button
                    key={marker.id}
                    className="absolute bottom-0 top-0 z-30 w-2 -translate-x-1/2 cursor-pointer bg-transparent"
                    onClick={(event) => {
                      event.stopPropagation();
                      if (event.altKey) { onRemoveMarker(marker.id); return; }
                      onJumpToMarker(marker.seconds);
                    }}
                    style={{ left: `${(marker.seconds / displayTimelineSeconds) * 100}%` }}
                    title={`${marker.label} · ${marker.seconds.toFixed(1)}s — click to jump, Alt-click to remove`}
                    type="button"
                  >
                    <span className="absolute left-1/2 top-0 h-2.5 w-2.5 -translate-x-1/2 rotate-45 rounded-[2px]" style={{ background: marker.color }} />
                    <span className="absolute bottom-0 left-1/2 top-2 w-px -translate-x-1/2" style={{ background: marker.color, opacity: 0.75 }} />
                  </button>
                ))}
                <div className="absolute bottom-0 top-0 z-20 w-px bg-red-400/90" style={{ left: `${(timelineCursorSeconds / displayTimelineSeconds) * 100}%` }} />
              </div>
            </div>
          </div>
        </div>

        <div className="min-h-0 overflow-auto px-2.5 py-2" ref={timelineScrollRef}>
          {activeComposition ? (
            <div className="min-w-full space-y-1.5" style={{ width: `${timelineZoomPercent}%` }}>
              {Array.from({ length: VISUAL_TRACK_COUNT }, (_, trackIndex) => (
                <TimelineLane
                  key={`visual-${trackIndex}`}
                  automationLabel="Opacity"
                  blocks={visualBlocks.filter((block) => block.clip.trackIndex === trackIndex).map((block) => ({
                    id: block.clip.id,
                    label: visualBlockLabel(block.clip, block.item?.label),
                    secondaryLabel: `${block.startSeconds.toFixed(1)}s -> ${block.endSeconds.toFixed(1)}s`,
                    startSeconds: block.startSeconds,
                    durationSeconds: block.durationSeconds,
                    kind: block.item?.kind ?? block.clip.sourceKind,
                    trimClip: block.clip,
                    selected: block.clip.id === selectedVisualClip?.id,
                    opacityPercent: block.clip.opacityPercent,
                    opacityAutomationPoints: block.clip.keyframes?.length ? visualKeyframesToOpacityAutomation(block.clip) : normalizeAutomationPoints(block.clip.opacityAutomationPoints, block.clip.opacityPercent),
                    keyframePercents: getVisualKeyframePercents(block.clip),
                  }))}
                  emptyMessage="Add image, video, composition, or text items from the source bin into this video lane."
                  gaps={visualGapsByTrack[trackIndex] ?? []}
                  laneHeight={timelineVisualTrackHeight}
                  onAddAutomationPoint={addVisualOpacityAutomationPoint}
                  onCutBlock={splitVisualClipAtSeconds}
                  onDropSourceItem={(event) => handleTimelineSourceDrop(event, 'visual', trackIndex)}
                  onMoveBlock={moveVisualClip}
                  onOpenContextMenu={onOpenVisualClipContextMenu}
                  onOpenGapContextMenu={onOpenTimelineGapContextMenu}
                  onRemoveAutomationPoint={removeVisualOpacityAutomationPoint}
                  onResizeLane={(event) => onStartTimelineTrackResize(event, 'visual')}
                  onSelect={(id) => {
                    const clip = visualClips.find((candidate) => candidate.id === id);
                    if (clip) onSelectVisualClip(clip);
                  }}
                  onSelectGap={(gap) => {
                    onSetSelectedTimelineGap(gap);
                    clearTimelineSelection();
                    onSetSelectedSourceItemId(undefined);
                    onSetSelectedStageObjectId(undefined);
                  }}
                  onSetPlayhead={onSetTimelineCursorSeconds}
                  onSlipBlock={slipVisualClip}
                  onStartHandPan={onStartTimelineHandPan}
                  onTrimBlockEdge={trimVisualClipFromEdge}
                  onUpdateAutomationPoint={updateVisualOpacityAutomationPoint}
                  playheadSeconds={timelineCursorSeconds}
                  previewById={clipEdgePreviewMap}
                  selectedGapId={selectedTimelineGap?.id}
                  snapPoints={timelineSnapPoints}
                  timelineSeconds={displayTimelineSeconds}
                  toolMode={timelineTool}
                  locked={isVisualTrackLockedProp(trackIndex)}
                  onToggleLock={() => onToggleVisualTrackLock(trackIndex)}
                  collapsed={isVisualTrackCollapsedProp(trackIndex)}
                  onToggleCollapse={() => onToggleVisualTrackCollapse(trackIndex)}
                  trackLabel={`V${trackIndex + 1}`}
                />
              ))}

              {Array.from({ length: AUDIO_TRACK_COUNT }, (_, trackIndex) => (
                <TimelineLane
                  key={trackIndex}
                  automationLabel="Volume"
                  blocks={audioBlocks.filter((block) => block.clip.trackIndex === trackIndex).map((block) => ({
                    id: block.clip.id,
                    label: block.item?.label ?? block.clip.sourceNodeId,
                    secondaryLabel: `${block.startSeconds.toFixed(1)}s -> ${block.endSeconds.toFixed(1)}s`,
                    startSeconds: block.startSeconds,
                    durationSeconds: block.durationSeconds,
                    kind: block.item?.kind ?? ('audio' as const),
                    selected: block.clip.id === selectedAudioClip?.id,
                    muted: !block.clip.enabled,
                    opacityAutomationPoints: block.clip.volumeKeyframes?.length ? audioKeyframesToVolumeAutomation(block.clip) : normalizeAutomationPoints(block.clip.volumeAutomationPoints, 100),
                    keyframePercents: getAudioKeyframePercents(block.clip),
                  }))}
                  emptyMessage="Add audio clips or video-with-audio clips from the source bin into this lane."
                  laneHeight={timelineAudioTrackHeight}
                  onAddAutomationPoint={addAudioVolumeAutomationPoint}
                  onDropSourceItem={(event) => handleTimelineSourceDrop(event, 'audio', trackIndex)}
                  onMoveBlock={moveAudioClip}
                  onOpenContextMenu={onOpenAudioClipContextMenu}
                  onRemoveAutomationPoint={removeAudioVolumeAutomationPoint}
                  onResizeLane={(event) => onStartTimelineTrackResize(event, 'audio')}
                  onSelect={(id) => {
                    const clip = audioClips.find((candidate) => candidate.id === id);
                    if (clip) onSelectAudioClip(clip);
                  }}
                  onSetPlayhead={onSetTimelineCursorSeconds}
                  onStartHandPan={onStartTimelineHandPan}
                  onTrackVolumeChange={(volumePercent) => onUpdateAudioTrackVolume(trackIndex, volumePercent)}
                  onUpdateAutomationPoint={updateAudioVolumeAutomationPoint}
                  playheadSeconds={timelineCursorSeconds}
                  snapPoints={timelineSnapPoints}
                  timelineSeconds={displayTimelineSeconds}
                  toolMode={timelineTool === 'hand' ? 'hand' : 'select'}
                  locked={isAudioTrackLockedProp(trackIndex)}
                  onToggleLock={() => onToggleAudioTrackLock(trackIndex)}
                  collapsed={isAudioTrackCollapsedProp(trackIndex)}
                  onToggleCollapse={() => onToggleAudioTrackCollapse(trackIndex)}
                  trackLabel={`A${trackIndex + 1}`}
                  trackVolumePercent={audioTrackVolumes[trackIndex] ?? 100}
                  waveformById={audioWaveformMap}
                />
              ))}
            </div>
          ) : (
            <EmptyState body="Create or select a composition to start sequencing clips and rendering a finished program." title="No composition selected" />
          )}
        </div>
      </div>
    </section>
  );
}

function SourceMonitorPanel({
  item,
  marks,
  mediaInfo,
  sourceDurationSeconds,
  onAddVisual,
  onAddAudio,
  onMarkIn,
  onMarkOut,
  onInsertEdit,
  onOverwriteEdit,
  onOpenContextMenu,
  videoRef,
}: {
  item?: SourceBinItem;
  marks?: { inSeconds?: number; outSeconds?: number };
  mediaInfo?: SourceMediaInfo;
  sourceDurationSeconds?: number;
  onAddVisual: (item: SourceBinItem, trackIndex: number) => void;
  onAddAudio: (item: SourceBinItem, trackIndex: number) => void;
  onMarkIn: () => void;
  onMarkOut: () => void;
  onInsertEdit: () => void;
  onOverwriteEdit: () => void;
  onOpenContextMenu: (event: React.MouseEvent<HTMLDivElement>) => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
}) {
  return (
    <section className={`${panelClassName} flex h-full min-h-0 flex-col overflow-hidden`}>
      <div className="border-b border-gray-700/60 px-3 py-2">
        <div className="text-[13px] font-semibold text-gray-100">Source Monitor</div>
        <div className="mt-0.5 text-[11px] text-gray-500">Preview the selected source asset before dropping it into the cut.</div>
      </div>
      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] gap-2 p-2.5">
        {item ? (
          <>
            <div className="h-full min-h-0" onContextMenu={onOpenContextMenu}>
              <MonitorSurface item={item} mediaInfo={mediaInfo} variant="source" videoRef={videoRef} />
            </div>
            <div className="rounded-lg border border-gray-700/60 bg-[#111217]/40 px-2.5 py-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-semibold text-white">{item.label}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-gray-500">
                    <span>{item.kind}</span>
                    {sourceDurationSeconds ? <span>{sourceDurationSeconds.toFixed(1)}s</span> : null}
                    {item.mimeType ? <span>{item.mimeType}</span> : null}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {canUseSourceItemAsVisual(item) ? (
                    <div className="inline-flex items-stretch gap-1" data-source-monitor-three-point>
                      <button
                        className="rounded-lg border border-gray-700/60 bg-[#0f131b] px-2 py-1 text-[11px] font-semibold text-gray-200 hover:bg-[#161c26] hover:text-white"
                        onClick={onMarkIn}
                        title="Mark In at the source playhead (I)"
                        type="button"
                      >
                        ⟨I{marks?.inSeconds !== undefined ? ` ${marks.inSeconds.toFixed(1)}s` : ''}
                      </button>
                      <button
                        className="rounded-lg border border-gray-700/60 bg-[#0f131b] px-2 py-1 text-[11px] font-semibold text-gray-200 hover:bg-[#161c26] hover:text-white"
                        onClick={onMarkOut}
                        title="Mark Out at the source playhead (O)"
                        type="button"
                      >
                        O⟩{marks?.outSeconds !== undefined ? ` ${marks.outSeconds.toFixed(1)}s` : ''}
                      </button>
                      <button
                        className="rounded-lg border border-cyan-300/40 bg-cyan-500/10 px-2 py-1 text-[11px] font-semibold text-cyan-100 hover:border-cyan-200/70 hover:text-white"
                        onClick={onInsertEdit}
                        title="Insert marked range at the timeline playhead on V1, rippling later clips right (,)"
                        type="button"
                      >
                        Insert
                      </button>
                      <button
                        className="rounded-lg border border-amber-300/40 bg-amber-400/10 px-2 py-1 text-[11px] font-semibold text-amber-100 hover:border-amber-200/70 hover:text-white"
                        onClick={onOverwriteEdit}
                        title="Overwrite the timeline range at the playhead on V1 with the marked range (.)"
                        type="button"
                      >
                        Overwrite
                      </button>
                    </div>
                  ) : null}
                  {canUseSourceItemAsVisual(item) ? (
                    <TrackAddControl
                      icon={Film}
                      noun="Video"
                      onAdd={(trackIndex) => onAddVisual(item, trackIndex)}
                      trackCount={VISUAL_TRACK_COUNT}
                    />
                  ) : null}

                  {canUseSourceItemAsAudio(item) ? (
                    <TrackAddControl
                      icon={Music2}
                      noun="Audio"
                      onAdd={(trackIndex) => onAddAudio(item, trackIndex)}
                      trackCount={AUDIO_TRACK_COUNT}
                    />
                  ) : null}
                </div>
              </div>
            </div>
          </>
        ) : (
          <EmptyState
            body="Select a source item from the source bin to inspect it here before you place it on the timeline."
            title="No source selected"
          />
        )}
      </div>
    </section>
  );
}

export function ProgramMonitorPanel({
  stageMode,
  previewUrl,
  previewOutputMetadata,
  aspectRatio,
  videoResolution,
  frameRate,
  canvas,
  sequenceSummary,
  exportPresetPlan,
  exportReadiness,
  renderBackendStatus,
  monitorParityNotices,
  parityDiagnostics,
  stageClips,
  stageObjects,
  selectedClip,
  selectedStageObject,
  activeTool,
  visualClipCount,
  audioClipCount,
  onRun,
  onAddEditorAsset,
  onAddComicStageObject = () => {},
  onSelectClip,
  onSelectStageObject,
  onUpdateClip,
  onUpdateStageObject,
  onSetMonitorMode,
  onAspectRatioChange,
  onResolutionChange,
  onFrameRateChange,
  onExportPresetPlanChange,
  hasCaptionCues,
  onExportCaptions,
  onOpenClipContextMenu,
  onOpenContextMenu,
  videoRef,
  incrementalRenderSummary,
  renderCacheDetailLines = [],
  isRunning,
  renderStatusMessage,
  errorMessage,
  hasActiveComposition = true,
  onCreateComposition,
  onCreateStarterSequence,
  onRevealSourceBin,
}: {
  stageMode: 'stage' | 'rendered';
  previewUrl?: string;
  previewOutputMetadata?: Record<string, unknown>;
  aspectRatio: AspectRatio;
  videoResolution: VideoResolution;
  frameRate: number;
  canvas: { width: number; height: number };
  sequenceSummary: ReturnType<typeof buildVideoSequenceSummary>;
  exportPresetPlan: VideoExportPresetPlanData;
  exportReadiness: VideoExportReadinessSummary;
  renderBackendStatus: VideoRenderBackendSummary;
  monitorParityNotices: string[];
  parityDiagnostics: ReturnType<typeof buildVideoParityDiagnostics>;
  stageClips: ProgramStageClip[];
  stageObjects: EditorStageObject[];
  selectedClip?: EditorVisualClip;
  selectedStageObject?: EditorStageObject;
  activeTool: TimelineTool;
  visualClipCount: number;
  audioClipCount: number;
  onRun: () => void;
  onAddEditorAsset: (kind: EditorAssetKind) => void;
  onAddComicStageObject?: (kind: 'speech-bubble' | 'thought-bubble' | 'caption') => void;
  onSelectClip: (clipId: string) => void;
  onSelectStageObject: (objectId: string) => void;
  onUpdateClip: (clipId: string, patch: Partial<EditorVisualClip>) => void;
  onUpdateStageObject: (objectId: string, patch: Partial<EditorStageObject>) => void;
  onSetMonitorMode: (mode: 'stage' | 'rendered') => void;
  onAspectRatioChange: (aspectRatio: AspectRatio) => void;
  onResolutionChange: (videoResolution: VideoResolution) => void;
  onFrameRateChange: (frameRate: number) => void;
  onExportPresetPlanChange: (presetId: VideoExportPresetPlanId) => void;
  hasCaptionCues: boolean;
  onExportCaptions: (format: 'srt' | 'vtt') => void;
  onOpenClipContextMenu: (clipId: string, event: React.MouseEvent<HTMLElement>) => void;
  onOpenContextMenu: (event: React.MouseEvent<HTMLDivElement>) => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  incrementalRenderSummary?: string;
  renderCacheDetailLines?: string[];
  isRunning?: boolean;
  renderStatusMessage?: string;
  errorMessage?: string;
  hasActiveComposition?: boolean;
  onCreateComposition?: () => void;
  onCreateStarterSequence?: () => void;
  onRevealSourceBin?: () => void;
}) {
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const imageSequenceFrameCount = getImageSequenceFrameCount(previewOutputMetadata);
  const isImageSequenceOutput = Boolean(imageSequenceFrameCount !== undefined);
  const renderedPreviewDescriptor = buildRenderedPreviewDescriptor({
    previewUrl,
    previewOutputMetadata,
    isRunning,
    renderStatusMessage,
    errorMessage,
    isImageSequenceOutput,
  });
  const renderBlockedReason = exportReadiness.tone === 'error' ? exportReadiness.detail : undefined;
  const renderedPreviewPlaceholderState: 'waiting' | 'error' | 'empty' | 'idle' = isRunning
    ? 'waiting'
    : errorMessage
      ? 'error'
      : renderStatusMessage
        ? 'empty'
        : 'idle';
  const showFloatingRenderOverlay = stageMode !== 'rendered' || Boolean(previewUrl);
  const selectedStageClip = selectedClip
    ? stageClips.find((stageClip) => stageClip.clip.id === selectedClip.id)
    : undefined;

  const selectedKeyframeState = selectedClip
    ? resolveClipFitState(
        selectedClip,
        selectedStageClip ? getStageClipProgress(selectedStageClip) * 100 : 0,
      )
    : undefined;

  const updateStageClipAtProgress = (
    stageClip: ProgramStageClip,
    patch: Partial<EditorVisualClip>,
  ) => {
    onUpdateClip(
      stageClip.clip.id,
      applyVisualClipPatchAtProgress(stageClip.clip, getStageClipProgress(stageClip) * 100, patch),
    );
  };

  const adjustSelectedClip = (patch: Partial<EditorVisualClip>) => {
    if (!selectedClip) {
      return;
    }

    const selectedStageClip = stageClips.find((stageClip) => stageClip.clip.id === selectedClip.id);

    if (selectedStageClip) {
      updateStageClipAtProgress(selectedStageClip, patch);
    } else {
      onUpdateClip(selectedClip.id, patch);
    }
  };

  const nudgeSelectedClip = (deltaX: number, deltaY: number) => {
    if (!selectedClip) {
      return;
    }

    const selectedStageClip = stageClips.find((stageClip) => stageClip.clip.id === selectedClip.id);
    const currentState = selectedStageClip
      ? getVisualKeyframeStateAtProgress(selectedClip, getStageClipProgress(selectedStageClip) * 100)
      : getVisualKeyframeStateAtProgress(selectedClip, 0);

    adjustSelectedClip({
      positionX: currentState.positionX + deltaX,
      positionY: currentState.positionY + deltaY,
    });
  };

  const adjustSelectedStageObject = (patch: Partial<EditorStageObject>) => {
    if (!selectedStageObject) {
      return;
    }

    onUpdateStageObject(selectedStageObject.id, patch);
  };

  const nudgeSelectedStageObject = (deltaX: number, deltaY: number) => {
    if (!selectedStageObject) {
      return;
    }

    adjustSelectedStageObject({
      x: selectedStageObject.x + deltaX,
      y: selectedStageObject.y + deltaY,
    });
  };

  const handleSaveVideo = async () => {
    if (!previewUrl) {
      return;
    }

    const preset = getVideoExportPresetOption(exportPresetPlan.presetId);
    const extension = isImageSequenceOutput ? 'zip' : preset.extension;
    const mimeType = isImageSequenceOutput ? 'application/zip' : preset.mimeType;
    await downloadAsset(previewUrl, buildDownloadFilename(`${EXPORT_BASENAME}-program`, mimeType, extension));
  };

  useEffect(() => {
    if (stageMode !== 'rendered' || !previewUrl || isImageSequenceOutput) {
      return;
    }

    const video = videoRef.current;
    if (!video) {
      return;
    }

    video.pause();
    video.currentTime = 0;
    video.load();
  }, [isImageSequenceOutput, previewUrl, stageMode, videoRef]);

  return (
    <section className={`${panelClassName} flex h-full min-h-0 flex-col overflow-hidden`}>
      {/* COMPACT TOP BAR */}
      <div className="flex shrink-0 items-center justify-between border-b border-gray-700/60 bg-[#12161f] px-3 py-1.5 min-h-[44px]">
        <div className="flex items-center gap-3">
          <div className="text-[12px] font-bold text-gray-100 uppercase tracking-wider">Program Monitor</div>
          {hasActiveComposition && (
            <div className="inline-flex overflow-hidden rounded-lg border border-gray-700/60 bg-[#0f131b]">
              <button
                className={`px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  stageMode === 'stage' ? 'bg-blue-500/20 text-blue-100' : 'text-gray-300 hover:text-white'
                }`}
                onClick={() => onSetMonitorMode('stage')}
                type="button"
              >
                Edit Stage
              </button>
              <button
                className={`px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  stageMode === 'rendered'
                    ? 'bg-blue-500/20 text-blue-100'
                    : 'text-gray-300 hover:text-white'
                }`}
                data-video-rendered-preview-tab="true"
                onClick={() => onSetMonitorMode('rendered')}
                type="button"
              >
                Rendered Preview
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {!hasActiveComposition ? (
            onCreateComposition && (
              <button
                onClick={onCreateComposition}
                className="inline-flex items-center gap-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white px-2.5 py-1 text-[11px] font-semibold transition-colors"
                type="button"
              >
                <Plus size={11} />
                Create Composition
              </button>
            )
          ) : (
            <>
              {onCreateComposition && (
                <button
                  onClick={onCreateComposition}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-700/60 bg-[#0f131b] hover:border-gray-500 text-gray-300 hover:text-white px-2 py-1 text-[11px] font-semibold transition-colors"
                  title="Create a new video composition node"
                  type="button"
                >
                  <Plus size={11} />
                  New Comp
                </button>
              )}
              <button
                onClick={() => setSidebarOpen(!isSidebarOpen)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-700/60 bg-[#0f131b] px-2.5 py-1 text-[11px] font-semibold text-gray-300 transition-colors hover:border-gray-500 hover:text-white"
                type="button"
              >
                {isSidebarOpen ? 'Hide Controls' : 'Show Controls'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* MAIN CONTENT LAYOUT (STAGE & SIDEBAR SIDE-BY-SIDE) */}
      <div className="flex flex-1 min-h-0 relative overflow-hidden bg-[#0a0d14]">
        {/* PREVIEW STAGE AREA */}
        <div className="relative flex min-h-0 flex-1 flex-col p-2.5 bg-black overflow-hidden justify-center">
          {!hasActiveComposition ? (
            <div className="flex h-full w-full flex-col items-center justify-center p-6 text-center select-none bg-[#0a0d14]">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-gray-800 bg-[#0f131b] text-gray-400 shadow-lg">
                <Film size={24} />
              </div>
              <h3 className="text-sm font-semibold text-white">No Active Composition</h3>
              <p className="mt-1 max-w-[280px] text-xs text-gray-500 leading-normal">
                Start from a template, or add media from the Source Library to begin sequencing
                video, images, audio, and captions.
              </p>
              <div className="mt-5 flex flex-col items-center gap-2">
                {(onCreateStarterSequence ?? onCreateComposition) && (
                  <button
                    onClick={onCreateStarterSequence ?? onCreateComposition}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 px-4 py-2 text-xs font-semibold text-white shadow-lg transition-all"
                    type="button"
                  >
                    <Plus size={14} />
                    Create 1080p sequence
                  </button>
                )}
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {onCreateComposition && (
                    <button
                      onClick={onCreateComposition}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-700/60 bg-[#0f131b] px-3 py-1.5 text-[11px] font-semibold text-gray-300 transition-colors hover:border-gray-500 hover:text-white"
                      type="button"
                    >
                      <Plus size={12} />
                      Blank composition
                    </button>
                  )}
                  {onRevealSourceBin && (
                    <button
                      onClick={onRevealSourceBin}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-700/60 bg-[#0f131b] px-3 py-1.5 text-[11px] font-semibold text-gray-300 transition-colors hover:border-gray-500 hover:text-white"
                      type="button"
                    >
                      <Archive size={12} />
                      Add media from the Source Library
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col h-full w-full min-h-0 justify-center">
              {stageMode === 'rendered' && monitorParityNotices.length > 0 ? (
                <div className="mb-2 shrink-0 space-y-1.5">
                  {monitorParityNotices.map((notice) => (
                    <div
                      className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-1.5 text-[11px] leading-relaxed text-amber-100"
                      key={notice}
                    >
                      {notice}
                    </div>
                  ))}
                </div>
              ) : null}
              {stageMode === 'rendered' ? (
                <RenderedPreviewDescriptorStrip descriptor={renderedPreviewDescriptor} />
              ) : null}
              {stageMode === 'rendered' && previewUrl && isImageSequenceOutput ? (
                <div
                  className="min-h-0 flex flex-1 items-center justify-center"
                  data-video-rendered-preview-state="archive"
                  onContextMenu={onOpenContextMenu}
                >
                  <div className="max-w-md rounded-2xl border border-purple-300/25 bg-[#0f131b] p-5 text-center shadow-2xl shadow-black/30">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-purple-300/30 bg-purple-500/15 text-purple-100">
                      <Archive size={20} />
                    </div>
                    <div className="mt-3 text-sm font-semibold text-white">Image Sequence Archive Ready</div>
                    <div className="mt-1 text-xs leading-5 text-gray-400">
                      {imageSequenceFrameCount} frame{imageSequenceFrameCount === 1 ? '' : 's'} exported as {getVideoExportPresetOption(exportPresetPlan.presetId).extension.toUpperCase()} plus manifest.json. Audio is ignored for image sequence exports.
                    </div>
                    <button
                      className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-[11px] font-semibold text-black transition-colors hover:bg-gray-200"
                      onClick={() => void handleSaveVideo()}
                      type="button"
                    >
                      <Archive size={12} />
                      Save ZIP Archive
                    </button>
                  </div>
                </div>
              ) : stageMode === 'rendered' && previewUrl ? (
                <div
                  className="min-h-0 flex-1"
                  data-video-rendered-preview-state="ready"
                  onContextMenu={onOpenContextMenu}
                >
                  <MonitorStageFrame aspectRatioValue={getAspectRatioValue(aspectRatio)}>
                    <video
                      key={previewUrl}
                      className="absolute inset-0 h-full w-full object-contain"
                      controls
                      data-video-rendered-preview="true"
                      preload="metadata"
                      ref={videoRef}
                      src={previewUrl}
                    />
                  </MonitorStageFrame>
                </div>
              ) : stageMode === 'rendered' ? (
                <RenderedPreviewStatusPanel
                  errorMessage={errorMessage}
                  renderStatusMessage={renderStatusMessage}
                  state={renderedPreviewPlaceholderState}
                />
              ) : (
                <div className="min-h-0 flex-1" data-program-stage-shell>
                  <ProgramStage
                    activeTool={activeTool}
                    aspectRatioValue={getAspectRatioValue(aspectRatio)}
                    canvas={canvas}
                    onOpenContextMenu={onOpenContextMenu}
                    onOpenClipContextMenu={onOpenClipContextMenu}
                    onSelectClip={onSelectClip}
                    onSelectStageObject={onSelectStageObject}
                    onUpdateClip={onUpdateClip}
                    onUpdateStageObject={onUpdateStageObject}
                    selectedClip={selectedClip}
                    selectedStageObject={selectedStageObject}
                    stageClips={stageClips}
                    stageObjects={stageObjects}
                  />
                </div>
              )}
            </div>
          )}

          {isRunning && showFloatingRenderOverlay ? (
            <div className="pointer-events-none absolute inset-2.5 z-30 flex items-start justify-end">
              <div className="min-w-64 rounded-lg border border-amber-400/40 bg-[#120f08]/92 px-3 py-2 text-amber-50 shadow-[0_0_28px_rgba(251,191,36,0.18)] backdrop-blur">
                <div className="flex items-center gap-2">
                  <div className="flex items-end gap-1">
                    <span className="h-2 w-1 animate-pulse rounded-full bg-amber-300 [animation-delay:0ms]" />
                    <span className="h-3 w-1 animate-pulse rounded-full bg-amber-200 [animation-delay:120ms]" />
                    <span className="h-4 w-1 animate-pulse rounded-full bg-amber-100 [animation-delay:240ms]" />
                  </div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/90">
                    Render In Progress
                  </div>
                </div>
                <div className="mt-1 text-xs text-amber-50/85">
                  {renderStatusMessage ?? 'Signal Loom is rendering the current composition.'}
                </div>
              </div>
            </div>
          ) : null}
          {!isRunning && errorMessage && showFloatingRenderOverlay ? (
            <div className="pointer-events-none absolute inset-2.5 z-30 flex items-start justify-end">
              <div className="max-w-md rounded-lg border border-red-400/45 bg-[#1b0d0f]/92 px-3 py-2 text-red-50 shadow-[0_0_28px_rgba(248,113,113,0.18)] backdrop-blur">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-red-100/90">
                  Render Failed
                </div>
                <div className="mt-1 text-xs leading-5 text-red-50/85">{errorMessage}</div>
              </div>
            </div>
          ) : null}
        </div>

        {/* CONTROLS & INFO SIDEBAR */}
        {hasActiveComposition && isSidebarOpen && (
          <div className="w-[300px] shrink-0 border-l border-gray-700/60 bg-[#0d1017] flex flex-col min-h-0 overflow-y-auto p-4 gap-4 scrollbar-thin">
            <div>
              <div className="text-[12px] font-bold text-gray-100 uppercase tracking-wider">Sequence Info</div>
              <div className="mt-1 text-[11px] text-gray-400 leading-normal">
                Configure properties and monitor export specs of the active composition.
              </div>
            </div>

            {/* Spec Row Grid */}
            <div className="rounded-lg border border-gray-800 bg-[#12161f]/50 p-3 flex flex-col gap-2.5">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Composition Specs</div>
              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center text-[11px] text-gray-400">
                  <span>Canvas:</span>
                  <span className="font-semibold text-gray-200">{sequenceSummary.frameShapeLabel} · {sequenceSummary.sizeLabel}</span>
                </div>
                <div className="flex justify-between items-center text-[11px] text-gray-400">
                  <span>Timebase:</span>
                  <span className="font-semibold text-gray-200">{sequenceSummary.frameRateLabel}</span>
                </div>
                <div className="flex justify-between items-center text-[11px] text-gray-400">
                  <span>Length:</span>
                  <span className="font-semibold text-gray-200">{sequenceSummary.durationLabel}</span>
                </div>
                <div className="flex justify-between items-center text-[11px] text-gray-400">
                  <span>Tracks:</span>
                  <span className="font-semibold text-gray-200">V:{visualClipCount} · A:{audioClipCount}</span>
                </div>
              </div>
            </div>

            {/* PROGRAM TOOLS (MOVED TO SIDEBAR) */}
            {stageMode === 'stage' && (
              <div className="rounded-lg border border-cyan-500/20 bg-[#101520] p-3 flex flex-col gap-3">
                <div className="flex items-center justify-between border-b border-gray-800 pb-2">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-cyan-400">Program Tools</div>
                  {selectedClip && <div className="rounded bg-blue-500/10 px-1.5 py-0.5 text-[9px] font-medium text-blue-300">Clip Selected</div>}
                  {selectedStageObject && <div className="rounded bg-purple-500/10 px-1.5 py-0.5 text-[9px] font-medium text-purple-300">Object Selected</div>}
                  {!selectedClip && !selectedStageObject && <div className="text-[9px] font-medium text-gray-500">No Selection</div>}
                </div>

                {/* Add Elements Section */}
                <div className="flex flex-col gap-1.5">
                  <div className={PROGRAM_TOOLS_SECTION_LABEL_CLASS}>Add Elements</div>
                  <div className="flex gap-2">
                    <button
                      className="flex-1 rounded-lg border border-gray-700/60 bg-[#131722] px-2.5 py-1.5 text-xs font-semibold text-gray-200 hover:border-gray-500 hover:text-white flex items-center justify-center gap-1.5 transition-colors"
                      onClick={() => onAddEditorAsset('text')}
                      type="button"
                    >
                      <Type size={12} />
                      Text
                    </button>
                    <button
                      className="flex-1 rounded-lg border border-gray-700/60 bg-[#131722] px-2.5 py-1.5 text-xs font-semibold text-gray-200 hover:border-gray-500 hover:text-white flex items-center justify-center gap-1.5 transition-colors"
                      onClick={() => onAddEditorAsset('shape')}
                      type="button"
                    >
                      <Square size={12} />
                      Rect
                    </button>
                  </div>
                  <div className={PROGRAM_TOOLS_SECTION_LABEL_CLASS}>Motion Comic</div>
                  <div className="flex gap-2">
                    <button
                      className="flex-1 rounded-lg border border-gray-700/60 bg-[#131722] px-2 py-1.5 text-xs font-semibold text-gray-200 hover:border-cyan-400/60 hover:text-white transition-colors"
                      onClick={() => onAddComicStageObject('speech-bubble')}
                      title="Add a speech bubble to the program stage"
                      type="button"
                    >
                      💬 Speech
                    </button>
                    <button
                      className="flex-1 rounded-lg border border-gray-700/60 bg-[#131722] px-2 py-1.5 text-xs font-semibold text-gray-200 hover:border-cyan-400/60 hover:text-white transition-colors"
                      onClick={() => onAddComicStageObject('thought-bubble')}
                      title="Add a thought bubble to the program stage"
                      type="button"
                    >
                      ☁ Thought
                    </button>
                    <button
                      className="flex-1 rounded-lg border border-gray-700/60 bg-[#131722] px-2 py-1.5 text-xs font-semibold text-gray-200 hover:border-cyan-400/60 hover:text-white transition-colors"
                      onClick={() => onAddComicStageObject('caption')}
                      title="Add a caption box to the program stage"
                      type="button"
                    >
                      ▭ Caption
                    </button>
                  </div>
                </div>

                {/* Selected Clip Tools */}
                {selectedClip && (
                  <div className="flex flex-col gap-3 border-t border-gray-800 pt-2.5">
                    <div className={PROGRAM_TOOLS_SECTION_LABEL_CLASS}>Clip Fit & Align</div>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        className={`px-2 py-1 text-[11px] font-semibold rounded border transition-colors ${
                          (selectedKeyframeState?.fitMode ?? selectedClip.fitMode) === 'contain'
                            ? 'border-blue-400/50 bg-blue-500/20 text-blue-100'
                            : 'border-gray-700/60 bg-[#131722] text-gray-200 hover:border-gray-500 hover:text-white'
                        }`}
                        onClick={() => adjustSelectedClip({ fitMode: 'contain' })}
                        type="button"
                      >
                        Contain
                      </button>
                      <button
                        className={`px-2 py-1 text-[11px] font-semibold rounded border transition-colors ${
                          (selectedKeyframeState?.fitMode ?? selectedClip.fitMode) === 'cover'
                            ? 'border-blue-400/50 bg-blue-500/20 text-blue-100'
                            : 'border-gray-700/60 bg-[#131722] text-gray-200 hover:border-gray-500 hover:text-white'
                        }`}
                        onClick={() => adjustSelectedClip({ fitMode: 'cover' })}
                        type="button"
                      >
                        Cover
                      </button>
                      <button
                        className={`px-2 py-1 text-[11px] font-semibold rounded border transition-colors ${
                          (selectedKeyframeState?.fitMode ?? selectedClip.fitMode) === 'stretch'
                            ? 'border-blue-400/50 bg-blue-500/20 text-blue-100'
                            : 'border-gray-700/60 bg-[#131722] text-gray-200 hover:border-gray-500 hover:text-white'
                        }`}
                        onClick={() => adjustSelectedClip({ fitMode: 'stretch' })}
                        type="button"
                      >
                        Stretch
                      </button>
                      <button
                        className="px-2 py-1 text-[11px] font-semibold rounded border border-gray-700/60 bg-[#131722] text-gray-200 hover:border-gray-500 hover:text-white transition-colors"
                        onClick={() => adjustSelectedClip({ positionX: 0, positionY: 0 })}
                        type="button"
                      >
                        Center
                      </button>
                    </div>

                    <div className={PROGRAM_TOOLS_SECTION_LABEL_CLASS}>Clip Transform</div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        className="px-2 py-1.5 text-[11px] font-medium rounded border border-gray-700/60 bg-[#131722] text-gray-200 hover:border-gray-500 hover:text-white transition-colors"
                        onClick={() => adjustSelectedClip({ scalePercent: Math.max(10, (selectedKeyframeState?.scalePercent ?? selectedClip.scalePercent) - 10) })}
                        type="button"
                      >
                        Scale -10%
                      </button>
                      <button
                        className="px-2 py-1.5 text-[11px] font-medium rounded border border-gray-700/60 bg-[#131722] text-gray-200 hover:border-gray-500 hover:text-white transition-colors"
                        onClick={() => adjustSelectedClip({ scalePercent: Math.min(500, (selectedKeyframeState?.scalePercent ?? selectedClip.scalePercent) + 10) })}
                        type="button"
                      >
                        Scale +10%
                      </button>
                      <button
                        className="px-2 py-1.5 text-[11px] font-medium rounded border border-gray-700/60 bg-[#131722] text-gray-200 hover:border-gray-500 hover:text-white transition-colors"
                        onClick={() => adjustSelectedClip({ rotationDeg: (selectedKeyframeState?.rotationDeg ?? selectedClip.rotationDeg) - 15 })}
                        type="button"
                      >
                        Rotate -15°
                      </button>
                      <button
                        className="px-2 py-1.5 text-[11px] font-medium rounded border border-gray-700/60 bg-[#131722] text-gray-200 hover:border-gray-500 hover:text-white transition-colors"
                        onClick={() => adjustSelectedClip({ rotationDeg: (selectedKeyframeState?.rotationDeg ?? selectedClip.rotationDeg) + 15 })}
                        type="button"
                      >
                        Rotate +15°
                      </button>
                      <button
                        className="px-2 py-1.5 text-[11px] font-medium rounded border border-gray-700/60 bg-[#131722] text-gray-200 hover:border-gray-500 hover:text-white transition-colors"
                        onClick={() => adjustSelectedClip({ opacityPercent: Math.max(0, (selectedKeyframeState?.opacityPercent ?? selectedClip.opacityPercent) - 10) })}
                        type="button"
                      >
                        Opacity -10%
                      </button>
                      <button
                        className="px-2 py-1.5 text-[11px] font-medium rounded border border-gray-700/60 bg-[#131722] text-gray-200 hover:border-gray-500 hover:text-white transition-colors"
                        onClick={() => adjustSelectedClip({ opacityPercent: Math.min(100, (selectedKeyframeState?.opacityPercent ?? selectedClip.opacityPercent) + 10) })}
                        type="button"
                      >
                        Opacity +10%
                      </button>
                    </div>

                    <div className={PROGRAM_TOOLS_SECTION_LABEL_CLASS}>Clip Position Nudge</div>
                    <div className="flex items-center gap-1.5">
                      <button
                        className="flex-1 rounded-lg border border-gray-700/60 bg-[#131722] px-2 py-1.5 text-xs font-semibold text-gray-200 hover:border-gray-500 hover:text-white flex items-center justify-center gap-1 transition-colors"
                        onClick={() => nudgeSelectedClip(-32, 0)}
                        type="button"
                        title="Nudge Left"
                      >
                        <ChevronLeft size={14} />
                        Left
                      </button>
                      <button
                        className="flex-1 rounded-lg border border-gray-700/60 bg-[#131722] px-2 py-1.5 text-xs font-semibold text-gray-200 hover:border-gray-500 hover:text-white flex items-center justify-center gap-1 transition-colors"
                        onClick={() => nudgeSelectedClip(32, 0)}
                        type="button"
                        title="Nudge Right"
                      >
                        <ChevronRight size={14} />
                        Right
                      </button>
                      <button
                        className="flex-1 rounded-lg border border-gray-700/60 bg-[#131722] px-2 py-1.5 text-xs font-semibold text-gray-200 hover:border-gray-500 hover:text-white flex items-center justify-center gap-1 transition-colors"
                        onClick={() => nudgeSelectedClip(0, -32)}
                        type="button"
                        title="Nudge Up"
                      >
                        <ChevronUp size={14} />
                        Up
                      </button>
                      <button
                        className="flex-1 rounded-lg border border-gray-700/60 bg-[#131722] px-2 py-1.5 text-xs font-semibold text-gray-200 hover:border-gray-500 hover:text-white flex items-center justify-center gap-1 transition-colors"
                        onClick={() => nudgeSelectedClip(0, 32)}
                        type="button"
                        title="Nudge Down"
                      >
                        <ChevronDown size={14} />
                        Down
                      </button>
                    </div>

                    <button
                      className="mt-1 w-full px-2.5 py-1.5 text-[11px] font-semibold rounded border border-gray-700/60 bg-[#1b1c24]/80 hover:bg-gray-800 text-gray-300 hover:text-white transition-colors"
                      onClick={() =>
                        onUpdateClip(selectedClip.id, ensureVisualClipHasKeyframes({
                          ...selectedClip,
                          fitMode: 'contain',
                          scalePercent: 100,
                          endScalePercent: 100,
                          scaleMotionEnabled: false,
                          positionX: 0,
                          positionY: 0,
                          endPositionX: 0,
                          endPositionY: 0,
                          motionEnabled: false,
                          rotationDeg: 0,
                          rotationMotionEnabled: false,
                          endRotationDeg: 0,
                          opacityPercent: 100,
                          opacityAutomationPoints: undefined,
                          keyframes: undefined,
                          flipHorizontal: false,
                          flipVertical: false,
                        }))
                      }
                      type="button"
                    >
                      Reset Clip Properties
                    </button>
                  </div>
                )}

                {/* Selected Stage Object Tools */}
                {selectedStageObject && (
                  <div className="flex flex-col gap-3 border-t border-gray-800 pt-2.5">
                    <div className={PROGRAM_TOOLS_SECTION_LABEL_CLASS}>Object Transform</div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        className="px-2 py-1.5 text-[11px] font-medium rounded border border-gray-700/60 bg-[#131722] text-gray-200 hover:border-gray-500 hover:text-white transition-colors"
                        onClick={() => adjustSelectedStageObject({ rotationDeg: selectedStageObject.rotationDeg - 15 })}
                        type="button"
                      >
                        Rotate -15°
                      </button>
                      <button
                        className="px-2 py-1.5 text-[11px] font-medium rounded border border-gray-700/60 bg-[#131722] text-gray-200 hover:border-gray-500 hover:text-white transition-colors"
                        onClick={() => adjustSelectedStageObject({ rotationDeg: selectedStageObject.rotationDeg + 15 })}
                        type="button"
                      >
                        Rotate +15°
                      </button>
                      <button
                        className="px-2 py-1.5 text-[11px] font-medium rounded border border-gray-700/60 bg-[#131722] text-gray-200 hover:border-gray-500 hover:text-white transition-colors"
                        onClick={() => adjustSelectedStageObject({ opacityPercent: Math.max(0, selectedStageObject.opacityPercent - 10) })}
                        type="button"
                      >
                        Opacity -10%
                      </button>
                      <button
                        className="px-2 py-1.5 text-[11px] font-medium rounded border border-gray-700/60 bg-[#131722] text-gray-200 hover:border-gray-500 hover:text-white transition-colors"
                        onClick={() => adjustSelectedStageObject({ opacityPercent: Math.min(100, selectedStageObject.opacityPercent + 10) })}
                        type="button"
                      >
                        Opacity +10%
                      </button>
                    </div>

                    <div className={PROGRAM_TOOLS_SECTION_LABEL_CLASS}>Object Position Nudge</div>
                    <div className="flex items-center gap-1.5">
                      <button
                        className="flex-1 rounded-lg border border-gray-700/60 bg-[#131722] px-2 py-1.5 text-xs font-semibold text-gray-200 hover:border-gray-500 hover:text-white flex items-center justify-center gap-1 transition-colors"
                        onClick={() => nudgeSelectedStageObject(-32, 0)}
                        type="button"
                        title="Object Nudge Left"
                      >
                        <ChevronLeft size={14} />
                        Left
                      </button>
                      <button
                        className="flex-1 rounded-lg border border-gray-700/60 bg-[#131722] px-2 py-1.5 text-xs font-semibold text-gray-200 hover:border-gray-500 hover:text-white flex items-center justify-center gap-1 transition-colors"
                        onClick={() => nudgeSelectedStageObject(32, 0)}
                        type="button"
                        title="Object Nudge Right"
                      >
                        <ChevronRight size={14} />
                        Right
                      </button>
                      <button
                        className="flex-1 rounded-lg border border-gray-700/60 bg-[#131722] px-2 py-1.5 text-xs font-semibold text-gray-200 hover:border-gray-500 hover:text-white flex items-center justify-center gap-1 transition-colors"
                        onClick={() => nudgeSelectedStageObject(0, -32)}
                        type="button"
                        title="Object Nudge Up"
                      >
                        <ChevronUp size={14} />
                        Up
                      </button>
                      <button
                        className="flex-1 rounded-lg border border-gray-700/60 bg-[#131722] px-2 py-1.5 text-xs font-semibold text-gray-200 hover:border-gray-500 hover:text-white flex items-center justify-center gap-1 transition-colors"
                        onClick={() => nudgeSelectedStageObject(0, 32)}
                        type="button"
                        title="Object Nudge Down"
                      >
                        <ChevronDown size={14} />
                        Down
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Section: Quick Controls */}
            <div className="flex flex-col gap-2.5">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Settings</div>
              <ProgramMonitorQuickControls
                aspectRatio={aspectRatio}
                exportPresetPlan={exportPresetPlan}
                frameRate={frameRate}
                hasCaptionCues={hasCaptionCues}
                onAspectRatioChange={onAspectRatioChange}
                onExportCaptions={onExportCaptions}
                onExportPresetPlanChange={onExportPresetPlanChange}
                onFrameRateChange={onFrameRateChange}
                onResolutionChange={onResolutionChange}
                parityDiagnostics={parityDiagnostics}
                videoResolution={videoResolution}
              />
            </div>

            {/* Section: Status */}
            <div className="flex flex-col gap-2.5">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Status</div>
              <div className="flex flex-col gap-2">
                <VideoExportReadinessPill summary={exportReadiness} />
                <VideoRenderBackendPill summary={renderBackendStatus} />
              </div>

              {incrementalRenderSummary && (
                <div className="mt-1 p-2 rounded border border-amber-500/20 bg-amber-500/5 text-[11px] text-amber-200/90 leading-normal">
                  <span className="font-semibold text-amber-300">Render cache:</span> {incrementalRenderSummary}
                </div>
              )}
            </div>

            {/* Section: Cache Manifest Details */}
            {renderCacheDetailLines.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Cache Manifest Details</div>
                <div
                  className="flex flex-col gap-1 rounded-md border border-cyan-300/20 bg-cyan-500/10 px-2.5 py-2 text-[11px] leading-4 text-cyan-50/90"
                  data-video-render-cache-details="true"
                >
                  {renderCacheDetailLines.slice(0, 4).map((line) => (
                    <div key={line}>{line}</div>
                  ))}
                  {renderCacheDetailLines.length > 4 ? (
                    <div className="text-cyan-100/65">
                      {renderCacheDetailLines.length - 4} more span{renderCacheDetailLines.length - 4 === 1 ? '' : 's'} in this render plan.
                    </div>
                  ) : null}
                </div>
              </div>
            )}

            {/* Section: Bottom Actions */}
            <div className="mt-auto flex flex-col gap-2 pt-2 border-t border-gray-800">
              {previewUrl && (
                <button
                  className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-700/60 bg-[#0f131b] px-3 py-2 text-[11px] font-semibold text-gray-200 transition-colors hover:border-gray-500 hover:text-white"
                  onClick={() => void handleSaveVideo()}
                  type="button"
                >
                  <Archive size={12} />
                  {isImageSequenceOutput ? 'Save ZIP' : 'Save Video'}
                </button>
              )}
              <button
                className={`w-full inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-semibold transition-colors ${
                  isRunning
                    ? 'bg-amber-400 text-black shadow-[0_0_18px_rgba(251,191,36,0.35)]'
                    : renderBlockedReason
                      ? 'cursor-not-allowed bg-gray-700 text-gray-400'
                    : 'bg-white text-black hover:bg-gray-200'
                }`}
                data-video-render-button="true"
                disabled={Boolean(renderBlockedReason)}
                onClick={onRun}
                title={renderBlockedReason}
                type="button"
              >
                <Play size={12} fill="currentColor" />
                {isRunning ? 'Rendering…' : 'Render'}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function getImageSequenceFrameCount(metadata: Record<string, unknown> | undefined): number | undefined {
  if (!metadata || metadata.imageSequence !== true) {
    return undefined;
  }

  return typeof metadata.frameCount === 'number' && Number.isFinite(metadata.frameCount)
    ? metadata.frameCount
    : undefined;
}

type RenderedPreviewDescriptorStatus = 'idle' | 'rendering' | 'completed' | 'failed' | 'unsupported';

interface RenderedPreviewDescriptor {
  status: RenderedPreviewDescriptorStatus;
  title: string;
  detail: string;
  metadata: string[];
}

function buildRenderedPreviewDescriptor({
  previewUrl,
  previewOutputMetadata,
  isRunning,
  renderStatusMessage,
  errorMessage,
  isImageSequenceOutput,
}: {
  previewUrl?: string;
  previewOutputMetadata?: Record<string, unknown>;
  isRunning?: boolean;
  renderStatusMessage?: string;
  errorMessage?: string;
  isImageSequenceOutput: boolean;
}): RenderedPreviewDescriptor {
  const fileName = getPreviewMetadataString(previewOutputMetadata, ['fileName', 'outputFileName', 'name', 'label']);
  const mimeType = getPreviewMetadataString(previewOutputMetadata, ['mimeType', 'outputMimeType']);
  const frameCount = getPreviewMetadataNumber(previewOutputMetadata, ['frameCount']);
  const previewSupportLabel = getBrowserPreviewSupportLabel(fileName, mimeType);
  const metadata: string[] = [];

  if (fileName) {
    metadata.push(fileName);
  }
  if (mimeType) {
    metadata.push(mimeType);
  }
  if (typeof frameCount === 'number') {
    metadata.push(`${frameCount} frame${frameCount === 1 ? '' : 's'}`);
  }
  if (previewUrl?.startsWith('blob:')) {
    metadata.push('Blob URL ready');
  }

  if (isRunning) {
    return {
      status: 'rendering',
      title: 'Rendering preview',
      detail: renderStatusMessage?.trim() || 'Signal Loom is rendering the current composition.',
      metadata,
    };
  }

  if (errorMessage?.trim()) {
    return {
      status: 'failed',
      title: 'Render failed',
      detail: errorMessage.trim(),
      metadata,
    };
  }

  if (previewUrl) {
    return {
      status: 'completed',
      title: isImageSequenceOutput ? 'Render complete' : 'Preview ready',
      detail: isImageSequenceOutput
        ? (renderStatusMessage?.trim() || 'Rendered output is available as an image-sequence archive.')
        : (renderStatusMessage?.trim() || 'Playable rendered preview is ready in the Program Monitor.'),
      metadata,
    };
  }

  if (renderStatusMessage?.trim() || previewOutputMetadata) {
    return {
      status: 'unsupported',
      title: 'Preview unavailable',
      detail: renderStatusMessage?.trim()
        || previewSupportLabel
        || 'The last render completed without a browser-playable preview asset.',
      metadata: previewSupportLabel ? [...metadata, previewSupportLabel] : metadata,
    };
  }

  return {
    status: 'idle',
    title: 'Ready to render',
    detail: 'Run Render to build a playable Program Monitor preview for this composition.',
    metadata,
  };
}

function getPreviewMetadataString(
  metadata: Record<string, unknown> | undefined,
  keys: readonly string[],
): string | undefined {
  if (!metadata) {
    return undefined;
  }

  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
}

function getPreviewMetadataNumber(
  metadata: Record<string, unknown> | undefined,
  keys: readonly string[],
): number | undefined {
  if (!metadata) {
    return undefined;
  }

  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }

  return undefined;
}

function VideoPremiereParityPanel() {
  const highPriorityRows = getHighPriorityVideoParityRows();
  const rows = VIDEO_PREMIERE_PARITY_ROWS;

  return (
    <div className="border-b border-gray-700/60 bg-[#0f131b]/70 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-200/90">
            Export Readiness
          </div>
          <div className="mt-0.5 text-[11px] text-gray-500">Prioritized for Flow/Image/Paper-generated media.</div>
        </div>
        <div className="rounded-full border border-cyan-400/25 bg-cyan-500/10 px-2 py-1 text-[10px] font-semibold text-cyan-100">
          {highPriorityRows.length} high
        </div>
      </div>
      <div className="mt-2 space-y-1.5">
        {rows.map((row) => (
          <div className="rounded-lg border border-gray-700/60 bg-[#111217]/65 p-2" key={row.id}>
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] font-semibold text-gray-100">{row.area}</div>
              <div className="flex items-center gap-1">
                <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] ${videoParityStatusClassName(row.status)}`}>
                  {row.status}
                </span>
                <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-amber-100">
                  {row.priority}
                </span>
              </div>
            </div>
            <div className="mt-1 grid gap-1 text-[10px] leading-4 text-gray-400 md:grid-cols-2">
              <div><span className="text-gray-500">Premiere:</span> {row.premiere}</div>
              <div><span className="text-gray-500">Signal Loom:</span> {row.signalLoom}</div>
            </div>
            <div className="mt-1 text-[10px] leading-4 text-cyan-100/85">{row.workflowImpact}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function videoParityStatusClassName(status: 'done' | 'partial' | 'gap'): string {
  switch (status) {
    case 'done':
      return 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100';
    case 'partial':
      return 'border-amber-400/30 bg-amber-500/10 text-amber-100';
    case 'gap':
      return 'border-red-400/30 bg-red-500/10 text-red-100';
  }
}

function RenderedPreviewStatusPanel({
  state,
  renderStatusMessage,
  errorMessage,
}: {
  state: 'waiting' | 'error' | 'empty' | 'idle';
  renderStatusMessage?: string;
  errorMessage?: string;
}) {
  const title = state === 'waiting'
    ? 'Rendering preview'
    : state === 'error'
      ? 'Rendered preview unavailable'
      : state === 'empty'
        ? 'Rendered preview unavailable'
        : 'No rendered preview yet';
  const detail = state === 'waiting'
    ? (renderStatusMessage?.trim() || 'Signal Loom is rendering the current composition.')
    : state === 'error'
      ? (errorMessage?.trim() || 'The last render did not produce a playable preview asset.')
      : state === 'empty'
        ? (renderStatusMessage?.trim() || 'The last render completed without a playable preview asset.')
        : 'Run Render to build a playable Program Monitor preview for this composition.';
  const toneClassName = state === 'error'
    ? 'border-red-400/30 bg-red-500/10 text-red-50'
    : state === 'waiting'
      ? 'border-amber-300/30 bg-amber-500/10 text-amber-50'
      : 'border-gray-700/60 bg-[#0f131b] text-gray-100';
  const iconClassName = state === 'error'
    ? 'border-red-300/30 bg-red-500/15 text-red-100'
    : state === 'waiting'
      ? 'border-amber-300/30 bg-amber-500/15 text-amber-100'
      : 'border-cyan-300/20 bg-cyan-400/10 text-cyan-100';

  return (
    <div className="flex h-full min-h-0 items-center justify-center" data-video-rendered-preview-state={state}>
      <div className={`max-w-md rounded-2xl border p-5 text-center shadow-2xl shadow-black/30 ${toneClassName}`}>
        <div className={`mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border ${iconClassName}`}>
          <Film size={20} />
        </div>
        <div className="mt-3 text-sm font-semibold">{title}</div>
        <div className="mt-1 text-xs leading-5 opacity-85">{detail}</div>
      </div>
    </div>
  );
}

function RenderedPreviewDescriptorStrip({ descriptor }: { descriptor: RenderedPreviewDescriptor }) {
  const statusClassName = descriptor.status === 'completed'
    ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-50'
    : descriptor.status === 'rendering'
      ? 'border-amber-300/30 bg-amber-500/10 text-amber-50'
      : descriptor.status === 'failed'
        ? 'border-red-400/30 bg-red-500/10 text-red-50'
        : descriptor.status === 'unsupported'
          ? 'border-purple-300/30 bg-purple-500/10 text-purple-50'
          : 'border-gray-700/60 bg-[#0f131b] text-gray-100';
  const badgeClassName = descriptor.status === 'completed'
    ? 'border-emerald-300/30 bg-emerald-500/15 text-emerald-100'
    : descriptor.status === 'rendering'
      ? 'border-amber-300/30 bg-amber-500/15 text-amber-100'
      : descriptor.status === 'failed'
        ? 'border-red-300/30 bg-red-500/15 text-red-100'
        : descriptor.status === 'unsupported'
          ? 'border-purple-300/30 bg-purple-500/15 text-purple-100'
          : 'border-cyan-300/20 bg-cyan-400/10 text-cyan-100';

  return (
    <div
      className={`mb-2 shrink-0 rounded-lg border px-3 py-2 ${statusClassName}`}
      data-video-render-preview-status={descriptor.status}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-85">
            {descriptor.title}
          </div>
          <div className="mt-1 text-xs leading-5 opacity-90">{descriptor.detail}</div>
        </div>
        <div className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${badgeClassName}`}>
          {descriptor.status}
        </div>
      </div>
      {descriptor.metadata.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {descriptor.metadata.map((item) => (
            <span
              className="rounded-full border border-white/10 bg-black/15 px-2 py-0.5 text-[10px] leading-4 opacity-90"
              key={item}
            >
              {item}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ProgramMonitorQuickControls({
  aspectRatio,
  videoResolution,
  frameRate,
  exportPresetPlan,
  hasCaptionCues,
  parityDiagnostics,
  onAspectRatioChange,
  onResolutionChange,
  onFrameRateChange,
  onExportCaptions,
  onExportPresetPlanChange,
}: {
  aspectRatio: AspectRatio;
  videoResolution: VideoResolution;
  frameRate: number;
  exportPresetPlan: VideoExportPresetPlanData;
  hasCaptionCues: boolean;
  parityDiagnostics: ReturnType<typeof buildVideoParityDiagnostics>;
  onAspectRatioChange: (aspectRatio: AspectRatio) => void;
  onResolutionChange: (videoResolution: VideoResolution) => void;
  onFrameRateChange: (frameRate: number) => void;
  onExportCaptions: (format: 'srt' | 'vtt') => void;
  onExportPresetPlanChange: (presetId: VideoExportPresetPlanId) => void;
}) {
  const selectedPreset = getVideoExportPresetOption(exportPresetPlan.presetId);
  const attentionCount = parityDiagnostics.filter((diagnostic) => diagnostic.severity === 'attention').length;

  return (
    <div className="flex flex-col w-full gap-3 rounded-lg border border-gray-800 bg-[#0f131b]/40 p-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="block space-y-1 text-[10px] text-gray-500">
          <span>Frame</span>
          <select
            className="w-full rounded-md border border-gray-700/60 bg-[#111217] px-2 py-1 text-[11px] font-medium text-gray-200 outline-none"
            onChange={(event) => onAspectRatioChange(event.target.value as AspectRatio)}
            value={aspectRatio}
          >
            <option value="16:9">Landscape</option>
            <option value="9:16">Vertical</option>
            <option value="1:1">Square</option>
          </select>
        </label>
        <label className="block space-y-1 text-[10px] text-gray-500">
          <span>Size</span>
          <select
            className="w-full rounded-md border border-gray-700/60 bg-[#111217] px-2 py-1 text-[11px] font-medium text-gray-200 outline-none"
            onChange={(event) => onResolutionChange(event.target.value as VideoResolution)}
            value={videoResolution}
          >
            <option value="720p">720p</option>
            <option value="1080p">1080p</option>
            <option value="4k">4k</option>
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="block space-y-1 text-[10px] text-gray-500">
          <span>FPS</span>
          <select
            className="w-full rounded-md border border-gray-700/60 bg-[#111217] px-2 py-1 text-[11px] font-medium text-gray-200 outline-none"
            onChange={(event) => onFrameRateChange(Number(event.target.value))}
            value={frameRate}
          >
            <option value={24}>24</option>
            <option value={25}>25</option>
            <option value={30}>30</option>
            <option value={60}>60</option>
          </select>
        </label>

        <div className="block space-y-1 text-[10px] text-gray-500">
          <span>Verify Diagnostics</span>
          <details className="relative w-full">
            <summary className="cursor-pointer list-none rounded-md border border-amber-300/25 bg-amber-500/10 px-2 py-1 text-[10px] font-semibold text-amber-100 text-center">
              {attentionCount > 0 ? `${attentionCount} Attention` : 'All Pass'}
            </summary>
            <div className="absolute right-0 top-7 z-50 max-h-52 w-64 overflow-y-auto rounded-lg border border-amber-300/25 bg-[#111217] p-2 shadow-xl">
              {parityDiagnostics.map((diagnostic) => (
                <div
                  className={`mb-1.5 rounded-md border px-2 py-1.5 text-[10px] leading-4 ${
                    diagnostic.severity === 'attention'
                      ? 'border-amber-300/25 bg-amber-950/35 text-amber-50/90'
                      : 'border-emerald-300/25 bg-emerald-950/25 text-emerald-50/90'
                  }`}
                  key={diagnostic.id}
                >
                  <div className="font-semibold">{diagnostic.title}</div>
                  <div className="mt-0.5 opacity-85">{diagnostic.detail}</div>
                </div>
              ))}
            </div>
          </details>
        </div>
      </div>

      <label className="block w-full space-y-1 text-[10px] text-purple-100/70">
        <span>Export Codec & Profile</span>
        <select
          className="w-full rounded-md border border-purple-300/25 bg-[#111217] px-2 py-1 text-[11px] font-medium text-gray-100 outline-none"
          onChange={(event) => onExportPresetPlanChange(event.target.value as VideoExportPresetPlanId)}
          value={exportPresetPlan.presetId}
        >
          {VIDEO_EXPORT_PRESET_OPTIONS.map((preset) => (
            <option disabled={!preset.capabilities.browser} key={preset.id} value={preset.id}>
              {preset.label}{preset.capabilities.browser ? '' : ' (native/unavailable)'}
            </option>
          ))}
        </select>
      </label>

      <div className="flex items-center justify-between gap-2 border-t border-gray-800/60 pt-2">
        <span className="text-[10px] text-gray-500">Export Captions:</span>
        <div className="flex gap-1.5">
          <button
            className="rounded-md border border-purple-300/25 bg-[#111217] px-2 py-0.5 text-[10px] font-semibold text-purple-50 disabled:cursor-not-allowed disabled:opacity-45 hover:border-purple-300/40"
            disabled={!hasCaptionCues}
            onClick={() => onExportCaptions('srt')}
            type="button"
          >
            SRT
          </button>
          <button
            className="rounded-md border border-purple-300/25 bg-[#111217] px-2 py-0.5 text-[10px] font-semibold text-purple-50 disabled:cursor-not-allowed disabled:opacity-45 hover:border-purple-300/40"
            disabled={!hasCaptionCues}
            onClick={() => onExportCaptions('vtt')}
            type="button"
          >
            VTT
          </button>
        </div>
      </div>

      <div className="truncate text-[9px] text-gray-500 leading-tight">
        {selectedPreset.container} · .{selectedPreset.extension} · {selectedPreset.codec}
      </div>
    </div>
  );
}

function SequenceSettingsPanel({
  aspectRatio,
  videoResolution,
  frameRate,
  sequenceSummary,
  onAspectRatioChange,
  onResolutionChange,
  onFrameRateChange,
}: {
  aspectRatio: AspectRatio;
  videoResolution: VideoResolution;
  frameRate: number;
  sequenceSummary: ReturnType<typeof buildVideoSequenceSummary>;
  onAspectRatioChange: (aspectRatio: AspectRatio) => void;
  onResolutionChange: (videoResolution: VideoResolution) => void;
  onFrameRateChange: (frameRate: number) => void;
}) {
  return (
    <div className="rounded-lg border border-gray-700/60 bg-[#0f131b] p-2">
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-500">Sequence Settings</div>
      <div className="grid gap-1.5 sm:grid-cols-2">
        <label className="block space-y-1 text-[10px] text-gray-500">
          <span>Frame shape</span>
          <select
            className="w-full rounded-md border border-gray-700/60 bg-[#111217] px-2 py-1.5 text-[11px] font-medium text-gray-200 outline-none"
            onChange={(event) => onAspectRatioChange(event.target.value as AspectRatio)}
            value={aspectRatio}
          >
            <option value="16:9">Landscape 16:9</option>
            <option value="9:16">Vertical 9:16</option>
            <option value="1:1">Square 1:1</option>
          </select>
        </label>
        <label className="block space-y-1 text-[10px] text-gray-500">
          <span>Frame size</span>
          <select
            className="w-full rounded-md border border-gray-700/60 bg-[#111217] px-2 py-1.5 text-[11px] font-medium text-gray-200 outline-none"
            onChange={(event) => onResolutionChange(event.target.value as VideoResolution)}
            value={videoResolution}
          >
            <option value="720p">720p</option>
            <option value="1080p">1080p</option>
            <option value="4k">4k</option>
          </select>
        </label>
        <label className="block space-y-1 text-[10px] text-gray-500 sm:col-span-2">
          <span>Frame rate</span>
          <select
            className="w-full rounded-md border border-gray-700/60 bg-[#111217] px-2 py-1.5 text-[11px] font-medium text-gray-200 outline-none"
            onChange={(event) => onFrameRateChange(Number(event.target.value))}
            value={frameRate}
          >
            <option value={24}>24 fps</option>
            <option value={25}>25 fps</option>
            <option value={30}>30 fps</option>
            <option value={60}>60 fps</option>
          </select>
        </label>
      </div>
      <div className="mt-1.5 text-[10px] leading-4 text-gray-400">
        {sequenceSummary.sizeLabel} · {sequenceSummary.frameRateLabel} · {sequenceSummary.durationLabel}
      </div>
    </div>
  );
}

function ExportPresetPanel({
  exportPresetPlan,
  hasCaptionCues,
  onExportCaptions,
  onExportPresetPlanChange,
}: {
  exportPresetPlan: VideoExportPresetPlanData;
  hasCaptionCues: boolean;
  onExportCaptions: (format: 'srt' | 'vtt') => void;
  onExportPresetPlanChange: (presetId: VideoExportPresetPlanId) => void;
}) {
  const selectedPreset = getVideoExportPresetOption(exportPresetPlan.presetId);

  return (
    <div className="rounded-lg border border-purple-400/25 bg-purple-500/10 p-2">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-purple-100">Export Preset</div>
        <span className="rounded-full border border-purple-300/30 bg-purple-200/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-purple-100">
          Browser active
        </span>
      </div>
      <label className="block space-y-1 text-[10px] text-purple-100/70">
        <span>Delivery preset</span>
        <select
          className="w-full rounded-md border border-purple-300/25 bg-[#111217] px-2 py-1.5 text-[11px] font-medium text-gray-100 outline-none"
          onChange={(event) => onExportPresetPlanChange(event.target.value as VideoExportPresetPlanId)}
          value={exportPresetPlan.presetId}
        >
          {VIDEO_EXPORT_PRESET_OPTIONS.map((preset) => (
            <option disabled={!preset.capabilities.browser} key={preset.id} value={preset.id}>{preset.label}{preset.capabilities.browser ? '' : ' (native/unavailable)'}</option>
          ))}
        </select>
      </label>
      <div className="mt-1.5 text-[10px] leading-4 text-purple-50/80">
        {selectedPreset.container} .{selectedPreset.extension} · {selectedPreset.codec}
        {selectedPreset.crf ? ` · CRF ${selectedPreset.crf}` : ''}
        {selectedPreset.bitrate ? ` · ${selectedPreset.bitrate}` : ''}. {selectedPreset.caveat}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button
          className="rounded-md border border-purple-300/25 bg-[#111217] px-2 py-1 text-[10px] font-semibold text-purple-50 disabled:cursor-not-allowed disabled:opacity-45"
          disabled={!hasCaptionCues}
          onClick={() => onExportCaptions('srt')}
          type="button"
        >
          Export SRT
        </button>
        <button
          className="rounded-md border border-purple-300/25 bg-[#111217] px-2 py-1 text-[10px] font-semibold text-purple-50 disabled:cursor-not-allowed disabled:opacity-45"
          disabled={!hasCaptionCues}
          onClick={() => onExportCaptions('vtt')}
          type="button"
        >
          Export VTT
        </button>
      </div>
    </div>
  );
}

function ParityDiagnosticsPanel({
  diagnostics,
}: {
  diagnostics: ReturnType<typeof buildVideoParityDiagnostics>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const attentionCount = diagnostics.filter((diagnostic) => diagnostic.severity === 'attention').length;

  return (
    <div className="rounded-lg border border-amber-400/25 bg-amber-500/10 p-2">
      <button
        className="flex w-full items-center justify-between gap-2 text-left"
        onClick={() => setIsOpen((value) => !value)}
        type="button"
      >
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-100">Export Verification</span>
        <span className="rounded-full border border-amber-300/30 bg-amber-200/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-amber-100">
          {attentionCount > 0 ? `${attentionCount} attention` : 'Pass'}
        </span>
      </button>
      {isOpen ? (
        <div className="mt-2 max-h-40 space-y-1.5 overflow-y-auto pr-1">
          {diagnostics.map((diagnostic) => (
            <div
              className={`rounded-md border px-2 py-1.5 text-[10px] leading-4 ${
                diagnostic.severity === 'attention'
                  ? 'border-amber-300/25 bg-amber-950/35 text-amber-50/90'
                  : 'border-emerald-300/25 bg-emerald-950/25 text-emerald-50/90'
              }`}
              key={diagnostic.id}
            >
              <div className="font-semibold">{diagnostic.title}</div>
              <div className="mt-0.5 opacity-85">{diagnostic.detail}</div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ProgramStage({
  stageClips,
  stageObjects,
  selectedClip,
  selectedStageObject,
  canvas,
  aspectRatioValue,
  activeTool,
  onSelectClip,
  onSelectStageObject,
  onUpdateClip,
  onUpdateStageObject,
  onOpenClipContextMenu,
  onOpenContextMenu,
}: {
  stageClips: ProgramStageClip[];
  stageObjects: EditorStageObject[];
  selectedClip?: EditorVisualClip;
  selectedStageObject?: EditorStageObject;
  canvas: { width: number; height: number };
  aspectRatioValue: number;
  activeTool: TimelineTool;
  onSelectClip: (clipId: string) => void;
  onSelectStageObject: (objectId: string) => void;
  onUpdateClip: (clipId: string, patch: Partial<EditorVisualClip>) => void;
  onUpdateStageObject: (objectId: string, patch: Partial<EditorStageObject>) => void;
  onOpenClipContextMenu: (clipId: string, event: React.MouseEvent<HTMLElement>) => void;
  onOpenContextMenu: (event: React.MouseEvent<HTMLDivElement>) => void;
}) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [stageViewportSize, setStageViewportSize] = useState<{ width: number; height: number }>({
    width: canvas.width,
    height: canvas.height,
  });


  const startMoveDrag = (event: React.PointerEvent<HTMLButtonElement>, stageClip: ProgramStageClip) => {
    if (event.button !== 0 || activeTool !== 'select' || !stageRef.current) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const { clip } = stageClip;
    onSelectClip(clip.id);

    const stageBounds = stageRef.current.getBoundingClientRect();
    const stageScale = stageBounds.width / canvas.width;
    const startX = event.clientX;
    const startY = event.clientY;
    const progressPercent = getStageClipProgress(stageClip) * 100;
    const startState = getVisualKeyframeStateAtProgress(clip, progressPercent);
    const startPositionX = startState.positionX;
    const startPositionY = startState.positionY;

    const onMove = (moveEvent: PointerEvent) => {
      const deltaX = (moveEvent.clientX - startX) / stageScale;
      const deltaY = (moveEvent.clientY - startY) / stageScale;
      onUpdateClip(clip.id, applyVisualClipPatchAtProgress(clip, progressPercent, {
        positionX: Math.round(startPositionX + deltaX),
        positionY: Math.round(startPositionY + deltaY),
      }));
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const startScaleDrag = (
    event: React.PointerEvent<HTMLButtonElement>,
    stageClip: ProgramStageClip,
    frameElement: HTMLDivElement,
  ) => {
    if (activeTool !== 'select') {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const { clip } = stageClip;
    onSelectClip(clip.id);

    const frameBounds = frameElement.getBoundingClientRect();
    const centerX = frameBounds.left + frameBounds.width / 2;
    const centerY = frameBounds.top + frameBounds.height / 2;
    const progressPercent = getStageClipProgress(stageClip) * 100;
    const startScale = getVisualKeyframeStateAtProgress(clip, progressPercent).scalePercent;
    const startDistance = Math.max(16, Math.hypot(event.clientX - centerX, event.clientY - centerY));

    const onMove = (moveEvent: PointerEvent) => {
      const nextDistance = Math.max(16, Math.hypot(moveEvent.clientX - centerX, moveEvent.clientY - centerY));
      onUpdateClip(clip.id, applyVisualClipPatchAtProgress(clip, progressPercent, {
        scalePercent: Math.max(10, Math.min(500, Math.round(startScale * (nextDistance / startDistance)))),
      }));
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const startRotationDrag = (
    event: React.PointerEvent<HTMLButtonElement>,
    stageClip: ProgramStageClip,
    frameElement: HTMLDivElement,
  ) => {
    if (activeTool !== 'select') {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const { clip } = stageClip;
    onSelectClip(clip.id);

    const frameBounds = frameElement.getBoundingClientRect();
    const centerX = frameBounds.left + frameBounds.width / 2;
    const centerY = frameBounds.top + frameBounds.height / 2;
    const startAngle = Math.atan2(event.clientY - centerY, event.clientX - centerX);
    const progressPercent = getStageClipProgress(stageClip) * 100;
    const startRotation = getVisualKeyframeStateAtProgress(clip, progressPercent).rotationDeg;

    const onMove = (moveEvent: PointerEvent) => {
      const nextAngle = Math.atan2(moveEvent.clientY - centerY, moveEvent.clientX - centerX);
      const deltaDegrees = ((nextAngle - startAngle) * 180) / Math.PI;
      onUpdateClip(
        clip.id,
        applyVisualClipPatchAtProgress(clip, progressPercent, { rotationDeg: Math.round(startRotation + deltaDegrees) }),
      );
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const startStageObjectMoveDrag = (
    event: React.PointerEvent<HTMLElement>,
    object: EditorStageObject,
  ) => {
    if (event.button !== 0 || activeTool !== 'select' || !stageRef.current) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onSelectStageObject(object.id);

    const stageBounds = stageRef.current.getBoundingClientRect();
    const stageScale = stageBounds.width / canvas.width;
    const startX = event.clientX;
    const startY = event.clientY;
    const startObjectX = object.x;
    const startObjectY = object.y;

    const onMove = (moveEvent: PointerEvent) => {
      const deltaX = (moveEvent.clientX - startX) / stageScale;
      const deltaY = (moveEvent.clientY - startY) / stageScale;
      onUpdateStageObject(object.id, {
        x: Math.round(startObjectX + deltaX),
        y: Math.round(startObjectY + deltaY),
      });
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const startStageObjectResizeDrag = (
    event: React.PointerEvent<HTMLButtonElement>,
    object: EditorStageObject,
  ) => {
    if (activeTool !== 'select' || !stageRef.current) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onSelectStageObject(object.id);

    const stageBounds = stageRef.current.getBoundingClientRect();
    const stageScale = stageBounds.width / canvas.width;
    const startX = event.clientX;
    const startY = event.clientY;
    const startWidth = object.width;
    const startHeight = object.height;

    const onMove = (moveEvent: PointerEvent) => {
      onUpdateStageObject(object.id, {
        width: Math.max(24, Math.round(startWidth + (moveEvent.clientX - startX) / stageScale)),
        height: Math.max(24, Math.round(startHeight + (moveEvent.clientY - startY) / stageScale)),
      });
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const startStageObjectRotationDrag = (
    event: React.PointerEvent<HTMLButtonElement>,
    object: EditorStageObject,
    frameElement: HTMLDivElement,
  ) => {
    if (activeTool !== 'select') {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onSelectStageObject(object.id);

    const frameBounds = frameElement.getBoundingClientRect();
    const centerX = frameBounds.left + frameBounds.width / 2;
    const centerY = frameBounds.top + frameBounds.height / 2;
    const startAngle = Math.atan2(event.clientY - centerY, event.clientX - centerX);
    const startRotation = object.rotationDeg;

    const onMove = (moveEvent: PointerEvent) => {
      const nextAngle = Math.atan2(moveEvent.clientY - centerY, moveEvent.clientX - centerX);
      const deltaDegrees = ((nextAngle - startAngle) * 180) / Math.PI;
      onUpdateStageObject(object.id, { rotationDeg: Math.round(startRotation + deltaDegrees) });
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  useEffect(() => {
    const stage = stageRef.current;

    if (!stage) {
      return;
    }

    const update = () => {
      setStageViewportSize({
        width: Math.max(1, Math.round(stage.clientWidth)),
        height: Math.max(1, Math.round(stage.clientHeight)),
      });
    };

    update();

    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(stage);

    return () => {
      resizeObserver.disconnect();
    };
  }, [canvas.height, canvas.width]);

  const stageScale = Math.max(
    0.0001,
    Math.min(
      stageViewportSize.width / Math.max(1, canvas.width),
      stageViewportSize.height / Math.max(1, canvas.height),
    ),
  );

  return (
    <div className="h-full min-h-0">
      <MonitorStageFrame aspectRatioValue={aspectRatioValue}>
        <div
          className="absolute inset-0 overflow-hidden bg-black"
          onContextMenu={onOpenContextMenu}
          ref={stageRef}
        >
          {stageClips.length > 0
            ? (
            stageClips.map((stageClip) => {
              const layout = getStageClipLayout(stageClip, canvas);
              const isSelected = selectedClip?.id === stageClip.clip.id;

              return (
                <div
                  key={stageClip.clip.id}
                  className="absolute"
                  style={{
                    left: `${layout.left * stageScale}px`,
                    top: `${layout.top * stageScale}px`,
                    width: `${layout.width * stageScale}px`,
                    height: `${layout.height * stageScale}px`,
                  }}
                >
                  <div
                    className="absolute inset-0"
                    style={{
                      opacity: Math.max(0, Math.min(1, layout.opacityPercent / 100)),
                      transform: `rotate(${layout.rotationDeg}deg) scaleX(${layout.flipHorizontal ? -1 : 1}) scaleY(${layout.flipVertical ? -1 : 1})`,
                      transformOrigin: 'center center',
                    }}
                  >
                    <button
                      className={`absolute inset-0 border text-left transition-colors ${
                        stageClip.clip.sourceKind === 'text'
                          ? `overflow-visible rounded-none bg-transparent ${
                              isSelected ? 'border-blue-300/90' : 'border-transparent'
                            }`
                          : `overflow-hidden rounded-lg ${
                              isSelected
                                ? 'border-blue-300/90 shadow-[0_0_0_1px_rgba(96,165,250,0.4)]'
                                : 'border-gray-700/40 hover:border-blue-300/50'
                            }`
                      } ${activeTool === 'select' ? 'cursor-move' : 'cursor-pointer'}`}
                      onClick={() => onSelectClip(stageClip.clip.id)}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onSelectClip(stageClip.clip.id);
                        onOpenClipContextMenu(stageClip.clip.id, event);
                      }}
                      onPointerDown={(event) => startMoveDrag(event, stageClip)}
                      type="button"
                    >
                      <ProgramStageMedia canvas={canvas} clip={stageClip} stageScale={stageScale} />
                    </button>

                    {isSelected && activeTool === 'select' ? (
                      <div className="absolute inset-0" data-clip-frame>
                        <div className={`pointer-events-none absolute inset-0 border border-blue-300/90 ${stageClip.clip.sourceKind === 'text' ? 'rounded-none' : 'rounded-lg'}`} />
                        <button
                          className="absolute left-1/2 top-1/2 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/70 bg-slate-900/85 text-[10px] font-bold text-cyan-100 shadow cursor-move"
                          onPointerDown={(event) => startMoveDrag(event, stageClip)}
                          title="Move clip"
                          type="button"
                        >
                          +
                        </button>
                        <button
                          className="absolute -right-2 -top-2 h-4 w-4 rounded-full border border-white/70 bg-blue-400 shadow"
                          onPointerDown={(event) => {
                            const frameElement = event.currentTarget.parentElement as HTMLDivElement | null;
                            if (frameElement) {
                              startRotationDrag(event, stageClip, frameElement);
                            }
                          }}
                          title="Rotate clip"
                          type="button"
                        />
                        <button
                          className="absolute -bottom-2 -right-2 h-4 w-4 rounded-full border border-white/70 bg-cyan-300 shadow"
                          onPointerDown={(event) => {
                            const frameElement = event.currentTarget.parentElement as HTMLDivElement | null;
                            if (frameElement) {
                              startScaleDrag(event, stageClip, frameElement);
                            }
                          }}
                          title="Resize / scale clip"
                          type="button"
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })
              )
            : null}
          {stageObjects.map((object) => {
            const isSelected = selectedStageObject?.id === object.id;
            const layout = buildStageObjectLayoutDescriptor(object);

            return (
              <div
                key={object.id}
                className="absolute"
                style={{
                  left: `${layout.left * stageScale}px`,
                  top: `${layout.top * stageScale}px`,
                  width: `${layout.width * stageScale}px`,
                  height: `${layout.height * stageScale}px`,
                  opacity: Math.max(0, Math.min(1, layout.opacityPercent / 100)),
                  transform: `rotate(${layout.rotationDeg}deg)`,
                  transformOrigin: 'center center',
                  mixBlendMode: mapStageObjectBlendModeToCss(object.blendMode),
                }}
              >
                <button
                  className={`absolute inset-0 overflow-hidden rounded-sm border text-left transition-colors ${
                    isSelected
                      ? 'border-amber-200/90 shadow-[0_0_0_1px_rgba(253,230,138,0.5)]'
                      : 'border-transparent hover:border-amber-200/40'
                  } ${activeTool === 'select' ? 'cursor-move' : 'cursor-pointer'}`}
                  onClick={() => onSelectStageObject(object.id)}
                  onPointerDown={(event) => startStageObjectMoveDrag(event, object)}
                  type="button"
                >
                  <ProgramStageObjectPreview object={object} />
                </button>

                {isSelected && activeTool === 'select' ? (
                  <div className="absolute inset-0">
                    <div className="pointer-events-none absolute inset-0 rounded-sm border border-amber-200/90" />
                    <button
                      className="absolute left-1/2 top-1/2 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/70 bg-slate-900/85 text-[10px] font-bold text-amber-100 shadow cursor-move"
                      onPointerDown={(event) => startStageObjectMoveDrag(event, object)}
                      title="Move object"
                      type="button"
                    >
                      +
                    </button>
                    <button
                      className="absolute -right-2 -top-2 h-4 w-4 rounded-full border border-white/70 bg-amber-400 shadow"
                      onPointerDown={(event) => {
                        const frameElement = event.currentTarget.parentElement as HTMLDivElement | null;
                        if (frameElement) {
                          startStageObjectRotationDrag(event, object, frameElement);
                        }
                      }}
                      title="Rotate object"
                      type="button"
                    />
                    <button
                      className="absolute -bottom-2 -right-2 h-4 w-4 rounded-full border border-white/70 bg-cyan-300 shadow"
                      onPointerDown={(event) => startStageObjectResizeDrag(event, object)}
                      title="Resize object"
                      type="button"
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
          {stageClips.length === 0 && stageObjects.length === 0 ? (
            <div className="flex h-full items-center justify-center px-10 text-center text-sm text-gray-500">
              Add clips to the timeline to build the program. The program stage uses the current playhead and canvas settings so you can position, scale, and rotate clips before rendering.
            </div>
          ) : null}
        </div>
      </MonitorStageFrame>
    </div>
  );
}

function ProgramStageMedia({
  canvas,
  clip,
  stageScale,
}: {
  canvas: { width: number; height: number };
  clip: ProgramStageClip;
  stageScale: number;
}) {
  const effectDescriptor = buildClipEffectDescriptorForClip(clip.clip);
  const layout = getStageClipLayout(clip, canvas);
  const crop = layout.crop;
  const filter = effectDescriptor.cssFilter;
  const outline = effectDescriptor.cssOutline;
  const outlineShadow = outline
    ? `inset 0 0 0 ${Math.max(1, Math.round(outline.widthPx * stageScale))}px ${hexToRgba(outline.color, outline.opacityPercent / 100)}`
    : undefined;
  const cropFrameStyle: CSSProperties = {
    left: `${crop.frameLeftPercent}%`,
    right: `${crop.frameRightPercent}%`,
    top: `${crop.frameTopPercent}%`,
    bottom: `${crop.frameBottomPercent}%`,
  };
  const cropContentStyle: CSSProperties = {
    filter: filter || undefined,
    transform: `translate(${crop.contentTranslateXPercent}%, ${crop.contentTranslateYPercent}%) rotate(${crop.cropRotationDeg}deg)`,
    transformOrigin: 'center center',
  };
  const mediaClassName =
    clip.clip.fitMode === 'stretch' ? 'h-full w-full object-fill' : 'h-full w-full object-cover';
  const textDefaults = clip.asset?.textDefaults;
  const shapeDefaults = clip.asset?.shapeDefaults;
  let content: ReactNode;
  const isTextClip = clip.clip.sourceKind === 'text';

  if (clip.item?.kind === 'image' && clip.item.assetUrl) {
    content = effectDescriptor.chromaKey?.enabled
      ? (
        <ChromaKeyPreviewMedia
          chromaKey={effectDescriptor.chromaKey}
          className={mediaClassName}
          kind="image"
          label={clip.item.label}
          sourceHeight={clip.sourceHeight}
          sourceWidth={clip.sourceWidth}
          src={clip.item.assetUrl}
        />
      )
      : <img alt={clip.item.label} className={mediaClassName} src={clip.item.assetUrl} />;
  } else if ((clip.item?.kind === 'video' || clip.item?.kind === 'composition') && clip.item.assetUrl) {
    content = effectDescriptor.chromaKey?.enabled
      ? (
        <ChromaKeyPreviewMedia
          chromaKey={effectDescriptor.chromaKey}
          className={mediaClassName}
          currentTimeSeconds={clip.sourceTimeSeconds}
          kind="video"
          label={clip.item.label}
          sourceHeight={clip.sourceHeight}
          sourceWidth={clip.sourceWidth}
          src={clip.item.assetUrl}
        />
      )
      : (
        <StageVideoAsset
          className={mediaClassName}
          currentTimeSeconds={clip.sourceTimeSeconds}
          src={clip.item.assetUrl}
        />
      );
  } else if (clip.clip.sourceKind === 'shape') {
    const shape = layout.shape;
    content = (
      <div className="relative h-full w-full bg-transparent">
        <div
          className="absolute"
          style={{
            backgroundColor: shape?.fillColor ?? clip.clip.shapeFillColor ?? shapeDefaults?.fillColor ?? '#0ea5e9',
            borderColor: shape?.borderColor ?? clip.clip.shapeBorderColor ?? shapeDefaults?.borderColor ?? '#f8fafc',
            borderRadius: shape?.cornerRadius ?? clip.clip.shapeCornerRadius ?? shapeDefaults?.cornerRadius ?? 18,
            borderStyle: 'solid',
            borderWidth: shape?.borderWidth ?? clip.clip.shapeBorderWidth ?? shapeDefaults?.borderWidth ?? 2,
            height: `${100 - 2 * (shape?.insetPercent ?? 10)}%`,
            left: `${shape?.insetPercent ?? 10}%`,
            top: `${shape?.insetPercent ?? 10}%`,
            width: `${100 - 2 * (shape?.insetPercent ?? 10)}%`,
          }}
        />
      </div>
    );
  } else if (clip.clip.sourceKind === 'comic') {
    content = <ComicClipStagePreview clip={clip.clip} />;
  } else if (isTextClip) {
    const text = layout.text;
    const fontSizePx = (text?.fontSizePx ?? Math.max(8, clip.clip.textSizePx || textDefaults?.fontSizePx || 64)) * (layout.scalePercent / 100) * stageScale;

    content = (
      <div className="flex h-full w-full items-center justify-center bg-transparent text-center">
        <div
          className="inline-block whitespace-pre font-semibold leading-tight"
          style={{
            color: text?.color ?? clip.clip.textColor ?? textDefaults?.color ?? '#f3f4f6',
            fontFamily: text?.fontFamily ?? clip.clip.textFontFamily ?? textDefaults?.fontFamily ?? 'Inter, system-ui, sans-serif',
            fontSize: `${Math.max(8, fontSizePx)}px`,
            lineHeight: TEXT_LINE_HEIGHT,
            ...getTextPreviewEffectStyle(text?.effect ?? clip.clip.textEffect ?? textDefaults?.textEffect ?? 'none'),
          }}
        >
          {clip.clip.textContent ?? textDefaults?.text ?? clip.item?.text ?? 'Text'}
        </div>
      </div>
    );
  } else {
    content = (
      <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_top,#1f2937_0%,#0f172a_42%,#020617_100%)] p-6 text-center">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-cyan-200/70">
            {clip.clip.sourceKind === 'text' ? 'Text Overlay' : clip.item?.kind ?? 'Clip'}
          </div>
          <div
            className="mt-3 text-balance font-semibold text-white"
            style={{
              color: clip.clip.textColor || textDefaults?.color,
              fontFamily: clip.clip.textFontFamily || textDefaults?.fontFamily,
              fontSize: `${Math.max(16, (clip.clip.textSizePx || textDefaults?.fontSizePx || 64) / 3)}px`,
            }}
          >
            {clip.clip.textContent ?? textDefaults?.text ?? clip.item?.text ?? 'Text clip'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`absolute inset-0 ${isTextClip ? 'overflow-visible bg-transparent' : 'bg-black'}`}
      style={{
        filter: isTextClip && filter ? filter : undefined,
        mixBlendMode: effectDescriptor.cssBlendMode,
      }}
    >
      {isTextClip ? content : (
      <div className="absolute overflow-hidden" style={cropFrameStyle}>
        <div className="h-full w-full" style={cropContentStyle}>
          {content}
        </div>
        {outlineShadow ? (
          <div
            className="pointer-events-none absolute inset-0"
            style={{ boxShadow: outlineShadow }}
          />
        ) : null}
      </div>
      )}
    </div>
  );
}

function ProgramStageObjectPreview({ object }: { object: EditorStageObject }) {
  if (object.kind === 'text') {
    return (
      <div className="flex h-full w-full items-center justify-center overflow-hidden">
        <div
          className="w-full whitespace-pre-wrap text-center font-semibold leading-tight"
          style={{
            color: object.color,
            fontFamily: object.fontFamily,
            fontSize: `${object.fontSizePx}px`,
          }}
        >
          {object.text}
        </div>
      </div>
    );
  }

  if (object.kind !== 'rectangle') {
    return <ComicStageObjectPreview object={object} />;
  }

  return (
    <div
      className="h-full w-full"
      style={{
        backgroundColor: object.fillColor,
        borderColor: object.borderColor,
        borderRadius: `${object.cornerRadius}px`,
        borderStyle: object.borderWidth > 0 ? 'solid' : 'none',
        borderWidth: `${object.borderWidth}px`,
      }}
    />
  );
}

/**
 * Edit-stage preview for a motion-comic CLIP: renders the exact export card (renderComicCard)
 * as the stage content, so the interactive stage matches the encode pixel-for-pixel.
 */
function ComicClipStagePreview({ clip }: { clip: EditorVisualClip }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void renderComicCard(clip).then((url) => {
      if (!cancelled) setSrc(url);
    });
    return () => {
      cancelled = true;
    };
  }, [clip]);

  return src
    ? <img alt={clip.textContent ?? 'Motion comic'} className="h-full w-full object-contain" src={src} />
    : <div className="h-full w-full bg-transparent" />;
}

/**
 * Edit-stage preview for motion-comic objects. Draws with the SAME canvas painter the export
 * render uses (drawComicStageObject), so the stage is pixel-truthful to the encode.
 */
function ComicStageObjectPreview({ object }: { object: Extract<EditorStageObject, { kind: 'speech-bubble' | 'thought-bubble' | 'caption' }> }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pad = Math.ceil(object.tailLengthPx + object.strokeWidthPx + 8);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = object.width + pad * 2;
    canvas.height = object.height + pad * 2;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.save();
    context.translate(canvas.width / 2, canvas.height / 2);
    drawComicStageObject(context, object);
    context.restore();
  }, [object, pad]);

  return (
    <canvas
      className="pointer-events-none absolute"
      ref={canvasRef}
      style={{ left: -pad, top: -pad, width: object.width + pad * 2, height: object.height + pad * 2 }}
    />
  );
}

function mapStageObjectBlendModeToCss(mode: EditorStageBlendMode): React.CSSProperties['mixBlendMode'] {
  switch (mode) {
    case 'color-dodge':
      return 'color-dodge';
    case 'color-burn':
      return 'color-burn';
    case 'screen':
    case 'multiply':
    case 'overlay':
    case 'lighten':
    case 'darken':
      return mode;
    case 'normal':
      return 'normal';
  }
}

function getTextPreviewEffectStyle(effect: TextClipEffect): CSSProperties {
  if (effect === 'shadow') {
    return { textShadow: '0 6px 20px rgba(0,0,0,0.65)' };
  }

  if (effect === 'glow') {
    return { textShadow: '0 0 18px rgba(255,255,255,0.65), 0 0 36px rgba(96,165,250,0.45)' };
  }

  if (effect === 'outline') {
    return {
      WebkitTextStroke: '1px rgba(0,0,0,0.75)',
      textShadow: '0 2px 6px rgba(0,0,0,0.5)',
    };
  }

  return {};
}

function ChromaKeyPreviewMedia({
  chromaKey,
  className,
  currentTimeSeconds,
  kind,
  label,
  sourceHeight,
  sourceWidth,
  src,
}: {
  chromaKey: EditorClipChromaKeySettings;
  className: string;
  currentTimeSeconds?: number;
  kind: 'image' | 'video';
  label: string;
  sourceHeight?: number;
  sourceWidth?: number;
  src: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const fallbackWidth = Math.max(1, Math.round(sourceWidth || 1));
  const fallbackHeight = Math.max(1, Math.round(sourceHeight || 1));

  const draw = useCallback((media: CanvasImageSource, naturalWidth: number, naturalHeight: number) => {
    const canvasElement = canvasRef.current;
    if (!canvasElement) {
      return;
    }

    try {
      const width = Math.max(1, Math.round(naturalWidth || sourceWidth || 1));
      const height = Math.max(1, Math.round(naturalHeight || sourceHeight || 1));
      const context = canvasElement.getContext('2d', { willReadFrequently: true });

      if (!context) {
        setErrorMessage('Canvas unavailable');
        return;
      }

      canvasElement.width = width;
      canvasElement.height = height;
      context.clearRect(0, 0, width, height);
      context.drawImage(media, 0, 0, width, height);
      const imageData = context.getImageData(0, 0, width, height);
      applyChromaKeyToImageData(imageData, chromaKey);
      context.putImageData(imageData, 0, 0);
      setErrorMessage(undefined);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Preview unavailable');
    }
  }, [chromaKey, sourceHeight, sourceWidth]);

  useEffect(() => {
    if (kind !== 'image') {
      return;
    }

    const image = imageRef.current;
    if (!image) {
      return;
    }

    const paintImage = () => draw(image, image.naturalWidth, image.naturalHeight);
    const handleError = () => setErrorMessage('Image could not be loaded for keyed preview.');

    if (image.complete && image.naturalWidth > 0) {
      paintImage();
    }

    image.addEventListener('load', paintImage);
    image.addEventListener('error', handleError);

    return () => {
      image.removeEventListener('load', paintImage);
      image.removeEventListener('error', handleError);
    };
  }, [draw, kind, src]);

  useEffect(() => {
    if (kind !== 'video') {
      return;
    }

    const video = videoRef.current;
    if (!video) {
      return;
    }

    const paintVideo = () => {
      if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
        draw(video, video.videoWidth, video.videoHeight);
      }
    };
    const seekToCurrentFrame = () => {
      const nextTime = Math.max(0, currentTimeSeconds ?? 0);
      if (Math.abs(video.currentTime - nextTime) > 0.01) {
        video.currentTime = nextTime;
      } else {
        paintVideo();
      }
      video.pause();
    };
    const handleError = () => setErrorMessage('Video frame could not be loaded for keyed preview.');

    if (video.readyState >= 1) {
      seekToCurrentFrame();
    }

    video.addEventListener('loadedmetadata', seekToCurrentFrame);
    video.addEventListener('loadeddata', paintVideo);
    video.addEventListener('seeked', paintVideo);
    video.addEventListener('error', handleError);

    return () => {
      video.removeEventListener('loadedmetadata', seekToCurrentFrame);
      video.removeEventListener('loadeddata', paintVideo);
      video.removeEventListener('seeked', paintVideo);
      video.removeEventListener('error', handleError);
    };
  }, [currentTimeSeconds, draw, kind, src]);

  return (
    <>
      <canvas
        aria-label={`Chroma keyed preview for ${label}`}
        className={className}
        data-chroma-key-preview
        height={fallbackHeight}
        ref={canvasRef}
        style={{ background: 'transparent' }}
        width={fallbackWidth}
      />
      {kind === 'image' ? (
        <img alt="" className="hidden" ref={imageRef} src={src} />
      ) : (
        <video className="hidden" muted playsInline preload="metadata" ref={videoRef} src={src} />
      )}
      {errorMessage ? (
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/70 px-3 text-center text-[10px] font-semibold text-amber-100"
          data-chroma-key-preview-error
        >
          {errorMessage}
        </div>
      ) : null}
    </>
  );
}

function StageVideoAsset({
  src,
  currentTimeSeconds,
  className,
}: {
  src: string;
  currentTimeSeconds?: number;
  className: string;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = ref.current;

    if (!video || currentTimeSeconds == null || Number.isNaN(currentTimeSeconds)) {
      return;
    }

    const handleSeek = () => {
      video.pause();
    };

    if (video.readyState >= 1) {
      video.currentTime = Math.max(0, currentTimeSeconds);
      video.pause();
      return;
    }

    const handleLoadedMetadata = () => {
      video.currentTime = Math.max(0, currentTimeSeconds);
      video.pause();
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata, { once: true });
    video.addEventListener('seeked', handleSeek, { once: true });

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('seeked', handleSeek);
    };
  }, [currentTimeSeconds, src]);

  return <video className={className} muted playsInline preload="metadata" ref={ref} src={src} />;
}

function StageObjectInspector({
  object,
  onUpdate,
  onRemove,
}: {
  object: EditorStageObject;
  onUpdate: (patch: Partial<EditorStageObject>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="space-y-4">
      <InspectorHeader
        eyebrow="Selected Stage Object"
        title={object.kind === 'text' ? object.text || 'Text' : 'Rectangle'}
      />
      <InfoStack
        rows={[
          ['Kind', object.kind],
          ['Position', `${object.x}, ${object.y}`],
          ['Size', `${object.width} x ${object.height}`],
          ['Blend', object.blendMode],
        ]}
      />
      {object.kind === 'text' ? (
        <div className="space-y-3 rounded-xl border border-gray-700/60 bg-[#111217]/35 p-3">
          <label className="block space-y-2 text-xs text-gray-400">
            <span>Text</span>
            <textarea
              className="min-h-24 w-full rounded-xl border border-gray-700/60 bg-[#0f131b] px-3 py-2 text-sm text-gray-100 outline-none"
              onChange={(event) => onUpdate({ text: event.target.value } as Partial<EditorStageObject>)}
              value={object.text}
            />
          </label>
          <label className="block space-y-2 text-xs text-gray-400">
            <span>Font family</span>
            <input
              className="w-full rounded-xl border border-gray-700/60 bg-[#0f131b] px-3 py-2 text-sm text-gray-100 outline-none"
              onChange={(event) => onUpdate({ fontFamily: event.target.value } as Partial<EditorStageObject>)}
              type="text"
              value={object.fontFamily}
            />
          </label>
          <div className="grid gap-3 md:grid-cols-2">
            <NumberField
              label="Font size"
              max={320}
              min={8}
              onChange={(value) => onUpdate({ fontSizePx: Math.max(8, Math.round(value)) } as Partial<EditorStageObject>)}
              step={1}
              value={object.fontSizePx}
            />
            <label className="block space-y-2 text-xs text-gray-400">
              <span>Color</span>
              <AdvancedColorPicker
                className="h-11 w-full"
                buttonClassName="rounded-xl border border-gray-700/60 bg-[#0f131b]"
                label="Stage object text color"
                onChange={(color) => onUpdate({ color } as Partial<EditorStageObject>)}
                value={object.color}
              />
            </label>
          </div>
        </div>
      ) : object.kind === 'rectangle' ? (
        <div className="space-y-3 rounded-xl border border-gray-700/60 bg-[#111217]/35 p-3">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block space-y-2 text-xs text-gray-400">
              <span>Fill</span>
              <AdvancedColorPicker
                className="h-11 w-full"
                buttonClassName="rounded-xl border border-gray-700/60 bg-[#0f131b]"
                label="Stage object fill color"
                onChange={(fillColor) => onUpdate({ fillColor } as Partial<EditorStageObject>)}
                value={object.fillColor}
              />
            </label>
            <label className="block space-y-2 text-xs text-gray-400">
              <span>Border</span>
              <AdvancedColorPicker
                className="h-11 w-full"
                buttonClassName="rounded-xl border border-gray-700/60 bg-[#0f131b]"
                label="Stage object border color"
                onChange={(borderColor) => onUpdate({ borderColor } as Partial<EditorStageObject>)}
                value={object.borderColor}
              />
            </label>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <NumberField
              label="Border width"
              max={80}
              min={0}
              onChange={(value) => onUpdate({ borderWidth: Math.max(0, Math.round(value)) } as Partial<EditorStageObject>)}
              step={1}
              value={object.borderWidth}
            />
            <NumberField
              label="Corner radius"
              max={300}
              min={0}
              onChange={(value) => onUpdate({ cornerRadius: Math.max(0, Math.round(value)) } as Partial<EditorStageObject>)}
              step={1}
              value={object.cornerRadius}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-3 rounded-xl border border-gray-700/60 bg-[#111217]/35 p-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-100/70">
            {object.kind === 'caption' ? 'Caption' : object.kind === 'thought-bubble' ? 'Thought Bubble' : 'Speech Bubble'} · Motion Comic
          </div>
          <label className="block space-y-2 text-xs text-gray-400">
            <span>Text</span>
            <textarea
              className="h-20 w-full resize-none rounded-xl border border-gray-700/60 bg-[#0f131b] p-2 text-sm text-gray-100"
              onChange={(event) => onUpdate({ text: event.target.value } as Partial<EditorStageObject>)}
              value={object.text}
            />
          </label>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="block space-y-2 text-xs text-gray-400">
              <span>Fill</span>
              <AdvancedColorPicker
                className="h-11 w-full"
                buttonClassName="rounded-xl border border-gray-700/60 bg-[#0f131b]"
                label="Bubble fill color"
                onChange={(fillColor) => onUpdate({ fillColor } as Partial<EditorStageObject>)}
                value={object.fillColor}
              />
            </label>
            <label className="block space-y-2 text-xs text-gray-400">
              <span>Outline</span>
              <AdvancedColorPicker
                className="h-11 w-full"
                buttonClassName="rounded-xl border border-gray-700/60 bg-[#0f131b]"
                label="Bubble outline color"
                onChange={(strokeColor) => onUpdate({ strokeColor } as Partial<EditorStageObject>)}
                value={object.strokeColor}
              />
            </label>
            <label className="block space-y-2 text-xs text-gray-400">
              <span>Text color</span>
              <AdvancedColorPicker
                className="h-11 w-full"
                buttonClassName="rounded-xl border border-gray-700/60 bg-[#0f131b]"
                label="Bubble text color"
                onChange={(textColor) => onUpdate({ textColor } as Partial<EditorStageObject>)}
                value={object.textColor}
              />
            </label>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <NumberField
              label="Font size"
              max={400}
              min={8}
              onChange={(value) => onUpdate({ fontSizePx: Math.max(8, Math.round(value)) } as Partial<EditorStageObject>)}
              step={1}
              value={object.fontSizePx}
            />
            <NumberField
              label="Outline width"
              max={40}
              min={0}
              onChange={(value) => onUpdate({ strokeWidthPx: Math.max(0, Math.round(value)) } as Partial<EditorStageObject>)}
              step={1}
              value={object.strokeWidthPx}
            />
            <NumberField
              label="Line height %"
              max={240}
              min={80}
              onChange={(value) => onUpdate({ lineHeightPercent: Math.max(80, Math.min(240, Math.round(value))) } as Partial<EditorStageObject>)}
              step={5}
              value={object.lineHeightPercent}
            />
            <NumberField
              label="Letter spacing"
              max={24}
              min={-4}
              onChange={(value) => onUpdate({ letterSpacingPx: Math.max(-4, Math.min(24, Math.round(value))) } as Partial<EditorStageObject>)}
              step={1}
              value={object.letterSpacingPx}
            />
          </div>
          {object.kind !== 'caption' ? (
            <div className="grid gap-3 md:grid-cols-2">
              <NumberField
                label="Tail angle°"
                max={360}
                min={0}
                onChange={(value) => onUpdate({ tailAngleDeg: Math.round(value) } as Partial<EditorStageObject>)}
                step={5}
                value={object.tailAngleDeg}
              />
              <NumberField
                label="Tail length"
                max={600}
                min={0}
                onChange={(value) => onUpdate({ tailLengthPx: Math.max(0, Math.round(value)) } as Partial<EditorStageObject>)}
                step={5}
                value={object.tailLengthPx}
              />
            </div>
          ) : null}
          <div className="flex gap-2">
            {(['left', 'center', 'right'] as const).map((align) => (
              <button
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${object.textAlign === align ? 'border-cyan-300/50 bg-cyan-500/10 text-cyan-100' : 'border-gray-700/60 text-gray-400 hover:text-gray-200'}`}
                key={align}
                onClick={() => onUpdate({ textAlign: align } as Partial<EditorStageObject>)}
                type="button"
              >
                {align === 'left' ? 'Left' : align === 'center' ? 'Center' : 'Right'}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        <NumberField label="X" onChange={(value) => onUpdate({ x: Math.round(value) })} step={1} value={object.x} />
        <NumberField label="Y" onChange={(value) => onUpdate({ y: Math.round(value) })} step={1} value={object.y} />
        <NumberField
          label="Width"
          min={8}
          onChange={(value) => onUpdate({ width: Math.max(8, Math.round(value)) })}
          step={1}
          value={object.width}
        />
        <NumberField
          label="Height"
          min={8}
          onChange={(value) => onUpdate({ height: Math.max(8, Math.round(value)) })}
          step={1}
          value={object.height}
        />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <RangeControl
          label="Opacity"
          max={100}
          min={0}
          onChange={(value) => onUpdate({ opacityPercent: Math.round(value) })}
          value={object.opacityPercent}
          valueLabel={`${object.opacityPercent}%`}
        />
        <NumberField
          label="Rotation"
          max={360}
          min={-360}
          onChange={(value) => onUpdate({ rotationDeg: Math.round(value) })}
          step={1}
          value={object.rotationDeg}
        />
      </div>
      <label className="block space-y-2 text-xs text-gray-400">
        <span>Blend / filter effect</span>
        <select
          className="w-full rounded-xl border border-gray-700/60 bg-[#0f131b] px-3 py-2 text-sm text-gray-100 outline-none"
          onChange={(event) => onUpdate({ blendMode: event.target.value as EditorStageBlendMode })}
          value={object.blendMode}
        >
          {getStageObjectBlendModes().map((mode) => (
            <option key={mode} value={mode}>
              {formatStageBlendModeLabel(mode)}
            </option>
          ))}
        </select>
      </label>
      <button
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-100 transition-colors hover:border-red-400/60 hover:bg-red-500/15"
        onClick={onRemove}
        type="button"
      >
        <Trash2 size={14} />
        Remove Object
      </button>
    </div>
  );
}

function formatStageBlendModeLabel(mode: EditorStageBlendMode): string {
  return mode
    .split('-')
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ');
}

function hexToRgba(hex: string, alpha: number): string {
  const normalized = /^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(1) : 'ffffff';
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
}

function normalizeVideoExportPresetPlan(value: unknown): VideoExportPresetPlanData {
  if (value && typeof value === 'object' && 'presetId' in value) {
    const presetId = (value as { presetId?: unknown }).presetId;

    if (VIDEO_EXPORT_PRESET_OPTIONS.some((preset) => preset.id === presetId)) {
      const notes = (value as { notes?: unknown }).notes;

      return {
        presetId: presetId as VideoExportPresetPlanId,
        notes: typeof notes === 'string' ? notes : undefined,
      };
    }
  }

  return { presetId: VIDEO_EXPORT_PRESET_OPTIONS[0].id as VideoExportPresetPlanId };
}

function createClipFilter(kind: EditorClipFilterKind): EditorClipFilter {
  return {
    id: `filter-${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    amount:
      kind === 'grayscale' || kind === 'sepia' || kind === 'invert'
        ? 100
        : kind === 'blur'
          ? 12
          : kind === 'hue-rotate'
            ? 30
            : 0,
    enabled: true,
  };
}

function formatClipFilterKind(kind: EditorClipFilterKind): string {
  return kind
    .split('-')
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ');
}

function getClipFilterAmountRange(kind: EditorClipFilterKind): { min: number; max: number } {
  if (kind === 'hue-rotate') {
    return { min: -180, max: 180 };
  }

  if (kind === 'blur' || kind === 'grayscale' || kind === 'sepia' || kind === 'invert') {
    return { min: 0, max: 100 };
  }

  return { min: -100, max: 100 };
}

function buildTextDraftFromAsset(asset: EditorAsset): TextEditDraft {
  return normalizeTextEditDraft({
    text: asset.textDefaults?.text ?? 'Text',
    fontFamily: asset.textDefaults?.fontFamily ?? 'Inter, system-ui, sans-serif',
    fontSizePx: asset.textDefaults?.fontSizePx ?? 72,
    color: asset.textDefaults?.color ?? '#f8fafc',
    textEffect: asset.textDefaults?.textEffect ?? 'shadow',
  });
}

function buildTextDraftFromClip(
  clip: EditorVisualClip,
  asset?: EditorAsset,
  sourceItem?: SourceBinItem,
): TextEditDraft {
  return normalizeTextEditDraft({
    text: clip.textContent ?? sourceItem?.text ?? asset?.textDefaults?.text ?? 'Text',
    fontFamily: clip.textFontFamily || asset?.textDefaults?.fontFamily || 'Inter, system-ui, sans-serif',
    fontSizePx: clip.textSizePx || asset?.textDefaults?.fontSizePx || 72,
    color: clip.textColor || asset?.textDefaults?.color || '#f8fafc',
    textEffect: clip.textEffect || asset?.textDefaults?.textEffect || 'shadow',
  });
}

function normalizeTextEditDraft(draft: TextEditDraft): TextEditDraft {
  return {
    text: draft.text,
    fontFamily: draft.fontFamily.trim() || 'Inter, system-ui, sans-serif',
    fontSizePx: Math.max(8, Math.min(320, Math.round(draft.fontSizePx))),
    color: /^#[0-9a-f]{6}$/i.test(draft.color) ? draft.color : '#f8fafc',
    textEffect: draft.textEffect,
  };
}

function buildTextAssetLabel(text: string): string {
  const trimmed = text.trim();
  return trimmed ? trimmed.slice(0, 48) : 'Text';
}

function buildNarrationAssetLabel(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  return `Narration - ${trimmed ? trimmed.slice(0, 40) : 'Text'}`;
}

function resolveEditorNarrationProvider(
  apiKeys: { gemini: string; elevenlabs: string; huggingface: string },
  backendProxyEnabled: boolean,
): AudioProvider {
  if (backendProxyEnabled) {
    return 'gemini';
  }

  if (apiKeys.elevenlabs.trim()) {
    return 'elevenlabs';
  }

  if (apiKeys.gemini.trim()) {
    return 'gemini';
  }

  if (apiKeys.huggingface.trim()) {
    return 'huggingface';
  }

  return 'elevenlabs';
}

function InspectorPanel({
  visualClip,
  visualBackingImageItem,
  visualEditorAsset,
  visualSourceItem,
  visualSourceDurationSeconds,
  visualDurationSeconds,
  audioDurationSeconds,
  timelineCursorSeconds,
  sequenceDurationSeconds,
  selectedSourceItem,
  selectedStageObject,
  audioClip,
  audioTrackVolumes,
  audioSourceItem,
  onUpdateVisualClip,
  onUpdateVisualKeyframe,
  onRemoveVisualKeyframe,
  onMoveVisualToTrack,
  onRemoveVisualClip,
  onUpdateAudioClip,
  onUpdateAudioKeyframe,
  onRemoveAudioKeyframe,
  onUpdateStageObject,
  onMoveAudioToTrack,
  onEditVisualText,
  onRemoveAudioClip,
  onRemoveStageObject,
  onSelectSource,
  onAddOrUpdateKeyframe,
  onCommitVisualCropAsImageAsset,
  onGenerateNarrationFromText,
  onJumpKeyframe,
}: {
  visualClip?: EditorVisualClip;
  visualBackingImageItem?: SourceBinItem;
  visualEditorAsset?: EditorAsset;
  visualSourceItem?: SourceBinItem;
  visualSourceDurationSeconds?: number;
  visualDurationSeconds?: number;
  audioDurationSeconds?: number;
  timelineCursorSeconds: number;
  sequenceDurationSeconds: number;
  selectedSourceItem?: SourceBinItem;
  selectedStageObject?: EditorStageObject;
  audioClip?: EditorAudioClip;
  audioTrackVolumes: number[];
  audioSourceItem?: SourceBinItem;
  onUpdateVisualClip: (patch: Partial<EditorVisualClip>) => void;
  onUpdateVisualKeyframe: (keyframeIndex: number, patch: Parameters<typeof updateVisualKeyframe>[2]) => void;
  onRemoveVisualKeyframe: (keyframeIndex: number) => void;
  onMoveVisualToTrack: (trackIndex: number) => void;
  onRemoveVisualClip: () => void;
  onUpdateAudioClip: (patch: Partial<EditorAudioClip>) => void;
  onUpdateAudioKeyframe: (keyframeIndex: number, patch: Parameters<typeof updateAudioKeyframe>[2]) => void;
  onRemoveAudioKeyframe: (keyframeIndex: number) => void;
  onUpdateStageObject: (patch: Partial<EditorStageObject>) => void;
  onMoveAudioToTrack: (trackIndex: number) => void;
  onEditVisualText: (clip: EditorVisualClip) => void;
  onRemoveAudioClip: () => void;
  onRemoveStageObject: () => void;
  onSelectSource: () => void;
  onAddOrUpdateKeyframe: () => void;
  onCommitVisualCropAsImageAsset: () => void;
  onGenerateNarrationFromText: () => void;
  onJumpKeyframe: (direction: 'previous' | 'next') => void;
}) {
  const visualCrop = visualClip
    ? normalizeClipCrop({
        cropLeftPercent: visualClip.cropLeftPercent,
        cropRightPercent: visualClip.cropRightPercent,
        cropTopPercent: visualClip.cropTopPercent,
        cropBottomPercent: visualClip.cropBottomPercent,
        cropPanXPercent: visualClip.cropPanXPercent,
        cropPanYPercent: visualClip.cropPanYPercent,
        cropRotationDeg: visualClip.cropRotationDeg,
      })
    : undefined;
  const visualProgressPercent = visualClip && visualDurationSeconds
    ? getVisualClipProgressPercent(visualClip, visualDurationSeconds, timelineCursorSeconds)
    : 0;
  const visualCurrentState = visualClip
    ? resolveClipFitState(visualClip, visualProgressPercent)
    : undefined;
  const chromaKey = visualClip ? normalizeClipChromaKey(visualClip.chromaKey) : undefined;
  const stroke = visualClip ? normalizeClipStroke(visualClip.stroke) : undefined;
  const updateVisualCrop = (patch: Partial<NonNullable<typeof visualCrop>>) => {
    if (!visualCrop) {
      return;
    }

    onUpdateVisualClip(normalizeClipCrop({ ...visualCrop, ...patch }));
  };
  const addVisualFilter = (kind: EditorClipFilterKind) => {
    const nextFilter = createClipFilter(kind);
    onUpdateVisualClip({
      filterStack: [...(visualClip?.filterStack ?? []), nextFilter],
    });
  };
  const updateVisualFilter = (filterId: string, patch: Partial<EditorClipFilter>) => {
    if (!visualClip) {
      return;
    }

    onUpdateVisualClip({
      filterStack: visualClip.filterStack.map((filter) =>
        filter.id === filterId ? { ...filter, ...patch } : filter,
      ),
    });
  };
  const removeVisualFilter = (filterId: string) => {
    if (!visualClip) {
      return;
    }

    onUpdateVisualClip({
      filterStack: visualClip.filterStack.filter((filter) => filter.id !== filterId),
    });
  };
  const updateChromaKey = (patch: Partial<NonNullable<typeof chromaKey>>) => {
    if (!chromaKey) {
      return;
    }

    onUpdateVisualClip({
      chromaKey: normalizeClipChromaKey({ ...chromaKey, ...patch }),
    });
  };
  const updateStroke = (patch: Partial<NonNullable<typeof stroke>>) => {
    if (!stroke) {
      return;
    }

    onUpdateVisualClip({
      stroke: normalizeClipStroke({ ...stroke, ...patch }),
    });
  };

  return (
    <aside className={`${panelClassName} flex h-full min-h-0 flex-col overflow-hidden`}>
      <div className="border-b border-gray-700/60 px-4 py-3">
        <div className="text-sm font-semibold text-gray-100">Inspector</div>
        <div className="mt-1 text-xs text-gray-500">Tune the selected clip, or inspect the currently selected source asset.</div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-8">
        {selectedStageObject ? (
          <StageObjectInspector
            object={selectedStageObject}
            onRemove={onRemoveStageObject}
            onUpdate={onUpdateStageObject}
          />
        ) : visualClip ? (
          <div className="space-y-4">
            <InspectorHeader
              eyebrow="Selected Visual Clip"
              title={visualSourceItem?.label ?? visualEditorAsset?.label ?? visualClip.sourceNodeId}
            />
            <InfoStack
              rows={[
                ['Source kind', visualClip.sourceKind],
                ['Track', `Video ${visualClip.trackIndex + 1}`],
                ['Start', `${(visualClip.startMs / 1000).toFixed(2)}s`],
                ['Duration', `${(visualDurationSeconds ?? 0).toFixed(1)}s`],
                ['Sequence type', 'Track-timed'],
              ]}
            />
            <label className="block space-y-2 text-xs text-gray-400">
              <span>Video track</span>
              <select
                className="w-full rounded-xl border border-gray-700/60 bg-[#0f131b] px-3 py-2 text-sm text-gray-100 outline-none"
                onChange={(event) => onMoveVisualToTrack(Number(event.target.value))}
                value={visualClip.trackIndex}
              >
                {Array.from({ length: VISUAL_TRACK_COUNT }, (_, index) => (
                  <option key={index} value={index}>
                    Video {index + 1}
                  </option>
                ))}
              </select>
            </label>
            <NumberField
              label="Start time"
              max={3600}
              min={0}
              onChange={(value) => onUpdateVisualClip({ startMs: Math.max(0, Math.round(value * 1000)) })}
              step={0.1}
              value={visualClip.startMs / 1000}
            />
            {(visualClip.sourceKind === 'image' || visualClip.sourceKind === 'text' || visualClip.sourceKind === 'shape') ? (
              <NumberField
                label="Clip duration"
                max={120}
                min={0.25}
                onChange={(value) => onUpdateVisualClip({ durationSeconds: Math.max(0.25, value) })}
                step={0.25}
                value={visualDurationSeconds ?? 4}
              />
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                <NumberField
                  label="Trim start"
                  max={Math.max(0, visualSourceDurationSeconds ?? 120)}
                  min={0}
                  onChange={(value) => {
                    const trimStartMs = Math.max(0, Math.round(value * 1000));
                    onUpdateVisualClip({ trimStartMs, sourceInMs: trimStartMs });
                  }}
                  step={0.1}
                  value={visualClip.trimStartMs / 1000}
                />
                <NumberField
                  label="Trim end"
                  max={Math.max(0, visualSourceDurationSeconds ?? 120)}
                  min={0}
                  onChange={(value) => {
                    const trimEndMs = Math.max(0, Math.round(value * 1000));
                    const sourceDurationMs = Math.max(0, Math.round((visualSourceDurationSeconds ?? 0) * 1000));
                    onUpdateVisualClip({
                      trimEndMs,
                      sourceOutMs: sourceDurationMs > 0 ? Math.max(0, sourceDurationMs - trimEndMs) : undefined,
                    });
                  }}
                  step={0.1}
                  value={visualClip.trimEndMs / 1000}
                />
              </div>
            )}
            <NumberField
              label="Playback speed"
              max={4}
              min={0.25}
              onChange={(value) => onUpdateVisualClip({ playbackRate: Math.max(0.25, value) })}
              step={0.05}
              value={visualClip.playbackRate}
            />
            {(visualClip.sourceKind === 'video' || visualClip.sourceKind === 'composition') ? (
              <label className="flex items-center gap-2 rounded-xl border border-gray-700/60 bg-[#111217]/35 px-3 py-2 text-sm text-gray-300">
                <input
                  checked={visualClip.reversePlayback}
                  onChange={(event) => onUpdateVisualClip({ reversePlayback: event.target.checked })}
                  type="checkbox"
                />
                Reverse Playback
              </label>
            ) : null}
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block space-y-2 text-xs text-gray-400">
                <span>Fit mode</span>
                <select
                  className="w-full rounded-xl border border-gray-700/60 bg-[#0f131b] px-3 py-2 text-sm text-gray-100 outline-none"
                  onChange={(event) => onUpdateVisualClip({ fitMode: event.target.value as EditorVisualClip['fitMode'] })}
                  value={visualCurrentState?.fitMode ?? visualClip.fitMode}
                >
                  <option value="contain">Contain</option>
                  <option value="cover">Cover / Crop</option>
                  <option value="stretch">Stretch To Canvas</option>
                </select>
              </label>
              <NumberField
                label="Zoom"
                max={300}
                min={10}
                onChange={(value) => onUpdateVisualClip({ scalePercent: Math.max(10, Math.round(value)) })}
                step={1}
                value={visualCurrentState?.scalePercent ?? visualClip.scalePercent}
              />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <RangeControl
                label="Opacity"
                max={100}
                min={0}
                onChange={(value) => onUpdateVisualClip({ opacityPercent: Math.round(value) })}
                value={visualCurrentState?.opacityPercent ?? visualClip.opacityPercent}
                valueLabel={`${Math.round(visualCurrentState?.opacityPercent ?? visualClip.opacityPercent)}%`}
              />
              <NumberField
                label="Rotation"
                max={360}
                min={-360}
                onChange={(value) => onUpdateVisualClip({ rotationDeg: Math.round(value) })}
                step={1}
                value={visualCurrentState?.rotationDeg ?? visualClip.rotationDeg}
              />
            </div>
            <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100">
              Transform and opacity controls edit the selected clip keyframe at the playhead. Start and End keyframes exist by default.
            </div>
            <VisualKeyframeInspector
              clip={visualClip}
              durationSeconds={visualDurationSeconds ?? 0}
              onAddOrUpdateKeyframe={onAddOrUpdateKeyframe}
              onJumpKeyframe={onJumpKeyframe}
              onRemoveKeyframe={onRemoveVisualKeyframe}
              onUpdateKeyframe={onUpdateVisualKeyframe}
              timelineCursorSeconds={timelineCursorSeconds}
            />
            {visualCrop ? (
              <div className="space-y-3 rounded-xl border border-gray-700/60 bg-[#111217]/35 p-3">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Crop Boundary</div>
                <div className="grid gap-3 md:grid-cols-2">
                  <NumberField
                    label="Left"
                    max={95}
                    min={0}
                    onChange={(value) => updateVisualCrop({ cropLeftPercent: Math.round(value) })}
                    step={1}
                    value={visualCrop.cropLeftPercent}
                  />
                  <NumberField
                    label="Right"
                    max={95}
                    min={0}
                    onChange={(value) => updateVisualCrop({ cropRightPercent: Math.round(value) })}
                    step={1}
                    value={visualCrop.cropRightPercent}
                  />
                  <NumberField
                    label="Top"
                    max={95}
                    min={0}
                    onChange={(value) => updateVisualCrop({ cropTopPercent: Math.round(value) })}
                    step={1}
                    value={visualCrop.cropTopPercent}
                  />
                  <NumberField
                    label="Bottom"
                    max={95}
                    min={0}
                    onChange={(value) => updateVisualCrop({ cropBottomPercent: Math.round(value) })}
                    step={1}
                    value={visualCrop.cropBottomPercent}
                  />
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <NumberField
                    label="Pan X"
                    max={100}
                    min={-100}
                    onChange={(value) => updateVisualCrop({ cropPanXPercent: Math.round(value) })}
                    step={1}
                    value={visualCrop.cropPanXPercent}
                  />
                  <NumberField
                    label="Pan Y"
                    max={100}
                    min={-100}
                    onChange={(value) => updateVisualCrop({ cropPanYPercent: Math.round(value) })}
                    step={1}
                    value={visualCrop.cropPanYPercent}
                  />
                  <NumberField
                    label="Crop rotation"
                    max={360}
                    min={-360}
                    onChange={(value) => updateVisualCrop({ cropRotationDeg: Math.round(value) })}
                    step={1}
                    value={visualCrop.cropRotationDeg}
                  />
                </div>
                {visualClip.sourceKind === 'image' ? (
                  <button
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-100 transition-colors hover:border-cyan-300/60 hover:bg-cyan-500/15 disabled:cursor-not-allowed disabled:border-gray-700/60 disabled:bg-[#0f131b] disabled:text-gray-500"
                    disabled={!visualBackingImageItem?.assetUrl}
                    onClick={onCommitVisualCropAsImageAsset}
                    type="button"
                  >
                    Commit Crop As New Image Asset
                  </button>
                ) : null}
              </div>
            ) : null}
            <div className="space-y-3 rounded-xl border border-gray-700/60 bg-[#111217]/35 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Filters And Blend</div>
                <div className="flex flex-wrap gap-1.5">
                  {EDITOR_CLIP_FILTER_KINDS.map((kind) => (
                    <button
                      className="rounded-lg border border-gray-700/60 bg-[#0f131b] px-2 py-1 text-[10px] font-semibold text-gray-300 transition-colors hover:border-gray-500 hover:text-white"
                      key={kind}
                      onClick={() => addVisualFilter(kind)}
                      type="button"
                    >
                      {formatClipFilterKind(kind)}
                    </button>
                  ))}
                </div>
              </div>
              <label className="block space-y-2 text-xs text-gray-400">
                <span>Blend mode</span>
                <select
                  className="w-full rounded-xl border border-gray-700/60 bg-[#0f131b] px-3 py-2 text-sm text-gray-100 outline-none"
                  onChange={(event) => onUpdateVisualClip({ blendMode: event.target.value as EditorStageBlendMode })}
                  value={visualClip.blendMode ?? 'normal'}
                >
                  {getClipBlendModes().map((mode) => (
                    <option key={mode} value={mode}>
                      {formatStageBlendModeLabel(mode)}
                    </option>
                  ))}
                </select>
              </label>
              {chromaKey ? (
                <div className="space-y-3 rounded-lg border border-emerald-400/20 bg-emerald-500/10 p-3">
                  <label className="flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-100">
                    <span>Chroma Key</span>
                    <input
                      checked={chromaKey.enabled}
                      onChange={(event) => updateChromaKey({ enabled: event.target.checked })}
                      type="checkbox"
                    />
                  </label>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="block space-y-2 text-xs text-gray-400">
                      <span>Key color</span>
                      <AdvancedColorPicker
                        className="h-10 w-full"
                        buttonClassName="rounded-xl border border-gray-700/60 bg-[#0f131b]"
                        label="Chroma key color"
                        onChange={(color) => updateChromaKey({ color })}
                        value={chromaKey.color}
                      />
                    </label>
                    <RangeControl
                      label="Similarity"
                      max={100}
                      min={0}
                      onChange={(value) => updateChromaKey({ similarityPercent: Math.round(value) })}
                      value={chromaKey.similarityPercent}
                      valueLabel={`${chromaKey.similarityPercent}%`}
                    />
                    <RangeControl
                      label="Edge blend"
                      max={100}
                      min={0}
                      onChange={(value) => updateChromaKey({ blendPercent: Math.round(value) })}
                      value={chromaKey.blendPercent}
                      valueLabel={`${chromaKey.blendPercent}%`}
                    />
                  </div>
                </div>
              ) : null}
              {stroke ? (
                <div className="space-y-3 rounded-lg border border-sky-400/20 bg-sky-500/10 p-3">
                  <label className="flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.16em] text-sky-100">
                    <span>Clip Stroke</span>
                    <input
                      checked={stroke.enabled}
                      onChange={(event) => updateStroke({ enabled: event.target.checked })}
                      type="checkbox"
                    />
                  </label>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="block space-y-2 text-xs text-gray-400">
                      <span>Stroke color</span>
                      <AdvancedColorPicker
                        className="h-10 w-full"
                        buttonClassName="rounded-xl border border-gray-700/60 bg-[#0f131b]"
                        label="Clip stroke color"
                        onChange={(color) => updateStroke({ color })}
                        value={stroke.color}
                      />
                    </label>
                    <RangeControl
                      label="Stroke width"
                      max={80}
                      min={0}
                      onChange={(value) => updateStroke({ widthPx: Math.round(value) })}
                      value={stroke.widthPx}
                      valueLabel={`${stroke.widthPx}px`}
                    />
                    <RangeControl
                      label="Stroke opacity"
                      max={100}
                      min={0}
                      onChange={(value) => updateStroke({ opacityPercent: Math.round(value) })}
                      value={stroke.opacityPercent}
                      valueLabel={`${stroke.opacityPercent}%`}
                    />
                  </div>
                </div>
              ) : null}
              {visualClip.filterStack.length > 0 ? (
                <div className="space-y-2">
                  {visualClip.filterStack.map((filter) => (
                    <div className="rounded-lg border border-gray-700/60 bg-[#0f131b] p-2" key={filter.id}>
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <label className="flex items-center gap-2 text-xs font-semibold text-gray-200">
                          <input
                            checked={filter.enabled}
                            onChange={(event) => updateVisualFilter(filter.id, { enabled: event.target.checked })}
                            type="checkbox"
                          />
                          {formatClipFilterKind(filter.kind)}
                        </label>
                        <button
                          className="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-[10px] font-semibold text-red-100 transition-colors hover:border-red-400/60"
                          onClick={() => removeVisualFilter(filter.id)}
                          type="button"
                        >
                          Remove
                        </button>
                      </div>
                      <RangeControl
                        label="Amount"
                        max={getClipFilterAmountRange(filter.kind).max}
                        min={getClipFilterAmountRange(filter.kind).min}
                        onChange={(value) => updateVisualFilter(filter.id, { amount: Math.round(value) })}
                        value={filter.amount}
                        valueLabel={`${filter.amount}`}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-gray-500">No filters on this clip.</div>
              )}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex items-center gap-2 rounded-xl border border-gray-700/60 bg-[#111217]/35 px-3 py-2 text-sm text-gray-300">
                <input
                  checked={visualClip.flipHorizontal}
                  onChange={(event) => onUpdateVisualClip({ flipHorizontal: event.target.checked })}
                  type="checkbox"
                />
                Flip Horizontal
              </label>
              <label className="flex items-center gap-2 rounded-xl border border-gray-700/60 bg-[#111217]/35 px-3 py-2 text-sm text-gray-300">
                <input
                  checked={visualClip.flipVertical}
                  onChange={(event) => onUpdateVisualClip({ flipVertical: event.target.checked })}
                  type="checkbox"
                />
                Flip Vertical
              </label>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <NumberField
                label="Position X"
                max={2000}
                min={-2000}
                onChange={(value) => onUpdateVisualClip({ positionX: Math.round(value) })}
                step={1}
                value={visualCurrentState?.positionX ?? visualClip.positionX}
              />
              <NumberField
                label="Position Y"
                max={2000}
                min={-2000}
                onChange={(value) => onUpdateVisualClip({ positionY: Math.round(value) })}
                step={1}
                value={visualCurrentState?.positionY ?? visualClip.positionY}
              />
            </div>
            {visualClip.sourceKind === 'comic' ? (
              <div className="space-y-3 rounded-xl border border-gray-700/60 bg-[#111217]/35 p-3">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-100/70">
                  {visualClip.comicKind === 'caption' ? 'Caption' : visualClip.comicKind === 'thought-bubble' ? 'Thought Bubble' : 'Speech Bubble'} · Motion Comic
                </div>
                <label className="block space-y-2 text-xs text-gray-400">
                  <span>Text</span>
                  <textarea
                    className="h-20 w-full resize-none rounded-xl border border-gray-700/60 bg-[#0f131b] p-2 text-sm text-gray-100"
                    onChange={(event) => onUpdateVisualClip({ textContent: event.target.value })}
                    value={visualClip.textContent ?? ''}
                  />
                </label>
                <div className="grid gap-3 md:grid-cols-3">
                  <label className="block space-y-2 text-xs text-gray-400">
                    <span>Fill</span>
                    <AdvancedColorPicker
                      className="h-11 w-full"
                      buttonClassName="rounded-xl border border-gray-700/60 bg-[#0f131b]"
                      label="Bubble fill color"
                      onChange={(shapeFillColor) => onUpdateVisualClip({ shapeFillColor })}
                      value={visualClip.shapeFillColor ?? '#ffffff'}
                    />
                  </label>
                  <label className="block space-y-2 text-xs text-gray-400">
                    <span>Outline</span>
                    <AdvancedColorPicker
                      className="h-11 w-full"
                      buttonClassName="rounded-xl border border-gray-700/60 bg-[#0f131b]"
                      label="Bubble outline color"
                      onChange={(shapeBorderColor) => onUpdateVisualClip({ shapeBorderColor })}
                      value={visualClip.shapeBorderColor ?? '#181b20'}
                    />
                  </label>
                  <label className="block space-y-2 text-xs text-gray-400">
                    <span>Text color</span>
                    <AdvancedColorPicker
                      className="h-11 w-full"
                      buttonClassName="rounded-xl border border-gray-700/60 bg-[#0f131b]"
                      label="Bubble text color"
                      onChange={(textColor) => onUpdateVisualClip({ textColor })}
                      value={visualClip.textColor}
                    />
                  </label>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <NumberField
                    label="Font size"
                    max={400}
                    min={8}
                    onChange={(value) => onUpdateVisualClip({ textSizePx: Math.max(8, Math.round(value)) })}
                    step={1}
                    value={visualClip.textSizePx}
                  />
                  <NumberField
                    label="Outline width"
                    max={40}
                    min={0}
                    onChange={(value) => onUpdateVisualClip({ shapeBorderWidth: Math.max(0, Math.round(value)) })}
                    step={1}
                    value={visualClip.shapeBorderWidth ?? 6}
                  />
                  <NumberField
                    label="Line height %"
                    max={240}
                    min={80}
                    onChange={(value) => onUpdateVisualClip({ comicLineHeightPercent: Math.max(80, Math.min(240, Math.round(value))) })}
                    step={5}
                    value={visualClip.comicLineHeightPercent ?? 120}
                  />
                  <NumberField
                    label="Letter spacing"
                    max={24}
                    min={-4}
                    onChange={(value) => onUpdateVisualClip({ comicLetterSpacingPx: Math.max(-4, Math.min(24, Math.round(value))) })}
                    step={1}
                    value={visualClip.comicLetterSpacingPx ?? 0}
                  />
                </div>
                {visualClip.comicKind !== 'caption' ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    <NumberField
                      label="Tail angle°"
                      max={360}
                      min={0}
                      onChange={(value) => onUpdateVisualClip({ comicTailAngleDeg: Math.round(value) })}
                      step={5}
                      value={visualClip.comicTailAngleDeg ?? 115}
                    />
                    <NumberField
                      label="Tail length"
                      max={600}
                      min={0}
                      onChange={(value) => onUpdateVisualClip({ comicTailLengthPx: Math.max(0, Math.round(value)) })}
                      step={5}
                      value={visualClip.comicTailLengthPx ?? 90}
                    />
                  </div>
                ) : null}
                <div className="flex gap-2">
                  {(['left', 'center', 'right'] as const).map((align) => (
                    <button
                      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${(visualClip.comicTextAlign ?? 'center') === align ? 'border-cyan-300/50 bg-cyan-500/10 text-cyan-100' : 'border-gray-700/60 text-gray-400 hover:text-gray-200'}`}
                      key={align}
                      onClick={() => onUpdateVisualClip({ comicTextAlign: align })}
                      type="button"
                    >
                      {align === 'left' ? 'Left' : align === 'center' ? 'Center' : 'Right'}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {visualClip.sourceKind === 'text' ? (
              <div className="space-y-3 rounded-xl border border-gray-700/60 bg-[#111217]/35 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Text</div>
                  <button
                    className="rounded-lg border border-gray-700/60 bg-[#0f131b] px-2.5 py-1.5 text-[11px] font-semibold text-gray-200 transition-colors hover:border-gray-500 hover:text-white"
                    onClick={() => onEditVisualText(visualClip)}
                    type="button"
                  >
                    Edit Text
                  </button>
                </div>
                <button
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-100 transition-colors hover:border-cyan-300/60 hover:bg-cyan-500/15"
                  onClick={onGenerateNarrationFromText}
                  type="button"
                >
                  Generate Narration Audio From Text
                </button>
                <label className="block space-y-2 text-xs text-gray-400">
                  <span>Text</span>
                  <textarea
                    className="min-h-24 w-full rounded-xl border border-gray-700/60 bg-[#0f131b] px-3 py-2 text-sm text-gray-100 outline-none"
                    onChange={(event) => onUpdateVisualClip({ textContent: event.target.value })}
                    value={visualClip.textContent ?? visualSourceItem?.text ?? visualEditorAsset?.textDefaults?.text ?? ''}
                  />
                </label>
                <label className="block space-y-2 text-xs text-gray-400">
                  <span>Font family</span>
                  <input
                    className="w-full rounded-xl border border-gray-700/60 bg-[#0f131b] px-3 py-2 text-sm text-gray-100 outline-none"
                    onChange={(event) => onUpdateVisualClip({ textFontFamily: event.target.value })}
                    type="text"
                    value={visualClip.textFontFamily}
                  />
                </label>
                <div className="grid gap-3 md:grid-cols-2">
                  <NumberField
                    label="Font size"
                    max={256}
                    min={12}
                    onChange={(value) => onUpdateVisualClip({ textSizePx: Math.max(12, Math.round(value)) })}
                    step={1}
                    value={visualClip.textSizePx}
                  />
                  <label className="block space-y-2 text-xs text-gray-400">
                    <span>Text color</span>
                    <AdvancedColorPicker
                      className="h-11 w-full"
                      buttonClassName="rounded-xl border border-gray-700/60 bg-[#0f131b]"
                      label="Visual clip text color"
                      onChange={(textColor) => onUpdateVisualClip({ textColor })}
                      value={visualClip.textColor}
                    />
                  </label>
                </div>
                <label className="block space-y-2 text-xs text-gray-400">
                  <span>Text effect</span>
                  <select
                    className="w-full rounded-xl border border-gray-700/60 bg-[#0f131b] px-3 py-2 text-sm text-gray-100 outline-none"
                    onChange={(event) => onUpdateVisualClip({ textEffect: event.target.value as EditorVisualClip['textEffect'] })}
                    value={visualClip.textEffect}
                  >
                    <option value="none">None</option>
                    <option value="shadow">Shadow</option>
                    <option value="glow">Glow</option>
                    <option value="outline">Outline</option>
                  </select>
                </label>
              </div>
            ) : null}
            {visualClip.sourceKind === 'shape' ? (
              <div className="space-y-3 rounded-xl border border-gray-700/60 bg-[#111217]/35 p-3">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Shape</div>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="block space-y-2 text-xs text-gray-400">
                    <span>Fill</span>
                    <AdvancedColorPicker
                      className="h-11 w-full"
                      buttonClassName="rounded-xl border border-gray-700/60 bg-[#0f131b]"
                      label="Visual clip shape fill color"
                      onChange={(shapeFillColor) => onUpdateVisualClip({ shapeFillColor })}
                      value={visualClip.shapeFillColor ?? '#0ea5e9'}
                    />
                  </label>
                  <label className="block space-y-2 text-xs text-gray-400">
                    <span>Border</span>
                    <AdvancedColorPicker
                      className="h-11 w-full"
                      buttonClassName="rounded-xl border border-gray-700/60 bg-[#0f131b]"
                      label="Visual clip shape border color"
                      onChange={(shapeBorderColor) => onUpdateVisualClip({ shapeBorderColor })}
                      value={visualClip.shapeBorderColor ?? '#f8fafc'}
                    />
                  </label>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <NumberField
                    label="Border width"
                    max={80}
                    min={0}
                    onChange={(value) => onUpdateVisualClip({ shapeBorderWidth: Math.max(0, Math.round(value)) })}
                    step={1}
                    value={visualClip.shapeBorderWidth ?? 2}
                  />
                  <NumberField
                    label="Corner radius"
                    max={300}
                    min={0}
                    onChange={(value) => onUpdateVisualClip({ shapeCornerRadius: Math.max(0, Math.round(value)) })}
                    step={1}
                    value={visualClip.shapeCornerRadius ?? 18}
                  />
                </div>
              </div>
            ) : null}
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block space-y-2 text-xs text-gray-400">
                <span>Transition in</span>
                <select
                  className="w-full rounded-xl border border-gray-700/60 bg-[#0f131b] px-3 py-2 text-sm text-gray-100 outline-none"
                  onChange={(event) => onUpdateVisualClip({ transitionIn: event.target.value as EditorVisualClip['transitionIn'] })}
                  value={visualClip.transitionIn}
                >
                  <option value="none">None</option>
                  <option value="fade">Fade</option>
                  <option value="slide-left">Slide left</option>
                  <option value="slide-right">Slide right</option>
                  <option value="slide-up">Slide up</option>
                  <option value="slide-down">Slide down</option>
                </select>
              </label>
              <label className="block space-y-2 text-xs text-gray-400">
                <span>Transition out</span>
                <select
                  className="w-full rounded-xl border border-gray-700/60 bg-[#0f131b] px-3 py-2 text-sm text-gray-100 outline-none"
                  onChange={(event) => onUpdateVisualClip({ transitionOut: event.target.value as EditorVisualClip['transitionOut'] })}
                  value={visualClip.transitionOut}
                >
                  <option value="none">None</option>
                  <option value="fade">Fade</option>
                  <option value="slide-left">Slide left</option>
                  <option value="slide-right">Slide right</option>
                  <option value="slide-up">Slide up</option>
                  <option value="slide-down">Slide down</option>
                </select>
              </label>
            </div>
            <NumberField
              label="Transition duration"
              max={5}
              min={0}
              onChange={(value) => onUpdateVisualClip({ transitionDurationMs: Math.max(0, Math.round(value * 1000)) })}
              step={0.1}
              value={visualClip.transitionDurationMs / 1000}
            />
            <button
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-100 transition-colors hover:border-red-400/60 hover:bg-red-500/15"
              onClick={onRemoveVisualClip}
              type="button"
            >
              <Trash2 size={14} />
              Remove From Cut
            </button>
          </div>
        ) : audioClip ? (
          <div className="space-y-4">
            <InspectorHeader
              eyebrow="Selected Audio Clip"
              title={audioSourceItem?.label ?? audioClip.sourceNodeId}
            />
            <InfoStack
              rows={[
                ['Lane', `Audio ${audioClip.trackIndex + 1}`],
                ['Start', `${(audioClip.offsetMs / 1000).toFixed(2)}s`],
                ['Track volume', `${audioTrackVolumes[audioClip.trackIndex] ?? 100}%`],
                ['Enabled', audioClip.enabled ? 'Yes' : 'No'],
              ]}
            />
            <label className="block space-y-2 text-xs text-gray-400">
              <span>Track</span>
              <select
                className="w-full rounded-xl border border-gray-700/60 bg-[#0f131b] px-3 py-2 text-sm text-gray-100 outline-none"
                onChange={(event) => onMoveAudioToTrack(Number(event.target.value))}
                value={audioClip.trackIndex}
              >
                {Array.from({ length: 4 }, (_, index) => (
                  <option key={index} value={index}>
                    Audio {index + 1}
                  </option>
                ))}
              </select>
            </label>
            <NumberField
              label="Start time"
              max={3600}
              min={0}
              onChange={(value) => onUpdateAudioClip({ offsetMs: Math.max(0, Math.round(value * 1000)) })}
              step={0.1}
              value={audioClip.offsetMs / 1000}
            />
            <RangeControl
              label="Clip volume"
              max={150}
              min={0}
              onChange={(value) => onUpdateAudioClip({ volumePercent: value })}
              value={audioClip.volumePercent}
              valueLabel={`${audioClip.volumePercent}%`}
            />
            {audioClip.volumeAutomationPoints?.length ? (
              <button
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-400/25 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-100 transition-colors hover:border-cyan-300/60"
                onClick={() => onUpdateAudioClip({ volumeAutomationPoints: undefined })}
                type="button"
              >
                Reset Volume Automation
              </button>
            ) : null}
            <AudioKeyframeInspector
              clip={audioClip}
              durationSeconds={audioDurationSeconds ?? 0}
              onAddOrUpdateKeyframe={onAddOrUpdateKeyframe}
              onJumpKeyframe={onJumpKeyframe}
              onRemoveKeyframe={onRemoveAudioKeyframe}
              onUpdateKeyframe={onUpdateAudioKeyframe}
              timelineCursorSeconds={timelineCursorSeconds}
            />
            <label className="flex items-center gap-2 rounded-xl border border-gray-700/60 bg-[#111217]/35 px-3 py-2 text-sm text-gray-300">
              <input
                checked={audioClip.enabled}
                onChange={(event) => onUpdateAudioClip({ enabled: event.target.checked })}
                type="checkbox"
              />
              Enabled In Render
            </label>
            <button
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-100 transition-colors hover:border-red-400/60 hover:bg-red-500/15"
              onClick={onRemoveAudioClip}
              type="button"
            >
              <Trash2 size={14} />
              Remove From Lane
            </button>
          </div>
        ) : selectedSourceItem ? (
          <div className="space-y-4">
            <InspectorHeader eyebrow="Selected Source" title={selectedSourceItem.label} />
            <InfoStack
              rows={[
                ['Kind', selectedSourceItem.kind],
                ['Asset id', selectedSourceItem.nodeId],
                ['Sequence length', sequenceDurationSeconds > 0 ? `${sequenceDurationSeconds.toFixed(1)}s` : '0.0s'],
              ]}
            />
            <button
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-700/60 bg-[#0f131b] px-3 py-2 text-xs font-semibold text-gray-200 transition-colors hover:border-gray-500 hover:text-white"
              onClick={onSelectSource}
              type="button"
            >
              <Archive size={14} />
              Keep Focused In Source Monitor
            </button>
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-3 text-xs text-blue-100">
              Source monitor and program monitor are now separate on purpose: the source monitor is for inspecting raw media,
              while the program monitor only reflects rendered output from the composition.
            </div>
          </div>
        ) : (
          <EmptyState
            body="Select a source item from the bin or a clip from the sequencer to edit its properties here."
            title="Nothing selected"
          />
        )}
      </div>
    </aside>
  );
}

export interface TrackMenuOption {
  trackIndex: number;
  label: string;
}

export function buildTrackMenuOptions(trackCount: number, noun: string): TrackMenuOption[] {
  return Array.from({ length: Math.max(0, trackCount) }, (_, trackIndex) => ({
    trackIndex,
    label: `${noun} ${trackIndex + 1}`,
  }));
}

/**
 * UX review F05 — replaces the cryptic V1–V4 / A1–A2 clip buttons with a primary "+Add"
 * (drops onto the first track) plus a labelled track menu for picking a specific lane.
 * The menu is a native <details> disclosure so it renders for tests and stays keyboard
 * accessible.
 */
export function TrackAddControl({
  icon: Icon,
  noun,
  trackCount,
  onAdd,
  compact = false,
}: {
  icon: ComponentType<{ size?: number }>;
  noun: string;
  trackCount: number;
  onAdd: (trackIndex: number) => void;
  compact?: boolean;
}) {
  const options = buildTrackMenuOptions(trackCount, noun);
  if (options.length === 0) {
    return null;
  }

  const primary = options[0];
  const hasTrackMenu = options.length > 1;
  const buttonPadding = compact ? 'px-2 py-1 text-[10px]' : 'px-2.5 py-1.5 text-[11px]';

  return (
    <div className="inline-flex items-stretch overflow-hidden rounded-lg border border-gray-700/60 bg-[#0f131b]">
      <button
        className={`inline-flex items-center gap-1 font-semibold text-gray-200 transition-colors hover:bg-[#161c26] hover:text-white ${buttonPadding}`}
        onClick={(event) => {
          event.stopPropagation();
          onAdd(primary.trackIndex);
        }}
        title={`Add to ${primary.label}`}
        type="button"
      >
        <Icon size={12} />
        <Plus size={11} />
        <span>Add {noun}</span>
      </button>
      {hasTrackMenu ? (
        <details className="relative border-l border-gray-700/60">
          <summary
            aria-label={`Choose ${noun} track`}
            className={`flex cursor-pointer list-none items-center justify-center text-gray-300 transition-colors hover:bg-[#161c26] hover:text-white [&::-webkit-details-marker]:hidden ${
              compact ? 'px-1.5 py-1' : 'px-2 py-1.5'
            }`}
            onClick={(event) => event.stopPropagation()}
            title={`Choose ${noun} track`}
          >
            <ChevronDown size={12} />
          </summary>
          <div className="absolute right-0 z-30 mt-1 w-36 rounded-lg border border-gray-700/60 bg-[#0d0f15] p-1 shadow-2xl">
            <div className="px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-gray-500">
              {noun} tracks
            </div>
            {options.map((option) => (
              <button
                key={option.trackIndex}
                className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[11px] font-medium text-gray-200 transition-colors hover:bg-[#1a212d] hover:text-white"
                onClick={(event) => {
                  event.stopPropagation();
                  onAdd(option.trackIndex);
                  event.currentTarget.closest('details')?.removeAttribute('open');
                }}
                type="button"
              >
                <Icon size={11} />
                {option.label}
              </button>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

export function SourceItemCard({
  item,
  durationSeconds,
  isSelected,
  onSelect,
  onAddVisual,
  onAddAudio,
  onOpenPreview,
  onToggleCollapsed,
  onToggleStarred,
  onRemove,
}: {
  item: SourceBinItem;
  durationSeconds?: number;
  isSelected: boolean;
  onSelect: () => void;
  onAddVisual: (trackIndex: number) => void;
  onAddAudio: (trackIndex: number) => void;
  onOpenPreview: () => void;
  onToggleCollapsed: () => void;
  onToggleStarred: () => void;
  onRemove: () => void;
}) {
  const isCollapsed = Boolean(item.collapsed);
  const isStarred = Boolean(item.starred);
  const previewSupportLabel = getBrowserPreviewSupportLabel(item.label, item.mimeType);

  return (
    <div
      className={`w-full cursor-grab rounded-lg border p-2.5 text-left transition-colors active:cursor-grabbing ${
        isSelected
          ? 'border-blue-400/60 bg-blue-500/10'
          : 'border-gray-700/60 bg-[#111217]/35 hover:border-gray-500 hover:bg-[#161c26]'
      }`}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'copy';
        event.dataTransfer.setData('application/x-flow-source-bin-item', JSON.stringify({ itemId: item.id }));
      }}
    >
      <div className="flex items-start gap-2">
        <button
          className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-gray-700/60 bg-[#0d0f15] text-gray-300 transition-colors hover:border-gray-500 hover:text-white"
          onClick={(event) => {
            event.stopPropagation();
            onToggleCollapsed();
          }}
          title={isCollapsed ? 'Expand item' : 'Collapse item'}
          type="button"
        >
          {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
        </button>
        <button
          className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-colors ${
            isStarred
              ? 'border-amber-300/40 bg-amber-400/15 text-amber-200'
              : 'border-gray-700/60 bg-[#0d0f15] text-gray-400 hover:border-gray-500 hover:text-white'
          }`}
          onClick={(event) => {
            event.stopPropagation();
            onToggleStarred();
          }}
          title={isStarred ? 'Unstar item' : 'Star item'}
          type="button"
        >
          <Star fill={isStarred ? 'currentColor' : 'none'} size={13} />
        </button>
        {!isCollapsed ? (
        <button className="shrink-0 text-left" onClick={onOpenPreview} type="button">
          <div className="overflow-hidden rounded-md border border-gray-700/60 bg-[#0d0f15]">
            <MiniPreview item={item} />
          </div>
        </button>
        ) : null}
        <div className="min-w-0 flex-1">
          <button className="w-full text-left" onClick={onSelect} type="button">
            <div className="flex min-w-0 items-center gap-1.5">
              {isStarred ? <Star className="shrink-0 text-amber-200" fill="currentColor" size={11} /> : null}
              <span className="truncate text-[13px] font-medium text-gray-100">{item.label}</span>
            </div>
            <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-gray-500">{item.kind}</div>
            {item.envelopeLabel ? (
              <div className="mt-1 truncate text-[11px] font-medium text-cyan-100/80">{item.envelopeLabel}</div>
            ) : null}
            {!isCollapsed && previewSupportLabel ? <div className="mt-1 text-[10px] text-amber-200/80">{previewSupportLabel}</div> : null}
            {!isCollapsed && durationSeconds ? <div className="mt-1 text-[11px] text-gray-400">{durationSeconds.toFixed(1)}s</div> : null}
          </button>
        </div>
        <button
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-red-500/25 bg-red-500/10 text-red-100 transition-colors hover:border-red-400/60 hover:bg-red-500/20"
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          type="button"
        >
          <Trash2 size={12} />
        </button>
          </div>

      {!isCollapsed ? (
      <div className="mt-2 flex flex-wrap gap-1.5">
        {canUseSourceItemAsVisual(item) ? (
          <TrackAddControl compact icon={Film} noun="Video" onAdd={onAddVisual} trackCount={VISUAL_TRACK_COUNT} />
        ) : null}

        {canUseSourceItemAsAudio(item) ? (
          <TrackAddControl compact icon={Music2} noun="Audio" onAdd={onAddAudio} trackCount={AUDIO_TRACK_COUNT} />
        ) : null}
      </div>
      ) : null}
    </div>
  );
}

function EditorAssetCard({
  asset,
  onOpenContextMenu,
  onPlace,
  previewSourceItem,
}: {
  asset: EditorAsset;
  onOpenContextMenu: (event: React.MouseEvent<HTMLElement>) => void;
  onPlace: (trackIndex: number) => void;
  previewSourceItem?: SourceBinItem;
}) {
  const draggableSourceItem = previewSourceItem && canUseSourceItemAsVisual(previewSourceItem)
    ? previewSourceItem
    : undefined;

  return (
    <article
      className={`rounded-xl border border-gray-700/60 bg-[#111217]/70 p-2.5 ${
        draggableSourceItem ? 'cursor-grab active:cursor-grabbing' : ''
      }`}
      draggable={Boolean(draggableSourceItem)}
      onDragStart={(event) => {
        if (!draggableSourceItem) {
          return;
        }

        event.dataTransfer.effectAllowed = 'copy';
        event.dataTransfer.setData('application/x-flow-source-bin-item', JSON.stringify({ itemId: draggableSourceItem.id }));
      }}
      onContextMenu={onOpenContextMenu}
    >
      <div className="flex items-center gap-2">
        <div className="flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-700/60 bg-[#0f131b] text-cyan-200">
          {asset.kind === 'text' ? (
            <div
              className="max-w-full truncate px-1 text-center font-semibold"
              style={{
                color: asset.textDefaults?.color ?? '#f8fafc',
                fontFamily: asset.textDefaults?.fontFamily ?? 'Inter, system-ui, sans-serif',
                fontSize: `${Math.max(10, Math.min(18, (asset.textDefaults?.fontSizePx ?? 72) / 5))}px`,
                ...getTextPreviewEffectStyle(asset.textDefaults?.textEffect ?? 'shadow'),
              }}
            >
              {asset.textDefaults?.text || 'Text'}
            </div>
          ) : asset.kind === 'shape' ? (
            <div
              className="h-7 w-10"
              style={{
                backgroundColor: asset.shapeDefaults?.fillColor ?? '#0ea5e9',
                borderColor: asset.shapeDefaults?.borderColor ?? '#f8fafc',
                borderRadius: asset.shapeDefaults?.cornerRadius ?? 8,
                borderStyle: 'solid',
                borderWidth: Math.min(4, asset.shapeDefaults?.borderWidth ?? 2),
              }}
            />
          ) : previewSourceItem?.assetUrl ? (
            <img alt={asset.label} className="h-full w-full object-cover" src={previewSourceItem.assetUrl} />
          ) : (
            <ImageIcon size={18} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-gray-100">{asset.label}</div>
          <div className="mt-0.5 text-[10px] uppercase tracking-[0.16em] text-gray-500">{asset.kind}</div>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {Array.from({ length: VISUAL_TRACK_COUNT }, (_, trackIndex) => (
          <button
            className={miniTrackButtonClassName}
            key={trackIndex}
            onClick={() => onPlace(trackIndex)}
            type="button"
          >
            V{trackIndex + 1}
          </button>
        ))}
      </div>
    </article>
  );
}

function TimelineLane({
  trackLabel,
  locked = false,
  onToggleLock,
  collapsed = false,
  onToggleCollapse,
  timelineSeconds,
  blocks,
  emptyMessage,
  onSelect,
  onMoveBlock,
  onCutBlock,
  onSlipBlock,
  onTrimBlockEdge,
  onAddAutomationPoint,
  onUpdateAutomationPoint,
  onRemoveAutomationPoint,
  automationLabel,
  gaps = [],
  selectedGapId,
  onSelectGap,
  onOpenGapContextMenu,
  onSetPlayhead,
  playheadSeconds,
  snapPoints = [],
  onOpenContextMenu,
  toolMode,
  onStartHandPan,
  onDropSourceItem,
  onResizeLane,
  laneHeight,
  trackVolumePercent,
  onTrackVolumeChange,
  previewById,
  waveformById,
}: {
  trackLabel: string;
  locked?: boolean;
  onToggleLock?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  timelineSeconds: number;
  blocks: Array<{
    id: string;
    label: string;
    secondaryLabel: string;
    startSeconds: number;
    durationSeconds: number;
    kind: TimelineBlockKind;
    trimClip?: EditorVisualClip;
    selected: boolean;
    muted?: boolean;
    opacityPercent?: number;
    opacityAutomationPoints?: TimelineAutomationPoint[];
    keyframePercents?: number[];
  }>;
  emptyMessage: string;
  onSelect: (id: string) => void;
  onMoveBlock?: (id: string, nextStartSeconds: number, shiftKey: boolean) => void;
  onCutBlock?: (id: string, splitSeconds: number, shiftKey: boolean) => void;
  onSlipBlock?: (id: string, deltaSeconds: number) => void;
  onTrimBlockEdge?: (
    clip: EditorVisualClip,
    edge: TimelineClipEdge,
    deltaSeconds: number,
    shiftKey: boolean,
    options?: { altKey?: boolean; phase?: 'start' | 'move' },
  ) => void;
  onAddAutomationPoint?: (id: string, point: TimelineAutomationPoint) => void;
  onUpdateAutomationPoint?: (id: string, pointIndex: number, point: TimelineAutomationPoint) => void;
  onRemoveAutomationPoint?: (id: string, pointIndex: number) => void;
  automationLabel?: string;
  gaps?: Required<TimelineGap>[];
  selectedGapId?: string;
  onSelectGap?: (gap: Required<TimelineGap>) => void;
  onOpenGapContextMenu?: (gap: Required<TimelineGap>, event: React.MouseEvent<HTMLElement>) => void;
  onSetPlayhead: (seconds: number) => void;
  playheadSeconds: number;
  snapPoints?: number[];
  onOpenContextMenu: (id: string, event: React.MouseEvent<HTMLElement>) => void;
  toolMode: TimelineTool;
  onStartHandPan: (event: React.PointerEvent<HTMLElement>) => void;
  onDropSourceItem?: (event: React.DragEvent<HTMLDivElement>) => void;
  onResizeLane?: (event: React.PointerEvent<HTMLElement>) => void;
  laneHeight: number;
  trackVolumePercent?: number;
  onTrackVolumeChange?: (volumePercent: number) => void;
  previewById?: Record<string, TimelineClipEdgePreview>;
  waveformById?: Record<string, number[]>;
}) {
  // Drawer-style minimize (owner request): a collapsed lane renders as a thin strip regardless
  // of the persisted laneHeight, so it can still be "kinda seen" without the full detail view.
  const collapsedLaneHeight = 14;
  const effectiveLaneHeight = collapsed ? collapsedLaneHeight : laneHeight;
  const laneInset = Math.max(3, Math.round(laneHeight * 0.08));
  const automationHeight = Math.max(24, Math.min(46, Math.round(laneHeight * 0.42)));
  const laneSizeStyle: CSSProperties = {
    height: effectiveLaneHeight,
    minHeight: effectiveLaneHeight,
  };
  const snapLaneSeconds = (seconds: number, shiftKey: boolean) =>
    resolveTimelineSnapSeconds(seconds, {
      snapPoints,
      shiftKey,
      maxSeconds: timelineSeconds,
    });
  const startEdgeTrim = (
    event: React.PointerEvent<HTMLElement>,
    block: {
      id: string;
      startSeconds: number;
      durationSeconds: number;
      trimClip?: EditorVisualClip;
    },
    edge: TimelineClipEdge,
  ) => {
    if (!onTrimBlockEdge || !block.trimClip || !isPrimaryTimelinePointerButton(event.button)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onSelect(block.id);

    const laneRect = (event.currentTarget.closest('[data-timeline-lane-body="true"]') as HTMLElement | null)
      ?.getBoundingClientRect();

    if (!laneRect) {
      return;
    }

    const startClientX = event.clientX;
    const startClip = block.trimClip;
    // phase 'start' lets the workspace snapshot the lane for Alt-drag RIPPLE trims (stateless per move).
    onTrimBlockEdge(startClip, edge, 0, event.shiftKey, { altKey: event.altKey, phase: 'start' });

    const onPointerMove = (moveEvent: PointerEvent) => {
      const deltaSeconds = ((moveEvent.clientX - startClientX) / laneRect.width) * timelineSeconds;
      onTrimBlockEdge(startClip, edge, deltaSeconds, moveEvent.shiftKey, { altKey: moveEvent.altKey, phase: 'move' });
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  return (
    <div className="group/lane relative grid grid-cols-[96px_minmax(0,1fr)] gap-2" style={laneSizeStyle}>
      <div
        className={`overflow-hidden rounded-lg border border-gray-700/60 bg-[#0f131b] ${collapsed ? 'flex items-center px-2 py-0' : 'px-2.5 py-2'}`}
        style={laneSizeStyle}
      >
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] font-semibold text-gray-100">{trackLabel}</span>
          {!collapsed && onToggleLock ? (
            <button
              aria-label={locked ? `Unlock ${trackLabel}` : `Lock ${trackLabel}`}
              className={`rounded px-1 text-[11px] leading-none transition-colors ${locked ? 'text-amber-300' : 'text-gray-600 hover:text-gray-300'}`}
              onClick={(event) => { event.stopPropagation(); onToggleLock(); }}
              title={locked ? 'Unlock track (edits re-enabled)' : 'Lock track (blocks every edit on this lane)'}
              type="button"
            >
              {locked ? '🔒' : '🔓'}
            </button>
          ) : null}
          {onToggleCollapse ? (
            <button
              aria-label={collapsed ? `Expand ${trackLabel}` : `Collapse ${trackLabel}`}
              className="rounded px-1 text-[11px] leading-none text-gray-500 transition-colors hover:text-gray-200"
              onClick={(event) => { event.stopPropagation(); onToggleCollapse(); }}
              title={collapsed ? `Expand ${trackLabel} (show full lane)` : `Collapse ${trackLabel} (minimize to a thin strip)`}
              type="button"
            >
              {collapsed ? '▸' : '▾'}
            </button>
          ) : null}
        </div>
        {!collapsed ? (
          <div className="mt-0.5 text-[10px] uppercase tracking-[0.16em] text-gray-500">
            {blocks.length} clip{blocks.length === 1 ? '' : 's'}
          </div>
        ) : null}
        {!collapsed && typeof trackVolumePercent === 'number' && onTrackVolumeChange ? (
          <label className="mt-2 block space-y-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-100/80">
            <span>Track {trackVolumePercent}%</span>
            <input
              className="w-full accent-cyan-300"
              max={100}
              min={0}
              onChange={(event) => onTrackVolumeChange(Number(event.target.value))}
              step={1}
              type="range"
              value={trackVolumePercent}
            />
          </label>
        ) : null}
      </div>
      <div
        data-timeline-lane-body="true"
        data-timeline-lane-locked={locked ? 'true' : undefined}
        data-timeline-lane-collapsed={collapsed ? 'true' : undefined}
        className={`relative overflow-hidden rounded-lg border border-gray-700/60 bg-[#0f131b] ${locked ? 'pointer-events-none opacity-55 saturate-50' : ''} ${collapsed ? 'pointer-events-none' : ''}`}
        onDragOver={(event) => {
          if (!onDropSourceItem || !event.dataTransfer.types.includes('application/x-flow-source-bin-item')) {
            return;
          }

          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
        }}
        onDrop={(event) => onDropSourceItem?.(event)}
        onClick={(event) => {
          if (toolMode === 'hand') {
            return;
          }
          const bounds = event.currentTarget.getBoundingClientRect();
          const ratio = (event.clientX - bounds.left) / bounds.width;
          const nextSeconds = Math.max(0, Math.min(timelineSeconds, ratio * timelineSeconds));
          onSetPlayhead(snapLaneSeconds(nextSeconds, event.shiftKey));
        }}
        onPointerDown={(event) => {
          if (toolMode === 'hand') {
            onStartHandPan(event);
          }
        }}
        style={laneSizeStyle}
      >
        {snapPoints.map((snapSecond) => (
          <div
            key={`lane-snap-${snapSecond}`}
            className="pointer-events-none absolute bottom-0 top-0 z-[1] border-l border-cyan-200/20"
            style={{ left: `${(snapSecond / timelineSeconds) * 100}%` }}
          />
        ))}
        <div
          className="absolute bottom-0 top-0 z-10 w-px bg-red-400/90"
          style={{ left: `${(playheadSeconds / timelineSeconds) * 100}%` }}
        />
        {!collapsed && gaps.map((gap) => {
          const isSelectedGap = gap.id === selectedGapId;

          return (
            <button
              className={`absolute z-10 flex items-center justify-center rounded-md border border-dashed px-2 text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors ${
                isSelectedGap
                  ? 'border-amber-200/80 bg-amber-300/15 text-amber-100'
                  : 'border-amber-400/25 bg-amber-400/5 text-amber-100/60 hover:border-amber-200/60 hover:text-amber-100'
              }`}
              key={gap.id}
              onClick={(event) => {
                event.stopPropagation();
                onSelectGap?.(gap);
              }}
              onContextMenu={(event) => onOpenGapContextMenu?.(gap, event)}
              style={{
                left: `${(gap.startSeconds / timelineSeconds) * 100}%`,
                width: `max(${(gap.durationSeconds / timelineSeconds) * 100}%, 3.5rem)`,
                top: laneInset,
                height: Math.max(28, laneHeight - laneInset * 2),
              }}
              type="button"
            >
              Gap {gap.durationSeconds.toFixed(1)}s
            </button>
          );
        })}
        {collapsed ? (
          blocks.map((block) => (
            // Collapsed drawer view: no waveform/label/automation, just a slim positioned bar
            // so there's still a hint that "something is there" without the full detail view.
            <div
              className={`absolute rounded-sm ${
                block.muted
                  ? 'bg-gray-500/50'
                  : block.selected
                    ? 'bg-blue-300/80'
                    : 'bg-cyan-400/60'
              }`}
              key={block.id}
              style={{
                left: `${(block.startSeconds / timelineSeconds) * 100}%`,
                width: `max(${(block.durationSeconds / timelineSeconds) * 100}%, 3px)`,
                top: 2,
                bottom: 2,
              }}
              title={block.label}
            />
          ))
        ) : blocks.length > 0 ? (
          blocks.map((block) => {
            const automationPoints = block.opacityAutomationPoints ?? [];
            const keyframePercents = block.keyframePercents ?? [];

            return (
              <div
                key={block.id}
                className={`absolute overflow-hidden rounded-md border text-left transition-colors ${
                  block.selected
                    ? 'border-blue-300 bg-blue-500/20 shadow-[0_0_0_1px_rgba(96,165,250,0.4)]'
                    : block.muted
                      ? 'border-gray-700/60 bg-gray-700/35 text-gray-300'
                      : 'border-blue-500/20 bg-gradient-to-br from-blue-500/18 to-cyan-500/12 text-gray-100 hover:border-blue-300/60'
                }`}
                onPointerDown={(event) => {
                  if (!isPrimaryTimelinePointerButton(event.button)) {
                    return;
                  }

                  onSelect(block.id);

                  const target = event.target as HTMLElement;
                  const laneRect = (event.currentTarget.parentElement as HTMLElement | null)?.getBoundingClientRect();

                  if (!laneRect) {
                    return;
                  }

                  const ratio = (event.clientX - laneRect.left) / laneRect.width;
                  const rawPointerSeconds = Math.max(0, Math.min(timelineSeconds, ratio * timelineSeconds));
                  const pointerSeconds = snapLaneSeconds(rawPointerSeconds, event.shiftKey);
                  if (toolMode !== 'cut') {
                    onSetPlayhead(pointerSeconds);
                  }

                  if (
                    target.closest('[data-automation-surface="true"]') ||
                    target.closest('[data-automation-point="true"]')
                  ) {
                    return;
                  }

                  if (toolMode === 'cut' && onCutBlock) {
                    event.preventDefault();
                    event.stopPropagation();
                    onCutBlock(block.id, playheadSeconds, event.shiftKey);
                    return;
                  }

                  if (toolMode === 'hand') {
                    onStartHandPan(event);
                    return;
                  }

                  if (toolMode === 'slip' && onSlipBlock) {
                    event.preventDefault();
                    event.stopPropagation();

                    let lastClientX = event.clientX;

                    const onPointerMove = (moveEvent: PointerEvent) => {
                      const deltaSeconds = ((moveEvent.clientX - lastClientX) / laneRect.width) * timelineSeconds;
                      lastClientX = moveEvent.clientX;
                      onSlipBlock(block.id, deltaSeconds);
                    };

                    const onPointerUp = () => {
                      window.removeEventListener('pointermove', onPointerMove);
                      window.removeEventListener('pointerup', onPointerUp);
                    };

                    window.addEventListener('pointermove', onPointerMove);
                    window.addEventListener('pointerup', onPointerUp);
                    return;
                  }

                  if (!onMoveBlock) {
                    return;
                  }

                  event.preventDefault();
                  event.stopPropagation();

                  const startClientX = event.clientX;
                  const startSeconds = block.startSeconds;

                  const onPointerMove = (moveEvent: PointerEvent) => {
                    const deltaSeconds = ((moveEvent.clientX - startClientX) / laneRect.width) * timelineSeconds;
                    onMoveBlock(block.id, Math.max(0, startSeconds + deltaSeconds), moveEvent.shiftKey);
                  };

                  const onPointerUp = () => {
                    window.removeEventListener('pointermove', onPointerMove);
                    window.removeEventListener('pointerup', onPointerUp);
                  };

                  window.addEventListener('pointermove', onPointerMove);
                  window.addEventListener('pointerup', onPointerUp);
                }}
                onClick={() => onSelect(block.id)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onSelect(block.id);
                  onOpenContextMenu(block.id, event);
                }}
                style={{
                  left: `${(block.startSeconds / timelineSeconds) * 100}%`,
                  width: `max(${(block.durationSeconds / timelineSeconds) * 100}%, 5rem)`,
                  top: laneInset,
                  height: Math.max(28, laneHeight - laneInset * 2),
                }}
              >
                {previewById?.[block.id] ? (
                  <TimelineClipPreviewBackdrop preview={previewById[block.id]} />
                ) : null}

                {block.trimClip && onTrimBlockEdge ? (
                  <>
                    <button
                      aria-label={`Trim start of ${block.label}`}
                      className="absolute bottom-1 top-1 left-0 z-30 w-2 cursor-ew-resize rounded-l bg-white/0 transition-colors hover:bg-cyan-200/45"
                      onPointerDown={(event) => startEdgeTrim(event, block, 'start')}
                      title="Drag to trim or extend clip start. Alt-drag to RIPPLE (later clips follow). Shift for 1s intervals."
                      type="button"
                    />
                    <button
                      aria-label={`Trim end of ${block.label}`}
                      className="absolute bottom-1 top-1 right-0 z-30 w-2 cursor-ew-resize rounded-r bg-white/0 transition-colors hover:bg-cyan-200/45"
                      onPointerDown={(event) => startEdgeTrim(event, block, 'end')}
                      title="Drag to trim or extend clip end. Alt-drag to RIPPLE (later clips follow). Shift for 1s intervals."
                      type="button"
                    />
                  </>
                ) : null}

                {waveformById?.[block.id]?.length ? (
                  <div className="absolute inset-x-2 inset-y-2 z-0">
                    <TimelineWaveform
                      muted={Boolean(block.muted)}
                      peaks={waveformById[block.id]}
                      selected={block.selected}
                    />
                  </div>
                ) : null}

                {automationPoints.length > 0 ? (
                  <div
                    className="pointer-events-none absolute inset-x-2 overflow-visible"
                    style={{ top: Math.max(5, laneInset), height: automationHeight }}
                  >
                    <svg className="h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
                      <polyline
                        fill="none"
                        points={automationPoints.map((point) => `${point.timePercent},${100 - point.valuePercent}`).join(' ')}
                        stroke={block.selected ? 'rgba(165, 243, 252, 0.95)' : 'rgba(125, 211, 252, 0.75)'}
                        strokeWidth="2.5"
                        vectorEffect="non-scaling-stroke"
                      />
                    </svg>
                  </div>
                ) : null}

                {keyframePercents.length > 0 ? (
                  <div className="pointer-events-none absolute inset-x-2 top-2 z-20">
                    {keyframePercents.map((timePercent) => (
                      <span
                        className={`absolute h-2.5 w-2.5 -translate-x-1/2 rotate-45 border ${
                          block.selected
                            ? 'border-cyan-100 bg-cyan-300'
                            : 'border-cyan-200/50 bg-cyan-400/35'
                        }`}
                        key={`${block.id}-keyframe-${timePercent}`}
                        style={{ left: `${timePercent}%` }}
                        title={`Keyframe ${timePercent.toFixed(1)}%`}
                      />
                    ))}
                  </div>
                ) : null}

                {block.selected && automationPoints.length > 0 && onUpdateAutomationPoint ? (
                  <div
                    className="absolute inset-x-2 z-10 cursor-crosshair rounded-md border border-cyan-200/0 bg-cyan-200/0 transition-colors hover:border-cyan-200/20 hover:bg-cyan-200/5"
                    data-automation-surface="true"
                    title={`Double-click to add a ${automationLabel?.toLowerCase() ?? 'automation'} point, then drag points to shape fades.`}
                    style={{ top: Math.max(5, laneInset), height: automationHeight }}
                    onDoubleClick={(event) => {
                      if (!onAddAutomationPoint) {
                        return;
                      }

                      const target = event.target as HTMLElement;
                      if (target.closest('[data-automation-point="true"]')) {
                        return;
                      }

                      event.preventDefault();
                      event.stopPropagation();
                      const bounds = event.currentTarget.getBoundingClientRect();
                      onAddAutomationPoint(block.id, buildTimelineOpacityPoint(bounds, event.clientX, event.clientY));
                    }}
                  >
                    {automationLabel ? (
                      <div className="pointer-events-none absolute right-0 top-0 text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-100/80">
                        {automationLabel}
                      </div>
                    ) : null}
                    {automationPoints.map((point, index) => (
                      <button
                        key={`${block.id}-automation-${index}`}
                        className={`absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border shadow active:cursor-grabbing ${
                          index === 0 || index === automationPoints.length - 1
                            ? 'border-white/80 bg-cyan-200'
                            : 'border-white/80 bg-blue-300'
                        }`}
                        data-automation-point="true"
                        onDoubleClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();

                          if (!onRemoveAutomationPoint || index === 0 || index === automationPoints.length - 1) {
                            return;
                          }

                          onRemoveAutomationPoint(block.id, index);
                        }}
                        onPointerDown={(event) => {
                          if (!isPrimaryTimelinePointerButton(event.button)) {
                            return;
                          }

                          event.preventDefault();
                          event.stopPropagation();
                          onSelect(block.id);

                          const bounds = event.currentTarget.parentElement?.getBoundingClientRect();
                          const handle = event.currentTarget;

                          if (!bounds) {
                            return;
                          }

                          try {
                            handle.setPointerCapture(event.pointerId);
                          } catch {
                            // Pointer capture is a usability enhancement; window listeners still keep the drag working.
                          }

                          const onPointerMove = (moveEvent: PointerEvent) => {
                            const nextPoint = buildTimelineOpacityPoint(bounds, moveEvent.clientX, moveEvent.clientY);
                            onUpdateAutomationPoint(block.id, index, {
                              timePercent:
                                index === 0
                                  ? 0
                                  : index === automationPoints.length - 1
                                    ? 100
                                    : nextPoint.timePercent,
                              valuePercent: nextPoint.valuePercent,
                            });
                          };

                          const onPointerUp = () => {
                            try {
                              handle.releasePointerCapture(event.pointerId);
                            } catch {
                              // Ignore browsers that already released pointer capture.
                            }
                            window.removeEventListener('pointermove', onPointerMove);
                            window.removeEventListener('pointerup', onPointerUp);
                          };

                          window.addEventListener('pointermove', onPointerMove);
                          window.addEventListener('pointerup', onPointerUp);
                        }}
                        style={{
                          left: `${point.timePercent}%`,
                          top: `${100 - point.valuePercent}%`,
                        }}
                        title={`${Math.round(point.valuePercent)}%`}
                        type="button"
                      />
                    ))}
                  </div>
                ) : null}

                <div className="absolute inset-x-2 bottom-1.5 z-20 rounded bg-[#09101a]/55 px-1.5 py-1 backdrop-blur-[1px]">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold">
                    {getSourceItemIcon(block.kind)}
                    <span className="truncate">{block.label}</span>
                  </div>
                  <div className="mt-0.5 truncate text-[10px] text-gray-300">{block.secondaryLabel}</div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="flex h-full items-center px-4 text-sm text-gray-500">{emptyMessage}</div>
        )}
      </div>
      {onResizeLane && !collapsed ? (
        <button
          aria-label={`Resize ${trackLabel} track height`}
          className="absolute -bottom-1 left-0 right-0 z-30 h-2 cursor-row-resize rounded-full bg-transparent transition-colors hover:bg-blue-400/35 focus-visible:bg-blue-400/45 focus-visible:outline-none"
          onPointerDown={onResizeLane}
          title={`Drag to vertically resize ${trackLabel}`}
          type="button"
        />
      ) : null}
    </div>
  );
}

function TimelineClipPreviewBackdrop({ preview }: { preview: TimelineClipEdgePreview }) {
  return (
    <div className="absolute inset-0 z-0">
      {preview.start ? (
        <div className="absolute inset-y-0 left-0 w-[24%] overflow-hidden border-r border-black/30">
          <img alt="" className="h-full w-full object-cover opacity-85" src={preview.start} />
        </div>
      ) : null}
      {preview.end ? (
        <div className="absolute inset-y-0 right-0 w-[24%] overflow-hidden border-l border-black/30">
          <img alt="" className="h-full w-full object-cover opacity-85" src={preview.end} />
        </div>
      ) : null}
      <div className="absolute inset-0 bg-gradient-to-r from-[#08111d]/45 via-[#0c1522]/25 to-[#08111d]/45" />
    </div>
  );
}

function TimelineWaveform({
  peaks,
  selected,
  muted,
}: {
  peaks: number[];
  selected: boolean;
  muted: boolean;
}) {
  return (
    <div className="flex h-full items-center gap-px">
      {peaks.map((peak, index) => (
        <div
          key={`${index}-${peak}`}
          className={`flex-1 rounded-full ${
            muted
              ? 'bg-gray-400/30'
              : selected
                ? 'bg-cyan-100/80'
                : 'bg-cyan-200/55'
          }`}
          style={{ height: `${Math.max(8, peak * 100)}%` }}
        />
      ))}
    </div>
  );
}

function TextEditDialog({
  title,
  draft,
  onChange,
  onSave,
  onCancel,
}: {
  title: string;
  draft: TextEditDraft;
  onChange: (patch: Partial<TextEditDraft>) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <DockableDialog
      defaultFloatingRect={{ x: 180, y: 96, width: 680, height: 620 }}
      dialogId="video-text-edit"
      minSize={{ width: 420, height: 360 }}
      onClose={onCancel}
      open
      title="Text Tool"
      workspaceId={VIDEO_WORKSPACE_ID}
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#141821]">
        <div className="border-b border-gray-700/60 px-5 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-200/80">
            Text Tool
          </div>
          <div className="mt-1 text-lg font-semibold text-white">{title}</div>
        </div>
        <div className="max-h-[58vh] space-y-4 overflow-y-auto px-5 py-5">
          <label className="block space-y-2 text-xs text-gray-400">
            <span>Text</span>
            <textarea
              className="min-h-36 w-full rounded-xl border border-gray-700/60 bg-[#0f131b] px-3 py-2 text-sm text-gray-100 outline-none"
              onChange={(event) => onChange({ text: event.target.value })}
              value={draft.text}
            />
          </label>
          <label className="block space-y-2 text-xs text-gray-400">
            <span>Font family</span>
            <input
              className="w-full rounded-xl border border-gray-700/60 bg-[#0f131b] px-3 py-2 text-sm text-gray-100 outline-none"
              onChange={(event) => onChange({ fontFamily: event.target.value })}
              type="text"
              value={draft.fontFamily}
            />
          </label>
          <div className="grid gap-3 md:grid-cols-2">
            <NumberField
              label="Initial font size"
              max={320}
              min={8}
              onChange={(value) => onChange({ fontSizePx: Math.max(8, Math.round(value)) })}
              step={1}
              value={draft.fontSizePx}
            />
            <label className="block space-y-2 text-xs text-gray-400">
              <span>Color</span>
              <AdvancedColorPicker
                className="h-11 w-full"
                buttonClassName="rounded-xl border border-gray-700/60 bg-[#0f131b]"
                label="Editor asset text color"
                onChange={(color) => onChange({ color })}
                value={draft.color}
              />
            </label>
          </div>
          <label className="block space-y-2 text-xs text-gray-400">
            <span>Text effect</span>
            <select
              className="w-full rounded-xl border border-gray-700/60 bg-[#0f131b] px-3 py-2 text-sm text-gray-100 outline-none"
              onChange={(event) => onChange({ textEffect: event.target.value as TextClipEffect })}
              value={draft.textEffect}
            >
              <option value="none">None</option>
              <option value="shadow">Shadow</option>
              <option value="glow">Glow</option>
              <option value="outline">Outline</option>
            </select>
          </label>
          <div className="rounded-xl border border-gray-700/60 bg-[#0f131b] p-5">
            <div
              className="whitespace-pre-wrap break-words text-center font-semibold leading-tight"
              style={{
                color: draft.color,
                fontFamily: draft.fontFamily,
                fontSize: `${Math.max(8, Math.min(96, draft.fontSizePx))}px`,
                ...getTextPreviewEffectStyle(draft.textEffect),
              }}
            >
              {draft.text || 'Text'}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-700/60 bg-[#111217]/45 px-5 py-4">
          <button
            className="rounded-lg border border-gray-700/60 bg-[#111217]/60 px-3 py-2 text-xs font-semibold text-gray-200 transition-colors hover:border-gray-500 hover:text-white"
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
          <button
            className="rounded-lg bg-cyan-200 px-3 py-2 text-xs font-semibold text-slate-950 transition-colors hover:bg-cyan-100"
            onClick={onSave}
            type="button"
          >
            Save Text
          </button>
        </div>
      </div>
    </DockableDialog>
  );
}

function MonitorSurface({
  item,
  mediaInfo,
  variant,
  videoRef,
}: {
  item: SourceBinItem;
  mediaInfo?: SourceMediaInfo;
  variant: 'source' | 'mini';
  videoRef?: React.RefObject<HTMLVideoElement | null>;
}) {
  const previewClassName = variant === 'source' ? 'absolute inset-0 h-full w-full object-contain' : 'aspect-video h-16 w-24 object-cover';
  const aspectRatioValue = resolveSourceAspectRatio(item, mediaInfo);
  const previewSupportLabel = getBrowserPreviewSupportLabel(item.label, item.mimeType);

  if (item.kind === 'image') {
    return variant === 'source'
      ? (
          <MonitorStageFrame aspectRatioValue={aspectRatioValue}>
            <img alt={item.label} className={previewClassName} src={item.assetUrl} />
          </MonitorStageFrame>
        )
      : <img alt={item.label} className={previewClassName} src={item.assetUrl} />;
  }

  if (item.kind === 'video' || item.kind === 'composition') {
    return variant === 'source'
      ? (
          <MonitorStageFrame aspectRatioValue={aspectRatioValue}>
            <video className={previewClassName} controls ref={videoRef} src={item.assetUrl} />
            {previewSupportLabel?.startsWith('Imported') ? <UnsupportedPreviewBadge label={previewSupportLabel} /> : null}
          </MonitorStageFrame>
        )
      : <video className={previewClassName} muted src={item.assetUrl} />;
  }

  if (item.kind === 'audio') {
    return variant === 'source' ? (
      <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-4 rounded-xl border border-gray-700/60 bg-[#0f131b] p-6">
        <div className="rounded-full border border-gray-700/60 bg-[#161c26] p-4 text-cyan-200">
          <Music2 size={28} />
        </div>
        {item.assetUrl ? <audio className="w-full" controls src={item.assetUrl} /> : null}
        {previewSupportLabel?.startsWith('Imported') ? <div className="text-xs text-amber-100/80">{previewSupportLabel}</div> : null}
      </div>
    ) : (
      <div className="flex h-16 w-24 items-center justify-center bg-[#0f131b] text-cyan-200">
        <Music2 size={18} />
      </div>
    );
  }

  return variant === 'source' ? (
    <div className="flex h-full min-h-[220px] items-center justify-center rounded-xl border border-gray-700/60 bg-[#0f131b] p-6">
      <div className="max-w-sm text-center text-white">
        <div className="mb-3 inline-flex rounded-full border border-gray-700/60 bg-[#161c26] p-3 text-cyan-200">
          <Type size={24} />
        </div>
        <div className="text-base font-medium leading-7">{item.text}</div>
      </div>
    </div>
  ) : (
    <div className="flex h-16 w-24 items-center justify-center bg-[#0f131b] text-cyan-200">
      <Type size={18} />
    </div>
  );
}

function UnsupportedPreviewBadge({ label }: { label: string }) {
  return (
    <div className="absolute bottom-3 left-3 right-3 rounded-lg border border-amber-300/25 bg-amber-950/80 px-3 py-2 text-xs text-amber-50 shadow-xl">
      {label}
    </div>
  );
}

function MiniPreview({ item }: { item: SourceBinItem }) {
  return <MonitorSurface item={item} variant="mini" />;
}

function VideoExportReadinessPill({ summary }: { summary: VideoExportReadinessSummary }) {
  return (
    <div
      className={`rounded-full border px-3 py-1 text-[11px] ${videoExportReadinessToneClass(summary.tone)}`}
      data-video-export-readiness="true"
      data-video-export-readiness-tone={summary.tone}
      title={summary.detail}
    >
      <span className="opacity-75">Export</span> <span className="font-semibold">{summary.label}</span>
    </div>
  );
}

function VideoRenderBackendPill({ summary }: { summary: VideoRenderBackendSummary }) {
  return (
    <div
      className={`rounded-full border px-3 py-1 text-[11px] ${videoRenderBackendToneClass(summary.tone)}`}
      data-video-render-backend="true"
      data-video-render-backend-tone={summary.tone}
      title={summary.detail}
    >
      <span className="opacity-75">Backend</span> <span className="font-semibold">{summary.label}</span>
    </div>
  );
}

function videoRenderBackendToneClass(tone: VideoRenderBackendTone): string {
  if (tone === 'gpu') return 'border-lime-300/25 bg-lime-500/10 text-lime-100';
  if (tone === 'native') return 'border-sky-300/25 bg-sky-500/10 text-sky-100';
  return 'border-gray-500/40 bg-gray-800/70 text-gray-200';
}

function videoExportReadinessToneClass(tone: VideoExportReadinessTone): string {
  if (tone === 'error') return 'border-rose-300/35 bg-rose-500/15 text-rose-100';
  if (tone === 'warning') return 'border-amber-300/35 bg-amber-500/15 text-amber-100';
  if (tone === 'info') return 'border-cyan-300/25 bg-cyan-500/10 text-cyan-100';
  return 'border-emerald-300/25 bg-emerald-500/10 text-emerald-100';
}

function ToolToggleButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
        active
          ? 'border-blue-400/40 bg-blue-500/15 text-blue-100'
          : 'border-gray-700/60 bg-[#111217]/50 text-gray-300 hover:border-gray-500 hover:text-white'
      }`}
      onClick={onClick}
      type="button"
    >
      {icon}
      {label}
    </button>
  );
}

function MonitorStageFrame({
  aspectRatioValue,
  children,
}: {
  aspectRatioValue: number;
  children: ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [stageSize, setStageSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const update = () => {
      const availableWidth = Math.max(0, container.clientWidth - 12);
      const availableHeight = Math.max(0, container.clientHeight - 12);

      if (availableWidth === 0 || availableHeight === 0) {
        return;
      }

      let width = availableWidth;
      let height = width / aspectRatioValue;

      if (height > availableHeight) {
        height = availableHeight;
        width = height * aspectRatioValue;
      }

      setStageSize((current) => {
        const next = {
          width: Math.round(width),
          height: Math.round(height),
        };

        return current.width === next.width && current.height === next.height ? current : next;
      });
    };

    update();

    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, [aspectRatioValue]);

  return (
    <div
      className="flex h-full w-full min-h-0 items-center justify-center overflow-hidden rounded-lg border border-gray-700/60 bg-black p-1.5 shadow-inner"
      ref={containerRef}
    >
      <div
        className="relative shrink-0 overflow-hidden rounded-lg bg-black"
        style={{
          width: stageSize.width > 0 ? `${stageSize.width}px` : '100%',
          height: stageSize.height > 0 ? `${stageSize.height}px` : 'auto',
          aspectRatio: stageSize.width > 0 && stageSize.height > 0 ? undefined : `${aspectRatioValue}`,
          maxWidth: '100%',
          maxHeight: '100%',
        }}
      >
        {children}
      </div>
    </div>
  );
}

function ResizeHandle({
  onPointerDown,
  orientation = 'vertical',
}: {
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  orientation?: 'vertical' | 'horizontal';
}) {
  return (
    <div
      className={
        orientation === 'horizontal'
          ? 'group relative hidden h-2 w-full shrink-0 cursor-row-resize md:block'
          : 'group relative hidden w-2 shrink-0 cursor-col-resize md:block'
      }
      onPointerDown={onPointerDown}
      role="separator"
    >
      {orientation === 'horizontal' ? (
        <>
          <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-gray-700/70 transition-colors group-hover:bg-blue-400/80" />
          <div className="absolute inset-x-1 bottom-0 top-0 rounded-full border border-transparent bg-transparent group-hover:border-blue-400/30 group-hover:bg-blue-500/10" />
        </>
      ) : (
        <>
          <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-gray-700/70 transition-colors group-hover:bg-blue-400/80" />
          <div className="absolute inset-y-1 left-0 right-0 rounded-full border border-transparent bg-transparent group-hover:border-blue-400/30 group-hover:bg-blue-500/10" />
        </>
      )}
    </div>
  );
}

function VisualKeyframeInspector({
  clip,
  durationSeconds,
  timelineCursorSeconds,
  onAddOrUpdateKeyframe,
  onJumpKeyframe,
  onUpdateKeyframe,
  onRemoveKeyframe,
}: {
  clip: EditorVisualClip;
  durationSeconds: number;
  timelineCursorSeconds: number;
  onAddOrUpdateKeyframe: () => void;
  onJumpKeyframe: (direction: 'previous' | 'next') => void;
  onUpdateKeyframe: (keyframeIndex: number, patch: Parameters<typeof updateVisualKeyframe>[2]) => void;
  onRemoveKeyframe: (keyframeIndex: number) => void;
}) {
  const keyframes = normalizeVisualKeyframes(clip);
  const currentPercent = getVisualClipProgressPercent(clip, durationSeconds, timelineCursorSeconds);

  return (
    <div className="space-y-3 rounded-xl border border-cyan-500/20 bg-[#111217]/35 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Keyframes</div>
          <div className="mt-1 text-[11px] text-gray-500">Playhead {currentPercent.toFixed(1)}%</div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            className={miniTrackButtonClassName}
            onClick={() => onJumpKeyframe('previous')}
            title="Previous keyframe"
            type="button"
          >
            <ChevronLeft size={12} />
          </button>
          <button
            className="inline-flex items-center gap-1.5 rounded-md border border-cyan-400/30 bg-cyan-500/10 px-2 py-1 text-[10px] font-semibold text-cyan-100 transition-colors hover:border-cyan-200/70 hover:text-white"
            onClick={onAddOrUpdateKeyframe}
            title="Add or update keyframe"
            type="button"
          >
            <Diamond size={11} />
            Add
          </button>
          <button
            className={miniTrackButtonClassName}
            onClick={() => onJumpKeyframe('next')}
            title="Next keyframe"
            type="button"
          >
            <ChevronRight size={12} />
          </button>
        </div>
      </div>
      <div className="space-y-2">
        {keyframes.map((keyframe, index) => {
          const isEndpoint = index === 0 || index === keyframes.length - 1;
          const isCurrent = Math.abs(keyframe.timePercent - currentPercent) < 0.25;

          return (
            <div
              className={`space-y-3 rounded-lg border p-2 ${
                isCurrent
                  ? 'border-cyan-200/70 bg-cyan-400/10'
                  : 'border-gray-700/60 bg-[#0f131b]'
              }`}
              key={`${clip.id}-visual-keyframe-${keyframe.timePercent}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-gray-200">
                  <span className="h-2.5 w-2.5 rotate-45 border border-cyan-100 bg-cyan-300" />
                  {isEndpoint ? (index === 0 ? 'Start' : 'End') : `${keyframe.timePercent.toFixed(1)}%`}
                </div>
                {!isEndpoint ? (
                  <button
                    className="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-[10px] font-semibold text-red-100 transition-colors hover:border-red-400/60"
                    onClick={() => onRemoveKeyframe(index)}
                    type="button"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <NumberField
                  label="Position X"
                  max={2000}
                  min={-2000}
                  onChange={(value) => onUpdateKeyframe(index, { positionX: Math.round(value) })}
                  step={1}
                  value={keyframe.positionX}
                />
                <NumberField
                  label="Position Y"
                  max={2000}
                  min={-2000}
                  onChange={(value) => onUpdateKeyframe(index, { positionY: Math.round(value) })}
                  step={1}
                  value={keyframe.positionY}
                />
                <NumberField
                  label="Scale"
                  max={500}
                  min={10}
                  onChange={(value) => onUpdateKeyframe(index, { scalePercent: Math.max(10, Math.round(value)) })}
                  step={1}
                  value={keyframe.scalePercent}
                />
                <NumberField
                  label="Rotation"
                  max={720}
                  min={-720}
                  onChange={(value) => onUpdateKeyframe(index, { rotationDeg: Math.round(value) })}
                  step={1}
                  value={keyframe.rotationDeg}
                />
              </div>
              <RangeControl
                label="Opacity"
                max={100}
                min={0}
                onChange={(value) => onUpdateKeyframe(index, { opacityPercent: Math.round(value) })}
                value={keyframe.opacityPercent}
                valueLabel={`${Math.round(keyframe.opacityPercent)}%`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AudioKeyframeInspector({
  clip,
  durationSeconds,
  timelineCursorSeconds,
  onAddOrUpdateKeyframe,
  onJumpKeyframe,
  onUpdateKeyframe,
  onRemoveKeyframe,
}: {
  clip: EditorAudioClip;
  durationSeconds: number;
  timelineCursorSeconds: number;
  onAddOrUpdateKeyframe: () => void;
  onJumpKeyframe: (direction: 'previous' | 'next') => void;
  onUpdateKeyframe: (keyframeIndex: number, patch: Parameters<typeof updateAudioKeyframe>[2]) => void;
  onRemoveKeyframe: (keyframeIndex: number) => void;
}) {
  const keyframes = normalizeAudioKeyframes(clip);
  const currentPercent = getAudioClipProgressPercent(clip, durationSeconds, timelineCursorSeconds);

  return (
    <div className="space-y-3 rounded-xl border border-cyan-500/20 bg-[#111217]/35 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Volume Keyframes</div>
          <div className="mt-1 text-[11px] text-gray-500">Playhead {currentPercent.toFixed(1)}%</div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            className={miniTrackButtonClassName}
            onClick={() => onJumpKeyframe('previous')}
            title="Previous keyframe"
            type="button"
          >
            <ChevronLeft size={12} />
          </button>
          <button
            className="inline-flex items-center gap-1.5 rounded-md border border-cyan-400/30 bg-cyan-500/10 px-2 py-1 text-[10px] font-semibold text-cyan-100 transition-colors hover:border-cyan-200/70 hover:text-white"
            onClick={onAddOrUpdateKeyframe}
            title="Add or update keyframe"
            type="button"
          >
            <Diamond size={11} />
            Add
          </button>
          <button
            className={miniTrackButtonClassName}
            onClick={() => onJumpKeyframe('next')}
            title="Next keyframe"
            type="button"
          >
            <ChevronRight size={12} />
          </button>
        </div>
      </div>
      <div className="space-y-2">
        {keyframes.map((keyframe, index) => {
          const isEndpoint = index === 0 || index === keyframes.length - 1;
          const isCurrent = Math.abs(keyframe.timePercent - currentPercent) < 0.25;

          return (
            <div
              className={`space-y-3 rounded-lg border p-2 ${
                isCurrent
                  ? 'border-cyan-200/70 bg-cyan-400/10'
                  : 'border-gray-700/60 bg-[#0f131b]'
              }`}
              key={`${clip.id}-audio-keyframe-${keyframe.timePercent}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-gray-200">
                  <span className="h-2.5 w-2.5 rotate-45 border border-cyan-100 bg-cyan-300" />
                  {isEndpoint ? (index === 0 ? 'Start' : 'End') : `${keyframe.timePercent.toFixed(1)}%`}
                </div>
                {!isEndpoint ? (
                  <button
                    className="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-[10px] font-semibold text-red-100 transition-colors hover:border-red-400/60"
                    onClick={() => onRemoveKeyframe(index)}
                    type="button"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
              <RangeControl
                label="Volume"
                max={150}
                min={0}
                onChange={(value) => onUpdateKeyframe(index, { volumePercent: Math.round(value) })}
                value={keyframe.volumePercent}
                valueLabel={`${Math.round(keyframe.volumePercent)}%`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InspectorHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.22em] text-blue-200/80">{eyebrow}</div>
      <div className="mt-2 text-lg font-semibold text-white">{title}</div>
    </div>
  );
}

function InfoStack({ rows }: { rows: Array<[string, string]> }) {
  return (
    <div className="space-y-2 rounded-xl border border-gray-700/60 bg-[#111217]/40 p-3">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-center justify-between gap-3 text-sm">
          <span className="text-gray-400">{label}</span>
          <span className="text-right font-medium text-gray-100">{value}</span>
        </div>
      ))}
    </div>
  );
}

function VisualClipPropertyCopyDialog({
  sourceLabel,
  selectedProperties,
  onToggleProperty,
  onCopy,
  onCancel,
}: {
  sourceLabel: string;
  selectedProperties: VisualClipCopiedProperty[];
  onToggleProperty: (property: VisualClipCopiedProperty) => void;
  onCopy: () => void;
  onCancel: () => void;
}) {
  const selectedCount = selectedProperties.length;

  return (
    <DockableDialog
      defaultFloatingRect={{ x: 220, y: 112, width: 560, height: 520 }}
      dialogId="video-visual-copy-properties"
      minSize={{ width: 380, height: 320 }}
      onClose={onCancel}
      open
      title="Clip Property Clipboard"
      workspaceId={VIDEO_WORKSPACE_ID}
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#141821]">
        <div className="border-b border-gray-700/60 px-5 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-200/80">
            Clip Property Clipboard
          </div>
          <div className="mt-1 text-lg font-semibold text-white">Copy Selected Properties</div>
          <div className="mt-1 text-sm text-gray-400">
            Choose which transform properties to copy from <span className="text-gray-100">{sourceLabel}</span>.
          </div>
        </div>
        <div className="space-y-3 px-5 py-5">
          {VISUAL_CLIP_PROPERTY_OPTIONS.map((option) => {
            const checked = selectedProperties.includes(option.key);

            return (
              <label
                key={option.key}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 transition-colors ${
                  checked
                    ? 'border-cyan-300/50 bg-cyan-500/12'
                    : 'border-gray-700/60 bg-[#111217]/45 hover:border-gray-500'
                }`}
              >
                <input
                  checked={checked}
                  className="mt-1"
                  onChange={() => onToggleProperty(option.key)}
                  type="checkbox"
                />
                <span>
                  <span className="block text-sm font-semibold text-gray-100">{option.label}</span>
                  <span className="mt-1 block text-xs text-gray-400">{option.description}</span>
                </span>
              </label>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-700/60 bg-[#111217]/45 px-5 py-4">
          <div className="text-xs text-gray-400">
            {selectedCount} propert{selectedCount === 1 ? 'y' : 'ies'} selected.
          </div>
          <div className="flex gap-2">
            <button
              className="rounded-lg border border-gray-700/60 bg-[#111217]/60 px-3 py-2 text-xs font-semibold text-gray-200 transition-colors hover:border-gray-500 hover:text-white"
              onClick={onCancel}
              type="button"
            >
              Cancel
            </button>
            <button
              className="rounded-lg bg-cyan-200 px-3 py-2 text-xs font-semibold text-slate-950 transition-colors hover:bg-cyan-100 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-400"
              disabled={selectedCount === 0}
              onClick={onCopy}
              type="button"
            >
              Copy Properties
            </button>
          </div>
        </div>
      </div>
    </DockableDialog>
  );
}

function EditorHelpModal({ onClose }: { onClose: () => void }) {
  return (
    <DockableDialog
      defaultFloatingRect={{ x: 160, y: 92, width: 760, height: 600 }}
      dialogId="video-help"
      minSize={{ width: 420, height: 320 }}
      onClose={onClose}
      open
      title="Editor Hotkeys and Usage"
      workspaceId={VIDEO_WORKSPACE_ID}
    >
      <div className="h-full min-h-0 overflow-y-auto bg-[#141821]">
        <div className="sticky top-0 flex items-center justify-between border-b border-gray-700/60 bg-[#141821] px-5 py-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-200/80">Help</div>
            <div className="mt-1 text-lg font-semibold text-white">Editor Hotkeys and Usage</div>
          </div>
          <button
            className="rounded-lg border border-gray-700/60 bg-[#111217]/60 px-3 py-2 text-xs font-semibold text-gray-200 transition-colors hover:border-gray-500 hover:text-white"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>
        <div className="space-y-6 px-5 py-5 text-sm text-gray-300">
          <section>
            <div className="mb-2 text-sm font-semibold text-white">Hotkeys</div>
            <div className="grid gap-2 md:grid-cols-2">
              {[
                ['Left / Right', 'Scrub the playhead by 0.1s'],
                ['Shift + Left / Right', 'Scrub the playhead by 1.0s'],
                ['Ctrl/Cmd + Z', 'Undo the last editor timeline or program-stage edit'],
                ['Ctrl/Cmd + Shift + Z', 'Redo the last undone editor edit'],
                ['Ctrl + Y', 'Redo the last undone editor edit'],
                ['Space', 'Play / pause the timeline (always resumes forward)'],
                ['J / K / L', 'Shuttle: reverse / stop / forward — tap J or L again for 2x, 4x, 8x'],
                ['Home / End', 'Jump the playhead to the start or end of the sequence'],
                ['I / O', 'Mark in / out on the Source Monitor at its playhead'],
                [', (comma)', 'Insert the marked source range at the playhead on V1 (ripples later clips right)'],
                ['. (period)', 'Overwrite the timeline range at the playhead on V1 with the marked source range'],
                ['Q / W', "Ripple-trim the selected clip's in / out edge to the playhead"],
                ['E', "Roll the nearest cut on the selected clip's lane to the playhead"],
                ['V', 'Select tool'],
                ['C', 'Cut selected visual clip at the playhead, or enter cut mode if no valid clip is selected'],
                ['S', 'Slip tool'],
                ['H', 'Hand pan tool'],
                ['Shift + K', 'Add or update a keyframe on the selected clip at the playhead'],
                ['Shift + M', 'Drop a labeled marker at the playhead (click a flag to jump, Alt-click to remove)'],
                ['[ / ]', 'Jump to the previous or next keyframe on the selected clip'],
                ['Delete / Backspace', 'Remove the selected clip'],
                ['Shift + / or F1', 'Open or close this help panel'],
                ['Esc', 'Close help or context menus'],
              ].map(([shortcut, description]) => (
                <div key={shortcut} className="rounded-xl border border-gray-700/60 bg-[#111217]/45 px-3 py-2">
                  <div className="font-semibold text-gray-100">{shortcut}</div>
                  <div className="mt-1 text-xs text-gray-400">{description}</div>
                </div>
              ))}
            </div>
          </section>
          <section>
            <div className="mb-2 text-sm font-semibold text-white">Program Monitor Tips</div>
            <ul className="space-y-2 text-sm text-gray-300">
              <li>Click a timeline clip to select its layer in the program monitor.</li>
              <li>Drag the clip body or the center handle to reposition it on the canvas.</li>
              <li>Use the on-canvas toolbar for fit mode, centering, scale, rotation, and opacity adjustments.</li>
              <li>`Contain` preserves the whole source, `Cover` crops to fill, and `Stretch` forces the source to the full render canvas.</li>
              <li>Selected visual clips use keyframes for position, scale, rotation, and opacity animation.</li>
              <li>Text clips render as their own invisible text-sized layer; select the clip to show the transform handles.</li>
            </ul>
          </section>
          <section>
            <div className="mb-2 text-sm font-semibold text-white">Timeline Tips</div>
            <ul className="space-y-2 text-sm text-gray-300">
              <li>`Select` moves clips in time.</li>
              <li>`Cut` splits visual clips at the playhead.</li>
              <li>`Slip` shifts the source content inside a timed clip without moving the clip on the timeline.</li>
              <li>`Hand` drags the sequencer viewport when you are zoomed in.</li>
              <li>Use the diamond buttons above the timeline or press `K` to keyframe the selected clip at the playhead.</li>
              <li>Volume and opacity lines follow clip keyframes, and keyframe markers are shown inside timeline clips.</li>
              <li>Hold `Shift` while scrubbing, cutting, snapping, or dragging trim edges to use whole-second steps.</li>
              <li>Hold `Alt` while dragging a clip edge to RIPPLE the trim — later clips on the lane follow, keeping every cut tight.</li>
            </ul>
          </section>
        </div>
      </div>
    </DockableDialog>
  );
}

function RangeControl({
  label,
  min,
  max,
  step,
  value,
  valueLabel,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  valueLabel: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block space-y-2 text-xs text-gray-400">
      <div className="flex items-center justify-between gap-3">
        <span>{label}</span>
        <span className="font-medium text-gray-200">{valueLabel}</span>
      </div>
      <input
        className="w-full"
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        step={step}
        type="range"
        value={value}
      />
    </label>
  );
}

function NumberField({
  label,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  min?: number;
  max?: number;
  step?: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block space-y-2 text-xs text-gray-400">
      <span>{label}</span>
      <input
        className="w-full rounded-xl border border-gray-700/60 bg-[#0f131b] px-3 py-2 text-sm text-gray-100 outline-none"
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        step={step}
        type="number"
        value={Number.isFinite(value) ? value : 0}
      />
    </label>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-700/60 bg-[#111217]/35 p-4">
      <div className="text-sm font-medium text-gray-100">{title}</div>
      <div className="mt-2 text-[13px] leading-6 text-gray-400">{body}</div>
    </div>
  );
}
