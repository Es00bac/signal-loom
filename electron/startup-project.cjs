const { join } = require('node:path');

const STARTUP_PROJECT_STATE_FILE = 'startup-project.json';
const SIGNAL_LOOM_PROJECT_EXTENSION = '.sloom';

function buildStartupProjectStatePath(userDataPath) {
  return join(userDataPath, STARTUP_PROJECT_STATE_FILE);
}

function serializeStartupProjectState(filePath) {
  return `${JSON.stringify({
    currentProjectPath: filePath,
    updatedAt: new Date().toISOString(),
  }, null, 2)}\n`;
}

function parseStartupProjectState(contents) {
  try {
    const parsed = JSON.parse(contents);
    return typeof parsed?.currentProjectPath === 'string' && parsed.currentProjectPath.trim()
      ? parsed.currentProjectPath
      : undefined;
  } catch {
    return undefined;
  }
}

function resolveStartupProjectPath(filePath, fileExists) {
  if (!filePath || !filePath.toLowerCase().endsWith(SIGNAL_LOOM_PROJECT_EXTENSION)) {
    return undefined;
  }

  return fileExists(filePath) ? filePath : undefined;
}

module.exports = {
  STARTUP_PROJECT_STATE_FILE,
  buildStartupProjectStatePath,
  parseStartupProjectState,
  resolveStartupProjectPath,
  serializeStartupProjectState,
};
