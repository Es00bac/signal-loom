import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import {
  Archive,
  Film,
  Image as ImageIcon,
  MousePointer2,
  Music2,
  Play,
  Plus,
  Scissors,
  Square,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Diamond,
  Star,
  Trash2,
  Type,
} from 'lucide-react';
import { useFlowStore } from '../../store/flowStore';
import { useEditorStore } from '../../store/editorStore';
import type { SourceBinItem } from '../../lib/sourceBin';
import { buildDownloadFilename, downloadAsset } from '../../lib/downloadAsset';
import {
  getAutomationValueAtLocalTime,
  normalizeAutomationPoints,
} from '../../lib/clipAutomation';
import {
  buildAudioTimelineBlocks,
  buildVisualTimelineBlocks,
  getTimelineDurationSeconds,
  resolveVisualClipDuration,
} from '../../lib/manualEditorTimeline';
import { resolveVisualClipSourceRangeMs } from '../../lib/editorTimelineSourceRange';
import {
  mergeTimelinePreviewResults,
  pruneTimelinePreviewMap,
  takePendingTimelinePreviewRequests,
} from '../../lib/editorTimelinePreview';
import {
  pruneTimelineWaveformMap,
  takePendingTimelineWaveformRequests,
} from '../../lib/editorTimelineWaveform';
import { buildMediaAssetSignaturePart } from '../../lib/mediaAssetSignature';
import {
  addTimelineSnapPoint,
  normalizeTimelineSnapPoints,
  resolveTimelineSnapSeconds,
} from '../../lib/editorTimelineSnap';
import {
  createEditorAudioClip,
  createEditorVisualClip,
  getEditorAudioTrackVolumes,
  getEditorAudioClips,
  getEditorVisualClips,
} from '../../lib/manualEditorState';
import type {
  AppNode,
  AspectRatio,
  AudioProvider,
  EditorAudioClip,
  EditorAsset,
  EditorAssetKind,
  EditorClipFilter,
  EditorClipFilterKind,
  EditorStageBlendMode,
  EditorStageObject,
  EditorVisualClip,
  NodeData,
  TextClipEffect,
  TimelineAutomationPoint,
  VideoResolution,
} from '../../types/flow';
import { useSourceBinStore } from '../../store/sourceBinStore';
import {
  captureFrameFromVideoElement,
  extractVideoFrameAtTime,
  extractVideoFramesAtTimes,
} from '../../lib/videoFrameExtraction';
import { getAspectRatioValue, getVideoCanvasDimensions } from '../../lib/videoCanvas';
import { DEFAULT_EXECUTION_CONFIG } from '../../lib/providerCatalog';
import { EXPORT_BASENAME } from '../../lib/brand';
import { extractWaveformPeaks } from '../../lib/audioWaveform';
import {
  createEditorHistorySnapshot,
  createEditorHistoryState,
  pushEditorHistoryEntry,
  redoEditorHistory,
  undoEditorHistory,
} from '../../lib/editorHistory';
import {
  buildTimelineOpacityPoint,
  isPrimaryTimelinePointerButton,
  resizeTimelineTrackHeight,
} from '../../lib/editorTimelineInteraction';
import {
  buildEditorSourceItemLookup,
  mapLibraryItemToEditorSourceItem,
} from '../../lib/editorSourceItems';
import {
  getSourceBinPreviewKind,
  sortSourceBinItemsForDisplay,
} from '../../lib/sourceBinLayout';
import {
  buildTimelineClipFrameExportLabel,
  getTimelineClipFrameExportTimeSeconds,
} from '../../lib/timelineClipFrameExport';
import type { TimelineClipFrameEdge } from '../../lib/timelineClipFrameExport';
import { cropImageDataUrl } from '../../lib/localImageEditing';
import { executeNodeRequest } from '../../lib/flowExecution';
import { useSettingsStore } from '../../store/settingsStore';
import {
  getEditorStageObjects,
  getStageObjectBlendModes,
} from '../../lib/editorStageObjects';
import {
  copyVisualClipProperties,
  formatVisualClipPropertyList,
  getDefaultVisualClipPropertySelection,
  pasteVisualClipProperties,
  VISUAL_CLIP_PROPERTY_OPTIONS,
} from '../../lib/editorClipPropertyClipboard';
import type {
  VisualClipCopiedProperty,
  VisualClipPropertyClipboard,
} from '../../lib/editorClipPropertyClipboard';
import {
  createEditorAsset,
  getEditorAssets,
  getProjectEditorAssets,
  migrateStageObjectsToEditorAssets,
} from '../../lib/editorAssets';
import { onNativeRendererCommand } from '../../lib/nativeApp';
import { fillTimelineGap, findTimelineGaps } from '../../lib/editorTimelineGaps';
import type { TimelineGap } from '../../lib/editorTimelineGaps';
import {
  getSelectedVisualClipCutTarget,
  splitVisualClipNonDestructively,
  trimVisualClipEdge,
} from '../../lib/editorTimelineTrim';
import type { TimelineClipEdge } from '../../lib/editorTimelineTrim';
import {
  buildClipEffectDescriptorForClip,
  getClipBlendModes,
  normalizeClipCrop,
} from '../../lib/editorClipEffects';
import { measureTextObjectBounds } from '../../lib/editorTextRender';
import { SharedContextMenu } from '../Common/SharedContextMenu';
import { MediaPreviewModal } from '../Nodes/MediaPreviewModal';
import type { SharedContextMenuItem } from '../../lib/sharedContextMenu';
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
} from '../../lib/editorKeyframes';

const panelClassName = 'relative isolate rounded-xl border border-gray-700/60 bg-[#131821] shadow-2xl';
const activeTabClassName = 'rounded-md bg-blue-500/20 px-2 py-1.5 text-[11px] font-semibold text-blue-100';
const inactiveTabClassName = 'rounded-md px-2 py-1.5 text-[11px] font-semibold text-gray-400 transition-colors hover:text-white';
const smallEditorButtonClassName = 'inline-flex items-center gap-1.5 rounded-lg border border-gray-700/60 bg-[#0f131b] px-2.5 py-1.5 text-[11px] font-semibold text-gray-200 transition-colors hover:border-gray-500 hover:text-white';
const miniTrackButtonClassName = 'rounded-md border border-gray-700/60 bg-[#0f131b] px-2 py-1 text-[10px] font-semibold text-gray-300 transition-colors hover:border-gray-500 hover:text-white';
const VISUAL_TRACK_COUNT = 4;
const AUDIO_TRACK_COUNT = 4;
const TIMELINE_PREVIEW_DEBOUNCE_MS = 220;
const TIMELINE_PREVIEW_MAX_CLIPS = 32;
const TIMELINE_PREVIEW_CONCURRENCY = 2;
const TIMELINE_WAVEFORM_CONCURRENCY = 1;
const TIMELINE_PREVIEW_FRAME_OPTIONS = {
  maxWidth: 144,
  maxHeight: 81,
  mimeType: 'image/webp',
  quality: 0.58,
} as const;
const TIMELINE_WAVEFORM_SAMPLE_COUNT = 80;
const TIMELINE_FALLBACK_WAVEFORM_PEAKS = buildTimelineFallbackWaveformPeaks(TIMELINE_WAVEFORM_SAMPLE_COUNT);
const EDITOR_CLIP_FILTER_KINDS: EditorClipFilterKind[] = [
  'brightness',
  'contrast',
  'saturation',
  'blur',
  'grayscale',
];

interface SourceMediaInfo {
  durationSeconds?: number;
  width?: number;
  height?: number;
}

interface ProgramStageClip {
  clip: EditorVisualClip;
  item?: SourceBinItem;
  asset?: EditorAsset;
  durationSeconds: number;
  localTimeSeconds: number;
  sourceTimeSeconds?: number;
  sourceWidth: number;
  sourceHeight: number;
}

type TimelineBlockKind = SourceBinItem['kind'] | 'shape';
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

interface ManualEditorWorkspaceProps {
  getNewFlowNodePosition: () => { x: number; y: number };
}

interface TimelineClipEdgePreview {
  start?: string;
  end?: string;
}

export function ManualEditorWorkspace({ getNewFlowNodePosition }: ManualEditorWorkspaceProps) {
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
  const libraryItems = useSourceBinStore((state) => state.items);
  const importFiles = useSourceBinStore((state) => state.importFiles);
  const addAssetItem = useSourceBinStore((state) => state.addAssetItem);
  const removeSourceBinItem = useSourceBinStore((state) => state.removeItem);
  const toggleSourceBinItemStarred = useSourceBinStore((state) => state.toggleItemStarred);
  const setSourceBinItemCollapsed = useSourceBinStore((state) => state.setItemCollapsed);
  const setAllSourceBinItemsCollapsed = useSourceBinStore((state) => state.setAllItemsCollapsed);
  const importAcceptRef = useRef<HTMLInputElement>(null);
  const sourceMonitorVideoRef = useRef<HTMLVideoElement | null>(null);
  const programMonitorVideoRef = useRef<HTMLVideoElement | null>(null);
  const timelineScrollRef = useRef<HTMLDivElement | null>(null);
  const displayTimelineSecondsRef = useRef(10);
  const cutSelectedVisualClipAtPlayheadRef = useRef<(shiftKey?: boolean) => boolean>(() => false);
  const [programMonitorMode, setProgramMonitorMode] = useState<'stage' | 'rendered'>('stage');
  const [timelineTool, setTimelineTool] = useState<TimelineTool>('select');
  const [timelineZoomPercent, setTimelineZoomPercent] = useState(150);
  const [isHelpOpen, setHelpOpen] = useState(false);
  const [mediaInfoMap, setMediaInfoMap] = useState<Record<string, SourceMediaInfo>>({});
  const [clipEdgePreviewMap, setClipEdgePreviewMap] = useState<Record<string, TimelineClipEdgePreview>>({});
  const [audioWaveformMap, setAudioWaveformMap] = useState<Record<string, number[]>>({});
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
  const orderedLibraryItems = useMemo(
    () => sortSourceBinItemsForDisplay(libraryItems),
    [libraryItems],
  );
  const sourceItems = useMemo(
    () => orderedLibraryItems.map(mapLibraryItemToEditorSourceItem),
    [orderedLibraryItems],
  );
  const mediaSourceItems = useMemo(
    () => sourceItems.filter((item) => item.kind === 'audio' || item.kind === 'video' || item.kind === 'composition'),
    [sourceItems],
  );
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
  const timelineSnapPoints = useMemo(
    () => normalizeTimelineSnapPoints(activeComposition?.data.editorTimelineSnapPoints),
    [activeComposition?.data.editorTimelineSnapPoints],
  );
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
    if (mediaSourceItems.length === 0) {
      if (selectedSourceItemId) {
        setSelectedSourceItemId(undefined);
      }
      return;
    }

    if (!selectedSourceItemId || !mediaSourceItems.some((item) => item.id === selectedSourceItemId)) {
      setSelectedSourceItemId(mediaSourceItems[0].id);
    }
  }, [mediaSourceItems, selectedSourceItemId, setSelectedSourceItemId]);

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
        setTimelineTool('select');
        return;
      }

      if (!isCommandShortcut && shortcutKey === 'c') {
        event.preventDefault();
        if (!cutSelectedVisualClipAtPlayheadRef.current(event.shiftKey)) {
          setTimelineTool('cut');
        }
        return;
      }

      if (!isCommandShortcut && shortcutKey === 's') {
        setTimelineTool('slip');
        return;
      }

      if (!isCommandShortcut && shortcutKey === 'h') {
        setTimelineTool('hand');
        return;
      }

      if (!isCommandShortcut && shortcutKey === 'm') {
        setTimelineTool('snap');
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
          commitActiveCompositionPatch({
            editorVisualClips: visualClips.filter((candidate) => candidate.id !== selectedVisualClipId),
          }, 'Remove visual clip');
          setSelectedVisualClipId(undefined);
          return;
        }

        if (selectedAudioClipId && activeComposition) {
          event.preventDefault();
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
    setSelectedVisualClipId,
    stageObjects,
    selectedVisualClipId,
    undoEditor,
    visualClips,
  ]);

  useEffect(() => {
    let cancelled = false;
    const mediaItems = sourceItems.filter((item) => item.kind !== 'text');

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
  const selectedVisualClip = selectedVisualClipId
    ? visualClips.find((clip) => clip.id === selectedVisualClipId)
    : undefined;
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
  const programCanvas = getVideoCanvasDimensions(compositionAspectRatio, compositionResolution);
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
  };

  const addAudioClip = (item: SourceBinItem, trackIndex = 0) => {
    if (!activeComposition || !canUseSourceItemAsAudio(item)) {
      return;
    }

    const nextClip = createEditorAudioClip(item.nodeId, trackIndex);
    nextClip.offsetMs = getAudioTrackEndMs(audioBlocks, trackIndex);
    commitActiveCompositionPatch({
      editorAudioClips: [...audioClips, nextClip],
    }, 'Add audio clip');
    setSelectedAudioClipId(nextClip.id);
    setSelectedVisualClipId(undefined);
    setSelectedSourceItemId(item.id);
  };

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

  const addEditorAsset = (kind: EditorAssetKind) => {
    if (!activeComposition) {
      return;
    }

    const nextAsset = createEditorAsset(kind);
    commitActiveCompositionPatch({
      editorAssets: [nextAsset, ...compositionEditorAssets],
    }, `Add ${kind} editor asset`);
    setSourceBinTab('editorAssets');

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

  useEffect(() => onNativeRendererCommand((command) => {
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
  }), [
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
    setSelectedVisualClipId,
    stageObjects,
    undoEditor,
    visualClips,
  ]);

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

      if (event.key.toLowerCase() === 'k') {
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
      snapPoints: timelineSnapPoints,
      shiftKey,
      maxSeconds: displayTimelineSeconds,
    }), [displayTimelineSeconds, timelineSnapPoints]);

  const commitTimelineSnapPoints = (nextPoints: number[], label = 'Update timeline snap points') => {
    commitActiveCompositionPatch({ editorTimelineSnapPoints: nextPoints }, label);
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

  const trimVisualClipFromEdge = (
    clip: EditorVisualClip,
    edge: TimelineClipEdge,
    deltaSeconds: number,
    shiftKey: boolean,
  ) => {
    const sourceItem = sourceItemByNodeId.get(clip.sourceNodeId);
    const sourceDurationSeconds =
      sourceItem ? getSourceItemDurationSeconds(sourceItem, durationMap) ?? 0 : clip.durationSeconds ?? 4;
    const nextClip = trimVisualClipEdge(clip, {
      edge,
      deltaSeconds,
      sourceDurationSeconds: Math.max(0.25, sourceDurationSeconds),
      shiftKey,
    });

    updateVisualClips(
      visualClips.map((candidate) => (candidate.id === clip.id ? nextClip : candidate)),
      'Trim visual clip edge',
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
    const imageFiles = fileList.filter((file) => file.type.startsWith('image/'));
    const mediaFiles = fileList.filter((file) => !file.type.startsWith('image/'));

    if (mediaFiles.length > 0) {
      await importFiles(mediaFiles);
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

  const sendSourceItemToFlow = (item: SourceBinItem) => {
    const position = getNewFlowNodePosition();
    const type =
      item.kind === 'image'
        ? 'imageGen'
        : item.kind === 'video' || item.kind === 'composition'
          ? 'videoGen'
          : item.kind === 'audio'
            ? 'audioGen'
            : 'textNode';
    const nodeId = addNode(type, position);

    if (type === 'textNode') {
      patchNodeData(nodeId, {
        mode: 'prompt',
        prompt: item.text ?? item.label,
      });
    } else {
      const assetId = libraryItems.find((candidate) => candidate.id === item.id)?.assetId;
      patchNodeData(nodeId, {
        mediaMode: 'import',
        sourceAssetId: assetId,
        sourceAssetUrl: item.assetUrl,
        sourceAssetName: item.label,
        sourceAssetMimeType: item.mimeType,
      });
    }

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
      window.alert('This timeline clip does not have a video source frame to export.');
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
      window.alert(error instanceof Error ? error.message : 'The timeline frame could not be exported.');
    }
  };

  const commitSelectedImageCropAsAsset = async () => {
    if (!activeComposition || !selectedVisualClip || selectedVisualClip.sourceKind !== 'image') {
      return;
    }

    if (!selectedVisualBackingImageItem?.assetUrl) {
      window.alert('This image clip does not have a local source image to crop.');
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
      window.alert(error instanceof Error ? error.message : 'The image crop could not be committed.');
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
      window.alert('This text clip is empty.');
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
      window.alert(error instanceof Error ? error.message : 'Narration generation failed.');
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

  const removeSourceLibraryItem = (item: SourceBinItem) => {
    const confirmed = window.confirm(
      `Remove "${item.label}" from this project's saved source library? Timeline clips that depend on it will also be removed.`,
    );

    if (!confirmed) {
      return;
    }

    removeSourceBinItem(item.id);
    removeEditorSourceReferences(item.nodeId);
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

    setProgramMonitorMode('rendered');
    void runNode(activeComposition.id);
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

  return (
    <div className="absolute inset-0 z-30 bg-[radial-gradient(circle_at_top,#182236_0%,#0b0e14_45%,#06080d_100%)] px-3 pb-3 pt-16">
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
                      Editor Assets
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {sourceBinTab === 'media' ? (
                      <>
                        <button
                          className={smallEditorButtonClassName}
                          onClick={() => openSourceBinImportPicker('video/*,audio/*')}
                          type="button"
                        >
                          <Archive size={12} />
                          Import Media
                        </button>
                        <button
                          className={smallEditorButtonClassName}
                          onClick={() => openSourceBinImportPicker('video/*')}
                          type="button"
                        >
                          <Film size={12} />
                          Video
                        </button>
                        <button
                          className={smallEditorButtonClassName}
                          onClick={() => openSourceBinImportPicker('audio/*')}
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
                          onClick={() => openSourceBinImportPicker('image/*')}
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
                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
                  {sourceBinTab === 'media' ? (
                    mediaSourceItems.length > 0 ? (
                      mediaSourceItems.map((item) => (
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
                      ))
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
                        mediaInfo={selectedSourceItem ? mediaInfoMap[selectedSourceItem.id] : undefined}
                        onAddAudio={addAudioClip}
                        onAddVisual={addVisualClip}
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
                        isRunning={isCompositionRendering}
                        onAddEditorAsset={addEditorAsset}
                        renderStatusMessage={compositionRenderStatus}
                        onAspectRatioChange={(aspectRatio) =>
                          updateActiveCompositionSettings({ aspectRatio })
                        }
                        onOpenClipContextMenu={openVisualClipContextMenu}
                        onOpenContextMenu={(event) => {
                          event.preventDefault();

                          const menuItems: Array<{ label: string; action: () => void; tone?: 'danger' | 'default' }> = [];

                          if (previewUrl) {
                            menuItems.push({
                              label: 'Send Program Video To Flow Workspace',
                              action: () =>
                                sendSourceItemToFlow({
                                  id: `program-${activeComposition?.id ?? 'preview'}`,
                                  nodeId: activeComposition?.id ?? `program-${Date.now()}`,
                                  kind: 'video',
                                  label: activeComposition?.data.modelId ?? 'Program render',
                                  assetUrl: previewUrl,
                                  mimeType: 'video/mp4',
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
                        selectedClip={selectedVisualClip}
                        selectedStageObject={selectedStageObject}
                        sequenceDurationSeconds={sequenceDurationSeconds}
                        stageClips={programStageClips}
                        stageObjects={stageObjects}
                        stageMode={programMonitorMode}
                        videoRef={programMonitorVideoRef}
                        videoResolution={compositionResolution}
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
                      onClick={() => setTimelineTool('select')}
                    />
                    <ToolToggleButton
                      active={timelineTool === 'cut'}
                      icon={<Scissors size={12} />}
                      label="Cut"
                      onClick={() => {
                        if (!cutSelectedVisualClipAtPlayhead()) {
                          setTimelineTool('cut');
                        }
                      }}
                    />
                    <ToolToggleButton
                      active={timelineTool === 'slip'}
                      icon={<Film size={12} />}
                      label="Slip"
                      onClick={() => setTimelineTool('slip')}
                    />
                    <ToolToggleButton
                      active={timelineTool === 'hand'}
                      icon={<Archive size={12} />}
                      label="Hand"
                      onClick={() => setTimelineTool('hand')}
                    />
                    <ToolToggleButton
                      active={timelineTool === 'snap'}
                      icon={<Plus size={12} />}
                      label="Snap"
                      onClick={() => setTimelineTool('snap')}
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
                              label: block.item?.label ?? block.clip.sourceNodeId,
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

function SourceMonitorPanel({
  item,
  mediaInfo,
  sourceDurationSeconds,
  onAddVisual,
  onAddAudio,
  onOpenContextMenu,
  videoRef,
}: {
  item?: SourceBinItem;
  mediaInfo?: SourceMediaInfo;
  sourceDurationSeconds?: number;
  onAddVisual: (item: SourceBinItem, trackIndex: number) => void;
  onAddAudio: (item: SourceBinItem, trackIndex: number) => void;
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
                    Array.from({ length: VISUAL_TRACK_COUNT }, (_, trackIndex) => (
                      <button
                        key={trackIndex}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-700/60 bg-[#0f131b] px-2.5 py-1.5 text-[11px] font-semibold text-gray-200 transition-colors hover:border-gray-500 hover:text-white"
                        onClick={() => onAddVisual(item, trackIndex)}
                        type="button"
                      >
                        <Film size={12} />
                        V{trackIndex + 1}
                      </button>
                    ))
                  ) : null}

                  {canUseSourceItemAsAudio(item)
                    ? Array.from({ length: AUDIO_TRACK_COUNT }, (_, trackIndex) => (
                        <button
                          key={trackIndex}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-700/60 bg-[#0f131b] px-2.5 py-1.5 text-[11px] font-semibold text-gray-200 transition-colors hover:border-gray-500 hover:text-white"
                          onClick={() => onAddAudio(item, trackIndex)}
                          type="button"
                        >
                          <Music2 size={12} />
                          A{trackIndex + 1}
                        </button>
                      ))
                    : null}
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

function ProgramMonitorPanel({
  stageMode,
  previewUrl,
  aspectRatio,
  videoResolution,
  canvas,
  stageClips,
  stageObjects,
  selectedClip,
  selectedStageObject,
  activeTool,
  sequenceDurationSeconds,
  visualClipCount,
  audioClipCount,
  onRun,
  onAddEditorAsset,
  onSelectClip,
  onSelectStageObject,
  onUpdateClip,
  onUpdateStageObject,
  onSetMonitorMode,
  onAspectRatioChange,
  onResolutionChange,
  onOpenClipContextMenu,
  onOpenContextMenu,
  videoRef,
  isRunning,
  renderStatusMessage,
  errorMessage,
}: {
  stageMode: 'stage' | 'rendered';
  previewUrl?: string;
  aspectRatio: AspectRatio;
  videoResolution: VideoResolution;
  canvas: { width: number; height: number };
  stageClips: ProgramStageClip[];
  stageObjects: EditorStageObject[];
  selectedClip?: EditorVisualClip;
  selectedStageObject?: EditorStageObject;
  activeTool: TimelineTool;
  sequenceDurationSeconds: number;
  visualClipCount: number;
  audioClipCount: number;
  onRun: () => void;
  onAddEditorAsset: (kind: EditorAssetKind) => void;
  onSelectClip: (clipId: string) => void;
  onSelectStageObject: (objectId: string) => void;
  onUpdateClip: (clipId: string, patch: Partial<EditorVisualClip>) => void;
  onUpdateStageObject: (objectId: string, patch: Partial<EditorStageObject>) => void;
  onSetMonitorMode: (mode: 'stage' | 'rendered') => void;
  onAspectRatioChange: (aspectRatio: AspectRatio) => void;
  onResolutionChange: (videoResolution: VideoResolution) => void;
  onOpenClipContextMenu: (clipId: string, event: React.MouseEvent<HTMLElement>) => void;
  onOpenContextMenu: (event: React.MouseEvent<HTMLDivElement>) => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isRunning?: boolean;
  renderStatusMessage?: string;
  errorMessage?: string;
}) {
  const handleSaveVideo = async () => {
    if (!previewUrl) {
      return;
    }

    await downloadAsset(previewUrl, buildDownloadFilename(`${EXPORT_BASENAME}-program`, 'video/mp4', 'mp4'));
  };

  return (
    <section className={`${panelClassName} flex h-full min-h-0 flex-col overflow-hidden`}>
      <div className="border-b border-gray-700/60 px-3 py-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-gray-100">Program Monitor</div>
            <div className="mt-0.5 text-[11px] text-gray-500">
              Edit the composition canvas directly here, then render a compiled preview when you want to verify the actual output.
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <SummaryPill label="Canvas" value={`${aspectRatio} · ${videoResolution}`} />
              <SummaryPill label="Visual" value={String(visualClipCount)} />
              <SummaryPill label="Audio" value={String(audioClipCount)} />
              <SummaryPill
                label="Length"
                value={sequenceDurationSeconds > 0 ? `${sequenceDurationSeconds.toFixed(1)}s` : '0.0s'}
              />
              {isRunning ? (
                <div className="rounded-full border border-amber-400/40 bg-amber-500/15 px-3 py-1 text-[11px] font-semibold text-amber-100">
                  Rendering live
                </div>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="inline-flex overflow-hidden rounded-lg border border-gray-700/60 bg-[#0f131b]">
              <button
                className={`px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                  stageMode === 'stage' ? 'bg-blue-500/20 text-blue-100' : 'text-gray-300 hover:text-white'
                }`}
                onClick={() => onSetMonitorMode('stage')}
                type="button"
              >
                Edit Stage
              </button>
              <button
                className={`px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                  stageMode === 'rendered'
                    ? 'bg-blue-500/20 text-blue-100'
                    : 'text-gray-300 hover:text-white'
                }`}
                disabled={!previewUrl}
                onClick={() => onSetMonitorMode('rendered')}
                type="button"
              >
                Rendered Preview
              </button>
            </div>
            <select
              className="rounded-lg border border-gray-700/60 bg-[#0f131b] px-2.5 py-1.5 text-[11px] font-medium text-gray-200 outline-none"
              onChange={(event) => onAspectRatioChange(event.target.value as AspectRatio)}
              value={aspectRatio}
            >
              <option value="16:9">16:9 Canvas</option>
              <option value="9:16">9:16 Canvas</option>
              <option value="1:1">1:1 Canvas</option>
            </select>
            <select
              className="rounded-lg border border-gray-700/60 bg-[#0f131b] px-2.5 py-1.5 text-[11px] font-medium text-gray-200 outline-none"
              onChange={(event) => onResolutionChange(event.target.value as VideoResolution)}
              value={videoResolution}
            >
              <option value="720p">720p</option>
              <option value="1080p">1080p</option>
              <option value="4k">4k</option>
            </select>
            {previewUrl ? (
              <button
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-700/60 bg-[#0f131b] px-2.5 py-1.5 text-[11px] font-semibold text-gray-200 transition-colors hover:border-gray-500 hover:text-white"
                onClick={() => void handleSaveVideo()}
                type="button"
              >
                <Archive size={12} />
                Save Video
              </button>
            ) : null}
            <button
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                isRunning
                  ? 'bg-amber-400 text-black shadow-[0_0_18px_rgba(251,191,36,0.35)]'
                  : 'bg-white text-black hover:bg-gray-200'
              }`}
              onClick={onRun}
              type="button"
            >
              <Play size={12} fill="currentColor" />
              {isRunning ? 'Rendering…' : 'Render'}
            </button>
          </div>
        </div>
      </div>
      <div className="relative min-h-0 flex-1 p-2.5">
        {stageMode === 'rendered' && previewUrl ? (
          <div className="h-full min-h-0" onContextMenu={onOpenContextMenu}>
            <MonitorStageFrame aspectRatioValue={getAspectRatioValue(aspectRatio)}>
              <video className="absolute inset-0 h-full w-full object-contain" controls ref={videoRef} src={previewUrl} />
            </MonitorStageFrame>
          </div>
        ) : (
          <ProgramStage
            activeTool={activeTool}
            aspectRatioValue={getAspectRatioValue(aspectRatio)}
            canvas={canvas}
            onOpenContextMenu={onOpenContextMenu}
            onOpenClipContextMenu={onOpenClipContextMenu}
            onAddEditorAsset={onAddEditorAsset}
            onSelectClip={onSelectClip}
            onSelectStageObject={onSelectStageObject}
            onUpdateClip={onUpdateClip}
            onUpdateStageObject={onUpdateStageObject}
            selectedClip={selectedClip}
            selectedStageObject={selectedStageObject}
            stageClips={stageClips}
            stageObjects={stageObjects}
          />
        )}
        {isRunning ? (
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
        {!isRunning && errorMessage ? (
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
    </section>
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
  onAddEditorAsset,
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
  onAddEditorAsset: (kind: EditorAssetKind) => void;
  onSelectClip: (clipId: string) => void;
  onSelectStageObject: (objectId: string) => void;
  onUpdateClip: (clipId: string, patch: Partial<EditorVisualClip>) => void;
  onUpdateStageObject: (objectId: string, patch: Partial<EditorStageObject>) => void;
  onOpenClipContextMenu: (clipId: string, event: React.MouseEvent<HTMLElement>) => void;
  onOpenContextMenu: (event: React.MouseEvent<HTMLDivElement>) => void;
}) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [toolPalettePosition, setToolPalettePosition] = useState({ x: 12, y: 12 });
  const [stageViewportSize, setStageViewportSize] = useState<{ width: number; height: number }>({
    width: canvas.width,
    height: canvas.height,
  });
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

  const startToolPaletteDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!stageRef.current) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const stageBounds = stageRef.current.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const startPosition = toolPalettePosition;

    const onMove = (moveEvent: PointerEvent) => {
      setToolPalettePosition({
        x: Math.max(0, Math.min(stageBounds.width - 180, startPosition.x + moveEvent.clientX - startX)),
        y: Math.max(0, Math.min(stageBounds.height - 80, startPosition.y + moveEvent.clientY - startY)),
      });
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

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
  const selectedStageClip = selectedClip
    ? stageClips.find((stageClip) => stageClip.clip.id === selectedClip.id)
    : undefined;
  const selectedKeyframeState = selectedClip
    ? getVisualKeyframeStateAtProgress(
        selectedClip,
        selectedStageClip ? getStageClipProgress(selectedStageClip) * 100 : 0,
      )
    : undefined;

  return (
    <div className="h-full min-h-0">
      <MonitorStageFrame aspectRatioValue={aspectRatioValue}>
        <div
          className="absolute inset-0 overflow-hidden bg-black"
          onContextMenu={onOpenContextMenu}
          ref={stageRef}
        >
          <div
            className="absolute z-40 max-w-[min(36rem,calc(100%-1rem))] rounded-xl border border-gray-700/70 bg-[#0f131b]/90 p-2 shadow-xl backdrop-blur"
            style={{ left: toolPalettePosition.x, top: toolPalettePosition.y }}
          >
            <div
              className="mb-2 cursor-move select-none text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-200/80"
              onPointerDown={startToolPaletteDrag}
              title="Drag to move this tool palette inside the program monitor"
            >
              Program Tools
            </div>
            <div className="flex flex-wrap gap-2">
              <StageToolButton icon={<Type size={12} />} label="Text" onClick={() => onAddEditorAsset('text')} />
              <StageToolButton icon={<Square size={12} />} label="Rectangle" onClick={() => onAddEditorAsset('shape')} />
              {selectedClip ? (
                <>
                  <StageToolButton
                    active={selectedClip.fitMode === 'contain'}
                    label="Contain"
                    onClick={() => adjustSelectedClip({ fitMode: 'contain' })}
                  />
                  <StageToolButton
                    active={selectedClip.fitMode === 'cover'}
                    label="Cover"
                    onClick={() => adjustSelectedClip({ fitMode: 'cover' })}
                  />
                  <StageToolButton
                    active={selectedClip.fitMode === 'stretch'}
                    label="Stretch"
                    onClick={() => adjustSelectedClip({ fitMode: 'stretch' })}
                  />
                  <StageToolButton label="Center" onClick={() => adjustSelectedClip({ positionX: 0, positionY: 0 })} />
                  <StageToolButton label="Scale -" onClick={() => adjustSelectedClip({ scalePercent: Math.max(10, (selectedKeyframeState?.scalePercent ?? selectedClip.scalePercent) - 10) })} />
                  <StageToolButton label="Scale +" onClick={() => adjustSelectedClip({ scalePercent: Math.min(500, (selectedKeyframeState?.scalePercent ?? selectedClip.scalePercent) + 10) })} />
                  <StageToolButton label="Rotate -" onClick={() => adjustSelectedClip({ rotationDeg: (selectedKeyframeState?.rotationDeg ?? selectedClip.rotationDeg) - 15 })} />
                  <StageToolButton label="Rotate +" onClick={() => adjustSelectedClip({ rotationDeg: (selectedKeyframeState?.rotationDeg ?? selectedClip.rotationDeg) + 15 })} />
                  <StageToolButton label="Opacity -" onClick={() => adjustSelectedClip({ opacityPercent: Math.max(0, (selectedKeyframeState?.opacityPercent ?? selectedClip.opacityPercent) - 10) })} />
                  <StageToolButton label="Opacity +" onClick={() => adjustSelectedClip({ opacityPercent: Math.min(100, (selectedKeyframeState?.opacityPercent ?? selectedClip.opacityPercent) + 10) })} />
                  <StageToolButton label="Left" onClick={() => nudgeSelectedClip(-32, 0)} />
                  <StageToolButton label="Right" onClick={() => nudgeSelectedClip(32, 0)} />
                  <StageToolButton label="Up" onClick={() => nudgeSelectedClip(0, -32)} />
                  <StageToolButton label="Down" onClick={() => nudgeSelectedClip(0, 32)} />
                  <StageToolButton
                    label="Reset"
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
                  />
                </>
              ) : null}
              {selectedStageObject ? (
                <>
                  <StageToolButton label="Obj Left" onClick={() => nudgeSelectedStageObject(-32, 0)} />
                  <StageToolButton label="Obj Right" onClick={() => nudgeSelectedStageObject(32, 0)} />
                  <StageToolButton label="Obj Up" onClick={() => nudgeSelectedStageObject(0, -32)} />
                  <StageToolButton label="Obj Down" onClick={() => nudgeSelectedStageObject(0, 32)} />
                  <StageToolButton label="Obj Rotate -" onClick={() => adjustSelectedStageObject({ rotationDeg: selectedStageObject.rotationDeg - 15 })} />
                  <StageToolButton label="Obj Rotate +" onClick={() => adjustSelectedStageObject({ rotationDeg: selectedStageObject.rotationDeg + 15 })} />
                  <StageToolButton label="Obj Opacity -" onClick={() => adjustSelectedStageObject({ opacityPercent: Math.max(0, selectedStageObject.opacityPercent - 10) })} />
                  <StageToolButton label="Obj Opacity +" onClick={() => adjustSelectedStageObject({ opacityPercent: Math.min(100, selectedStageObject.opacityPercent + 10) })} />
                </>
              ) : null}
            </div>
            <div className="mt-2 text-[11px] text-gray-400">
              Drag this palette by its title. Select stage objects to move, resize, rotate, and tune them in the inspector.
            </div>
          </div>
          {stageClips.length > 0
            ? (
            stageClips.map((stageClip) => {
              const layout = getStageClipLayout(stageClip, canvas);
              const rotationDeg = getStageClipRotation(stageClip);
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
                    opacity: Math.max(
                      0,
                      Math.min(
                        1,
                        getStageClipOpacity(stageClip) / 100,
                      ),
                    ),
                    transform: `rotate(${rotationDeg}deg) scaleX(${stageClip.clip.flipHorizontal ? -1 : 1}) scaleY(${stageClip.clip.flipVertical ? -1 : 1})`,
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
                    <ProgramStageMedia clip={stageClip} stageScale={stageScale} />
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
              );
            })
              )
            : null}
          {stageObjects.map((object) => {
            const isSelected = selectedStageObject?.id === object.id;

            return (
              <div
                key={object.id}
                className="absolute"
                style={{
                  left: `${object.x * stageScale}px`,
                  top: `${object.y * stageScale}px`,
                  width: `${object.width * stageScale}px`,
                  height: `${object.height * stageScale}px`,
                  opacity: Math.max(0, Math.min(1, object.opacityPercent / 100)),
                  transform: `rotate(${object.rotationDeg}deg)`,
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
  clip,
  stageScale,
}: {
  clip: ProgramStageClip;
  stageScale: number;
}) {
  const effectDescriptor = buildClipEffectDescriptorForClip(clip.clip);
  const crop = effectDescriptor.crop;
  const filter = effectDescriptor.cssFilter;
  const cropFrameStyle: CSSProperties = {
    left: `${crop.cropLeftPercent}%`,
    right: `${crop.cropRightPercent}%`,
    top: `${crop.cropTopPercent}%`,
    bottom: `${crop.cropBottomPercent}%`,
  };
  const cropContentStyle: CSSProperties = {
    filter: filter || undefined,
    transform: `translate(${crop.cropPanXPercent}%, ${crop.cropPanYPercent}%) rotate(${crop.cropRotationDeg}deg)`,
    transformOrigin: 'center center',
  };
  const mediaClassName =
    clip.clip.fitMode === 'stretch' ? 'h-full w-full object-fill' : 'h-full w-full object-cover';
  const textDefaults = clip.asset?.textDefaults;
  const shapeDefaults = clip.asset?.shapeDefaults;
  let content: ReactNode;
  const isTextClip = clip.clip.sourceKind === 'text';

  if (clip.item?.kind === 'image' && clip.item.assetUrl) {
    content = <img alt={clip.item.label} className={mediaClassName} src={clip.item.assetUrl} />;
  } else if ((clip.item?.kind === 'video' || clip.item?.kind === 'composition') && clip.item.assetUrl) {
    content = (
      <StageVideoAsset
        className={mediaClassName}
        currentTimeSeconds={clip.sourceTimeSeconds}
        src={clip.item.assetUrl}
      />
    );
  } else if (clip.clip.sourceKind === 'shape') {
    content = (
      <div className="flex h-full w-full items-center justify-center bg-transparent p-[10%]">
        <div
          className="h-full w-full"
          style={{
            backgroundColor: clip.clip.shapeFillColor ?? shapeDefaults?.fillColor ?? '#0ea5e9',
            borderColor: clip.clip.shapeBorderColor ?? shapeDefaults?.borderColor ?? '#f8fafc',
            borderRadius: clip.clip.shapeCornerRadius ?? shapeDefaults?.cornerRadius ?? 18,
            borderStyle: 'solid',
            borderWidth: clip.clip.shapeBorderWidth ?? shapeDefaults?.borderWidth ?? 2,
          }}
        />
      </div>
    );
  } else if (isTextClip) {
    const fontSizePx =
      Math.max(8, clip.clip.textSizePx || textDefaults?.fontSizePx || 64) *
      getStageClipScaleFactor(clip) *
      stageScale;

    content = (
      <div className="flex h-full w-full items-center justify-center bg-transparent text-center">
        <div
          className="inline-block whitespace-pre font-semibold leading-tight"
          style={{
            color: clip.clip.textColor || textDefaults?.color || '#f3f4f6',
            fontFamily: clip.clip.textFontFamily || textDefaults?.fontFamily || 'Inter, system-ui, sans-serif',
            fontSize: `${Math.max(8, fontSizePx)}px`,
            ...getTextPreviewEffectStyle(clip.clip.textEffect || textDefaults?.textEffect || 'none'),
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
              <input
                className="h-11 w-full rounded-xl border border-gray-700/60 bg-[#0f131b] px-2 py-1"
                onChange={(event) => onUpdate({ color: event.target.value } as Partial<EditorStageObject>)}
                type="color"
                value={object.color}
              />
            </label>
          </div>
        </div>
      ) : (
        <div className="space-y-3 rounded-xl border border-gray-700/60 bg-[#111217]/35 p-3">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block space-y-2 text-xs text-gray-400">
              <span>Fill</span>
              <input
                className="h-11 w-full rounded-xl border border-gray-700/60 bg-[#0f131b] px-2 py-1"
                onChange={(event) => onUpdate({ fillColor: event.target.value } as Partial<EditorStageObject>)}
                type="color"
                value={object.fillColor}
              />
            </label>
            <label className="block space-y-2 text-xs text-gray-400">
              <span>Border</span>
              <input
                className="h-11 w-full rounded-xl border border-gray-700/60 bg-[#0f131b] px-2 py-1"
                onChange={(event) => onUpdate({ borderColor: event.target.value } as Partial<EditorStageObject>)}
                type="color"
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

function createClipFilter(kind: EditorClipFilterKind): EditorClipFilter {
  return {
    id: `filter-${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    amount: kind === 'grayscale' ? 100 : kind === 'blur' ? 12 : 0,
    enabled: true,
  };
}

function formatClipFilterKind(kind: EditorClipFilterKind): string {
  return kind
    .split('-')
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ');
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
    ? getVisualKeyframeStateAtProgress(visualClip, visualProgressPercent)
    : undefined;
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
                  value={visualClip.fitMode}
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
                        max={filter.kind === 'blur' || filter.kind === 'grayscale' ? 100 : 100}
                        min={filter.kind === 'blur' || filter.kind === 'grayscale' ? 0 : -100}
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
                    <input
                      className="h-11 w-full rounded-xl border border-gray-700/60 bg-[#0f131b] px-2 py-1"
                      onChange={(event) => onUpdateVisualClip({ textColor: event.target.value })}
                      type="color"
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
                    <input
                      className="h-11 w-full rounded-xl border border-gray-700/60 bg-[#0f131b] px-2 py-1"
                      onChange={(event) => onUpdateVisualClip({ shapeFillColor: event.target.value })}
                      type="color"
                      value={visualClip.shapeFillColor ?? '#0ea5e9'}
                    />
                  </label>
                  <label className="block space-y-2 text-xs text-gray-400">
                    <span>Border</span>
                    <input
                      className="h-11 w-full rounded-xl border border-gray-700/60 bg-[#0f131b] px-2 py-1"
                      onChange={(event) => onUpdateVisualClip({ shapeBorderColor: event.target.value })}
                      type="color"
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

function SourceItemCard({
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

  return (
    <div
      className={`w-full cursor-grab rounded-xl border p-3 text-left transition-colors active:cursor-grabbing ${
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
          className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-gray-700/60 bg-[#0d0f15] text-gray-300 transition-colors hover:border-gray-500 hover:text-white"
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
          className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition-colors ${
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
          <div className="overflow-hidden rounded-lg border border-gray-700/60 bg-[#0d0f15]">
            <MiniPreview item={item} />
          </div>
        </button>
        ) : null}
        <div className="min-w-0 flex-1">
          <button className="w-full text-left" onClick={onSelect} type="button">
            <div className="flex min-w-0 items-center gap-1.5">
              {isStarred ? <Star className="shrink-0 text-amber-200" fill="currentColor" size={11} /> : null}
              <span className="truncate text-sm font-medium text-gray-100">{item.label}</span>
            </div>
            <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-gray-500">{item.kind}</div>
            {!isCollapsed && durationSeconds ? <div className="mt-1 text-[11px] text-gray-400">{durationSeconds.toFixed(1)}s</div> : null}
          </button>
        </div>
        <button
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-red-500/25 bg-red-500/10 text-red-100 transition-colors hover:border-red-400/60 hover:bg-red-500/20"
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
      <div className="mt-3 flex flex-wrap gap-2">
        {canUseSourceItemAsVisual(item) ? (
          Array.from({ length: VISUAL_TRACK_COUNT }, (_, index) => (
            <button
              key={index}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-700/60 bg-[#0d0f15] px-2.5 py-1.5 text-[11px] font-semibold text-gray-200 transition-colors hover:border-gray-500 hover:text-white"
              onClick={(event) => {
                event.stopPropagation();
                onAddVisual(index);
              }}
              type="button"
            >
              <Film size={12} />
              V{index + 1}
            </button>
          ))
        ) : null}

        {canUseSourceItemAsAudio(item)
          ? Array.from({ length: AUDIO_TRACK_COUNT }, (_, index) => (
              <button
                key={index}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-700/60 bg-[#0d0f15] px-2.5 py-1.5 text-[11px] font-semibold text-gray-200 transition-colors hover:border-gray-500 hover:text-white"
                onClick={(event) => {
                  event.stopPropagation();
                  onAddAudio(index);
                }}
                type="button"
              >
                <Music2 size={12} />
                A{index + 1}
              </button>
            ))
          : null}
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
  return (
    <article
      className="rounded-xl border border-gray-700/60 bg-[#111217]/70 p-2.5"
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
  const laneInset = Math.max(3, Math.round(laneHeight * 0.08));
  const automationHeight = Math.max(24, Math.min(46, Math.round(laneHeight * 0.42)));
  const laneSizeStyle: CSSProperties = {
    height: laneHeight,
    minHeight: laneHeight,
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

    const onPointerMove = (moveEvent: PointerEvent) => {
      const deltaSeconds = ((moveEvent.clientX - startClientX) / laneRect.width) * timelineSeconds;
      onTrimBlockEdge(startClip, edge, deltaSeconds, moveEvent.shiftKey);
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
        className="overflow-hidden rounded-lg border border-gray-700/60 bg-[#0f131b] px-2.5 py-2"
        style={laneSizeStyle}
      >
        <div className="text-[13px] font-semibold text-gray-100">{trackLabel}</div>
        <div className="mt-0.5 text-[10px] uppercase tracking-[0.16em] text-gray-500">
          {blocks.length} clip{blocks.length === 1 ? '' : 's'}
        </div>
        {typeof trackVolumePercent === 'number' && onTrackVolumeChange ? (
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
        className="relative overflow-hidden rounded-lg border border-gray-700/60 bg-[#0f131b]"
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
        {gaps.map((gap) => {
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
        {blocks.length > 0 ? (
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
                      title="Drag to trim or extend clip start. Hold Shift for 1s intervals."
                      type="button"
                    />
                    <button
                      aria-label={`Trim end of ${block.label}`}
                      className="absolute bottom-1 top-1 right-0 z-30 w-2 cursor-ew-resize rounded-r bg-white/0 transition-colors hover:bg-cyan-200/45"
                      onPointerDown={(event) => startEdgeTrim(event, block, 'end')}
                      title="Drag to trim or extend clip end. Hold Shift for 1s intervals."
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
                        className={`absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border shadow ${
                          index === 0 || index === automationPoints.length - 1
                            ? 'border-white/80 bg-cyan-200'
                            : 'border-white/80 bg-blue-300'
                        }`}
                        data-automation-point="true"
                        onDoubleClick={(event) => {
                          if (!onRemoveAutomationPoint || index === 0 || index === automationPoints.length - 1) {
                            return;
                          }

                          event.preventDefault();
                          event.stopPropagation();
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

                          if (!bounds) {
                            return;
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
      {onResizeLane ? (
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
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/55 p-6 backdrop-blur-sm">
      <div className="max-h-[82vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-gray-700/70 bg-[#141821] shadow-2xl">
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
              <input
                className="h-11 w-full rounded-xl border border-gray-700/60 bg-[#0f131b] px-2 py-1"
                onChange={(event) => onChange({ color: event.target.value })}
                type="color"
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
    </div>
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

function MiniPreview({ item }: { item: SourceBinItem }) {
  return <MonitorSurface item={item} variant="mini" />;
}

function SummaryPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-full border border-gray-700/60 bg-[#111217]/50 px-3 py-1 text-[11px] text-gray-300">
      <span className="text-gray-500">{label}</span> <span className="font-semibold text-white">{value}</span>
    </div>
  );
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

function StageToolButton({
  active = false,
  icon,
  label,
  onClick,
}: {
  active?: boolean;
  icon?: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
        active
          ? 'border-blue-400/50 bg-blue-500/20 text-blue-100'
          : 'border-gray-700/60 bg-[#131722] text-gray-200 hover:border-gray-500 hover:text-white'
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
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/55 p-6 backdrop-blur-sm">
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-gray-700/70 bg-[#141821] shadow-2xl">
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
    </div>
  );
}

function EditorHelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/55 p-6 backdrop-blur-sm">
      <div className="max-h-[80vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-gray-700/70 bg-[#141821] shadow-2xl">
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
                ['V', 'Select tool'],
                ['C', 'Cut selected visual clip at the playhead, or enter cut mode if no valid clip is selected'],
                ['S', 'Slip tool'],
                ['H', 'Hand pan tool'],
                ['K', 'Add or update a keyframe on the selected clip at the playhead'],
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
            </ul>
          </section>
        </div>
      </div>
    </div>
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

function canUseSourceItemAsVisual(item: SourceBinItem): boolean {
  return item.kind === 'image' || item.kind === 'video' || item.kind === 'composition' || item.kind === 'text';
}

function canUseSourceItemAsAudio(item: SourceBinItem): boolean {
  return item.kind === 'audio' || item.kind === 'video' || item.kind === 'composition';
}

function getDraggedSourceItemId(dataTransfer: DataTransfer): string | undefined {
  const rawPayload = dataTransfer.getData('application/x-flow-source-bin-item');

  if (!rawPayload) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(rawPayload) as { itemId?: string };
    return parsed.itemId;
  } catch {
    return undefined;
  }
}

function createDerivedVisualClipId(): string {
  return `visual-${globalThis.crypto?.randomUUID?.() ?? `derived-${Date.now()}`}`;
}

function getSourceItemIcon(kind: TimelineBlockKind) {
  switch (kind) {
    case 'image':
      return <ImageIcon size={14} />;
    case 'video':
    case 'composition':
      return <Film size={14} />;
    case 'audio':
      return <Music2 size={14} />;
    case 'text':
      return <Type size={14} />;
    case 'shape':
      return <Square size={14} />;
  }
}

function getVisualTrackEndMs(blocks: ReturnType<typeof buildVisualTimelineBlocks>, trackIndex: number): number {
  return Math.max(
    0,
    ...blocks
      .filter((block) => block.clip.trackIndex === trackIndex)
      .map((block) => Math.round(block.endSeconds * 1000)),
  );
}

function getAudioTrackEndMs(blocks: ReturnType<typeof buildAudioTimelineBlocks>, trackIndex: number): number {
  return Math.max(
    0,
    ...blocks
      .filter((block) => block.clip.trackIndex === trackIndex)
      .map((block) => Math.round(block.endSeconds * 1000)),
  );
}

function getDefaultAudioTrackVolumes(): number[] {
  return Array.from({ length: AUDIO_TRACK_COUNT }, () => 100);
}

function getSourceItemDurationSeconds(
  item: SourceBinItem | undefined,
  durationMap: Record<string, number>,
): number | undefined {
  if (!item) {
    return undefined;
  }

  if (item.kind === 'image' || item.kind === 'text') {
    return undefined;
  }

  return durationMap[item.id];
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Failed to convert the captured frame into a data URL.'));
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('The captured frame could not be converted into a data URL.'));
        return;
      }

      resolve(reader.result);
    };
    reader.readAsDataURL(blob);
  });
}

async function mapWithConcurrency<TItem, TResult>(
  items: TItem[],
  concurrency: number,
  mapper: (item: TItem, index: number) => Promise<TResult>,
): Promise<TResult[]> {
  const results: TResult[] = new Array(items.length);
  const workerCount = Math.max(1, Math.min(items.length, Math.floor(concurrency)));
  let nextIndex = 0;

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await mapper(items[currentIndex], currentIndex);
      }
    }),
  );

  return results;
}

function buildTimelineFallbackWaveformPeaks(sampleCount: number): number[] {
  const safeSampleCount = Math.max(16, Math.round(sampleCount));

  return Array.from({ length: safeSampleCount }, (_, index) => {
    const phase = (index / Math.max(1, safeSampleCount - 1)) * Math.PI * 4;
    return 0.16 + Math.abs(Math.sin(phase)) * 0.42;
  });
}

function buildClipPreviewSignature(
  clip: EditorVisualClip,
  sourceItem: SourceBinItem | undefined,
  durationMap: Record<string, number>,
): string | undefined {
  if (!sourceItem?.assetUrl) {
    return undefined;
  }

  if (sourceItem.kind === 'image') {
    return `image:${sourceItem.id}:${buildMediaAssetSignaturePart(sourceItem.assetUrl)}`;
  }

  if (sourceItem.kind !== 'video' && sourceItem.kind !== 'composition') {
    return undefined;
  }

  const sourceDurationSeconds = durationMap[sourceItem.id] ?? 0;
  const sourceRange = resolveVisualClipSourceRangeMs(clip, sourceDurationSeconds);

  return [
    sourceItem.kind,
    sourceItem.id,
    buildMediaAssetSignaturePart(sourceItem.assetUrl),
    sourceDurationSeconds,
    sourceRange.sourceInMs,
    sourceRange.sourceOutMs,
    clip.playbackRate,
    clip.reversePlayback ? 'reverse' : 'forward',
  ].join(':');
}

function buildAudioWaveformSignature(sourceItem: SourceBinItem | undefined): string | undefined {
  if (!sourceItem?.assetUrl) {
    return undefined;
  }

  if (sourceItem.kind !== 'audio' && sourceItem.kind !== 'video' && sourceItem.kind !== 'composition') {
    return undefined;
  }

  return [
    sourceItem.kind,
    sourceItem.id,
    buildMediaAssetSignaturePart(sourceItem.assetUrl),
    sourceItem.mimeType ?? '',
  ].join(':');
}

async function buildTimelineClipEdgePreview(
  clip: EditorVisualClip,
  sourceItem: SourceBinItem,
  durationMap: Record<string, number>,
): Promise<TimelineClipEdgePreview | undefined> {
  if (!sourceItem.assetUrl) {
    return undefined;
  }

  if (sourceItem.kind === 'image') {
    return {
      start: sourceItem.assetUrl,
      end: sourceItem.assetUrl,
    };
  }

  if (sourceItem.kind !== 'video' && sourceItem.kind !== 'composition') {
    return undefined;
  }

  const sourceDurationSeconds = durationMap[sourceItem.id] ?? 0;
  const clipDurationSeconds = getPreviewableClipDurationSeconds(clip, sourceDurationSeconds);

  if (clipDurationSeconds <= 0) {
    return undefined;
  }

  const endLocalTimeSeconds = Math.max(0, clipDurationSeconds - Math.min(0.05, clipDurationSeconds / 10));
  const startTimeSeconds = resolveStageSourceTimeSeconds(clip, sourceDurationSeconds, 0);
  const endTimeSeconds = resolveStageSourceTimeSeconds(clip, sourceDurationSeconds, endLocalTimeSeconds);
  const frames = await extractVideoFramesAtTimes(
    sourceItem.assetUrl,
    [startTimeSeconds, endTimeSeconds],
    TIMELINE_PREVIEW_FRAME_OPTIONS,
  );
  const startFrame = frames[0];
  const endFrame = frames[1];

  if (!startFrame || !endFrame) {
    return undefined;
  }

  return {
    start: await blobToDataUrl(startFrame),
    end: await blobToDataUrl(endFrame),
  };
}

function getPreviewableClipDurationSeconds(
  clip: EditorVisualClip,
  sourceDurationSeconds: number,
): number {
  if (clip.sourceKind === 'image' || clip.sourceKind === 'text' || clip.sourceKind === 'shape') {
    return clip.durationSeconds ?? 4;
  }

  const availableMs = resolveVisualClipSourceRangeMs(clip, sourceDurationSeconds).durationMs;

  if (availableMs === 0) {
    return 0;
  }

  return availableMs / 1000 / Math.max(0.25, clip.playbackRate || 1);
}

function normalizeAspectRatio(value: unknown): AspectRatio {
  return value === '1:1' || value === '9:16' ? value : '16:9';
}

function normalizeVideoResolution(value: unknown): VideoResolution {
  return value === '720p' || value === '4k' ? value : '1080p';
}

function areMediaInfosEqual(left?: SourceMediaInfo, right?: SourceMediaInfo): boolean {
  return left?.durationSeconds === right?.durationSeconds
    && left?.width === right?.width
    && left?.height === right?.height;
}

function resolveSourceAspectRatio(item: SourceBinItem, mediaInfo?: SourceMediaInfo): number {
  if (mediaInfo?.width && mediaInfo?.height) {
    return mediaInfo.width / mediaInfo.height;
  }

  switch (item.kind) {
    case 'image':
    case 'video':
    case 'composition':
      return 16 / 9;
    case 'audio':
      return 16 / 9;
    case 'text':
      return 16 / 9;
  }
}

async function getSourceMediaInfo(item: SourceBinItem): Promise<SourceMediaInfo> {
  if (item.kind === 'text') {
    return {};
  }

  if (item.kind === 'image') {
    const assetUrl = item.assetUrl;

    if (!assetUrl) {
      return {};
    }

    return new Promise((resolve) => {
      const image = new Image();
      image.onload = () => {
        const info = { width: image.naturalWidth, height: image.naturalHeight };
        image.removeAttribute('src');
        resolve(info);
      };
      image.onerror = () => {
        image.removeAttribute('src');
        resolve({});
      };
      image.src = assetUrl;
    });
  }

  const assetUrl = item.assetUrl;

  if (!assetUrl) {
    return {};
  }

  return new Promise((resolve) => {
    const media = document.createElement(item.kind === 'audio' ? 'audio' : 'video');
    const cleanup = () => {
      media.onloadedmetadata = null;
      media.onerror = null;
      media.removeAttribute('src');
      media.load();
    };
    media.preload = 'metadata';
    media.src = assetUrl;

    media.onloadedmetadata = () => {
      const info = {
        durationSeconds: Number.isFinite(media.duration) ? media.duration : 0,
        width: media instanceof HTMLVideoElement ? media.videoWidth : undefined,
        height: media instanceof HTMLVideoElement ? media.videoHeight : undefined,
      };
      cleanup();
      resolve(info);
    };

    media.onerror = () => {
      cleanup();
      resolve({});
    };
  });
}

function getProgramStageClips(
  visualClips: EditorVisualClip[],
  sourceItemByNodeId: Map<string, SourceBinItem>,
  editorAssetById: Map<string, EditorAsset>,
  durationMap: Record<string, number>,
  mediaInfoMap: Record<string, SourceMediaInfo>,
  playheadSeconds: number,
): ProgramStageClip[] {
  return visualClips
    .flatMap((clip) => {
      const item = sourceItemByNodeId.get(clip.sourceNodeId);
      const asset = editorAssetById.get(clip.sourceNodeId);
      const durationSeconds = resolveVisualClipDuration(clip, sourceItemByNodeId, durationMap);
      const startSeconds = clip.startMs / 1000;
      const endSeconds = startSeconds + durationSeconds;

      if (playheadSeconds < startSeconds || playheadSeconds > endSeconds) {
        return [];
      }

      const localSeconds = Math.max(0, playheadSeconds - startSeconds);
      const itemInfo = item ? mediaInfoMap[item.id] : undefined;
      const sourceDurationSeconds = itemInfo?.durationSeconds ?? 0;
      const sourceTimeSeconds =
        clip.sourceKind === 'video' || clip.sourceKind === 'composition'
          ? resolveStageSourceTimeSeconds(clip, sourceDurationSeconds, localSeconds)
          : undefined;
      const sourceDimensions = getStageClipSourceDimensions(clip, item, asset, itemInfo);

      return [{
        clip,
        item,
        asset,
        durationSeconds,
        localTimeSeconds: localSeconds,
        sourceTimeSeconds,
        sourceWidth: sourceDimensions.width,
        sourceHeight: sourceDimensions.height,
      } satisfies ProgramStageClip];
    })
    .sort((left, right) => left.clip.trackIndex - right.clip.trackIndex || left.clip.startMs - right.clip.startMs);
}

function resolveStageSourceTimeSeconds(
  clip: EditorVisualClip,
  sourceDurationSeconds: number,
  localSeconds: number,
): number {
  const playbackRate = Math.max(0.25, clip.playbackRate || 1);
  const sourceRange = resolveVisualClipSourceRangeMs(clip, sourceDurationSeconds);
  const sourceStartSeconds = sourceRange.sourceInMs / 1000;
  const sourceEndSeconds = sourceRange.sourceOutMs / 1000;
  const clipSourceOffsetSeconds = localSeconds * playbackRate;

  if (clip.reversePlayback) {
    return Math.max(sourceStartSeconds, sourceEndSeconds - clipSourceOffsetSeconds);
  }

  return Math.min(sourceEndSeconds, sourceStartSeconds + clipSourceOffsetSeconds);
}

function getStageClipLayout(
  stageClip: ProgramStageClip,
  canvas: { width: number; height: number },
): { left: number; top: number; width: number; height: number } {
  const fit = getStageFitDimensions(
    stageClip.sourceWidth,
    stageClip.sourceHeight,
    canvas.width,
    canvas.height,
    stageClip.clip.sourceKind === 'text' ? 'text-object' : stageClip.clip.fitMode,
  );
  const progress = getStageClipProgress(stageClip);
  const keyframeState = getVisualKeyframeStateAtProgress(stageClip.clip, progress * 100);
  const offsetX = keyframeState.positionX;
  const offsetY = keyframeState.positionY;
  const scale = getStageClipScaleFactor(stageClip);
  const width = fit.width * scale;
  const height = fit.height * scale;

  return {
    left: canvas.width / 2 - width / 2 + offsetX,
    top: canvas.height / 2 - height / 2 + offsetY,
    width,
    height,
  };
}

function getStageClipRotation(stageClip: ProgramStageClip): number {
  const progress = getStageClipProgress(stageClip);

  return getVisualKeyframeStateAtProgress(stageClip.clip, progress * 100).rotationDeg;
}

function getStageFitDimensions(
  sourceWidth: number,
  sourceHeight: number,
  canvasWidth: number,
  canvasHeight: number,
  fitMode: EditorVisualClip['fitMode'] | 'text-object',
): { width: number; height: number } {
  const safeWidth = Math.max(1, sourceWidth);
  const safeHeight = Math.max(1, sourceHeight);

  if (fitMode === 'text-object') {
    return {
      width: safeWidth,
      height: safeHeight,
    };
  }

  if (fitMode === 'stretch') {
    return {
      width: canvasWidth,
      height: canvasHeight,
    };
  }
  const scale = fitMode === 'cover'
    ? Math.max(canvasWidth / safeWidth, canvasHeight / safeHeight)
    : Math.min(canvasWidth / safeWidth, canvasHeight / safeHeight);

  return {
    width: safeWidth * scale,
    height: safeHeight * scale,
  };
}

function getStageClipSourceDimensions(
  clip: EditorVisualClip,
  item: SourceBinItem | undefined,
  asset: EditorAsset | undefined,
  itemInfo: SourceMediaInfo | undefined,
): { width: number; height: number } {
  if (clip.sourceKind === 'text') {
    return measureTextObjectBounds({
      text: clip.textContent ?? item?.text ?? asset?.textDefaults?.text ?? 'Text',
      fontSizePx: clip.textSizePx || asset?.textDefaults?.fontSizePx || 64,
      effect: clip.textEffect || asset?.textDefaults?.textEffect || 'none',
      fontFamily: clip.textFontFamily || asset?.textDefaults?.fontFamily || 'Inter, system-ui, sans-serif',
    });
  }

  return {
    width: itemInfo?.width ?? (clip.sourceKind === 'shape' ? 1280 : 1920),
    height: itemInfo?.height ?? (clip.sourceKind === 'shape' ? 720 : 1080),
  };
}

function getStageClipProgress(stageClip: ProgramStageClip): number {
  return stageClip.durationSeconds > 0
    ? Math.max(0, Math.min(1, stageClip.localTimeSeconds / Math.max(stageClip.durationSeconds, 0.001)))
    : 0;
}

function getVisualClipProgressPercent(
  clip: EditorVisualClip,
  durationSeconds: number,
  playheadSeconds: number,
): number {
  const startSeconds = clip.startMs / 1000;
  return getClipProgressPercent(startSeconds, durationSeconds, playheadSeconds);
}

function getAudioClipProgressPercent(
  clip: EditorAudioClip,
  durationSeconds: number,
  playheadSeconds: number,
): number {
  const startSeconds = clip.offsetMs / 1000;
  return getClipProgressPercent(startSeconds, durationSeconds, playheadSeconds);
}

function getClipProgressPercent(
  startSeconds: number,
  durationSeconds: number,
  playheadSeconds: number,
): number {
  const safeDurationSeconds = Math.max(0.001, durationSeconds);
  return Math.max(0, Math.min(100, ((playheadSeconds - startSeconds) / safeDurationSeconds) * 100));
}

function getStageClipScaleFactor(stageClip: ProgramStageClip): number {
  const progress = getStageClipProgress(stageClip);

  return Math.max(
    0.1,
    getVisualKeyframeStateAtProgress(stageClip.clip, progress * 100).scalePercent / 100,
  );
}

function getStageClipOpacity(stageClip: ProgramStageClip): number {
  const progress = getStageClipProgress(stageClip);

  if (stageClip.clip.keyframes?.length) {
    return getVisualKeyframeStateAtProgress(stageClip.clip, progress * 100).opacityPercent;
  }

  return getAutomationValueAtLocalTime(
    stageClip.clip.opacityAutomationPoints,
    stageClip.localTimeSeconds,
    stageClip.durationSeconds,
    stageClip.clip.opacityPercent,
  );
}

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  const element = target instanceof HTMLElement ? target : null;

  if (!element) {
    return false;
  }

  const tagName = element.tagName;
  return element.isContentEditable || tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT';
}
