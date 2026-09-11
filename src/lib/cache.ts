export const CacheTTL = {
  MARKET_MOVERS: 60,
  FEAR_GREED: 300,
  QUOTE_SUMMARY: 300,
  TECHNICALS: 900,
  EARNINGS_CALENDAR: 3600,
} as const;

const MAX_ENTRIES = 500;
// Only resolved values are shared through this module-global map. Pending promises are
// deliberately not coalesced across callers: on Workers this module scope spans every
// request in the isolate, and awaiting another request's I/O is not permitted there.
const store = new Map<string, { value: unknown; expires: number }>();

export function clearCache(): void {
  store.clear();
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

  return fetcher()
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
    });
}
