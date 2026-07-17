import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createProjectAuthorityClient,
  type ProjectAuthorityClient,
} from './projectAuthorityClient';
import type {
  NativeProjectAdoptResult,
  NativeProjectAuthorityChangedEvent,
  NativeProjectAuthorityDescriptor,
  NativeProjectFileResult,
  NativeProjectSaveRejection,
} from './nativeApp';

interface HarnessProjectFileResult {
  canceled: boolean;
  filePath?: string;
  scratchDirectoryPath?: string;
  document?: unknown;
  authority?: NativeProjectAuthorityDescriptor;
  rejected?: NativeProjectSaveRejection;
}

interface HarnessAdoptResult {
  authority: NativeProjectAuthorityDescriptor;
  filePath?: string;
  scratchDirectoryPath?: string;
  document?: unknown;
}

interface ProjectAuthorityGateway {
  getCurrent: () => NativeProjectAuthorityDescriptor;
  commitStartup: (filePath: string | undefined) => NativeProjectAuthorityDescriptor;
  openProject: (request: {
    senderId: number;
    load: () => Promise<{ canceled: false; filePath: string; document: unknown; scratchDirectoryPath?: string }>;
  }) => Promise<HarnessProjectFileResult>;
  saveProject: (request: {
    senderId: number;
    claim?: NativeProjectAuthorityDescriptor;
    resolveFilePath: (currentFilePath: string | undefined) => Promise<string | undefined> | string | undefined;
    write: (filePath: string) => Promise<{ canceled: false; filePath: string; document: unknown; scratchDirectoryPath?: string }>;
  }) => Promise<HarnessProjectFileResult>;
  clearProject: (request: { senderId: number; reset?: () => Promise<void> }) => Promise<{ ok: boolean; authority: NativeProjectAuthorityDescriptor }>;
  confirmAdoption: (senderId: number, claim: unknown) => { ok: boolean; stale?: boolean; current: NativeProjectAuthorityDescriptor };
  buildAdoptResponse: (getCanonical: () => Omit<HarnessAdoptResult, 'authority'>) => HarnessAdoptResult;
  authorizeSave: (senderId: number, claim: unknown) => { ok: true } | { ok: false; rejected: NativeProjectSaveRejection };
  dropRenderer: (senderId: number) => void;
}

interface ProjectAuthorityModule {
  createProjectAuthority: (options?: {
    mintAuthorityId?: () => string;
    broadcast?: (event: NativeProjectAuthorityChangedEvent) => void;
  }) => ProjectAuthorityGateway;
  normalizeProjectSavePayload: (payload: unknown) => { document: unknown; claim?: NativeProjectAuthorityDescriptor };
}

async function loadProjectAuthorityModule(): Promise<ProjectAuthorityModule> {
  // @ts-expect-error CommonJS Electron helper lives outside the renderer tsconfig module graph.
  return await import('../../electron/project-authority.cjs') as ProjectAuthorityModule;
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

interface HarnessDocument {
  name: string;
  marker: string;
}

/**
 * In-memory stand-in for the Electron main process side of AUD-001: it wires the REAL
 * arbitration gateway (electron/project-authority.cjs) to fake disk/dialog IO exactly the
 * way electron/main.mjs does, so tests can drive two independent renderer clients through
 * the production decision logic and count actual disk writes.
 */
function createMainHarness(module: ProjectAuthorityModule, options: { startup?: { filePath: string; document: HarnessDocument } } = {}) {
  const writes: Array<{ filePath: string; document: HarnessDocument }> = [];
  const disk = new Map<string, HarnessDocument>();
  const openableFiles = new Map<string, HarnessDocument>();
  const broadcasts: NativeProjectAuthorityChangedEvent[] = [];
  const windows = new Map<number, (event: NativeProjectAuthorityChangedEvent) => Promise<void> | void>();
  // Broadcast deliveries are queued as thunks and only run in settle(), mirroring the real
  // IPC boundary: a renderer processes 'project-authority-changed' asynchronously, after the
  // main-process commit that produced it.
  const pendingDeliveries: Array<() => Promise<void> | void> = [];
  let saveHandlerInvocations = 0;

  let currentProjectPath: string | undefined;
  let startupProject: { filePath: string; document: HarnessDocument } | undefined;

  let mintCounter = 0;
  const gateway = module.createProjectAuthority({
    mintAuthorityId: () => `auth-${++mintCounter}`,
    broadcast: (event) => {
      broadcasts.push(event);
      for (const [, deliver] of windows) {
        pendingDeliveries.push(() => deliver(event));
      }
    },
  });

  if (options.startup) {
    openableFiles.set(options.startup.filePath, options.startup.document);
    disk.set(options.startup.filePath, options.startup.document);
    currentProjectPath = options.startup.filePath;
    startupProject = { ...options.startup };
    gateway.commitStartup(options.startup.filePath);
  }

  async function openDocumentFromPath(filePath: string) {
    const document = openableFiles.get(filePath);
    if (!document) {
      throw new Error(`No openable project at ${filePath}`);
    }
    currentProjectPath = filePath;
    startupProject = { filePath, document };
    return { canceled: false as const, filePath, document };
  }

  async function writeDocumentToPath(filePath: string, document: HarnessDocument) {
    writes.push({ filePath, document });
    disk.set(filePath, document);
    openableFiles.set(filePath, document);
    currentProjectPath = filePath;
    startupProject = { filePath, document };
    return { canceled: false as const, filePath, document };
  }

  return {
    gateway,
    writes,
    disk,
    broadcasts,
    addOpenableFile: (filePath: string, document: HarnessDocument) => {
      openableFiles.set(filePath, document);
      disk.set(filePath, document);
    },
    getCurrentProjectPath: () => currentProjectPath,
    getSaveHandlerInvocations: () => saveHandlerInvocations,
    attachWindow: (senderId: number, deliver: (event: NativeProjectAuthorityChangedEvent) => Promise<void> | void) => {
      windows.set(senderId, deliver);
    },
    detachWindow: (senderId: number) => {
      windows.delete(senderId);
      gateway.dropRenderer(senderId);
    },
    async settle() {
      while (pendingDeliveries.length > 0) {
        const batch = pendingDeliveries.splice(0);
        await Promise.all(batch.map((deliver) => deliver()));
      }
    },
    // Mirrors ipcMain.handle('signal-loom:get-native-state').
    getNativeState(senderId: number) {
      return {
        currentProjectPath,
        startupProject: startupProject ? { canceled: false as const, ...startupProject } : undefined,
        projectAuthority: gateway.getCurrent(),
        webContentsId: senderId,
      };
    },
    // Mirrors ipcMain.handle('signal-loom:project-open').
    async invokeOpen(senderId: number, chooseFilePath: () => Promise<string> | string) {
      const filePath = await chooseFilePath();
      return gateway.openProject({
        senderId,
        load: () => openDocumentFromPath(filePath),
      });
    },
    // Mirrors ipcMain.handle('signal-loom:project-save').
    async invokeSave(
      senderId: number,
      payload: unknown,
      resolveFilePath?: (currentFilePath: string | undefined) => Promise<string | undefined> | string | undefined,
    ) {
      saveHandlerInvocations += 1;
      const { document, claim } = module.normalizeProjectSavePayload(payload);
      return gateway.saveProject({
        senderId,
        claim,
        resolveFilePath: resolveFilePath ?? ((currentFilePath) => currentFilePath ?? '/projects/untitled.sloom'),
        write: (filePath) => writeDocumentToPath(filePath, document as HarnessDocument),
      });
    },
    // Mirrors ipcMain.handle('signal-loom:project-save-as') — always a dialog-chosen path.
    async invokeSaveAs(senderId: number, payload: unknown, choosePath: () => Promise<string | undefined> | string | undefined) {
      saveHandlerInvocations += 1;
      const { document, claim } = module.normalizeProjectSavePayload(payload);
      return gateway.saveProject({
        senderId,
        claim,
        resolveFilePath: () => choosePath(),
        write: (filePath) => writeDocumentToPath(filePath, document as HarnessDocument),
      });
    },
    // Mirrors ipcMain.handle('signal-loom:clear-project-path').
    async invokeClear(senderId: number) {
      return gateway.clearProject({
        senderId,
        reset: async () => {
          currentProjectPath = undefined;
          startupProject = undefined;
        },
      });
    },
    // Mirrors ipcMain.handle('signal-loom:project-adopt').
    invokeAdopt(): HarnessAdoptResult {
      return gateway.buildAdoptResponse(() => ({
        filePath: currentProjectPath,
        document: startupProject?.document,
      }));
    },
    // Mirrors ipcMain.handle('signal-loom:project-confirm-adoption').
    invokeConfirmAdoption(senderId: number, claim: unknown) {
      return gateway.confirmAdoption(senderId, claim);
    },
  };
}

type MainHarness = ReturnType<typeof createMainHarness>;

/**
 * One independent renderer: real projectAuthorityClient wired to the harness bridge, with
 * local "Zustand stores" reduced to a document marker so adoption/restore is observable.
 */
function createRendererHarness(main: MainHarness, senderId: number) {
  const restoredSnapshots: Array<{ authority?: NativeProjectAuthorityDescriptor; filePath?: string; document?: unknown }> = [];
  let localDocument: HarnessDocument = { name: `blank-${senderId}`, marker: `blank-${senderId}` };
  let failNextRestore = false;

  function hydrateLocalStores(snapshot: { authority?: NativeProjectAuthorityDescriptor; filePath?: string; document?: unknown }) {
    if (failNextRestore) {
      failNextRestore = false;
      throw new Error('Project replacement was blocked because a dirty Image document is still open.');
    }
    localDocument = snapshot.document
      ? snapshot.document as HarnessDocument
      : { name: `blank-${senderId}`, marker: `blank-${senderId}` };
  }

  const client: ProjectAuthorityClient = createProjectAuthorityClient({
    selfWebContentsId: senderId,
    bridge: {
      adoptProject: async () => main.invokeAdopt() as NativeProjectAdoptResult,
      confirmProjectAdoption: async (claim) => main.invokeConfirmAdoption(senderId, claim),
    },
    // restoredSnapshots records PULL-adoptions only (canonical snapshots fetched because of
    // another window's commit) — a renderer hydrating its own open/boot result is not one.
    restoreSnapshot: async (result) => {
      hydrateLocalStores(result);
      restoredSnapshots.push(result);
    },
    resetSnapshot: async () => {
      hydrateLocalStores({});
    },
  });

  main.attachWindow(senderId, (event) => client.handleAuthorityChanged(event));

  return {
    senderId,
    client,
    restoredSnapshots,
    setLocalDocument: (document: HarnessDocument) => {
      localDocument = document;
    },
    getLocalDocument: () => localDocument,
    failNextRestore: () => {
      failNextRestore = true;
    },
    // Mirrors the App.tsx boot effect: hydrate the startup snapshot and confirm adoption on
    // the client's adoption queue.
    async boot() {
      const state = main.getNativeState(senderId);
      try {
        await client.adoptSnapshot(
          { authority: state.projectAuthority, filePath: state.startupProject?.filePath },
          async () => {
            if (state.startupProject?.document) {
              hydrateLocalStores({ document: state.startupProject.document });
            }
          },
        );
      } catch {
        client.noteAdoptionFailure();
      }
    },
    // Mirrors the file:open menu flow.
    async open(chooseFilePath: () => Promise<string> | string) {
      const result = await main.invokeOpen(senderId, chooseFilePath);
      if (!result.canceled && result.document && result.authority) {
        try {
          await client.adoptSnapshot(
            { authority: result.authority, filePath: result.filePath },
            async () => {
              hydrateLocalStores(result);
            },
          );
        } catch {
          client.noteAdoptionFailure();
        }
      }
      return result;
    },
    // Mirrors the file:save menu flow, including the local stale gate.
    async save(): Promise<{ blockedLocally: true } | { blockedLocally: false; result: HarnessProjectFileResult }> {
      if (client.getSaveBlock()) {
        return { blockedLocally: true };
      }
      const result = await main.invokeSave(senderId, { document: localDocument, claim: client.getClaim() });
      client.applySaveResult(result as NativeProjectFileResult);
      return { blockedLocally: false, result };
    },
    // A save racing ahead of adoption (user hit Ctrl+S mid-switch): bypasses the local gate
    // to prove main-side arbitration alone stops the stale write.
    async forceBridgeSave(claim?: NativeProjectAuthorityDescriptor) {
      const result = await main.invokeSave(senderId, {
        document: localDocument,
        claim: claim ?? client.getClaim(),
      });
      client.applySaveResult(result as NativeProjectFileResult);
      return result;
    },
    async saveAs(choosePath: () => Promise<string | undefined> | string | undefined) {
      if (client.getSaveBlock()) {
        return { blockedLocally: true as const };
      }
      const result = await main.invokeSaveAs(senderId, { document: localDocument, claim: client.getClaim() }, choosePath);
      client.applySaveResult(result as NativeProjectFileResult);
      return { blockedLocally: false as const, result };
    },
    async forceBridgeSaveAs(choosePath: () => Promise<string | undefined> | string | undefined, claim?: NativeProjectAuthorityDescriptor) {
      const result = await main.invokeSaveAs(senderId, {
        document: localDocument,
        claim: claim ?? client.getClaim(),
      }, choosePath);
      client.applySaveResult(result as NativeProjectFileResult);
      return result;
    },
    // Mirrors the file:new menu flow: local reset first, then clear + confirm.
    async clear() {
      localDocument = { name: `blank-${senderId}`, marker: `blank-${senderId}` };
      const result = await main.invokeClear(senderId);
      await client.adoptSnapshot({ authority: result.authority });
      return result;
    },
    async reload() {
      return client.reloadFromDisk();
    },
  };
}

const DOC_A: HarnessDocument = { name: 'Project A', marker: 'A-content' };
const DOC_B: HarnessDocument = { name: 'Project B', marker: 'B-content' };
const DOC_C: HarnessDocument = { name: 'Project C', marker: 'C-content' };

describe('desktop project authority arbitration (AUD-001, two independent renderers)', () => {
  it('rejects a stale save racing a project switch and never touches the switched project on disk', async () => {
    const module = await loadProjectAuthorityModule();
    const main = createMainHarness(module, { startup: { filePath: '/projects/A.sloom', document: DOC_A } });
    main.addOpenableFile('/projects/B.sloom', DOC_B);
    const renderer1 = createRendererHarness(main, 1);
    const renderer2 = createRendererHarness(main, 2);
    await renderer1.boot();
    await renderer2.boot();
    await main.settle();

    const staleClaim = renderer2.client.getClaim();
    expect(staleClaim).toBeDefined();

    const openResult = await renderer1.open(() => '/projects/B.sloom');
    expect(openResult.canceled).toBe(false);
    expect(openResult.authority?.filePath).toBe('/projects/B.sloom');

    // Renderer 2 still holds Project A stores and its pre-switch claim; its save arrives
    // before it adopted B (the exact AUD-001 corruption: A-derived state written into B).
    renderer2.setLocalDocument({ ...DOC_A, marker: 'A-content-edited-in-renderer-2' });
    const staleSave = await renderer2.forceBridgeSave(staleClaim);

    expect(staleSave.rejected?.code).toBe('switched');
    expect(staleSave.filePath).toBeUndefined();
    expect(main.writes).toHaveLength(0);
    expect(main.disk.get('/projects/B.sloom')).toEqual(DOC_B);
    expect(main.getCurrentProjectPath()).toBe('/projects/B.sloom');
    expect(main.gateway.getCurrent().version).toBe(1);

    // Once adoption completes (broadcast-driven), renderer 2 holds B's canonical snapshot
    // and may save again.
    await main.settle();
    expect(renderer2.getLocalDocument()).toEqual(DOC_B);
    expect(renderer2.client.getClaim()?.authorityId).toBe(main.gateway.getCurrent().authorityId);
    const postAdoptionSave = await renderer2.save();
    expect(postAdoptionSave.blockedLocally).toBe(false);
    expect(main.writes).toHaveLength(1);
    expect(main.writes[0]?.filePath).toBe('/projects/B.sloom');
  });

  it('serializes concurrent saves: one writer wins version N+1, the other gets an honest stale rejection', async () => {
    const module = await loadProjectAuthorityModule();
    const main = createMainHarness(module, { startup: { filePath: '/projects/A.sloom', document: DOC_A } });
    const renderer1 = createRendererHarness(main, 1);
    const renderer2 = createRendererHarness(main, 2);
    await renderer1.boot();
    await renderer2.boot();
    await main.settle();

    renderer1.setLocalDocument({ ...DOC_A, marker: 'edit-from-renderer-1' });
    renderer2.setLocalDocument({ ...DOC_A, marker: 'edit-from-renderer-2' });

    const [firstSave, secondSave] = await Promise.all([
      renderer1.forceBridgeSave(),
      renderer2.forceBridgeSave(),
    ]);

    expect(firstSave.rejected).toBeUndefined();
    expect(firstSave.authority?.version).toBe(2);
    expect(secondSave.rejected?.code).toBe('stale');
    expect(main.writes).toHaveLength(1);
    expect(main.disk.get('/projects/A.sloom')?.marker).toBe('edit-from-renderer-1');
    expect(main.gateway.getCurrent().version).toBe(2);

    // The rejected renderer reloads the canonical version and can then save on top of it.
    const reload = await renderer2.reload();
    expect(reload.ok).toBe(true);
    expect(renderer2.getLocalDocument().marker).toBe('edit-from-renderer-1');
    renderer2.setLocalDocument({ ...DOC_A, marker: 'edit-from-renderer-2-rebased' });
    const retry = await renderer2.save();
    expect(retry.blockedLocally).toBe(false);
    expect(main.gateway.getCurrent().version).toBe(3);
    expect(main.writes).toHaveLength(2);
    expect(main.disk.get('/projects/A.sloom')?.marker).toBe('edit-from-renderer-2-rebased');
  });

  it('a save advancing the version stale-marks other renderers so they cannot silently overwrite it', async () => {
    const module = await loadProjectAuthorityModule();
    const main = createMainHarness(module, { startup: { filePath: '/projects/A.sloom', document: DOC_A } });
    const renderer1 = createRendererHarness(main, 1);
    const renderer2 = createRendererHarness(main, 2);
    await renderer1.boot();
    await renderer2.boot();
    await main.settle();

    const restoresAfterBoot = renderer2.restoredSnapshots.length;
    renderer1.setLocalDocument({ ...DOC_A, marker: 'saved-by-renderer-1' });
    const save = await renderer1.save();
    expect(save.blockedLocally).toBe(false);
    await main.settle();

    // Renderer 2 was notified: explicitly stale, its unsaved stores untouched (no silent
    // auto-restore of its in-progress work on a plain save).
    expect(renderer2.client.getState().stale).toBe(true);
    expect(renderer2.client.getState().staleReason).toBe('saved-elsewhere');
    expect(renderer2.restoredSnapshots.length).toBe(restoresAfterBoot);

    // Its save is blocked locally before any IPC round-trip.
    const invocationsBefore = main.getSaveHandlerInvocations();
    const blocked = await renderer2.save();
    expect(blocked.blockedLocally).toBe(true);
    expect(main.getSaveHandlerInvocations()).toBe(invocationsBefore);

    // Even bypassing the local gate, main rejects the stale version claim.
    const forced = await renderer2.forceBridgeSave();
    expect(forced.rejected?.code).toBe('stale');
    expect(main.writes).toHaveLength(1);

    // The saving renderer itself stays adopted and can keep saving (Ctrl+S, Ctrl+S).
    const secondSave = await renderer1.save();
    expect(secondSave.blockedLocally).toBe(false);
    expect(main.gateway.getCurrent().version).toBe(3);
  });

  it('rejects a delayed save whose dialog resolves after a project switch, inside the arbitration lock', async () => {
    const module = await loadProjectAuthorityModule();
    const main = createMainHarness(module, { startup: { filePath: '/projects/A.sloom', document: DOC_A } });
    main.addOpenableFile('/projects/B.sloom', DOC_B);
    const renderer1 = createRendererHarness(main, 1);
    const renderer2 = createRendererHarness(main, 2);
    await renderer1.boot();
    await renderer2.boot();
    await main.settle();

    // Renderer 2 starts a Save As; the destination dialog stays open (deferred). Its claim
    // is valid at this moment, so the precheck passes.
    const dialog = createDeferred<string | undefined>();
    renderer2.setLocalDocument({ ...DOC_A, marker: 'A-derived-payload' });
    const delayedSave = renderer2.forceBridgeSaveAs(() => dialog.promise);

    // While the dialog is open, renderer 1 switches the whole app to Project B.
    await renderer1.open(() => '/projects/B.sloom');
    const authorityAfterSwitch = main.gateway.getCurrent();

    // The user now confirms the stale dialog; the write must be re-validated and rejected.
    dialog.resolve('/projects/late-copy.sloom');
    const result = await delayedSave;

    expect(result.rejected?.code).toBe('switched');
    expect(main.writes).toHaveLength(0);
    expect(main.disk.has('/projects/late-copy.sloom')).toBe(false);
    expect(main.gateway.getCurrent()).toEqual(authorityAfterSwitch);
  });

  it('lets a delayed open completing after another open win authority and re-synchronize every renderer', async () => {
    const module = await loadProjectAuthorityModule();
    const main = createMainHarness(module, { startup: { filePath: '/projects/A.sloom', document: DOC_A } });
    main.addOpenableFile('/projects/B.sloom', DOC_B);
    main.addOpenableFile('/projects/C.sloom', DOC_C);
    const renderer1 = createRendererHarness(main, 1);
    const renderer2 = createRendererHarness(main, 2);
    await renderer1.boot();
    await renderer2.boot();
    await main.settle();

    const slowDialog = createDeferred<string>();
    const slowOpen = renderer1.open(() => slowDialog.promise);
    await renderer2.open(() => '/projects/C.sloom');
    await main.settle();
    expect(main.gateway.getCurrent().filePath).toBe('/projects/C.sloom');

    slowDialog.resolve('/projects/B.sloom');
    await slowOpen;
    await main.settle();

    expect(main.gateway.getCurrent().filePath).toBe('/projects/B.sloom');
    expect(renderer1.client.getClaim()?.authorityId).toBe(main.gateway.getCurrent().authorityId);
    expect(renderer2.client.getClaim()?.authorityId).toBe(main.gateway.getCurrent().authorityId);
    expect(renderer2.getLocalDocument()).toEqual(DOC_B);
  });

  it('rejects save-as from a renderer that failed adoption after a switch and leaves it explicitly read-only', async () => {
    const module = await loadProjectAuthorityModule();
    const main = createMainHarness(module, { startup: { filePath: '/projects/A.sloom', document: DOC_A } });
    main.addOpenableFile('/projects/B.sloom', DOC_B);
    const renderer1 = createRendererHarness(main, 1);
    const renderer2 = createRendererHarness(main, 2);
    await renderer1.boot();
    await renderer2.boot();
    await main.settle();

    // Renderer 2 cannot adopt (e.g. a dirty Image document blocks replacement).
    renderer2.failNextRestore();
    await renderer1.open(() => '/projects/B.sloom');
    await main.settle();

    expect(renderer2.client.getState().stale).toBe(true);
    expect(renderer2.client.getState().staleReason).toBe('adoption-failed');
    expect(renderer2.getLocalDocument()).toEqual(DOC_A);

    // Save As is blocked locally (read-only until adoption succeeds)…
    const localGate = await renderer2.saveAs(() => '/projects/copy-of-A.sloom');
    expect(localGate.blockedLocally).toBe(true);

    // …and main rejects the stale identity even when the gate is bypassed.
    const forced = await renderer2.forceBridgeSaveAs(() => '/projects/copy-of-A.sloom');
    expect(forced.rejected?.code).toBe('switched');
    expect(main.writes).toHaveLength(0);
    expect(main.disk.has('/projects/copy-of-A.sloom')).toBe(false);

    // Reload recovers: it adopts the canonical Project B snapshot and re-enables saving.
    const reload = await renderer2.reload();
    expect(reload.ok).toBe(true);
    expect(renderer2.getLocalDocument()).toEqual(DOC_B);
    expect(renderer2.client.getState().stale).toBe(false);
    const save = await renderer2.save();
    expect(save.blockedLocally).toBe(false);
    expect(main.writes).toHaveLength(1);
  });

  it('save-as mints a new project identity so adoptions of the old identity stop authorizing', async () => {
    const module = await loadProjectAuthorityModule();
    const main = createMainHarness(module, { startup: { filePath: '/projects/A.sloom', document: DOC_A } });
    const renderer1 = createRendererHarness(main, 1);
    const renderer2 = createRendererHarness(main, 2);
    await renderer1.boot();
    await renderer2.boot();
    await main.settle();
    const identityA = main.gateway.getCurrent().authorityId;

    renderer1.setLocalDocument({ ...DOC_A, marker: 'A-forked' });
    const saveAs = await renderer1.saveAs(() => '/projects/A-fork.sloom');
    expect(saveAs.blockedLocally).toBe(false);
    await main.settle();

    const identityFork = main.gateway.getCurrent().authorityId;
    expect(identityFork).not.toBe(identityA);
    expect(main.gateway.getCurrent().filePath).toBe('/projects/A-fork.sloom');
    expect(main.gateway.getCurrent().version).toBe(1);

    // Renderer 2 keeps its unsaved stores but is stale-marked, and its old-identity claim
    // no longer authorizes anything.
    expect(renderer2.client.getState().stale).toBe(true);
    const forced = await renderer2.forceBridgeSave();
    expect(forced.rejected?.code).toBe('switched');
    expect(main.writes).toHaveLength(1);

    const reload = await renderer2.reload();
    expect(reload.ok).toBe(true);
    expect(renderer2.getLocalDocument().marker).toBe('A-forked');
    const save = await renderer2.save();
    expect(save.blockedLocally).toBe(false);
    expect(main.gateway.getCurrent().version).toBe(2);
  });

  it('reopening the same path mints a fresh identity, so claims from before the reopen are rejected', async () => {
    const module = await loadProjectAuthorityModule();
    const main = createMainHarness(module, { startup: { filePath: '/projects/A.sloom', document: DOC_A } });
    const renderer1 = createRendererHarness(main, 1);
    const renderer2 = createRendererHarness(main, 2);
    await renderer1.boot();
    await renderer2.boot();
    await main.settle();

    const preReopenClaim = renderer2.client.getClaim();
    await renderer1.open(() => '/projects/A.sloom');
    expect(main.gateway.getCurrent().filePath).toBe('/projects/A.sloom');
    expect(main.gateway.getCurrent().authorityId).not.toBe(preReopenClaim?.authorityId);

    const forced = await renderer2.forceBridgeSave(preReopenClaim);
    expect(forced.rejected?.code).toBe('switched');
    expect(main.writes).toHaveLength(0);
  });

  it('a reloaded renderer re-adopts via boot state; one that never confirmed adoption stays unauthorized', async () => {
    const module = await loadProjectAuthorityModule();
    const main = createMainHarness(module, { startup: { filePath: '/projects/A.sloom', document: DOC_A } });
    const renderer1 = createRendererHarness(main, 1);
    const renderer2 = createRendererHarness(main, 2);
    await renderer1.boot();
    await renderer2.boot();
    await main.settle();

    renderer1.setLocalDocument({ ...DOC_A, marker: 'v2' });
    await renderer1.save();
    await main.settle();

    // Renderer 2 crashes and reloads: same webContents id, fresh renderer state.
    main.detachWindow(2);
    const rebooted = createRendererHarness(main, 2);
    await rebooted.boot();
    expect(rebooted.getLocalDocument().marker).toBe('v2');
    const save = await rebooted.save();
    expect(save.blockedLocally).toBe(false);
    expect(main.gateway.getCurrent().version).toBe(3);

    // A third window that never confirmed adoption cannot save even with a fabricated,
    // current-looking claim: authorization is per-sender, not claim-shape alone.
    const ghost = createRendererHarness(main, 3);
    const fabricated = main.gateway.getCurrent();
    const forged = await ghost.forceBridgeSave(fabricated);
    expect(forged.rejected?.code).toBe('unauthorized');
    const unopened = await ghost.forceBridgeSave(undefined);
    expect(unopened.rejected?.code).toBe('unopened');
    expect(main.gateway.getCurrent().version).toBe(3);
  });

  it('ignores a delayed adoption confirmation that arrives after a project switch', async () => {
    const module = await loadProjectAuthorityModule();
    const main = createMainHarness(module, { startup: { filePath: '/projects/A.sloom', document: DOC_A } });
    main.addOpenableFile('/projects/B.sloom', DOC_B);
    const renderer1 = createRendererHarness(main, 1);
    await renderer1.boot();
    await main.settle();

    // Renderer 2 pulled Project A's snapshot but its confirmation is delayed past the switch.
    const adoptionOfA = main.invokeAdopt();
    await renderer1.open(() => '/projects/B.sloom');
    const lateConfirmation = main.invokeConfirmAdoption(2, adoptionOfA.authority);

    expect(lateConfirmation.ok).toBe(false);
    expect(lateConfirmation.stale).toBe(true);
    const ghostSave = await main.invokeSave(2, { document: DOC_A, claim: adoptionOfA.authority });
    expect(ghostSave.rejected?.code).toBe('switched');
    expect(main.writes).toHaveLength(0);
  });

  it('clear-project (File > New) mints a blank identity, re-synchronizes other renderers, and invalidates old claims', async () => {
    const module = await loadProjectAuthorityModule();
    const main = createMainHarness(module, { startup: { filePath: '/projects/A.sloom', document: DOC_A } });
    const renderer1 = createRendererHarness(main, 1);
    const renderer2 = createRendererHarness(main, 2);
    await renderer1.boot();
    await renderer2.boot();
    await main.settle();
    const claimOnA = renderer2.client.getClaim();

    await renderer1.clear();
    await main.settle();

    expect(main.gateway.getCurrent().filePath).toBeUndefined();
    expect(renderer2.getLocalDocument().marker).toBe('blank-2');
    expect(renderer2.client.getClaim()?.authorityId).toBe(main.gateway.getCurrent().authorityId);

    const forced = await renderer2.forceBridgeSave(claimOnA);
    expect(forced.rejected?.code).toBe('switched');
    expect(main.writes).toHaveLength(0);
  });

  it('the first save of a blank project binds its identity to the chosen path and stale-marks the other renderer', async () => {
    const module = await loadProjectAuthorityModule();
    const main = createMainHarness(module);
    const renderer1 = createRendererHarness(main, 1);
    const renderer2 = createRendererHarness(main, 2);
    await renderer1.boot();
    await renderer2.boot();
    await main.settle();
    const blankIdentity = main.gateway.getCurrent().authorityId;

    renderer1.setLocalDocument({ name: 'Fresh', marker: 'flow-edits-from-renderer-1' });
    renderer2.setLocalDocument({ name: 'Fresh', marker: 'paper-edits-from-renderer-2' });

    const firstSave = await renderer1.save();
    expect(firstSave.blockedLocally).toBe(false);
    await main.settle();

    expect(main.writes).toHaveLength(1);
    expect(main.gateway.getCurrent().filePath).toBe('/projects/untitled.sloom');
    expect(main.gateway.getCurrent().authorityId).not.toBe(blankIdentity);

    // Renderer 2's blank-identity save must NOT overwrite the file with its own partial
    // state (the blank-project variant of the AUD-001 corruption).
    const blocked = await renderer2.save();
    expect(blocked.blockedLocally).toBe(true);
    const forced = await renderer2.forceBridgeSave();
    expect(forced.rejected?.code).toBe('switched');
    expect(main.writes).toHaveLength(1);
    expect(main.disk.get('/projects/untitled.sloom')?.marker).toBe('flow-edits-from-renderer-1');
  });

  it('never mutates authority, current path, or disk on any rejection path', async () => {
    const module = await loadProjectAuthorityModule();
    const main = createMainHarness(module, { startup: { filePath: '/projects/A.sloom', document: DOC_A } });
    const renderer1 = createRendererHarness(main, 1);
    await renderer1.boot();
    await main.settle();
    renderer1.setLocalDocument({ ...DOC_A, marker: 'v2' });
    await renderer1.save();
    const authorityBefore = main.gateway.getCurrent();
    const writesBefore = main.writes.length;

    const rejectionAttempts: Array<() => Promise<HarnessProjectFileResult>> = [
      () => main.invokeSave(9, { document: DOC_B }),
      () => main.invokeSave(9, { document: DOC_B, claim: { authorityId: 'auth-nonexistent', version: 1 } }),
      () => main.invokeSave(9, { document: DOC_B, claim: { ...authorityBefore, version: authorityBefore.version - 1 } }),
      () => main.invokeSave(9, { document: DOC_B, claim: authorityBefore }),
      () => main.invokeSaveAs(9, { document: DOC_B, claim: { authorityId: 'auth-nonexistent', version: 1 } }, () => '/projects/should-never-exist.sloom'),
    ];
    const expectedCodes = ['unopened', 'switched', 'stale', 'unauthorized', 'switched'];

    for (const [index, attempt] of rejectionAttempts.entries()) {
      const result = await attempt();
      expect(result.rejected?.code).toBe(expectedCodes[index]);
      expect(result.rejected?.current).toEqual(authorityBefore);
      expect(main.gateway.getCurrent()).toEqual(authorityBefore);
      expect(main.writes.length).toBe(writesBefore);
      expect(main.getCurrentProjectPath()).toBe('/projects/A.sloom');
    }
    expect(main.disk.has('/projects/should-never-exist.sloom')).toBe(false);
  });

  it('a failed open in the initiating renderer leaves it explicitly stale instead of silently rebound', async () => {
    const module = await loadProjectAuthorityModule();
    const main = createMainHarness(module, { startup: { filePath: '/projects/A.sloom', document: DOC_A } });
    main.addOpenableFile('/projects/B.sloom', DOC_B);
    const renderer1 = createRendererHarness(main, 1);
    await renderer1.boot();
    await main.settle();
    const claimOnA = renderer1.client.getClaim();

    renderer1.failNextRestore();
    await renderer1.open(() => '/projects/B.sloom');
    await main.settle();

    // The window still holds Project A stores; a bare title/path change must not have
    // granted it any save rights on Project B.
    expect(renderer1.getLocalDocument()).toEqual(DOC_A);
    expect(renderer1.client.getState().stale).toBe(true);
    expect(renderer1.client.getClaim()).toEqual(claimOnA);
    const gate = await renderer1.save();
    expect(gate.blockedLocally).toBe(true);
    const forced = await renderer1.forceBridgeSave();
    expect(forced.rejected?.code).toBe('switched');
    expect(main.writes).toHaveLength(0);

    const reload = await renderer1.reload();
    expect(reload.ok).toBe(true);
    expect(renderer1.getLocalDocument()).toEqual(DOC_B);
    const save = await renderer1.save();
    expect(save.blockedLocally).toBe(false);
    expect(main.writes).toHaveLength(1);
    expect(main.writes[0]?.filePath).toBe('/projects/B.sloom');
  });

  it('renderers ignore authority events they initiated themselves', async () => {
    const module = await loadProjectAuthorityModule();
    const main = createMainHarness(module, { startup: { filePath: '/projects/A.sloom', document: DOC_A } });
    main.addOpenableFile('/projects/B.sloom', DOC_B);
    const renderer1 = createRendererHarness(main, 1);
    await renderer1.boot();
    await main.settle();

    const restoresBefore = renderer1.restoredSnapshots.length;
    await renderer1.open(() => '/projects/B.sloom');
    await main.settle();

    // Exactly one restore: the open result itself — the initiator's own broadcast echo
    // must not trigger a second pull-adoption.
    expect(renderer1.restoredSnapshots.length - restoresBefore).toBe(0);
    expect(renderer1.getLocalDocument()).toEqual(DOC_B);
    expect(renderer1.client.getState().stale).toBe(false);
  });

  it('accepts legacy raw-document save payloads but treats them as unopened claims', async () => {
    const module = await loadProjectAuthorityModule();
    const { normalizeProjectSavePayload } = module;

    const wrapped = normalizeProjectSavePayload({ document: DOC_A, claim: { authorityId: 'auth-1', version: 3 } });
    expect(wrapped.document).toEqual(DOC_A);
    expect(wrapped.claim).toEqual({ authorityId: 'auth-1', version: 3 });

    const legacyDocument = { schemaVersion: 12, id: 'p', name: 'Legacy', flow: { nodes: [], edges: [] } };
    const legacy = normalizeProjectSavePayload(legacyDocument);
    expect(legacy.document).toBe(legacyDocument);
    expect(legacy.claim).toBeUndefined();

    const main = createMainHarness(module, { startup: { filePath: '/projects/A.sloom', document: DOC_A } });
    const result = await main.invokeSave(1, legacyDocument);
    expect(result.rejected?.code).toBe('unopened');
    expect(main.writes).toHaveLength(0);
  });
});

describe('project authority renderer wiring source guards (AUD-001)', () => {
  it('preload exposes the adoption bridge and forwards save payloads with claims', () => {
    const source = readFileSync(join(process.cwd(), 'electron/preload.cjs'), 'utf8');

    expect(source).toContain("adoptProject: () => ipcRenderer.invoke('signal-loom:project-adopt')");
    expect(source).toContain("confirmProjectAdoption: (claim) => ipcRenderer.invoke('signal-loom:project-confirm-adoption', claim)");
    expect(source).toContain("onProjectAuthorityChanged: (callback) => onChannel('signal-loom:project-authority-changed', callback)");
    expect(source).toMatch(/saveProjectFile: \(payload\) => ipcRenderer\.invoke\('signal-loom:project-save', payload\)/);
    expect(source).toMatch(/saveProjectFileAs: \(payload\) => ipcRenderer\.invoke\('signal-loom:project-save-as', payload\)/);
  });

  it('App gates project saves through the authority client instead of trusting the displayed path', () => {
    const source = readFileSync(join(process.cwd(), 'src/App.tsx'), 'utf8');

    expect(source).toContain('createProjectAuthorityClient');
    expect(source).toContain('onProjectAuthorityChanged');
    // The stale gate must run before Save/Save As serialize local stores.
    expect(source).toMatch(/getSaveBlock\(\)/);
    // The old behavior — treating a bare path broadcast as a full project switch — is gone.
    expect(source).not.toMatch(/onProjectPathChanged\(\(filePath\) => \{\s*setNativeProjectPath\(filePath\);\s*\}\)/);
  });
});
