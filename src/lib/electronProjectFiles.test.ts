import { describe, expect, it } from 'vitest';

interface ElectronProjectFilesModule {
  SIGNAL_LOOM_PROJECT_EXTENSION: string;
  attachNativeScratchAssetsToProjectDocument: (document: Record<string, unknown>, scratchDirectoryPath: string) => Record<string, unknown>;
  buildNativeAssetUrl: (filePath: string) => string;
  buildProjectScratchDirectoryCandidates: (filePath: string, document?: Record<string, unknown>) => string[];
  deriveProjectScratchDirectoryPath: (filePath: string) => string;
  ensureSignalLoomProjectExtension: (filePath: string) => string;
  parseProjectDocumentJson: (contents: string) => unknown;
  resolveScratchAssetNativePath: (
    item: Record<string, unknown>,
    scratchDirectoryPaths: string[],
    fileExists: (filePath: string) => boolean,
  ) => string | undefined;
}

async function loadProjectFilesModule(): Promise<ElectronProjectFilesModule> {
  // @ts-expect-error CommonJS Electron helper lives outside the renderer tsconfig module graph.
  return await import('../../electron/project-files.cjs') as ElectronProjectFilesModule;
}

describe('Electron project file helpers', () => {
  it('adds the Signal Loom extension to save-as paths without one', async () => {
    const { ensureSignalLoomProjectExtension } = await loadProjectFilesModule();

    expect(ensureSignalLoomProjectExtension('/tmp/my-edit')).toBe('/tmp/my-edit.sloom');
  });

  it('uses the native Signal Loom project extension for new saves while accepting legacy names', async () => {
    const { ensureSignalLoomProjectExtension } = await loadProjectFilesModule();

    expect(ensureSignalLoomProjectExtension('/tmp/project.sloom')).toBe('/tmp/project.sloom');
    expect(ensureSignalLoomProjectExtension('/tmp/project.json')).toBe('/tmp/project.sloom');
    expect(ensureSignalLoomProjectExtension('/tmp/project.signal-loom.json')).toBe('/tmp/project.sloom');
  });

  it('derives a sibling per-project scratch directory from current and legacy project paths', async () => {
    const { deriveProjectScratchDirectoryPath } = await loadProjectFilesModule();

    expect(deriveProjectScratchDirectoryPath('/mnt/xtra/videos/my-cut.sloom'))
      .toBe('/mnt/xtra/videos/my-cut.signal-loom-scratch');
    expect(deriveProjectScratchDirectoryPath('/mnt/xtra/videos/my-cut.signal-loom.json'))
      .toBe('/mnt/xtra/videos/my-cut.signal-loom-scratch');
    expect(deriveProjectScratchDirectoryPath('/mnt/xtra/videos/my-cut.json'))
      .toBe('/mnt/xtra/videos/my-cut.signal-loom-scratch');
  });

  it('includes legacy sibling scratch folders as fallback project asset locations', async () => {
    const { buildProjectScratchDirectoryCandidates } = await loadProjectFilesModule();

    expect(buildProjectScratchDirectoryCandidates('/mnt/xtra/videos/my-cut.sloom', {
      fileSystem: {
        scratchDirectoryName: 'scratch',
      },
    })).toEqual([
      '/mnt/xtra/videos/my-cut.signal-loom-scratch',
      '/mnt/xtra/videos/scratch',
    ]);
  });

  it('resolves missing renamed-project scratch assets from an existing legacy scratch folder', async () => {
    const { resolveScratchAssetNativePath } = await loadProjectFilesModule();

    expect(resolveScratchAssetNativePath(
      {
        scratchFileName: 'clip.mp4',
        nativeFilePath: '/mnt/xtra/videos/my-cut.signal-loom-scratch/clip.mp4',
      },
      [
        '/mnt/xtra/videos/my-cut.signal-loom-scratch',
        '/mnt/xtra/videos/scratch',
      ],
      (filePath) => filePath === '/mnt/xtra/videos/scratch/clip.mp4',
    )).toBe('/mnt/xtra/videos/scratch/clip.mp4');
  });

  it('attaches native asset URLs to scratch-backed source-bin items on project open', async () => {
    const {
      attachNativeScratchAssetsToProjectDocument,
      buildNativeAssetUrl,
    } = await loadProjectFilesModule();

    const document = attachNativeScratchAssetsToProjectDocument({
      id: 'p1',
      name: 'Cut',
      savedAt: 1,
      flow: {
        version: 3,
        nodes: [],
        edges: [],
      },
      sourceBin: {
        dismissedSourceKeys: [],
        items: [
          {
            id: 'clip-1',
            label: 'clip.mp4',
            kind: 'video',
            mimeType: 'video/mp4',
            scratchFileName: 'clip.mp4',
            createdAt: 1,
          },
          {
            id: 'text-1',
            label: 'Title',
            kind: 'text',
            text: 'Hello',
            createdAt: 2,
          },
        ],
      },
    }, '/mnt/xtra/videos/my-cut.signal-loom-scratch');

    expect(document.sourceBin).toMatchObject({
      items: [
        {
          id: 'clip-1',
          nativeFilePath: '/mnt/xtra/videos/my-cut.signal-loom-scratch/clip.mp4',
          assetUrl: buildNativeAssetUrl('/mnt/xtra/videos/my-cut.signal-loom-scratch/clip.mp4'),
        },
        {
          id: 'text-1',
        },
      ],
    });
    expect((document.sourceBin as { items: Array<Record<string, unknown>> }).items[1]).not.toHaveProperty('assetUrl');
    expect((document.sourceBin as { items: Array<Record<string, unknown>> }).items[1]).not.toHaveProperty('nativeFilePath');
  });

  it('parses a valid project document and rejects invalid files clearly', async () => {
    const { parseProjectDocumentJson } = await loadProjectFilesModule();

    expect(parseProjectDocumentJson('{"id":"p1","name":"Cut","savedAt":1,"flow":{"version":3,"nodes":[],"edges":[]}}'))
      .toMatchObject({
        id: 'p1',
        name: 'Cut',
      });
    expect(() => parseProjectDocumentJson('{"flow":{"nodes":{}}}')).toThrow(
      'not a valid Signal Loom project',
    );
    expect(() => parseProjectDocumentJson('{')).toThrow('could not be parsed');
  });
});
