import type { NativeMenuCommand } from './nativeApp';
import type { WorkspaceView } from '../types/flow';
import { getKeyboardShortcutLabel, type KeyboardShortcutMap } from './keyboardShortcuts';

export interface AppMenuItem {
  label: string;
  command: NativeMenuCommand;
  shortcut?: string;
}

export interface AppMenuGroup {
  id: string;
  label: string;
  enabled: boolean;
  items: AppMenuItem[];
}

export function buildAppMenuGroups(activeWorkspace: WorkspaceView, shortcuts: KeyboardShortcutMap = {}): AppMenuGroup[] {
  const groups: AppMenuGroup[] = [
  {
    id: 'project',
    label: 'Project',
    enabled: true,
    items: [
      { label: 'New Project', command: 'file:new', shortcut: 'Ctrl+N' },
      { label: 'Open...', command: 'file:open', shortcut: 'Ctrl+O' },
      { label: 'Save', command: 'file:save', shortcut: 'Ctrl+S' },
      { label: 'Save As...', command: 'file:save-as', shortcut: 'Ctrl+Shift+S' },
      { label: 'Import Media...', command: 'file:import-media', shortcut: 'Ctrl+I' },
      { label: 'Set Scratch Folder...', command: 'file:set-scratch-folder' },
      { label: 'Keyboard Shortcuts...', command: 'settings:keyboard-shortcuts' },
      { label: 'Export .sloom Project...', command: 'file:export-project' },
      { label: 'Export Assets...', command: 'file:export-assets' },
    ],
  },
  {
    id: 'flow',
    label: 'Flow',
    enabled: activeWorkspace === 'flow',
    items: [
      { label: 'Open/Focus Flow Window', command: 'view:flow', shortcut: 'Ctrl+1' },
      { label: 'Add Source Bin Node', command: 'flow:add-source-bin' },
      { label: 'Export Flow Assets...', command: 'file:export-assets' },
    ],
  },
  {
    id: 'video',
    label: 'Video',
    enabled: activeWorkspace === 'editor',
    items: [
      { label: 'Open/Focus Video Window', command: 'view:editor', shortcut: 'Ctrl+2' },
      { label: 'Undo', command: 'edit:undo', shortcut: 'Ctrl+Z' },
      { label: 'Redo', command: 'edit:redo', shortcut: 'Ctrl+Shift+Z' },
      { label: 'Delete', command: 'edit:delete', shortcut: 'Del' },
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
    id: 'image',
    label: 'Image',
    enabled: activeWorkspace === 'image',
    items: [
      { label: 'Open/Focus Image Window', command: 'view:image', shortcut: 'Ctrl+3' },
      { label: 'Undo', command: 'edit:undo', shortcut: 'Ctrl+Z' },
      { label: 'Redo', command: 'edit:redo', shortcut: 'Ctrl+Shift+Z' },
      { label: 'Cut', command: 'edit:cut', shortcut: 'Ctrl+X' },
      { label: 'Copy', command: 'edit:copy', shortcut: 'Ctrl+C' },
      { label: 'Paste', command: 'edit:paste', shortcut: 'Ctrl+V' },
      { label: 'Delete', command: 'edit:delete', shortcut: 'Del' },
      { label: 'Select All', command: 'edit:select-all', shortcut: 'Ctrl+A' },
      { label: 'Deselect', command: 'edit:deselect', shortcut: 'Ctrl+D' },
      { label: 'Invert Selection', command: 'edit:invert-selection', shortcut: 'Ctrl+Shift+I' },
      { label: 'Hand Tool', command: 'image:tool-hand', shortcut: 'H' },
      { label: 'Move Tool', command: 'image:tool-move', shortcut: 'V' },
      { label: 'Marquee Tool', command: 'image:tool-marquee', shortcut: 'M' },
      { label: 'Lasso Tool', command: 'image:tool-lasso', shortcut: 'L' },
      { label: 'Magic Wand Tool', command: 'image:tool-magic-wand', shortcut: 'W' },
      { label: 'Brush Tool', command: 'image:tool-brush', shortcut: 'B' },
      { label: 'Eraser Tool', command: 'image:tool-eraser', shortcut: 'E' },
      { label: 'Clone Stamp Tool', command: 'image:tool-clone-stamp', shortcut: 'S' },
      { label: 'Spot Heal Tool', command: 'image:tool-spot-heal', shortcut: 'J' },
      { label: 'Blur Brush', command: 'image:tool-blur-brush', shortcut: 'R' },
      { label: 'Sharpen Brush', command: 'image:tool-sharpen-brush', shortcut: 'Shift+R' },
      { label: 'Smudge Brush', command: 'image:tool-smudge-brush', shortcut: 'U' },
      { label: 'Dodge Brush', command: 'image:tool-dodge-brush', shortcut: 'O' },
      { label: 'Burn Brush', command: 'image:tool-burn-brush', shortcut: 'Shift+O' },
      { label: 'Sponge Saturate Brush', command: 'image:tool-sponge-saturate', shortcut: 'P' },
      { label: 'Sponge Desaturate Brush', command: 'image:tool-sponge-desaturate', shortcut: 'Shift+P' },
      { label: 'Paint Bucket Tool', command: 'image:tool-paint-bucket', shortcut: 'G' },
      { label: 'Gradient Tool', command: 'image:tool-gradient', shortcut: 'Shift+G' },
      { label: 'Rectangle Shape Tool', command: 'image:tool-rectangle-shape', shortcut: 'X' },
      { label: 'Ellipse Shape Tool', command: 'image:tool-ellipse-shape', shortcut: 'Shift+X' },
      { label: 'Crop Tool', command: 'image:tool-crop', shortcut: 'C' },
      { label: 'Text Tool', command: 'image:tool-text', shortcut: 'T' },
      { label: 'Eyedropper Tool', command: 'image:tool-eyedropper', shortcut: 'I' },
      { label: 'Download Image File...', command: 'image:export-visible' },
      { label: 'Download PSD...', command: 'image:export-psd' },
    ],
  },
  {
    id: 'paper',
    label: 'Paper',
    enabled: activeWorkspace === 'paper',
    items: [
      { label: 'Undo', command: 'edit:undo', shortcut: 'Ctrl+Z' },
      { label: 'Redo', command: 'edit:redo', shortcut: 'Ctrl+Shift+Z' },
      { label: 'Cut', command: 'edit:cut', shortcut: 'Ctrl+X' },
      { label: 'Copy', command: 'edit:copy', shortcut: 'Ctrl+C' },
      { label: 'Paste', command: 'edit:paste', shortcut: 'Ctrl+V' },
      { label: 'Delete', command: 'edit:delete', shortcut: 'Del' },
      { label: 'Select All', command: 'edit:select-all', shortcut: 'Ctrl+A' },
      { label: 'Deselect', command: 'edit:deselect', shortcut: 'Ctrl+D' },
      { label: 'Invert Selection', command: 'edit:invert-selection', shortcut: 'Ctrl+Shift+I' },
      { label: 'Select Tool', command: 'paper:tool-select', shortcut: 'V' },
      { label: 'Hand Tool', command: 'paper:tool-hand', shortcut: 'H' },
      { label: 'Text Tool', command: 'paper:tool-text', shortcut: 'T' },
      { label: 'Image Tool', command: 'paper:tool-image', shortcut: 'I' },
      { label: 'New Paper Document', command: 'paper:new-document', shortcut: 'Ctrl+Alt+N' },
      { label: 'Add Page', command: 'paper:add-page', shortcut: 'Ctrl+Alt+P' },
      { label: 'Export Print PDF...', command: 'paper:export-pdf', shortcut: 'Ctrl+P' },
      { label: 'Export KDP Assets...', command: 'paper:export-kdp-assets' },
      { label: 'Export Reader Spreads PDF...', command: 'paper:export-reader-spreads-pdf' },
      { label: 'Export Booklet Proof PDF...', command: 'paper:export-booklet-proof-pdf' },
      { label: 'Export Webcomic Page Images...', command: 'paper:export-webcomic-images' },
      { label: 'Export Print HTML...', command: 'paper:export-html' },
      { label: 'Export Reader Spreads HTML...', command: 'paper:export-reader-spreads-html' },
      { label: 'Export Booklet Proof HTML...', command: 'paper:export-booklet-proof-html' },
      { label: 'Package for Print...', command: 'paper:package-print' },
      { label: 'Export IDML...', command: 'paper:export-idml' },
      { label: 'Export Stories TXT...', command: 'paper:export-stories-txt' },
      { label: 'Export Stories HTML...', command: 'paper:export-stories-html' },
      { label: 'Export Stories RTF...', command: 'paper:export-stories-rtf' },
      { label: 'Export Stories DOCX...', command: 'paper:export-stories-docx' },
      { label: 'Export CBZ...', command: 'paper:export-cbz' },
      { label: 'Export Paper JSON...', command: 'paper:export-json' },
      { label: 'Import Paper JSON...', command: 'paper:import-json' },
      { label: 'Add Text Frame', command: 'paper:add-text-frame' },
      { label: 'Add Image Frame', command: 'paper:add-image-frame' },
      { label: 'Add Speech Bubble', command: 'paper:add-speech-bubble' },
      { label: 'Add Thought Bubble', command: 'paper:add-thought-bubble' },
      { label: 'Add Caption', command: 'paper:add-caption' },
      { label: 'Toggle Rulers', command: 'paper:toggle-rulers' },
      { label: 'Toggle Guides', command: 'paper:toggle-guides' },
      { label: 'Toggle Grid', command: 'paper:toggle-grid' },
      { label: 'Toggle Snap to Guides', command: 'paper:toggle-snap-to-guides' },
      { label: 'Toggle Snap to Grid', command: 'paper:toggle-snap-to-grid' },
      { label: 'Toggle Spreads', command: 'paper:toggle-spreads' },
      { label: 'Toggle Start on Right', command: 'paper:toggle-start-on-right' },
      { label: 'Toggle Paper Tools Panel', command: 'paper:toggle-tools-panel' },
      { label: 'Document / Export Bar (Pinned)', command: 'paper:toggle-document-strip-panel' },
      { label: 'Toggle Inspector Panel', command: 'paper:toggle-inspector-panel' },
      { label: 'Toggle Preflight Panel', command: 'paper:toggle-preflight-panel' },
      { label: 'Toggle Linked Assets Panel', command: 'paper:toggle-linked-assets-panel' },
      { label: 'Toggle Print Production Panel', command: 'paper:toggle-dtp-parity-panel' },
      { label: 'Reset Paper Panels', command: 'paper:reset-panels' },
    ],
  },
  {
    id: 'view',
    label: 'View',
    enabled: true,
    items: [
      { label: 'Open/Focus Flow Window', command: 'view:flow', shortcut: 'Ctrl+1' },
      { label: 'Open/Focus Video Window', command: 'view:editor', shortcut: 'Ctrl+2' },
      { label: 'Open/Focus Image Window', command: 'view:image', shortcut: 'Ctrl+3' },
      { label: 'Open/Focus Paper Window', command: 'view:paper', shortcut: 'Ctrl+4' },
      { label: 'Command Palette...', command: 'view:command-palette', shortcut: 'Ctrl+K' },
      { label: 'Activity Trail...', command: 'view:activity-trail' },
      { label: 'Toggle Source Bin', command: 'view:toggle-source-bin' },
      { label: 'Toggle Inspector', command: 'view:toggle-inspector' },
      { label: 'Reset Current Workspace Panels', command: 'view:layout-reset' },
      { label: 'Balanced Default', command: 'view:layout-balanced' },
      { label: 'Focus Canvas', command: 'view:layout-focus' },
      { label: 'Show All Panels', command: 'view:layout-all-panels' },
    ],
  },
  {
    id: 'help',
    label: 'Help',
    enabled: true,
    items: [
      { label: 'Project Documentation', command: 'help:project-documentation' },
      { label: 'Tutorial', command: 'help:tutorial' },
      { label: 'Feature Help', command: 'help:feature-help' },
      { label: 'Keyboard Shortcuts', command: 'help:keyboard-shortcuts', shortcut: 'F1' },
      { label: 'About Signal Loom', command: 'help:about' },
    ],
  },
  ];

  return groups.map((group) => ({
    ...group,
    items: group.items.map((item) => ({
      ...item,
      shortcut: getKeyboardShortcutLabel(item.command, shortcuts) ?? item.shortcut,
    })),
  }));
}

export const APP_MENU_GROUPS: AppMenuGroup[] = buildAppMenuGroups('flow');

export function shouldShowIntegratedAppMenu(hasNativeBridge: boolean): boolean {
  return !hasNativeBridge;
}
