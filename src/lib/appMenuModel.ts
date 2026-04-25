import type { NativeMenuCommand } from './nativeApp';

export interface AppMenuItem {
  label: string;
  command: NativeMenuCommand;
  shortcut?: string;
}

export interface AppMenuGroup {
  id: string;
  label: string;
  items: AppMenuItem[];
}

export const APP_MENU_GROUPS: AppMenuGroup[] = [
  {
    id: 'file',
    label: 'File',
    items: [
      { label: 'New Project', command: 'file:new', shortcut: 'Ctrl+N' },
      { label: 'Open...', command: 'file:open', shortcut: 'Ctrl+O' },
      { label: 'Save', command: 'file:save', shortcut: 'Ctrl+S' },
      { label: 'Save As...', command: 'file:save-as', shortcut: 'Ctrl+Shift+S' },
      { label: 'Import Media...', command: 'file:import-media', shortcut: 'Ctrl+I' },
      { label: 'Set Scratch Folder...', command: 'file:set-scratch-folder' },
      { label: 'Export Portable Project...', command: 'file:export-project-json' },
      { label: 'Export Assets...', command: 'file:export-assets' },
    ],
  },
  {
    id: 'edit',
    label: 'Edit',
    items: [
      { label: 'Undo', command: 'edit:undo', shortcut: 'Ctrl+Z' },
      { label: 'Redo', command: 'edit:redo', shortcut: 'Ctrl+Shift+Z' },
      { label: 'Delete', command: 'edit:delete', shortcut: 'Del' },
    ],
  },
  {
    id: 'view',
    label: 'View',
    items: [
      { label: 'Flow Workspace', command: 'view:flow', shortcut: 'Ctrl+1' },
      { label: 'Editor Workspace', command: 'view:editor', shortcut: 'Ctrl+2' },
      { label: 'Toggle Source Bin', command: 'view:toggle-source-bin' },
      { label: 'Toggle Inspector', command: 'view:toggle-inspector' },
    ],
  },
  {
    id: 'timeline',
    label: 'Timeline',
    items: [
      { label: 'Select Tool', command: 'timeline:select', shortcut: 'V' },
      { label: 'Cut Tool', command: 'timeline:cut', shortcut: 'C' },
      { label: 'Slip Tool', command: 'timeline:slip', shortcut: 'S' },
      { label: 'Hand Tool', command: 'timeline:hand', shortcut: 'H' },
      { label: 'Snap Marker Tool', command: 'timeline:snap', shortcut: 'M' },
      { label: 'Add or Update Keyframe', command: 'timeline:add-keyframe', shortcut: 'K' },
      { label: 'Previous Keyframe', command: 'timeline:previous-keyframe', shortcut: '[' },
      { label: 'Next Keyframe', command: 'timeline:next-keyframe', shortcut: ']' },
    ],
  },
  {
    id: 'help',
    label: 'Help',
    items: [
      { label: 'Project Documentation', command: 'help:project-documentation' },
      { label: 'Tutorial', command: 'help:tutorial' },
      { label: 'Feature Help', command: 'help:feature-help' },
      { label: 'Keyboard Shortcuts', command: 'help:keyboard-shortcuts', shortcut: 'F1' },
      { label: 'About Signal Loom', command: 'help:about' },
    ],
  },
];

export function shouldShowIntegratedAppMenu(hasNativeBridge: boolean): boolean {
  return !hasNativeBridge;
}
