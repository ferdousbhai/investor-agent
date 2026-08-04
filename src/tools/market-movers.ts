import { getOrFetch } from "../lib/cache.js";
import { CacheTTL } from "../lib/cache.js";
import { withRetry } from "../lib/retry.js";
import { yf } from "../lib/yahoo.js";

const SCREENER_MAP: Record<string, string> = {
  "gainers": "day_gainers",
  "losers": "day_losers",
  "most-active": "most_actives",
};

const MAX_FETCH = 100;

export async function fetchMarketMovers(
  category: string,
  count: number
): Promise<Array<Record<string, unknown>>> {
  const screenerId = SCREENER_MAP[category];
  if (!screenerId) throw new Error(`Invalid category '${category}'. Valid: gainers, losers, most-active`);
  if (!Number.isInteger(count) || count < 1 || count > MAX_FETCH) {
    throw new Error(`Count must be an integer from 1 to ${MAX_FETCH}`);
  }

  const rows = await getOrFetch<Array<Record<string, unknown>>>(
    `movers:${category}`,
    async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await withRetry(() => (yf as any).screener(screenerId, { count: MAX_FETCH })) as Record<string, unknown>;
      const quotes = (result as { quotes?: Array<Record<string, unknown>> }).quotes;
      if (!Array.isArray(quotes)) {
        throw new Error("Yahoo screener response did not include a quotes array");
      }

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

  return rows.slice(0, count);
}
