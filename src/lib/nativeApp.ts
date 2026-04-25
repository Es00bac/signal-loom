import type { FlowProjectDocument } from './projectLibrary';
import type { SourceBinLibraryItem } from '../store/sourceBinStore';

export const NATIVE_RENDERER_COMMAND_EVENT = 'signal-loom:native-renderer-command';

export const NATIVE_MENU_COMMANDS = [
  'file:new',
  'file:open',
  'file:save',
  'file:save-as',
  'file:import-media',
  'file:set-scratch-folder',
  'file:export-project-json',
  'file:export-assets',
  'edit:undo',
  'edit:redo',
  'edit:delete',
  'view:flow',
  'view:editor',
  'view:toggle-source-bin',
  'view:toggle-inspector',
  'timeline:select',
  'timeline:cut',
  'timeline:slip',
  'timeline:hand',
  'timeline:snap',
  'timeline:add-keyframe',
  'timeline:previous-keyframe',
  'timeline:next-keyframe',
  'help:project-documentation',
  'help:tutorial',
  'help:feature-help',
  'help:keyboard-shortcuts',
  'help:about',
] as const;

export type NativeMenuCommand = typeof NATIVE_MENU_COMMANDS[number];

export interface NativeState {
  currentProjectPath?: string;
  currentScratchDirectoryPath?: string;
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

export type NativeImportedMediaItem = SourceBinLibraryItem & {
  nativeFilePath?: string;
};

export interface NativeImportMediaResult {
  canceled: boolean;
  items: NativeImportedMediaItem[];
}

export interface SignalLoomNativeBridge {
  getNativeState: () => Promise<NativeState>;
  clearProjectPath: () => Promise<{ ok?: boolean }>;
  openProjectFile: () => Promise<NativeProjectFileResult>;
  saveProjectFile: (document: FlowProjectDocument) => Promise<NativeProjectFileResult>;
  saveProjectFileAs: (document: FlowProjectDocument) => Promise<NativeProjectFileResult>;
  importMediaFiles: (options?: { scratchDirectoryPath?: string }) => Promise<NativeImportMediaResult>;
  chooseScratchDirectory: () => Promise<NativeScratchDirectoryResult>;
  showAbout: () => Promise<void>;
  openPath: (filePath: string) => Promise<{ ok?: boolean; error?: string }>;
  onMenuCommand: (callback: (command: NativeMenuCommand) => void) => () => void;
  onProjectPathChanged: (callback: (filePath: string | undefined) => void) => () => void;
}

declare global {
  interface Window {
    signalLoomNative?: SignalLoomNativeBridge;
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
