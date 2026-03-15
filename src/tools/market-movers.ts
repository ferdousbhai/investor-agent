import { getOrFetch } from "../lib/cache.js";
import { clamp } from "../lib/validation.js";
import { CacheTTL } from "../types.js";
import { withRetry } from "../lib/retry.js";
import YahooFinance from "yahoo-finance2";

const yf = new YahooFinance({
  validation: { logErrors: false, logOptionsErrors: false },
});

/** Yahoo Finance screener IDs for market movers */
const SCREENER_MAP: Record<string, string> = {
  "gainers": "day_gainers",
  "losers": "day_losers",
  "most-active": "most_actives",
};

/** Fetch top market movers using yahoo-finance2 screener API. */
export async function fetchMarketMovers(
  category: string,
  count: number,
  _session: string, // kept for API compatibility; screener only supports regular session
  kv: KVNamespace
): Promise<Array<Record<string, unknown>>> {
  const safeCount = clamp(count, 1, 100);
  const screenerId = SCREENER_MAP[category];

  if (!screenerId) {
    throw new Error(`Invalid category '${category}'. Valid: gainers, losers, most-active`);
  }

  const cacheKey = `movers:${category}:${safeCount}`;

  const rows = await getOrFetch<Array<Record<string, unknown>>>(
    kv,
    cacheKey,
    async () => {
      const result = await withRetry(() =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (yf as any).screener(screenerId, { count: safeCount })
      ) as Record<string, unknown>;

      const quotes = (result as { quotes?: Array<Record<string, unknown>> }).quotes;
      if (!quotes || !Array.isArray(quotes)) return [];

      return quotes.map((q) => ({
        Symbol: q.symbol,
        Name: q.shortName || q.longName,
        Price: q.regularMarketPrice,
        Change: q.regularMarketChange,
        "Change %": q.regularMarketChangePercent,
        Volume: q.regularMarketVolume,
        "Market Cap": q.marketCap,
      }));
    },
    CacheTTL.MARKET_MOVERS
  );

  return rows.slice(0, safeCount);
}
