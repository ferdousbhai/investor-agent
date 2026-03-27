import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { quoteSummary, getHistorical, getOptions, type QuoteSummaryModule } from "./lib/yahoo.js";
import { fetchCnnFearGreed, fetchCryptoFearGreed } from "./tools/fear-greed.js";
import { fetchMarketMovers } from "./tools/market-movers.js";
import { fetchNasdaqEarningsCalendar } from "./tools/earnings.js";
import { calculateIndicator } from "./tools/technical-indicators.js";

const MAX_CALLS = 30;
const WINDOW_MS = 60_000;
const callTimestamps: number[] = [];

function consumeRateLimit(): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  while (callTimestamps.length > 0 && now - callTimestamps[0] >= WINDOW_MS) {
    callTimestamps.shift();
  }
  if (callTimestamps.length >= MAX_CALLS) {
    return { allowed: false, retryAfterMs: WINDOW_MS - (now - callTimestamps[0]) };
  }
  callTimestamps.push(now);
  return { allowed: true, retryAfterMs: 0 };
}

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

async function handleTool(fn: () => Promise<unknown>): Promise<ToolResult> {
  const { allowed, retryAfterMs } = consumeRateLimit();
  if (!allowed) {
    return { content: [{ type: "text", text: `Rate limit exceeded (${MAX_CALLS} calls/min). Try again in ${Math.ceil(retryAfterMs / 1000)}s.` }], isError: true };
  }
  try {
    return { content: [{ type: "text", text: JSON.stringify(await fn()) }] };
  } catch (e) {
    return { content: [{ type: "text", text: `Error: ${e instanceof Error ? e.message : String(e)}` }], isError: true };
  }
}

export function createServer(): McpServer {
  const server = new McpServer({ name: "investor-agent", version: "3.0.0" });

  server.tool(
    "get_stock_info",
    "Look up stock data from Yahoo Finance. Pick one or more modules: price, summaryDetail, financialData, defaultKeyStatistics (P/E, PEG, beta, short ratio, float), earnings, earningsHistory, earningsTrend, incomeStatementHistory, incomeStatementHistoryQuarterly, balanceSheetHistory, balanceSheetHistoryQuarterly, cashflowStatementHistory, cashflowStatementHistoryQuarterly, recommendationTrend, upgradeDowngradeHistory, institutionOwnership, fundOwnership, insiderHolders, insiderTransactions, majorHoldersBreakdown, netSharePurchaseActivity (insider net buy/sell), assetProfile, summaryProfile, calendarEvents, secFilings (10-K, 10-Q), indexTrend (S&P 500 estimates), industryTrend (industry estimates).",
    {
      symbol: z.string().describe("Ticker symbol (e.g. AAPL)"),
      modules: z.array(z.string()).describe("Quote summary modules to fetch"),
    },
    ({ symbol, modules }) =>
      handleTool(() => quoteSummary(symbol, modules as QuoteSummaryModule[]))
  );

  server.tool(
    "historical_prices",
    "Get historical OHLCV price data for a stock.",
    {
      symbol: z.string().describe("Ticker symbol (e.g. AAPL)"),
      period1: z.string().optional().describe("Start date (YYYY-MM-DD). Defaults to 1 year ago."),
      period2: z.string().optional().describe("End date (YYYY-MM-DD). Defaults to today."),
      interval: z.enum(["1d", "1wk", "1mo"]).optional().describe("Data interval. Defaults to 1wk."),
      limit: z.number().optional().describe("Max rows to return (most recent). Defaults to 100."),
    },
    ({ symbol, period1, period2, interval, limit }) =>
      handleTool(async () => {
        const start = period1 ?? new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
        const rows = await getHistorical(symbol, { period1: start, period2, interval: interval ?? "1wk" });
        return rows.slice(-(limit ?? 100));
      })
  );

  server.tool(
    "get_options",
    "Get options contracts for a stock. Without a date, returns available expirations. With a date, returns contracts sorted by open interest.",
    {
      symbol: z.string().describe("Ticker symbol (e.g. AAPL)"),
      date: z.string().optional().describe("Expiration date (YYYY-MM-DD)"),
      option_type: z.enum(["calls", "puts"]).optional().describe("Filter by option type"),
      strike_min: z.number().optional().describe("Minimum strike price"),
      strike_max: z.number().optional().describe("Maximum strike price"),
      limit: z.number().optional().describe("Max contracts per type. Defaults to 25."),
    },
    ({ symbol, date, option_type, strike_min, strike_max, limit }) =>
      handleTool(async () => {
        const raw = await getOptions(symbol, date ? { date } : undefined) as Record<string, unknown>;
        const optionsArr = raw.options as Array<{ calls?: unknown[]; puts?: unknown[] }> | undefined;
        if (!optionsArr?.length) return raw;

        const chain = optionsArr[0];
        const maxContracts = limit ?? 25;

        const filterContracts = (contracts: Array<Record<string, unknown>>) => {
          let filtered = contracts;
          if (strike_min != null) filtered = filtered.filter(c => (c.strike as number) >= strike_min);
          if (strike_max != null) filtered = filtered.filter(c => (c.strike as number) <= strike_max);
          filtered.sort((a, b) =>
            ((b.openInterest as number) || 0) - ((a.openInterest as number) || 0)
            || ((b.volume as number) || 0) - ((a.volume as number) || 0)
          );
          return filtered.slice(0, maxContracts);
        };

        const calls = option_type !== "puts" ? filterContracts((chain.calls ?? []) as Array<Record<string, unknown>>) : undefined;
        const puts = option_type !== "calls" ? filterContracts((chain.puts ?? []) as Array<Record<string, unknown>>) : undefined;

        const filtered: Record<string, unknown> = {};
        if (calls) filtered.calls = calls;
        if (puts) filtered.puts = puts;
        return { ...raw, options: [filtered] };
      })
  );

  server.tool(
    "market_movers",
    "Get today's top gaining, losing, or most actively traded stocks.",
    {
      category: z.enum(["gainers", "losers", "most-active"]).optional().describe("Defaults to most-active."),
      count: z.number().optional().describe("Number of results. Defaults to 25."),
    },
    ({ category, count }) =>
      handleTool(() => fetchMarketMovers(category ?? "most-active", count ?? 25))
  );

  server.tool(
    "earnings_calendar",
    "Get upcoming earnings reports from NASDAQ for a given date.",
    {
      date: z.string().optional().describe("Date (YYYY-MM-DD). Defaults to today."),
      count: z.number().optional().describe("Number of results. Defaults to 25."),
    },
    ({ date, count }) =>
      handleTool(() => fetchNasdaqEarningsCalendar(date, count ?? 25))
  );

  server.tool(
    "fear_greed_index",
    "Get the current Fear & Greed index — CNN for the stock market, Alternative.me for crypto.",
    {
      market: z.enum(["stock", "crypto"]).optional().describe("Defaults to stock."),
    },
    ({ market }) =>
      handleTool(() => market === "crypto" ? fetchCryptoFearGreed() : fetchCnnFearGreed())
  );

  server.tool(
    "technical_indicator",
    "Calculate a technical indicator (SMA, EMA, RSI, MACD, BBANDS) for a stock.",
    {
      ticker: z.string().describe("Ticker symbol (e.g. AAPL)"),
      indicator: z.enum(["SMA", "EMA", "RSI", "MACD", "BBANDS"]).describe("Indicator type"),
      period1: z.string().optional().describe("Start date (YYYY-MM-DD). Defaults to 1 year ago."),
      period2: z.string().optional().describe("End date (YYYY-MM-DD). Defaults to today."),
      timeperiod: z.number().optional().describe("Indicator period (e.g. 14 for RSI). Defaults to 14."),
      fastperiod: z.number().optional().describe("MACD fast period. Defaults to 12."),
      slowperiod: z.number().optional().describe("MACD slow period. Defaults to 26."),
      signalperiod: z.number().optional().describe("MACD signal period. Defaults to 9."),
      nbdev: z.number().optional().describe("BBANDS standard deviations. Defaults to 2."),
      numResults: z.number().optional().describe("Number of most recent results. Defaults to 100."),
    },
    ({ ticker, indicator, ...opts }) =>
      handleTool(() => calculateIndicator(ticker, indicator, opts))
  );

  return server;
}
