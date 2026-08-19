import { SMA, EMA, RSI, MACD, BollingerBands } from "trading-signals";
import { getHistorical, type HistoricalRow } from "../lib/yahoo.js";
import { CacheTTL, getOrFetch } from "../lib/cache.js";

export type IndicatorType = "SMA" | "EMA" | "RSI" | "MACD" | "BBANDS";

export interface IndicatorOpts {
  period1?: string;
  period2?: string;
  timeperiod?: number;
  fastperiod?: number;
  slowperiod?: number;
  signalperiod?: number;
  nbdev?: number;
  numResults?: number;
}

export type IndicatorRow =
  | { date: string; sma: number | null }
  | { date: string; ema: number | null }
  | { date: string; rsi: number | null }
  | { date: string; macd: number | null; signal: number | null; histogram: number | null }
  | { date: string; upper: number | null; middle: number | null; lower: number | null };

export type IndicatorResult = IndicatorRow[];

function requirePositiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function formatDate(row: HistoricalRow): string {
  const date = row.date instanceof Date ? row.date.toISOString() : row.date;
  return date.slice(0, 10);
}

export async function calculateIndicator(
  ticker: string,
  indicator: IndicatorType,
  opts: IndicatorOpts
): Promise<IndicatorResult> {
  const period1 = opts.period1 ?? new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
  const period2 = opts.period2 ?? new Date().toISOString().slice(0, 10);
  const timeperiod = requirePositiveInteger(opts.timeperiod ?? 14, "timeperiod");
  const fastperiod = requirePositiveInteger(opts.fastperiod ?? 12, "fastperiod");
  const slowperiod = requirePositiveInteger(opts.slowperiod ?? 26, "slowperiod");
  const signalperiod = requirePositiveInteger(opts.signalperiod ?? 9, "signalperiod");
  const nbdev = opts.nbdev ?? 2;
  if (!Number.isFinite(nbdev) || nbdev <= 0) {
    throw new Error("nbdev must be a positive number");
  }
  const numResults = requirePositiveInteger(opts.numResults ?? 100, "numResults");

  let cacheKey = `ta:${ticker}:${indicator}:${period1}:${period2}`;
  if (indicator === "MACD") cacheKey += `:${fastperiod}:${slowperiod}:${signalperiod}`;
  else if (indicator === "BBANDS") cacheKey += `:${timeperiod}:${nbdev}`;
  else cacheKey += `:${timeperiod}`;

  const full = await getOrFetch<IndicatorResult>(
    cacheKey,
    async () => {
      const history = await getHistorical(ticker, { period1, period2, interval: "1d" });
      if (history.length === 0) throw new Error(`No historical data found for ${ticker}`);

      const dates = history.map(formatDate);
      const closes = history.map((row) => row.close);
      const minRequired = {
        SMA: timeperiod, EMA: timeperiod * 2, RSI: timeperiod + 1,
        MACD: slowperiod + signalperiod, BBANDS: timeperiod,
      } satisfies Record<IndicatorType, number>;

      if (history.length < minRequired[indicator]) {
        throw new Error(`Insufficient data for ${indicator}: ${history.length} points, need ${minRequired[indicator]}`);
      }

      const indicatorRows: IndicatorRow[] = [];

      if (indicator === "SMA") {
        const sma = new SMA(timeperiod);
        for (let i = 0; i < history.length; i++) {
          const result = sma.update(closes[i], false);
          indicatorRows.push({ date: dates[i], sma: result !== null ? Number(result) : null });
        }
      } else if (indicator === "EMA") {
        const ema = new EMA(timeperiod);
        for (let i = 0; i < history.length; i++) {
          const result = ema.update(closes[i], false);
          indicatorRows.push({ date: dates[i], ema: ema.isStable ? Number(result) : null });
        }
      } else if (indicator === "RSI") {
        const rsi = new RSI(timeperiod);
        for (let i = 0; i < history.length; i++) {
          const result = rsi.update(closes[i], false);
          indicatorRows.push({ date: dates[i], rsi: result !== null ? Number(result) : null });
        }
      } else if (indicator === "MACD") {
        const macd = new MACD(new EMA(fastperiod), new EMA(slowperiod), new EMA(signalperiod));
        for (let i = 0; i < history.length; i++) {
          const result = macd.update(closes[i], false);
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
          const result = bb.update(closes[i], false);
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
