import type {
  NativeExternalOpenIntent,
  NativeExternalOpenTransitionResult,
  NativeProjectFileResult,
  SignalLoomNativeBridge,
} from './nativeApp';

export interface NativeExternalOpenErrorContext {
  kind: string;
  filePath?: string;
  message: string;
}

export interface NativeExternalOpenHandlers {
  /** Run the renderer-owned dirty-document guard before main may stage canonical project state. */
  authorizeProject: (result: NativeProjectFileResult) => Promise<void> | void;
  /** Apply a prepared project after main acknowledges acceptance. */
  applyProject: (result: NativeProjectFileResult) => Promise<void> | void;
  /** Publish renderer-local path/scratch ownership only after main commits. */
  onProjectCommitted: (result: NativeProjectFileResult) => Promise<void> | void;
  applyPaper: (bytes: Uint8Array, filePath?: string) => Promise<void> | void;
  onError: (context: NativeExternalOpenErrorContext) => Promise<void> | void;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function assertTransition(
  result: NativeExternalOpenTransitionResult,
  expected: NativeExternalOpenTransitionResult['status'],
): void {
  if (result.status !== expected) {
    throw new Error(result.error ?? `External open ${expected} failed (${result.status}).`);
  }
}

function validateIntent(intent: NativeExternalOpenIntent): void {
  if (intent.error) throw new Error(intent.error);
  if (intent.kind === 'project' && !intent.result?.document) {
    throw new Error('The external project open intent was malformed.');
  }
  if (intent.kind === 'paper' && !intent.bytes) {
    throw new Error('The external Paper open intent was malformed.');
  }
}

/**
 * Register the one renderer allowed to transact external document opens. Main chooses whether
 * this renderer is the designated live Flow window and returns an epoch when authorized. Every
 * intent then follows offer → renderer guard → accept → apply → commit. Rejecting an offer does
 * not consume its idempotency key, and stale epochs cannot drain or mutate the queue.
 */
export function registerNativeExternalOpenConsumer(
  bridge: SignalLoomNativeBridge | undefined,
  handlers: NativeExternalOpenHandlers,
): () => void {
  const authorize = bridge?.authorizeExternalOpenRenderer;
  const next = bridge?.nextExternalOpenIntent;
  const accept = bridge?.acceptExternalOpenIntent;
  const reject = bridge?.rejectExternalOpenIntent;
  const commit = bridge?.commitExternalOpenIntent;
  if (!authorize || !next || !accept || !reject || !commit) return () => {};

  let disposed = false;
  let epoch: string | undefined;
  let chain: Promise<void> = Promise.resolve();

  const ensureAuthorization = async (): Promise<string | undefined> => {
    if (epoch) return epoch;
    const result = await authorize();
    if (!result.authorized || !result.epoch) return undefined;
    epoch = result.epoch;
    return epoch;
  };

  const drain = () => {
    chain = chain.then(async () => {
      if (disposed) return;
      let activeEpoch: string | undefined;
      try {
        activeEpoch = await ensureAuthorization();
      } catch (error) {
        await handlers.onError({ kind: 'authorize', message: toErrorMessage(error) });
        return;
      }
      if (!activeEpoch || disposed) return;

      while (!disposed) {
        let response;
        try {
          response = await next(activeEpoch);
        } catch (error) {
          await handlers.onError({ kind: 'next', message: toErrorMessage(error) });
          return;
        }
        if (response.status === 'unauthorized') {
          epoch = undefined;
          return;
        }
        if (response.status !== 'offered' || !response.intent) return;

        const intent = response.intent;
        const request = { epoch: activeEpoch, intentId: intent.id };

        // An accepted intent has already been applied by this renderer; only its durable main
        // commit needs retrying. Reapplying would violate exactly-once behavior.
        if (response.state === 'accepted') {
          try {
            assertTransition(await commit(request), 'committed');
            if (intent.kind === 'project' && intent.result) {
              await handlers.onProjectCommitted(intent.result);
            }
          } catch (error) {
            await handlers.onError({ kind: intent.kind, filePath: intent.filePath, message: toErrorMessage(error) });
            return;
          }
          continue;
        }

        let applySucceeded = false;
        try {
          validateIntent(intent);
          if (intent.kind === 'project') {
            await handlers.authorizeProject(intent.result!);
          }
          assertTransition(await accept(request), 'accepted');
          if (intent.kind === 'project') {
            await handlers.applyProject(intent.result!);
          } else {
            await handlers.applyPaper(new Uint8Array(intent.bytes!), intent.filePath);
          }
          applySucceeded = true;
          assertTransition(await commit(request), 'committed');
          if (intent.kind === 'project') {
            await handlers.onProjectCommitted(intent.result!);
          }
        } catch (error) {
          // Apply failures are safe to reject: project restore rolls renderer state back and main
          // rolls its accepted staging state back. A commit failure is different — apply already
          // succeeded, so retain the accepted intent for a commit-only retry.
          if (!applySucceeded) {
            await reject({ ...request, reason: toErrorMessage(error) }).catch(() => undefined);
          }
          await handlers.onError({
            kind: intent.kind,
            filePath: intent.filePath,
            message: toErrorMessage(error),
          });
          if (applySucceeded) return;
        }
      }
    });
  };

  const unsubscribe = bridge?.onExternalOpenPending?.(drain);
  drain();

  return () => {
    disposed = true;
    unsubscribe?.();
    void chain.finally(() => {
      if (epoch) void bridge?.releaseExternalOpenRenderer?.(epoch);
    });
  };
}
