/**
 * KV cache abstraction with getOrFetch pattern.
 * Replaces hishel/aiocache from the Python version.
 */
export async function getOrFetch<T>(
  kv: KVNamespace,
  key: string,
  fetcher: () => Promise<T>,
  ttlSeconds: number
): Promise<T> {
  const cached = await kv.get(key, "json");
  if (cached !== null) {
    return cached as T;
  }

  const value = await fetcher();
  // Store in KV with expiration — fire-and-forget
  void kv.put(key, JSON.stringify(value), { expirationTtl: ttlSeconds })
    .catch((err) => console.error(`KV write failed for key "${key}":`, err));
  return value;
}
