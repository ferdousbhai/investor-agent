import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { getHistorical, getOptions, quoteSummary, QUOTE_SUMMARY_MODULES } from "./lib/yahoo.js";
import {
  fetchCnnFearGreed,
  fetchCryptoFearGreed,
  type CnnFearGreed,
  type CryptoFearGreed,
} from "./tools/fear-greed.js";
import { fetchMarketMovers } from "./tools/market-movers.js";
import { fetchNasdaqEarningsCalendar } from "./tools/earnings.js";
import { calculateIndicator } from "./tools/technical-indicators.js";

const MAX_CALLS = 30;
const WINDOW_MS = 60_000;
const callTimestamps: number[] = [];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;

interface RateLimitDecision {
  allowed: boolean;
  retryAfterMs: number;
}

function consumeRateLimit(): RateLimitDecision {
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

/**
 * Yahoo's option contracts carry dozens of fields that are forwarded to the caller untouched,
 * so they are decoded as opaque JSON objects and only the fields this server reads are parsed.
 */
const jsonObjectSchema = z.object({}).passthrough();
const strikeSchema = z.number().finite();
const contractMetricSchema = z.number().finite().optional();

type OptionContract = z.infer<typeof jsonObjectSchema>;

interface FilteredChain {
  calls?: OptionContract[];
  puts?: OptionContract[];
}

const TOOL_XML_TAGS = {
  get_stock_info: "stock_info",
  historical_prices: "historical_prices",
  get_options: "options",
  market_movers: "market_movers",
  earnings_calendar: "earnings_calendar",
  fear_greed_index: "sentiment",
  technical_indicator: "technical_analysis",
} as const;

type ToolName = keyof typeof TOOL_XML_TAGS;

function escapeXmlText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function toolXml<TPayload>(toolName: ToolName, payload: TPayload): string {
  const tagName = TOOL_XML_TAGS[toolName];
  return `<${tagName}>${escapeXmlText(JSON.stringify(payload))}</${tagName}>`;
}

async function handleTool<TPayload>(
  toolName: ToolName,
  fn: () => Promise<TPayload>
): Promise<ToolResult> {
  const { allowed, retryAfterMs } = consumeRateLimit();
  if (!allowed) {
    return {
      content: [{
        type: "text",
        text: `Rate limit exceeded (${MAX_CALLS} calls/min). Try again in ${Math.ceil(retryAfterMs / 1000)}s.`,
      }],
      isError: true,
    };
  }
  try {
    return { content: [{ type: "text", text: toolXml(toolName, await fn()) }] };
  } catch (e) {
    console.error(`[investor-agent] tool "${toolName}" failed:`, e);
    return {
      content: [{ type: "text", text: `Error: ${e instanceof Error ? e.message : String(e)}` }],
      isError: true,
    };
  }
}

export function createServer(): McpServer {
  const server = new McpServer({ name: "investor-agent", version: "3.0.0" });

  server.tool(
    "get_stock_info",
    "Yahoo Finance quote summary. Choose modules for fundamentals, financials, earnings, ownership, profile, filings, or trends.",
    {
      symbol: z.string().describe("Ticker, e.g. AAPL."),
      modules: z.array(z.enum(QUOTE_SUMMARY_MODULES)).describe("Yahoo quoteSummary modules to fetch."),
    },
    ({ symbol, modules }) =>
      handleTool("get_stock_info", () => quoteSummary(symbol, modules))
  );

  server.tool(
    "historical_prices",
    "Historical OHLCV prices.",
    {
      symbol: z.string().describe("Ticker, e.g. AAPL."),
      period1: z.string().regex(ISO_DATE).optional().describe("Start YYYY-MM-DD; default 1 year ago."),
      period2: z.string().regex(ISO_DATE).optional().describe("End YYYY-MM-DD; default today."),
      interval: z.enum(["1d", "1wk", "1mo"]).optional().describe("Default 1wk."),
      limit: z.number().int().min(1).optional().describe("Most recent rows; default 100."),
    },
    ({ symbol, period1, period2, interval, limit }) =>
      handleTool("historical_prices", async () => {
        const start = period1 ?? new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
        const end = period2 ?? new Date().toISOString().slice(0, 10);
        const rows = await getHistorical(symbol, { period1: start, period2: end, interval: interval ?? "1wk" });
        return rows.slice(-(limit ?? 100));
      })
  );

  server.tool(
    "get_options",
    "Options chain. Omit date for expirations; set date for contracts sorted by open interest.",
    {
      symbol: z.string().describe("Ticker, e.g. AAPL."),
      date: z.string().regex(ISO_DATE).optional().describe("Expiration YYYY-MM-DD."),
      option_type: z.enum(["calls", "puts"]).optional().describe("Optional calls/puts filter."),
      strike_min: z.number().optional().describe("Minimum strike."),
      strike_max: z.number().optional().describe("Maximum strike."),
      limit: z.number().int().min(1).optional().describe("Contracts per type; default 25."),
    },
    ({ symbol, date, option_type, strike_min, strike_max, limit }) =>
      handleTool("get_options", async () => {
        if (strike_min !== undefined && strike_max !== undefined && strike_min > strike_max) {
          throw new Error("Minimum strike cannot exceed maximum strike");
        }
        const raw = await getOptions(symbol, date ? { date } : undefined);
        const optionsArr = raw.options;
        if (optionsArr === undefined) {
          if (date !== undefined) {
            throw new Error("Yahoo options response did not include the requested option chain");
          }
          return raw;
        }
        if (!Array.isArray(optionsArr)) {
          throw new Error("Yahoo options response did not include a valid options array");
        }
        if (optionsArr.length === 0) return raw;

        const parsedChain = jsonObjectSchema.safeParse(optionsArr[0]);
        if (!parsedChain.success) {
          throw new Error("Yahoo options response included an invalid option chain");
        }
        const chain = parsedChain.data;
        const maxContracts = limit ?? 25;

        const filterContracts = (contracts: OptionContract[]) => {
          const priced = contracts.map((contract) => {
            const strike = strikeSchema.safeParse(contract.strike);
            if (!strike.success) {
              throw new Error("Option contract has an invalid strike");
            }
            return { contract, strike: strike.data };
          });

          let filtered = priced;
          if (strike_min != null) filtered = filtered.filter(c => c.strike >= strike_min);
          if (strike_max != null) filtered = filtered.filter(c => c.strike <= strike_max);
          const metric = (contract: OptionContract, key: "openInterest" | "volume") => {
            const value = contractMetricSchema.safeParse(contract[key]);
            if (!value.success) {
              throw new Error(`Option contract has an invalid ${key}`);
            }
            return value.data;
          };
          const ranked = filtered.map(({ contract }) => ({
            contract,
            openInterest: metric(contract, "openInterest"),
            volume: metric(contract, "volume"),
          }));
          const compare = (a: number | undefined, b: number | undefined) => {
            if (a === undefined) return b === undefined ? 0 : 1;
            if (b === undefined) return -1;
            return b - a;
          };
          ranked.sort((a, b) =>
            compare(a.openInterest, b.openInterest) || compare(a.volume, b.volume)
          );
          return ranked.slice(0, maxContracts).map(({ contract }) => contract);
        };

        const contracts = (side: "calls" | "puts"): OptionContract[] => {
          const value = chain[side];
          if (!Array.isArray(value)) {
            throw new Error(`Yahoo options response did not include a ${side} array`);
          }
          return value.map((contract) => {
            const parsed = jsonObjectSchema.safeParse(contract);
            if (!parsed.success) {
              throw new Error(`Yahoo options response included an invalid ${side} contract`);
            }
            return parsed.data;
          });
        };

        const calls = option_type !== "puts" ? filterContracts(contracts("calls")) : undefined;
        const puts = option_type !== "calls" ? filterContracts(contracts("puts")) : undefined;

        const filtered: FilteredChain = {};
        if (calls) filtered.calls = calls;
        if (puts) filtered.puts = puts;
        return { ...raw, options: [filtered] };
      })
  );

  server.tool(
    "market_movers",
    "Today's top gainers, losers, or most-active stocks.",
    {
      category: z.enum(["gainers", "losers", "most-active"]).optional().describe("Default most-active."),
      count: z.number().int().min(1).max(100).optional().describe("Default 25."),
    },
    ({ category, count }) =>
      handleTool("market_movers", () => fetchMarketMovers(category ?? "most-active", count ?? 25))
  );

  server.tool(
    "earnings_calendar",
    "NASDAQ earnings calendar.",
    {
      date: z.string().regex(ISO_DATE).optional().describe("YYYY-MM-DD; default today."),
      count: z.number().int().min(1).optional().describe("Default 25."),
    },
    ({ date, count }) =>
      handleTool("earnings_calendar", () => fetchNasdaqEarningsCalendar(date, count ?? 25))
  );

  server.tool(
    "fear_greed_index",
    "Current Fear & Greed index: CNN for stocks, Alternative.me for crypto.",
    {
      market: z.enum(["stock", "crypto"]).optional().describe("Default stock."),
    },
    ({ market }) =>
      handleTool<CnnFearGreed | CryptoFearGreed>(
        "fear_greed_index",
        () => market === "crypto" ? fetchCryptoFearGreed() : fetchCnnFearGreed()
      )
  );

  server.tool(
    "technical_indicator",
    "Calculate SMA, EMA, RSI, MACD, or BBANDS from daily prices.",
    {
      ticker: z.string().describe("Ticker, e.g. AAPL."),
      indicator: z.enum(["SMA", "EMA", "RSI", "MACD", "BBANDS"]).describe("Indicator."),
      period1: z.string().regex(ISO_DATE).optional().describe("Start YYYY-MM-DD; default 1 year ago."),
      period2: z.string().regex(ISO_DATE).optional().describe("End YYYY-MM-DD; default today."),
      timeperiod: z.number().int().min(1).optional().describe("SMA/EMA/RSI/BBANDS period; default 14."),
      fastperiod: z.number().int().min(1).optional().describe("MACD fast; default 12."),
      slowperiod: z.number().int().min(1).optional().describe("MACD slow; default 26."),
      signalperiod: z.number().int().min(1).optional().describe("MACD signal; default 9."),
      nbdev: z.number().positive().optional().describe("BBANDS deviations; default 2."),
      numResults: z.number().int().min(1).optional().describe("Most recent rows; default 100."),
    },
    ({ ticker, indicator, ...opts }) =>
      handleTool("technical_indicator", () => calculateIndicator(ticker, indicator, opts))
  );

  return server;
}
