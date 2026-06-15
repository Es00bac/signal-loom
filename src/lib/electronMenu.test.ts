import { describe, expect, it } from 'vitest';

interface ElectronMenuModule {
  SIGNAL_LOOM_MENU_COMMANDS: Record<string, string>;
  DESKTOP_WORKSPACE_MENU_DESCRIPTORS: DesktopWorkspaceMenuDescriptor[];
  createApplicationMenuTemplate: (options: {
    appName: string;
    isMac?: boolean;
    activeWorkspace?: string;
    keyboardShortcuts?: Record<string, string>;
    sendCommand: (command: string) => void;
  }) => ElectronMenuItem[];
}

interface ElectronMenuItem {
  label?: string;
  enabled?: boolean;
  accelerator?: string;
  role?: string;
  click?: () => void;
  submenu?: ElectronMenuItem[];
}

interface DesktopWorkspaceMenuDescriptor {
  workspace: string;
  menuLabel: string;
  launchLabel: string;
  launchCommand: string;
  accelerator: string;
  launchSurface: string;
}

async function loadMenuModule(): Promise<ElectronMenuModule> {
  // @ts-expect-error CommonJS Electron helper lives outside the renderer tsconfig module graph.
  return await import('../../electron/menu.cjs') as ElectronMenuModule;
}

describe('Electron native menu template', () => {
  it('exposes useful KDE/globalmenu top-level menus', async () => {
    const { createApplicationMenuTemplate } = await loadMenuModule();
    const template = createApplicationMenuTemplate({
      appName: 'Signal Loom',
      activeWorkspace: 'paper',
      sendCommand: () => undefined,
    });

    expect(template.map((entry) => entry.label)).toEqual([
      'Project',
      'Flow',
      'Video',
      'Image',
      'Paper',
      'View',
      'Help',
    ]);
    expect(template.find((entry) => entry.label === 'Paper')?.enabled).toBe(true);
    expect(template.find((entry) => entry.label === 'Image')?.enabled).toBe(false);
  });

  it('dispatches stable command IDs for native file actions', async () => {
    const { SIGNAL_LOOM_MENU_COMMANDS, createApplicationMenuTemplate } = await loadMenuModule();
    const commands: string[] = [];
    const template = createApplicationMenuTemplate({
      appName: 'Signal Loom',
      sendCommand: (command) => commands.push(command),
    });
    const fileMenu = template.find((entry) => entry.label === 'Project');
    const saveItem = fileMenu?.submenu?.find((entry) => entry.label === 'Save');
    const saveAsItem = fileMenu?.submenu?.find((entry) => entry.label === 'Save As...');

    saveItem?.click?.();
    saveAsItem?.click?.();

    expect(SIGNAL_LOOM_MENU_COMMANDS.fileSave).toBe('file:save');
    expect(saveItem?.accelerator).toBe('CommandOrControl+S');
    expect(saveAsItem?.accelerator).toBe('CommandOrControl+Shift+S');
    expect(commands).toEqual(['file:save', 'file:save-as']);
  });

  it('exposes Activity Trail in the native View menu', async () => {
    const { SIGNAL_LOOM_MENU_COMMANDS, createApplicationMenuTemplate } = await loadMenuModule();
    const commands: string[] = [];
    const template = createApplicationMenuTemplate({
      appName: 'Signal Loom',
      sendCommand: (command) => commands.push(command),
    });
    const viewMenu = template.find((entry) => entry.label === 'View');
    const activityTrail = viewMenu?.submenu?.find((entry) => entry.label === 'Activity Trail...');

    activityTrail?.click?.();

    expect(SIGNAL_LOOM_MENU_COMMANDS.viewActivityTrail).toBe('view:activity-trail');
    expect(commands).toEqual(['view:activity-trail']);
  });

  it('exposes the interface toggle as a native View command with Tab accelerator', async () => {
    const { SIGNAL_LOOM_MENU_COMMANDS, createApplicationMenuTemplate } = await loadMenuModule();
    const commands: string[] = [];
    const template = createApplicationMenuTemplate({
      appName: 'Signal Loom',
      sendCommand: (command) => commands.push(command),
    });
    const viewMenu = template.find((entry) => entry.label === 'View');
    const toggleInterface = viewMenu?.submenu?.find((entry) => entry.label === 'Toggle Interface');

    toggleInterface?.click?.();

    expect(SIGNAL_LOOM_MENU_COMMANDS.viewToggleInterface).toBe('view:toggle-interface');
    expect(toggleInterface?.accelerator).toBe('Tab');
    expect(commands).toEqual(['view:toggle-interface']);
  });

  it('keeps editor undo/redo and clipboard actions as app commands', async () => {
    const { createApplicationMenuTemplate } = await loadMenuModule();
    const commands: string[] = [];
    const template = createApplicationMenuTemplate({
      appName: 'Signal Loom',
      activeWorkspace: 'editor',
      sendCommand: (command) => commands.push(command),
    });
    const editMenu = template.find((entry) => entry.label === 'Video');

    editMenu?.submenu?.find((entry) => entry.label === 'Undo')?.click?.();
    editMenu?.submenu?.find((entry) => entry.label === 'Redo')?.click?.();
    editMenu?.submenu?.find((entry) => entry.label === 'Cut')?.click?.();
    editMenu?.submenu?.find((entry) => entry.label === 'Paste')?.click?.();

    expect(editMenu?.submenu?.some((entry) => entry.role === 'cut')).toBe(false);
    expect(editMenu?.submenu?.some((entry) => entry.role === 'paste')).toBe(false);
    expect(editMenu?.submenu?.find((entry) => entry.label === 'Cut')?.accelerator).toBe('CommandOrControl+X');
    expect(editMenu?.submenu?.find((entry) => entry.label === 'Paste')?.accelerator).toBe('CommandOrControl+V');
    expect(commands).toEqual(['edit:undo', 'edit:redo', 'edit:cut', 'edit:paste']);
  });

  it('exposes paper print commands in the Paper menu', async () => {
    const { createApplicationMenuTemplate } = await loadMenuModule();
    const commands: string[] = [];
    const template = createApplicationMenuTemplate({
      appName: 'Signal Loom',
      activeWorkspace: 'paper',
      sendCommand: (command) => commands.push(command),
    });
    const paperMenu = template.find((entry) => entry.label === 'Paper');
    const exportPdf = paperMenu?.submenu?.find((entry) => entry.label === 'Export Print PDF...');
    const exportKdp = paperMenu?.submenu?.find((entry) => entry.label === 'Export KDP Assets...');
    const exportSpreads = paperMenu?.submenu?.find((entry) => entry.label === 'Export Reader Spreads HTML...');
    const snapToGuides = paperMenu?.submenu?.find((entry) => entry.label === 'Toggle Snap to Guides');
    const snapToGrid = paperMenu?.submenu?.find((entry) => entry.label === 'Toggle Snap to Grid');
    const toggleSpreads = paperMenu?.submenu?.find((entry) => entry.label === 'Toggle Spreads');

    exportPdf?.click?.();
    exportKdp?.click?.();
    exportSpreads?.click?.();
    snapToGuides?.click?.();
    snapToGrid?.click?.();
    toggleSpreads?.click?.();

    expect(paperMenu?.enabled).toBe(true);
    expect(exportPdf?.accelerator).toBe('CommandOrControl+P');
    expect(commands).toEqual([
      'paper:export-pdf',
      'paper:export-kdp-assets',
      'paper:export-reader-spreads-html',
      'paper:toggle-snap-to-guides',
      'paper:toggle-snap-to-grid',
      'paper:toggle-spreads',
    ]);
  });

  it('exposes Paper selection commands in the native menu', async () => {
    const { createApplicationMenuTemplate } = await loadMenuModule();
    const commands: string[] = [];
    const template = createApplicationMenuTemplate({
      appName: 'Signal Loom',
      activeWorkspace: 'paper',
      sendCommand: (command) => commands.push(command),
    });
    const paperMenu = template.find((entry) => entry.label === 'Paper');

    paperMenu?.submenu?.find((entry) => entry.label === 'Select All')?.click?.();
    paperMenu?.submenu?.find((entry) => entry.label === 'Deselect')?.click?.();
    paperMenu?.submenu?.find((entry) => entry.label === 'Invert Selection')?.click?.();

    expect(commands).toEqual(['edit:select-all', 'edit:deselect', 'edit:invert-selection']);
  });

  it('dispatches Paper edit and tool commands with native accelerators', async () => {
    const { createApplicationMenuTemplate } = await loadMenuModule();
    const commands: string[] = [];
    const template = createApplicationMenuTemplate({
      appName: 'Signal Loom',
      activeWorkspace: 'paper',
      sendCommand: (command) => commands.push(command),
    });
    const paperMenu = template.find((entry) => entry.label === 'Paper');
    const copyItem = paperMenu?.submenu?.find((entry) => entry.label === 'Copy');
    const pasteItem = paperMenu?.submenu?.find((entry) => entry.label === 'Paste');
    const textTool = paperMenu?.submenu?.find((entry) => entry.label === 'Text Tool');

    copyItem?.click?.();
    pasteItem?.click?.();
    textTool?.click?.();

    expect(copyItem?.accelerator).toBe('CommandOrControl+C');
    expect(pasteItem?.accelerator).toBe('CommandOrControl+V');
    expect(textTool?.accelerator).toBe('T');
    expect(commands).toEqual(['edit:copy', 'edit:paste', 'paper:tool-text']);
  });

  it('uses customized shortcut accelerators when the renderer sends overrides', async () => {
    const { createApplicationMenuTemplate } = await loadMenuModule();
    const template = createApplicationMenuTemplate({
      appName: 'Signal Loom',
      activeWorkspace: 'image',
      keyboardShortcuts: {
        'image:tool-brush': 'Ctrl+Shift+B',
        'edit:delete': 'Backspace',
      },
      sendCommand: () => undefined,
    });
    const imageMenu = template.find((entry) => entry.label === 'Image');

    expect(imageMenu?.submenu?.find((entry) => entry.label === 'Brush Tool')?.accelerator).toBe('CommandOrControl+Shift+B');
    expect(imageMenu?.submenu?.find((entry) => entry.label === 'Delete')?.accelerator).toBe('Backspace');
  });

  it('dispatches Image edit commands instead of relying on native text roles', async () => {
    const { createApplicationMenuTemplate } = await loadMenuModule();
    const commands: string[] = [];
    const template = createApplicationMenuTemplate({
      appName: 'Signal Loom',
      activeWorkspace: 'image',
      sendCommand: (command) => commands.push(command),
    });
    const imageMenu = template.find((entry) => entry.label === 'Image');
    const cutItem = imageMenu?.submenu?.find((entry) => entry.label === 'Cut');
    const sharpenItem = imageMenu?.submenu?.find((entry) => entry.label === 'Sharpen Brush');

    cutItem?.click?.();
    sharpenItem?.click?.();

    expect(cutItem?.role).toBeUndefined();
    expect(cutItem?.accelerator).toBe('CommandOrControl+X');
    expect(sharpenItem?.accelerator).toBe('Shift+R');
    expect(commands).toEqual(['edit:cut', 'image:tool-sharpen-brush']);
  });

  it('exposes Paper dockable panel toggles and reset in the native menu', async () => {
    const { createApplicationMenuTemplate } = await loadMenuModule();
    const commands: string[] = [];
    const template = createApplicationMenuTemplate({
      appName: 'Signal Loom',
      activeWorkspace: 'paper',
      sendCommand: (command) => commands.push(command),
    });
    const paperMenu = template.find((entry) => entry.label === 'Paper');

    paperMenu?.submenu?.find((entry) => entry.label === 'Toggle Paper Tools Panel')?.click?.();
    paperMenu?.submenu?.find((entry) => entry.label === 'Document / Export Bar (Pinned)')?.click?.();
    paperMenu?.submenu?.find((entry) => entry.label === 'Toggle Inspector Panel')?.click?.();
    paperMenu?.submenu?.find((entry) => entry.label === 'Toggle Preflight Panel')?.click?.();
    paperMenu?.submenu?.find((entry) => entry.label === 'Toggle Linked Assets Panel')?.click?.();
    paperMenu?.submenu?.find((entry) => entry.label === 'Toggle Print Production Panel')?.click?.();
    paperMenu?.submenu?.find((entry) => entry.label === 'Reset Paper Panels')?.click?.();

    expect(commands).toEqual([
      'paper:toggle-tools-panel',
      'paper:toggle-document-strip-panel',
      'paper:toggle-inspector-panel',
      'paper:toggle-preflight-panel',
      'paper:toggle-linked-assets-panel',
      'paper:toggle-dtp-parity-panel',
      'paper:reset-panels',
    ]);
  });

  it('exposes workspace layout defaults in the native View menu', async () => {
    const { createApplicationMenuTemplate } = await loadMenuModule();
    const commands: string[] = [];
    const template = createApplicationMenuTemplate({
      appName: 'Signal Loom',
      activeWorkspace: 'editor',
      sendCommand: (command) => commands.push(command),
    });
    const viewMenu = template.find((entry) => entry.label === 'View');
    const layoutMenu = viewMenu?.submenu?.find((entry) => entry.label === 'Workspace Layout Defaults');

    expect(viewMenu?.submenu?.slice(0, 4).map((entry) => entry.label)).toEqual([
      'Open/Focus Flow Window',
      'Open/Focus Video Window',
      'Open/Focus Image Window',
      'Open/Focus Paper Window',
    ]);
    expect(viewMenu?.submenu?.find((entry) => entry.label === 'Command Palette...')?.accelerator).toBe('CommandOrControl+K');
    expect(layoutMenu?.submenu?.map((entry) => entry.label)).toEqual([
      'Reset Current Workspace Panels',
      'Balanced Default',
      'Focus Canvas',
      'Show All Panels',
    ]);

    viewMenu?.submenu?.find((entry) => entry.label === 'Command Palette...')?.click?.();
    layoutMenu?.submenu?.forEach((entry) => entry.click?.());

    expect(commands).toEqual([
      'view:command-palette',
      'view:layout-reset',
      'view:layout-balanced',
      'view:layout-focus',
      'view:layout-all-panels',
    ]);
  });

  it('exposes first-class launch commands in each native workspace menu', async () => {
    const { createApplicationMenuTemplate } = await loadMenuModule();
    const commands: string[] = [];
    const template = createApplicationMenuTemplate({
      appName: 'Signal Loom',
      activeWorkspace: 'image',
      sendCommand: (command) => commands.push(command),
    });

    const expected = [
      ['Flow', 'Open/Focus Flow Window', 'view:flow', 'CommandOrControl+1'],
      ['Video', 'Open/Focus Video Window', 'view:editor', 'CommandOrControl+2'],
      ['Image', 'Open/Focus Image Window', 'view:image', 'CommandOrControl+3'],
      ['Paper', 'Open/Focus Paper Window', 'view:paper', 'CommandOrControl+4'],
    ] as const;

    for (const [menuLabel, itemLabel, command, accelerator] of expected) {
      const item = template.find((entry) => entry.label === menuLabel)?.submenu?.[0];
      expect(item?.label).toBe(itemLabel);
      expect(item?.accelerator).toBe(accelerator);
      item?.click?.();
      expect(commands.at(-1)).toBe(command);
    }

    expect(commands).toEqual(['view:flow', 'view:editor', 'view:image', 'view:paper']);
  });

  it('publishes deterministic workspace menu descriptors aligned with launch menu items', async () => {
    const { DESKTOP_WORKSPACE_MENU_DESCRIPTORS, createApplicationMenuTemplate } = await loadMenuModule();
    const template = createApplicationMenuTemplate({
      appName: 'Signal Loom',
      activeWorkspace: 'flow',
      sendCommand: () => undefined,
    });

    expect(DESKTOP_WORKSPACE_MENU_DESCRIPTORS).toEqual([
      {
        workspace: 'flow',
        menuLabel: 'Flow',
        launchLabel: 'Open/Focus Flow Window',
        launchCommand: 'view:flow',
        accelerator: 'CommandOrControl+1',
        launchSurface: 'electron-native-menu',
      },
      {
        workspace: 'editor',
        menuLabel: 'Video',
        launchLabel: 'Open/Focus Video Window',
        launchCommand: 'view:editor',
        accelerator: 'CommandOrControl+2',
        launchSurface: 'electron-native-menu',
      },
      {
        workspace: 'image',
        menuLabel: 'Image',
        launchLabel: 'Open/Focus Image Window',
        launchCommand: 'view:image',
        accelerator: 'CommandOrControl+3',
        launchSurface: 'electron-native-menu',
      },
      {
        workspace: 'paper',
        menuLabel: 'Paper',
        launchLabel: 'Open/Focus Paper Window',
        launchCommand: 'view:paper',
        accelerator: 'CommandOrControl+4',
        launchSurface: 'electron-native-menu',
      },
    ]);

    for (const descriptor of DESKTOP_WORKSPACE_MENU_DESCRIPTORS) {
      const menu = template.find((entry) => entry.label === descriptor.menuLabel);
      const launchItem = menu?.submenu?.find((entry) => entry.label === descriptor.launchLabel);

      expect(launchItem?.accelerator).toBe(descriptor.accelerator);
      const commands: string[] = [];
      createApplicationMenuTemplate({
        appName: 'Signal Loom',
        activeWorkspace: descriptor.workspace,
        sendCommand: (command) => commands.push(command),
      })
        .find((entry) => entry.label === descriptor.menuLabel)
        ?.submenu?.find((entry) => entry.label === descriptor.launchLabel)
        ?.click?.();
      expect(commands).toEqual([descriptor.launchCommand]);
    }
  });
});
