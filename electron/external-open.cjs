// Validation and queueing for desktop external-open requests (AUD-040).
//
// Every way a file or URL can reach the desktop app from the outside — initial argv on
// Linux/Windows, a `second-instance` relaunch, macOS `open-file`/`open-url` events — funnels
// through this module: raw values are classified against a strict allowlist (local `.sloom`
// projects, local `.slppr` Paper layouts, and the already-defined `signal-loom://workspace/<view>`
// deep links), then held in a transactional queue until the designated renderer commits them.
// The module is pure (filesystem/time access is injected) so the contract is testable outside Electron.
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
const DEFAULT_MAX_RECENT_COMMITS = 64;
const DEFAULT_IDEMPOTENCY_WINDOW_MS = 1_500;

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
 * Build a validated legacy additionalData payload. Production uses Electron's bare-lock native
 * argv/workingDirectory relay, which is covered by the real lifecycle probe; these helpers remain
 * defensive compatibility parsers only.
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
 * Main-owned transactional queue for validated external-open intents. Documents remain owned by
 * main until the designated renderer accepts and commits them. A rejection removes the intent
 * without creating an idempotency receipt, while a commit creates a bounded, time-limited receipt
 * that collapses duplicate OS delivery without blocking a genuinely later user open.
 */
function createExternalOpenQueue(options) {
  const {
    isFile,
    workspaceViews = DEFAULT_EXTERNAL_OPEN_WORKSPACE_VIEWS,
    maxPending = DEFAULT_MAX_PENDING_REQUESTS,
    maxRecentCommits = DEFAULT_MAX_RECENT_COMMITS,
    idempotencyWindowMs = DEFAULT_IDEMPOTENCY_WINDOW_MS,
    now = Date.now,
  } = options ?? {};

  if (typeof isFile !== 'function') {
    throw new Error('createExternalOpenQueue requires an isFile(filePath) predicate.');
  }

  const pending = [];
  const recentCommits = [];
  let nextIntentSequence = 1;
  let nextEpochSequence = 1;
  let authorization;

  function pendingKey(target) {
    return target.kind === 'workspace' ? `workspace\n${target.workspace}` : `${target.kind}\n${target.filePath}`;
  }

  function pruneRecentCommits() {
    const cutoff = now() - idempotencyWindowMs;
    while (recentCommits.length > 0 && recentCommits[0].committedAt <= cutoff) {
      recentCommits.shift();
    }
  }

  function rememberCommit(key) {
    pruneRecentCommits();
    recentCommits.push({ key, committedAt: now() });
    while (recentCommits.length > maxRecentCommits) {
      recentCommits.shift();
    }
  }

  function publicIntent(entry) {
    return entry.kind === 'workspace'
      ? { id: entry.id, kind: 'workspace', workspace: entry.workspace }
      : { id: entry.id, kind: entry.kind, filePath: entry.filePath };
  }

  function isAuthorized(request) {
    return Boolean(
      authorization
      && request
      && request.rendererId === authorization.rendererId
      && request.epoch === authorization.epoch,
    );
  }

  function requeueOwnedIntents(rendererId, epoch) {
    const releasedIntentIds = [];
    for (const entry of pending) {
      if (entry.ownerRendererId !== rendererId || entry.ownerEpoch !== epoch) continue;
      entry.state = 'pending';
      delete entry.ownerRendererId;
      delete entry.ownerEpoch;
      releasedIntentIds.push(entry.id);
    }
    return releasedIntentIds;
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
    pruneRecentCommits();
    if (pending.some((entry) => entry.key === key)) {
      return { status: 'duplicate', kind: classified.kind };
    }
    if (recentCommits.some((entry) => entry.key === key)) {
      return { status: 'duplicate', kind: classified.kind };
    }
    if (pending.length >= maxPending) {
      return { status: 'rejected', reason: 'queue-overflow', value: String(rawValue) };
    }

    pending.push({
      ...classified,
      id: `external-open-${nextIntentSequence++}`,
      key,
      state: 'pending',
    });
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

  function takeWorkspaceRequests() {
    const taken = [];
    for (let index = pending.length - 1; index >= 0; index -= 1) {
      if (pending[index].kind !== 'workspace') continue;
      const [entry] = pending.splice(index, 1);
      rememberCommit(entry.key);
      taken.unshift({ kind: 'workspace', workspace: entry.workspace });
    }
    return taken;
  }

  function authorizeRenderer(rendererId) {
    if (typeof rendererId !== 'string' || !rendererId) {
      return { authorized: false, reason: 'invalid-renderer' };
    }
    const releasedIntentIds = authorization
      ? requeueOwnedIntents(authorization.rendererId, authorization.epoch)
      : [];
    authorization = {
      rendererId,
      epoch: `external-open-epoch-${nextEpochSequence++}`,
    };
    return { authorized: true, epoch: authorization.epoch, releasedIntentIds };
  }

  function revokeRenderer(request) {
    if (!isAuthorized(request)) {
      return { status: 'unauthorized', releasedIntentIds: [] };
    }
    const releasedIntentIds = requeueOwnedIntents(authorization.rendererId, authorization.epoch);
    authorization = undefined;
    return { status: 'revoked', releasedIntentIds };
  }

  function offerNextDocumentIntent(request) {
    if (!isAuthorized(request)) return { status: 'unauthorized' };
    const owned = pending.find((entry) =>
      entry.kind !== 'workspace'
      && entry.ownerRendererId === request.rendererId
      && entry.ownerEpoch === request.epoch,
    );
    if (owned) return { status: 'offered', intent: publicIntent(owned), state: owned.state };

    const entry = pending.find((candidate) => candidate.kind !== 'workspace' && candidate.state === 'pending');
    if (!entry) return { status: 'empty' };
    entry.state = 'offered';
    entry.ownerRendererId = request.rendererId;
    entry.ownerEpoch = request.epoch;
    return { status: 'offered', intent: publicIntent(entry), state: entry.state };
  }

  function transitionOwnedIntent(request, expectedState, nextState, status) {
    if (!isAuthorized(request)) return { status: 'unauthorized' };
    const entry = pending.find((candidate) => candidate.id === request.intentId);
    if (!entry || entry.ownerRendererId !== request.rendererId || entry.ownerEpoch !== request.epoch) {
      return { status: 'not-found' };
    }
    if (entry.state !== expectedState) return { status: 'invalid-state', state: entry.state };
    entry.state = nextState;
    return { status };
  }

  function acceptDocumentIntent(request) {
    return transitionOwnedIntent(request, 'offered', 'accepted', 'accepted');
  }

  function rejectDocumentIntent(request) {
    if (!isAuthorized(request)) return { status: 'unauthorized' };
    const index = pending.findIndex((entry) =>
      entry.id === request.intentId
      && entry.ownerRendererId === request.rendererId
      && entry.ownerEpoch === request.epoch,
    );
    if (index === -1) return { status: 'not-found' };
    pending.splice(index, 1);
    return { status: 'rejected' };
  }

  function commitDocumentIntent(request) {
    if (!isAuthorized(request)) return { status: 'unauthorized' };
    const index = pending.findIndex((entry) =>
      entry.id === request.intentId
      && entry.ownerRendererId === request.rendererId
      && entry.ownerEpoch === request.epoch,
    );
    if (index === -1) return { status: 'not-found' };
    const entry = pending[index];
    if (entry.state !== 'accepted') return { status: 'invalid-state', state: entry.state };
    pending.splice(index, 1);
    rememberCommit(entry.key);
    return { status: 'committed' };
  }

  return {
    enqueueValue,
    enqueueArgv,
    hasPending: (kind) => (kind ? pending.some((entry) => entry.kind === kind) : pending.length > 0),
    pendingCount: () => pending.length,
    authorizeRenderer,
    revokeRenderer,
    offerNextDocumentIntent,
    acceptDocumentIntent,
    rejectDocumentIntent,
    commitDocumentIntent,
    takeWorkspaceRequests,
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
