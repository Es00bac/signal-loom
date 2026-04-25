const { dirname, join } = require('node:path');

const SIGNAL_LOOM_PROJECT_EXTENSION = '.sloom';
const LEGACY_SIGNAL_LOOM_PROJECT_EXTENSIONS = ['.signal-loom.json', '.json'];
const SIGNAL_LOOM_PROJECT_SCRATCH_SUFFIX = '.signal-loom-scratch';

function ensureSignalLoomProjectExtension(filePath) {
  if (filePath.toLowerCase().endsWith(SIGNAL_LOOM_PROJECT_EXTENSION)) {
    return filePath;
  }

  return `${stripSignalLoomProjectExtension(filePath)}${SIGNAL_LOOM_PROJECT_EXTENSION}`;
}

function stripSignalLoomProjectExtension(filePath) {
  const lowerPath = filePath.toLowerCase();
  const knownExtension = [SIGNAL_LOOM_PROJECT_EXTENSION, ...LEGACY_SIGNAL_LOOM_PROJECT_EXTENSIONS]
    .find((extension) => lowerPath.endsWith(extension));

  return knownExtension ? filePath.slice(0, -knownExtension.length) : filePath;
}

function deriveProjectScratchDirectoryPath(filePath) {
  return `${stripSignalLoomProjectExtension(filePath)}${SIGNAL_LOOM_PROJECT_SCRATCH_SUFFIX}`;
}

function buildProjectScratchDirectoryCandidates(filePath, document) {
  const projectDirectoryPath = dirname(filePath);
  const candidates = [deriveProjectScratchDirectoryPath(filePath)];
  const savedScratchDirectoryName = document?.fileSystem?.scratchDirectoryName;

  if (typeof savedScratchDirectoryName === 'string' && savedScratchDirectoryName.trim()) {
    candidates.push(join(projectDirectoryPath, savedScratchDirectoryName));
  }

  candidates.push(join(projectDirectoryPath, 'scratch'));

  return [...new Set(candidates)];
}

function resolveScratchAssetNativePath(item, scratchDirectoryPaths, fileExists = () => false) {
  const nativeFilePath = typeof item?.nativeFilePath === 'string' ? item.nativeFilePath : undefined;
  const scratchFileName = typeof item?.scratchFileName === 'string' ? item.scratchFileName : undefined;
  const candidates = [
    nativeFilePath,
    ...(scratchFileName ? scratchDirectoryPaths.map((directoryPath) => join(directoryPath, scratchFileName)) : []),
  ].filter((filePath) => typeof filePath === 'string' && filePath.length > 0);
  const uniqueCandidates = [...new Set(candidates)];

  return uniqueCandidates.find((filePath) => fileExists(filePath)) ?? nativeFilePath ?? uniqueCandidates[0];
}

function buildNativeAssetUrl(filePath) {
  return `signal-loom-asset://file/${Buffer.from(filePath, 'utf8').toString('base64url')}`;
}

function decodeNativeAssetUrl(url) {
  const parsed = new URL(url);

  if (parsed.protocol !== 'signal-loom-asset:' || parsed.hostname !== 'file') {
    throw new Error('Unsupported Signal Loom asset URL.');
  }

  const encodedPath = parsed.pathname.replace(/^\/+/, '');
  return Buffer.from(encodedPath, 'base64url').toString('utf8');
}

function attachNativeScratchAssetsToProjectDocument(document, scratchDirectoryPath) {
  if (!document?.sourceBin || !Array.isArray(document.sourceBin.items)) {
    return document;
  }

  return {
    ...document,
    sourceBin: {
      ...document.sourceBin,
      items: document.sourceBin.items.map((item) => attachNativeScratchAssetToSourceBinItem(item, scratchDirectoryPath)),
    },
  };
}

function attachNativeScratchAssetToSourceBinItem(item, scratchDirectoryPath) {
  if (!item || item.kind === 'text') {
    return item;
  }

  const nativeFilePath = item.scratchFileName
    ? join(scratchDirectoryPath, item.scratchFileName)
    : item.nativeFilePath;

  if (!nativeFilePath) {
    return item;
  }

  return {
    ...item,
    nativeFilePath,
    assetUrl: buildNativeAssetUrl(nativeFilePath),
  };
}

function parseProjectDocumentJson(contents) {
  let parsed;

  try {
    parsed = JSON.parse(contents);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown parse error';
    throw new Error(`The selected project could not be parsed. ${message}`);
  }

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !parsed.flow ||
    !Array.isArray(parsed.flow.nodes) ||
    !Array.isArray(parsed.flow.edges)
  ) {
    throw new Error('The selected file is not a valid Signal Loom project.');
  }

  return parsed;
}

module.exports = {
  LEGACY_SIGNAL_LOOM_PROJECT_EXTENSIONS,
  SIGNAL_LOOM_PROJECT_EXTENSION,
  SIGNAL_LOOM_PROJECT_SCRATCH_SUFFIX,
  attachNativeScratchAssetsToProjectDocument,
  buildNativeAssetUrl,
  buildProjectScratchDirectoryCandidates,
  decodeNativeAssetUrl,
  deriveProjectScratchDirectoryPath,
  ensureSignalLoomProjectExtension,
  parseProjectDocumentJson,
  resolveScratchAssetNativePath,
  stripSignalLoomProjectExtension,
};
