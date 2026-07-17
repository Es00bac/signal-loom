import { abortableSleep, createAbortError, throwIfAborted } from './abortSignals';

interface QueueWaiter {
  grant: () => void;
  reject: (error: unknown) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
}

export class ProviderRateLimiter {
  private active = false;
  private readonly waiters: QueueWaiter[] = [];
  private lastRequestTime = 0;
  minDelayMs: number;

  constructor(minDelayMs: number) {
    this.minDelayMs = minDelayMs;
  }

  async acquire<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    await this.acquireSlot(signal);
    try {
      throwIfAborted(signal);
      const now = Date.now();
      // Wall clocks and test clocks can move backwards. Treat that as no
      // elapsed delay rather than sleeping until the old future timestamp.
      const timeSinceLast = Math.max(0, now - this.lastRequestTime);
      if (timeSinceLast < this.minDelayMs) {
        await abortableSleep(this.minDelayMs - timeSinceLast, signal);
      }
      throwIfAborted(signal);
      this.lastRequestTime = Date.now();
      return await task();
    } finally {
      this.lastRequestTime = Date.now();
      this.releaseSlot();
    }
  }

  private acquireSlot(signal?: AbortSignal): Promise<void> {
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

      if (!this.active) {
        this.active = true;
        waiter.grant();
        return;
      }

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
    });
  }

  private releaseSlot(): void {
    const next = this.waiters.shift();
    if (next) {
      next.grant();
      return;
    }
    this.active = false;
  }
}

export const providerLimiters: Record<string, ProviderRateLimiter> = {
  bfl: new ProviderRateLimiter(2500),
  gemini: new ProviderRateLimiter(1500),
  openai: new ProviderRateLimiter(1500),
  stability: new ProviderRateLimiter(2000),
  huggingface: new ProviderRateLimiter(2000),
  elevenlabs: new ProviderRateLimiter(2000),
  default: new ProviderRateLimiter(1500),
};

export function getProviderLimiter(provider: string): ProviderRateLimiter {
  return providerLimiters[provider] || providerLimiters.default;
}
