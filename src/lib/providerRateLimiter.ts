export class ProviderRateLimiter {
  private queue: Promise<void> = Promise.resolve();
  private lastRequestTime = 0;
  minDelayMs: number;

  constructor(minDelayMs: number) {
    this.minDelayMs = minDelayMs;
  }

  async acquire<T>(task: () => Promise<T>): Promise<T> {
    let resolveQueue: () => void;
    const nextQueue = new Promise<void>((resolve) => {
      resolveQueue = resolve;
    });

    const previousQueue = this.queue;
    this.queue = nextQueue;

    await previousQueue;

    try {
      const now = Date.now();
      const timeSinceLast = now - this.lastRequestTime;
      if (timeSinceLast < this.minDelayMs) {
        await new Promise((r) => setTimeout(r, this.minDelayMs - timeSinceLast));
      }
      this.lastRequestTime = Date.now();
      return await task();
    } finally {
      this.lastRequestTime = Date.now();
      resolveQueue!();
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
  default: new ProviderRateLimiter(1500),
};

export function getProviderLimiter(provider: string): ProviderRateLimiter {
  return providerLimiters[provider] || providerLimiters.default;
}
