import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  DynamicWorkerExecutor,
  generateTypesFromJsonSchema,
  normalizeCode,
  type JsonSchemaToolDescriptors,
} from "@cloudflare/codemode";
import { z } from "zod";
import { CacheTTL, type Env } from "./types.js";
import pkg from "../package.json";

// Data-fetching functions exposed to the codemode sandbox
import { fetchJson, fetchText } from "./lib/fetch.js";
import { toCleanCsv } from "./lib/csv.js";
import {
  quoteSummary,
  getHistorical,
  getOptions as yfGetOptions,
  periodToDates,
} from "./lib/yahoo.js";
import { validateTicker } from "./lib/validation.js";
import { fetchCnnFearGreed, fetchCryptoFearGreed } from "./tools/fear-greed.js";
import { fetchMarketMovers } from "./tools/market-movers.js";
import { fetchNasdaqEarningsCalendar } from "./tools/earnings.js";
import { calculateIndicator, type IndicatorType } from "./tools/technical-indicators.js";

// ─── Rate Limiting ──────────────────────────────────────────────────────────

/** Max codemode calls per session per window. */
const RATE_LIMIT_MAX_CALLS = 30;
/** Rate limit window in seconds. */
const RATE_LIMIT_WINDOW_SECONDS = 60;

/**
 * Simple sliding-window rate limiter using Durable Object state.
 * Tracks call timestamps and rejects when the window is exceeded.
 */
class RateLimiter {
  private timestamps: number[] = [];

  check(): { allowed: boolean; remaining: number; retryAfterMs?: number } {
    const now = Date.now();
    const windowMs = RATE_LIMIT_WINDOW_SECONDS * 1000;

    // Prune expired timestamps
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

// ─── Tool Descriptors ───────────────────────────────────────────────────────

/**
 * JSON Schema descriptors for all sandbox functions.
 * generateTypesFromJsonSchema() converts these into TypeScript type
 * definitions that the LLM sees in the codemode tool description.
 */
const TOOL_DESCRIPTORS: JsonSchemaToolDescriptors = {
  fetchJson: {
    description: "Fetch JSON from a URL with retry and browser headers. Returns parsed JSON.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to fetch" },
        headers: {
          type: "object",
          additionalProperties: { type: "string" },
          description: "Optional request headers",
        },
      },
      required: ["url"],
    },
  },
  fetchText: {
    description: "Fetch raw text/HTML from a URL with retry and browser headers.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to fetch" },
        headers: {
          type: "object",
          additionalProperties: { type: "string" },
          description: "Optional request headers",
        },
      },
      required: ["url"],
    },
  },
  toCleanCsv: {
    description:
      "Convert an array of objects to a CSV string. Automatically removes empty columns.",
    inputSchema: {
      type: "object",
      properties: {
        rows: {
          type: "array",
          items: { type: "object" },
          description: "Array of row objects to convert",
        },
      },
      required: ["rows"],
    },
  },
  validateTicker: {
    description: "Validate and normalize a stock ticker symbol (trims, uppercases). Throws on invalid.",
    inputSchema: {
      type: "object",
      properties: {
        ticker: { type: "string", description: "Ticker symbol" },
      },
      required: ["ticker"],
    },
  },
  periodToDates: {
    description:
      "Convert a period string (1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y, 10y, ytd, max) to { period1: Date, period2: Date }.",
    inputSchema: {
      type: "object",
      properties: {
        period: { type: "string", description: "Period string" },
      },
      required: ["period"],
    },
  },
  quoteSummary: {
    description:
      "Fetch Yahoo Finance quote summary. Modules: assetProfile, balanceSheetHistory, balanceSheetHistoryQuarterly, calendarEvents, cashflowStatementHistory, cashflowStatementHistoryQuarterly, defaultKeyStatistics, earnings, earningsHistory, earningsTrend, financialData, fundOwnership, incomeStatementHistory, incomeStatementHistoryQuarterly, indexTrend, industryTrend, insiderHolders, insiderTransactions, institutionOwnership, majorHoldersBreakdown, netSharePurchaseActivity, price, recommendationTrend, secFilings, summaryDetail, summaryProfile, upgradeDowngradeHistory. Returns raw Yahoo Finance data.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Ticker symbol" },
        modules: {
          type: "array",
          items: { type: "string" },
          description: "Yahoo Finance modules to fetch",
        },
      },
      required: ["symbol", "modules"],
    },
  },
  getHistorical: {
    description:
      "Fetch historical OHLCV price data from Yahoo Finance. Returns array of { date, open, high, low, close, volume }.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Ticker symbol" },
        period1: { type: "string", description: "Start date (ISO string or Date)" },
        period2: { type: "string", description: "End date (ISO string or Date)" },
        interval: {
          type: "string",
          enum: ["1d", "1wk", "1mo"],
          description: "Data interval (default: 1d)",
        },
      },
      required: ["symbol", "period1"],
    },
  },
  getOptions: {
    description:
      "Fetch options chain data from Yahoo Finance. Returns { expirationDates, options: [{ calls, puts }], ...}. Call without date to get available expirations, then with a specific date for chain data.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Ticker symbol" },
        date: { type: "string", description: "Expiration date (YYYY-MM-DD) to fetch chain for" },
      },
      required: ["symbol"],
    },
  },
  getMarketMovers: {
    description:
      "Get top market movers from Yahoo Finance. Returns array of { Symbol, Name, Price, Change, 'Change %', Volume, 'Market Cap' }.",
    inputSchema: {
      type: "object",
      properties: {
        category: {
          type: "string",
          enum: ["gainers", "losers", "most-active"],
          description: "Category (default: most-active)",
        },
        count: { type: "number", description: "Number of results 1-100 (default: 25)" },
        session: {
          type: "string",
          enum: ["regular", "pre-market", "after-hours"],
          description: "Market session, only applies to most-active (default: regular)",
        },
      },
    },
  },
  getCnnFearGreed: {
    description:
      "Fetch CNN Fear & Greed Index. Returns object with indicator scores: fear_and_greed, put_call_options, market_volatility_vix, junk_bond_demand, safe_haven_demand, etc.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  getCryptoFearGreed: {
    description:
      "Fetch Crypto Fear & Greed Index. Returns { value, classification, timestamp }.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  getNasdaqEarnings: {
    description:
      "Fetch NASDAQ earnings calendar for a date. Returns array of company earnings entries.",
    inputSchema: {
      type: "object",
      properties: {
        date: { type: "string", description: "Date YYYY-MM-DD (default: today)" },
        limit: { type: "number", description: "Max entries (default: 100)" },
      },
    },
  },
  calculateIndicator: {
    description:
      "Calculate a technical indicator. Returns { prices: [{date,open,high,low,close,volume}], values: [{date, ...indicatorFields}] }. Indicator fields: SMA→sma, EMA→ema, RSI→rsi, MACD→macd/signal/histogram, BBANDS→upper/middle/lower. Null values mean not yet converged.",
    inputSchema: {
      type: "object",
      properties: {
        ticker: { type: "string", description: "Ticker symbol" },
        indicator: {
          type: "string",
          enum: ["SMA", "EMA", "RSI", "MACD", "BBANDS"],
          description: "Indicator type",
        },
        period: {
          type: "string",
          enum: ["1mo", "3mo", "6mo", "1y", "2y", "5y"],
          description: "Price history period (default: 1y)",
        },
        timeperiod: { type: "number", description: "Indicator period (default: 14)" },
        fastperiod: { type: "number", description: "MACD fast period (default: 12)" },
        slowperiod: { type: "number", description: "MACD slow period (default: 26)" },
        signalperiod: { type: "number", description: "MACD signal period (default: 9)" },
        nbdev: { type: "number", description: "BBANDS std devs (default: 2)" },
        numResults: { type: "number", description: "Number of most recent results (default: 100)" },
      },
      required: ["ticker", "indicator"],
    },
  },
};

/** Pre-computed TypeScript type definitions for the codemode sandbox prompt. */
const TYPES_DEF = generateTypesFromJsonSchema(TOOL_DESCRIPTORS);

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

    // Build sandbox function map — each function accepts a single args object
    // matching the generated types, then delegates to the actual implementation
    const toolFns: Record<string, (args: unknown) => Promise<unknown>> = {
      fetchJson: async (args: unknown) => {
        const { url, headers } = args as { url: string; headers?: Record<string, string> };
        return fetchJson(url, headers);
      },
      fetchText: async (args: unknown) => {
        const { url, headers } = args as { url: string; headers?: Record<string, string> };
        return fetchText(url, headers);
      },
      toCleanCsv: async (args: unknown) => {
        const { rows } = args as { rows: Record<string, unknown>[] };
        return toCleanCsv(rows);
      },
      validateTicker: async (args: unknown) => {
        const { ticker } = args as { ticker: string };
        return validateTicker(ticker);
      },
      periodToDates: async (args: unknown) => {
        const { period } = args as { period: string };
        return periodToDates(period);
      },
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
        const { symbol, period1, period2, interval } = args as {
          symbol: string;
          period1: string;
          period2?: string;
          interval?: "1d" | "1wk" | "1mo";
        };
        const histOpts: { period1: Date; period2?: Date; interval?: "1d" | "1wk" | "1mo" } = {
          period1: new Date(period1),
        };
        if (period2) histOpts.period2 = new Date(period2);
        if (interval) histOpts.interval = interval;
        return getHistorical(symbol, histOpts, env.CACHE, CacheTTL.TECHNICALS);
      },
      getOptions: async (args: unknown) => {
        const { symbol, date } = args as { symbol: string; date?: string };
        return yfGetOptions(symbol, date ? { date } : undefined);
      },
      getMarketMovers: async (args: unknown) => {
        const { category, count, session } = args as {
          category?: string;
          count?: number;
          session?: string;
        };
        return fetchMarketMovers(
          category ?? "most-active",
          count ?? 25,
          session ?? "regular",
          env.CACHE
        );
      },
      getCnnFearGreed: async () => fetchCnnFearGreed(env.CACHE),
      getCryptoFearGreed: async () => fetchCryptoFearGreed(env.CACHE),
      getNasdaqEarnings: async (args: unknown) => {
        const { date, limit } = args as { date?: string; limit?: number };
        return fetchNasdaqEarningsCalendar(date, limit ?? 100, env.CACHE);
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
      "codemode",
      `Execute JavaScript code to orchestrate investor research tools in a single call. All functions are available on the \`codemode\` object and accept a single argument object.

IMPORTANT: The code MUST be an async arrow function expression (the runtime wraps it as \`(CODE)()\`). Do NOT use bare statements or IIFEs.

Correct: \`async () => { const data = await codemode.quoteSummary({ symbol: "AAPL", modules: ["price"] }); return data; }\`
Wrong: \`const data = await codemode.quoteSummary(...); return data;\`

${TYPES_DEF}`,
      {
        code: z
          .string()
          .describe(
            "An async arrow function expression. Example: `async () => { const data = await codemode.quoteSummary({ symbol: \"AAPL\", modules: [\"price\"] }); return data; }`"
          ),
      },
      async ({ code }) => {
        // Rate limit check
        const limit = rateLimiter.check();
        if (!limit.allowed) {
          const retryAfter = Math.ceil((limit.retryAfterMs ?? 60000) / 1000);
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
          return {
            content: [{ type: "text" as const, text: `Error: ${result.error}\n\nHint: code must be an async arrow function expression, e.g. async () => { const data = await codemode.quoteSummary({ symbol: "AAPL", modules: ["price"] }); return data; }` }],
            isError: true,
          };
        }

        const output: string[] = [];
        if (result.logs && result.logs.length > 0) {
          output.push(`Logs:\n${result.logs.join("\n")}`);
        }
        output.push(
          typeof result.result === "string"
            ? result.result
            : JSON.stringify(result.result, null, 2)
        );

        return {
          content: [{ type: "text" as const, text: output.join("\n\n") }],
        };
      }
    );
  }
}
