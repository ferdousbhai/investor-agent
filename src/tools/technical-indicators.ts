import { SMA, EMA, RSI, MACD, BollingerBands } from "trading-signals";
import { validateTicker } from "../lib/validation.js";
import { getHistorical, periodToDates } from "../lib/yahoo.js";
import type { HistoricalRow } from "../lib/yahoo-types.js";
import { getOrFetch } from "../lib/cache.js";
import { CacheTTL } from "../types.js";

export type IndicatorType = "SMA" | "EMA" | "RSI" | "MACD" | "BBANDS";

export interface IndicatorOpts {
  period?: string;
  timeperiod?: number;
  fastperiod?: number;
  slowperiod?: number;
  signalperiod?: number;
  nbdev?: number;
  numResults?: number;
}

export interface IndicatorResult {
  prices: Array<Record<string, unknown>>;
  values: Array<Record<string, unknown>>;
}

function formatDate(row: HistoricalRow): string {
  const d = row.date;
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  if (typeof d === "string") return d.slice(0, 10);
  return String(d);
}

/**
 * Calculate a technical indicator for a ticker. Returns raw numeric values
 * (not pre-formatted strings) for maximum composability in the sandbox.
 */
export async function calculateIndicator(
  ticker: string,
  indicator: IndicatorType,
  opts: IndicatorOpts,
  kv: KVNamespace
): Promise<IndicatorResult> {
  const symbol = validateTicker(ticker);
  const period = opts.period ?? "1y";
  const timeperiod = opts.timeperiod ?? 14;
  const fastperiod = opts.fastperiod ?? 12;
  const slowperiod = opts.slowperiod ?? 26;
  const signalperiod = opts.signalperiod ?? 9;
  const nbdev = opts.nbdev ?? 2;
  const numResults = opts.numResults ?? 100;

  const { period1, period2 } = periodToDates(period);

  // Build cache key with only parameters relevant to the specific indicator
  let cacheKey = `ta:${symbol}:${indicator}:${period}`;
  if (indicator === "MACD") {
    cacheKey += `:${fastperiod}:${slowperiod}:${signalperiod}`;
  } else if (indicator === "BBANDS") {
    cacheKey += `:${timeperiod}:${nbdev}`;
  } else {
    cacheKey += `:${timeperiod}`;
  }

  // Cache the full result (all rows), then slice to numResults after retrieval.
  // This prevents numResults from fragmenting the cache.
  const full = await getOrFetch<IndicatorResult>(
    kv,
    cacheKey,
    async () => {
      const history = await getHistorical(symbol, { period1, period2, interval: "1d" }, kv, CacheTTL.TECHNICALS);

      if (!history || history.length === 0) {
        throw new Error(`No historical data found for ${symbol}`);
      }

      // Pre-compute dates to avoid duplicate toISOString calls
      const dates = history.map(formatDate);

      const minRequired: Record<string, number> = {
        SMA: timeperiod,
        EMA: timeperiod * 2,
        RSI: timeperiod + 1,
        MACD: slowperiod + signalperiod,
        BBANDS: timeperiod,
      };

      if (history.length < (minRequired[indicator] ?? 0)) {
        throw new Error(
          `Insufficient data for ${indicator}: ${history.length} points, need ${minRequired[indicator]}`
        );
      }

      const indicatorRows: Array<Record<string, unknown>> = [];

      if (indicator === "SMA") {
        const sma = new SMA(timeperiod);
        for (let i = 0; i < history.length; i++) {
          const result = sma.update(Number(history[i].close ?? 0), false);
          indicatorRows.push({
            date: dates[i],
            sma: result !== null ? Number(result) : null,
          });
        }
      } else if (indicator === "EMA") {
        const ema = new EMA(timeperiod);
        for (let i = 0; i < history.length; i++) {
          const result = ema.update(Number(history[i].close ?? 0), false);
          indicatorRows.push({
            date: dates[i],
            ema: ema.isStable ? Number(result) : null,
          });
        }
      } else if (indicator === "RSI") {
        const rsi = new RSI(timeperiod);
        for (let i = 0; i < history.length; i++) {
          const result = rsi.update(Number(history[i].close ?? 0), false);
          indicatorRows.push({
            date: dates[i],
            rsi: result !== null ? Number(result) : null,
          });
        }
      } else if (indicator === "MACD") {
        const macd = new MACD(
          new EMA(fastperiod),
          new EMA(slowperiod),
          new EMA(signalperiod)
        );
        for (let i = 0; i < history.length; i++) {
          const result = macd.update(Number(history[i].close ?? 0), false);
          indicatorRows.push({
            date: dates[i],
            macd: result ? Number(result.macd) : null,
            signal: result ? Number(result.signal) : null,
            histogram: result ? Number(result.histogram) : null,
          });
        }
      } else if (indicator === "BBANDS") {
        const bb = new BollingerBands(timeperiod, nbdev);
        for (let i = 0; i < history.length; i++) {
          const result = bb.update(Number(history[i].close ?? 0), false);
          indicatorRows.push({
            date: dates[i],
            upper: result ? Number(result.upper) : null,
            middle: result ? Number(result.middle) : null,
            lower: result ? Number(result.lower) : null,
          });
        }
      } else {
        throw new Error(`Unsupported indicator: ${indicator}`);
      }

      const priceRows = history.map((row: HistoricalRow, i: number) => ({
        date: dates[i],
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        volume: row.volume,
      }));

      return { prices: priceRows, values: indicatorRows };
    },
    CacheTTL.TECHNICALS
  );

  // Slice to numResults after cache retrieval
  return {
    prices: full.prices.slice(-numResults),
    values: full.values.slice(-numResults),
  };
}
