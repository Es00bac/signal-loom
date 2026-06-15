const { accessSync, constants, existsSync, statSync } = require('node:fs');
const { homedir } = require('node:os');
const { join } = require('node:path');

const VALID_VERTEX_AUTH_MODES = new Set(['gcloud-user', 'gcloud-adc']);
const WINDOWS_PLATFORM = process.platform === 'win32';

function stripOptionalQuotes(value) {
  if (typeof value !== 'string') {
    return '';
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    if (trimmed.length > 1) {
      return trimmed.slice(1, -1);
    }
    return '';
  }

  return trimmed;
}

function expandHomePath(value) {
  const trimmed = stripOptionalQuotes(value);
  if (!trimmed) {
    return '';
  }

  if (!trimmed.startsWith('~')) {
    return trimmed;
  }

  const rest = trimmed.slice(1);
  if (!rest) {
    return homedir();
  }

  const normalizedRest = rest.startsWith('/') || rest.startsWith('\\') ? rest.slice(1) : rest;
  return join(homedir(), normalizedRest);
}

function toExecutableCandidates(values, extensions) {
  return values
    .map(expandHomePath)
    .filter(Boolean)
    .flatMap((candidate) => {
      if (!extensions.length) {
        return [candidate];
      }

      const candidates = [];
      for (const extension of extensions) {
        candidates.push(candidate.endsWith(extension) ? candidate : `${candidate}${extension}`);
      }
      return candidates;
    });
}

function findExecutable(candidates) {
  for (const candidate of candidates) {
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      if (existsSync(candidate)) {
        try {
          if (statSync(candidate).isFile()) {
            return candidate;
          }
        } catch {
          continue;
        }
      }
    }
  }

  return undefined;
}

function readVertexAuthValue(candidateValues) {
  for (const candidate of candidateValues) {
    const value = stripOptionalQuotes(candidate);
    if (value) {
      return value;
    }
  }

  return undefined;
}

function resolveGcloudCommand(auth = {}) {
  const environment = parseVertexEnvironmentVariables(auth.environmentVariables);
  const commandExtensions = WINDOWS_PLATFORM
    ? ['.cmd', '.exe', '']
    : [''];

  const explicitCandidates = toExecutableCandidates([
    environment.GCLOUD_BIN,
    environment.GCLOUD_BINARY,
    environment.CLOUDSDK_GCLOUD_BIN,
    process.env.GCLOUD_BIN,
    process.env.GCLOUD_BINARY,
    process.env.SIGNAL_LOOM_GCLOUD_BIN,
    process.env.CLOUDSDK_GCLOUD_BIN,
  ], commandExtensions);

  const explicitResolved = findExecutable(explicitCandidates);
  if (explicitResolved) {
    return explicitResolved;
  }

  const sdkRoots = [
    environment.CLOUDSDK_ROOT,
    environment.CLOUDSDK_HOME,
    environment.CLOUDSDK_ROOT_DIR,
    environment.GOOGLE_CLOUD_SDK,
    environment.GOOGLE_CLOUD_SDK_ROOT,
    process.env.CLOUDSDK_ROOT,
    process.env.CLOUDSDK_HOME,
    process.env.CLOUDSDK_ROOT_DIR,
    process.env.GOOGLE_CLOUD_SDK,
    process.env.GOOGLE_CLOUD_SDK_ROOT,
    join(homedir(), '.config', 'gcloud'),
    join(homedir(), '.local', 'bin'),
    join(homedir(), 'google-cloud-sdk'),
  ];

  const rootCandidates = sdkRoots
    .filter(Boolean)
    .flatMap((root) => [
      join(root, 'bin', 'gcloud'),
      join(root, 'google-cloud-sdk', 'bin', 'gcloud'),
    ]);

  const globalCandidates = WINDOWS_PLATFORM
    ? [
      join('C:/Program Files', 'Google', 'Cloud SDK', 'google-cloud-sdk', 'bin', 'gcloud'),
      join('C:/Program Files (x86)', 'Google', 'Cloud SDK', 'google-cloud-sdk', 'bin', 'gcloud'),
      join(process.env.LOCALAPPDATA || homedir(), 'Programs', 'Google', 'Cloud SDK', 'google-cloud-sdk', 'bin', 'gcloud'),
    ]
    : [
      '/usr/bin/gcloud',
      '/usr/local/bin/gcloud',
      '/opt/google-cloud-sdk/bin/gcloud',
      '/opt/homebrew/bin/gcloud',
      '/snap/bin/gcloud',
    ];

  const fallbackResolved = findExecutable(toExecutableCandidates([...rootCandidates, ...globalCandidates], commandExtensions));
  return fallbackResolved || 'gcloud';
}

function normalizeVertexAuthMode(mode) {
  return VALID_VERTEX_AUTH_MODES.has(mode) ? mode : 'gcloud-user';
}

function resolveVertexAccount(auth = {}) {
  const environment = parseVertexEnvironmentVariables(auth.environmentVariables);
  return readVertexAuthValue([
    environment.GCLOUD_ACCOUNT,
    environment.CLOUDSDK_ACCOUNT,
    environment.GOOGLE_CLOUD_ACCOUNT,
    process.env.GCLOUD_ACCOUNT,
    process.env.CLOUDSDK_ACCOUNT,
    process.env.GOOGLE_CLOUD_ACCOUNT,
  ]);
}

function buildVertexAccessTokenCommand(auth = {}) {
  const environment = parseVertexEnvironmentVariables(auth.environmentVariables);
  const mode = normalizeVertexAuthMode(auth.mode);
  const command = resolveGcloudCommand(auth);
  const account = readVertexAuthValue([
    environment.GCLOUD_ACCOUNT,
    environment.CLOUDSDK_ACCOUNT,
    environment.GOOGLE_CLOUD_ACCOUNT,
    process.env.GCLOUD_ACCOUNT,
    process.env.CLOUDSDK_ACCOUNT,
    process.env.GOOGLE_CLOUD_ACCOUNT,
  ]);

  if (mode === 'gcloud-adc') {
    return {
      command,
      args: ['auth', 'application-default', 'print-access-token'],
    };
  }

  const args = ['auth', 'print-access-token'];
  if (account) {
    args.push('--account', account);
  }

  return {
    command,
    args,
  };
}

function buildVertexLoginCommand(auth = {}) {
  const mode = normalizeVertexAuthMode(auth.mode);
  const command = resolveGcloudCommand(auth);

  if (mode === 'gcloud-adc') {
    return { command, args: ['auth', 'application-default', 'login'] };
  }

  const args = ['auth', 'login'];
  const account = resolveVertexAccount(auth);
  if (account) {
    args.push('--account', account);
  }
  return { command, args };
}

function buildVertexListProjectsCommand(auth = {}) {
  return {
    command: resolveGcloudCommand(auth),
    args: ['projects', 'list', '--format=json'],
  };
}

function parseGcloudProjectsList(stdout) {
  let parsed;
  try {
    parsed = JSON.parse(String(stdout ?? '[]'));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed
    .map((entry) => ({
      projectId: entry && typeof entry.projectId === 'string' ? entry.projectId : '',
      name: entry && typeof entry.name === 'string' ? entry.name : '',
    }))
    .filter((entry) => entry.projectId);
}

function parseVertexEnvironmentVariables(value) {
  const entries = {};
  const lines = String(value ?? '').split(/\r?\n/g);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const exportAwareLine = trimmed.startsWith('export ') ? trimmed.slice(7).trim() : trimmed;
    const separatorIndex = exportAwareLine.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = exportAwareLine.slice(0, separatorIndex).trim();
    const envValue = stripOptionalQuotes(exportAwareLine.slice(separatorIndex + 1).trim());

    if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) {
      continue;
    }

    entries[key] = envValue;
  }

  return entries;
}

function buildVertexAuthEnvironment(auth = {}, baseEnv = process.env) {
  return {
    ...baseEnv,
    ...parseVertexEnvironmentVariables(auth.environmentVariables),
  };
}

module.exports = {
  buildVertexAccessTokenCommand,
  resolveGcloudCommand,
  buildVertexAuthEnvironment,
  normalizeVertexAuthMode,
  parseVertexEnvironmentVariables,
  buildVertexLoginCommand,
  buildVertexListProjectsCommand,
  parseGcloudProjectsList,
};
