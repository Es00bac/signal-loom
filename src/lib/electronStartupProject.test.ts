import { describe, expect, it } from 'vitest';

interface StartupProjectModule {
  buildStartupProjectStatePath: (userDataPath: string) => string;
  parseStartupProjectState: (contents: string) => string | undefined;
  resolveStartupProjectPath: (filePath: string | undefined, fileExists: (filePath: string) => boolean) => string | undefined;
  serializeStartupProjectState: (filePath: string) => string;
}

async function loadStartupProjectModule(): Promise<StartupProjectModule> {
  // @ts-expect-error CommonJS Electron helper lives outside the renderer tsconfig module graph.
  return await import('../../electron/startup-project.cjs') as StartupProjectModule;
}

describe('Electron startup project state', () => {
  it('stores the last opened .sloom project path in the app user-data folder', async () => {
    const {
      buildStartupProjectStatePath,
      parseStartupProjectState,
      serializeStartupProjectState,
    } = await loadStartupProjectModule();

    expect(buildStartupProjectStatePath('/tmp/signal-loom')).toBe('/tmp/signal-loom/startup-project.json');
    expect(parseStartupProjectState(serializeStartupProjectState('/projects/issue-one.sloom'))).toBe('/projects/issue-one.sloom');
  });

  it('ignores missing or non-sloom remembered projects so startup can fall back to a blank project', async () => {
    const { parseStartupProjectState, resolveStartupProjectPath } = await loadStartupProjectModule();

    expect(parseStartupProjectState('not json')).toBeUndefined();
    expect(resolveStartupProjectPath('/projects/notes.txt', () => true)).toBeUndefined();
    expect(resolveStartupProjectPath('/projects/missing.sloom', () => false)).toBeUndefined();
    expect(resolveStartupProjectPath('/projects/issue-one.sloom', () => true)).toBe('/projects/issue-one.sloom');
  });
});
