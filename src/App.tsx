import {
  type Edge,
  type Connection,
  ReactFlowProvider,
  useReactFlow,
  useViewport,
} from '@xyflow/react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ChangeEvent, MouseEvent as ReactMouseEvent } from 'react';
import '@xyflow/react/dist/style.css';

import { useCatalogStore } from './store/catalogStore';
import { useSettingsStore } from './store/settingsStore';
import { useConfirmationStore } from './store/confirmationStore';
import { showAlertDialog } from './store/alertDialogStore';
import { SettingsModal } from './components/Settings/SettingsModal';
import { ConfirmationDialog } from './components/Common/ConfirmationDialog';
import { TextInputDialog } from './components/Common/TextInputDialog';
import { AlertDialog } from './components/Common/AlertDialog';
import { TopNavbar } from './components/Layout/TopNavbar';
import { CommandPalette } from './components/Common/CommandPalette';
import { ActivityTrailPanel } from './components/Common/ActivityTrailPanel';
import { GamepadInputManager } from './components/Common/GamepadInputManager';

import { TextNode as InputNode } from './components/Nodes/TextNode';
import { ImageNode } from './components/Nodes/ImageNode';
import { CropImageNode } from './components/Nodes/CropImageNode';
import { VideoNode } from './components/Nodes/VideoNode';
import { AudioNode } from './components/Nodes/AudioNode';
import { ConfigNode } from './components/Nodes/ConfigNode';
import { CompositionNode } from './components/Nodes/CompositionNode';
import { SourceBinNode } from './components/Nodes/SourceBinNode';
import { ValueNode } from './components/Nodes/ValueNode';
import { ListNode } from './components/Nodes/ListNode';
import { ExpanderNode } from './components/Nodes/ExpanderNode';
import { EnvelopeNode } from './components/Nodes/EnvelopeNode';
import { VirtualNode } from './components/Nodes/VirtualNode';
import { PortalNode } from './components/Nodes/PortalNode';
import { AdvancedImageEditorNodeComponent } from './components/Nodes/AdvancedImageEditorNode';
import { SwitchNode } from './components/Nodes/SwitchNode';
import { ForkSwitchNode } from './components/Nodes/ForkSwitchNode';
import { RunMeNode } from './components/Nodes/RunMeNode';
import { PackageNode } from './components/Nodes/PackageNode';
import { LoopNode } from './components/Nodes/LoopNode';
import { VisionVerifyNode } from './components/Nodes/VisionVerifyNode';
import { LogicNode } from './components/Nodes/LogicNode';
import { ConditionalNode } from './components/Nodes/ConditionalNode';
import { ComparisonNode } from './components/Nodes/ComparisonNode';
import { LoopGateNode } from './components/Nodes/LoopGateNode';
import { LoopBreakNode } from './components/Nodes/LoopBreakNode';
import { ListLengthNode } from './components/Nodes/ListLengthNode';
import { MathNode } from './components/Nodes/MathNode';
import { ValueMonitorNode } from './components/Nodes/ValueMonitorNode';
import { StringTemplateNode } from './components/Nodes/StringTemplateNode';
import { RegexReplaceNode } from './components/Nodes/RegexReplaceNode';
import { SwitchCaseNode } from './components/Nodes/SwitchCaseNode';
import { PromptsJoinerNode } from './components/Nodes/PromptsJoinerNode';
import { NumberNode } from './components/Nodes/NumberNode';
import { NegativePromptNode } from './components/Nodes/NegativePromptNode';
import { SeedSequencerNode } from './components/Nodes/SeedSequencerNode';
import { PromptMixerNode } from './components/Nodes/PromptMixerNode';
import { StoryStateNode } from './components/Nodes/StoryStateNode';
import { ArrayFlatNode } from './components/Nodes/ArrayFlatNode';
import { TextSentimentAnalysisNode } from './components/Nodes/TextSentimentAnalysisNode';
import { ImageFeatureExtractorNode } from './components/Nodes/ImageFeatureExtractorNode';
import { FallbackSelectorNode } from './components/Nodes/FallbackSelectorNode';
import { DialogueScriptSplitterNode } from './components/Nodes/DialogueScriptSplitterNode';
import { FunctionNode } from './components/Nodes/FunctionNode';
import { GroupNode } from './components/Nodes/GroupNode';
import { ColorSwatchNode } from './components/Nodes/ColorSwatchNode';
import { DoodleNode } from './components/Nodes/DoodleNode';
import { FunctionInputNode } from './components/Nodes/FunctionInputNode';
import { FunctionOutputNode } from './components/Nodes/FunctionOutputNode';
import { JavaScriptNode } from './components/Nodes/JavaScriptNode';
import { JsonQueryNode } from './components/Nodes/JsonQueryNode';
import { RegexParseNode } from './components/Nodes/RegexParseNode';
import { PythonNode } from './components/Nodes/PythonNode';
import { JsonBuilderNode } from './components/Nodes/JsonBuilderNode';
import { HtmlSandboxNode } from './components/Nodes/HtmlSandboxNode';
import { ApiFetchNode } from './components/Nodes/ApiFetchNode';
import { SqlQueryNode } from './components/Nodes/SqlQueryNode';
import { CsvParserNode } from './components/Nodes/CsvParserNode';
import { MathExpressionNode } from './components/Nodes/MathExpressionNode';
import { XmlYamlNode } from './components/Nodes/XmlYamlNode';
const ManualEditorWorkspace = lazy(() =>
  import('./components/Editor/ManualEditorWorkspace').then((module) => ({
    default: module.ManualEditorWorkspace,
  })),
);
const ImageEditorWorkspace = lazy(() =>
  import('./components/ImageEditor/ImageEditorWorkspace').then((module) => ({
    default: module.ImageEditorWorkspace,
  })),
);
const PaperWorkspace = lazy(() =>
  import('./components/Paper/PaperWorkspace').then((module) => ({
    default: module.PaperWorkspace,
  })),
);
import { useEditorStore } from './store/editorStore';
import { useSourceBinStore, type SourceBinLibraryItem } from './store/sourceBinStore';
import { useShallow } from 'zustand/react/shallow';
import { collectGlobalSourceBinItems } from './lib/sourceBin';
import { buildSourceBinIngestSignature } from './lib/sourceBinIngest';
import {
  isFileSystemAccessSupported,
  loadMostRecentFileSystemWorkspaceHandles,
  pickDirectory,
} from './lib/fileSystemWorkspace';
import { exportProjectAssets } from './lib/projectAssets';
import {
  buildCurrentProjectDocument,
  resetProjectDocument,
  restoreProjectDocument,
} from './lib/projectDocumentActions';
import { buildNativeSaveProjectDocument } from './lib/nativeProjectDocument';
import {
  downloadJsonFile,
  parseProjectDocument,
} from './lib/projectLibrary';
import { downloadBlob, buildWorkspaceDownloadFilename } from './shared/files/downloads';
import { registerAndroidFileOpenHandler } from './lib/androidFileOpen';
import {
  dispatchNativeRendererCommand,
  getSignalLoomNativeBridge,
  type NativeMenuCommand,
} from './lib/nativeApp';
import {
  buildFlowNodePatchForSourceBinItem,
  getFlowNodeTypeForSourceBinItem,
} from './lib/sourceBinFlowBridge';
import {
  FLOW_ORGANIZATION_RESPONSE_SCHEMA,
  applyFlowAiOrganizationPlan,
  autoOrganizeFlowSnapshot,
  buildFlowOrganizationPrompt,
  isFlowOrganizationResultNoop,
  parseFlowOrganizationPlanText,
} from './lib/flowAutoOrganize';
import { buildVertexGeminiTextRequestBody } from './lib/vertexTextRequests';
import { getVertexProjectConfig } from './lib/vertexProviderSettings';
import { getHelpSection, HELP_SECTIONS, type HelpSectionId } from './lib/helpContent';
import {
  createImageNodeTemplateDataPatch,
  listImageNodeTemplates,
} from './lib/imageNodeTemplates';
import {
  FLOW_NODE_CATALOG_CATEGORIES,
  getNodeCatalogEntriesForCategory,
} from './lib/nodeCatalog';
import { applyInterfaceTheme, buildInterfaceThemeStyle, resolveInterfaceTheme } from './lib/interfaceThemes';
import { resolveKeyboardShortcutCommand } from './lib/keyboardShortcuts';
import {
  buildCommandPaletteEntries,
  type CommandPaletteEntry,
} from './lib/commandPalette';
import {
  resolveActivityTrailCommandLabel,
  type ActivityTrailSource,
} from './lib/activityTrail';
import {
  buildNodeCenterViewportRequest,
  shouldJumpToBookmarkFromConnectorDrag,
} from './lib/flowViewportNavigation';
import {
  applySourceLibraryNativeChange,
  buildSourceLibraryNativeSyncStatus,
  shouldAcceptSourceLibraryNativeVersion,
  shouldRepairSourceLibraryNativeVersionGap,
  type SourceLibraryNativeChange,
} from './lib/sourceLibraryNativeSync';
import { buildSourceLibraryRendererItemIds } from './lib/sourceLibraryRendererState';
import {
  buildFlowWorkspaceMetricLabel,
  buildFlowWorkspaceMetricSnapshot,
  shouldShowFlowWorkspaceDiagnostics,
} from './lib/flowWorkspaceMetrics';
import { SharedWorkspaceDockablePanels } from './components/Layout/SharedWorkspaceDockablePanels';
import { SharedContextMenu } from './components/Common/SharedContextMenu';
import { DockableDialog } from './components/DockablePanel';
import { ErrorBoundary } from './components/Recovery/ErrorBoundary';
import type { AppNode, FlowNodeType, NodeData, WorkspaceView } from './types/flow';
import type { SharedContextMenuItem } from './lib/sharedContextMenu';
import { getAcceptStringForAllImportableFormats } from './lib/mediaFormatRegistry';
import { useImageEditorStore } from './store/imageEditorStore';
import { saveImageDocumentAsSlimg, openSlimgDocument } from './components/ImageEditor/ImageSlimgCodec';
import { classifyOpenedFile } from './lib/signalLoomFileRouting';
import { serializeSlppr, deserializeSlppr } from './features/paper/SlpprFormat';
import { usePaperStore } from './store/paperStore';
import { useDockablePanelStore } from './store/dockablePanelStore';
import { useFlowWorkspaceStore } from './store/flowWorkspaceStore';
import {
  ACTIVITY_TRAIL_BROADCAST_CHANNEL,
  getActivityTrailBroadcastMessage,
  useActivityTrailStore,
} from './store/activityTrailStore';
import { parseWorkspaceWindowSearch, type WorkspaceWindowView } from './lib/workspaceWindows';
import {
  getWorkspaceWindowCommandForWorkspace,
  getWorkspaceWindowSenderId,
  mergeSourceBinItemsIntoBins,
  shouldRunFlowOwnedSourceBinIngest,
  WORKSPACE_WINDOW_COMMAND_CHANNEL,
} from './lib/workspaceWindowCommands';
import { collectFlowDiagnostics } from './lib/flowDiagnostics';
import { FlowWorkspaceShell } from './features/flow/workspace/FlowWorkspaceShell';
import { useFlowCanvasDropImport } from './features/flow/workspace/useFlowCanvasDropImport';
import { useFlowDocumentStore } from './store/flow/flowDocumentStore';
import { useFlowRuntimeStore } from './store/flow/flowRuntimeStore';
import {
  resolveNextMobileChromeModeForApplicationTab,
  useMobileInterfaceStore,
} from './store/mobileInterfaceStore';
import { useMobilePhoneInterfaceDescriptor } from './lib/mobilePhoneInterface';
import { shouldShowSharedWorkspacePanels } from './lib/sharedWorkspacePanelVisibility';

import './index.css';

const SIGNAL_LOOM_PROJECT_FILE_EXTENSION = '.sloom';
const SOURCE_IMPORT_ACCEPT = getAcceptStringForAllImportableFormats();

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function stripSignalLoomProjectExtension(fileName: string): string {
  return fileName.replace(new RegExp(`${SIGNAL_LOOM_PROJECT_FILE_EXTENSION.replace('.', '\\.')}$`, 'i'), '');
}

function getDockableWorkspaceId(workspaceView: WorkspaceView): string {
  return workspaceView === 'editor' ? 'video' : workspaceView;
}

const nodeTypes = {
  textNode: InputNode,
  imageGen: ImageNode,
  cropImageNode: CropImageNode,
  videoGen: VideoNode,
  audioGen: AudioNode,
  settings: ConfigNode,
  composition: CompositionNode,
  sourceBin: SourceBinNode,
  valueNode: ValueNode,
  list: ListNode,
  expander: ExpanderNode,
  envelope: EnvelopeNode,
  virtual: VirtualNode,
  portal: PortalNode,
  advancedImageEditor: AdvancedImageEditorNodeComponent,
  switchNode: SwitchNode,
  forkSwitchNode: ForkSwitchNode,
  runMeNode: RunMeNode,
  packageNode: PackageNode,
  loopNode: LoopNode,
  visionVerifyNode: VisionVerifyNode,
  logicNode: LogicNode,
  conditionalNode: ConditionalNode,
  comparisonNode: ComparisonNode,
  loopGateNode: LoopGateNode,
  loopBreakNode: LoopBreakNode,
  listLengthNode: ListLengthNode,
  mathNode: MathNode,
  valueMonitorNode: ValueMonitorNode,
  stringTemplateNode: StringTemplateNode,
  regexReplaceNode: RegexReplaceNode,
  switchCaseNode: SwitchCaseNode,
  promptsJoinerNode: PromptsJoinerNode,
  negativePromptNode: NegativePromptNode,
  seedSequencerNode: SeedSequencerNode,
  promptMixerNode: PromptMixerNode,
  storyStateNode: StoryStateNode,
  arrayFlatNode: ArrayFlatNode,
  textSentimentAnalysisNode: TextSentimentAnalysisNode,
  imageFeatureExtractorNode: ImageFeatureExtractorNode,
  fallbackSelectorNode: FallbackSelectorNode,
  dialogueScriptSplitterNode: DialogueScriptSplitterNode,
  numberNode: NumberNode,
  colorSwatchNode: ColorSwatchNode,
  doodleNode: DoodleNode,
  functionNode: FunctionNode,
  groupNode: GroupNode,
  functionInputNode: FunctionInputNode,
  functionOutputNode: FunctionOutputNode,
  javascriptNode: JavaScriptNode,
  jsonQueryNode: JsonQueryNode,
  regexParseNode: RegexParseNode,
  pythonNode: PythonNode,
  jsonBuilderNode: JsonBuilderNode,
  htmlSandboxNode: HtmlSandboxNode,
  apiFetchNode: ApiFetchNode,
  sqlQueryNode: SqlQueryNode,
  csvParserNode: CsvParserNode,
  mathExpressionNode: MathExpressionNode,
  xmlYamlNode: XmlYamlNode,
} satisfies Record<FlowNodeType, unknown>;

function FlowApp() {
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    addNode,
    patchNodeData,
    copySelection: copyFlowSelection,
    cutSelection: cutFlowSelection,
    pasteClipboard: pasteFlowClipboard,
    deleteSelection: deleteFlowSelection,
    selectAllNodes: selectAllFlowNodes,
    deselectAll: deselectFlow,
    createGroupFromSelection,
    collapseSelectionToFunction,
    registerCenterOnNodeCallback,
    insertTemplate,
  } = useFlowRuntimeStore();
  const {
    exportProjectFlowSnapshot,
    replaceFlowSnapshot,
    removeEditorSourceReferences,
    restoreImportedAssets,
  } = useFlowDocumentStore();
  const activeFlowWorkspaceId = useFlowWorkspaceStore((state) => state.activeWorkspaceId);
  const hydratedFlowWorkspaceId = useFlowWorkspaceStore((state) => state.hydratedWorkspaceId);
  const { fitView, screenToFlowPosition, setCenter } = useReactFlow<AppNode, Edge>();
  const { zoom } = useViewport();
  const flowViewportRef = useRef<HTMLDivElement | null>(null);
  const flowWorkspaceSwitchInFlightRef = useRef(false);
  const browserProjectOpenInputRef = useRef<HTMLInputElement | null>(null);
  const browserMediaImportInputRef = useRef<HTMLInputElement | null>(null);
  const activeConnectorDragRef = useRef(false);
  const lastConnectorBookmarkNodeIdRef = useRef<string | undefined>(undefined);
  const workspaceView = useEditorStore((state) => state.workspaceView);
  const setWorkspaceView = useEditorStore((state) => state.setWorkspaceView);
  const sourceBinVisible = useEditorStore((state) => state.sourceBinVisible);
  const inspectorVisible = useEditorStore((state) => state.inspectorVisible);
  const setPanelVisibility = useEditorStore((state) => state.setPanelVisibility);
  const setSourceBinTab = useEditorStore((state) => state.setSourceBinTab);
  const setSelectedSourceItemId = useEditorStore((state) => state.setSelectedSourceItemId);
  const activeFlowSourceBinId = useEditorStore((state) => state.activeFlowSourceBinId);
  const setActiveFlowSourceBinId = useEditorStore((state) => state.setActiveFlowSourceBinId);
  const refreshCatalogs = useCatalogStore((state) => state.refreshCatalogs);
  const apiKeys = useSettingsStore((state) => state.apiKeys);
  const defaultModels = useSettingsStore((state) => state.defaultModels);
  const providerSettings = useSettingsStore((state) => state.providerSettings);
  const interfaceThemeId = useSettingsStore((state) => state.interfaceThemeId);
  const keyboardShortcuts = useSettingsStore((state) => state.keyboardShortcuts);
  const gamepadBindings = useSettingsStore((state) => state.gamepadBindings);
  const openSettings = useSettingsStore((state) => state.openSettings);
  const sourceBinItems = useSourceBinStore(useShallow((state) => state.bins.flatMap((bin) => bin.items)));
  const sourceBinIds = useSourceBinStore(useShallow((state) => state.bins.map((bin) => bin.id)));
  const sourceBins = useSourceBinStore(useShallow((state) => state.bins));
  const activeImageDocId = useImageEditorStore((state) => state.activeDocId);
  const activePaperDocumentId = usePaperStore((state) => state.document.id);
  const applyWorkspaceViewDefault = useDockablePanelStore((state) => state.applyWorkspaceViewDefault);
  const activityTrailEvents = useActivityTrailStore((state) => state.events);
  const recordActivityTrailEvent = useActivityTrailStore((state) => state.recordEvent);
  const clearActivityTrailEvents = useActivityTrailStore((state) => state.clearEvents);
  const activeCompositionId = useEditorStore((state) => state.activeCompositionId);
  const activeSourceBinId = useEditorStore((state) => state.activeSourceBinId);
  const ingestConnectedItems = useSourceBinStore((state) => state.ingestConnectedItems);
  const importFiles = useSourceBinStore((state) => state.importFiles);
  const importNativeFiles = useSourceBinStore((state) => state.importNativeFiles);
  const migrateAssetsToScratch = useSourceBinStore((state) => state.migrateAssetsToScratch);
  const sourceLibraryNativeSyncStatus = useSourceBinStore((state) => state.nativeSyncStatus);
  const setSourceBinScratchDirectoryHandle = useSourceBinStore((state) => state.setScratchDirectoryHandle);
  const nativeScratchDirectoryPath = useSourceBinStore((state) => state.nativeScratchDirectoryPath);
  const setNativeScratchDirectoryPath = useSourceBinStore((state) => state.setNativeScratchDirectoryPath);
  const connectedSourceBinItems = useMemo(
    () => collectGlobalSourceBinItems(nodes, edges),
    [edges, nodes],
  );
  const connectedSourceBinSignature = useMemo(
    () => buildSourceBinIngestSignature(connectedSourceBinItems),
    [connectedSourceBinItems],
  );
  const selectedFlowNodeCount = useMemo(
    () => nodes.filter((node) => node.selected).length,
    [nodes],
  );
  const flowDiagnostics = useMemo(
    () => collectFlowDiagnostics(nodes, edges),
    [edges, nodes],
  );
  const blockingFlowDiagnosticCount = useMemo(
    () => flowDiagnostics.filter((diagnostic) => diagnostic.blocksRun).length,
    [flowDiagnostics],
  );
  const sourceLibraryRendererItemIds = useMemo(
    () => buildSourceLibraryRendererItemIds(sourceBinItems),
    [sourceBinItems],
  );
  const flowImportTargetBinId = useMemo(() => {
    if (activeFlowSourceBinId && sourceBinIds.includes(activeFlowSourceBinId)) {
      return activeFlowSourceBinId;
    }

    return sourceBinIds[0];
  }, [activeFlowSourceBinId, sourceBinIds]);
  const interfaceTheme = useMemo(() => resolveInterfaceTheme(interfaceThemeId), [interfaceThemeId]);
  const interfaceThemeStyle = useMemo(() => buildInterfaceThemeStyle(interfaceTheme) as CSSProperties, [interfaceTheme]);
  const activeIngestSignatureRef = useRef<string | undefined>(undefined);
  const flowOrganizeCancelRef = useRef(false);
  const [nativeProjectPath, setNativeProjectPath] = useState<string | undefined>(undefined);
  const [flowContextMenu, setFlowContextMenu] = useState<{
    x: number;
    y: number;
    items: SharedContextMenuItem[];
  } | null>(null);
  const [connectorBookmarkDragActive, setConnectorBookmarkDragActive] = useState(false);
  const [librarySearchMenu, setLibrarySearchMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [activityTrailOpen, setActivityTrailOpen] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [latestFlowImportDurationMs, setLatestFlowImportDurationMs] = useState<number | undefined>(undefined);
  const [activeHelpSectionId, setActiveHelpSectionId] = useState<HelpSectionId | null>(null);
  const [startupSplash, setStartupSplash] = useState(() => ({
    visible: Boolean(getSignalLoomNativeBridge()),
    title: 'Starting Signal Loom',
    detail: 'Preparing workspace…',
  }));
  const [flowOrganizeJob, setFlowOrganizeJob] = useState<{
    snapshot: { nodes: AppNode[]; edges: Edge[] };
    title: string;
    detail: string;
  } | null>(null);
  const windowWorkspaceView = useMemo(
    () => (typeof window === 'undefined' ? undefined : parseWorkspaceWindowSearch(window.location.search)),
    [],
  );
  const workspaceWindowSenderId = useMemo(() => getWorkspaceWindowSenderId(), []);
  const sourceLibraryNativeVersionRef = useRef(0);
  const activeWorkspaceView = windowWorkspaceView ?? workspaceView;

  useEffect(() => {
    if (flowImportTargetBinId && activeFlowSourceBinId !== flowImportTargetBinId) {
      setActiveFlowSourceBinId(flowImportTargetBinId);
    }
  }, [activeFlowSourceBinId, flowImportTargetBinId, setActiveFlowSourceBinId]);
  const showFlowWorkspaceDiagnostics = useMemo(
    () => shouldShowFlowWorkspaceDiagnostics(import.meta.env.VITE_SIGNAL_LOOM_FLOW_WORKSPACE_DIAGNOSTICS),
    [],
  );
  const flowWorkspaceMetricLabel = useMemo(() => {
    if (!showFlowWorkspaceDiagnostics || activeWorkspaceView !== 'flow') {
      return undefined;
    }

    return buildFlowWorkspaceMetricLabel(buildFlowWorkspaceMetricSnapshot({
      workspaceId: 'main',
      nodeCount: nodes.length,
      edgeCount: edges.length,
      sourceItemCount: sourceBinItems.length,
      importDurationMs: latestFlowImportDurationMs,
    }));
  }, [
    activeWorkspaceView,
    edges.length,
    latestFlowImportDurationMs,
    nodes.length,
    showFlowWorkspaceDiagnostics,
    sourceBinItems.length,
  ]);
  const commandPaletteEntries = useMemo(
    () => buildCommandPaletteEntries({
      activeWorkspace: activeWorkspaceView,
      shortcuts: keyboardShortcuts,
      flowDiagnosticsCount: flowDiagnostics.length,
      flowNodeCount: nodes.length,
      canCleanFlow: activeWorkspaceView === 'flow' && nodes.length > 0 && !flowOrganizeJob,
    }),
    [activeWorkspaceView, flowDiagnostics.length, flowOrganizeJob, keyboardShortcuts, nodes.length],
  );

  const recordCommandActivity = useCallback((command: NativeMenuCommand, source: ActivityTrailSource = 'menu') => {
    recordActivityTrailEvent({
      kind: 'command',
      workspace: activeWorkspaceView,
      label: resolveActivityTrailCommandLabel(command, activeWorkspaceView, keyboardShortcuts),
      detail: command,
      command,
      source,
    });
  }, [activeWorkspaceView, keyboardShortcuts, recordActivityTrailEvent]);

  const recordPaletteActionActivity = useCallback((entry: CommandPaletteEntry) => {
    recordActivityTrailEvent({
      kind: 'app-action',
      workspace: activeWorkspaceView,
      label: entry.label,
      detail: entry.type === 'app' ? entry.action : entry.id,
      source: 'palette',
    });
  }, [activeWorkspaceView, recordActivityTrailEvent]);

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return undefined;

    const channel = new BroadcastChannel(ACTIVITY_TRAIL_BROADCAST_CHANNEL);
    channel.onmessage = (event: MessageEvent<unknown>) => {
      const message = getActivityTrailBroadcastMessage(event.data);
      if (!message) return;
      if (message.type === 'clear') {
        useActivityTrailStore.getState().clearEvents({ broadcast: false });
        return;
      }
      useActivityTrailStore.getState().mergeEvents([message.event]);
    };

    return () => channel.close();
  }, []);

  const resetSourceLibraryNativeSyncTracking = useCallback(() => {
    sourceLibraryNativeVersionRef.current = 0;
    useSourceBinStore.getState().setNativeSyncStatus({ state: 'idle' });
  }, []);

  useEffect(() => {
    const ackVersion = sourceLibraryNativeSyncStatus.lastAckVersion;
    if (
      sourceLibraryNativeSyncStatus.state === 'synced'
      && sourceLibraryNativeSyncStatus.repairDirection === 'pull-native-snapshot'
      && typeof ackVersion === 'number'
      && shouldAcceptSourceLibraryNativeVersion(sourceLibraryNativeVersionRef.current, ackVersion)
    ) {
      sourceLibraryNativeVersionRef.current = ackVersion;
    }
  }, [sourceLibraryNativeSyncStatus]);

  const getViewportCenterPosition = useCallback(() => {
    const bounds = flowViewportRef.current?.getBoundingClientRect();
    const screenPoint = bounds
      ? { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 }
      : { x: window.innerWidth / 2, y: window.innerHeight / 2 };

    return screenToFlowPosition(screenPoint);
  }, [screenToFlowPosition]);

  const handleAddNode = useCallback(
    (type: FlowNodeType, initialData?: Partial<NodeData>) => {
      addNode(type, getViewportCenterPosition(), initialData);
    },
    [addNode, getViewportCenterPosition],
  );

  const cancelFlowAutoOrganize = useCallback(() => {
    const snapshot = flowOrganizeJob?.snapshot;
    flowOrganizeCancelRef.current = true;
    if (snapshot) {
      replaceFlowSnapshot(snapshot);
    }
    setFlowOrganizeJob(null);
  }, [flowOrganizeJob, replaceFlowSnapshot]);

  const startFlowAutoOrganize = useCallback(() => {
    if (flowOrganizeJob || nodes.length === 0) {
      return;
    }

    const snapshot = exportProjectFlowSnapshot();
    const bridge = getSignalLoomNativeBridge();
    const vertexConfig = getVertexProjectConfig(providerSettings);
    const canUseVertexGemini = providerSettings.geminiCredentialMode === 'vertex-adc'
      && Boolean(vertexConfig.projectId)
      && Boolean(bridge?.generateVertexText);
    flowOrganizeCancelRef.current = false;
    setFlowOrganizeJob({
      snapshot,
      title: canUseVertexGemini ? 'Cleaning Flow workspace with Vertex Gemini' : 'Cleaning Flow workspace',
      detail: canUseVertexGemini
        ? 'Sending graph structure to Vertex Gemini...'
        : 'Vertex Gemini is not configured for this window. Using the local layout fallback...',
    });

    void (async () => {
      await delay(180);
      if (flowOrganizeCancelRef.current) return;

      let result = autoOrganizeFlowSnapshot(snapshot);

      if (canUseVertexGemini && bridge?.generateVertexText) {
        try {
          const response = await bridge.generateVertexText({
            projectId: vertexConfig.projectId,
            location: vertexConfig.location,
            auth: vertexConfig.auth,
            modelId: defaultModels.text.gemini,
            body: buildVertexGeminiTextRequestBody({
              prompt: buildFlowOrganizationPrompt(snapshot),
              responseMimeType: 'application/json',
              responseSchema: FLOW_ORGANIZATION_RESPONSE_SCHEMA,
              maxOutputTokens: 8192,
              temperature: 0.15,
            }),
          });

          if (flowOrganizeCancelRef.current) return;

          if (response.error) {
            throw new Error(response.error);
          }

          const plan = parseFlowOrganizationPlanText(response.text ?? '');
          const geminiResult = applyFlowAiOrganizationPlan(snapshot, plan);

          if (isFlowOrganizationResultNoop(geminiResult)) {
            setFlowOrganizeJob((current) => current ? {
              ...current,
              detail: 'Vertex Gemini returned a no-op layout. Applying the local fallback so the workspace visibly changes...',
            } : current);
            await delay(420);
            if (flowOrganizeCancelRef.current) return;
          } else {
            result = geminiResult;
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Vertex Gemini could not organize this workspace.';
          setFlowOrganizeJob((current) => current ? {
            ...current,
            detail: `Vertex Gemini cleanup failed. No layout changes were applied. ${message}`,
          } : current);
          await delay(1400);
          if (!flowOrganizeCancelRef.current) {
            setFlowOrganizeJob(null);
          }
          return;
        }
      }

      if (isFlowOrganizationResultNoop(result)) {
        setFlowOrganizeJob((current) => current ? {
          ...current,
          detail: 'Cleanup did not find a safer layout change to apply.',
        } : current);
        await delay(1400);
        if (!flowOrganizeCancelRef.current) {
          setFlowOrganizeJob(null);
        }
        return;
      }

      setFlowOrganizeJob((current) => current ? {
        ...current,
        detail: canUseVertexGemini
          ? result.summary.portalPairCount > 0
            ? `Applying Gemini layout and adding ${result.summary.portalPairCount} portal pair${result.summary.portalPairCount === 1 ? '' : 's'}...`
            : 'Applying Gemini workspace layout...'
          : result.summary.portalPairCount > 0
            ? `Arranging nodes and adding ${result.summary.portalPairCount} portal pair${result.summary.portalPairCount === 1 ? '' : 's'}...`
            : 'Arranging nodes into clean dependency columns...',
      } : current);

      await delay(360);
      if (flowOrganizeCancelRef.current) return;

      replaceFlowSnapshot({
        nodes: result.nodes,
        edges: result.edges,
      });
      requestAnimationFrame(() => {
        void fitView({ padding: 0.16, duration: 550 });
      });
      setFlowOrganizeJob((current) => current ? {
        ...current,
        detail: canUseVertexGemini ? 'Finishing Vertex Gemini workspace cleanup...' : 'Applying clean workspace layout...',
      } : current);

      await delay(360);
      if (flowOrganizeCancelRef.current) return;
      setFlowOrganizeJob(null);
    })();
  }, [defaultModels.text.gemini, exportProjectFlowSnapshot, fitView, flowOrganizeJob, nodes.length, providerSettings, replaceFlowSnapshot]);

  const centerNodePreservingZoom = useCallback((node: AppNode, duration = 450) => {
    const request = buildNodeCenterViewportRequest(node, zoom, duration);
    void setCenter(request.x, request.y, request.options);
  }, [setCenter, zoom]);

  const handleConnect = useCallback((connection: Connection) => {
    onConnect(connection);

    const targetNode = nodes.find((node) => node.id === connection.target);
    if (targetNode?.type !== 'portal' || targetNode.data.portalRole !== 'entry') {
      return;
    }

    const exitNode = nodes.find((node) => (
      node.type === 'portal' &&
      node.data.portalRole === 'exit' &&
      node.data.portalPairId === targetNode.data.portalPairId
    ));
    if (!exitNode) return;

    window.setTimeout(() => {
      centerNodePreservingZoom(exitNode, 350);
    }, 0);
  }, [centerNodePreservingZoom, nodes, onConnect]);

  const handleConnectStart = useCallback(() => {
    activeConnectorDragRef.current = true;
    lastConnectorBookmarkNodeIdRef.current = undefined;
    setConnectorBookmarkDragActive(true);
  }, []);

  const handleConnectEnd = useCallback(() => {
    activeConnectorDragRef.current = false;
    lastConnectorBookmarkNodeIdRef.current = undefined;
    setConnectorBookmarkDragActive(false);
  }, []);

  useEffect(() => {
    if (!flowContextMenu) {
      return;
    }

    const close = () => setFlowContextMenu(null);
    window.addEventListener('pointerdown', close);
    window.addEventListener('contextmenu', close);

    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('contextmenu', close);
    };
  }, [flowContextMenu]);

  useEffect(() => {
    applyInterfaceTheme(interfaceTheme);
  }, [interfaceTheme]);

  useEffect(() => {
    void restoreImportedAssets();
  }, [restoreImportedAssets]);

  const runPendingFlowWorkspaceSwitch = useCallback(() => {
    if (flowWorkspaceSwitchInFlightRef.current) {
      return;
    }

    const currentWorkspaceState = useFlowWorkspaceStore.getState();
    if (currentWorkspaceState.activeWorkspaceId === currentWorkspaceState.hydratedWorkspaceId) {
      return;
    }

    const nextSnapshot = currentWorkspaceState.consumePendingWorkspaceSwitch(
      exportProjectFlowSnapshot(),
    );
    if (!nextSnapshot) {
      return;
    }

    flowWorkspaceSwitchInFlightRef.current = true;
    replaceFlowSnapshot(nextSnapshot);
    void restoreImportedAssets().finally(() => {
      flowWorkspaceSwitchInFlightRef.current = false;
    });
  }, [exportProjectFlowSnapshot, replaceFlowSnapshot, restoreImportedAssets]);

  useEffect(() => {
    runPendingFlowWorkspaceSwitch();
  }, [activeFlowWorkspaceId, hydratedFlowWorkspaceId, runPendingFlowWorkspaceSwitch]);

  const ensureFlowTargetWorkspaceHydrated = useCallback(async (targetFlowWorkspaceId?: string) => {
    const flowWorkspaceState = useFlowWorkspaceStore.getState();
    const resolvedTargetFlowWorkspaceId = targetFlowWorkspaceId ?? flowWorkspaceState.activeWorkspaceId;
    if (!resolvedTargetFlowWorkspaceId) {
      return;
    }

    if (!flowWorkspaceState.getWorkspace(resolvedTargetFlowWorkspaceId)) {
      return;
    }

    if (
      flowWorkspaceState.activeWorkspaceId === resolvedTargetFlowWorkspaceId &&
      flowWorkspaceState.hydratedWorkspaceId === resolvedTargetFlowWorkspaceId
    ) {
      return;
    }

    if (flowWorkspaceState.activeWorkspaceId !== resolvedTargetFlowWorkspaceId) {
      flowWorkspaceState.setActiveWorkspaceId(resolvedTargetFlowWorkspaceId);
    }

    runPendingFlowWorkspaceSwitch();

    const timeoutAt = Date.now() + 2500;
    while (Date.now() < timeoutAt) {
      const latestWorkspaceState = useFlowWorkspaceStore.getState();
      if (
        latestWorkspaceState.activeWorkspaceId === resolvedTargetFlowWorkspaceId
        && latestWorkspaceState.hydratedWorkspaceId === resolvedTargetFlowWorkspaceId
      ) {
        return;
      }
      await delay(16);
    }
  }, [runPendingFlowWorkspaceSwitch]);

  const mergeCommandSourceBinItems = useCallback((items: SourceBinLibraryItem[], targetBinId?: string) => {
    let changed = false;

    useSourceBinStore.setState((state) => {
      const bins = mergeSourceBinItemsIntoBins(state.bins, items, targetBinId);
      if (bins === state.bins) {
        return {};
      }

      changed = true;
      return { bins };
    });

    if (changed) {
      void useSourceBinStore.getState().hydrateAssets();
    }
  }, []);

  const applySourceLibraryChangeToRenderer = useCallback((
    change: SourceLibraryNativeChange,
    nativeVersion?: number,
    options: { repairVersionGaps?: boolean } = {},
  ) => {
    if (nativeVersion !== undefined) {
      if (!shouldAcceptSourceLibraryNativeVersion(sourceLibraryNativeVersionRef.current, nativeVersion)) {
        return;
      }

      if (options.repairVersionGaps !== false && shouldRepairSourceLibraryNativeVersionGap(sourceLibraryNativeVersionRef.current, nativeVersion)) {
        const bridge = getSignalLoomNativeBridge();
        if (!bridge?.getSourceLibrarySnapshot) {
          useSourceBinStore.getState().setNativeSyncStatus(buildSourceLibraryNativeSyncStatus('degraded', {
            expectedNativeVersion: nativeVersion,
            message: 'Native Source Library version gap detected, but snapshot repair is unavailable.',
            repairDirection: 'pull-native-snapshot',
          }));
          return;
        }

        useSourceBinStore.getState().setNativeSyncStatus(buildSourceLibraryNativeSyncStatus('repairing', {
          expectedNativeVersion: nativeVersion,
          message: 'Repairing Source Library after missed native updates.',
          repairDirection: 'pull-native-snapshot',
        }));

        void bridge.getSourceLibrarySnapshot().then((result) => {
          if (
            !result?.snapshot
            || result.version < nativeVersion
            || !shouldAcceptSourceLibraryNativeVersion(sourceLibraryNativeVersionRef.current, result.version)
          ) {
            throw new Error('Native Source Library snapshot repair returned a stale or empty snapshot.');
          }

          sourceLibraryNativeVersionRef.current = result.version;
          let repaired = false;
          useSourceBinStore.setState((state) => {
            const nextState = applySourceLibraryNativeChange({
              bins: state.bins,
              dismissedSourceKeys: state.dismissedSourceKeys,
            }, {
              type: 'source-library-snapshot',
              snapshot: result.snapshot,
            });

            repaired = nextState.bins !== state.bins || nextState.dismissedSourceKeys !== state.dismissedSourceKeys;
            return repaired ? nextState : {};
          });
          if (repaired) {
            void useSourceBinStore.getState().hydrateAssets();
          }
          useSourceBinStore.getState().setNativeSyncStatus(buildSourceLibraryNativeSyncStatus('synced', {
            lastAckVersion: result.version,
            message: 'Source Library repaired from a native snapshot.',
          }));
        }).catch((error) => {
          useSourceBinStore.getState().setNativeSyncStatus(buildSourceLibraryNativeSyncStatus('degraded', {
            error,
            expectedNativeVersion: nativeVersion,
            repairDirection: 'pull-native-snapshot',
          }));
        });
        return;
      }

      sourceLibraryNativeVersionRef.current = nativeVersion;
    }

    let changed = false;

    useSourceBinStore.setState((state) => {
      const nextState = applySourceLibraryNativeChange({
        bins: state.bins,
        dismissedSourceKeys: state.dismissedSourceKeys,
      }, change);

      changed = nextState.bins !== state.bins || nextState.dismissedSourceKeys !== state.dismissedSourceKeys;
      return changed ? nextState : {};
    });

    if (changed && (change.type === 'source-bin-items-added' || change.type === 'source-library-snapshot')) {
      void useSourceBinStore.getState().hydrateAssets();
    }

    if (change.type === 'source-bin-item-removed') {
      removeEditorSourceReferences(change.itemId);
    }
  }, [removeEditorSourceReferences]);

  useEffect(() => {
    const bridge = getSignalLoomNativeBridge();
    if (!bridge?.getSourceLibrarySnapshot) {
      return undefined;
    }

    let cancelled = false;
    // Install the listener before requesting the snapshot so a workspace opened
    // during native Source Library churn cannot miss an update between the two.
    const removeListener = bridge.onSourceLibraryChanged?.((event) => {
      if (!event?.change) {
        return;
      }

      applySourceLibraryChangeToRenderer(event.change, event.version);
    });

    void bridge.getSourceLibrarySnapshot().then((result) => {
      if (cancelled || !result?.snapshot || result.version <= 0) {
        return;
      }

      applySourceLibraryChangeToRenderer({
        type: 'source-library-snapshot',
        snapshot: result.snapshot,
      }, result.version);
    }).catch(() => undefined);

    return () => {
      cancelled = true;
      removeListener?.();
    };
  }, [applySourceLibraryChangeToRenderer]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const globalWindow = window as Window & { SIGNAL_LOOM_ENABLE_AUTOMATION_PATHS?: unknown };
    if (globalWindow.SIGNAL_LOOM_ENABLE_AUTOMATION_PATHS !== '1') {
      return undefined;
    }

    const automationBridge = globalWindow.signalLoomAutomation ?? {};
    automationBridge.applySourceLibraryChange = async (change) => {
      applySourceLibraryChangeToRenderer(change, undefined, { repairVersionGaps: false });
      const bridge = getSignalLoomNativeBridge();
      if (!bridge?.applySourceLibraryChange) {
        return { error: 'native bridge missing' };
      }
      return bridge.applySourceLibraryChange(change);
    };
    globalWindow.signalLoomAutomation = automationBridge;

    return () => {
      const existingAutomationBridge = globalWindow.signalLoomAutomation;
      if (
        existingAutomationBridge
        && existingAutomationBridge.applySourceLibraryChange === automationBridge.applySourceLibraryChange
      ) {
        delete existingAutomationBridge.applySourceLibraryChange;
      }
      if (existingAutomationBridge && Object.keys(existingAutomationBridge).length === 0) {
        delete globalWindow.signalLoomAutomation;
      }
    };
  }, [applySourceLibraryChangeToRenderer]);

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return undefined;

    const channel = new BroadcastChannel(WORKSPACE_WINDOW_COMMAND_CHANNEL);
    channel.onmessage = (event: MessageEvent) => {
      const command = getWorkspaceWindowCommandForWorkspace(
        event.data,
        workspaceWindowSenderId,
        activeWorkspaceView,
      );
      if (!command) return;

      switch (command.type) {
        case 'source-bin-items-added':
          applySourceLibraryChangeToRenderer(command);
          return;
        case 'source-bin-item-renamed':
          applySourceLibraryChangeToRenderer(command);
          return;
        case 'source-bin-item-removed':
          applySourceLibraryChangeToRenderer(command);
          return;
        case 'flow-create-source-node': {
          void ensureFlowTargetWorkspaceHydrated(command.targetFlowWorkspaceId).then(() => {
            mergeCommandSourceBinItems([command.item], command.targetBinId);
            const nodeId = addNode(getFlowNodeTypeForSourceBinItem(command.item), getViewportCenterPosition());
            patchNodeData(nodeId, buildFlowNodePatchForSourceBinItem(command.item));
            recordActivityTrailEvent({
              kind: 'workspace',
              workspace: 'flow',
              label: 'Create Flow source node',
              detail: getFlowNodeTypeForSourceBinItem(command.item),
              source: 'system',
            });
          });
          return;
        }
        case 'video-select-source-item':
          mergeCommandSourceBinItems([command.item]);
          setSelectedSourceItemId(command.item.id);
          setSourceBinTab('editorAssets');
          return;
      }
    };

    return () => {
      channel.close();
    };
  }, [
    ensureFlowTargetWorkspaceHydrated,
    activeWorkspaceView,
    addNode,
    applySourceLibraryChangeToRenderer,
    getViewportCenterPosition,
    mergeCommandSourceBinItems,
    patchNodeData,
    recordActivityTrailEvent,
    setSelectedSourceItemId,
    setSourceBinTab,
    activeFlowWorkspaceId,
    workspaceWindowSenderId,
  ]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const currentSourceBinState = useSourceBinStore.getState();

      if (!currentSourceBinState.scratchDirectoryHandle) {
        const handles = await loadMostRecentFileSystemWorkspaceHandles().catch(() => undefined);

        if (!cancelled && handles?.scratchDirectoryHandle) {
          setSourceBinScratchDirectoryHandle(handles.scratchDirectoryHandle);
        }
      }

      if (!cancelled) {
        await useSourceBinStore.getState().hydrateAssets();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [setSourceBinScratchDirectoryHandle]);

  useEffect(() => {
    if (!shouldRunFlowOwnedSourceBinIngest(activeWorkspaceView)) {
      return;
    }

    if (!connectedSourceBinSignature || connectedSourceBinItems.length === 0) {
      return;
    }

    if (activeIngestSignatureRef.current === connectedSourceBinSignature) {
      return;
    }

    activeIngestSignatureRef.current = connectedSourceBinSignature;
    void ingestConnectedItems(connectedSourceBinItems, flowImportTargetBinId).finally(() => {
      if (activeIngestSignatureRef.current === connectedSourceBinSignature) {
        activeIngestSignatureRef.current = undefined;
      }
    });
  }, [
    activeWorkspaceView,
    connectedSourceBinItems,
    connectedSourceBinSignature,
    flowImportTargetBinId,
    ingestConnectedItems,
  ]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void refreshCatalogs({
        apiKeys,
        defaultModels,
        providerSettings,
      });
    }, 600);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [apiKeys, defaultModels, providerSettings, refreshCatalogs]);

  const getNativeProjectName = useCallback(() => {
    const fileName = nativeProjectPath?.split(/[\\/]/).pop();

    if (!fileName) {
      return undefined;
    }

    return stripSignalLoomProjectExtension(fileName);
  }, [nativeProjectPath]);

  const getProjectExportFileName = useCallback(() => {
    return `${getNativeProjectName() ?? 'signal-loom-project'}${SIGNAL_LOOM_PROJECT_FILE_EXTENSION}`;
  }, [getNativeProjectName]);

  const downloadCurrentProjectDocument = useCallback(async () => {
    const document = await buildCurrentProjectDocument({
      name: getNativeProjectName(),
      includeAssetData: true,
    });

    downloadJsonFile(getProjectExportFileName(), document);
  }, [getNativeProjectName, getProjectExportFileName]);

  const openWorkspaceView = useCallback(async (targetWorkspace: WorkspaceWindowView) => {
    const bridge = getSignalLoomNativeBridge();

    if (bridge?.openWorkspaceWindow) {
      await bridge.openWorkspaceWindow(targetWorkspace);
      return;
    }

    setWorkspaceView(targetWorkspace);
  }, [setWorkspaceView]);

  const handleAppMenuCommand = useCallback(async (command: NativeMenuCommand, source: ActivityTrailSource = 'menu') => {
    recordCommandActivity(command, source);
    const bridge = getSignalLoomNativeBridge();

    switch (command) {
      case 'file:new': {
        const confirmed = await useConfirmationStore.getState().requestConfirmation(
          'Start a new blank project? Unsaved changes in the current workspace will be discarded.',
          'Start New Project'
        );
        if (!confirmed) {
          return;
        }

        resetSourceLibraryNativeSyncTracking();
        await resetProjectDocument();
        await bridge?.clearProjectPath();
        setNativeProjectPath(undefined);
        setNativeScratchDirectoryPath(undefined);
        return;
      }
      case 'file:open': {
        if (!bridge) {
          browserProjectOpenInputRef.current?.click();
          return;
        }

        try {
          const result = await bridge.openProjectFile();

          if (!result.canceled && result.document) {
            if (result.scratchDirectoryPath) {
              setNativeScratchDirectoryPath(result.scratchDirectoryPath);
            }
            resetSourceLibraryNativeSyncTracking();
            await restoreProjectDocument(result.document);
            setNativeProjectPath(result.filePath);
          }
        } catch (error) {
          await showAlertDialog({
            title: 'Open Project Failed',
            message: error instanceof Error ? error.message : 'The selected project file could not be opened.',
            tone: 'danger',
          });
        }
        return;
      }
      case 'file:save': {
        if (!bridge) {
          await downloadCurrentProjectDocument();
          return;
        }

        const document = await buildNativeSaveProjectDocument(getNativeProjectName());
        const result = await bridge.saveProjectFile(document);

        if (!result.canceled) {
          if (result.scratchDirectoryPath) {
            setNativeScratchDirectoryPath(result.scratchDirectoryPath);
          }
          if (result.document) {
            await restoreProjectDocument(result.document);
          }
          setNativeProjectPath(result.filePath);
        }
        return;
      }
      case 'file:save-as': {
        if (!bridge) {
          await downloadCurrentProjectDocument();
          return;
        }

        const document = await buildNativeSaveProjectDocument(getNativeProjectName());
        const result = await bridge.saveProjectFileAs(document);

        if (!result.canceled) {
          if (result.scratchDirectoryPath) {
            setNativeScratchDirectoryPath(result.scratchDirectoryPath);
          }
          if (result.document) {
            await restoreProjectDocument(result.document);
          }
          setNativeProjectPath(result.filePath);
        }
        return;
      }
      case 'image:file-open': {
        if (!bridge?.openImageDocumentFile) {
          // Browser / Android: no Electron file bridge — use the content-aware open picker,
          // which classifies the chosen file and routes it to the right workspace.
          browserProjectOpenInputRef.current?.click();
          return;
        }

        try {
          const result = await bridge.openImageDocumentFile();
          if (!result.canceled && result.bytes) {
            const doc = await openSlimgDocument(new Uint8Array(result.bytes));
            useImageEditorStore.getState().openDocument(doc);
          }
        } catch (error) {
          await showAlertDialog({
            title: 'Open Image Failed',
            message: error instanceof Error ? error.message : 'The selected .slimg file could not be opened.',
            tone: 'danger',
          });
        }
        return;
      }
      case 'image:file-save-as': {
        try {
          const imageState = useImageEditorStore.getState();
          const activeDoc = imageState.documents.find((doc) => doc.id === imageState.activeDocId);
          if (!activeDoc) {
            return;
          }

          const bytes = await saveImageDocumentAsSlimg(activeDoc);
          if (bridge?.saveImageDocumentFileAs) {
            await bridge.saveImageDocumentFileAs(bytes);
          } else {
            // Browser / Android: no Electron bridge — stream the .slimg to the device's
            // Downloads folder (Documents on Android via the Filesystem plugin).
            downloadBlob(
              new Blob([bytes as BlobPart], { type: 'application/octet-stream' }),
              buildWorkspaceDownloadFilename(activeDoc.title, 'slimg'),
            );
          }
        } catch (error) {
          await showAlertDialog({
            title: 'Save Image Failed',
            message: error instanceof Error ? error.message : 'The active image could not be saved as a .slimg file.',
            tone: 'danger',
          });
        }
        return;
      }
      case 'paper:file-open': {
        if (!bridge?.openPaperDocumentFile) {
          // Browser / Android: no Electron file bridge — use the content-aware open picker,
          // which classifies the chosen file and routes it to the right workspace.
          browserProjectOpenInputRef.current?.click();
          return;
        }

        try {
          const result = await bridge.openPaperDocumentFile();
          if (!result.canceled && result.bytes) {
            const doc = deserializeSlppr(new Uint8Array(result.bytes));
            // Route through importDocumentJson so the loaded layout passes the same
            // parse/sanitize validation as the Paper JSON import path.
            usePaperStore.getState().importDocumentJson(JSON.stringify(doc));
          }
        } catch (error) {
          await showAlertDialog({
            title: 'Open Paper Failed',
            message: error instanceof Error ? error.message : 'The selected .slppr file could not be opened.',
            tone: 'danger',
          });
        }
        return;
      }
      case 'paper:file-save-as': {
        try {
          const paperDocument = usePaperStore.getState().document;
          const bytes = serializeSlppr(paperDocument);
          if (bridge?.savePaperDocumentFileAs) {
            await bridge.savePaperDocumentFileAs(bytes);
          } else {
            // Browser / Android: no Electron bridge — stream the .slppr to the device's
            // Downloads folder (Documents on Android via the Filesystem plugin).
            downloadBlob(
              new Blob([bytes as BlobPart], { type: 'application/octet-stream' }),
              buildWorkspaceDownloadFilename(paperDocument.title, 'slppr'),
            );
          }
        } catch (error) {
          await showAlertDialog({
            title: 'Save Paper Failed',
            message: error instanceof Error ? error.message : 'The active layout could not be saved as a .slppr file.',
            tone: 'danger',
          });
        }
        return;
      }
      case 'file:import-media': {
        if (!bridge) {
          browserMediaImportInputRef.current?.click();
          return;
        }

        const result = await bridge.importMediaFiles({
          scratchDirectoryPath: nativeScratchDirectoryPath,
        });

        if (!result.canceled && result.items.length > 0) {
          await importNativeFiles(result.items, flowImportTargetBinId);
          setPanelVisibility('sourceBinVisible', true);
        }
        return;
      }
      case 'file:set-scratch-folder': {
        if (!bridge) {
          if (!isFileSystemAccessSupported()) {
            await showAlertDialog({
              title: 'Scratch Folder Unavailable',
              message: 'This browser does not support choosing local scratch folders.',
              tone: 'warning',
            });
            return;
          }

          const scratchDirectoryHandle = await pickDirectory();
          await migrateAssetsToScratch(scratchDirectoryHandle);
          setPanelVisibility('sourceBinVisible', true);
          return;
        }

        const result = await bridge.chooseScratchDirectory();

        if (!result.canceled && result.directoryPath) {
          setNativeScratchDirectoryPath(result.directoryPath);
          setPanelVisibility('sourceBinVisible', true);
        }
        return;
      }
      case 'file:export-project': {
        const document = await buildCurrentProjectDocument({
          name: getNativeProjectName(),
          includeAssetData: true,
        });

        if (bridge) {
          await bridge.saveProjectFileAs(document);
        } else {
          downloadJsonFile(getProjectExportFileName(), document);
        }
        return;
      }
      case 'file:export-assets': {
        await exportProjectAssets(nodes);
        return;
      }
      case 'settings:keyboard-shortcuts':
        openSettings('keyboard');
        return;
      case 'settings:gamepad-bindings':
        openSettings('gamepad');
        return;
      case 'view:flow':
        await openWorkspaceView('flow');
        return;
      case 'view:editor':
        await openWorkspaceView('editor');
        return;
      case 'view:image':
        await openWorkspaceView('image');
        return;
      case 'view:paper':
        await openWorkspaceView('paper');
        return;
      case 'view:toggle-interface': {
        const mobileInterface = useMobileInterfaceStore.getState();
        const nextMode = resolveNextMobileChromeModeForApplicationTab(mobileInterface.chromeMode);
        if (nextMode === 'hidden') {
          mobileInterface.hideInterface();
        } else {
          mobileInterface.restoreInterface();
        }
        return;
      }
      case 'view:command-palette':
        setCommandPaletteOpen(true);
        return;
      case 'view:activity-trail':
        setActivityTrailOpen(true);
        return;
      case 'view:toggle-source-bin': {
        if (activeWorkspaceView === 'editor') {
          setPanelVisibility('sourceBinVisible', !sourceBinVisible);
        } else {
          const workspaceId = getDockableWorkspaceId(activeWorkspaceView);
          const layout = useDockablePanelStore.getState().layouts[`${workspaceId}/source-bin`];
          if (layout) {
            useDockablePanelStore.getState().setPanelMode(workspaceId, 'source-bin', layout.mode === 'hidden' ? 'docked' : 'hidden');
          }
        }
        return;
      }
      case 'view:toggle-inspector': {
        if (activeWorkspaceView === 'editor') {
          setPanelVisibility('inspectorVisible', !inspectorVisible);
        } else {
          const workspaceId = getDockableWorkspaceId(activeWorkspaceView);
          const layout = useDockablePanelStore.getState().layouts[`${workspaceId}/inspector`];
          if (layout) {
            useDockablePanelStore.getState().setPanelMode(workspaceId, 'inspector', layout.mode === 'hidden' ? 'docked' : 'hidden');
          }
        }
        return;
      }
      case 'view:layout-reset':
        applyWorkspaceViewDefault(getDockableWorkspaceId(activeWorkspaceView), 'reset');
        return;
      case 'view:layout-balanced':
        applyWorkspaceViewDefault(getDockableWorkspaceId(activeWorkspaceView), 'balanced');
        return;
      case 'view:layout-focus':
        applyWorkspaceViewDefault(getDockableWorkspaceId(activeWorkspaceView), 'focus');
        return;
      case 'view:layout-all-panels':
        applyWorkspaceViewDefault(getDockableWorkspaceId(activeWorkspaceView), 'all-panels');
        return;
      case 'help:about':
        if (bridge) {
          await bridge.showAbout();
        } else {
          await showAlertDialog({
            title: 'Signal Loom',
            message: 'Generative AI media flow builder and timeline editor.',
            tone: 'info',
          });
        }
        return;
      case 'help:project-documentation':
        setActiveHelpSectionId('project-documentation');
        return;
      case 'help:tutorial':
        setActiveHelpSectionId('tutorial');
        return;
      case 'help:feature-help':
        setActiveHelpSectionId('feature-help');
        return;
      case 'help:keyboard-shortcuts':
        setActiveHelpSectionId('keyboard-shortcuts');
        return;
      case 'flow:add-source-bin':
        handleAddNode('sourceBin');
        return;
      case 'edit:copy':
        if (activeWorkspaceView === 'flow') {
          copyFlowSelection();
          return;
        }
        dispatchNativeRendererCommand(command);
        return;
      case 'edit:cut':
        if (activeWorkspaceView === 'flow') {
          await cutFlowSelection();
          return;
        }
        dispatchNativeRendererCommand(command);
        return;
      case 'edit:paste':
        if (activeWorkspaceView === 'flow') {
          pasteFlowClipboard(getViewportCenterPosition());
          return;
        }
        dispatchNativeRendererCommand(command);
        return;
      case 'edit:delete':
        if (activeWorkspaceView === 'flow') {
          await deleteFlowSelection();
          return;
        }
        dispatchNativeRendererCommand(command);
        return;
      case 'edit:select-all':
        if (activeWorkspaceView === 'flow') {
          selectAllFlowNodes();
          return;
        }
        dispatchNativeRendererCommand(command);
        return;
      case 'edit:deselect':
        if (activeWorkspaceView === 'flow') {
          deselectFlow();
          return;
        }
        dispatchNativeRendererCommand(command);
        return;
      case 'edit:undo':
      case 'edit:redo':
      case 'edit:invert-selection':
      case 'image:tool-hand':
      case 'image:tool-text':
      case 'image:tool-move':
      case 'image:tool-marquee':
      case 'image:tool-lasso':
      case 'image:tool-magic-wand':
      case 'image:tool-brush':
      case 'image:tool-pen':
      case 'image:tool-eraser':
      case 'image:tool-background-eraser':
      case 'image:tool-magic-eraser':
      case 'image:tool-clone-stamp':
      case 'image:tool-spot-heal':
      case 'image:tool-blur-brush':
      case 'image:tool-sharpen-brush':
      case 'image:tool-smudge-brush':
      case 'image:tool-dodge-brush':
      case 'image:tool-burn-brush':
      case 'image:tool-sponge-saturate':
      case 'image:tool-sponge-desaturate':
      case 'image:tool-paint-bucket':
      case 'image:tool-gradient':
      case 'image:tool-rectangle-shape':
      case 'image:tool-ellipse-shape':
      case 'image:tool-crop':
      case 'image:tool-eyedropper':
      case 'image:export-visible':
      case 'image:export-psd':
      case 'image:adjust-brightness-contrast':
      case 'image:adjust-levels':
      case 'image:adjust-curves':
      case 'image:adjust-hue-saturation':
      case 'image:adjust-black-white':
      case 'image:adjust-exposure':
      case 'image:adjust-temperature-tint':
      case 'image:adjust-invert':
      case 'image:toggle-tools-panel':
      case 'image:toggle-brushes-panel':
      case 'image:toggle-layers-panel':
      case 'image:toggle-channels-panel':
      case 'image:toggle-paths-panel':
      case 'image:toggle-properties-panel':
      case 'image:toggle-history-panel':
      case 'image:toggle-assets-panel':
      case 'image:reset-panels':
      case 'timeline:select':
      case 'timeline:cut':
      case 'timeline:slip':
      case 'timeline:hand':
      case 'timeline:snap':
      case 'timeline:add-keyframe':
      case 'timeline:previous-keyframe':
      case 'timeline:next-keyframe':
      case 'paper:tool-select':
      case 'paper:tool-hand':
      case 'paper:tool-text':
      case 'paper:tool-image':
      case 'paper:new-document':
      case 'paper:add-page':
      case 'paper:export-pdf':
      case 'paper:export-kdp-assets':
      case 'paper:export-reader-spreads-pdf':
      case 'paper:export-booklet-proof-pdf':
      case 'paper:export-webcomic-images':
      case 'paper:export-html':
      case 'paper:export-reader-spreads-html':
      case 'paper:export-booklet-proof-html':
      case 'paper:package-print':
      case 'paper:export-idml':
      case 'paper:export-stories-txt':
      case 'paper:export-stories-html':
      case 'paper:export-stories-rtf':
      case 'paper:export-stories-docx':
      case 'paper:export-cbz':
      case 'paper:export-json':
      case 'paper:import-json':
      case 'paper:add-text-frame':
      case 'paper:add-image-frame':
      case 'paper:add-speech-bubble':
      case 'paper:add-thought-bubble':
      case 'paper:add-caption':
      case 'paper:toggle-rulers':
      case 'paper:toggle-guides':
      case 'paper:toggle-grid':
      case 'paper:toggle-snap-to-guides':
      case 'paper:toggle-snap-to-grid':
      case 'paper:toggle-spreads':
      case 'paper:toggle-start-on-right':
      case 'paper:toggle-tools-panel':
      case 'paper:toggle-document-strip-panel':
      case 'paper:toggle-inspector-panel':
      case 'paper:toggle-preflight-panel':
      case 'paper:toggle-linked-assets-panel':
      case 'paper:toggle-dtp-parity-panel':
      case 'paper:reset-panels':
        dispatchNativeRendererCommand(command);
        return;
    }
  }, [
    downloadCurrentProjectDocument,
    copyFlowSelection,
    cutFlowSelection,
    deleteFlowSelection,
    deselectFlow,
    getProjectExportFileName,
    getNativeProjectName,
    getViewportCenterPosition,
    handleAddNode,
    flowImportTargetBinId,
    applyWorkspaceViewDefault,
    activeWorkspaceView,
    importNativeFiles,
    inspectorVisible,
    migrateAssetsToScratch,
    nativeScratchDirectoryPath,
    openSettings,
    openWorkspaceView,
    pasteFlowClipboard,
    resetSourceLibraryNativeSyncTracking,
    recordCommandActivity,
    selectAllFlowNodes,
    setNativeScratchDirectoryPath,
    setPanelVisibility,
    sourceBinVisible,
    nodes,
  ]);

  const handleAppMenuCommandRef = useRef(handleAppMenuCommand);

  useEffect(() => {
    handleAppMenuCommandRef.current = handleAppMenuCommand;
  }, [handleAppMenuCommand]);

  const runCommandPaletteEntry = useCallback(async (entry: CommandPaletteEntry) => {
    setCommandPaletteOpen(false);

    if (entry.type === 'menu') {
      await handleAppMenuCommand(entry.command, 'palette');
      return;
    }

    recordPaletteActionActivity(entry);

    switch (entry.action) {
      case 'app:open-provider-settings':
        openSettings('providers');
        return;
      case 'app:open-flow-diagnostics':
        if (activeWorkspaceView !== 'flow') {
          await openWorkspaceView('flow');
        }
        setDiagnosticsOpen(true);
        return;
      case 'app:clean-flow':
        if (activeWorkspaceView === 'flow') {
          startFlowAutoOrganize();
        }
        return;
    }
  }, [
    activeWorkspaceView,
    handleAppMenuCommand,
    openSettings,
    openWorkspaceView,
    recordPaletteActionActivity,
    startFlowAutoOrganize,
  ]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const command = resolveKeyboardShortcutCommand(event, activeWorkspaceView, keyboardShortcuts);
      if (!command) return;
      event.preventDefault();
      event.stopPropagation();
      void handleAppMenuCommand(command, 'keyboard');
    };

    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [activeWorkspaceView, handleAppMenuCommand, keyboardShortcuts]);

  const openSignalLoomFileBytes = useCallback(async (bytes: Uint8Array, fileName: string) => {
    // Route by the file's real content, not just its name — OS pickers (esp. Android) and
    // file-manager "open with" intents ignore extension filters, so a `.slimg`/`.slppr` (ZIP
    // container) can arrive here. Without this the project opener JSON.parses the ZIP and throws
    // "Unexpected token 'P', \"PK\"...".
    const kind = classifyOpenedFile(bytes, fileName);

    if (kind === 'image') {
      const doc = await openSlimgDocument(bytes);
      useImageEditorStore.getState().openDocument(doc);
      setWorkspaceView('image');
      return;
    }
    if (kind === 'paper') {
      const doc = deserializeSlppr(bytes);
      usePaperStore.getState().importDocumentJson(JSON.stringify(doc));
      setWorkspaceView('paper');
      return;
    }
    if (kind === 'unknown') {
      throw new Error('This file is not a Signal Loom project (.sloom), image (.slimg), or layout (.slppr).');
    }

    const document = await parseProjectDocument(new File([bytes as BlobPart], fileName));
    resetSourceLibraryNativeSyncTracking();
    await restoreProjectDocument(document);
    setNativeProjectPath(undefined);
  }, [resetSourceLibraryNativeSyncTracking, setWorkspaceView]);

  const handleBrowserProjectFileChange = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';

    if (!file) {
      return;
    }

    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      await openSignalLoomFileBytes(bytes, file.name);
    } catch (error) {
      await showAlertDialog({
        title: 'Open Failed',
        message: error instanceof Error ? error.message : 'The selected file could not be opened.',
        tone: 'danger',
      });
    }
  }, [openSignalLoomFileBytes]);

  // Android: open Signal Loom files tapped in a file manager / "Open with" (ACTION_VIEW intent).
  useEffect(() => {
    return registerAndroidFileOpenHandler(async ({ bytes, fileName }) => {
      try {
        await openSignalLoomFileBytes(bytes, fileName);
      } catch (error) {
        await showAlertDialog({
          title: 'Open Failed',
          message: error instanceof Error ? error.message : 'The opened file could not be loaded.',
          tone: 'danger',
        });
      }
    });
  }, [openSignalLoomFileBytes]);

  const handleBrowserMediaImportChange = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = '';

    if (files.length === 0) {
      return;
    }

    await importFiles(files, flowImportTargetBinId);
    setPanelVisibility('sourceBinVisible', true);
  }, [flowImportTargetBinId, importFiles, setPanelVisibility]);

  useEffect(() => {
    const bridge = getSignalLoomNativeBridge();

    if (!bridge) {
      return;
    }

    let cancelled = false;
    const nativeStatePromise = bridge.getNativeState();
    const nativeStateTimeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Timeout retrieving native state from helper.')), 4000)
    );

    void Promise.race([nativeStatePromise, nativeStateTimeoutPromise])
      .then(async (state) => {
        if (!cancelled) {
          setStartupSplash({
            visible: true,
            title: state.startupProject?.document ? 'Opening Project' : 'Starting New Project',
            detail: state.startupProject?.filePath
              ? `Loading ${state.startupProject.filePath.split(/[\\/]/).pop()}…`
              : 'Preparing a clean workspace…',
          });
          setNativeProjectPath(state.currentProjectPath);
          setNativeScratchDirectoryPath(state.currentScratchDirectoryPath);
          if (state.startupProject?.document) {
            if (state.startupProject.scratchDirectoryPath) {
              setNativeScratchDirectoryPath(state.startupProject.scratchDirectoryPath);
            }
            await restoreProjectDocument(state.startupProject.document);
            if (!cancelled) {
              setNativeProjectPath(state.startupProject.filePath);
            }
          } else if (!state.currentProjectPath && (!windowWorkspaceView || windowWorkspaceView === 'flow')) {
            await resetProjectDocument();
            if (!cancelled) {
              setNativeProjectPath(undefined);
              setNativeScratchDirectoryPath(undefined);
              setWorkspaceView(windowWorkspaceView ?? 'flow');
            }
          }
          if (!windowWorkspaceView && state.workspace) {
            setWorkspaceView(state.workspace);
          }
        }
      }).catch((error) => {
        const message = error instanceof Error ? error.message : 'Signal Loom could not finish startup.';
        console.error(message);
      }).finally(() => {
        if (!cancelled) {
          setStartupSplash((current) => ({ ...current, visible: false }));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [setNativeScratchDirectoryPath, setWorkspaceView, windowWorkspaceView]);

  useEffect(() => {
    const bridge = getSignalLoomNativeBridge();

    if (!bridge) {
      return;
    }

    const removeMenuListener = bridge.onMenuCommand((command) => {
      void handleAppMenuCommandRef.current(command, 'native-menu');
    });
    const removeProjectPathListener = bridge.onProjectPathChanged((filePath) => {
      setNativeProjectPath(filePath);
    });

    return () => {
      removeMenuListener();
      removeProjectPathListener();
    };
  }, []);

  useEffect(() => {
    const bridge = getSignalLoomNativeBridge();
    if (!bridge) return;
    void bridge.setActiveWorkspace(activeWorkspaceView);
  }, [activeWorkspaceView]);

  useEffect(() => {
    if (!windowWorkspaceView) return;
    setWorkspaceView(windowWorkspaceView);
  }, [setWorkspaceView, windowWorkspaceView]);

  useEffect(() => {
    const bridge = getSignalLoomNativeBridge();
    if (!bridge?.setKeyboardShortcuts) return;
    void bridge.setKeyboardShortcuts(keyboardShortcuts);
  }, [keyboardShortcuts]);

  const placeSourceBinItemOnFlow = useCallback((item: SourceBinLibraryItem, position: { x: number; y: number }) => {
    const type = getFlowNodeTypeForSourceBinItem(item);
    const nodeId = addNode(type, position);
    patchNodeData(nodeId, buildFlowNodePatchForSourceBinItem(item));
    recordActivityTrailEvent({
      kind: 'workspace',
      workspace: 'flow',
      label: 'Place Source Library asset',
      detail: type,
      source: 'system',
    });
  }, [addNode, patchNodeData, recordActivityTrailEvent]);

  const { handleDrop, handleDragOver } = useFlowCanvasDropImport({
    importFiles,
    onPlaceSourceBinItem: placeSourceBinItemOnFlow,
    onSetLatestImportDuration: setLatestFlowImportDurationMs,
    onShowSourceBin: () => setPanelVisibility('sourceBinVisible', true),
    screenToFlowPosition,
    sourceBinTargetId: flowImportTargetBinId,
    sourceBinItems,
  });

  const handlePaneClick = useCallback((event: ReactMouseEvent) => {
    if (event.button === 1) {
      // Middle click
      event.preventDefault();
      setLibrarySearchMenu({
        x: event.clientX,
        y: event.clientY,
      });
      return;
    }
    setFlowContextMenu(null);
    setLibrarySearchMenu(null);
  }, []);

  const handlePaneContextMenu = useCallback((event: MouseEvent | ReactMouseEvent<Element, MouseEvent>) => {
    event.preventDefault();
    event.stopPropagation();
    
    // Close other menus
    setLibrarySearchMenu(null);

    const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    const imageTemplates = listImageNodeTemplates();
    const createNodeAction = (type: FlowNodeType, initialData?: Partial<NodeData>) => () => {
      addNode(type, position, initialData);
      recordActivityTrailEvent({
        kind: 'workspace',
        workspace: 'flow',
        label: 'Add Flow node',
        detail: type,
        source: 'menu',
      });
    };
    const nodeCatalogItems: SharedContextMenuItem[] = FLOW_NODE_CATALOG_CATEGORIES.map((category) => {
      const children: SharedContextMenuItem[] = getNodeCatalogEntriesForCategory(category.id).map((entry) => ({
        id: `add-${entry.type}`,
        label: `Add ${entry.label}`,
        action: createNodeAction(entry.type, entry.initialData),
      }));

      if (category.id === 'generate') {
        children.push(...imageTemplates.map((template) => ({
          id: `add-image-template-${template.id}`,
          label: `Add ${template.label}`,
          action: createNodeAction('imageGen', createImageNodeTemplateDataPatch(template.id)),
        } satisfies SharedContextMenuItem)));
      }

      return {
        id: `node-category-${category.id}`,
        label: category.label,
        children,
      };
    });

    setFlowContextMenu({
      x: event.clientX,
      y: event.clientY,
      items: [
        {
          id: 'collapse-selected-function',
          label: selectedFlowNodeCount > 1
            ? `Collapse ${selectedFlowNodeCount} Selected Nodes Into Reusable Function`
            : 'Collapse Selected Node Into Reusable Function',
          action: () => collapseSelectionToFunction(),
          hidden: selectedFlowNodeCount === 0,
        },
        {
          id: 'group-selected-nodes',
          label: selectedFlowNodeCount > 1
            ? `Group ${selectedFlowNodeCount} Selected Nodes`
            : 'Group Selected Node',
          action: () => createGroupFromSelection(),
          hidden: selectedFlowNodeCount === 0,
        },
        ...nodeCatalogItems,
        { id: 'auto-organize-flow', label: 'Auto Organize Flow', action: startFlowAutoOrganize, disabled: nodes.length === 0 || Boolean(flowOrganizeJob) },
      ],
    });
  }, [addNode, collapseSelectionToFunction, createGroupFromSelection, flowOrganizeJob, nodes.length, recordActivityTrailEvent, screenToFlowPosition, selectedFlowNodeCount, startFlowAutoOrganize]);

  const handleNodeContextMenu = useCallback((event: ReactMouseEvent, node: AppNode) => {
    event.preventDefault();
    event.stopPropagation();
    setLibrarySearchMenu(null);

    const activeSelectionCount = node.selected ? selectedFlowNodeCount : 0;

    setFlowContextMenu({
      x: event.clientX,
      y: event.clientY,
      items: [
        {
          id: 'collapse-selected-function',
          label: activeSelectionCount > 1
            ? `Collapse ${activeSelectionCount} Selected Nodes Into Reusable Function`
            : 'Collapse Selected Node Into Reusable Function',
          action: () => collapseSelectionToFunction(),
          disabled: activeSelectionCount === 0,
        },
        {
          id: 'group-selected-nodes',
          label: activeSelectionCount > 1
            ? `Group ${activeSelectionCount} Selected Nodes`
            : 'Group Selected Node',
          action: () => createGroupFromSelection(),
          disabled: activeSelectionCount === 0,
        },
      ],
    });
  }, [collapseSelectionToFunction, createGroupFromSelection, selectedFlowNodeCount]);

  const handleCenterBookmarkNode = useCallback((nodeId: string) => {
    const node = nodes.find((candidate) => candidate.id === nodeId);

    if (!node) {
      return;
    }

    centerNodePreservingZoom(node, 450);
  }, [centerNodePreservingZoom, nodes]);

  useEffect(() => {
    registerCenterOnNodeCallback((nodeId) => {
      handleCenterBookmarkNode(nodeId);
    });
  }, [registerCenterOnNodeCallback, handleCenterBookmarkNode]);

  useEffect(() => {
    if (!connectorBookmarkDragActive) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const targetElement = document.elementFromPoint(event.clientX, event.clientY);
      const bookmarkElement = targetElement?.closest?.('[data-flow-bookmark-node-id]') as HTMLElement | null | undefined;
      const bookmarkNodeId = bookmarkElement?.dataset.flowBookmarkNodeId;

      if (!shouldJumpToBookmarkFromConnectorDrag({
        active: activeConnectorDragRef.current,
        bookmarkNodeId,
        lastBookmarkNodeId: lastConnectorBookmarkNodeIdRef.current,
      })) {
        return;
      }

      if (!bookmarkNodeId) {
        return;
      }

      lastConnectorBookmarkNodeIdRef.current = bookmarkNodeId;
      handleCenterBookmarkNode(bookmarkNodeId);
    };

    window.addEventListener('pointermove', handlePointerMove, true);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove, true);
    };
  }, [connectorBookmarkDragActive, handleCenterBookmarkNode]);

  const flowRecoveryKey = useMemo(
    () => `${nodes.map((node) => node.id).join('|')}::${edges.map((edge) => edge.id).join('|')}`,
    [edges, nodes],
  );
  const sharedPanelWorkspaceId = activeWorkspaceView === 'image' || activeWorkspaceView === 'paper' ? activeWorkspaceView : 'flow';
  const mobilePhoneInterface = useMobilePhoneInterfaceDescriptor();
  const mobileChromeMode = useMobileInterfaceStore((state) => state.chromeMode);
  const applicationChromeHidden = mobileChromeMode === 'hidden';
  const workspaceTopPaddingClassName = applicationChromeHidden
    ? 'pt-0'
    : mobilePhoneInterface.enabled
      ? mobilePhoneInterface.collapsedTopPaddingClassName
      : 'pt-16';
  const showSharedWorkspacePanels = shouldShowSharedWorkspacePanels({
    applicationChromeHidden,
    mobilePhoneInterfaceEnabled: mobilePhoneInterface.enabled,
    workspaceView: activeWorkspaceView,
  });

  return (
    <div
      className="signal-loom-themed w-screen h-screen overflow-hidden flex flex-col relative font-sans"
      data-mobile-phone-interface={mobilePhoneInterface.enabled ? mobilePhoneInterface.orientation : undefined}
      data-mobile-phone-interface-mode={mobilePhoneInterface.enabled ? mobileChromeMode : undefined}
      data-source-library-renderer-item-ids={sourceLibraryRendererItemIds}
      style={interfaceThemeStyle}
    >
      <TopNavbar
        activeFlowSourceBinId={activeFlowSourceBinId}
        flowWorkspaceMetricLabel={flowWorkspaceMetricLabel}
        onActiveFlowSourceBinChange={setActiveFlowSourceBinId}
        onMenuCommand={(command, source) => void handleAppMenuCommand(command, source)}
        sourceBins={sourceBins}
        workspaceView={activeWorkspaceView}
      />
      <GamepadInputManager
        activeWorkspace={activeWorkspaceView}
        bindings={gamepadBindings}
        onCommand={(command) => void handleAppMenuCommand(command, 'shortcut')}
      />
      <input
        ref={browserProjectOpenInputRef}
        accept=".sloom,.slimg,.slppr"
        className="hidden"
        onChange={(event) => void handleBrowserProjectFileChange(event)}
        type="file"
      />
      <input
        ref={browserMediaImportInputRef}
        accept={SOURCE_IMPORT_ACCEPT}
        className="hidden"
        multiple
        onChange={(event) => void handleBrowserMediaImportChange(event)}
        type="file"
      />

      <div className={`flex-1 w-full h-full relative ${workspaceTopPaddingClassName}`} ref={flowViewportRef}>
        {activeWorkspaceView === 'flow' ? (
          <FlowWorkspaceShell
            blockingFlowDiagnosticCount={blockingFlowDiagnosticCount}
            diagnosticsOpen={diagnosticsOpen}
            edges={edges}
            flowDiagnostics={flowDiagnostics}
            flowOrganizeJob={flowOrganizeJob}
            flowRecoveryKey={flowRecoveryKey}
            librarySearchMenu={librarySearchMenu}
            nodeTypes={nodeTypes}
            nodes={nodes}
            onCancelFlowAutoOrganize={cancelFlowAutoOrganize}
            onCloseDiagnostics={() => setDiagnosticsOpen(false)}
            onCloseLibrarySearch={() => setLibrarySearchMenu(null)}
            onCollapseSelection={() => collapseSelectionToFunction()}
            onConnect={handleConnect}
            onConnectEnd={handleConnectEnd}
            onConnectStart={handleConnectStart}
            onCreateGroupFromSelection={() => createGroupFromSelection()}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onEdgesChange={onEdgesChange}
            onNodeContextMenu={handleNodeContextMenu}
            onNodesChange={onNodesChange}
            onPaneClick={handlePaneClick}
            onPaneContextMenu={handlePaneContextMenu}
            onSelectLibrarySearchTemplate={(template) => {
              if (!librarySearchMenu) {
                return;
              }

              const position = screenToFlowPosition({
                x: librarySearchMenu.x,
                y: librarySearchMenu.y,
              });
              insertTemplate(template, position);
            }}
            onStartFlowAutoOrganize={startFlowAutoOrganize}
            onToggleDiagnostics={() => setDiagnosticsOpen((current) => !current)}
            selectedFlowNodeCount={selectedFlowNodeCount}
          />
        ) : (
          <div className="absolute inset-0 bg-[var(--sl-bg)]" />
        )}

        {activeWorkspaceView === 'editor' ? (
          <Suspense
            fallback={
              <div className="theme-workspace-loading absolute inset-0 z-30 flex items-center justify-center bg-[#0b0c10]/80 text-sm text-gray-300">
                Loading video workspace…
              </div>
            }
          >
            <ErrorBoundary
              className="absolute inset-0 z-30"
              level="workspace"
              resetKeys={[activeWorkspaceView, activeCompositionId, activeSourceBinId]}
              title="Video Workspace"
            >
              <ManualEditorWorkspace getNewFlowNodePosition={getViewportCenterPosition} />
            </ErrorBoundary>
          </Suspense>
        ) : null}
        {activeWorkspaceView === 'image' ? (
          <Suspense
            fallback={
              <div className="theme-workspace-loading absolute inset-0 z-30 flex items-center justify-center bg-[#0b0c10]/80 text-sm text-gray-300">
                Loading image editor…
              </div>
            }
          >
            <ErrorBoundary
              className="absolute inset-0 z-30"
              level="workspace"
              resetKeys={[activeWorkspaceView, activeImageDocId]}
              title="Image Workspace"
            >
              <ImageEditorWorkspace getNewFlowNodePosition={getViewportCenterPosition} />
            </ErrorBoundary>
          </Suspense>
        ) : null}
        {activeWorkspaceView === 'paper' ? (
          <Suspense
            fallback={
              <div className="theme-workspace-loading absolute inset-0 z-30 flex items-center justify-center bg-[#0b0c10]/80 text-sm text-gray-300">
                Loading paper workspace…
              </div>
            }
          >
            <ErrorBoundary
              className="absolute inset-0 z-30"
              level="workspace"
              resetKeys={[activeWorkspaceView, activePaperDocumentId]}
              title="Paper Workspace"
            >
              <PaperWorkspace />
            </ErrorBoundary>
          </Suspense>
        ) : null}
        {showSharedWorkspacePanels ? (
          <ErrorBoundary
            className="absolute inset-0 z-20 pointer-events-none"
            level="panel"
            resetKeys={[sharedPanelWorkspaceId, flowRecoveryKey]}
            title="Shared Dockable Panels"
          >
            <SharedWorkspaceDockablePanels
              onCenterBookmarkNode={handleCenterBookmarkNode}
              workspaceId={sharedPanelWorkspaceId}
            />
          </ErrorBoundary>
        ) : null}
        {flowContextMenu ? (
          <SharedContextMenu
            ariaLabel="Flow context menu"
            items={flowContextMenu.items}
            onClose={() => setFlowContextMenu(null)}
            title="Flow Actions"
            x={flowContextMenu.x}
            y={flowContextMenu.y}
          />
        ) : null}
      </div>

      <SettingsModal />
      <CommandPalette
        entries={commandPaletteEntries}
        onClose={() => setCommandPaletteOpen(false)}
        onRun={(entry) => void runCommandPaletteEntry(entry)}
        open={commandPaletteOpen}
      />
      <ActivityTrailPanel
        events={activityTrailEvents}
        onClear={clearActivityTrailEvents}
        onClose={() => setActivityTrailOpen(false)}
        open={activityTrailOpen}
      />
      <ConfirmationDialog />
      <TextInputDialog />
      <AlertDialog />
      {activeHelpSectionId ? (
        <AppHelpModal
          activeSectionId={activeHelpSectionId}
          onClose={() => setActiveHelpSectionId(null)}
          onSelectSection={setActiveHelpSectionId}
        />
      ) : null}
      {startupSplash.visible ? (
        <StartupSplash title={startupSplash.title} detail={startupSplash.detail} />
      ) : null}
    </div>
  );
}

function StartupSplash({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[#020711]">
      <img
        alt="Signal Loom is starting"
        className="h-full max-h-full w-full max-w-full object-contain"
        draggable={false}
        src="/signal-loom-splash.png"
      />
      <div className="sr-only" role="status">
        {title}. {detail}
      </div>
    </div>
  );
}

function AppHelpModal({
  activeSectionId,
  onClose,
  onSelectSection,
}: {
  activeSectionId: HelpSectionId;
  onClose: () => void;
  onSelectSection: (sectionId: HelpSectionId) => void;
}) {
  const activeSection = getHelpSection(activeSectionId);

  return (
    <DockableDialog
      defaultFloatingRect={{ x: 132, y: 84, width: 960, height: 640 }}
      dialogId="app-help"
      minSize={{ width: 520, height: 360 }}
      onClose={onClose}
      open
      title="Signal Loom Help"
      workspaceId="app-dialogs"
    >
      <div className="theme-card grid h-full min-h-0 overflow-hidden bg-[#101722] text-gray-100 md:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="theme-card-soft border-b border-cyan-300/15 bg-[#0b121d] p-4 md:border-b-0 md:border-r">
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-200/70">Help</div>
          <div className="mt-1 text-lg font-semibold text-white">Signal Loom</div>
          <div className="mt-4 space-y-1">
            {HELP_SECTIONS.map((section) => (
              <button
                className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                  section.id === activeSection.id
                    ? 'bg-cyan-400/15 text-cyan-100'
                    : 'text-gray-300 hover:bg-cyan-400/10 hover:text-white'
                }`}
                key={section.id}
                onClick={() => onSelectSection(section.id)}
                type="button"
              >
                {section.title}
              </button>
            ))}
          </div>
        </aside>
        <section className="min-h-0 overflow-y-auto">
          <div className="theme-header sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-cyan-300/15 bg-[#101722]/95 px-5 py-4 backdrop-blur">
            <div>
              <h2 className="text-xl font-semibold text-white">{activeSection.title}</h2>
              <p className="mt-1 max-w-3xl text-sm text-gray-400">{activeSection.summary}</p>
            </div>
            <button
              className="theme-button rounded-md border border-gray-700/70 bg-[#0b121d] px-3 py-2 text-xs font-semibold text-gray-200 transition-colors hover:border-cyan-300/50 hover:text-white"
              onClick={onClose}
              type="button"
            >
              Close
            </button>
          </div>
          <div className="space-y-4 p-5">
            {activeSection.groups.map((group) => (
              <article className="theme-card-soft rounded-lg border border-gray-700/60 bg-[#0b121d]/70 p-4" key={group.title}>
                <h3 className="text-sm font-semibold text-cyan-100">{group.title}</h3>
                <ul className="mt-3 space-y-2 text-sm text-gray-300">
                  {group.items.map((item) => (
                    <li className="leading-6" key={item}>{item}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>
      </div>
    </DockableDialog>
  );
}

function AppBootSplashDismissor() {
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;

    const timeoutId = window.setTimeout(() => {
      document.documentElement.dataset.appReady = 'true';
      // Release the Android native splash now that the first frame is up, so it covered the
      // whole cold start (held by MainActivity#setKeepOnScreenCondition) and hands straight to
      // the workspace. No-op off-Android.
      try {
        (window as unknown as { AndroidSplash?: { onWebReady?: () => void } }).AndroidSplash?.onWebReady?.();
      } catch {
        // ignore — bridge only exists in the Android WebView
      }
    }, 450);

    return () => window.clearTimeout(timeoutId);
  }, []);

  return null;
}

export default function App() {
  return (
    <ReactFlowProvider>
      <AppBootSplashDismissor />
      <FlowApp />
    </ReactFlowProvider>
  );
}
