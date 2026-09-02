export const CacheTTL = {
  MARKET_MOVERS: 60,
  FEAR_GREED: 300,
  QUOTE_SUMMARY: 300,
  TECHNICALS: 900,
  EARNINGS_CALENDAR: 3600,
} as const;

const MAX_ENTRIES = 500;
const store = new Map<string, { value: unknown; expires: number }>();
const inflight = new Map<string, Promise<unknown>>();

export function clearCache(): void {
  store.clear();
  inflight.clear();
}

export async function getOrFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlSeconds: number
): Promise<T> {
  const now = Date.now();
  const cached = store.get(key);
  if (cached) {
    if (cached.expires > now) {
      // SAFETY: a key is only ever written below by the getOrFetch call that owns it,
      // so the stored value is whatever that call's fetcher produced for this same key.
      return cached.value as T;
    }
    store.delete(key);
  }

  const existing = inflight.get(key);
  if (existing) {
    // SAFETY: same key ownership invariant — the in-flight promise was created by a
    // getOrFetch call using this key, so it resolves to that key's value type.
    return existing as Promise<T>;
  }

  const promise = fetcher()
    .then((value) => {
      if (store.size >= MAX_ENTRIES) {
        const expireTime = Date.now();
        for (const [k, v] of store) {
          if (v.expires <= expireTime) store.delete(k);
        }
      }
      if (store.size >= MAX_ENTRIES) {
        const oldest = store.keys().next().value;
        if (oldest !== undefined) store.delete(oldest);
      }
      store.set(key, { value, expires: Date.now() + ttlSeconds * 1000 });
      return value;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise);
  return promise;
}
