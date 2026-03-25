/**
 * yahoo-finance2 wrapper with KV caching and retry.
 *
 * yahoo-finance2 v3 is instance-based: new YahooFinance(opts).
 */
import YahooFinance from "yahoo-finance2";
import { withRetry } from "./retry.js";
import { getOrFetch } from "./cache.js";
import type { HistoricalRow } from "./yahoo-types.js";

// Singleton instance with validation suppressed — also used by tools/market-movers.ts
export const yf = new YahooFinance({
  validation: { logErrors: false, logOptionsErrors: false },
});

// Valid quoteSummary modules — also listed in agent.ts TOOL_DESCRIPTORS description
export type QuoteSummaryModule =
  | "assetProfile"
  | "balanceSheetHistory"
  | "balanceSheetHistoryQuarterly"
  | "calendarEvents"
  | "cashflowStatementHistory"
  | "cashflowStatementHistoryQuarterly"
  | "defaultKeyStatistics"
  | "earnings"
  | "earningsHistory"
  | "earningsTrend"
  | "financialData"
  | "fundOwnership"
  | "incomeStatementHistory"
  | "incomeStatementHistoryQuarterly"
  | "indexTrend"
  | "industryTrend"
  | "insiderHolders"
  | "insiderTransactions"
  | "institutionOwnership"
  | "majorHoldersBreakdown"
  | "netSharePurchaseActivity"
  | "price"
  | "recommendationTrend"
  | "secFilings"
  | "summaryDetail"
  | "summaryProfile"
  | "upgradeDowngradeHistory";

export async function quoteSummary(
  symbol: string,
  modules: QuoteSummaryModule[],
  kv?: KVNamespace,
  ttl?: number
): Promise<Record<string, unknown>> {
  const fetcher = () =>
    withRetry(() =>
      yf.quoteSummary(symbol, { modules }) as Promise<Record<string, unknown>>
    );

  if (kv && ttl) {
    const cacheKey = `qs:${symbol}:${[...modules].sort().join(",")}`;
    return getOrFetch(kv, cacheKey, fetcher, ttl);
  }

  return fetcher();
}

export async function getHistorical(
  symbol: string,
  opts: {
    period1: string | Date;
    period2?: string | Date;
    interval?: "1d" | "1wk" | "1mo";
  },
  kv?: KVNamespace,
  ttl?: number
): Promise<HistoricalRow[]> {
  const fetcher = () =>
    withRetry(() =>
      yf.historical(symbol, opts) as Promise<HistoricalRow[]>
    );

  if (kv && ttl) {
    const cacheKey = `hist:${symbol}:${String(opts.period1)}:${String(opts.period2 ?? "")}:${opts.interval ?? "1d"}`;
    return getOrFetch(kv, cacheKey, fetcher, ttl);
  }

  return fetcher();
}

export async function getOptions(
  symbol: string,
  opts?: { date?: string }
): Promise<Record<string, unknown>> {
  return withRetry(() =>
    yf.options(symbol, opts) as Promise<Record<string, unknown>>
  );
}

/**
 * Get period boundaries for yahoo-finance2 historical/chart calls.
 * Maps yfinance-style period strings to date ranges.
 */
export function periodToDates(period: string): { period1: Date; period2: Date } {
  const now = new Date();
  const period2 = new Date(now);
  let period1: Date;

  switch (period) {
    case "1d":
      period1 = new Date(now.getTime() - 1 * 86400000);
      break;
    case "5d":
      period1 = new Date(now.getTime() - 5 * 86400000);
      break;
    case "1mo":
      period1 = new Date(now);
      period1.setMonth(period1.getMonth() - 1);
      break;
    case "3mo":
      period1 = new Date(now);
      period1.setMonth(period1.getMonth() - 3);
      break;
    case "6mo":
      period1 = new Date(now);
      period1.setMonth(period1.getMonth() - 6);
      break;
    case "1y":
      period1 = new Date(now);
      period1.setFullYear(period1.getFullYear() - 1);
      break;
    case "2y":
      period1 = new Date(now);
      period1.setFullYear(period1.getFullYear() - 2);
      break;
    case "5y":
      period1 = new Date(now);
      period1.setFullYear(period1.getFullYear() - 5);
      break;
    case "10y":
      period1 = new Date(now);
      period1.setFullYear(period1.getFullYear() - 10);
      break;
    case "ytd":
      period1 = new Date(now.getFullYear(), 0, 1);
      break;
    case "max":
      period1 = new Date("1970-01-01");
      break;
    default:
      throw new Error(
        `Unknown period: ${period}. Valid: 1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y, 10y, ytd, max`
      );
  }

  return { period1, period2 };
}
