import {
  Background,
  Controls,
  type Edge,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, MouseEvent as ReactMouseEvent } from 'react';
import '@xyflow/react/dist/style.css';

import { useFlowStore } from './store/flowStore';
import { useCatalogStore } from './store/catalogStore';
import { useSettingsStore } from './store/settingsStore';
import { SettingsModal } from './components/Settings/SettingsModal';
import { TopNavbar } from './components/Layout/TopNavbar';
import { BottomToolbar } from './components/Layout/BottomToolbar';
import { UsageBar } from './components/Layout/UsageBar';

import { TextNode as InputNode } from './components/Nodes/TextNode';
import { ImageNode } from './components/Nodes/ImageNode';
import { VideoNode } from './components/Nodes/VideoNode';
import { AudioNode } from './components/Nodes/AudioNode';
import { ConfigNode } from './components/Nodes/ConfigNode';
import { CompositionNode } from './components/Nodes/CompositionNode';
import { SourceBinNode } from './components/Nodes/SourceBinNode';
import { VirtualNode } from './components/Nodes/VirtualNode';
const ManualEditorWorkspace = lazy(() =>
  import('./components/Editor/ManualEditorWorkspace').then((module) => ({
    default: module.ManualEditorWorkspace,
  })),
);
import { useEditorStore } from './store/editorStore';
import { useSourceBinStore } from './store/sourceBinStore';
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
import {
  downloadJsonFile,
  parseProjectDocument,
} from './lib/projectLibrary';
import {
  dispatchNativeRendererCommand,
  getSignalLoomNativeBridge,
  type NativeMenuCommand,
} from './lib/nativeApp';
import { getHelpSection, HELP_SECTIONS, type HelpSectionId } from './lib/helpContent';
import { FlowBookmarkSidebar } from './components/Layout/FlowBookmarkSidebar';
import { FlowSourceBinSidebar } from './components/Layout/FlowSourceBinSidebar';
import { SharedContextMenu } from './components/Common/SharedContextMenu';
import type { AppNode, FlowNodeType } from './types/flow';
import type { SharedContextMenuItem } from './lib/sharedContextMenu';

import './index.css';

const SIGNAL_LOOM_PROJECT_FILE_EXTENSION = '.sloom';
const LEGACY_PROJECT_FILE_EXTENSION_PATTERN = /(?:\.signal-loom\.json|\.json)$/i;

function stripSignalLoomProjectExtension(fileName: string): string {
  return fileName
    .replace(new RegExp(`${SIGNAL_LOOM_PROJECT_FILE_EXTENSION.replace('.', '\\.')}$`, 'i'), '')
    .replace(LEGACY_PROJECT_FILE_EXTENSION_PATTERN, '');
}

const nodeTypes = {
  textNode: InputNode,
  imageGen: ImageNode,
  videoGen: VideoNode,
  audioGen: AudioNode,
  settings: ConfigNode,
  composition: CompositionNode,
  sourceBin: SourceBinNode,
  virtual: VirtualNode,
};

function FlowApp() {
  const nodes = useFlowStore((state) => state.nodes);
  const edges = useFlowStore((state) => state.edges);
  const onNodesChange = useFlowStore((state) => state.onNodesChange);
  const onEdgesChange = useFlowStore((state) => state.onEdgesChange);
  const onConnect = useFlowStore((state) => state.onConnect);
  const addNode = useFlowStore((state) => state.addNode);
  const patchNodeData = useFlowStore((state) => state.patchNodeData);
  const restoreImportedAssets = useFlowStore((state) => state.restoreImportedAssets);
  const { screenToFlowPosition, setCenter } = useReactFlow<AppNode, Edge>();
  const flowViewportRef = useRef<HTMLDivElement | null>(null);
  const browserProjectOpenInputRef = useRef<HTMLInputElement | null>(null);
  const browserMediaImportInputRef = useRef<HTMLInputElement | null>(null);
  const workspaceView = useEditorStore((state) => state.workspaceView);
  const setWorkspaceView = useEditorStore((state) => state.setWorkspaceView);
  const sourceBinVisible = useEditorStore((state) => state.sourceBinVisible);
  const inspectorVisible = useEditorStore((state) => state.inspectorVisible);
  const setPanelVisibility = useEditorStore((state) => state.setPanelVisibility);
  const refreshCatalogs = useCatalogStore((state) => state.refreshCatalogs);
  const apiKeys = useSettingsStore((state) => state.apiKeys);
  const defaultModels = useSettingsStore((state) => state.defaultModels);
  const providerSettings = useSettingsStore((state) => state.providerSettings);
  const sourceBinItems = useSourceBinStore((state) => state.items);
  const ingestConnectedItems = useSourceBinStore((state) => state.ingestConnectedItems);
  const importFiles = useSourceBinStore((state) => state.importFiles);
  const importNativeFiles = useSourceBinStore((state) => state.importNativeFiles);
  const migrateAssetsToScratch = useSourceBinStore((state) => state.migrateAssetsToScratch);
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
  const activeIngestSignatureRef = useRef<string | undefined>(undefined);
  const [nativeProjectPath, setNativeProjectPath] = useState<string | undefined>(undefined);
  const [flowContextMenu, setFlowContextMenu] = useState<{
    x: number;
    y: number;
    items: SharedContextMenuItem[];
  } | null>(null);
  const [activeHelpSectionId, setActiveHelpSectionId] = useState<HelpSectionId | null>(null);

  const getViewportCenterPosition = useCallback(() => {
    const bounds = flowViewportRef.current?.getBoundingClientRect();
    const screenPoint = bounds
      ? { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 }
      : { x: window.innerWidth / 2, y: window.innerHeight / 2 };

    return screenToFlowPosition(screenPoint);
  }, [screenToFlowPosition]);

  const handleAddNode = useCallback(
    (type: FlowNodeType) => {
      addNode(type, getViewportCenterPosition());
    },
    [addNode, getViewportCenterPosition],
  );

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
    void restoreImportedAssets();
  }, [restoreImportedAssets]);

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
    if (!connectedSourceBinSignature || connectedSourceBinItems.length === 0) {
      return;
    }

    if (activeIngestSignatureRef.current === connectedSourceBinSignature) {
      return;
    }

    activeIngestSignatureRef.current = connectedSourceBinSignature;
    void ingestConnectedItems(connectedSourceBinItems).finally(() => {
      if (activeIngestSignatureRef.current === connectedSourceBinSignature) {
        activeIngestSignatureRef.current = undefined;
      }
    });
  }, [connectedSourceBinItems, connectedSourceBinSignature, ingestConnectedItems]);

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

  const handleAppMenuCommand = useCallback(async (command: NativeMenuCommand) => {
    const bridge = getSignalLoomNativeBridge();

    switch (command) {
      case 'file:new': {
        if (!window.confirm('Start a new blank project? Unsaved changes in the current workspace will be discarded.')) {
          return;
        }

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

        const result = await bridge.openProjectFile();

        if (!result.canceled && result.document) {
          if (result.scratchDirectoryPath) {
            setNativeScratchDirectoryPath(result.scratchDirectoryPath);
          }
          await restoreProjectDocument(result.document);
          setNativeProjectPath(result.filePath);
        }
        return;
      }
      case 'file:save': {
        if (!bridge) {
          await downloadCurrentProjectDocument();
          return;
        }

        const document = await buildCurrentProjectDocument({ name: getNativeProjectName() });
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

        const document = await buildCurrentProjectDocument({ name: getNativeProjectName() });
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
      case 'file:import-media': {
        if (!bridge) {
          browserMediaImportInputRef.current?.click();
          return;
        }

        const result = await bridge.importMediaFiles({
          scratchDirectoryPath: nativeScratchDirectoryPath,
        });

        if (!result.canceled && result.items.length > 0) {
          await importNativeFiles(result.items);
          setPanelVisibility('sourceBinVisible', true);
        }
        return;
      }
      case 'file:set-scratch-folder': {
        if (!bridge) {
          if (!isFileSystemAccessSupported()) {
            window.alert('This browser does not support choosing local scratch folders.');
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
      case 'file:export-project-json': {
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
        await exportProjectAssets(useFlowStore.getState().nodes);
        return;
      }
      case 'view:flow':
        setWorkspaceView('flow');
        return;
      case 'view:editor':
        setWorkspaceView('editor');
        return;
      case 'view:toggle-source-bin':
        setPanelVisibility('sourceBinVisible', !sourceBinVisible);
        return;
      case 'view:toggle-inspector':
        setPanelVisibility('inspectorVisible', !inspectorVisible);
        return;
      case 'help:about':
        if (bridge) {
          await bridge.showAbout();
        } else {
          window.alert('Signal Loom\nGenerative AI media flow builder and timeline editor.');
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
      case 'edit:undo':
      case 'edit:redo':
      case 'edit:delete':
      case 'timeline:select':
      case 'timeline:cut':
      case 'timeline:slip':
      case 'timeline:hand':
      case 'timeline:snap':
      case 'timeline:add-keyframe':
      case 'timeline:previous-keyframe':
      case 'timeline:next-keyframe':
        dispatchNativeRendererCommand(command);
        return;
    }
  }, [
    downloadCurrentProjectDocument,
    getProjectExportFileName,
    getNativeProjectName,
    importNativeFiles,
    inspectorVisible,
    migrateAssetsToScratch,
    nativeScratchDirectoryPath,
    setNativeScratchDirectoryPath,
    setPanelVisibility,
    setWorkspaceView,
    sourceBinVisible,
  ]);

  const handleBrowserProjectFileChange = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';

    if (!file) {
      return;
    }

    try {
      const document = await parseProjectDocument(file);
      await restoreProjectDocument(document);
      setNativeProjectPath(undefined);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'The selected project file could not be opened.');
    }
  }, []);

  const handleBrowserMediaImportChange = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = '';

    if (files.length === 0) {
      return;
    }

    await importFiles(files);
    setPanelVisibility('sourceBinVisible', true);
  }, [importFiles, setPanelVisibility]);

  useEffect(() => {
    const bridge = getSignalLoomNativeBridge();

    if (!bridge) {
      return;
    }

    let cancelled = false;
    void bridge.getNativeState().then((state) => {
        if (!cancelled) {
          setNativeProjectPath(state.currentProjectPath);
          setNativeScratchDirectoryPath(state.currentScratchDirectoryPath);
        }
      });

    const removeMenuListener = bridge.onMenuCommand((command) => {
      void handleAppMenuCommand(command);
    });
    const removeProjectPathListener = bridge.onProjectPathChanged((filePath) => {
      setNativeProjectPath(filePath);
    });

    return () => {
      cancelled = true;
      removeMenuListener();
      removeProjectPathListener();
    };
  }, [handleAppMenuCommand, setNativeScratchDirectoryPath]);

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    const rawPayload = event.dataTransfer.getData('application/x-flow-source-bin-item');

    if (!rawPayload) {
      return;
    }

    event.preventDefault();

    const { itemId } = JSON.parse(rawPayload) as { itemId?: string };
    const item = sourceBinItems.find((candidate) => candidate.id === itemId);

    if (!item) {
      return;
    }

    const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
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
      return;
    }

    patchNodeData(nodeId, {
      mediaMode: 'import',
      sourceAssetId: item.assetId,
      sourceAssetUrl: item.assetUrl,
      sourceAssetName: item.label,
      sourceAssetMimeType: item.mimeType,
    });
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (event.dataTransfer.types.includes('application/x-flow-source-bin-item')) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    }
  };

  const handlePaneContextMenu = useCallback((event: MouseEvent | ReactMouseEvent<Element, MouseEvent>) => {
    event.preventDefault();
    event.stopPropagation();

    const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    const createNodeAction = (type: FlowNodeType) => () => {
      addNode(type, position);
    };

    setFlowContextMenu({
      x: event.clientX,
      y: event.clientY,
      items: [
        { id: 'add-text-node', label: 'Add Text Node', action: createNodeAction('textNode') },
        { id: 'add-image-node', label: 'Add Image Node', action: createNodeAction('imageGen') },
        { id: 'add-video-node', label: 'Add Video Node', action: createNodeAction('videoGen') },
        { id: 'add-audio-node', label: 'Add Audio Node', action: createNodeAction('audioGen') },
        { id: 'add-composition-node', label: 'Add Composition Node', action: createNodeAction('composition') },
        { id: 'add-source-bin-node', label: 'Add Source Bin Node', action: createNodeAction('sourceBin') },
      ],
    });
  }, [addNode, screenToFlowPosition]);

  const handleCenterBookmarkNode = useCallback((nodeId: string) => {
    const node = nodes.find((candidate) => candidate.id === nodeId);

    if (!node) {
      return;
    }

    const measured = node.measured as { width?: number; height?: number } | undefined;
    const width = measured?.width ?? node.width ?? 260;
    const height = measured?.height ?? node.height ?? 180;

    void setCenter(
      node.position.x + width / 2,
      node.position.y + height / 2,
      {
        duration: 450,
        zoom: 1,
      },
    );
  }, [nodes, setCenter]);

  return (
    <div className="w-screen h-screen bg-[#0b0c10] overflow-hidden flex flex-col relative text-gray-100 font-sans">
      <TopNavbar onMenuCommand={(command) => void handleAppMenuCommand(command)} />
      <UsageBar />
      <input
        ref={browserProjectOpenInputRef}
        accept=".sloom,.signal-loom.json,.json,application/json"
        className="hidden"
        onChange={(event) => void handleBrowserProjectFileChange(event)}
        type="file"
      />
      <input
        ref={browserMediaImportInputRef}
        accept="image/*,video/*,audio/*"
        className="hidden"
        multiple
        onChange={(event) => void handleBrowserMediaImportChange(event)}
        type="file"
      />

      <div className="flex-1 w-full h-full relative pt-16" ref={flowViewportRef}>
        <ReactFlow<AppNode, Edge>
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onPaneContextMenu={handlePaneContextMenu}
          nodeTypes={nodeTypes}
          fitView
          proOptions={{ hideAttribution: true }}
          className="bg-[#0b0c10]"
        >
          <Background color="#2d2d34" gap={24} size={2} />
          <Controls
            className="!bottom-24 !left-4 !bg-[#252830] !border-gray-700 !text-gray-300 shadow-xl rounded-xl overflow-hidden"
            showInteractive={false}
          />
        </ReactFlow>

        {workspaceView === 'editor' ? (
          <Suspense
            fallback={
              <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#0b0c10]/80 text-sm text-gray-300">
                Loading editor…
              </div>
            }
          >
            <ManualEditorWorkspace getNewFlowNodePosition={getViewportCenterPosition} />
          </Suspense>
        ) : null}
        {workspaceView === 'flow' ? <FlowSourceBinSidebar /> : null}
        {workspaceView === 'flow' ? <FlowBookmarkSidebar onCenterNode={handleCenterBookmarkNode} /> : null}
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

      {workspaceView === 'flow' ? <BottomToolbar onAddNode={handleAddNode} /> : null}
      <SettingsModal />
      {activeHelpSectionId ? (
        <AppHelpModal
          activeSectionId={activeHelpSectionId}
          onClose={() => setActiveHelpSectionId(null)}
          onSelectSection={setActiveHelpSectionId}
        />
      ) : null}
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
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 p-6 text-gray-100 backdrop-blur-sm">
      <div className="grid max-h-[84vh] w-full max-w-5xl overflow-hidden rounded-xl border border-cyan-400/20 bg-[#101722] shadow-2xl md:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="border-b border-cyan-300/15 bg-[#0b121d] p-4 md:border-b-0 md:border-r">
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
          <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-cyan-300/15 bg-[#101722]/95 px-5 py-4 backdrop-blur">
            <div>
              <h2 className="text-xl font-semibold text-white">{activeSection.title}</h2>
              <p className="mt-1 max-w-3xl text-sm text-gray-400">{activeSection.summary}</p>
            </div>
            <button
              className="rounded-md border border-gray-700/70 bg-[#0b121d] px-3 py-2 text-xs font-semibold text-gray-200 transition-colors hover:border-cyan-300/50 hover:text-white"
              onClick={onClose}
              type="button"
            >
              Close
            </button>
          </div>
          <div className="space-y-4 p-5">
            {activeSection.groups.map((group) => (
              <article className="rounded-lg border border-gray-700/60 bg-[#0b121d]/70 p-4" key={group.title}>
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
    </div>
  );
}

export default function App() {
  return (
    <ReactFlowProvider>
      <FlowApp />
    </ReactFlowProvider>
  );
}
