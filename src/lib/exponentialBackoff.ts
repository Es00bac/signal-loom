export interface ExponentialBackoffOptions<T> {
  operation: () => Promise<T>;
  maxRetries: number;
  baseDelayMs: number;
  onRetry?: (attempt: number, maxRetries: number, delayMs: number, error: unknown) => void;
  abortSignal?: AbortSignal;
}

export async function withExponentialBackoff<T>({
  operation,
  maxRetries,
  baseDelayMs,
  onRetry,
  abortSignal,
}: ExponentialBackoffOptions<T>): Promise<T> {
  let attempt = 0;

  while (true) {
    try {
      if (abortSignal?.aborted) {
        throw new Error('Operation aborted');
      }
      return await operation();
    } catch (error) {
      if (abortSignal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
        throw error;
      }

      // Do not retry on configuration, validation, auth, or missing-resource errors.
      // E.g. "Imagen models require Vertex AI mode..." or Vertex 404 model access errors.
      if (isNonRetryableError(error)) {
        throw error;
      }

      if (attempt >= maxRetries) {
        throw error;
      }

      attempt++;
      // Calculate delay: baseDelay * 2^(attempt - 1)
      const delayMs = baseDelayMs * Math.pow(2, attempt - 1);

      if (onRetry) {
        onRetry(attempt, maxRetries, delayMs, error);
      }

      await new Promise<void>((resolve, reject) => {
        const timeoutId = setTimeout(resolve, delayMs);
        if (abortSignal) {
          abortSignal.addEventListener('abort', () => {
            clearTimeout(timeoutId);
            reject(new Error('Operation aborted'));
          }, { once: true });
        }
      });
    }
  }
}

function isNonRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();

  if (message.includes('require')) {
    return true;
  }

  if (message.includes('publisher model') && (
    message.includes('not found') ||
    message.includes('does not have access')
  )) {
    return true;
  }

  return /\((400|401|403|404)\)/.test(message)
    || /http\s+(400|401|403|404)\b/.test(message);
}
