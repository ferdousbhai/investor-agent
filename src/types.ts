export interface Env {
  MCP_OBJECT: DurableObjectNamespace;
  CACHE: KVNamespace;
  LOADER: unknown; // worker_loaders binding for DynamicWorkerExecutor
}

/** Cache TTLs in seconds */
export const CacheTTL = {
  MARKET_MOVERS: 60,
  FEAR_GREED: 300, // 5 min
  QUOTE_SUMMARY: 300,
  TECHNICALS: 900, // 15 min
  EARNINGS_CALENDAR: 3600, // 1h
} as const;

export const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

export const NASDAQ_HEADERS: Record<string, string> = {
  ...BROWSER_HEADERS,
  Referer: "https://www.nasdaq.com/",
};
