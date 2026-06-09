import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { withExponentialBackoff } from './exponentialBackoff';

describe('withExponentialBackoff', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('resolves immediately if the operation succeeds', async () => {
    const operation = vi.fn().mockResolvedValue('success');
    const onRetry = vi.fn();

    const promise = withExponentialBackoff({
      operation,
      maxRetries: 3,
      baseDelayMs: 1000,
      onRetry,
    });

    await expect(promise).resolves.toBe('success');
    expect(operation).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('retries up to maxRetries times and resolves if a subsequent attempt succeeds', async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValueOnce('success on 3');

    const onRetry = vi.fn();

    const promise = withExponentialBackoff({
      operation,
      maxRetries: 3,
      baseDelayMs: 1000,
      onRetry,
    });

    await vi.advanceTimersByTimeAsync(1000); // 1st retry delay
    await vi.advanceTimersByTimeAsync(2000); // 2nd retry delay

    await expect(promise).resolves.toBe('success on 3');

    expect(operation).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenNthCalledWith(1, 1, 3, 1000, expect.any(Error));
    expect(onRetry).toHaveBeenNthCalledWith(2, 2, 3, 2000, expect.any(Error));
  });

  it('fails after maxRetries is exhausted', async () => {
    const error = new Error('permanent fail');
    const operation = vi.fn().mockRejectedValue(error);
    const onRetry = vi.fn();

    const promise = withExponentialBackoff({
      operation,
      maxRetries: 2,
      baseDelayMs: 1000,
      onRetry,
    });

    promise.catch(() => {}); // prevent unhandled rejection

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(4000); // shouldn't trigger another retry

    await expect(promise).rejects.toThrow('permanent fail');

    expect(operation).toHaveBeenCalledTimes(3); // Initial + 2 retries
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it('does not retry non-retryable Vertex 4xx configuration errors', async () => {
    const error = new Error('Vertex AI video generation failed (404): Publisher Model was not found or your project does not have access to it.');
    const operation = vi.fn().mockRejectedValue(error);
    const onRetry = vi.fn();

    await expect(withExponentialBackoff({
      operation,
      maxRetries: 10,
      baseDelayMs: 1000,
      onRetry,
    })).rejects.toThrow('Publisher Model');

    expect(operation).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
  });
});
