import YahooFinance from "yahoo-finance2";
import { withRetry } from "./retry.js";
import { getOrFetch } from "./cache.js";
import { CacheTTL } from "./cache.js";
import { validateTicker } from "./validation.js";
import type { HistoricalRow } from "./yahoo-types.js";

export const yf = new YahooFinance({
  validation: { logErrors: false, logOptionsErrors: false },
  queue: { concurrency: 2 },
});

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
  modules: QuoteSummaryModule[]
): Promise<Record<string, unknown>> {
  const ticker = validateTicker(symbol);
  const cacheKey = `qs:${ticker}:${[...modules].sort().join(",")}`;
  return getOrFetch(
    cacheKey,
    () => withRetry(() => yf.quoteSummary(ticker, { modules }) as Promise<Record<string, unknown>>),
    CacheTTL.QUOTE_SUMMARY
  );
}

export async function getHistorical(
  symbol: string,
  opts: { period1: string | Date; period2?: string | Date; interval?: "1d" | "1wk" | "1mo" }
): Promise<HistoricalRow[]> {
  const ticker = validateTicker(symbol);
  const cacheKey = `hist:${ticker}:${String(opts.period1)}:${String(opts.period2 ?? "")}:${opts.interval ?? "1d"}`;
  return getOrFetch(
    cacheKey,
    () => withRetry(() => yf.historical(ticker, opts) as Promise<HistoricalRow[]>),
    CacheTTL.TECHNICALS
  );
}

export async function getOptions(
  symbol: string,
  opts?: { date?: string }
): Promise<Record<string, unknown>> {
  const ticker = validateTicker(symbol);
  const cacheKey = `opts:${ticker}:${opts?.date ?? ""}`;
  return getOrFetch(
    cacheKey,
    () => withRetry(() => yf.options(ticker, opts) as Promise<Record<string, unknown>>),
    CacheTTL.QUOTE_SUMMARY
  );
}

