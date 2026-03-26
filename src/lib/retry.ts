export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: {
    maxAttempts?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    multiplier?: number;
    shouldRetry?: (error: unknown) => boolean;
  } = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelayMs = 2000,
    maxDelayMs = 30000,
    multiplier = 2,
    shouldRetry = isRetryableError,
  } = opts;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts || !shouldRetry(error)) {
        throw error;
      }
      const delay = Math.min(initialDelayMs * multiplier ** (attempt - 1), maxDelayMs);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

function isRetryableError(error: unknown): boolean {
  const msg = String(error).toLowerCase();
  if (["rate limit", "too many requests", "temporarily blocked", "timeout", "connection", "network", "429", "502", "503", "504"].some((t) => msg.includes(t))) return true;
  if (error instanceof Response) return error.status >= 500 || error.status === 429;
  return false;
}
