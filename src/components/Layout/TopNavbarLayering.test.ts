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

    expect(source).toContain('pointer-events-none relative z-20 flex min-w-0 items-center gap-3');
    expect(source).toContain('pointer-events-auto flex shrink-0 items-center gap-0.5');
    expect(source).toContain('pointer-events-none relative z-20 flex min-w-0 items-center justify-end');
    expect(source).toContain('theme-control pointer-events-auto flex shrink-0 items-center gap-2');
  });

  it('places the Flow toolbar in the flex gap between topbar control groups', () => {
    const source = readFileSync(new URL('./TopNavbar.tsx', import.meta.url), 'utf8');

    expect(source).toContain('pointer-events-none relative z-10 flex min-w-0 flex-1 justify-center');
    expect(source).not.toContain('absolute left-1/2 top-1/2 z-10');
    expect(source).toContain("isPaperWorkspace || workspaceView === 'flow' ? 'shrink-0' : 'flex-1'");
  });

  it('keeps Flow right-side action labels hidden until extra-wide desktops', () => {
    const source = readFileSync(new URL('./TopNavbar.tsx', import.meta.url), 'utf8');

    expect(source).toContain('<span className="hidden 2xl:inline">Projects</span>');
    expect(source).toContain('<span className="hidden 2xl:inline">Functions</span>');
    expect(source).toContain('<span className="hidden 2xl:inline">{copyState === \'copied\' ? \'Copied\' : copyState === \'error\' ? \'Failed\' : \'Export\'}</span>');
    expect(source).not.toContain('<span className="hidden xl:inline">Projects</span>');
    expect(source).not.toContain('<span className="hidden xl:inline">Functions</span>');
    expect(source).not.toContain('<span className="hidden xl:inline">{copyState === \'copied\' ? \'Copied\' : copyState === \'error\' ? \'Failed\' : \'Export\'}</span>');
  });

  it('keeps integrated menu dropdowns above the usage estimator overlay', () => {
    const topbarSource = readFileSync(new URL('./TopNavbar.tsx', import.meta.url), 'utf8');
    const usageBarSource = readFileSync(new URL('./UsageBar.tsx', import.meta.url), 'utf8');

    expect(topbarSource).toContain('theme-topbar absolute top-0 left-0 right-0 z-[80]');
    expect(topbarSource).toContain('absolute left-0 top-full z-[70]');
    expect(usageBarSource).toContain('absolute left-1/2 top-20 z-[60]');
  });
});
