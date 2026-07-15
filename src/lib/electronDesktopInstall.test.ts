import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildDesktopLauncherInstallPlan } from './electronDesktopInstall';

describe('electronDesktopInstall', () => {
  it('builds a user-local install plan with an absolute desktop Exec path', () => {
    const plan = buildDesktopLauncherInstallPlan({
      homeDir: '/home/user',
      projectRoot: '/home/user/work/flow',
    });

    expect(plan.binTarget).toBe('/home/user/.local/bin/signal-loom-electron');
    expect(plan.desktopTarget).toBe('/home/user/.local/share/applications/signal-loom.desktop');
    expect(plan.launcherSource).toBe('/home/user/work/flow/scripts/signal-loom-electron');
    expect(plan.desktopEntry).toContain('Name=Sloom Studio');
    expect(plan.desktopEntry).toContain('Exec=/home/user/.local/bin/signal-loom-electron');
    expect(plan.desktopEntry).toContain('StartupWMClass=Sloom Studio');
  });

  it('uses one top-level application-menu category in every launcher template', () => {
    const plan = buildDesktopLauncherInstallPlan({
      homeDir: '/home/user',
      projectRoot: '/home/user/work/flow',
    });
    const installScript = readFileSync(
      new URL('../../scripts/install-desktop-launcher.sh', import.meta.url),
      'utf8',
    );

    expect(plan.desktopEntry).toContain('Categories=AudioVideo;AudioVideoEditing;');
    expect(plan.desktopEntry).not.toMatch(/^Categories=.*Graphics/m);
    expect(installScript).toContain('Categories=AudioVideo;AudioVideoEditing;');
    expect(installScript).not.toMatch(/^Categories=.*Graphics/m);
  });
});
