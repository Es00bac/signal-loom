import type {
  NativeExternalOpenEntry,
  NativeProjectFileResult,
  SignalLoomNativeBridge,
} from './nativeApp';

export interface NativeExternalOpenErrorContext {
  /** 'project' | 'paper' for document entries, 'take' when the drain itself failed. */
  kind: string;
  filePath?: string;
  message: string;
}

export interface NativeExternalOpenHandlers {
  /** Apply a project entry through the canonical native open completion. */
  applyProject: (result: NativeProjectFileResult) => Promise<void> | void;
  /** Apply a paper entry through the canonical .slppr import transaction. */
  applyPaper: (bytes: Uint8Array, filePath?: string) => Promise<void> | void;
  onError: (context: NativeExternalOpenErrorContext) => Promise<void> | void;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function applyExternalOpenEntry(entry: NativeExternalOpenEntry, handlers: NativeExternalOpenHandlers): Promise<void> {
  const kind: string = entry?.kind ?? 'unknown';
  const filePath = entry?.filePath;

  try {
    if (entry?.error) {
      await handlers.onError({ kind, filePath, message: entry.error });
      return;
    }
    if (entry?.kind === 'project' && entry.result?.document) {
      await handlers.applyProject(entry.result);
      return;
    }
    if (entry?.kind === 'paper' && entry.bytes) {
      await handlers.applyPaper(new Uint8Array(entry.bytes), filePath);
      return;
    }
    await handlers.onError({ kind, filePath, message: 'The external open request was malformed.' });
  } catch (error) {
    await handlers.onError({ kind, filePath, message: toErrorMessage(error) });
  }
}

/**
 * Consume externally opened documents (double-clicked .sloom/.slppr files, second-instance
 * launches, macOS open-file events) from the main-process queue.
 *
 * The pending-channel subscription is registered before the initial drain so nothing enqueued
 * in between is missed; every drain is chained onto the previous one so entries always apply
 * sequentially through the canonical handlers. Each drain is atomic in the main process, so an
 * entry is delivered — and therefore applied — at most once even across overlapping wake-ups.
 *
 * Returns an unregister function; a bridge without the external-open methods yields a no-op.
 */
export function registerNativeExternalOpenConsumer(
  bridge: SignalLoomNativeBridge | undefined,
  handlers: NativeExternalOpenHandlers,
): () => void {
  const take = bridge?.takeExternalOpenRequests;
  if (!take) {
    return () => {};
  }

  let disposed = false;
  let chain: Promise<void> = Promise.resolve();

  const drain = () => {
    chain = chain.then(async () => {
      if (disposed) {
        return;
      }
      let entries: NativeExternalOpenEntry[];
      try {
        entries = (await take())?.entries ?? [];
      } catch (error) {
        await handlers.onError({ kind: 'take', message: toErrorMessage(error) });
        return;
      }
      // Entries are already consumed from the main-process queue, so apply the whole batch
      // even if disposal races the drain — dropping them here would lose the open forever.
      for (const entry of entries) {
        await applyExternalOpenEntry(entry, handlers);
      }
    });
  };

  const unsubscribe = bridge?.onExternalOpenPending?.(() => {
    drain();
  });
  drain();

  return () => {
    disposed = true;
    unsubscribe?.();
  };
}
