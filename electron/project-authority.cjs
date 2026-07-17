'use strict';

// Desktop project authority arbitration (AUD-001).
//
// The Electron main process holds one authoritative project at a time. Every open/switch/
// Save As/first-save mints an IMMUTABLE identity token (`authorityId`) bound to the native
// file path, and every accepted save advances a MONOTONIC content version. Renderers must
// pull and hydrate the canonical snapshot, then confirm adoption, before their saves
// authorize — so a renderer that still holds another project's stores (or an older version
// of this one) can never overwrite newer or unrelated state on disk. Rejections never touch
// disk, never move the current path, and never advance the version.
//
// This module is pure (no Electron imports): main.mjs injects the dialog/disk/broadcast IO,
// which keeps the complete arbitration testable from vitest with simulated renderer clients.

/**
 * Accepts both the authority-aware save payload ({ document, claim }) and the legacy shape
 * where the renderer sent the raw project document. Legacy payloads carry no claim, so they
 * are rejected as 'unopened' rather than being written blindly.
 */
function normalizeProjectSavePayload(payload) {
  if (payload && typeof payload === 'object' && 'document' in payload) {
    const wrapped = payload;
    return {
      document: wrapped.document,
      claim: wrapped.claim && typeof wrapped.claim === 'object' ? wrapped.claim : undefined,
    };
  }
  return { document: payload, claim: undefined };
}

function isClaimShape(claim) {
  return Boolean(
    claim
    && typeof claim === 'object'
    && typeof claim.authorityId === 'string'
    && claim.authorityId.length > 0
    && Number.isInteger(claim.version),
  );
}

function createProjectAuthority({ mintAuthorityId, broadcast } = {}) {
  let mintCounter = 0;
  const mint = typeof mintAuthorityId === 'function'
    ? mintAuthorityId
    : () => `project-authority-${(mintCounter += 1)}-${Math.random().toString(36).slice(2, 10)}`;
  const emit = typeof broadcast === 'function' ? broadcast : () => undefined;

  /** The one authoritative project: immutable identity + monotonic accepted-save version. */
  let current = { authorityId: mint(), version: 1, filePath: undefined };
  /** Canonical snapshot is coupled to `current`; adoption never reads main globals separately. */
  let canonical = { filePath: undefined, scratchDirectoryPath: undefined, document: undefined };
  /** senderId (webContents id) -> the authority descriptor that renderer confirmed adopting. */
  const adoptions = new Map();
  /** Serializes every project mutation so validation and disk writes are atomic. */
  let mutationChain = Promise.resolve();

  function runExclusive(task) {
    const next = mutationChain.then(task, task);
    mutationChain = next.then(() => undefined, () => undefined);
    return next;
  }

  function getCurrent() {
    return { ...current };
  }

  function describeCurrentFile() {
    return current.filePath ? `"${current.filePath}"` : 'an unsaved blank project';
  }

  function buildRejection(code, message) {
    return {
      ok: false,
      rejected: { code, message, current: getCurrent() },
    };
  }

  function senderIsLive(isSenderLive) {
    return typeof isSenderLive !== 'function' || isSenderLive();
  }

  function authorizeSave(senderId, claim, rendererEpoch = 0, isSenderLive) {
    if (!senderIsLive(isSenderLive)) {
      return buildRejection(
        'sender-gone',
        'This window was reloaded, navigated, or closed before its request completed, so saving was stopped.',
      );
    }
    if (!isClaimShape(claim)) {
      return buildRejection(
        'unopened',
        'This window has not finished adopting the current project, so saving was stopped before anything was written. '
        + 'Wait for the project to finish loading, or reload the project from disk.',
      );
    }
    if (claim.authorityId !== current.authorityId) {
      return buildRejection(
        'switched',
        `The application project changed to ${describeCurrentFile()} after this window last loaded its project. `
        + 'Saving was stopped so this window\'s older workspace state could not overwrite it. '
        + 'Reload the project from disk to continue working here.',
      );
    }
    if (claim.version !== current.version) {
      return buildRejection(
        'stale',
        'This project was saved from another window after this window last loaded it. '
        + 'Saving was stopped so those newer changes were not overwritten. '
        + 'Reload the project from disk to continue working here.',
      );
    }
    const adopted = adoptions.get(senderId);
    if (!adopted || adopted.authorityId !== current.authorityId || adopted.version !== current.version || adopted.rendererEpoch !== rendererEpoch) {
      return buildRejection(
        'unauthorized',
        'This window has not confirmed adopting the current project state, so saving was stopped. '
        + 'Reload the project from disk to continue working here.',
      );
    }
    return { ok: true };
  }

  function recordAdoption(senderId, rendererEpoch = 0) {
    adoptions.set(senderId, { authorityId: current.authorityId, version: current.version, rendererEpoch });
  }

  return {
    getCurrent,
    authorizeSave,

    /** Bind the remembered startup project before any window exists (no broadcast needed). */
    commitStartup(snapshot = {}) {
      if (typeof snapshot === 'string') snapshot = { filePath: snapshot };
      current = { authorityId: mint(), version: 1, filePath: snapshot.filePath };
      canonical = { ...canonical, ...snapshot, filePath: snapshot.filePath };
      return getCurrent();
    },

    /**
     * Open/switch to a project. `load` performs the read/prepare IO and runs inside the
     * mutation lock so an in-flight save cannot interleave with the switch. The initiating
     * renderer is NOT auto-adopted: it must hydrate the returned document and confirm, the
     * same as every other window.
     */
    async openProject({ senderId, rendererEpoch = 0, isSenderLive, load, publish }) {
      return runExclusive(async () => {
        if (!senderIsLive(isSenderLive)) return buildRejection('sender-gone', 'The requesting window is no longer live.');
        const loaded = await load();
        if (!senderIsLive(isSenderLive)) return buildRejection('sender-gone', 'The requesting window is no longer live.');
        current = { authorityId: mint(), version: 1, filePath: loaded.filePath };
        canonical = {
          filePath: loaded.filePath,
          scratchDirectoryPath: loaded.scratchDirectoryPath,
          document: loaded.document,
        };
        // Publication is deliberately synchronous: authority and visible canonical state change
        // in one main-owned commit, after every awaited dialog/I/O preparation boundary.
        if (publish) publish({ ...canonical, authority: getCurrent() });
        emit({ authority: getCurrent(), reason: 'open', initiatorWebContentsId: senderId });
        return { ...loaded, authority: getCurrent() };
      });
    },

    /**
     * Save the current project. The claim is validated twice: once up front (so a doomed
     * save never opens a destination dialog) and again inside the mutation lock immediately
     * before the disk write (so a dialog resolving after a project switch is refused).
     * A same-path save advances the version; a path rebind (first save of a blank project,
     * or Save As) mints a fresh identity at version 1. Only the writer is auto-adopted.
     */
    async saveProject({ senderId, rendererEpoch = 0, isSenderLive, claim, resolveFilePath, write, publish }) {
      const precheck = authorizeSave(senderId, claim, rendererEpoch, isSenderLive);
      if (!precheck.ok) {
        return { canceled: false, rejected: precheck.rejected };
      }

      const filePath = await resolveFilePath(current.filePath);
      if (!filePath) {
        return { canceled: true };
      }
      if (!senderIsLive(isSenderLive)) {
        const rejected = buildRejection('sender-gone', 'The requesting window is no longer live.');
        return { canceled: false, rejected: rejected.rejected };
      }

      return runExclusive(async () => {
        const recheck = authorizeSave(senderId, claim, rendererEpoch, isSenderLive);
        if (!recheck.ok) {
          return { canceled: false, rejected: recheck.rejected };
        }

        const written = await write(filePath, () => senderIsLive(isSenderLive));
        if (!senderIsLive(isSenderLive)) {
          const rejected = buildRejection('sender-gone', 'The requesting window is no longer live.');
          return { canceled: false, rejected: rejected.rejected };
        }
        const rebinding = filePath !== current.filePath;
        current = rebinding
          ? { authorityId: mint(), version: 1, filePath }
          : { ...current, version: current.version + 1 };
        canonical = {
          filePath,
          scratchDirectoryPath: written.scratchDirectoryPath,
          document: written.document,
        };
        if (publish) publish({ ...canonical, authority: getCurrent() });
        recordAdoption(senderId, rendererEpoch);
        emit({
          authority: getCurrent(),
          reason: rebinding ? 'save-as' : 'save',
          initiatorWebContentsId: senderId,
        });
        return { ...written, authority: getCurrent() };
      });
    },

    /**
     * File > New: reset to a blank project under a fresh identity. The initiator resets its
     * own stores before invoking this, so its state IS the new canonical blank snapshot and
     * it is adopted directly.
     */
    async clearProject({ senderId, rendererEpoch = 0, isSenderLive, reset, publish }) {
      return runExclusive(async () => {
        if (!senderIsLive(isSenderLive)) return buildRejection('sender-gone', 'The requesting window is no longer live.');
        if (reset) {
          await reset();
        }
        if (!senderIsLive(isSenderLive)) return buildRejection('sender-gone', 'The requesting window is no longer live.');
        current = { authorityId: mint(), version: 1, filePath: undefined };
        canonical = { filePath: undefined, scratchDirectoryPath: undefined, document: undefined };
        if (publish) publish({ ...canonical, authority: getCurrent() });
        recordAdoption(senderId, rendererEpoch);
        emit({ authority: getCurrent(), reason: 'clear', initiatorWebContentsId: senderId });
        return { ok: true, authority: getCurrent() };
      });
    },

    /**
     * A renderer confirms it hydrated the claimed authority's canonical snapshot. Delayed
     * confirmations from before a switch/save are reported stale and grant nothing.
     */
    confirmAdoption(senderId, claim, rendererEpoch = 0, isSenderLive) {
      if (!senderIsLive(isSenderLive)) return { ok: false, stale: true, current: getCurrent() };
      if (!isClaimShape(claim) || claim.authorityId !== current.authorityId || claim.version !== current.version) {
        return { ok: false, stale: true, current: getCurrent() };
      }
      recordAdoption(senderId, rendererEpoch);
      return { ok: true, current: getCurrent() };
    },

    /** Canonical snapshot + authority for pull-based adoption after a change broadcast. */
    buildAdoptResponse() {
      return { authority: getCurrent(), ...canonical };
    },

    /** Forget a destroyed renderer's adoption record. */
    dropRenderer(senderId) {
      adoptions.delete(senderId);
    },

    /** Reload/navigation/crash invalidates a claim even when Electron retains webContents.id. */
    invalidateRenderer(senderId) {
      adoptions.delete(senderId);
    },
  };
}

module.exports = {
  createProjectAuthority,
  normalizeProjectSavePayload,
};
