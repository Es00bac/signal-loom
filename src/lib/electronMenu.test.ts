import { describe, expect, it } from 'vitest';

interface ElectronMenuModule {
  SIGNAL_LOOM_MENU_COMMANDS: Record<string, string>;
  createApplicationMenuTemplate: (options: {
    appName: string;
    isMac?: boolean;
    sendCommand: (command: string) => void;
  }) => Array<{
    label?: string;
    submenu?: Array<{
      label?: string;
      accelerator?: string;
      role?: string;
      click?: () => void;
      submenu?: unknown[];
    }>;
  }>;
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
      sendCommand: () => undefined,
    });

    expect(template.map((entry) => entry.label)).toEqual([
      'File',
      'Edit',
      'View',
      'Timeline',
      'Help',
    ]);
  });

  it('dispatches stable command IDs for native file actions', async () => {
    const { SIGNAL_LOOM_MENU_COMMANDS, createApplicationMenuTemplate } = await loadMenuModule();
    const commands: string[] = [];
    const template = createApplicationMenuTemplate({
      appName: 'Signal Loom',
      sendCommand: (command) => commands.push(command),
    });
    const fileMenu = template.find((entry) => entry.label === 'File');
    const saveItem = fileMenu?.submenu?.find((entry) => entry.label === 'Save');
    const saveAsItem = fileMenu?.submenu?.find((entry) => entry.label === 'Save As...');

    saveItem?.click?.();
    saveAsItem?.click?.();

    expect(SIGNAL_LOOM_MENU_COMMANDS.fileSave).toBe('file:save');
    expect(saveItem?.accelerator).toBe('CommandOrControl+S');
    expect(saveAsItem?.accelerator).toBe('CommandOrControl+Shift+S');
    expect(commands).toEqual(['file:save', 'file:save-as']);
  });

  it('keeps editor undo and redo as app commands while text editing roles stay native', async () => {
    const { createApplicationMenuTemplate } = await loadMenuModule();
    const commands: string[] = [];
    const template = createApplicationMenuTemplate({
      appName: 'Signal Loom',
      sendCommand: (command) => commands.push(command),
    });
    const editMenu = template.find((entry) => entry.label === 'Edit');

    editMenu?.submenu?.find((entry) => entry.label === 'Undo')?.click?.();
    editMenu?.submenu?.find((entry) => entry.label === 'Redo')?.click?.();

    expect(editMenu?.submenu?.some((entry) => entry.role === 'cut')).toBe(true);
    expect(editMenu?.submenu?.some((entry) => entry.role === 'paste')).toBe(true);
    expect(commands).toEqual(['edit:undo', 'edit:redo']);
  });
});
