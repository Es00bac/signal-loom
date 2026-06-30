import type { FlowProjectDocument } from './projectLibrary';
import type { PaperPdfExportRequest } from './paperPdfExport';
import type { PaperWebcomicImageFormat } from './paperWebcomicExport';
import type { SourceBinLibraryItem } from '../store/sourceBinStore';
import type { WorkspaceWindowView } from './workspaceWindows';
import type { VertexImageRoute } from './vertexImageRequests';
import type { VertexVideoRoute } from './vertexVideoRequests';
import type { VertexNativeAuthConfig } from '../types/flow';
import type {
  ImportedMediaBatchNormalizationRequestItem,
  NormalizedImportedMediaBatchItem,
} from './flowImportWorker';
import type {
  SourceLibraryNativeChange,
  SourceLibraryNativeEvent,
  SourceLibraryNativeSnapshotResult,
} from './sourceLibraryNativeSync';

export const NATIVE_RENDERER_COMMAND_EVENT = 'signal-loom:native-renderer-command';

export const NATIVE_MENU_COMMANDS = [
  'file:new',
  'file:open',
  'file:save',
  'file:save-as',
  'file:import-media',
  'file:set-scratch-folder',
  'file:export-project',
  'file:export-assets',
  'settings:keyboard-shortcuts',
  'settings:gamepad-bindings',
  'edit:undo',
  'edit:redo',
  'edit:cut',
  'edit:copy',
  'edit:paste',
  'edit:delete',
  'edit:select-all',
  'edit:deselect',
  'edit:invert-selection',
  'view:flow',
  'view:editor',
  'view:image',
  'view:paper',
  'view:toggle-source-bin',
  'view:toggle-inspector',
  'view:toggle-interface',
  'view:command-palette',
  'view:activity-trail',
  'view:layout-reset',
  'view:layout-balanced',
  'view:layout-focus',
  'view:layout-all-panels',
  'flow:add-source-bin',
  'image:tool-hand',
  'image:tool-text',
  'image:tool-move',
  'image:tool-marquee',
  'image:tool-lasso',
  'image:tool-magic-wand',
  'image:tool-brush',
  'image:tool-pen',
  'image:tool-eraser',
  'image:tool-background-eraser',
  'image:tool-magic-eraser',
  'image:tool-clone-stamp',
  'image:tool-spot-heal',
  'image:tool-blur-brush',
  'image:tool-sharpen-brush',
  'image:tool-smudge-brush',
  'image:tool-dodge-brush',
  'image:tool-burn-brush',
  'image:tool-sponge-saturate',
  'image:tool-sponge-desaturate',
  'image:tool-paint-bucket',
  'image:tool-gradient',
  'image:tool-rectangle-shape',
  'image:tool-ellipse-shape',
  'image:tool-crop',
  'image:tool-eyedropper',
  'image:export-visible',
  'image:export-psd',
  'image:file-new',
  'image:file-open',
  'image:file-save-as',
  'image:adjust-brightness-contrast',
  'image:adjust-levels',
  'image:adjust-curves',
  'image:adjust-hue-saturation',
  'image:adjust-black-white',
  'image:adjust-exposure',
  'image:adjust-temperature-tint',
  'image:adjust-invert',
  'image:toggle-tools-panel',
  'image:toggle-brushes-panel',
  'image:toggle-layers-panel',
  'image:toggle-channels-panel',
  'image:toggle-paths-panel',
  'image:toggle-properties-panel',
  'image:toggle-history-panel',
  'image:toggle-assets-panel',
  'image:reset-panels',
  'timeline:select',
  'timeline:cut',
  'timeline:slip',
  'timeline:hand',
  'timeline:snap',
  'timeline:add-keyframe',
  'timeline:previous-keyframe',
  'timeline:next-keyframe',
  'paper:tool-select',
  'paper:tool-hand',
  'paper:tool-text',
  'paper:tool-image',
  'paper:tool-eyedropper',
  'paper:new-document',
  'paper:add-page',
  'paper:file-open',
  'paper:file-save-as',
  'paper:export-pdf',
  'paper:export-kdp-assets',
  'paper:export-reader-spreads-pdf',
  'paper:export-booklet-proof-pdf',
  'paper:export-webcomic-images',
  'paper:export-html',
  'paper:export-reader-spreads-html',
  'paper:export-booklet-proof-html',
  'paper:package-print',
  'paper:export-idml',
  'paper:export-stories-txt',
  'paper:export-stories-html',
  'paper:export-stories-rtf',
  'paper:export-stories-docx',
  'paper:export-cbz',
  'paper:export-json',
  'paper:import-json',
  'paper:add-text-frame',
  'paper:add-image-frame',
  'paper:add-speech-bubble',
  'paper:add-thought-bubble',
  'paper:add-caption',
  'paper:toggle-rulers',
  'paper:toggle-guides',
  'paper:toggle-grid',
  'paper:toggle-snap-to-guides',
  'paper:toggle-snap-to-grid',
  'paper:toggle-spreads',
  'paper:toggle-start-on-right',
  'paper:toggle-tools-panel',
  'paper:toggle-document-strip-panel',
  'paper:toggle-inspector-panel',
  'paper:toggle-preflight-panel',
  'paper:toggle-linked-assets-panel',
  'paper:toggle-dtp-parity-panel',
  'paper:reset-panels',
  'help:project-documentation',
  'help:tutorial',
  'help:feature-help',
  'help:keyboard-shortcuts',
  'help:about',
] as const;

export type NativeMenuCommand = typeof NATIVE_MENU_COMMANDS[number];
export type NativeWorkspaceStandaloneEntryMode = 'shared-binary-window';
export type NativeWorkspaceStandaloneEntryStatus = 'ready';
export type NativeWorkspacePackageTarget = 'macos' | 'windows' | 'linux';
export type NativeWorkspaceSuiteHandoffMode = 'shared-binary-deep-link';

export interface NativeWorkspaceStandaloneEntryPoint {
  workspace: WorkspaceWindowView;
  command: Extract<NativeMenuCommand, 'view:flow' | 'view:editor' | 'view:image' | 'view:paper'>;
  entryPoint: `signal-loom://workspace/${WorkspaceWindowView}`;
  mode: NativeWorkspaceStandaloneEntryMode;
}

export interface NativeWorkspaceStandaloneEntryReadiness extends NativeWorkspaceStandaloneEntryPoint {
  status: NativeWorkspaceStandaloneEntryStatus;
  unsupportedStandaloneExecutable: true;
  suiteHandoffMode: NativeWorkspaceSuiteHandoffMode;
  packageTargets: readonly NativeWorkspacePackageTarget[];
  packageCaveats: string[];
  caveat: string;
  signature: string;
}

export const NATIVE_WORKSPACE_STANDALONE_ENTRY_POINTS: readonly NativeWorkspaceStandaloneEntryPoint[] = [
  {
    workspace: 'flow',
    command: 'view:flow',
    entryPoint: 'signal-loom://workspace/flow',
    mode: 'shared-binary-window',
  },
  {
    workspace: 'editor',
    command: 'view:editor',
    entryPoint: 'signal-loom://workspace/editor',
    mode: 'shared-binary-window',
  },
  {
    workspace: 'image',
    command: 'view:image',
    entryPoint: 'signal-loom://workspace/image',
    mode: 'shared-binary-window',
  },
  {
    workspace: 'paper',
    command: 'view:paper',
    entryPoint: 'signal-loom://workspace/paper',
    mode: 'shared-binary-window',
  },
] as const;

export function buildNativeStandaloneEntryReadiness(
  workspace: WorkspaceWindowView,
): NativeWorkspaceStandaloneEntryReadiness {
  const entry = NATIVE_WORKSPACE_STANDALONE_ENTRY_POINTS.find((candidate) => candidate.workspace === workspace);
  if (!entry) {
    throw new Error(`Unknown native standalone workspace entry: ${workspace}`);
  }

  return {
    ...entry,
    status: 'ready',
    unsupportedStandaloneExecutable: true,
    suiteHandoffMode: 'shared-binary-deep-link',
    packageTargets: ['macos', 'windows', 'linux'],
    packageCaveats: [
      'Standalone Image handoff stays inside the shared Signal Loom desktop package; separate signed single-workspace executables are not produced.',
    ],
    caveat: 'Standalone workspace entry uses the shared Signal Loom desktop binary and focused workspace windows; separate signed executables are not packaged.',
    signature: [
      'native-standalone-entry:v2',
      entry.workspace,
      entry.command,
      entry.entryPoint,
      entry.mode,
      'suite-handoff=shared-binary-deep-link',
      'targets=macos,windows,linux',
      'separate-exe=false',
    ].join('|'),
  };
}

export interface NativeState {
  currentProjectPath?: string;
  currentScratchDirectoryPath?: string;
  startupProject?: NativeProjectFileResult;
  workspace?: WorkspaceWindowView;
  platform: string;
  isDev: boolean;
}

export interface NativeProjectFileResult {
  canceled: boolean;
  filePath?: string;
  scratchDirectoryPath?: string;
  document?: FlowProjectDocument;
}

export interface NativeScratchDirectoryResult {
  canceled: boolean;
  directoryPath?: string;
}

export interface NativeImageOpenResult {
  canceled: boolean;
  bytes?: Uint8Array;
  path?: string;
}

export interface NativeImageSaveResult {
  canceled: boolean;
  path?: string;
}

export interface NativePaperOpenResult {
  canceled: boolean;
  bytes?: Uint8Array;
  path?: string;
}

export interface NativePaperSaveResult {
  canceled: boolean;
  path?: string;
}

export interface NativePaperPdfExportResult {
  canceled: boolean;
  filePath?: string;
  bytes?: number;
  error?: string;
}

export interface NativePaperImageExportPage {
  pageId: string;
  pageNumber: number;
  fileName: string;
  mimeType: 'image/png' | 'image/jpeg';
  dataUrl: string;
  widthPx?: number;
  heightPx?: number;
}

export interface NativePaperImageExportRequest {
  title: string;
  directoryName: string;
  format: PaperWebcomicImageFormat;
  mimeType: 'image/png' | 'image/jpeg';
  quality?: number;
  pages: NativePaperImageExportPage[];
}

export interface NativePaperImageExportResult {
  canceled: boolean;
  directoryPath?: string;
  files?: Array<{
    fileName: string;
    filePath: string;
    pageNumber: number;
    bytes: number;
  }>;
  bytes?: number;
  error?: string;
}

export interface NativeVertexImageRequest {
  projectId: string;
  location: string;
  modelId: string;
  route: VertexImageRoute;
  auth?: VertexNativeAuthConfig;
  body: Record<string, unknown>;
}

export interface NativeVertexImageResult {
  result?: string;
  resultType?: 'image';
  statusMessage?: string;
  mimeType?: string;
  error?: string;
}

export interface NativeVertexTextRequest {
  projectId: string;
  location: string;
  modelId: string;
  auth?: VertexNativeAuthConfig;
  body: Record<string, unknown>;
}

export interface NativeVertexTextResult {
  text?: string;
  statusMessage?: string;
  error?: string;
}

export interface NativeVertexVideoRequest {
  projectId: string;
  location: string;
  modelId: string;
  route: VertexVideoRoute;
  apiVersion?: 'v1' | 'v1beta1' | 'v1alpha';
  auth?: VertexNativeAuthConfig;
  body: Record<string, unknown>;
}

export interface NativeVertexVideoResult {
  result?: string;
  resultType?: 'video';
  statusMessage?: string;
  mimeType?: string;
  error?: string;
}

export interface NativeVertexAuthRequest {
  auth?: VertexNativeAuthConfig;
}

export interface NativeVertexLoginResult {
  ok: boolean;
  error?: string;
}

export interface NativeVertexDetectResult {
  ok: boolean;
  hasToken: boolean;
  account?: string;
  error?: string;
}

export interface NativeVertexProjectsResult {
  ok: boolean;
  projects: Array<{ projectId: string; name: string }>;
  error?: string;
}

export interface NativeMaterializeSourceAssetRequest {
  id?: string;
  label: string;
  kind: Exclude<SourceBinLibraryItem['kind'], 'text'>;
  mimeType: string;
  dataUrl: string;
  binaryData?: Uint8Array;
  isGenerated?: boolean;
  pixelWidth?: number;
  pixelHeight?: number;
  createdAt?: number;
  sourceKey?: string;
  originNodeId?: string;
  envelopeId?: string;
  envelopeLabel?: string;
  envelopeIndex?: number;
  envelopeCollapsed?: boolean;
}

export interface NativeMaterializeSourceAssetResult {
  item?: SourceBinLibraryItem;
  error?: string;
}

export type NativeImportedMediaItem = SourceBinLibraryItem & {
  nativeFilePath?: string;
};

export interface NativeImportMediaResult {
  canceled: boolean;
  items: NativeImportedMediaItem[];
}

export interface NativeWindowCaptureResult {
  canceled: boolean;
  mimeType?: 'image/png';
  base64?: string;
  width?: number;
  height?: number;
  error?: string;
}

export interface SignalLoomNativeBridge {
  getNativeState: () => Promise<NativeState>;
  clearProjectPath: () => Promise<{ ok?: boolean }>;
  openProjectFile: () => Promise<NativeProjectFileResult>;
  saveProjectFile: (document: FlowProjectDocument) => Promise<NativeProjectFileResult>;
  saveProjectFileAs: (document: FlowProjectDocument) => Promise<NativeProjectFileResult>;
  openImageDocumentFile: () => Promise<NativeImageOpenResult>;
  saveImageDocumentFileAs: (bytes: Uint8Array) => Promise<NativeImageSaveResult>;
  openPaperDocumentFile: () => Promise<NativePaperOpenResult>;
  savePaperDocumentFileAs: (bytes: Uint8Array) => Promise<NativePaperSaveResult>;
  importMediaFiles: (options?: { scratchDirectoryPath?: string }) => Promise<NativeImportMediaResult>;
  normalizeImportedMediaBatch: (
    items: ImportedMediaBatchNormalizationRequestItem[],
  ) => Promise<NormalizedImportedMediaBatchItem[]>;
  exportPaperPdf: (request: PaperPdfExportRequest) => Promise<NativePaperPdfExportResult>;
  exportPaperImages: (request: NativePaperImageExportRequest) => Promise<NativePaperImageExportResult>;
  captureCurrentWindowPng: () => Promise<NativeWindowCaptureResult>;
  readClipboardImage: () => Promise<string | null | { error: string }>;
  downloadRemoteMedia: (url: string) => Promise<{ base64?: string; mimeType?: string; error?: string } | null>;
  generateVertexImage: (request: NativeVertexImageRequest) => Promise<NativeVertexImageResult>;
  generateVertexText: (request: NativeVertexTextRequest) => Promise<NativeVertexTextResult>;
  generateVertexVideo: (request: NativeVertexVideoRequest) => Promise<NativeVertexVideoResult>;
  loginVertex: (request: NativeVertexAuthRequest) => Promise<NativeVertexLoginResult>;
  detectVertexAdc: (request: NativeVertexAuthRequest) => Promise<NativeVertexDetectResult>;
  listVertexProjects: (request: NativeVertexAuthRequest) => Promise<NativeVertexProjectsResult>;
  materializeSourceAsset: (request: NativeMaterializeSourceAssetRequest) => Promise<NativeMaterializeSourceAssetResult>;
  chooseScratchDirectory: () => Promise<NativeScratchDirectoryResult>;
  openWorkspaceWindow: (workspace: WorkspaceWindowView) => Promise<{ ok?: boolean; workspace?: WorkspaceWindowView; error?: string }>;
  setActiveWorkspace: (workspace: WorkspaceWindowView) => Promise<{ ok?: boolean }>;
  setKeyboardShortcuts: (shortcuts: Partial<Record<NativeMenuCommand, string>>) => Promise<{ ok?: boolean }>;
  getSourceLibrarySnapshot: () => Promise<SourceLibraryNativeSnapshotResult>;
  syncSourceLibrarySnapshot: (snapshot: SourceLibraryNativeSnapshotResult['snapshot']) => Promise<{ ok?: boolean; version?: number; error?: string }>;
  applySourceLibraryChange: (change: SourceLibraryNativeChange) => Promise<{ ok?: boolean; version?: number; error?: string }>;
  showAbout: () => Promise<void>;
  openPath: (filePath: string) => Promise<{ ok?: boolean; error?: string }>;
  // At-rest encryption via the OS keychain (safeStorage). Optional: only present on builds that
  // expose it; the renderer falls back to WebCrypto when absent. encrypt/decrypt exchange base64.
  secretAvailable?: () => Promise<boolean>;
  secretEncrypt?: (plaintext: string) => Promise<string | null>;
  secretDecrypt?: (ciphertextBase64: string) => Promise<string | null>;
  onMenuCommand: (callback: (command: NativeMenuCommand) => void) => () => void;
  onProjectPathChanged: (callback: (filePath: string | undefined) => void) => () => void;
  onSourceLibraryChanged: (callback: (event: SourceLibraryNativeEvent) => void) => () => void;
}

export interface SignalLoomAutomationBridge {
  applySourceLibraryChange?: (change: SourceLibraryNativeChange) => Promise<{ ok?: boolean; version?: number; error?: string }>;
}

declare global {
  interface Window {
    signalLoomNative?: SignalLoomNativeBridge;
    signalLoomAutomation?: SignalLoomAutomationBridge;
  }
}

export function isNativeMenuCommand(value: unknown): value is NativeMenuCommand {
  return typeof value === 'string' && NATIVE_MENU_COMMANDS.includes(value as NativeMenuCommand);
}

export function getSignalLoomNativeBridge(): SignalLoomNativeBridge | undefined {
  return typeof window !== 'undefined' ? window.signalLoomNative : undefined;
}

export function dispatchNativeRendererCommand(command: NativeMenuCommand): void {
  window.dispatchEvent(new CustomEvent(NATIVE_RENDERER_COMMAND_EVENT, {
    detail: {
      command,
    },
  }));
}

export function onNativeRendererCommand(
  callback: (command: NativeMenuCommand) => void,
): () => void {
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<{ command?: unknown }>).detail;

    if (isNativeMenuCommand(detail?.command)) {
      callback(detail.command);
    }
  };

  window.addEventListener(NATIVE_RENDERER_COMMAND_EVENT, listener);
  return () => window.removeEventListener(NATIVE_RENDERER_COMMAND_EVENT, listener);
}
