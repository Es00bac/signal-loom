import { describe, expect, it } from 'vitest';
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
});
