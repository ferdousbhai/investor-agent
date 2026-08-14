export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: {
    maxAttempts?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    multiplier?: number;
    attemptTimeoutMs?: number;
    shouldRetry?: (error: unknown) => boolean;
  } = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelayMs = 2000,
    maxDelayMs = 30000,
    multiplier = 2,
    attemptTimeoutMs,
    shouldRetry = isRetryableError,
  } = opts;

  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new Error(`maxAttempts must be a positive integer (received ${String(maxAttempts)})`);
  }
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await withTimeout(fn(), attemptTimeoutMs);
    } catch (error) {
      if (attempt === maxAttempts || !shouldRetry(error)) {
        throw error;
      }
      const delay = Math.min(initialDelayMs * multiplier ** (attempt - 1), maxDelayMs);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error("withRetry exhausted attempts unexpectedly");
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs?: number): Promise<T> {
  if (timeoutMs == null) return promise;

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function isRetryableError(error: unknown): boolean {
  const msg = String(error).toLowerCase();
  if (["rate limit", "too many requests", "temporarily blocked", "timeout", "connection", "network", "429", "502", "503", "504"].some((t) => msg.includes(t))) return true;
  if (error instanceof Response) return error.status >= 500 || error.status === 429;
  return false;
}
