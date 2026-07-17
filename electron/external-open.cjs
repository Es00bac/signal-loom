// Validation and queueing for desktop external-open requests (AUD-040).
//
// Every way a file or URL can reach the desktop app from the outside — initial argv on
// Linux/Windows, a `second-instance` relaunch, macOS `open-file`/`open-url` events — funnels
// through this module: raw values are classified against a strict allowlist (local `.sloom`
// projects, local `.slppr` Paper layouts, and the already-defined `signal-loom://workspace/<view>`
// deep links), then held in a single exactly-once queue until a renderer drains them. The module
// is pure (filesystem access is injected) so the whole contract is unit-testable outside Electron.
'use strict';

const { posix, win32 } = require('node:path');

const EXTERNAL_OPEN_DEEP_LINK_SCHEME = 'signal-loom';
const EXTERNAL_OPEN_DEEP_LINK_WORKSPACE_HOST = 'workspace';
const EXTERNAL_OPEN_DOCUMENT_EXTENSIONS = Object.freeze({
  '.sloom': 'project',
  '.slppr': 'paper',
});
const DEFAULT_EXTERNAL_OPEN_WORKSPACE_VIEWS = Object.freeze(['flow', 'editor', 'image', 'paper']);
const SECOND_INSTANCE_PAYLOAD_KIND = 'signal-loom-external-open';
const MAX_EXTERNAL_OPEN_TARGET_LENGTH = 4096;
const MAX_SECOND_INSTANCE_ARGV_ENTRIES = 64;
const DEFAULT_MAX_PENDING_REQUESTS = 16;

function hasControlCharacters(value) {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint < 0x20 || codePoint === 0x7f) {
      return true;
    }
  }
  return false;
}

function isWindowsDriveAbsolutePath(value) {
  return /^[a-zA-Z]:[\\/]/.test(value);
}

function looksLikeUrl(value) {
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(value);
}

function classifyDocumentPath(filePath, value) {
  const lastDotIndex = filePath.lastIndexOf('.');
  const extension = lastDotIndex === -1 ? '' : filePath.slice(lastDotIndex).toLowerCase();
  const kind = EXTERNAL_OPEN_DOCUMENT_EXTENSIONS[extension];

  if (!kind) {
    return { status: 'rejected', reason: 'unsupported-extension', value };
  }

  return { status: 'accepted', kind, filePath };
}

function classifyDeepLink(url, value, workspaceViews) {
  if (url.hostname !== EXTERNAL_OPEN_DEEP_LINK_WORKSPACE_HOST || url.search || url.hash || url.username || url.password) {
    return { status: 'rejected', reason: 'unsupported-deep-link', value };
  }

  const segments = url.pathname.replace(/\/$/, '').split('/').filter(Boolean);
  if (segments.length !== 1 || !workspaceViews.includes(segments[0])) {
    return { status: 'rejected', reason: 'unsupported-deep-link', value };
  }

  return { status: 'accepted', kind: 'workspace', workspace: segments[0] };
}

function classifyFileUrl(url, value, platform) {
  if (url.hostname && url.hostname !== 'localhost') {
    return { status: 'rejected', reason: 'remote-target', value };
  }

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(url.pathname);
  } catch {
    return { status: 'rejected', reason: 'malformed', value };
  }

  if (hasControlCharacters(decodedPath)) {
    return { status: 'rejected', reason: 'control-characters', value };
  }

  if (platform === 'win32' && /^\/[a-zA-Z]:[\\/]/.test(decodedPath)) {
    decodedPath = decodedPath.slice(1);
  }

  return classifyDocumentPath(decodedPath, value);
}

/**
 * Classify one raw external-open value (an argv token, an `open-file` path, or an `open-url`
 * URL) against the supported-target allowlist. Returns exactly one of:
 * `{ status: 'accepted', kind: 'project' | 'paper', filePath }`,
 * `{ status: 'accepted', kind: 'workspace', workspace }`,
 * `{ status: 'ignored', reason }` for launcher noise that carries no user intent, or
 * `{ status: 'rejected', reason, value }` for malformed/remote/unsupported/injection-shaped input.
 */
function classifyExternalOpenTarget(rawValue, context = {}) {
  const { cwd, platform = process.platform, workspaceViews = DEFAULT_EXTERNAL_OPEN_WORKSPACE_VIEWS } = context;

  if (typeof rawValue !== 'string') {
    return { status: 'rejected', reason: 'malformed', value: String(rawValue) };
  }

  const value = rawValue.trim();
  if (!value) {
    return { status: 'ignored', reason: 'empty' };
  }
  if (value === '.') {
    return { status: 'ignored', reason: 'current-directory' };
  }
  if (value.length > MAX_EXTERNAL_OPEN_TARGET_LENGTH) {
    return { status: 'rejected', reason: 'malformed', value: `${value.slice(0, 64)}…` };
  }
  if (hasControlCharacters(value)) {
    return { status: 'rejected', reason: 'control-characters', value };
  }
  if (value.startsWith('-')) {
    return { status: 'ignored', reason: 'command-like-argument' };
  }

  if (platform === 'win32' && isWindowsDriveAbsolutePath(value)) {
    return classifyDocumentPath(value, value);
  }

  if (looksLikeUrl(value)) {
    let url;
    try {
      url = new URL(value);
    } catch {
      return { status: 'rejected', reason: 'malformed', value };
    }

    if (url.protocol === `${EXTERNAL_OPEN_DEEP_LINK_SCHEME}:`) {
      return classifyDeepLink(url, value, workspaceViews);
    }
    if (url.protocol === 'file:') {
      return classifyFileUrl(url, value, platform);
    }
    return { status: 'rejected', reason: 'remote-target', value };
  }

  if (platform === 'win32' && value.startsWith('\\\\')) {
    return { status: 'rejected', reason: 'remote-target', value };
  }

  const pathModule = platform === 'win32' ? win32 : posix;
  if (!pathModule.isAbsolute(value)) {
    if (typeof cwd !== 'string' || !cwd) {
      return { status: 'rejected', reason: 'relative-without-base', value };
    }
    return classifyDocumentPath(pathModule.resolve(cwd, value), value);
  }

  return classifyDocumentPath(value, value);
}

/**
 * Pull candidate open targets out of a raw process argv. Launcher-owned tokens (the executable,
 * the default-app path argument, `.`, `--dev`, and Chromium switches) carry no user intent and
 * are dropped silently; everything else goes to `classifyExternalOpenTarget` for a verdict.
 */
function extractExternalOpenCandidatesFromArgv(argv, context = {}) {
  const { appPath, execPath } = context;
  const candidates = [];

  for (const token of argv ?? []) {
    if (typeof token !== 'string' || token === '') {
      continue;
    }
    if (token === execPath || token === appPath || token === '.') {
      continue;
    }
    if (token.startsWith('-')) {
      continue;
    }
    candidates.push(token);
  }

  return candidates;
}

/**
 * Build the JSON-serializable payload a losing instance hands the winner through
 * `app.requestSingleInstanceLock(additionalData)`. Electron mangles the relayed argv on some
 * platforms, so the loser ships its own untouched argv plus the working directory needed to
 * resolve relative paths.
 */
function buildSecondInstanceOpenPayload(argv, workingDirectory) {
  const entries = (Array.isArray(argv) ? argv : [])
    .filter((value) => typeof value === 'string')
    .slice(0, MAX_SECOND_INSTANCE_ARGV_ENTRIES)
    .map((value) => value.slice(0, MAX_EXTERNAL_OPEN_TARGET_LENGTH));

  return {
    kind: SECOND_INSTANCE_PAYLOAD_KIND,
    version: 1,
    argv: entries,
    workingDirectory: typeof workingDirectory === 'string' ? workingDirectory : '',
  };
}

/** Validate an untrusted `second-instance` additionalData value; undefined when it is not ours. */
function parseSecondInstanceOpenPayload(value) {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  if (value.kind !== SECOND_INSTANCE_PAYLOAD_KIND || value.version !== 1) {
    return undefined;
  }
  if (!Array.isArray(value.argv) || value.argv.length > MAX_SECOND_INSTANCE_ARGV_ENTRIES) {
    return undefined;
  }
  if (!value.argv.every((entry) => typeof entry === 'string' && entry.length <= MAX_EXTERNAL_OPEN_TARGET_LENGTH)) {
    return undefined;
  }
  if (typeof value.workingDirectory !== 'string') {
    return undefined;
  }

  return { argv: [...value.argv], workingDirectory: value.workingDirectory };
}

/**
 * Exactly-once queue for validated external-open requests. Document targets must be existing
 * regular files at enqueue time (`isFile` is injected), duplicates collapse while pending, and
 * each `take*` call atomically removes what it returns so a request can never be delivered twice.
 */
function createExternalOpenQueue(options) {
  const {
    isFile,
    workspaceViews = DEFAULT_EXTERNAL_OPEN_WORKSPACE_VIEWS,
    maxPending = DEFAULT_MAX_PENDING_REQUESTS,
  } = options ?? {};

  if (typeof isFile !== 'function') {
    throw new Error('createExternalOpenQueue requires an isFile(filePath) predicate.');
  }

  const pending = [];

  function pendingKey(target) {
    return target.kind === 'workspace' ? `workspace\n${target.workspace}` : `${target.kind}\n${target.filePath}`;
  }

  function enqueueValue(rawValue, context = {}) {
    const classified = classifyExternalOpenTarget(rawValue, {
      cwd: context.cwd,
      platform: context.platform,
      workspaceViews,
    });

    if (classified.status !== 'accepted') {
      return classified;
    }

    if (classified.kind !== 'workspace' && !isFile(classified.filePath)) {
      return { status: 'rejected', reason: 'not-a-file', value: String(rawValue) };
    }

    const key = pendingKey(classified);
    if (pending.some((entry) => entry.key === key)) {
      return { status: 'duplicate', kind: classified.kind };
    }
    if (pending.length >= maxPending) {
      return { status: 'rejected', reason: 'queue-overflow', value: String(rawValue) };
    }

    pending.push({ ...classified, key });
    return { status: 'enqueued', kind: classified.kind };
  }

  function enqueueArgv(argv, context = {}) {
    const enqueued = [];
    const rejected = [];

    for (const candidate of extractExternalOpenCandidatesFromArgv(argv, context)) {
      const outcome = enqueueValue(candidate, context);
      if (outcome.status === 'enqueued') {
        const entry = pending[pending.length - 1];
        enqueued.push(entry.kind === 'workspace'
          ? { kind: 'workspace', workspace: entry.workspace }
          : { kind: entry.kind, filePath: entry.filePath });
      } else if (outcome.status === 'rejected') {
        rejected.push({ value: outcome.value, reason: outcome.reason });
      }
    }

    return { enqueued, rejected };
  }

  function takeMatching(predicate) {
    const taken = [];
    for (let index = pending.length - 1; index >= 0; index -= 1) {
      if (predicate(pending[index])) {
        taken.unshift(pending.splice(index, 1)[0]);
      }
    }
    return taken;
  }

  return {
    enqueueValue,
    enqueueArgv,
    hasPending: (kind) => (kind ? pending.some((entry) => entry.kind === kind) : pending.length > 0),
    pendingCount: () => pending.length,
    takeDocumentRequests: () =>
      takeMatching((entry) => entry.kind === 'project' || entry.kind === 'paper')
        .map((entry) => ({ kind: entry.kind, filePath: entry.filePath })),
    takeWorkspaceRequests: () =>
      takeMatching((entry) => entry.kind === 'workspace')
        .map((entry) => ({ kind: 'workspace', workspace: entry.workspace })),
  };
}

module.exports = {
  DEFAULT_EXTERNAL_OPEN_WORKSPACE_VIEWS,
  EXTERNAL_OPEN_DEEP_LINK_SCHEME,
  EXTERNAL_OPEN_DOCUMENT_EXTENSIONS,
  buildSecondInstanceOpenPayload,
  classifyExternalOpenTarget,
  createExternalOpenQueue,
  extractExternalOpenCandidatesFromArgv,
  parseSecondInstanceOpenPayload,
};
