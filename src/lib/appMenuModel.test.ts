import { describe, expect, it } from 'vitest';
import {
  WORKSPACE_APP_LAUNCH_DESCRIPTORS,
  buildAppMenuGroups,
  buildWorkspaceSuiteStandaloneHandoff,
  getWorkspaceAppLaunchDescriptor,
  shouldShowIntegratedAppMenu,
} from './appMenuModel';

describe('renderer app menu model', () => {
  it('keeps static workspace menus while disabling inactive workspaces', () => {
    const groups = buildAppMenuGroups('paper');

    expect(groups.map((group) => group.label)).toEqual([
      'Project',
      'Flow',
      'Video',
      'Image',
      'Paper',
      'View',
      'Help',
    ]);
    expect(groups.find((group) => group.label === 'Paper')?.enabled).toBe(true);
    expect(groups.find((group) => group.label === 'Image')?.enabled).toBe(false);
    expect(groups.find((group) => group.label === 'Video')?.enabled).toBe(false);
  });

  it('keeps project file commands available for the browser integrated menu', () => {
    const fileMenu = buildAppMenuGroups('flow').find((group) => group.label === 'Project');

    expect(fileMenu?.items.map((item) => item.command)).toEqual([
      'file:new',
      'file:open',
      'file:save',
      'file:save-as',
      'file:import-media',
      'file:set-scratch-folder',
      'settings:keyboard-shortcuts',
      'file:export-project',
      'file:export-assets',
    ]);
  });

  it('exposes an application interface toggle in the View menu with Tab as the app shortcut', () => {
    const viewMenu = buildAppMenuGroups('image').find((group) => group.label === 'View');
    const toggleInterface = viewMenu?.items.find((item) => item.command === 'view:toggle-interface');

    expect(toggleInterface).toMatchObject({
      label: 'Toggle Interface',
      shortcut: 'Tab',
    });
  });

  it('exposes paper-specific print and layout commands only through the Paper menu', () => {
    const groups = buildAppMenuGroups('paper');
    const paperMenu = groups.find((group) => group.label === 'Paper');

    expect(paperMenu?.items.map((item) => item.command)).toEqual([
      'view:paper',
      'edit:undo',
      'edit:redo',
      'edit:cut',
      'edit:copy',
      'edit:paste',
      'edit:delete',
      'edit:select-all',
      'edit:deselect',
      'edit:invert-selection',
      'paper:tool-select',
      'paper:tool-hand',
      'paper:tool-text',
      'paper:tool-image',
      'paper:new-document',
      'paper:add-page',
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
    ]);
    expect(paperMenu?.items.find((item) => item.command === 'edit:copy')?.shortcut).toBe('Ctrl+C');
    expect(paperMenu?.items.find((item) => item.command === 'paper:tool-text')?.shortcut).toBe('T');
  });

  it('shows Image edit commands and tool hotkeys in the Image menu', () => {
    const imageMenu = buildAppMenuGroups('image').find((group) => group.label === 'Image');

    expect(imageMenu?.items.map((item) => item.command)).toEqual(expect.arrayContaining([
      'edit:undo',
      'edit:redo',
      'edit:cut',
      'edit:copy',
      'edit:paste',
      'edit:delete',
      'edit:select-all',
      'edit:deselect',
      'edit:invert-selection',
      'image:tool-hand',
      'image:tool-move',
      'image:tool-brush',
      'image:tool-background-eraser',
      'image:tool-magic-eraser',
      'image:tool-sharpen-brush',
      'image:tool-crop',
      'image:tool-text',
      'image:tool-eyedropper',
    ]));
    expect(imageMenu?.items.find((item) => item.command === 'edit:copy')?.shortcut).toBe('Ctrl+C');
    expect(imageMenu?.items.find((item) => item.command === 'image:tool-background-eraser')?.shortcut).toBe('Alt+E');
    expect(imageMenu?.items.find((item) => item.command === 'image:tool-magic-eraser')?.shortcut).toBe('Shift+E');
    expect(imageMenu?.items.find((item) => item.command === 'image:tool-sharpen-brush')?.shortcut).toBe('Shift+R');
  });

  it('includes tutorial and feature help entries in the Help menu', () => {
    const helpMenu = buildAppMenuGroups('flow').find((group) => group.label === 'Help');

    expect(helpMenu?.items.map((item) => item.command)).toEqual([
      'help:project-documentation',
      'help:tutorial',
      'help:feature-help',
      'help:keyboard-shortcuts',
      'help:about',
    ]);
  });

  it('exposes workspace layout defaults through the View menu', () => {
    const viewMenu = buildAppMenuGroups('editor').find((group) => group.label === 'View');

    expect(viewMenu?.items.slice(0, 4).map((item) => item.label)).toEqual([
      'Open/Focus Flow Window',
      'Open/Focus Video Window',
      'Open/Focus Image Window',
      'Open/Focus Paper Window',
    ]);
    expect(viewMenu?.items.map((item) => item.command)).toContain('view:layout-reset');
    expect(viewMenu?.items.find((item) => item.command === 'view:command-palette')?.shortcut).toBe('Ctrl+K');
    expect(viewMenu?.items.map((item) => item.command)).toContain('view:activity-trail');
    expect(viewMenu?.items.map((item) => item.command)).toContain('view:layout-balanced');
    expect(viewMenu?.items.map((item) => item.command)).toContain('view:layout-focus');
    expect(viewMenu?.items.map((item) => item.command)).toContain('view:layout-all-panels');
  });

  it('exposes first-class launch commands in each workspace menu', () => {
    const groups = buildAppMenuGroups('flow');

    expect(groups.find((group) => group.label === 'Flow')?.items[0]).toEqual({
      label: 'Open/Focus Flow Window',
      command: 'view:flow',
      shortcut: 'Ctrl+1',
    });
    expect(groups.find((group) => group.label === 'Video')?.items[0]).toEqual({
      label: 'Open/Focus Video Window',
      command: 'view:editor',
      shortcut: 'Ctrl+2',
    });
    expect(groups.find((group) => group.label === 'Image')?.items[0]).toEqual({
      label: 'Open/Focus Image Window',
      command: 'view:image',
      shortcut: 'Ctrl+3',
    });
    expect(groups.find((group) => group.label === 'Paper')?.items[0]).toEqual({
      label: 'Open/Focus Paper Window',
      command: 'view:paper',
      shortcut: 'Ctrl+4',
    });
  });

  it('publishes deterministic workspace launch descriptors for menu identity and launch mode', () => {
    expect(WORKSPACE_APP_LAUNCH_DESCRIPTORS).toEqual([
      {
        workspace: 'flow',
        appName: 'Flow',
        menuGroupId: 'flow',
        menuGroupLabel: 'Flow',
        launchCommand: 'view:flow',
        launchLabel: 'Open/Focus Flow Window',
        shortcut: 'Ctrl+1',
        iconId: 'flow',
        suiteLaunchStatus: 'available',
        standaloneLaunchStatus: 'native-bridge-window',
      },
      {
        workspace: 'editor',
        appName: 'Video',
        menuGroupId: 'video',
        menuGroupLabel: 'Video',
        launchCommand: 'view:editor',
        launchLabel: 'Open/Focus Video Window',
        shortcut: 'Ctrl+2',
        iconId: 'editor',
        suiteLaunchStatus: 'available',
        standaloneLaunchStatus: 'native-bridge-window',
      },
      {
        workspace: 'image',
        appName: 'Image',
        menuGroupId: 'image',
        menuGroupLabel: 'Image',
        launchCommand: 'view:image',
        launchLabel: 'Open/Focus Image Window',
        shortcut: 'Ctrl+3',
        iconId: 'image',
        suiteLaunchStatus: 'available',
        standaloneLaunchStatus: 'native-bridge-window',
      },
      {
        workspace: 'paper',
        appName: 'Paper',
        menuGroupId: 'paper',
        menuGroupLabel: 'Paper',
        launchCommand: 'view:paper',
        launchLabel: 'Open/Focus Paper Window',
        shortcut: 'Ctrl+4',
        iconId: 'paper',
        suiteLaunchStatus: 'available',
        standaloneLaunchStatus: 'native-bridge-window',
      },
    ]);
  });

  it('keeps launch descriptors aligned with active workspace menu entries', () => {
    for (const descriptor of WORKSPACE_APP_LAUNCH_DESCRIPTORS) {
      const groups = buildAppMenuGroups(descriptor.workspace);
      const group = groups.find((entry) => entry.id === descriptor.menuGroupId);

      expect(group?.label).toBe(descriptor.menuGroupLabel);
      expect(group?.enabled).toBe(true);
      expect(group?.items[0]).toEqual({
        label: descriptor.launchLabel,
        command: descriptor.launchCommand,
        shortcut: descriptor.shortcut,
      });
      expect(getWorkspaceAppLaunchDescriptor(descriptor.workspace)).toBe(descriptor);
    }
  });

  it('builds suite-to-standalone handoff descriptors from launch menu identity', () => {
    expect(buildWorkspaceSuiteStandaloneHandoff('image')).toEqual({
      workspace: 'image',
      appName: 'Image',
      suiteCommand: 'view:image',
      suiteMenuGroupId: 'image',
      suiteMenuGroupLabel: 'Image',
      standaloneEntryPoint: 'signal-loom://workspace/image',
      standaloneMode: 'shared-binary-window',
      handoffStatus: 'ready',
      caveat: 'The Image workspace can be launched from the suite menu or deep-linked into the shared Signal Loom binary; it is not a separately signed standalone executable.',
      signature: 'workspace-handoff:v1|image|view:image|signal-loom://workspace/image|shared-binary-window',
    });
  });

  it('hides the integrated renderer menu when Electron exposes the native bridge', () => {
    expect(shouldShowIntegratedAppMenu(false)).toBe(true);
    expect(shouldShowIntegratedAppMenu(true)).toBe(false);
  });
});
