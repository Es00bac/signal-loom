import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('TopNavbar hit-test layering', () => {
  it('keeps primary topbar controls layered above the centered Flow toolbar', () => {
    const source = readFileSync(new URL('./TopNavbar.tsx', import.meta.url), 'utf8');

    expect(source).toContain('data-flow-node-toolbar-layer="true"');
    expect(source).toContain('data-topbar-left-controls="true"');
    expect(source).toContain('data-topbar-primary-controls="true"');
    expect(source).toContain('relative z-20 flex min-w-0 items-center justify-end');
  });

  it('lets empty topbar control regions pass pointer events through to the Flow toolbar', () => {
    const source = readFileSync(new URL('./TopNavbar.tsx', import.meta.url), 'utf8');

    expect(source).toContain('pointer-events-none relative z-20 flex min-w-0 max-w-[58vw] shrink items-center gap-3 overflow-x-auto');
    // The menu bar scrolls internally so menu-heavy workspaces (Image) never push the workspace
    // switcher out of view; it stays interactive (pointer-events-auto).
    expect(source).toContain('pointer-events-auto flex min-w-0 shrink items-center gap-0.5 overflow-x-auto');
    expect(source).toContain('pointer-events-none relative z-20 flex min-w-0 items-center justify-end');
    expect(source).toContain('theme-control pointer-events-auto flex shrink-0 items-center gap-2');
  });

  it('contains the Flow node toolbar in a bounded horizontal scroller so it cannot spill into neighbors', () => {
    const source = readFileSync(new URL('./TopNavbar.tsx', import.meta.url), 'utf8');
    expect(source).toContain('pointer-events-auto flex min-w-0 max-w-full items-center overflow-x-auto overflow-y-hidden [scrollbar-width:none]');
  });

  it('places the Flow toolbar in the flex gap between topbar control groups', () => {
    const source = readFileSync(new URL('./TopNavbar.tsx', import.meta.url), 'utf8');

    expect(source).toContain('pointer-events-none relative z-10 flex min-w-0 flex-1 justify-center');
    expect(source).not.toContain('absolute left-1/2 top-1/2 z-10');
    expect(source).toContain("? 'max-w-[48vw] shrink-0 overflow-x-auto overflow-y-hidden [scrollbar-width:none]'");
    expect(source).toContain(": 'flex-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none]';");
  });

  it('keeps workspace tabs and primary controls in bounded non-overlapping lanes', () => {
    const source = readFileSync(new URL('./TopNavbar.tsx', import.meta.url), 'utf8');

    expect(source).toContain('data-testid="workspace-switcher"');
    expect(source).toContain('pointer-events-auto flex shrink-0 items-center gap-1 rounded-full');
    expect(source).toContain('data-topbar-primary-controls="true"');
    expect(source).toContain('overflow-x-auto overflow-y-hidden [scrollbar-width:none]');
  });

  it('keeps Flow right-side action labels hidden until extra-wide desktops', () => {
    const source = readFileSync(new URL('./TopNavbar.tsx', import.meta.url), 'utf8');

    expect(source).toContain('<span className="hidden min-[2000px]:inline">Projects</span>');
    expect(source).toContain('<span className="hidden min-[2000px]:inline">Functions</span>');
    expect(source).toContain('<span className="hidden min-[2000px]:inline">{copyState === \'copied\' ? \'Copied\' : copyState === \'error\' ? \'Failed\' : \'Export\'}</span>');
    expect(source).not.toContain('<span className="hidden 2xl:inline">Projects</span>');
    expect(source).not.toContain('<span className="hidden 2xl:inline">Functions</span>');
    expect(source).not.toContain('<span className="hidden 2xl:inline">{copyState === \'copied\' ? \'Copied\' : copyState === \'error\' ? \'Failed\' : \'Export\'}</span>');
  });

  it('declares compact workspace predicates without importing removed titlemark chrome', () => {
    const source = readFileSync(new URL('./TopNavbar.tsx', import.meta.url), 'utf8');

    expect(source).toContain("const isImageWorkspace = workspaceView === 'image';");
    expect(source).toContain("const isPaperWorkspace = workspaceView === 'paper';");
    expect(source).not.toContain("import { APP_EYEBROW, APP_NAME } from '../../lib/brand';");
    expect(source).not.toContain('TITLEBAR_LOGO_SRC');
    expect(source).not.toContain('TITLEBAR_LOGO_ALT');
  });

  it('keeps the usage estimator owned by topbar chrome instead of the canvas overlay', () => {
    const topbarSource = readFileSync(new URL('./TopNavbar.tsx', import.meta.url), 'utf8');
    const usageBarSource = readFileSync(new URL('./UsageBar.tsx', import.meta.url), 'utf8');
    const appSource = readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8');

    expect(topbarSource).toContain('theme-topbar absolute top-0 left-0 right-0 z-[80]');
    // The app-menu dropdown is portaled to <body> as a high-z fixed layer so it escapes the
    // horizontally-scrollable nav-bar container (which clipped it and stacked it under the canvas).
    expect(topbarSource).toContain('fixed z-[200] min-w-56');
    expect(topbarSource).toContain('<UsageBar placement="topbar" workspaceView={workspaceView} />');
    expect(topbarSource).toContain('<UsageBar placement="mobile-drawer" workspaceView={workspaceView} />');
    expect(usageBarSource).not.toContain('top-2 z-[90]');
    expect(appSource).not.toContain('<UsageBar workspaceView={activeWorkspaceView} />');
  });
});
