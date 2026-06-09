import { describe, expect, it } from 'vitest';
import { buildAppMenuGroups, shouldShowIntegratedAppMenu } from './appMenuModel';

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

  it('exposes paper-specific print and layout commands only through the Paper menu', () => {
    const groups = buildAppMenuGroups('paper');
    const paperMenu = groups.find((group) => group.label === 'Paper');

    expect(paperMenu?.items.map((item) => item.command)).toEqual([
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
      'image:tool-sharpen-brush',
      'image:tool-crop',
      'image:tool-text',
      'image:tool-eyedropper',
    ]));
    expect(imageMenu?.items.find((item) => item.command === 'edit:copy')?.shortcut).toBe('Ctrl+C');
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

  it('hides the integrated renderer menu when Electron exposes the native bridge', () => {
    expect(shouldShowIntegratedAppMenu(false)).toBe(true);
    expect(shouldShowIntegratedAppMenu(true)).toBe(false);
  });
});
