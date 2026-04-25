import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { WorkspaceView } from '../types/flow';

export interface EditorWorkspaceSnapshot {
  workspaceView: WorkspaceView;
  activeSourceBinId?: string;
  activeCompositionId?: string;
  selectedSourceItemId?: string;
  selectedVisualClipId?: string;
  selectedAudioClipId?: string;
  sourceBinTab: 'media' | 'editorAssets';
  sourceMonitorVisible: boolean;
  programMonitorVisible: boolean;
  inspectorVisible: boolean;
  sourceBinVisible: boolean;
  sourceMonitorWidth: number;
  inspectorWidth: number;
  sourceBinWidth: number;
  monitorSplitPercent: number;
  monitorSectionHeight: number;
  timelineVisualTrackHeight: number;
  timelineAudioTrackHeight: number;
}

interface EditorState extends EditorWorkspaceSnapshot {
  setWorkspaceView: (view: WorkspaceView) => void;
  toggleWorkspaceView: () => void;
  setActiveSourceBinId: (id: string | undefined) => void;
  setActiveCompositionId: (id: string | undefined) => void;
  setSelectedSourceItemId: (id: string | undefined) => void;
  setSelectedVisualClipId: (id: string | undefined) => void;
  setSelectedAudioClipId: (id: string | undefined) => void;
  setSourceBinTab: (tab: 'media' | 'editorAssets') => void;
  setPanelVisibility: (
    panel: 'sourceMonitorVisible' | 'programMonitorVisible' | 'inspectorVisible' | 'sourceBinVisible',
    visible: boolean,
  ) => void;
  setPanelWidth: (panel: 'sourceMonitorWidth' | 'inspectorWidth' | 'sourceBinWidth', width: number) => void;
  setMonitorSplitPercent: (percent: number) => void;
  setMonitorSectionHeight: (height: number) => void;
  setTimelineTrackHeight: (trackType: 'visual' | 'audio', height: number) => void;
  clearTimelineSelection: () => void;
  openEditorForSourceBin: (id: string) => void;
  openEditorForComposition: (id: string) => void;
  exportWorkspaceSnapshot: () => EditorWorkspaceSnapshot;
  restoreWorkspaceSnapshot: (snapshot?: Partial<EditorWorkspaceSnapshot>) => void;
}

const DEFAULT_EDITOR_LAYOUT: Pick<
  EditorWorkspaceSnapshot,
  | 'sourceMonitorVisible'
  | 'sourceBinTab'
  | 'programMonitorVisible'
  | 'inspectorVisible'
  | 'sourceBinVisible'
  | 'sourceMonitorWidth'
  | 'inspectorWidth'
  | 'sourceBinWidth'
  | 'monitorSplitPercent'
  | 'monitorSectionHeight'
  | 'timelineVisualTrackHeight'
  | 'timelineAudioTrackHeight'
> = {
  sourceBinTab: 'media',
  sourceMonitorVisible: true,
  programMonitorVisible: true,
  inspectorVisible: true,
  sourceBinVisible: true,
  sourceMonitorWidth: 320,
  inspectorWidth: 280,
  sourceBinWidth: 300,
  monitorSplitPercent: 50,
  monitorSectionHeight: 560,
  timelineVisualTrackHeight: 84,
  timelineAudioTrackHeight: 64,
};

function clampPanelWidth(width: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(width)));
}

function clampPercent(percent: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(percent)));
}

function clampPanelHeight(height: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(height)));
}

function clampTimelineTrackHeight(height: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(height)));
}

export const useEditorStore = create<EditorState>()(
  persist(
    (set, get) => ({
      workspaceView: 'flow',
      activeSourceBinId: undefined,
      activeCompositionId: undefined,
      selectedSourceItemId: undefined,
      selectedVisualClipId: undefined,
      selectedAudioClipId: undefined,
      ...DEFAULT_EDITOR_LAYOUT,
      setWorkspaceView: (workspaceView) => set({ workspaceView }),
      toggleWorkspaceView: () =>
        set((state) => ({
          workspaceView: state.workspaceView === 'flow' ? 'editor' : 'flow',
        })),
      setActiveSourceBinId: (activeSourceBinId) => set({ activeSourceBinId }),
      setActiveCompositionId: (activeCompositionId) => set({ activeCompositionId }),
      setSelectedSourceItemId: (selectedSourceItemId) => set({ selectedSourceItemId }),
      setSelectedVisualClipId: (selectedVisualClipId) => set({ selectedVisualClipId }),
      setSelectedAudioClipId: (selectedAudioClipId) => set({ selectedAudioClipId }),
      setSourceBinTab: (sourceBinTab) => set({ sourceBinTab }),
      setPanelVisibility: (panel, visible) => set({ [panel]: visible } as Partial<EditorState>),
      setPanelWidth: (panel, width) =>
        set({
          [panel]:
            panel === 'sourceBinWidth'
              ? clampPanelWidth(width, 240, 520)
              : clampPanelWidth(width, 260, 560),
        } as Partial<EditorState>),
      setMonitorSplitPercent: (monitorSplitPercent) =>
        set({
          monitorSplitPercent: clampPercent(monitorSplitPercent, 30, 70),
        }),
      setMonitorSectionHeight: (monitorSectionHeight) =>
        set({
          monitorSectionHeight: clampPanelHeight(monitorSectionHeight, 220, 900),
        }),
      setTimelineTrackHeight: (trackType, height) =>
        set({
          [trackType === 'visual' ? 'timelineVisualTrackHeight' : 'timelineAudioTrackHeight']:
            clampTimelineTrackHeight(height, trackType === 'visual' ? 60 : 44, 220),
        } as Partial<EditorState>),
      clearTimelineSelection: () =>
        set({
          selectedVisualClipId: undefined,
          selectedAudioClipId: undefined,
        }),
      openEditorForSourceBin: (activeSourceBinId) =>
        set({
          workspaceView: 'editor',
          activeSourceBinId,
        }),
      openEditorForComposition: (activeCompositionId) =>
        set({
          workspaceView: 'editor',
          activeCompositionId,
        }),
      exportWorkspaceSnapshot: () => {
        const state = get();

        return {
          workspaceView: state.workspaceView,
          activeSourceBinId: state.activeSourceBinId,
          activeCompositionId: state.activeCompositionId,
          selectedSourceItemId: state.selectedSourceItemId,
          selectedVisualClipId: state.selectedVisualClipId,
          selectedAudioClipId: state.selectedAudioClipId,
          sourceBinTab: state.sourceBinTab,
          sourceMonitorVisible: state.sourceMonitorVisible,
          programMonitorVisible: state.programMonitorVisible,
          inspectorVisible: state.inspectorVisible,
          sourceBinVisible: state.sourceBinVisible,
          sourceMonitorWidth: state.sourceMonitorWidth,
          inspectorWidth: state.inspectorWidth,
          sourceBinWidth: state.sourceBinWidth,
          monitorSplitPercent: state.monitorSplitPercent,
          monitorSectionHeight: state.monitorSectionHeight,
          timelineVisualTrackHeight: state.timelineVisualTrackHeight,
          timelineAudioTrackHeight: state.timelineAudioTrackHeight,
        };
      },
      restoreWorkspaceSnapshot: (snapshot) =>
        set({
          workspaceView: snapshot?.workspaceView ?? 'flow',
          activeSourceBinId: snapshot?.activeSourceBinId,
          activeCompositionId: snapshot?.activeCompositionId,
          selectedSourceItemId: snapshot?.selectedSourceItemId,
          selectedVisualClipId: snapshot?.selectedVisualClipId,
          selectedAudioClipId: snapshot?.selectedAudioClipId,
          sourceBinTab: snapshot?.sourceBinTab ?? DEFAULT_EDITOR_LAYOUT.sourceBinTab,
          sourceMonitorVisible: snapshot?.sourceMonitorVisible ?? DEFAULT_EDITOR_LAYOUT.sourceMonitorVisible,
          programMonitorVisible: snapshot?.programMonitorVisible ?? DEFAULT_EDITOR_LAYOUT.programMonitorVisible,
          inspectorVisible: snapshot?.inspectorVisible ?? DEFAULT_EDITOR_LAYOUT.inspectorVisible,
          sourceBinVisible: snapshot?.sourceBinVisible ?? DEFAULT_EDITOR_LAYOUT.sourceBinVisible,
          sourceMonitorWidth: clampPanelWidth(
            snapshot?.sourceMonitorWidth ?? DEFAULT_EDITOR_LAYOUT.sourceMonitorWidth,
            260,
            560,
          ),
          inspectorWidth: clampPanelWidth(
            snapshot?.inspectorWidth ?? DEFAULT_EDITOR_LAYOUT.inspectorWidth,
            260,
            560,
          ),
          sourceBinWidth: clampPanelWidth(
            snapshot?.sourceBinWidth ?? DEFAULT_EDITOR_LAYOUT.sourceBinWidth,
            240,
            520,
          ),
          monitorSplitPercent: clampPercent(
            snapshot?.monitorSplitPercent ?? DEFAULT_EDITOR_LAYOUT.monitorSplitPercent,
            30,
            70,
          ),
          monitorSectionHeight: clampPanelHeight(
            snapshot?.monitorSectionHeight ?? DEFAULT_EDITOR_LAYOUT.monitorSectionHeight,
            220,
            900,
          ),
          timelineVisualTrackHeight: clampTimelineTrackHeight(
            snapshot?.timelineVisualTrackHeight ?? DEFAULT_EDITOR_LAYOUT.timelineVisualTrackHeight,
            60,
            220,
          ),
          timelineAudioTrackHeight: clampTimelineTrackHeight(
            snapshot?.timelineAudioTrackHeight ?? DEFAULT_EDITOR_LAYOUT.timelineAudioTrackHeight,
            44,
            220,
          ),
        }),
    }),
    {
      name: 'flow-editor-workspace',
    },
  ),
);
