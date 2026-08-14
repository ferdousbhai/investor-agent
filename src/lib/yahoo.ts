import YahooFinance from "yahoo-finance2";
import { withRetry } from "./retry.js";
import { CacheTTL, getOrFetch } from "./cache.js";
import { describeSchemaError, validateTicker } from "./validation.js";
import { z } from "zod";

export const QUOTE_SUMMARY_MODULES = [
  "assetProfile",
  "balanceSheetHistory",
  "balanceSheetHistoryQuarterly",
  "calendarEvents",
  "cashflowStatementHistory",
  "cashflowStatementHistoryQuarterly",
  "defaultKeyStatistics",
  "earnings",
  "earningsHistory",
  "earningsTrend",
  "financialData",
  "fundOwnership",
  "incomeStatementHistory",
  "incomeStatementHistoryQuarterly",
  "indexTrend",
  "industryTrend",
  "insiderHolders",
  "insiderTransactions",
  "institutionOwnership",
  "majorHoldersBreakdown",
  "netSharePurchaseActivity",
  "price",
  "recommendationTrend",
  "secFilings",
  "summaryDetail",
  "summaryProfile",
  "upgradeDowngradeHistory",
] as const;

export type QuoteSummaryModule = typeof QUOTE_SUMMARY_MODULES[number];

const historicalRowSchema = z.object({
  date: z.union([
    z.date().refine((date) => Number.isFinite(date.getTime())),
    z.string().min(1).refine((date) => Number.isFinite(Date.parse(date))),
  ]),
  open: z.number().finite(),
  high: z.number().finite(),
  low: z.number().finite(),
  close: z.number().finite(),
  volume: z.number().finite().nonnegative(),
}).passthrough();

const historicalResponseSchema = z.array(historicalRowSchema);

export type HistoricalRow = z.infer<typeof historicalRowSchema>;

export const yf = new YahooFinance({
  validation: { logErrors: false, logOptionsErrors: false },
  queue: { concurrency: 2 },
  suppressNotices: ["yahooSurvey"],
});

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
  const cleanOpts = {
    period1: opts.period1,
    ...(opts.period2 !== undefined && { period2: opts.period2 }),
    ...(opts.interval !== undefined && { interval: opts.interval }),
  };
  const cacheKey = `hist:${ticker}:${String(cleanOpts.period1)}:${String(cleanOpts.period2 ?? "")}:${cleanOpts.interval ?? "1d"}`;
  return getOrFetch<HistoricalRow[]>(
    cacheKey,
    async () => {
      const raw = await withRetry(() => yf.historical(ticker, cleanOpts));
      const parsed = historicalResponseSchema.safeParse(raw);
      if (!parsed.success) {
        throw new Error(`Yahoo historical response was malformed: ${describeSchemaError(parsed.error)}`);
      }
      return parsed.data;
    },
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
    () => withRetry(
      () => yf.options(ticker, opts) as Promise<Record<string, unknown>>,
      { maxAttempts: 2, initialDelayMs: 500, attemptTimeoutMs: 12_000 },
    ),
    CacheTTL.QUOTE_SUMMARY
  );
}
