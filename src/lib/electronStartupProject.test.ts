import { describe, expect, it } from 'vitest';

interface StartupProjectModule {
  buildStartupProjectStatePath: (userDataPath: string) => string;
  parseStartupProjectReopenPreference: (contents: string) => boolean;
  parseStartupProjectState: (contents: string) => string | undefined;
  resolveStartupProjectPath: (filePath: string | undefined, fileExists: (filePath: string) => boolean) => string | undefined;
  serializeStartupProjectState: (filePath: string | undefined, reopenLastProjectOnStartup?: boolean) => string;
}

async function loadStartupProjectModule(): Promise<StartupProjectModule> {
  // @ts-expect-error CommonJS Electron helper lives outside the renderer tsconfig module graph.
  return await import('../../electron/startup-project.cjs') as StartupProjectModule;
}

describe('Electron startup project state', () => {
  it('stores the last opened .sloom project path in the app user-data folder', async () => {
    const {
      buildStartupProjectStatePath,
      parseStartupProjectReopenPreference,
      parseStartupProjectState,
      serializeStartupProjectState,
    } = await loadStartupProjectModule();

    expect(buildStartupProjectStatePath('/tmp/signal-loom')).toBe('/tmp/signal-loom/startup-project.json');
    const defaultState = serializeStartupProjectState('/projects/issue-one.sloom');
    expect(parseStartupProjectState(defaultState)).toBe('/projects/issue-one.sloom');
    expect(parseStartupProjectReopenPreference(defaultState)).toBe(false);
    expect(parseStartupProjectReopenPreference(
      serializeStartupProjectState('/projects/issue-one.sloom', true),
    )).toBe(true);
  });

  it('ignores missing or non-sloom remembered projects so startup can fall back to a blank project', async () => {
    const {
      parseStartupProjectReopenPreference,
      parseStartupProjectState,
      resolveStartupProjectPath,
    } = await loadStartupProjectModule();

    expect(parseStartupProjectState('not json')).toBeUndefined();
    expect(parseStartupProjectReopenPreference('not json')).toBe(false);
    expect(resolveStartupProjectPath('/projects/notes.txt', () => true)).toBeUndefined();
    expect(resolveStartupProjectPath('/projects/missing.sloom', () => false)).toBeUndefined();
    expect(resolveStartupProjectPath('/projects/issue-one.sloom', () => true)).toBe('/projects/issue-one.sloom');
  });
});
