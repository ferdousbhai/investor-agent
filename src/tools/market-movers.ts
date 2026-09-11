import { CacheTTL, getOrFetch } from "../lib/cache.js";
import { withRetry } from "../lib/retry.js";
import { yahooClient } from "../lib/yahoo.js";
import { describeSchemaError } from "../lib/validation.js";
import { z } from "zod";

const SCREENER_MAP = {
  "gainers": "day_gainers",
  "losers": "day_losers",
  "most-active": "most_actives",
} as const;

type MoverCategory = keyof typeof SCREENER_MAP;

function isMoverCategory(value: string): value is MoverCategory {
  return Object.hasOwn(SCREENER_MAP, value);
}

export interface MarketMover {
  Symbol: string;
  Name: string | undefined;
  Price: number;
  Change: number;
  "Change %": number;
  Volume: number | undefined;
  "Market Cap": number | undefined;
}

const MAX_FETCH = 100;

const quoteSchema = z.object({
  symbol: z.string().min(1),
  shortName: z.string().min(1).optional(),
  longName: z.string().min(1).optional(),
  regularMarketPrice: z.number().finite(),
  regularMarketChange: z.number().finite(),
  regularMarketChangePercent: z.number().finite(),
  // Yahoo's own screener contract leaves these two optional; ETFs and funds routinely omit
  // marketCap, so requiring them would reject the whole page over one such row.
  regularMarketVolume: z.number().finite().nonnegative().optional(),
  marketCap: z.number().finite().nonnegative().optional(),
}).refine((quote) => quote.shortName !== undefined || quote.longName !== undefined, {
  message: "quote must include a shortName or longName",
});

export async function fetchMarketMovers(
  category: string,
  count: number
): Promise<MarketMover[]> {
  if (!isMoverCategory(category)) {
    throw new Error(`Invalid category '${category}'. Valid: gainers, losers, most-active`);
  }
  const screenerId = SCREENER_MAP[category];
  if (!Number.isInteger(count) || count < 1 || count > MAX_FETCH) {
    throw new Error(`Count must be an integer from 1 to ${MAX_FETCH}`);
  }

  const rows = await getOrFetch<MarketMover[]>(
    `movers:${category}`,
    async () => {
      const result = await withRetry(() => yahooClient().screener({ scrIds: screenerId, count: MAX_FETCH }));
      const quotes = result.quotes;
      if (!Array.isArray(quotes)) {
        throw new Error("Yahoo screener response did not include a quotes array");
      }

      return quotes.map((quote, index) => {
        const parsed = quoteSchema.safeParse(quote);
        if (!parsed.success) {
          throw new Error(`Yahoo screener quote ${index} was malformed: ${describeSchemaError(parsed.error)}`);
        }
        const q = parsed.data;
        return {
          Symbol: q.symbol,
          Name: q.shortName ?? q.longName,
          Price: q.regularMarketPrice,
          Change: q.regularMarketChange,
          "Change %": q.regularMarketChangePercent,
          Volume: q.regularMarketVolume,
          "Market Cap": q.marketCap,
        };
      });
    },
    CacheTTL.MARKET_MOVERS
  );

  return rows.slice(0, count);
}
