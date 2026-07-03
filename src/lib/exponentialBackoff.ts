export interface ExponentialBackoffOptions<T> {
  operation: () => Promise<T>;
  maxRetries: number;
  baseDelayMs: number;
  onRetry?: (attempt: number, maxRetries: number, delayMs: number, error: unknown) => void;
  abortSignal?: AbortSignal;
}

/**
 * A fail-closed error: a configuration, validation, auth, or missing-resource
 * problem that a retry cannot fix. Throw this (rather than relying on the exact
 * wording of a plain `Error`) anywhere inside a `withExponentialBackoff`
 * operation that must surface immediately instead of backing off.
 *
 * This replaces the old, fragile heuristic of sniffing the message for the
 * substring "require": rewording such a message silently turned a fail-fast
 * config error into a retryable one (10x exponential backoff before the user
 * ever saw it). Marking the error by type removes that trap.
 */
export class NonRetryableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'NonRetryableError';
    // Keep `instanceof` reliable even when this class is transpiled down to ES5
    // (extending built-ins otherwise breaks the prototype chain).
    Object.setPrototypeOf(this, NonRetryableError.prototype);
  }
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
  // Our own fail-closed throws are marked by type — the authoritative signal.
  if (error instanceof NonRetryableError) {
    return true;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();

  // Provider/library errors we don't author can't be retyped, so classify them
  // by objective signals only. Vertex publisher-model access failures and HTTP
  // 4xx (bad request / auth / forbidden / not found) are permanent — a retry
  // cannot fix them.
  if (message.includes('publisher model') && (
    message.includes('not found') ||
    message.includes('does not have access')
  )) {
    return true;
  }

  return /\((400|401|403|404)\)/.test(message)
    || /http\s+(400|401|403|404)\b/.test(message);
}
