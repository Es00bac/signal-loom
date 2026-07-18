import { abortableSleep, createAbortError, throwIfAborted } from './abortSignals';

interface QueueWaiter {
  grant: () => void;
  reject: (error: unknown) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
}

export class ProviderRateLimiter {
  private schedulingStart = false;
  private readonly waiters: QueueWaiter[] = [];
  private lastStartTime: number | undefined;
  minDelayMs: number;

  constructor(minDelayMs: number) {
    this.minDelayMs = minDelayMs;
  }

  async acquire<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    await this.acquireStart(signal);
    throwIfAborted(signal);
    return task();
  }

  /**
   * Admit one outbound operation start. The scheduler owns only the spacing
   * between starts; it deliberately does not own the returned task lifetime.
   * A provider job may therefore poll or materialize for minutes without
   * serializing later starts behind its completion.
   */
  private acquireStart(signal?: AbortSignal): Promise<void> {
    throwIfAborted(signal);

    return new Promise<void>((resolve, reject) => {
      const waiter: QueueWaiter = {
        reject,
        signal,
        grant: () => {
          if (waiter.onAbort) {
            signal?.removeEventListener('abort', waiter.onAbort);
          }
          resolve();
        },
      };

      waiter.onAbort = () => {
        const index = this.waiters.indexOf(waiter);
        if (index >= 0) {
          this.waiters.splice(index, 1);
        }
        signal?.removeEventListener('abort', waiter.onAbort!);
        reject(createAbortError());
      };
      signal?.addEventListener('abort', waiter.onAbort, { once: true });
      this.waiters.push(waiter);
      this.scheduleNextStart();
    });
  }

  private scheduleNextStart(): void {
    if (this.schedulingStart) return;

    const next = this.waiters.shift();
    if (!next) return;

    this.schedulingStart = true;
    if (next.onAbort) {
      next.signal?.removeEventListener('abort', next.onAbort);
    }

    void this.grantStartWhenReady(next);
  }

  private async grantStartWhenReady(waiter: QueueWaiter): Promise<void> {
    try {
      throwIfAborted(waiter.signal);
      if (this.lastStartTime !== undefined) {
        // Wall clocks and test clocks can move backwards. Treat that as no
        // elapsed delay and require one fresh spacing interval.
        const elapsed = Math.max(0, Date.now() - this.lastStartTime);
        const remainingDelay = Math.max(0, this.minDelayMs - elapsed);
        if (remainingDelay > 0) {
          await abortableSleep(remainingDelay, waiter.signal);
        }
      }
      throwIfAborted(waiter.signal);
      this.lastStartTime = Date.now();
      waiter.grant();
    } catch (error) {
      waiter.reject(error);
    } finally {
      this.schedulingStart = false;
      this.scheduleNextStart();
    }
  }
}

export const providerLimiters: Record<string, ProviderRateLimiter> = {
  bfl: new ProviderRateLimiter(2500),
  gemini: new ProviderRateLimiter(1500),
  openai: new ProviderRateLimiter(1500),
  stability: new ProviderRateLimiter(2000),
  huggingface: new ProviderRateLimiter(2000),
  elevenlabs: new ProviderRateLimiter(2000),
  atlas: new ProviderRateLimiter(1500),
  byteplus: new ProviderRateLimiter(1500),
  localOpen: new ProviderRateLimiter(0),
  android: new ProviderRateLimiter(0),
  local: new ProviderRateLimiter(0),
  default: new ProviderRateLimiter(1500),
};

// A configured backend proxy is a distinct transport/credential route from a
// direct browser request. Keep each upstream provider's existing spacing while
// preventing a proxied Atlas job, for example, from sharing direct Atlas state.
for (const [provider, minDelayMs] of Object.entries({
  bfl: 2500,
  gemini: 1500,
  openai: 1500,
  stability: 2000,
  huggingface: 2000,
  elevenlabs: 2000,
  atlas: 1500,
  byteplus: 1500,
})) {
  providerLimiters[`backend-proxy:${provider}`] = new ProviderRateLimiter(minDelayMs);
}

export function getProviderLimiter(provider: string): ProviderRateLimiter {
  return providerLimiters[provider] || providerLimiters.default;
}
