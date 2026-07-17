import { describe, expect, it, vi } from 'vitest';
import { registerNativeExternalOpenConsumer, type NativeExternalOpenErrorContext } from './nativeExternalOpen';
import type { NativeExternalOpenTakeResult, NativeProjectFileResult, SignalLoomNativeBridge } from './nativeApp';
import type { FlowProjectDocument } from './projectLibrary';

type PendingListener = () => void;

const projectDocumentStub = {} as FlowProjectDocument;

function createBridge(batches: NativeExternalOpenTakeResult[]) {
  const listeners = new Set<PendingListener>();
  const remaining = [...batches];
  const takeExternalOpenRequests = vi.fn(async () => remaining.shift() ?? { entries: [] });
  const onExternalOpenPending = vi.fn((callback: PendingListener) => {
    listeners.add(callback);
    return () => listeners.delete(callback);
  });
  const bridge = {
    takeExternalOpenRequests,
    onExternalOpenPending,
  } as unknown as SignalLoomNativeBridge;
  return {
    bridge,
    takeExternalOpenRequests,
    onExternalOpenPending,
    emitPending: () => {
      for (const listener of [...listeners]) listener();
    },
    listenerCount: () => listeners.size,
  };
}

function createHandlers() {
  return {
    applyProject: vi.fn(async (_result: NativeProjectFileResult) => {}),
    applyPaper: vi.fn(async (_bytes: Uint8Array, _filePath?: string) => {}),
    onError: vi.fn(async (_context: NativeExternalOpenErrorContext) => {}),
  };
}

async function flushMicrotasks(rounds = 8) {
  for (let i = 0; i < rounds; i += 1) {
    await Promise.resolve();
  }
}

describe('registerNativeExternalOpenConsumer', () => {
  it('is a safe no-op when the bridge or its external-open methods are absent', async () => {
    const handlers = createHandlers();

    const unregisterWithoutBridge = registerNativeExternalOpenConsumer(undefined, handlers);
    const unregisterWithoutMethods = registerNativeExternalOpenConsumer(
      {} as unknown as SignalLoomNativeBridge,
      handlers,
    );
    await flushMicrotasks();

    expect(typeof unregisterWithoutBridge).toBe('function');
    expect(typeof unregisterWithoutMethods).toBe('function');
    unregisterWithoutBridge();
    unregisterWithoutMethods();
    expect(handlers.applyProject).not.toHaveBeenCalled();
    expect(handlers.onError).not.toHaveBeenCalled();
  });

  it('subscribes to the pending channel before running the initial drain', async () => {
    const order: string[] = [];
    const listeners = new Set<PendingListener>();
    const bridge = {
      takeExternalOpenRequests: vi.fn(async () => {
        order.push('take');
        return { entries: [] };
      }),
      onExternalOpenPending: vi.fn((callback: PendingListener) => {
        order.push('subscribe');
        listeners.add(callback);
        return () => listeners.delete(callback);
      }),
    } as unknown as SignalLoomNativeBridge;

    const unregister = registerNativeExternalOpenConsumer(bridge, createHandlers());
    await flushMicrotasks();
    unregister();

    expect(order[0]).toBe('subscribe');
    expect(order).toContain('take');
  });

  it('applies drained project and paper entries in order through the canonical handlers', async () => {
    const projectResult: NativeProjectFileResult = {
      canceled: false,
      filePath: '/home/user/comic.sloom',
      document: projectDocumentStub,
    };
    const paperBytes = new Uint8Array([1, 2, 3]);
    const { bridge } = createBridge([
      {
        entries: [
          { kind: 'project', filePath: '/home/user/comic.sloom', result: projectResult },
          { kind: 'paper', filePath: '/home/user/layout.slppr', bytes: paperBytes },
        ],
      },
    ]);
    const applied: string[] = [];
    const handlers = {
      applyProject: vi.fn(async () => {
        applied.push('project');
      }),
      applyPaper: vi.fn(async () => {
        applied.push('paper');
      }),
      onError: vi.fn(async () => {}),
    };

    const unregister = registerNativeExternalOpenConsumer(bridge, handlers);
    await flushMicrotasks();
    unregister();

    expect(handlers.applyProject).toHaveBeenCalledTimes(1);
    expect(handlers.applyProject).toHaveBeenCalledWith(projectResult);
    expect(handlers.applyPaper).toHaveBeenCalledTimes(1);
    const [bytesArg, filePathArg] = handlers.applyPaper.mock.calls[0] as unknown as [Uint8Array, string];
    expect(Array.from(bytesArg)).toEqual([1, 2, 3]);
    expect(filePathArg).toBe('/home/user/layout.slppr');
    expect(applied).toEqual(['project', 'paper']);
    expect(handlers.onError).not.toHaveBeenCalled();
  });

  it('drains again when the pending channel fires and never re-applies consumed entries', async () => {
    const { bridge, takeExternalOpenRequests, emitPending } = createBridge([
      {
        entries: [{
          kind: 'project',
          filePath: '/a.sloom',
          result: { canceled: false, filePath: '/a.sloom', document: projectDocumentStub },
        }],
      },
      { entries: [{ kind: 'paper', filePath: '/b.slppr', bytes: new Uint8Array([9]) }] },
    ]);
    const handlers = createHandlers();

    const unregister = registerNativeExternalOpenConsumer(bridge, handlers);
    await flushMicrotasks();
    emitPending();
    await flushMicrotasks();
    emitPending();
    await flushMicrotasks();
    unregister();

    expect(takeExternalOpenRequests).toHaveBeenCalledTimes(3);
    expect(handlers.applyProject).toHaveBeenCalledTimes(1);
    expect(handlers.applyPaper).toHaveBeenCalledTimes(1);
  });

  it('serializes overlapping drains so entries apply sequentially', async () => {
    let releaseFirstApply: () => void = () => {};
    const firstApplyGate = new Promise<void>((resolvePromise) => {
      releaseFirstApply = resolvePromise;
    });
    const events: string[] = [];
    const { bridge, emitPending } = createBridge([
      { entries: [{ kind: 'paper', filePath: '/a.slppr', bytes: new Uint8Array([1]) }] },
      { entries: [{ kind: 'paper', filePath: '/b.slppr', bytes: new Uint8Array([2]) }] },
    ]);
    const handlers = {
      applyProject: vi.fn(async (_result: NativeProjectFileResult) => {}),
      applyPaper: vi.fn(async (_bytes: Uint8Array, filePath?: string) => {
        events.push(`start:${filePath}`);
        if (filePath === '/a.slppr') {
          await firstApplyGate;
        }
        events.push(`end:${filePath}`);
      }),
      onError: vi.fn(async (_context: NativeExternalOpenErrorContext) => {}),
    };

    const unregister = registerNativeExternalOpenConsumer(bridge, handlers);
    await flushMicrotasks();
    emitPending();
    await flushMicrotasks();

    expect(events).toEqual(['start:/a.slppr']);
    releaseFirstApply();
    await flushMicrotasks();
    unregister();

    expect(events).toEqual(['start:/a.slppr', 'end:/a.slppr', 'start:/b.slppr', 'end:/b.slppr']);
  });

  it('routes error entries and malformed entries to onError without applying them', async () => {
    const { bridge } = createBridge([
      {
        entries: [
          { kind: 'project', filePath: '/broken.sloom', error: 'The project file is corrupt.' },
          { kind: 'paper', filePath: '/empty.slppr' },
          { kind: 'mystery', filePath: '/odd.bin' } as never,
        ],
      },
    ]);
    const handlers = createHandlers();

    const unregister = registerNativeExternalOpenConsumer(bridge, handlers);
    await flushMicrotasks();
    unregister();

    expect(handlers.applyProject).not.toHaveBeenCalled();
    expect(handlers.applyPaper).not.toHaveBeenCalled();
    expect(handlers.onError).toHaveBeenCalledTimes(3);
    expect(handlers.onError.mock.calls[0][0]).toMatchObject({
      kind: 'project',
      filePath: '/broken.sloom',
      message: 'The project file is corrupt.',
    });
  });

  it('reports handler failures through onError and keeps processing later entries', async () => {
    const { bridge } = createBridge([
      {
        entries: [
          {
            kind: 'project',
            filePath: '/a.sloom',
            result: { canceled: false, filePath: '/a.sloom', document: projectDocumentStub },
          },
          { kind: 'paper', filePath: '/b.slppr', bytes: new Uint8Array([7]) },
        ],
      },
    ]);
    const handlers = {
      applyProject: vi.fn(async (_result: NativeProjectFileResult) => {
        throw new Error('restore exploded');
      }),
      applyPaper: vi.fn(async (_bytes: Uint8Array, _filePath?: string) => {}),
      onError: vi.fn(async (_context: NativeExternalOpenErrorContext) => {}),
    };

    const unregister = registerNativeExternalOpenConsumer(bridge, handlers);
    await flushMicrotasks();
    unregister();

    expect(handlers.onError).toHaveBeenCalledTimes(1);
    expect(handlers.onError.mock.calls[0][0]).toMatchObject({ kind: 'project', message: 'restore exploded' });
    expect(handlers.applyPaper).toHaveBeenCalledTimes(1);
  });

  it('reports take failures through onError instead of throwing', async () => {
    const bridge = {
      takeExternalOpenRequests: vi.fn(async () => {
        throw new Error('ipc unavailable');
      }),
      onExternalOpenPending: vi.fn(() => () => {}),
    } as unknown as SignalLoomNativeBridge;
    const handlers = createHandlers();

    const unregister = registerNativeExternalOpenConsumer(bridge, handlers);
    await flushMicrotasks();
    unregister();

    expect(handlers.onError).toHaveBeenCalledTimes(1);
    expect(handlers.onError.mock.calls[0][0]).toMatchObject({ kind: 'take', message: 'ipc unavailable' });
  });

  it('unregisters the pending listener and stops draining after disposal', async () => {
    const { bridge, takeExternalOpenRequests, emitPending, listenerCount } = createBridge([
      { entries: [] },
      { entries: [{ kind: 'paper', filePath: '/late.slppr', bytes: new Uint8Array([1]) }] },
    ]);
    const handlers = createHandlers();

    const unregister = registerNativeExternalOpenConsumer(bridge, handlers);
    await flushMicrotasks();
    expect(listenerCount()).toBe(1);

    unregister();
    expect(listenerCount()).toBe(0);
    emitPending();
    await flushMicrotasks();

    expect(takeExternalOpenRequests).toHaveBeenCalledTimes(1);
    expect(handlers.applyPaper).not.toHaveBeenCalled();
  });
});
