import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DynamicWorkerExecutor, normalizeCode } from "@cloudflare/codemode";
import { z } from "zod";
import { CacheTTL, type Env } from "./types.js";
import pkg from "../package.json";

import {
  quoteSummary,
  getHistorical,
  getOptions as yfGetOptions,
} from "./lib/yahoo.js";
import { fetchCnnFearGreed, fetchCryptoFearGreed } from "./tools/fear-greed.js";
import { fetchMarketMovers } from "./tools/market-movers.js";
import { fetchNasdaqEarningsCalendar } from "./tools/earnings.js";
import { calculateIndicator, type IndicatorType } from "./tools/technical-indicators.js";

// ─── Rate Limiting ──────────────────────────────────────────────────────────

const RATE_LIMIT_MAX_CALLS = 30;
const RATE_LIMIT_WINDOW_SECONDS = 60;

class RateLimiter {
  private timestamps: number[] = [];

  check(): { allowed: boolean; remaining: number; retryAfterMs?: number } {
    const now = Date.now();
    const windowMs = RATE_LIMIT_WINDOW_SECONDS * 1000;

    this.timestamps = this.timestamps.filter((t) => now - t < windowMs);

    if (this.timestamps.length >= RATE_LIMIT_MAX_CALLS) {
      const oldestInWindow = this.timestamps[0];
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: windowMs - (now - oldestInWindow),
      };
    }

    this.timestamps.push(now);
    return {
      allowed: true,
      remaining: RATE_LIMIT_MAX_CALLS - this.timestamps.length,
    };
  }
}

// ─── Tool Description ───────────────────────────────────────────────────────

/** Max response size in characters (~6K tokens). Matches Cloudflare's truncation strategy. */
const MAX_RESPONSE_CHARS = 24_000;

/** Compact type definitions for the investor_tools_sandbox prompt.
 * Hand-crafted to minimize token usage. Only includes JSDoc where
 * the function name doesn't convey the behavior.
 */
const TYPES_DEF = `
quoteSummary modules: assetProfile, balanceSheetHistory, balanceSheetHistoryQuarterly, calendarEvents, cashflowStatementHistory, cashflowStatementHistoryQuarterly, defaultKeyStatistics, earnings, earningsHistory, earningsTrend, financialData, fundOwnership, incomeStatementHistory, incomeStatementHistoryQuarterly, indexTrend, industryTrend, insiderHolders, insiderTransactions, institutionOwnership, majorHoldersBreakdown, netSharePurchaseActivity, price, recommendationTrend, secFilings, summaryDetail, summaryProfile, upgradeDowngradeHistory.

declare const investor_tools_sandbox: {
  quoteSummary(input: { symbol: string; modules: string[] }): Promise<unknown>;
  /** Returns [{ date, open, high, low, close, volume }]. */
  getHistorical(input: { symbol: string; period1: string; period2?: string; interval?: "1d"|"1wk"|"1mo" }): Promise<unknown>;
  /** Call without date for available expirations. */
  getOptions(input: { symbol: string; date?: string }): Promise<unknown>;
  /** Market-wide data: movers (gainers/losers/most-active), earnings calendar, or fear & greed indices. */
  getMarketData(input: { source: "movers"|"earnings"|"fear-greed"; market?: "stock"|"crypto"; category?: "gainers"|"losers"|"most-active"; count?: number; date?: string }): Promise<unknown>;
  /** Returns { prices, values }. Fields: SMA→sma, EMA→ema, RSI→rsi, MACD→macd/signal/histogram, BBANDS→upper/middle/lower. */
  calculateIndicator(input: { ticker: string; indicator: "SMA"|"EMA"|"RSI"|"MACD"|"BBANDS"; period?: "1mo"|"3mo"|"6mo"|"1y"|"2y"|"5y"; timeperiod?: number; fastperiod?: number; slowperiod?: number; signalperiod?: number; nbdev?: number; numResults?: number }): Promise<unknown>;
};`;

// ─── Agent ──────────────────────────────────────────────────────────────────

export class InvestorAgent extends McpAgent<Env> {
  server = new McpServer({
    name: "investor-agent",
    version: pkg.version,
  });

  private rateLimiter = new RateLimiter();

  async init() {
    const env = this.env;
    const rateLimiter = this.rateLimiter;

    // Build sandbox function map — each key matches a function in TYPES_DEF
    const toolFns: Record<string, (args: unknown) => Promise<unknown>> = {
      quoteSummary: async (args: unknown) => {
        const { symbol, modules } = args as { symbol: string; modules: string[] };
        return quoteSummary(
          symbol,
          modules as Parameters<typeof quoteSummary>[1],
          env.CACHE,
          CacheTTL.QUOTE_SUMMARY
        );
      },
      getHistorical: async (args: unknown) => {
        const { symbol, ...opts } = args as {
          symbol: string;
          period1: string;
          period2?: string;
          interval?: "1d" | "1wk" | "1mo";
        };
        return getHistorical(symbol, opts, env.CACHE, CacheTTL.TECHNICALS);
      },
      getOptions: async (args: unknown) => {
        const { symbol, date } = args as { symbol: string; date?: string };
        return yfGetOptions(symbol, date ? { date } : undefined);
      },
      getMarketData: async (args: unknown) => {
        const { source, market, category, count, date } = args as {
          source: string;
          market?: string;
          category?: string;
          count?: number;
          date?: string;
        };
        switch (source) {
          case "movers":
            return fetchMarketMovers(
              category ?? "most-active",
              count ?? 25,
              env.CACHE
            );
          case "earnings":
            return fetchNasdaqEarningsCalendar(date, count ?? 100, env.CACHE);
          case "fear-greed":
            return market === "crypto"
              ? fetchCryptoFearGreed(env.CACHE)
              : fetchCnnFearGreed(env.CACHE);
          default:
            throw new Error(`Unknown source '${source}'. Valid: movers, earnings, fear-greed`);
        }
      },
      calculateIndicator: async (args: unknown) => {
        const { ticker, indicator, ...opts } = args as {
          ticker: string;
          indicator: IndicatorType;
          period?: string;
          timeperiod?: number;
          fastperiod?: number;
          slowperiod?: number;
          signalperiod?: number;
          nbdev?: number;
          numResults?: number;
        };
        return calculateIndicator(ticker, indicator, opts, env.CACHE);
      },
    };

    const executor = new DynamicWorkerExecutor({
      loader: env.LOADER as ConstructorParameters<typeof DynamicWorkerExecutor>[0]["loader"],
      timeout: 30_000,
    });

    this.server.tool(
      "investor_tools_sandbox",
      `Execute JavaScript to research financial markets. Available: quotes, historical prices, options chains, technical indicators (SMA/EMA/RSI/MACD/BBANDS), market movers, earnings calendar, and fear & greed indices.

Code MUST be an async arrow function expression (runtime wraps it as \`(CODE)()\`).
Correct: \`async () => { return await investor_tools_sandbox.quoteSummary({ symbol: "AAPL", modules: ["price"] }); }\`
Wrong: \`const data = await investor_tools_sandbox.quoteSummary(...); return data;\`

${TYPES_DEF}`,
      { code: z.string().describe("Async arrow function expression") },
      async ({ code }) => {
        const limit = rateLimiter.check();
        if (!limit.allowed) {
          const retryAfter = Math.ceil((limit.retryAfterMs ?? 60000) / 1000);
          console.warn(`[investor_tools_sandbox] rate limited — retry in ${retryAfter}s`);
          return {
            content: [
              {
                type: "text" as const,
                text: `Rate limit exceeded (${RATE_LIMIT_MAX_CALLS} calls/${RATE_LIMIT_WINDOW_SECONDS}s). Try again in ${retryAfter}s.`,
              },
            ],
            isError: true,
          };
        }

        const normalizedCode = normalizeCode(code);
        const result = await executor.execute(normalizedCode, toolFns);

        if (result.error) {
          console.error(`[investor_tools_sandbox] error (${limit.remaining} remaining): ${result.error}`);
          return {
            content: [
              {
                type: "text" as const,
                text: `Error: ${result.error}\n\nHint: code must be an async arrow function, e.g. async () => { return await investor_tools_sandbox.quoteSummary({ symbol: "AAPL", modules: ["price"] }); }`,
              },
            ],
            isError: true,
          };
        }

        console.log(`[investor_tools_sandbox] ok (${limit.remaining} remaining, ${result.logs?.length ?? 0} logs)`);
        const parts: string[] = [];
        if (result.logs && result.logs.length > 0) {
          parts.push(`Logs:\n${result.logs.join("\n")}`);
        }

        let text: string;
        let truncated = false;
        // Truncate arrays before serializing to avoid broken JSON
        if (Array.isArray(result.result)) {
          let arr = result.result as unknown[];
          text = JSON.stringify(arr);
          while (arr.length > 1 && text.length > MAX_RESPONSE_CHARS) {
            arr = arr.slice(0, Math.ceil(arr.length / 2));
            text = JSON.stringify(arr);
            truncated = true;
          }
        } else {
          text = typeof result.result === "string" ? result.result : JSON.stringify(result.result);
        }
        if (truncated) {
          text += `\n\n[Truncated to fit ~${MAX_RESPONSE_CHARS} chars. Narrow your query in code.]`;
        }
        parts.push(text);

        return {
          content: [{ type: "text" as const, text: parts.join("\n\n") }],
        };
      }
    );
  }
}
