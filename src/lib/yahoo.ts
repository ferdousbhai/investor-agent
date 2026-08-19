import YahooFinance from "yahoo-finance2";
import type { QuoteSummaryResult } from "yahoo-finance2/modules/quoteSummary";
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

type ScreenerId = "day_gainers" | "day_losers" | "most_actives";

type HistoricalQuery = {
  period1: string | Date;
  period2?: string | Date;
  interval?: "1d" | "1wk" | "1mo";
};

type OptionsQuery = { date?: string };

/**
 * Adapt the Yahoo client to the slice of it this codebase calls. The library
 * types each method with a `this` context that no stand-in can satisfy, so the
 * calls are forwarded as plain functions here; the argument and result types
 * still come from the library, leaving nothing to drift.
 */
function createYahooClient() {
  const yahoo = new YahooFinance({
    validation: { logErrors: false, logOptionsErrors: false },
    queue: { concurrency: 2 },
    suppressNotices: ["yahooSurvey"],
  });
  return {
    quoteSummary: (symbol: string, queryOptions: { modules: QuoteSummaryModule[] }) =>
      yahoo.quoteSummary(symbol, queryOptions),
    historical: (symbol: string, queryOptions: HistoricalQuery) =>
      yahoo.historical(symbol, queryOptions),
    options: (symbol: string, queryOptions?: OptionsQuery) =>
      yahoo.options(symbol, queryOptions),
    screener: (queryOptions: { scrIds: ScreenerId; count: number }) =>
      yahoo.screener(queryOptions),
  };
}

/** The Yahoo surface this codebase depends on, and the seam tests stand in for. */
export type YahooClient = ReturnType<typeof createYahooClient>;

let client: YahooClient = createYahooClient();

export function yahooClient(): YahooClient {
  return client;
}

/** Install a stand-in client; tests use this instead of mocking the module. */
export function setYahooClient(next: YahooClient): void {
  client = next;
}

/** Restore the real Yahoo client. */
export function resetYahooClient(): void {
  client = createYahooClient();
}

export async function quoteSummary(
  symbol: string,
  modules: QuoteSummaryModule[]
): Promise<QuoteSummaryResult> {
  const ticker = validateTicker(symbol);
  const cacheKey = `qs:${ticker}:${[...modules].sort().join(",")}`;
  return getOrFetch(
    cacheKey,
    () => withRetry(() => yahooClient().quoteSummary(ticker, { modules })),
    CacheTTL.QUOTE_SUMMARY
  );
}

export async function getHistorical(
  symbol: string,
  opts: HistoricalQuery
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
      const raw = await withRetry(() => yahooClient().historical(ticker, cleanOpts));
      const parsed = historicalResponseSchema.safeParse(raw);
      if (!parsed.success) {
        throw new Error(`Yahoo historical response was malformed: ${describeSchemaError(parsed.error)}`);
      }
      return parsed.data;
    },
    CacheTTL.TECHNICALS
  );
}

/**
 * Yahoo's options payload is forwarded to callers verbatim. Only `options` is inspected
 * downstream, and it is left unparsed here because callers validate the chain themselves.
 */
export interface YahooOptionsPayload {
  options?: unknown;
}

export async function getOptions(
  symbol: string,
  opts?: OptionsQuery
): Promise<YahooOptionsPayload> {
  const ticker = validateTicker(symbol);
  const cacheKey = `opts:${ticker}:${opts?.date ?? ""}`;
  return getOrFetch(
    cacheKey,
    () => withRetry(
      () => yahooClient().options(ticker, opts),
      { maxAttempts: 2, initialDelayMs: 500, attemptTimeoutMs: 12_000 },
    ),
    CacheTTL.QUOTE_SUMMARY
  );
}
