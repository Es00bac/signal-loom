import { describe, expect, it } from 'vitest';
import { APP_MENU_GROUPS, shouldShowIntegratedAppMenu } from './appMenuModel';

describe('renderer app menu model', () => {
  it('matches the useful native menu groups in the visible renderer menu', () => {
    expect(APP_MENU_GROUPS.map((group) => group.label)).toEqual([
      'File',
      'Edit',
      'View',
      'Timeline',
      'Help',
    ]);
  });

  it('keeps file commands available for the browser integrated menu', () => {
    const fileMenu = APP_MENU_GROUPS.find((group) => group.label === 'File');

    expect(fileMenu?.items.map((item) => item.command)).toEqual([
      'file:new',
      'file:open',
      'file:save',
      'file:save-as',
      'file:import-media',
      'file:set-scratch-folder',
      'file:export-project-json',
      'file:export-assets',
    ]);
  });

  it('includes tutorial and feature help entries in the Help menu', () => {
    const helpMenu = APP_MENU_GROUPS.find((group) => group.label === 'Help');

    expect(helpMenu?.items.map((item) => item.command)).toEqual([
      'help:project-documentation',
      'help:tutorial',
      'help:feature-help',
      'help:keyboard-shortcuts',
      'help:about',
    ]);
  });

  it('hides the integrated renderer menu when Electron exposes the native bridge', () => {
    expect(shouldShowIntegratedAppMenu(false)).toBe(true);
    expect(shouldShowIntegratedAppMenu(true)).toBe(false);
  });
});
