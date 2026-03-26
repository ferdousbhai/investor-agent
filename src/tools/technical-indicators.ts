import { SMA, EMA, RSI, MACD, BollingerBands } from "trading-signals";
import { getHistorical } from "../lib/yahoo.js";
import type { HistoricalRow } from "../lib/yahoo-types.js";
import { getOrFetch } from "../lib/cache.js";
import { CacheTTL } from "../lib/cache.js";

export type IndicatorType = "SMA" | "EMA" | "RSI" | "MACD" | "BBANDS";

export interface IndicatorOpts {
  period1: string;
  period2?: string;
  timeperiod?: number;
  fastperiod?: number;
  slowperiod?: number;
  signalperiod?: number;
  nbdev?: number;
  numResults?: number;
}

export type IndicatorResult = Array<Record<string, unknown>>;

function formatDate(row: HistoricalRow): string {
  const d = row.date;
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  if (typeof d === "string") return d.slice(0, 10);
  return String(d);
}

export async function calculateIndicator(
  ticker: string,
  indicator: IndicatorType,
  opts: IndicatorOpts
): Promise<IndicatorResult> {
  const { period1 } = opts;
  const period2 = opts.period2;
  const timeperiod = opts.timeperiod ?? 14;
  const fastperiod = opts.fastperiod ?? 12;
  const slowperiod = opts.slowperiod ?? 26;
  const signalperiod = opts.signalperiod ?? 9;
  const nbdev = opts.nbdev ?? 2;
  const numResults = opts.numResults ?? 100;

  let cacheKey = `ta:${ticker}:${indicator}:${period1}:${period2 ?? ""}`;
  if (indicator === "MACD") cacheKey += `:${fastperiod}:${slowperiod}:${signalperiod}`;
  else if (indicator === "BBANDS") cacheKey += `:${timeperiod}:${nbdev}`;
  else cacheKey += `:${timeperiod}`;

  const full = await getOrFetch<IndicatorResult>(
    cacheKey,
    async () => {
      const history = await getHistorical(ticker, { period1, period2, interval: "1d" });
      if (!history || history.length === 0) throw new Error(`No historical data found for ${ticker}`);

      const dates = history.map(formatDate);
      const minRequired: Record<string, number> = {
        SMA: timeperiod, EMA: timeperiod * 2, RSI: timeperiod + 1,
        MACD: slowperiod + signalperiod, BBANDS: timeperiod,
      };

      if (history.length < (minRequired[indicator] ?? 0)) {
        throw new Error(`Insufficient data for ${indicator}: ${history.length} points, need ${minRequired[indicator]}`);
      }

      const indicatorRows: Array<Record<string, unknown>> = [];

      if (indicator === "SMA") {
        const sma = new SMA(timeperiod);
        for (let i = 0; i < history.length; i++) {
          const result = sma.update(Number(history[i].close ?? 0), false);
          indicatorRows.push({ date: dates[i], sma: result !== null ? Number(result) : null });
        }
      } else if (indicator === "EMA") {
        const ema = new EMA(timeperiod);
        for (let i = 0; i < history.length; i++) {
          const result = ema.update(Number(history[i].close ?? 0), false);
          indicatorRows.push({ date: dates[i], ema: ema.isStable ? Number(result) : null });
        }
      } else if (indicator === "RSI") {
        const rsi = new RSI(timeperiod);
        for (let i = 0; i < history.length; i++) {
          const result = rsi.update(Number(history[i].close ?? 0), false);
          indicatorRows.push({ date: dates[i], rsi: result !== null ? Number(result) : null });
        }
      } else if (indicator === "MACD") {
        const macd = new MACD(new EMA(fastperiod), new EMA(slowperiod), new EMA(signalperiod));
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

      return indicatorRows;
    },
    CacheTTL.TECHNICALS
  );

  return full.slice(-numResults);
}
